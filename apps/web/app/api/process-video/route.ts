import { NextResponse } from 'next/server';
import { ApiError, getServiceSupabase, requireOwnedVideo, requireUser } from '@/lib/server/auth';

export async function POST(request: Request) {
  let videoId: string | undefined;
  const supabase = getServiceSupabase();

  try {
    const body = await request.json() as { videoId?: string; clipCount?: number };
    videoId = body.videoId;
    const clipCount = Math.min(Math.max(Number.isInteger(body.clipCount) ? (body.clipCount as number) : 3, 3), 9);

    if (!videoId) {
      return NextResponse.json({ error: 'videoId requerido' }, { status: 400 });
    }

    const user = await requireUser(request);
    await requireOwnedVideo(videoId, user.id);

    const workerUrl = process.env.WORKER_URL;
    const workerSecret = process.env.WORKER_SECRET ?? '';

    if (!workerUrl) {
      return NextResponse.json({ error: 'Worker no configurado' }, { status: 503 });
    }

    await supabase.from('videos').update({ status: 'processing' }).eq('id', videoId);

    // Await the worker so Vercel doesn't kill the connection before the request lands.
    // The worker responds 202 immediately and processes in background, so this is fast.
    const workerRes = await fetch(`${workerUrl}/process`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${workerSecret}`,
      },
      body: JSON.stringify({ videoId, userId: user.id, clipCount }),
    });

    if (!workerRes.ok) {
      const workerBody = await workerRes.json().catch(() => ({})) as { error?: string };
      console.error(`Worker ${workerRes.status} for video ${videoId}:`, workerBody.error ?? '');
      await supabase.from('videos').update({ status: 'failed' }).eq('id', videoId);
      return NextResponse.json({ error: 'Worker rechazó la solicitud' }, { status: 502 });
    }

    return NextResponse.json({ success: true, message: 'Procesamiento iniciado' });
  } catch (err: unknown) {
    if (err instanceof ApiError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    const message = err instanceof Error ? err.message : 'Error desconocido';
    console.error('process-video error:', err);
    if (videoId) {
      await supabase.from('videos').update({ status: 'failed' }).eq('id', videoId);
    }
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
