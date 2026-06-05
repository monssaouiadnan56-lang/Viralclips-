import Stripe from 'stripe';

let _stripe: Stripe | null = null;

export function getStripe(): Stripe {
  if (!_stripe) {
    // During Next.js build, env vars may not be available.
    // Use a placeholder so the build doesn't fail — API calls will fail at
    // runtime with a Stripe auth error if the key is not properly configured.
    _stripe = new Stripe(
      process.env.STRIPE_SECRET_KEY ?? 'sk_test_placeholder_configure_stripe_secret_key',
    );
  }
  return _stripe;
}
