import { NextResponse } from 'next/server';
import { stripe } from '@/lib/stripe';
import { getServiceSupabase, requireUser } from '@/lib/server/auth';

const supabase = getServiceSupabase();

export async function POST(request: Request) {
  try {
    const user = await requireUser(request);

    // ── 2. Buscar o crear Stripe customer ─────────────────────────────────
    const { data: profile } = await supabase
      .from('profiles')
      .select('stripe_customer_id, subscription_status')
      .eq('id', user.id)
      .single();

    let customerId: string | undefined = profile?.stripe_customer_id ?? undefined;

    if (profile?.subscription_status === 'active') {
      return NextResponse.json({ error: 'Tu plan Pro ya esta activo' }, { status: 409 });
    }

    if (!customerId) {
      const customer = await stripe.customers.create({
        email: user.email,
        metadata: { supabase_user_id: user.id },
      });
      customerId = customer.id;

      const { data: updatedProfile } = await supabase
        .from('profiles')
        .update({ stripe_customer_id: customerId })
        .eq('id', user.id)
        .select('id')
        .maybeSingle();

      if (!updatedProfile) {
        await supabase
          .from('profiles')
          .upsert({
            id: user.id,
            stripe_customer_id: customerId,
            subscription_status: 'free',
            plan_name: 'free',
          });
      }

      console.log(`✅ Stripe customer creado: ${customerId} para user ${user.id}`);
    }

    // ── 3. Crear Checkout Session ─────────────────────────────────────────
    const appUrl = process.env.NEXT_PUBLIC_APP_URL
      ?? (request.headers.get('origin') ?? 'http://localhost:3000');

    const session = await stripe.checkout.sessions.create({
      mode:     'subscription',
      customer: customerId,
      line_items: [
        {
          price:    process.env.STRIPE_PRICE_ID!,
          quantity: 1,
        },
      ],
      success_url: `${appUrl}/payment/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url:  `${appUrl}/payment/cancelled`,
      metadata: { supabase_user_id: user.id },
      subscription_data: {
        metadata: { supabase_user_id: user.id },
      },
    });

    console.log(`🔗 Checkout session creada: ${session.id}`);
    return NextResponse.json({ url: session.url });

  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Error desconocido';
    console.error('stripe/checkout error:', err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
