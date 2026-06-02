'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import { CheckCircle, Sparkles } from 'lucide-react';

export default function PaymentSuccessPage() {
  const router = useRouter();

  useEffect(() => {
    const timer = setTimeout(() => router.push('/dashboard'), 4000);
    return () => clearTimeout(timer);
  }, [router]);

  return (
    <div className="min-h-screen bg-[#0b1326] flex items-center justify-center p-6">
      <motion.div
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.4 }}
        className="text-center max-w-md"
      >
        {/* Icono animado */}
        <motion.div
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          transition={{ type: 'spring', delay: 0.2, stiffness: 200 }}
          className="w-24 h-24 rounded-full bg-gradient-to-br from-[#d0bcff]/20 to-[#f751a1]/20 border border-[#d0bcff]/30 flex items-center justify-center mx-auto mb-8"
        >
          <CheckCircle className="w-12 h-12 text-[#d0bcff]" />
        </motion.div>

        <h1 className="font-sora text-4xl font-bold text-white mb-3">
          ¡Pago exitoso!
        </h1>

        <p className="text-[#cbc3d7] text-lg mb-4">
          Tu plan <span className="text-[#d0bcff] font-semibold">Pro</span> está activo.
          Ahora tienes acceso a todas las funcionalidades de ViralClips AI.
        </p>

        <div className="flex items-center justify-center gap-2 text-[#cbc3d7]/60 text-sm mb-8">
          <Sparkles className="w-4 h-4 text-[#d0bcff]" />
          Redirigiendo al dashboard en unos segundos...
        </div>

        {/* Barra de progreso */}
        <div className="w-full h-1 bg-white/10 rounded-full overflow-hidden">
          <motion.div
            className="h-full bg-gradient-to-r from-[#d0bcff] to-[#f751a1] rounded-full"
            initial={{ width: '0%' }}
            animate={{ width: '100%' }}
            transition={{ duration: 4, ease: 'linear' }}
          />
        </div>
      </motion.div>
    </div>
  );
}
