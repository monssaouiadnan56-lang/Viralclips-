import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { stripe } from '@/lib/stripe';
import type Stripe from 'stripe';

// En App Router NO se usa bodyParser:false — el body se lee con request.text()
export const dynamic = 'force-dynamic';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!, // bypass RLS para actualizar cualquier perfil
);

export async function POST(request: Request) {
  const body      = await request.text(); // CRUCIAL: body crudo para verificar firma
  const signature = request.headers.get('stripe-signature');

  if (!signature) {
    console.error('webhook: falta stripe-signature header');
    return NextResponse.json({ error: 'No signature' }, { status: 400 });
  }

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(
      body,
      signature,
      process.env.STRIPE_WEBHOOK_SECRET!,
    );
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Signature inválida';
    console.error('webhook: firma inválida —', msg);
    return NextResponse.json({ error: msg }, { status: 400 });
  }

  console.log(`📨 Stripe webhook: ${event.type}`);

  try {
    switch (event.type) {

      // ── Pago completado ─────────────────────────────────────────────────
      case 'checkout.session.completed': {
        const session = event.data.object;

        const customerId      = resolveId(session.customer);
        const subscriptionId  = resolveId(session.subscription);
        const userId = session.metadata?.supabase_user_id ?? null;

        if (!customerId) break;

        await updateProfileForStripeCustomer(customerId, userId, {
          stripe_subscription_id: subscriptionId,
          subscription_status:    'active',
          plan_name:              'pro',
          subscription_created_at: new Date().toISOString(),
        });

        console.log(`✅ checkout.session.completed → customer ${customerId} → pro`);
        break;
      }

      // ── Suscripción actualizada ─────────────────────────────────────────
      case 'customer.subscription.updated': {
        const sub = event.data.object;

        const statusMap: Record<string, string> = {
          active:            'active',
          past_due:          'past_due',
          unpaid:            'unpaid',
          canceled:          'canceled',
          incomplete:        'incomplete',
          incomplete_expired:'incomplete_expired',
          trialing:          'trialing',
          paused:            'paused',
        };

        const customerId = resolveId(sub.customer);
        const userId = sub.metadata?.supabase_user_id ?? null;
        if (!customerId) break;

        await updateProfileForStripeCustomer(customerId, userId, {
          subscription_status: statusMap[sub.status] ?? sub.status,
          plan_name:           sub.status === 'active' ? 'pro' : 'free',
        });

        console.log(`🔄 subscription.updated → ${sub.status}`);
        break;
      }

      // ── Suscripción cancelada ───────────────────────────────────────────
      case 'customer.subscription.deleted': {
        const sub = event.data.object;
        const customerId = resolveId(sub.customer);
        const userId = sub.metadata?.supabase_user_id ?? null;
        if (!customerId) break;

        await updateProfileForStripeCustomer(customerId, userId, {
          subscription_status:   'canceled',
          plan_name:             'free',
          stripe_subscription_id: null,
        });

        console.log(`❌ subscription.deleted → customer ${customerId} → free`);
        break;
      }

      default:
        console.log(`⏭️  Evento no manejado: ${event.type}`);
    }
  } catch (err: unknown) {
    console.error('webhook handler error:', err);
    return NextResponse.json({ error: 'Handler failed' }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}

// Stripe retorna IDs como string o como objeto expandido — esta función
// normaliza ambos casos a string | null.
function resolveId(value: string | { id: string } | null | undefined): string | null {
  if (!value) return null;
  return typeof value === 'string' ? value : value.id;
}

async function updateProfileForStripeCustomer(
  customerId: string,
  userId: string | null,
  values: Record<string, string | null>,
): Promise<void> {
  const { data, error } = await supabase
    .from('profiles')
    .update(values)
    .eq('stripe_customer_id', customerId)
    .select('id');

  if (error) throw error;
  if (data && data.length > 0) return;

  if (!userId) {
    throw new Error(`No profile found for Stripe customer ${customerId}`);
  }

  const { data: fallbackData, error: fallbackError } = await supabase
    .from('profiles')
    .update({ ...values, stripe_customer_id: customerId })
    .eq('id', userId)
    .select('id');

  if (fallbackError) throw fallbackError;
  if (!fallbackData || fallbackData.length === 0) {
    throw new Error(`No profile found for user ${userId}`);
  }
}
