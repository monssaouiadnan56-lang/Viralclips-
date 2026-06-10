import 'dotenv/config';
import express from 'express';
import path from 'path';
import os from 'os';
import fs from 'fs';
import crypto from 'crypto';
import { createClient } from '@supabase/supabase-js';
import ws from 'ws';
import { S3Client, PutObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import YTDlpWrap from 'yt-dlp-wrap';
import ffmpeg from 'fluent-ffmpeg';
import OpenAI from 'openai';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const ffmpegPath: string = require('ffmpeg-static');
ffmpeg.setFfmpegPath(ffmpegPath);

const app = express();
app.use(express.json());

const PORT = process.env.PORT ?? '8080';
const WORKER_SECRET = process.env.WORKER_SECRET ?? '';

if (!WORKER_SECRET) {
  console.warn('⚠️  WORKER_SECRET no configurado — todos los requests serán rechazados');
}

// Node.js < 22 lacks native WebSocket; polyfill before Supabase initialises
if (typeof (globalThis as Record<string, unknown>).WebSocket === 'undefined') {
  (globalThis as Record<string, unknown>).WebSocket = ws;
}

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

const r2 = new S3Client({
  region: 'auto',
  endpoint: `https://${process.env.CLOUDFLARE_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: process.env.CLOUDFLARE_R2_ACCESS_KEY_ID!,
    secretAccessKey: process.env.CLOUDFLARE_R2_SECRET_ACCESS_KEY!,
  },
});

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY! });
const ytDlp = new YTDlpWrap(process.env.YTDLP_PATH ?? 'yt-dlp');

function auth(req: express.Request, res: express.Response, next: express.NextFunction): void {
  const token = (req.headers.authorization ?? '').replace(/^Bearer\s+/i, '');
  if (!token || token !== WORKER_SECRET) {
    res.status(401).json({ error: 'No autorizado' });
    return;
  }
  next();
}

// ── Types ────────────────────────────────────────────────────────────────────

interface TranscriptSegment { start: number; end: number; text: string; }
interface ViralMoment { title: string; description: string; virality_score: number; start_time: number; end_time: number; }
interface GPTMomentIndexed { title: string; description: string; virality_score: number; start_segment_idx: number; end_segment_idx: number; }

// ── Helpers ──────────────────────────────────────────────────────────────────

async function downloadFromR2(key: string): Promise<Buffer> {
  const url = await getSignedUrl(r2, new GetObjectCommand({
    Bucket: process.env.CLOUDFLARE_R2_BUCKET_NAME!,
    Key: key,
  }), { expiresIn: 3600 });
  const res = await fetch(url);
  if (!res.ok) throw new Error(`R2 download failed: HTTP ${res.status}`);
  return Buffer.from(await res.arrayBuffer());
}

async function uploadClipToR2(localPath: string, key: string): Promise<string> {
  const stat = fs.statSync(localPath);
  await r2.send(new PutObjectCommand({
    Bucket: process.env.CLOUDFLARE_R2_BUCKET_NAME!,
    Key: key,
    Body: fs.createReadStream(localPath),
    ContentType: 'video/mp4',
    ContentLength: stat.size,
  }));
  return getSignedUrl(r2, new GetObjectCommand({
    Bucket: process.env.CLOUDFLARE_R2_BUCKET_NAME!,
    Key: key,
  }), { expiresIn: 7 * 24 * 3600 });
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

function createClip(inputPath: string, outputPath: string, startTime: number, endTime: number, subtitlePath?: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const cmd = ffmpeg(inputPath)
      .setStartTime(startTime)
      .setDuration(endTime - startTime)
      .outputOptions(['-c:v libx264', '-c:a aac', '-movflags +faststart']);

    if (subtitlePath && fs.existsSync(subtitlePath)) {
      const escaped = subtitlePath.replace(/\\/g, '/').replace(/:/g, '\\:');
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
  return `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:${String(sec).padStart(2,'0')},${String(ms).padStart(3,'0')}`;
}

function generateSrt(segs: TranscriptSegment[]): string {
  return segs.map((s, i) => `${i+1}\n${formatSrtTime(s.start)} --> ${formatSrtTime(s.end)}\n${s.text.trim()}`).join('\n\n') + '\n';
}

async function safeDelete(filePath: string): Promise<void> {
  try { if (fs.existsSync(filePath)) fs.unlinkSync(filePath); } catch { /* non-fatal */ }
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
  const segments = (result.segments ?? []).map(s => ({ start: s.start, end: s.end, text: s.text.trim() }));
  return { text: result.text, segments };
}

async function detectMoments(text: string, segments: TranscriptSegment[]): Promise<ViralMoment[]> {
  if (segments.length > 0) {
    const lastSeg = segments[segments.length - 1]!;
    const formatted = segments.map((s, i) => `[${i}] ${s.start.toFixed(1)}s-${s.end.toFixed(1)}s: ${s.text}`).join('\n');
    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: 'Eres un experto en contenido viral. Devuelve JSON con índices enteros exactos de la lista numerada.' },
        { role: 'user', content: `Transcripción indexada (duración: ${lastSeg.end.toFixed(1)}s):\n\n${formatted.substring(0, 13000)}\n\nIdentifica 3-5 momentos virales para TikTok/Reels (30-90s cada uno).\n\nREGLAS:\n- start_segment_idx y end_segment_idx deben ser índices enteros [0..${segments.length-1}]\n- Duración entre 30 y 90 segundos\n\nResponde SOLO con: {"moments":[{"title":"...","description":"...","virality_score":8.5,"start_segment_idx":5,"end_segment_idx":18}]}` },
      ],
      response_format: { type: 'json_object' },
      temperature: 0.5,
    });
    const result = JSON.parse(completion.choices[0]?.message.content ?? '{}') as { moments?: GPTMomentIndexed[] };
    return (result.moments ?? []).flatMap((m): ViralMoment[] => {
      const startSeg = segments[Math.round(m.start_segment_idx)];
      const endSeg = segments[Math.round(m.end_segment_idx)];
      if (!startSeg || !endSeg || endSeg.end <= startSeg.start) return [];
      return [{ title: m.title, description: m.description, virality_score: m.virality_score, start_time: startSeg.start, end_time: endSeg.end }];
    });
  }

  const completion = await openai.chat.completions.create({
    model: 'gpt-4o-mini',
    messages: [
      { role: 'system', content: 'Eres un experto en contenido viral. Devuelve JSON válido.' },
      { role: 'user', content: `Analiza esta transcripción e identifica 3 momentos virales para TikTok.\n\n${text.substring(0, 12000)}\n\nResponde SOLO con: {"moments":[{"title":"...","description":"...","virality_score":8.5,"start_time":30.0,"end_time":90.0}]}` },
    ],
    response_format: { type: 'json_object' },
    temperature: 0.7,
  });
  const result = JSON.parse(completion.choices[0]?.message.content ?? '{}') as { moments?: ViralMoment[] };
  return (result.moments ?? []).filter(m => typeof m.start_time === 'number' && typeof m.end_time === 'number' && m.end_time > m.start_time);
}

// ── Health check ─────────────────────────────────────────────────────────────

app.get('/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// ── POST /process ─────────────────────────────────────────────────────────────

interface ProcessBody { videoId?: string; userId?: string; }

app.post('/process', auth, async (req, res) => {
  const { videoId, userId } = req.body as ProcessBody;

  if (!videoId || !userId) {
    res.status(400).json({ error: 'videoId y userId son requeridos' });
    return;
  }

  console.log(`\n🚀 Procesando video ${videoId} para usuario ${userId}`);

  const videoPath = path.join(os.tmpdir(), `${videoId}.mp4`);
  const audioPath = path.join(os.tmpdir(), `${videoId}.mp3`);

  try {
    // ── 1. Obtener metadata del video ────────────────────────────────────────
    const { data: videoRow, error: videoErr } = await supabase
      .from('videos').select('source_url, title').eq('id', videoId).eq('user_id', userId).single();

    if (videoErr || !videoRow) {
      res.status(404).json({ error: 'Video no encontrado' });
      return;
    }

    await supabase.from('videos').update({ status: 'processing' }).eq('id', videoId);

    // ── 2. Descargar desde R2 ────────────────────────────────────────────────
    console.log(`⬇️  Descargando desde R2: ${videoRow.source_url}`);
    const buffer = await downloadFromR2(videoRow.source_url as string);
    fs.writeFileSync(videoPath, buffer);
    console.log(`📦 Video guardado: ${(buffer.length / 1024 / 1024).toFixed(1)} MB`);

    // ── 3. Transcripción con Whisper ─────────────────────────────────────────
    console.log('🎵 Transcribiendo con Whisper...');
    const { text, segments } = await transcribe(videoPath, audioPath);
    console.log(`✅ Transcripción: ${segments.length} segmentos`);

    // ── 4. Análisis de momentos virales con GPT ──────────────────────────────
    console.log('🤖 Analizando momentos virales...');
    const moments = await detectMoments(text, segments);
    console.log(`🎯 ${moments.length} momentos detectados`);

    // ── 5. Generar clips con FFmpeg ──────────────────────────────────────────
    const generatedClips = [];

    for (let i = 0; i < Math.min(moments.length, 3); i++) {
      const moment = moments[i]!;
      const clipPath = path.join(os.tmpdir(), `${videoId}-clip-${i+1}.mp4`);
      const startTime = Math.max(0, moment.start_time);
      const endTime = moment.end_time;

      let srtPath: string | undefined;
      const clipSegs = segments.filter(s => s.end > startTime && s.start < endTime);
      if (clipSegs.length > 0) {
        const adjusted = clipSegs.map(s => ({ start: Math.max(0, s.start - startTime), end: Math.min(endTime - startTime, s.end - startTime), text: s.text }));
        srtPath = path.join(os.tmpdir(), `${videoId}-clip-${i+1}.srt`);
        fs.writeFileSync(srtPath, generateSrt(adjusted), 'utf8');
      }

      console.log(`✂️  Clip ${i+1}: "${moment.title}" (${startTime.toFixed(1)}s → ${endTime.toFixed(1)}s)`);

      try {
        try {
          await createClip(videoPath, clipPath, startTime, endTime, srtPath);
        } catch {
          console.warn(`   ⚠️  Subtítulos fallaron, reintentando sin ellos`);
          await createClip(videoPath, clipPath, startTime, endTime);
        }

        const r2Key = `clips/${videoId}/clip-${i+1}.mp4`;
        const clipUrl = await uploadClipToR2(clipPath, r2Key);

        await supabase.from('clips').insert({ video_id: videoId, title: moment.title, url: clipUrl });
        generatedClips.push({ title: moment.title, url: clipUrl });
        console.log(`   ✅ Clip ${i+1} subido`);
      } catch (err) {
        console.error(`   ❌ Error en clip ${i+1}:`, err instanceof Error ? err.message : err);
      } finally {
        if (srtPath) await safeDelete(srtPath);
        await safeDelete(clipPath);
      }
    }

    const finalStatus = generatedClips.length > 0 ? 'completed' : 'failed';
    await supabase.from('videos').update({ status: finalStatus }).eq('id', videoId);

    console.log(`\n✅ Procesamiento completado: ${generatedClips.length} clips (${finalStatus})`);
    res.json({ success: true, generatedClips, status: finalStatus });

  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Error desconocido';
    console.error('❌ Error procesando video:', message);
    await supabase.from('videos').update({ status: 'failed' }).eq('id', videoId);
    res.status(500).json({ error: message });
  } finally {
    await safeDelete(videoPath);
    await safeDelete(audioPath);
  }
});

// ── POST /import-url ──────────────────────────────────────────────────────────

interface ImportBody { url?: string; userId?: string; }

app.post('/import-url', auth, async (req, res) => {
  const { url, userId } = req.body as ImportBody;

  if (!url || !userId) {
    res.status(400).json({ error: 'url y userId son requeridos' });
    return;
  }

  const videoId = crypto.randomUUID();
  const outputTemplate = path.join(os.tmpdir(), `${videoId}.%(ext)s`);
  let outputPath: string | null = null;

  try {
    let title = 'Video';
    try {
      const infoRaw = await ytDlp.execPromise([url, '--dump-json', '--no-playlist', '--no-warnings']);
      const info = JSON.parse(infoRaw.trim()) as { title?: string };
      if (info.title) title = info.title;
    } catch (e) {
      console.warn('⚠️  Could not fetch metadata:', e instanceof Error ? e.message : e);
    }

    await ytDlp.execPromise([
      url,
      '--format', 'bestvideo[ext=mp4]+bestaudio[ext=m4a]/mp4/best',
      '--output', outputTemplate,
      '--no-playlist',
      '--max-filesize', '500m',
      '--merge-output-format', 'mp4',
      '--no-warnings',
    ]);

    const tmpFiles = fs.readdirSync(os.tmpdir()).filter(f => f.startsWith(`${videoId}.`));
    const tmpFile = tmpFiles[0];
    if (!tmpFile) throw new Error('yt-dlp no generó ningún archivo de salida');

    outputPath = path.join(os.tmpdir(), tmpFile);
    const ext = path.extname(tmpFile);
    const stat = fs.statSync(outputPath);
    const key = `${userId}/${videoId}/video${ext}`;

    await r2.send(new PutObjectCommand({
      Bucket: process.env.CLOUDFLARE_R2_BUCKET_NAME!,
      Key: key,
      Body: fs.createReadStream(outputPath),
      ContentType: ext === '.mp4' ? 'video/mp4' : 'video/x-matroska',
      ContentLength: stat.size,
    }));

    const { error: dbError } = await supabase.from('videos').insert({
      id: videoId, user_id: userId, title, source_url: key, status: 'pending',
    });
    if (dbError) throw dbError;

    res.json({ success: true, videoId, title });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Error desconocido';
    console.error('import-url error:', message);
    res.status(500).json({ error: message });
  } finally {
    if (outputPath && fs.existsSync(outputPath)) {
      try { fs.unlinkSync(outputPath); } catch { /* non-fatal */ }
    }
  }
});

app.listen(Number(PORT), '0.0.0.0', () => {
  console.log(`✅ ViralClips worker on :${PORT}`);
});
