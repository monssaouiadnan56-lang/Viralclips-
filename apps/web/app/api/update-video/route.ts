import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function POST(request: Request) {
  try {
    const body = await request.json() as { videoId?: string; title?: string };
    const { videoId, title } = body;

    if (!videoId || !title?.trim()) {
      return NextResponse.json({ error: 'videoId y title requeridos' }, { status: 400 });
    }

    const { error } = await supabase
      .from('videos')
      .update({ title: title.trim() })
      .eq('id', videoId);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Error desconocido';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
