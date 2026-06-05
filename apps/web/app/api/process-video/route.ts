import { NextResponse } from 'next/server';
import { ApiError, getServiceSupabase, requireOwnedVideo, requireUser } from '@/lib/server/auth';

export async function POST(request: Request) {
  let videoId: string | undefined;
  try {
    const body = await request.json() as { videoId?: string };
    videoId = body.videoId;

    if (!videoId) {
      return NextResponse.json({ error: 'videoId requerido' }, { status: 400 });
    }

    const user = await requireUser(request);
    await requireOwnedVideo(videoId, user.id);

    const workerUrl = process.env.WORKER_URL;
    const workerSecret = process.env.WORKER_SECRET;

    if (!workerUrl || !workerSecret) {
      return NextResponse.json({ error: 'Worker no configurado' }, { status: 503 });
    }

    // Marcar como processing antes de delegar
    await getServiceSupabase().from('videos').update({ status: 'processing' }).eq('id', videoId);

    // Delegar al worker — fire and forget (el frontend hace polling del estado)
    fetch(`${workerUrl}/process`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${workerSecret}`,
      },
      body: JSON.stringify({ videoId, userId: user.id }),
    }).catch(err => console.error('Worker request failed:', err));

    return NextResponse.json({ success: true, message: 'Procesamiento iniciado' });
  } catch (err: unknown) {
    if (err instanceof ApiError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    const message = err instanceof Error ? err.message : 'Error desconocido';
    console.error('process-video error:', err);
    if (videoId) {
      await getServiceSupabase().from('videos').update({ status: 'failed' }).eq('id', videoId);
    }
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
