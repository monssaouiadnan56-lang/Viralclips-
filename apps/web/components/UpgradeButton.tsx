'use client';

import { useState } from 'react';
import { createClient } from '@supabase/supabase-js';
import { Zap } from 'lucide-react';
import { toast } from 'sonner';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
);

interface Props {
  className?: string;
}

export default function UpgradeButton({ className = '' }: Props) {
  const [loading, setLoading] = useState(false);

  const handleUpgrade = async () => {
    setLoading(true);
    try {
      // Incluir el token de sesión para que el servidor verifique la identidad
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        toast.error('Inicia sesión para continuar');
        return;
      }

      const res = await fetch('/api/stripe/checkout', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`,
        },
      });

      const data = await res.json() as { url?: string; error?: string };

      if (!res.ok) {
        throw new Error(data.error ?? 'Error al crear sesión de pago');
      }

      if (!data.url) {
        throw new Error('No se recibió URL de pago');
      }

      // Redirigir al Checkout de Stripe
      window.location.href = data.url;

    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Error desconocido';
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <button
      onClick={handleUpgrade}
      disabled={loading}
      className={`inline-flex items-center justify-center gap-2 px-6 py-3 rounded-xl font-bold text-sm transition-all disabled:opacity-60 disabled:cursor-not-allowed
        bg-gradient-to-r from-[#d0bcff] to-[#f751a1] text-[#3c0091]
        hover:brightness-110 hover:scale-[1.02] active:scale-95
        shadow-lg shadow-[#d0bcff]/20 ${className}`}
    >
      {loading ? (
        <>
          <div className="w-4 h-4 border-2 border-[#3c0091]/30 border-t-[#3c0091] rounded-full animate-spin" />
          Procesando...
        </>
      ) : (
        <>
          <Zap className="w-4 h-4" />
          Upgrade to Pro — 15€/mes
        </>
      )}
    </button>
  );
}
