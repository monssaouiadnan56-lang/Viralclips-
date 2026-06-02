'use client';

import Link from 'next/link';
import { motion } from 'framer-motion';
import { XCircle, ArrowLeft, MessageCircle } from 'lucide-react';

export default function PaymentCancelledPage() {
  return (
    <div className="min-h-screen bg-[#0b1326] flex items-center justify-center p-6">
      <motion.div
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.4 }}
        className="text-center max-w-md"
      >
        <motion.div
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          transition={{ type: 'spring', delay: 0.2, stiffness: 200 }}
          className="w-24 h-24 rounded-full bg-red-500/10 border border-red-500/20 flex items-center justify-center mx-auto mb-8"
        >
          <XCircle className="w-12 h-12 text-red-400" />
        </motion.div>

        <h1 className="font-sora text-4xl font-bold text-white mb-3">
          Pago cancelado
        </h1>

        <p className="text-[#cbc3d7] text-lg mb-8">
          No se realizó ningún cargo. Puedes volver a intentarlo cuando quieras
          o contactarnos si tienes algún problema.
        </p>

        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          <Link
            href="/dashboard"
            className="inline-flex items-center justify-center gap-2 px-6 py-3 rounded-xl bg-white/[0.05] border border-white/10 text-white font-semibold text-sm hover:bg-white/10 transition-all"
          >
            <ArrowLeft className="w-4 h-4" />
            Volver al dashboard
          </Link>
          <Link
            href="mailto:soporte@viralclips.ai"
            className="inline-flex items-center justify-center gap-2 px-6 py-3 rounded-xl bg-gradient-to-r from-[#d0bcff] to-[#adc6ff] text-[#3c0091] font-bold text-sm hover:brightness-110 transition-all"
          >
            <MessageCircle className="w-4 h-4" />
            Contactar soporte
          </Link>
        </div>
      </motion.div>
    </div>
  );
}
