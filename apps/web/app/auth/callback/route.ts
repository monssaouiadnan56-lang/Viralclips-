import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get('code');
  const next = searchParams.get('next') ?? '/dashboard';
  const base = process.env.NEXT_PUBLIC_APP_URL || 'https://viralclips-web.vercel.app';

  if (!code) {
    return NextResponse.redirect(`${base}/login?error=no_code`);
  }

  const cookieStore = cookies();

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => cookieStore.getAll(),
        setAll: (cookiesToSet) => {
          cookiesToSet.forEach(({ name, value, options }) => {
            cookieStore.set(name, value, options);
          });
        },
      },
    }
  );

  try {
    const { error } = await supabase.auth.exchangeCodeForSession(code);

    if (error) {
      console.error('Error exchanging code:', error);
      return NextResponse.redirect(`${base}/login?error=exchange_failed`);
    }

    // Éxito - redirigir al dashboard
    return NextResponse.redirect(`${base}${next}`);
  } catch (err) {
    console.error('Callback error:', err);
    return NextResponse.redirect(`${base}/login?error=auth_failed`);
  }
}
