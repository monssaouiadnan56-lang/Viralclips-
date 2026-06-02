import Stripe from 'stripe';

if (!process.env.STRIPE_SECRET_KEY) {
  throw new Error('STRIPE_SECRET_KEY no está configurada');
}

// Module-level singleton — se reutiliza entre requests en el mismo proceso.
export const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
