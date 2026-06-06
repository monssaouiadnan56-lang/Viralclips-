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

    const workerUrl = process.env.NEXT_PUBLIC_WORKER_URL ?? process.env.WORKER_URL;
    const workerSecret = process.env.WORKER_SECRET ?? '';

    if (!workerUrl) {
      return NextResponse.json({ error: 'Worker no configurado' }, { status: 503 });
    }

    const supabase = getServiceSupabase();
    await supabase.from('videos').update({ status: 'processing' }).eq('id', videoId);

    const capturedVideoId = videoId;
    fetch(`${workerUrl}/process`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${workerSecret}`,
      },
      body: JSON.stringify({ videoId, userId: user.id }),
    }).then(async r => {
      if (!r.ok) {
        const body = await r.json().catch(() => ({})) as { error?: string };
        console.error(`Worker ${r.status} for video ${capturedVideoId}:`, body.error ?? '');
        await supabase.from('videos').update({ status: 'failed' }).eq('id', capturedVideoId);
      }
    }).catch(async err => {
      console.error('Worker unreachable:', err);
      await supabase.from('videos').update({ status: 'failed' }).eq('id', capturedVideoId);
    });

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
