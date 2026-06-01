import { NextResponse } from 'next/server';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

// Reuse the client across requests (module-level singleton).
const s3 = new S3Client({
  region: 'auto',
  endpoint: `https://${process.env.CLOUDFLARE_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: process.env.CLOUDFLARE_R2_ACCESS_KEY_ID!,
    secretAccessKey: process.env.CLOUDFLARE_R2_SECRET_ACCESS_KEY!,
  },
});

export async function POST(request: Request) {
  try {
    const body = await request.json() as {
      videoId?: string;
      filename?: string;
      contentType?: string;
    };

    const { videoId, filename = 'video.mp4', contentType = 'video/mp4' } = body;

    if (!videoId) {
      return NextResponse.json({ error: 'videoId requerido' }, { status: 400 });
    }

    const key = `${videoId}/${filename}`;

    const uploadUrl = await getSignedUrl(
      s3,
      new PutObjectCommand({
        Bucket: process.env.CLOUDFLARE_R2_BUCKET_NAME!,
        Key: key,
        ContentType: contentType,
      }),
      { expiresIn: 3600 },
    );

    return NextResponse.json({ uploadUrl, key });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Error generando URL';
    console.error('get-upload-url error:', err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
