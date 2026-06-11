import { NextResponse } from 'next/server';
import { S3Client, DeleteObjectCommand, ListObjectsV2Command } from '@aws-sdk/client-s3';
import { ApiError, getServiceSupabase, requireOwnedVideo, requireUser } from '@/lib/server/auth';

const r2 = new S3Client({
  region: 'auto',
  endpoint: `https://${process.env.CLOUDFLARE_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: process.env.CLOUDFLARE_R2_ACCESS_KEY_ID!,
    secretAccessKey: process.env.CLOUDFLARE_R2_SECRET_ACCESS_KEY!,
  },
});

async function deleteR2Prefix(prefix: string): Promise<void> {
  const list = await r2.send(new ListObjectsV2Command({
    Bucket: process.env.CLOUDFLARE_R2_BUCKET_NAME!,
    Prefix: prefix,
  }));
  await Promise.all(
    (list.Contents ?? [])
      .filter((obj): obj is { Key: string } => typeof obj.Key === 'string')
      .map(obj => r2.send(new DeleteObjectCommand({
        Bucket: process.env.CLOUDFLARE_R2_BUCKET_NAME!,
        Key: obj.Key,
      }))),
  );
}

export async function POST(request: Request) {
  const supabase = getServiceSupabase();
  try {
    const body = await request.json() as { videoId?: string };
    const { videoId } = body;

    if (!videoId) {
      return NextResponse.json({ error: 'videoId requerido' }, { status: 400 });
    }

    const user = await requireUser(request);
    const video = await requireOwnedVideo(videoId, user.id);

    console.log(`🗑️  Deleting video ${videoId}...`);

    // Delete R2 objects — non-fatal so we use allSettled
    await Promise.allSettled([
      deleteR2Prefix(`clips/${videoId}/`),
      r2.send(new DeleteObjectCommand({
        Bucket: process.env.CLOUDFLARE_R2_BUCKET_NAME!,
        Key: video.source_url,
      })),
    ]);

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
