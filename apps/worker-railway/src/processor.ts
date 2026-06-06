import fs from 'fs';
import path from 'path';
import os from 'os';
import { S3Client, PutObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import ffmpeg from 'fluent-ffmpeg';
import OpenAI from 'openai';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const ffmpegStatic: string = require('ffmpeg-static');
ffmpeg.setFfmpegPath(ffmpegStatic);

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY! });

const r2 = new S3Client({
  region: 'auto',
  endpoint: `https://${process.env.CLOUDFLARE_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: process.env.CLOUDFLARE_R2_ACCESS_KEY_ID!,
    secretAccessKey: process.env.CLOUDFLARE_R2_SECRET_ACCESS_KEY!,
  },
});

const BUCKET = process.env.CLOUDFLARE_R2_BUCKET_NAME!;

export interface GeneratedClip {
  title: string;
  url: string;
}

interface TranscriptSegment {
  start: number;
  end: number;
  text: string;
}

interface ViralMoment {
  title: string;
  virality_score: number;
  start_time: number;
  end_time: number;
}

interface GPTMomentIndexed {
  title: string;
  virality_score: number;
  start_segment_idx: number;
  end_segment_idx: number;
}

async function downloadFromR2(key: string): Promise<Buffer> {
  const url = await getSignedUrl(r2, new GetObjectCommand({ Bucket: BUCKET, Key: key }), { expiresIn: 3600 });
  const res = await fetch(url);
  if (!res.ok) throw new Error(`R2 download failed: HTTP ${res.status}`);
  return Buffer.from(await res.arrayBuffer());
}

async function uploadToR2(localPath: string, key: string): Promise<string> {
  const stat = fs.statSync(localPath);
  await r2.send(new PutObjectCommand({
    Bucket: BUCKET,
    Key: key,
    Body: fs.createReadStream(localPath),
    ContentType: 'video/mp4',
    ContentLength: stat.size,
  }));
  return getSignedUrl(r2, new GetObjectCommand({ Bucket: BUCKET, Key: key }), { expiresIn: 7 * 24 * 3600 });
}

function extractAudio(videoPath: string, audioPath: string): Promise<void> {
  return new Promise((resolve, reject) => {
    ffmpeg(videoPath)
      .noVideo()
      .audioCodec('libmp3lame')
      .audioBitrate('64k')
      .output(audioPath)
      .on('end', () => resolve())
      .on('error', reject)
      .run();
  });
}

function cutClip(inputPath: string, outputPath: string, start: number, end: number, srtPath?: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const cmd = ffmpeg(inputPath)
      .setStartTime(start)
      .setDuration(end - start)
      .outputOptions(['-c:v libx264', '-c:a aac', '-movflags +faststart']);

    if (srtPath && fs.existsSync(srtPath)) {
      const escaped = srtPath.replace(/\\/g, '/').replace(/:/g, '\\:');
      cmd.videoFilters(`subtitles='${escaped}'`);
    }

    cmd.output(outputPath)
      .on('end', () => resolve())
      .on('error', reject)
      .run();
  });
}

function formatSrtTime(s: number): string {
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = Math.floor(s % 60);
  const ms = Math.round((s % 1) * 1000);
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')},${String(ms).padStart(3, '0')}`;
}

function generateSrt(segs: TranscriptSegment[]): string {
  return segs.map((s, i) => `${i + 1}\n${formatSrtTime(s.start)} --> ${formatSrtTime(s.end)}\n${s.text.trim()}`).join('\n\n') + '\n';
}

async function safeDelete(p: string): Promise<void> {
  try { if (fs.existsSync(p)) fs.unlinkSync(p); } catch { /* non-fatal */ }
}

async function transcribe(videoPath: string, audioPath: string): Promise<{ text: string; segments: TranscriptSegment[] }> {
  await extractAudio(videoPath, audioPath);
  const result = await openai.audio.transcriptions.create({
    file: fs.createReadStream(audioPath),
    model: 'whisper-1',
    response_format: 'verbose_json',
    language: 'es',
  }) as unknown as { text: string; segments: Array<{ start: number; end: number; text: string }> };
  await safeDelete(audioPath);
  return {
    text: result.text,
    segments: (result.segments ?? []).map(s => ({ start: s.start, end: s.end, text: s.text.trim() })),
  };
}

async function detectMoments(text: string, segments: TranscriptSegment[]): Promise<ViralMoment[]> {
  if (segments.length > 0) {
    const lastSeg = segments[segments.length - 1]!;
    const formatted = segments.map((s, i) => `[${i}] ${s.start.toFixed(1)}s-${s.end.toFixed(1)}s: ${s.text}`).join('\n');
    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: 'Eres un experto en contenido viral. Devuelve JSON con índices enteros exactos de la lista numerada.' },
        { role: 'user', content: `Transcripción indexada (duración: ${lastSeg.end.toFixed(1)}s):\n\n${formatted.substring(0, 13000)}\n\nIdentifica 3-5 momentos virales para TikTok/Reels (30-90s cada uno).\n\nREGLAS:\n- start_segment_idx y end_segment_idx deben ser índices enteros [0..${segments.length - 1}]\n- Duración entre 30 y 90 segundos\n\nResponde SOLO con: {"moments":[{"title":"...","virality_score":8.5,"start_segment_idx":5,"end_segment_idx":18}]}` },
      ],
      response_format: { type: 'json_object' },
      temperature: 0.5,
    });
    const result = JSON.parse(completion.choices[0]?.message.content ?? '{}') as { moments?: GPTMomentIndexed[] };
    return (result.moments ?? []).flatMap((m): ViralMoment[] => {
      const startSeg = segments[Math.round(m.start_segment_idx)];
      const endSeg = segments[Math.round(m.end_segment_idx)];
      if (!startSeg || !endSeg || endSeg.end <= startSeg.start) return [];
      return [{ title: m.title, virality_score: m.virality_score, start_time: startSeg.start, end_time: endSeg.end }];
    });
  }

  const completion = await openai.chat.completions.create({
    model: 'gpt-4o-mini',
    messages: [
      { role: 'system', content: 'Eres un experto en contenido viral. Devuelve JSON válido.' },
      { role: 'user', content: `Analiza esta transcripción e identifica 3 momentos virales para TikTok.\n\n${text.substring(0, 12000)}\n\nResponde SOLO con: {"moments":[{"title":"...","virality_score":8.5,"start_time":30.0,"end_time":90.0}]}` },
    ],
    response_format: { type: 'json_object' },
    temperature: 0.7,
  });
  const result = JSON.parse(completion.choices[0]?.message.content ?? '{}') as { moments?: ViralMoment[] };
  return (result.moments ?? []).filter(m => typeof m.start_time === 'number' && typeof m.end_time === 'number' && m.end_time > m.start_time);
}

export async function processVideo(sourceKey: string, videoId: string): Promise<GeneratedClip[]> {
  const videoPath = path.join(os.tmpdir(), `${videoId}.mp4`);
  const audioPath = path.join(os.tmpdir(), `${videoId}.mp3`);

  try {
    console.log(`⬇️  Descargando desde R2: ${sourceKey}`);
    const buffer = await downloadFromR2(sourceKey);
    fs.writeFileSync(videoPath, buffer);
    console.log(`📦 ${(buffer.length / 1024 / 1024).toFixed(1)} MB descargados`);

    console.log('🎵 Transcribiendo con Whisper...');
    const { text, segments } = await transcribe(videoPath, audioPath);
    console.log(`✅ ${segments.length} segmentos`);

    console.log('🤖 Detectando momentos virales con GPT...');
    const moments = await detectMoments(text, segments);
    console.log(`🎯 ${moments.length} momentos detectados`);

    const clips: GeneratedClip[] = [];

    for (let i = 0; i < Math.min(moments.length, 3); i++) {
      const moment = moments[i]!;
      const clipPath = path.join(os.tmpdir(), `${videoId}-clip-${i + 1}.mp4`);
      const startTime = Math.max(0, moment.start_time);
      const endTime = moment.end_time;

      let srtPath: string | undefined;
      const clipSegs = segments.filter(s => s.end > startTime && s.start < endTime);
      if (clipSegs.length > 0) {
        const adjusted = clipSegs.map(s => ({
          start: Math.max(0, s.start - startTime),
          end: Math.min(endTime - startTime, s.end - startTime),
          text: s.text,
        }));
        srtPath = path.join(os.tmpdir(), `${videoId}-clip-${i + 1}.srt`);
        fs.writeFileSync(srtPath, generateSrt(adjusted), 'utf8');
      }

      console.log(`✂️  Clip ${i + 1}: "${moment.title}" (${startTime.toFixed(1)}s → ${endTime.toFixed(1)}s)`);

      try {
        try {
          await cutClip(videoPath, clipPath, startTime, endTime, srtPath);
        } catch {
          console.warn(`   ⚠️  Subtítulos fallaron, reintentando sin ellos`);
          await cutClip(videoPath, clipPath, startTime, endTime);
        }

        const r2Key = `clips/${videoId}/clip-${i + 1}.mp4`;
        const url = await uploadToR2(clipPath, r2Key);
        clips.push({ title: moment.title, url });
        console.log(`   ✅ Clip ${i + 1} subido`);
      } catch (err) {
        console.error(`   ❌ Error en clip ${i + 1}:`, err instanceof Error ? err.message : err);
      } finally {
        if (srtPath) await safeDelete(srtPath);
        await safeDelete(clipPath);
      }
    }

    return clips;
  } finally {
    await safeDelete(videoPath);
    await safeDelete(audioPath);
  }
}
