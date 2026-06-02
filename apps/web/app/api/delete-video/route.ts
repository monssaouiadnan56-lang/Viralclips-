import { NextResponse } from 'next/server';
import { ApiError, getServiceSupabase, requireOwnedVideo, requireUser } from '@/lib/server/auth';

const supabase = getServiceSupabase();

export async function POST(request: Request) {
  try {
    const body = await request.json() as { videoId?: string };
    const { videoId } = body;

    if (!videoId) {
      return NextResponse.json({ error: 'videoId requerido' }, { status: 400 });
    }

    console.log(`🗑️  Deleting video ${videoId}...`);

    const user = await requireUser(request);
    await requireOwnedVideo(videoId, user.id);

    // Clips first — foreign key constraint requires this order
    const { error: clipsErr } = await supabase
      .from('clips')
      .delete()
      .eq('video_id', videoId);

    if (clipsErr) {
      console.error('Error deleting clips:', clipsErr);
      return NextResponse.json({ error: `Error al eliminar clips: ${clipsErr.message}` }, { status: 500 });
    }

    const { error: videoErr } = await supabase
      .from('videos')
      .delete()
      .eq('id', videoId);

    if (videoErr) {
      console.error('Error deleting video:', videoErr);
      return NextResponse.json({ error: `Error al eliminar video: ${videoErr.message}` }, { status: 500 });
    }

    console.log(`   ✅ Video ${videoId} eliminado`);
    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    if (error instanceof ApiError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }

    const message = error instanceof Error ? error.message : 'Error desconocido';
    console.error('delete-video error:', error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
