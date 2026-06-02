-- Añade columnas de Stripe a la tabla profiles.
-- Ejecutar en: Supabase Dashboard → SQL Editor

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS stripe_customer_id      text,
  ADD COLUMN IF NOT EXISTS stripe_subscription_id  text,
  ADD COLUMN IF NOT EXISTS subscription_status     text DEFAULT 'free',
  ADD COLUMN IF NOT EXISTS plan_name               text DEFAULT 'free',
  ADD COLUMN IF NOT EXISTS subscription_created_at timestamp with time zone;

-- Índice para que el webhook pueda buscar por stripe_customer_id rápido
CREATE INDEX IF NOT EXISTS profiles_stripe_customer_id_idx
  ON public.profiles (stripe_customer_id);

-- RLS: el webhook usa service_role_key (bypass RLS), no necesita policy extra.
-- Los usuarios solo deben leer su propio perfil.
