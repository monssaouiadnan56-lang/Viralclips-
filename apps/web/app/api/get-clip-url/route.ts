import { NextResponse } from 'next/server';
import { S3Client, GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { ApiError, requireUser } from '@/lib/server/auth';

const s3 = new S3Client({
  region: 'auto',
  endpoint: `https://${process.env.CLOUDFLARE_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: process.env.CLOUDFLARE_R2_ACCESS_KEY_ID!,
    secretAccessKey: process.env.CLOUDFLARE_R2_SECRET_ACCESS_KEY!,
  },
});

export async function GET(request: Request) {
  try {
    await requireUser(request);

    const { searchParams } = new URL(request.url);
    const key = searchParams.get('key');

    if (!key) {
      return NextResponse.json({ error: 'key requerido' }, { status: 400 });
    }

    const url = await getSignedUrl(
      s3,
      new GetObjectCommand({ Bucket: process.env.CLOUDFLARE_R2_BUCKET_NAME!, Key: key }),
      { expiresIn: 3600 },
    );

    return NextResponse.json({ url });
  } catch (err: unknown) {
    if (err instanceof ApiError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    return NextResponse.json({ error: 'Error generando URL' }, { status: 500 });
  }
}
