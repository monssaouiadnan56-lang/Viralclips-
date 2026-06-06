import { NextResponse } from 'next/server';
import { getStripe } from '@/lib/stripe';
import { getServiceSupabase, requireUser } from '@/lib/server/auth';

export async function POST(request: Request) {
  const supabase = getServiceSupabase();
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
      const customer = await getStripe().customers.create({
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
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';

    const session = await getStripe().checkout.sessions.create({
      mode:     'subscription',
      customer: customerId,
      line_items: [
        {
          price:    process.env.STRIPE_PRICE_ID!,
          quantity: 1,
        },
      ],
      success_url: `${appUrl}/dashboard?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url:  `${appUrl}/dashboard?canceled=true`,
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
