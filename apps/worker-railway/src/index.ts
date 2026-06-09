import 'dotenv/config';
import express, { type Request, type Response, type NextFunction } from 'express';
import cors from 'cors';
import { createClient } from '@supabase/supabase-js';
import ws from 'ws';
import { processVideo } from './processor';

const app = express();
app.use(cors());
app.use(express.json());

const PORT = process.env.PORT ?? '3001';
const WORKER_SECRET = process.env.WORKER_SECRET ?? '';

if (!WORKER_SECRET) {
  console.warn('⚠️  WORKER_SECRET no configurado — todos los requests serán rechazados');
}

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { realtime: { transport: ws as any } },
);

function auth(req: Request, res: Response, next: NextFunction): void {
  const token = (req.headers.authorization ?? '').replace(/^Bearer\s+/i, '');
  if (!token || token !== WORKER_SECRET) {
    res.status(401).json({ error: 'No autorizado' });
    return;
  }
  next();
}

app.get('/', (_req, res) => {
  res.json({ status: 'ok', message: 'ViralClips Worker running' });
});

app.get('/health', (_req, res) => {
  res.json({ status: 'healthy', timestamp: new Date().toISOString() });
});

interface ProcessBody { videoId?: string; userId?: string; }

app.post('/process', auth, async (req: Request, res: Response) => {
  const { videoId, userId } = req.body as ProcessBody;

  if (!videoId || !userId) {
    res.status(400).json({ error: 'videoId y userId son requeridos' });
    return;
  }

  console.log(`\n🚀 Procesando video ${videoId} para usuario ${userId}`);

  try {
    const { data: videoRow, error: videoErr } = await supabase
      .from('videos')
      .select('source_url, title')
      .eq('id', videoId)
      .eq('user_id', userId)
      .single();

    if (videoErr || !videoRow) {
      res.status(404).json({ error: 'Video no encontrado' });
      return;
    }

    await supabase.from('videos').update({ status: 'processing' }).eq('id', videoId);

    const clips = await processVideo(videoRow.source_url as string, videoId);

    for (const clip of clips) {
      await supabase.from('clips').insert({ video_id: videoId, title: clip.title, url: clip.url });
    }

    const finalStatus = clips.length > 0 ? 'completed' : 'failed';
    await supabase.from('videos').update({ status: finalStatus }).eq('id', videoId);

    console.log(`\n✅ ${clips.length} clips generados (${finalStatus})`);
    res.json({ success: true, clips: clips.length, status: finalStatus });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Error desconocido';
    console.error('❌ Error procesando video:', message);
    await supabase.from('videos').update({ status: 'failed' }).eq('id', videoId);
    res.status(500).json({ error: message });
  }
});

app.listen(Number(PORT), '0.0.0.0', () => {
  console.log(`🚀 Worker corriendo en :${PORT}`);
});
