import { NextResponse } from 'next/server';
import { ApiError, getServiceSupabase, requireOwnedVideo, requireUser } from '@/lib/server/auth';

const supabase = getServiceSupabase();

export async function POST(request: Request) {
  try {
    const body = await request.json() as { videoId?: string; title?: string };
    const { videoId, title } = body;

    if (!videoId || !title?.trim()) {
      return NextResponse.json({ error: 'videoId y title requeridos' }, { status: 400 });
    }

    const user = await requireUser(request);
    await requireOwnedVideo(videoId, user.id);

    const { error } = await supabase
      .from('videos')
      .update({ title: title.trim() })
      .eq('id', videoId);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    if (error instanceof ApiError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }

    const message = error instanceof Error ? error.message : 'Error desconocido';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
