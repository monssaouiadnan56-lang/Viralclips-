'use client';

import { useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Link2, Download } from 'lucide-react';
import { toast } from 'sonner';

const supabase = createClient();

interface Props {
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export default function ImportLinkModal({ open, onClose, onSuccess }: Props) {
  const [url, setUrl] = useState('');
  const [loading, setLoading] = useState(false);

  const handleImport = async () => {
    const trimmed = url.trim();
    if (!trimmed) return;
    setLoading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('No hay sesión activa');

      const res = await fetch('/api/import-video', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ url: trimmed }),
      });

      const data = await res.json() as { error?: string };
      if (!res.ok) throw new Error(data.error ?? 'Error al importar');

      toast.success('Video importado correctamente');
      setUrl('');
      onSuccess();
      onClose();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Error desconocido';
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  };

  const handleClose = () => {
    if (loading) return;
    setUrl('');
    onClose();
  };

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4"
          onClick={handleClose}
        >
          <motion.div
            initial={{ scale: 0.95, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.95, opacity: 0 }}
            transition={{ duration: 0.15 }}
            onClick={e => e.stopPropagation()}
            className="w-full max-w-md bg-[#0d1528] border border-white/10 rounded-2xl p-6 shadow-2xl"
          >
            <div className="flex items-center justify-between mb-5">
              <div className="flex items-center gap-2">
                <Link2 className="w-5 h-5 text-[#d0bcff]" />
                <h2 className="text-base font-bold text-white">Import from Link</h2>
              </div>
              <button onClick={handleClose} disabled={loading} className="p-1.5 hover:bg-white/10 rounded-lg transition disabled:opacity-50">
                <X className="w-4 h-4 text-[#cbc3d7]" />
              </button>
            </div>

            <p className="text-sm text-[#cbc3d7]/70 mb-4">
              Pega la URL de un video de YouTube, TikTok, Instagram, Vimeo, o un enlace directo a un archivo MP4/MOV.
            </p>

            <input
              type="url"
              placeholder="https://youtube.com/watch?v=... o https://tiktok.com/..."
              value={url}
              onChange={e => setUrl(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') handleImport(); }}
              disabled={loading}
              autoFocus
              className="w-full bg-[#060e20] border border-white/[0.10] rounded-xl px-4 py-3 text-sm text-[#dae2fd] placeholder:text-[#cbc3d7]/30 focus:outline-none focus:ring-1 focus:ring-[#d0bcff]/50 transition mb-4 disabled:opacity-50"
            />

            <button
              onClick={handleImport}
              disabled={loading || !url.trim()}
              className="w-full py-3 rounded-xl bg-gradient-to-r from-[#d0bcff] to-[#adc6ff] text-[#3c0091] text-sm font-bold transition-all hover:brightness-110 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              {loading ? (
                <>
                  <div className="w-4 h-4 border-2 border-[#3c0091]/30 border-t-[#3c0091] rounded-full animate-spin" />
                  Importando...
                </>
              ) : (
                <>
                  <Download className="w-4 h-4" />
                  Importar Video
                </>
              )}
            </button>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
