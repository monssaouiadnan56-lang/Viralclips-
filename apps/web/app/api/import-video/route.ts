import { NextResponse } from 'next/server';
import path from 'path';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { ApiError, getServiceSupabase, requireUploadAccess, requireUser } from '@/lib/server/auth';

const r2 = new S3Client({
  region: 'auto',
  endpoint: `https://${process.env.CLOUDFLARE_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: process.env.CLOUDFLARE_R2_ACCESS_KEY_ID!,
    secretAccessKey: process.env.CLOUDFLARE_R2_SECRET_ACCESS_KEY!,
  },
});

const MAX_BYTES = 500 * 1024 * 1024;

// Platforms that require yt-dlp (no direct video URL) → delegate to worker
const SOCIAL_DOMAINS = [
  'youtube.com', 'youtu.be',
  'tiktok.com',
  'instagram.com',
  'twitter.com', 'x.com',
  'facebook.com', 'fb.watch',
  'vimeo.com',
  'twitch.tv',
  'reddit.com',
];

function requiresWorker(url: string): boolean {
  try {
    const host = new URL(url).hostname.replace(/^www\./, '');
    return SOCIAL_DOMAINS.some(d => host === d || host.endsWith('.' + d));
  } catch {
    return false;
  }
}

export async function POST(request: Request) {
  const supabase = getServiceSupabase();
  try {
    const user = await requireUser(request);
    await requireUploadAccess(user.id);

    const { url } = await request.json() as { url?: string };

    if (!url?.trim()) {
      return NextResponse.json({ error: 'URL requerida' }, { status: 400 });
    }

    let parsed: URL;
    try {
      parsed = new URL(url);
    } catch {
      return NextResponse.json({ error: 'URL inválida' }, { status: 400 });
    }

    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
      return NextResponse.json({ error: 'Solo se permiten URLs http/https' }, { status: 400 });
    }

    // ── Social media URL → delegate to worker (uses yt-dlp) ────────────────
    if (requiresWorker(url)) {
      const workerUrl = process.env.WORKER_URL;
      if (!workerUrl) {
        return NextResponse.json(
          { error: 'El worker de descarga no está configurado. Contacta al administrador.' },
          { status: 503 },
        );
      }

      const workerRes = await fetch(`${workerUrl}/import-url`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${process.env.WORKER_SECRET}`,
        },
        body: JSON.stringify({ url, userId: user.id }),
        signal: AbortSignal.timeout(300_000), // 5 min — yt-dlp can be slow
      });

      const workerData = await workerRes.json() as {
        success?: boolean;
        videoId?: string;
        title?: string;
        error?: string;
      };

      if (!workerRes.ok) throw new Error(workerData.error ?? 'Error en el worker');

      return NextResponse.json({ success: true, videoId: workerData.videoId });
    }

    // ── Direct video URL → download here ───────────────────────────────────
    const videoRes = await fetch(url, { redirect: 'follow' });
    if (!videoRes.ok) {
      return NextResponse.json(
        { error: `No se pudo acceder a la URL: HTTP ${videoRes.status}` },
        { status: 400 },
      );
    }

    const contentType = videoRes.headers.get('content-type') ?? '';
    if (!contentType.startsWith('video/') && !contentType.startsWith('application/octet-stream')) {
      return NextResponse.json(
        { error: 'La URL no apunta a un archivo de video directo. Para YouTube/TikTok/Instagram pega la URL normal de la plataforma.' },
        { status: 400 },
      );
    }

    const contentLength = Number(videoRes.headers.get('content-length') ?? '0');
    if (!contentLength) {
      return NextResponse.json(
        { error: 'El servidor de origen no indica el tamaño del archivo. Sube el vídeo directamente.' },
        { status: 400 },
      );
    }
    if (contentLength > MAX_BYTES) {
      return NextResponse.json({ error: 'El video supera el límite de 500 MB' }, { status: 400 });
    }
    if (!videoRes.body) {
      return NextResponse.json({ error: 'La respuesta del servidor no contiene datos' }, { status: 400 });
    }

    const videoId = crypto.randomUUID();
    const originalName = path.basename(parsed.pathname) || 'video.mp4';
    const ext = path.extname(originalName) || '.mp4';
    const filename = `${Date.now()}${ext}`;
    const key = `${user.id}/${videoId}/${filename}`;

    await r2.send(new PutObjectCommand({
      Bucket: process.env.CLOUDFLARE_R2_BUCKET_NAME!,
      Key: key,
      Body: videoRes.body,
      ContentType: contentType.startsWith('video/') ? contentType : 'video/mp4',
      ContentLength: contentLength,
    }));

    const { error: dbError } = await supabase.from('videos').insert({
      id: videoId,
      user_id: user.id,
      title: originalName,
      source_url: key,
      status: 'pending',
    });

    if (dbError) throw dbError;

    console.log(`✅ Video importado desde URL → R2: ${key}`);
    return NextResponse.json({ success: true, videoId });

  } catch (err: unknown) {
    if (err instanceof ApiError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    const message = err instanceof Error ? err.message : 'Error desconocido';
    console.error('import-video error:', err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
