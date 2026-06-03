import 'dotenv/config';
import express from 'express';
import path from 'path';
import os from 'os';
import fs from 'fs';
import crypto from 'crypto';
import { createClient } from '@supabase/supabase-js';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import YTDlpWrap from 'yt-dlp-wrap';

const app = express();
app.use(express.json());

const PORT = process.env.PORT ?? '3001';
const WORKER_SECRET = process.env.WORKER_SECRET ?? '';

if (!WORKER_SECRET) {
  console.warn('⚠️  WORKER_SECRET no configurado — todos los requests serán rechazados');
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

// Path to yt-dlp binary — set YTDLP_PATH env var or install yt-dlp in PATH
const ytDlp = new YTDlpWrap(process.env.YTDLP_PATH ?? 'yt-dlp');

function auth(req: express.Request, res: express.Response, next: express.NextFunction): void {
  const token = (req.headers.authorization ?? '').replace(/^Bearer\s+/i, '');
  if (!token || token !== WORKER_SECRET) {
    res.status(401).json({ error: 'No autorizado' });
    return;
  }
  next();
}

// ── Health check ────────────────────────────────────────────────────────────
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// ── POST /import-url ─────────────────────────────────────────────────────────
// Downloads a video from any yt-dlp-supported URL (YouTube, TikTok, Vimeo…),
// uploads it to R2, and creates a 'pending' video record in Supabase.
interface ImportBody {
  url?: string;
  userId?: string;
}

app.post('/import-url', auth, async (req, res) => {
  const { url, userId } = req.body as ImportBody;

  if (!url || !userId) {
    res.status(400).json({ error: 'url y userId son requeridos' });
    return;
  }

  const videoId = crypto.randomUUID();
  // Use a template so yt-dlp can write the correct extension
  const outputTemplate = path.join(os.tmpdir(), `${videoId}.%(ext)s`);
  let outputPath: string | null = null;

  try {
    // ── 1. Fetch video metadata ────────────────────────────────────────────
    console.log(`\n📥 Fetching metadata: ${url}`);
    let title = 'Video';

    try {
      const infoRaw = await ytDlp.execPromise([
        url,
        '--dump-json',
        '--no-playlist',
        '--no-warnings',
      ]);
      const info = JSON.parse(infoRaw.trim()) as { title?: string };
      if (info.title) title = info.title;
    } catch (e) {
      console.warn('⚠️  Could not fetch metadata:', e instanceof Error ? e.message : e);
    }

    console.log(`📹 Title: ${title}`);

    // ── 2. Download ───────────────────────────────────────────────────────
    console.log(`⬇️  Downloading...`);

    await ytDlp.execPromise([
      url,
      '--format', 'bestvideo[ext=mp4]+bestaudio[ext=m4a]/mp4/best',
      '--output', outputTemplate,
      '--no-playlist',
      '--max-filesize', '500m',
      '--merge-output-format', 'mp4',
      '--no-warnings',
    ]);

    // Locate the downloaded file (yt-dlp resolves the %(ext)s placeholder)
    const tmpFiles = fs.readdirSync(os.tmpdir()).filter(f => f.startsWith(`${videoId}.`));
    const tmpFile = tmpFiles[0];
    if (!tmpFile) throw new Error('yt-dlp no generó ningún archivo de salida');

    outputPath = path.join(os.tmpdir(), tmpFile);
    const ext = path.extname(tmpFile); // '.mp4', '.mkv', etc.

    const stat = fs.statSync(outputPath);
    console.log(`✅ Downloaded: ${(stat.size / (1024 * 1024)).toFixed(1)} MB (${ext})`);

    // ── 3. Upload to R2 ───────────────────────────────────────────────────
    const key = `${userId}/${videoId}/video${ext}`;
    const contentType = ext === '.mp4' ? 'video/mp4' : 'video/x-matroska';

    console.log(`☁️  Uploading to R2: ${key}`);

    await r2.send(new PutObjectCommand({
      Bucket: process.env.CLOUDFLARE_R2_BUCKET_NAME!,
      Key: key,
      Body: fs.createReadStream(outputPath),
      ContentType: contentType,
      ContentLength: stat.size,
    }));

    // ── 4. Create Supabase record ─────────────────────────────────────────
    const { error: dbError } = await supabase.from('videos').insert({
      id: videoId,
      user_id: userId,
      title,
      source_url: key,
      status: 'pending',
    });

    if (dbError) throw dbError;

    console.log(`✅ Video record created: ${videoId}`);
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

app.listen(PORT, () => {
  console.log(`✅ ViralClips worker on :${PORT}`);
  console.log(`   yt-dlp: ${process.env.YTDLP_PATH ?? 'yt-dlp (system PATH)'}`);
});
