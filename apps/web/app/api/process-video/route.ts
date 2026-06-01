import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import OpenAI from 'openai';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { createVideoClip, extractAudio } from '@/lib/videoProcessor';
import { S3Client, GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

const r2 = new S3Client({
  region: 'auto',
  endpoint: `https://${process.env.CLOUDFLARE_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: process.env.CLOUDFLARE_R2_ACCESS_KEY_ID!,
    secretAccessKey: process.env.CLOUDFLARE_R2_SECRET_ACCESS_KEY!,
  },
});

async function downloadFromR2(key: string): Promise<Buffer> {
  const url = await getSignedUrl(
    r2,
    new GetObjectCommand({
      Bucket: process.env.CLOUDFLARE_R2_BUCKET_NAME!,
      Key: key,
    }),
    { expiresIn: 3600 },
  );
  const res = await fetch(url);
  if (!res.ok) throw new Error(`R2 download failed: HTTP ${res.status}`);
  return Buffer.from(await res.arrayBuffer());
}

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const openaiApiKey = process.env.OPENAI_API_KEY!;

const supabase = createClient(supabaseUrl, supabaseServiceKey);
const openai = new OpenAI({ apiKey: openaiApiKey });

interface TranscriptSegment {
  start: number;
  end: number;
  text: string;
}

interface TranscriptionResult {
  text: string;
  segments: TranscriptSegment[];
}

interface ViralMoment {
  title: string;
  description: string;
  virality_score: number;
  start_time: number;
  end_time: number;
}

// What GPT returns when we provide indexed segments — integers are far more reliable than floats
interface GPTMomentIndexed {
  title: string;
  description: string;
  virality_score: number;
  start_segment_idx: number;
  end_segment_idx: number;
}

export async function POST(request: Request) {
  let videoId: string | undefined;
  try {
    ({ videoId } = await request.json());

    if (!videoId) {
      return NextResponse.json({ error: 'Video ID requerido' }, { status: 400 });
    }

    const { data: video, error: videoError } = await supabase
      .from('videos')
      .select('*')
      .eq('id', videoId)
      .single();

    if (videoError || !video) {
      return NextResponse.json({ error: 'Video no encontrado' }, { status: 404 });
    }

    await supabase.from('videos').update({ status: 'processing' }).eq('id', videoId);

    // Download from Cloudflare R2 (source_url is the R2 object key, e.g. "videoId/1234.mp4")
    const buffer = await downloadFromR2(video.source_url);

    const { text, segments } = await transcribeWithWhisper(buffer, videoId);
    const tempFilePath = path.join(os.tmpdir(), `${videoId}.mp4`);

    console.log(`\n📝 Transcription (first 150 chars): ${text.substring(0, 150)}`);
    console.log(`⏱️  Whisper segments: ${segments.length}`);
    if (segments.length > 0) {
      const first = segments[0];
      const last = segments[segments.length - 1];
      if (first && last) {
        console.log(`   First: [${first.start.toFixed(2)}s - ${first.end.toFixed(2)}s] "${first.text}"`);
        console.log(`   Last:  [${last.start.toFixed(2)}s - ${last.end.toFixed(2)}s] "${last.text}"`);
        console.log(`   Video duration: ~${last.end.toFixed(1)}s`);
      }
    } else {
      console.warn('⚠️  No segments from Whisper — clip timestamps will be estimated');
    }

    const viralMoments = await analyzeViralMoments(text, segments);

    console.log(`\n🎯 Viral moments detected: ${viralMoments.length}`);
    viralMoments.forEach((m, i) => {
      console.log(`   [${i + 1}] "${m.title}" → ${m.start_time.toFixed(2)}s – ${m.end_time.toFixed(2)}s (${(m.end_time - m.start_time).toFixed(1)}s)`);
    });

    const generatedClips = [];
    const clipsDir = path.join(process.cwd(), 'public', 'clips', videoId);
    if (!fs.existsSync(clipsDir)) fs.mkdirSync(clipsDir, { recursive: true });

    console.log(`\n📁 Output dir: ${clipsDir}`);
    console.log(`📂 Input file exists: ${fs.existsSync(tempFilePath)} → ${tempFilePath}`);

    for (let i = 0; i < Math.min(viralMoments.length, 3); i++) {
      const moment = viralMoments[i];
      if (!moment) continue;

      const clipPath = path.join(clipsDir, `clip-${i + 1}.mp4`);
      const startTime = Math.max(0, moment.start_time);
      const endTime = moment.end_time;
      const duration = endTime - startTime;

      console.log(`\n✂️  Cutting clip ${i + 1}: "${moment.title}"`);
      console.log(`   from ${startTime.toFixed(2)}s to ${endTime.toFixed(2)}s (${duration.toFixed(1)}s)`);

      // Build a time-adjusted SRT from the Whisper segments that overlap this clip.
      const clipSegs = segments.filter(s => s.end > startTime && s.start < endTime);
      let srtPath: string | undefined;

      if (clipSegs.length > 0) {
        const adjusted = clipSegs.map(s => ({
          start: Math.max(0, s.start - startTime),
          end: Math.min(duration, s.end - startTime),
          text: s.text,
        }));
        srtPath = path.join(os.tmpdir(), `${videoId}-clip-${i + 1}.srt`);
        fs.writeFileSync(srtPath, generateSrt(adjusted), 'utf8');
        console.log(`   📝 SRT: ${adjusted.length} segments → ${srtPath}`);
      } else {
        console.log(`   ⚠️  No subtitle segments found for clip ${i + 1}`);
      }

      try {
        try {
          await createVideoClip(tempFilePath, clipPath, {
            startTime, endTime, title: moment.title, subtitlePath: srtPath,
          });
          console.log(`   🎬 Clip con subtítulos generado`);
        } catch (subtitleErr) {
          // libass may not be available in this ffmpeg-static build — retry without subtitles.
          console.warn(`   ⚠️  Subtitles failed, retrying without them:`, subtitleErr instanceof Error ? subtitleErr.message : subtitleErr);
          await createVideoClip(tempFilePath, clipPath, { startTime, endTime, title: moment.title });
          console.log(`   🎬 Clip sin subtítulos generado (fallback)`);
        }

        const clipUrl = `/clips/${videoId}/clip-${i + 1}.mp4`;

        const { error: clipError } = await supabase.from('clips').insert({
          video_id: videoId,
          title: moment.title,
          url: clipUrl,
        });

        if (clipError) console.error('Error saving clip to DB:', clipError);

        generatedClips.push({ title: moment.title, url: clipUrl, startTime, endTime });
        console.log(`   ✅ Clip ${i + 1} saved → ${clipUrl}`);
      } catch (clipError) {
        console.error(`   ❌ FFmpeg error for clip ${i + 1}:`, clipError);
      } finally {
        if (srtPath) await deleteWithRetry(srtPath);
      }
    }

    // Mark completed only after clips are generated. If 0 clips came out, mark failed.
    const finalStatus = generatedClips.length > 0 ? 'completed' : 'failed';
    await supabase.from('videos').update({
      status: finalStatus,
      title: video.title || `Video ${videoId}`,
    }).eq('id', videoId);

    console.log('\n⏳ Waiting for FFmpeg to finish...');
    await deleteWithRetry(tempFilePath);

    console.log(`\n✅ Done — ${generatedClips.length} clips generated (status: ${finalStatus})`);

    return NextResponse.json({
      success: true,
      message: 'Video procesado exitosamente',
      transcription: text.substring(0, 200) + '...',
      viralMomentsCount: viralMoments.length,
      generatedClips,
    });

  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Error desconocido';
    const stack = error instanceof Error ? error.stack : undefined;
    console.error('Error processing video:', error);

    if (videoId) {
      await supabase.from('videos').update({ status: 'failed' }).eq('id', videoId);
    }

    return NextResponse.json(
      { error: message, stack: process.env.NODE_ENV === 'development' ? stack : undefined },
      { status: 500 }
    );
  }
}

async function transcribeWithWhisper(buffer: Buffer, videoId: string): Promise<TranscriptionResult> {
  const videoPath = path.join(os.tmpdir(), `${videoId}.mp4`);
  const audioPath = path.join(os.tmpdir(), `${videoId}.mp3`);
  fs.writeFileSync(videoPath, buffer);

  const videoMB = (buffer.length / (1024 * 1024)).toFixed(1);
  console.log(`\n📦 Video guardado en tmp: ${videoMB} MB`);

  try {
    // Extract audio at 64kbps before sending to Whisper.
    // Whisper has a hard 25MB limit — a full video easily exceeds it;
    // 12 min of audio at 64kbps is only ~5MB.
    console.log('🎵 Extrayendo audio para Whisper...');
    await extractAudio(videoPath, audioPath);

    const transcription = await openai.audio.transcriptions.create({
      file: fs.createReadStream(audioPath),
      model: 'whisper-1',
      response_format: 'verbose_json',
      language: 'es',
    }) as unknown as {
      text: string;
      segments: Array<{ id: number; start: number; end: number; text: string }>;
    };

    const rawSegments = transcription.segments ?? [];
    console.log(`\n🎙️  Whisper raw response: ${rawSegments.length} segments`);
    if (rawSegments.length > 0) {
      console.log(`   Segment sample: ${JSON.stringify(rawSegments.slice(0, 3))}`);
    }

    const segments: TranscriptSegment[] = rawSegments.map(s => ({
      start: s.start,
      end: s.end,
      text: s.text.trim(),
    }));

    return { text: transcription.text, segments };
  } catch (error: unknown) {
    const originalError = error;
    await deleteWithRetry(videoPath);
    throw originalError;
  } finally {
    // Audio is only needed for Whisper — always clean it up.
    await deleteWithRetry(audioPath);
  }
}

async function analyzeViralMoments(text: string, segments: TranscriptSegment[]): Promise<ViralMoment[]> {
  try {
    if (segments.length > 0) {
      return await detectMomentsFromSegments(segments);
    }
    return await detectMomentsFromText(text);
  } catch (error) {
    console.error('Error analyzing viral moments:', error);
    return [];
  }
}

// Primary path: segments available → GPT returns integer indices → we look up real timestamps.
// This is reliable because GPT handles integers far better than copying exact floats.
async function detectMomentsFromSegments(segments: TranscriptSegment[]): Promise<ViralMoment[]> {
  const lastSeg = segments[segments.length - 1];
  const totalDuration = lastSeg ? lastSeg.end.toFixed(1) : '?';

  const formatted = segments
    .map((s, i) => `[${i}] ${s.start.toFixed(1)}s-${s.end.toFixed(1)}s: ${s.text}`)
    .join('\n');

  const prompt = `Transcripción indexada (duración: ${totalDuration}s):

${formatted.substring(0, 13000)}

Identifica 3-5 momentos virales para TikTok/Reels (30-90s cada uno) con:
- Frases impactantes, emotivas o sorprendentes
- Consejos prácticos o revelaciones
- Historias personales interesantes

REGLAS:
- start_segment_idx y end_segment_idx deben ser índices enteros de la lista [0..${segments.length - 1}]
- end_segment_idx debe ser mayor que start_segment_idx
- El momento debe durar entre 30 y 90 segundos

Responde SOLO con este JSON:
{
  "moments": [
    {
      "title": "Título viral",
      "description": "Por qué es viral",
      "virality_score": 8.5,
      "start_segment_idx": 5,
      "end_segment_idx": 18
    }
  ]
}`;

  const completion = await openai.chat.completions.create({
    model: 'gpt-4o-mini',
    messages: [
      {
        role: 'system',
        content: 'Eres un experto en contenido viral. Devuelve JSON con índices enteros exactos de la lista numerada.',
      },
      { role: 'user', content: prompt },
    ],
    response_format: { type: 'json_object' },
    temperature: 0.5,
  });

  const content = completion.choices[0]?.message.content ?? '{}';
  console.log(`\n🤖 GPT response (indexed mode):\n${content.substring(0, 800)}`);

  const result = JSON.parse(content) as { moments?: GPTMomentIndexed[] };
  const gptMoments = result.moments ?? [];

  return gptMoments.flatMap((m): ViralMoment[] => {
    const startIdx = Math.round(m.start_segment_idx);
    const endIdx = Math.round(m.end_segment_idx);
    const startSeg = segments[startIdx];
    const endSeg = segments[endIdx];

    if (!startSeg) {
      console.warn(`⚠️  "${m.title}": start_segment_idx=${startIdx} out of range (0..${segments.length - 1})`);
      return [];
    }
    if (!endSeg) {
      console.warn(`⚠️  "${m.title}": end_segment_idx=${endIdx} out of range (0..${segments.length - 1})`);
      return [];
    }
    if (endSeg.end <= startSeg.start) {
      console.warn(`⚠️  "${m.title}": inverted range ${startSeg.start}s → ${endSeg.end}s`);
      return [];
    }

    return [{
      title: m.title,
      description: m.description,
      virality_score: m.virality_score,
      start_time: startSeg.start,
      end_time: endSeg.end,
    }];
  });
}

// Fallback path: Whisper returned no segments, ask GPT to estimate timestamps from plain text.
async function detectMomentsFromText(text: string): Promise<ViralMoment[]> {
  const prompt = `Analiza esta transcripción e identifica 3 momentos virales para TikTok.

TRANSCRIPCIÓN:
${text.substring(0, 12000)}

Responde SOLO con este JSON estimando los tiempos en segundos:
{
  "moments": [
    {
      "title": "Título viral",
      "description": "Por qué es viral",
      "virality_score": 8.5,
      "start_time": 30.0,
      "end_time": 90.0
    }
  ]
}`;

  const completion = await openai.chat.completions.create({
    model: 'gpt-4o-mini',
    messages: [
      { role: 'system', content: 'Eres un experto en contenido viral. Devuelve JSON válido.' },
      { role: 'user', content: prompt },
    ],
    response_format: { type: 'json_object' },
    temperature: 0.7,
  });

  const content = completion.choices[0]?.message.content ?? '{}';
  console.log(`\n🤖 GPT response (text fallback mode):\n${content.substring(0, 800)}`);

  const result = JSON.parse(content) as { moments?: ViralMoment[] };
  return (result.moments ?? []).filter(
    m =>
      typeof m.start_time === 'number' &&
      typeof m.end_time === 'number' &&
      m.start_time >= 0 &&
      m.end_time > m.start_time
  );
}

function formatSrtTime(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  const ms = Math.round((seconds % 1) * 1000);
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')},${String(ms).padStart(3, '0')}`;
}

function generateSrt(segments: Array<{ start: number; end: number; text: string }>): string {
  return segments
    .map((seg, i) => `${i + 1}\n${formatSrtTime(seg.start)} --> ${formatSrtTime(seg.end)}\n${seg.text.trim()}`)
    .join('\n\n') + '\n';
}

// On Windows, FFmpeg may still hold a file handle for a moment after the process exits.
// Retry up to 3 times with a 500ms gap before giving up (non-fatal).
async function deleteWithRetry(filePath: string, retries = 3, delayMs = 500): Promise<void> {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
      return;
    } catch (err: unknown) {
      const code = err instanceof Error && 'code' in err
        ? (err as NodeJS.ErrnoException).code
        : null;
      if (code !== 'EBUSY' || attempt === retries) {
        console.warn(`⚠️  Could not delete ${path.basename(filePath)} (attempt ${attempt}/${retries}):`, err instanceof Error ? err.message : err);
        return;
      }
      console.log(`⏳ File busy, retrying in ${delayMs}ms... (attempt ${attempt}/${retries})`);
      await new Promise<void>(resolve => setTimeout(resolve, delayMs));
    }
  }
}
