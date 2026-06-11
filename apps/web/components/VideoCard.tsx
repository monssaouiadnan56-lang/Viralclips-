'use client';

import { useRef, useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Film, Calendar, MoreVertical, Sparkles, ChevronDown,
  Play, Download, Pencil, Trash2, Check, X,
} from 'lucide-react';

interface VideoCardProps {
  video: any;
  clipCount?: number;
  isExpanded?: boolean;
  onToggle?: () => void;
  videoClips?: any[];
  onPlayClip?: (url: string) => void;
  onRefresh?: () => void;
}

const supabase = createClient();

const STATUS_MAP: Record<string, { label: string; textColor: string; dotColor: string; pulse: boolean }> = {
  completed: { label: 'Completado', textColor: 'text-green-400', dotColor: 'bg-green-400', pulse: false },
  processing: { label: 'Procesando', textColor: 'text-purple-400', dotColor: 'bg-purple-400', pulse: true },
  failed: { label: 'Fallido', textColor: 'text-red-400', dotColor: 'bg-red-400', pulse: false },
  pending: { label: 'Pendiente', textColor: 'text-gray-500', dotColor: 'bg-gray-600', pulse: false },
};

export default function VideoCard({
  video,
  clipCount = 0,
  isExpanded = false,
  onToggle,
  videoClips = [],
  onPlayClip,
  onRefresh,
}: VideoCardProps) {
  const s = STATUS_MAP[String(video.status)] ?? {
    label: 'Pendiente', textColor: 'text-gray-500', dotColor: 'bg-gray-600', pulse: false,
  };

  // Dropdown
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  // Edit mode
  const [editMode, setEditMode] = useState(false);
  const [editTitle, setEditTitle] = useState<string>(String(video.title ?? ''));
  const [saving, setSaving] = useState(false);

  // Close dropdown when clicking outside
  useEffect(() => {
    if (!menuOpen) return;
    const handler = (e: MouseEvent) => {
      if (menuRef.current && e.target instanceof Node && !menuRef.current.contains(e.target)) {
        setMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [menuOpen]);

  const handleProcess = async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('No hay sesión activa');

      const res = await fetch('/api/process-video', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ videoId: video.id }),
      });
      const data = await res.json() as { error?: string };
      if (res.ok) {
        onRefresh?.();
      } else {
        alert(`❌ Error: ${data.error ?? 'Error al procesar'}`);
      }
    } catch {
      alert('Error al procesar el video');
    }
  };

  const handleEditClick = () => {
    setEditTitle(String(video.title ?? ''));
    setEditMode(true);
    setMenuOpen(false);
  };

  const handleSave = async () => {
    const trimmed = editTitle.trim();
    if (!trimmed) return;
    setSaving(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('No hay sesión activa');

      const res = await fetch('/api/update-video', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ videoId: video.id, title: trimmed }),
      });
      const data = await res.json() as { error?: string };
      if (!res.ok) throw new Error(data.error ?? 'Error al guardar');
      onRefresh?.();
      setEditMode(false);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Error desconocido';
      alert(`Error al guardar: ${msg}`);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    setMenuOpen(false);
    if (!window.confirm('¿Estás seguro de que quieres eliminar este video y todos sus clips?')) return;
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('No hay sesión activa');

      const res = await fetch('/api/delete-video', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ videoId: video.id }),
      });
      const data = await res.json() as { error?: string };
      if (!res.ok) throw new Error(data.error ?? 'Error al eliminar');
      onRefresh?.();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Error desconocido';
      alert(`Error al eliminar: ${msg}`);
    }
  };

  return (
    <div>
      {/* ── Main card ──
          overflow-hidden is on the thumbnail div (rounded-t-2xl) so the dropdown
          can overflow outside the card without being clipped. */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        whileHover={!isExpanded ? { y: -4 } : {}}
        transition={{ duration: 0.2 }}
        className="relative bg-white/[0.04] backdrop-blur-sm rounded-2xl border border-white/[0.07] hover:border-purple-500/40 hover:shadow-lg hover:shadow-purple-900/20 transition-colors duration-300 group"
      >
        {/* Thumbnail — carries its own clip mask */}
        <div className="relative h-44 rounded-t-2xl overflow-hidden bg-gradient-to-br from-purple-900/50 via-indigo-900/30 to-black flex items-center justify-center">
          <Film className="w-12 h-12 text-white/[0.08] group-hover:text-purple-500/40 transition-colors duration-500" />
          <div className="absolute inset-0 bg-gradient-to-t from-black/50 to-transparent" />
          <button
            onClick={(e) => { e.stopPropagation(); setMenuOpen(v => !v); }}
            className="absolute top-3 right-3 p-1.5 rounded-full bg-black/30 backdrop-blur hover:bg-white/15 transition opacity-0 group-hover:opacity-100"
          >
            <MoreVertical className="w-4 h-4 text-white/70" />
          </button>
        </div>

        {/* ── Dropdown menu ── */}
        {menuOpen && (
          <div
            ref={menuRef}
            className="absolute top-11 right-2 z-50 w-44 bg-[#0d0d1a]/95 backdrop-blur-xl border border-white/[0.09] rounded-xl shadow-2xl shadow-black/50 py-1.5 overflow-hidden"
          >
            <button
              onClick={handleEditClick}
              className="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-gray-200 hover:bg-white/[0.07] transition-colors text-left"
            >
              <Pencil className="w-3.5 h-3.5 text-purple-400 flex-shrink-0" />
              Editar título
            </button>
            <div className="mx-2 my-1 h-px bg-white/[0.06]" />
            <button
              onClick={handleDelete}
              className="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-red-400 hover:bg-red-500/10 transition-colors text-left"
            >
              <Trash2 className="w-3.5 h-3.5 flex-shrink-0" />
              Eliminar video
            </button>
          </div>
        )}

        {/* ── Content ── */}
        <div className="p-5">
          {/* Title — display or inline edit */}
          {editMode ? (
            <div className="mb-4">
              <input
                type="text"
                value={editTitle}
                onChange={(e) => setEditTitle(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleSave();
                  if (e.key === 'Escape') setEditMode(false);
                }}
                autoFocus
                className="w-full bg-white/[0.07] border border-purple-500/40 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:ring-1 focus:ring-purple-500/60 placeholder:text-gray-600"
                placeholder="Nombre del video..."
              />
              <div className="flex gap-2 mt-2">
                <button
                  onClick={handleSave}
                  disabled={saving || !editTitle.trim()}
                  className="flex-1 py-1.5 text-xs font-semibold bg-purple-600 hover:bg-purple-500 text-white rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-1"
                >
                  {saving
                    ? <div className="w-3 h-3 border border-white/30 border-t-white rounded-full animate-spin" />
                    : <Check className="w-3 h-3" />
                  }
                  Guardar
                </button>
                <button
                  onClick={() => setEditMode(false)}
                  className="flex-1 py-1.5 text-xs font-medium bg-white/[0.05] hover:bg-white/[0.09] border border-white/[0.08] text-gray-400 rounded-lg transition-colors flex items-center justify-center gap-1"
                >
                  <X className="w-3 h-3" />
                  Cancelar
                </button>
              </div>
            </div>
          ) : (
            <h3 className="font-semibold text-white mb-4 truncate">{video.title ?? 'Sin título'}</h3>
          )}

          <div className="space-y-2.5">
            <div className="flex items-center justify-between">
              <span className="text-[11px] text-gray-600 uppercase tracking-widest font-medium">Estado</span>
              <div className="flex items-center gap-1.5">
                <span className={`inline-block w-1.5 h-1.5 rounded-full ${s.dotColor} ${s.pulse ? 'animate-pulse' : ''}`} />
                <span className={`text-xs font-semibold ${s.textColor}`}>{s.label}</span>
              </div>
            </div>

            {video.status === 'processing' && (
              <div className="relative h-1 w-full rounded-full overflow-hidden bg-white/10">
                <motion.div
                  animate={{ x: ['-100%', '200%'] }}
                  transition={{ duration: 1.8, repeat: Infinity, ease: 'easeInOut' }}
                  className="absolute inset-y-0 w-1/2 bg-gradient-to-r from-transparent via-purple-400 to-transparent"
                />
              </div>
            )}

            <div className="flex items-center gap-1.5 text-xs text-gray-600">
              <Calendar className="w-3.5 h-3.5 flex-shrink-0" />
              <span>
                {new Date(video.created_at).toLocaleDateString('es-ES', {
                  day: 'numeric', month: 'short', year: 'numeric',
                })}
              </span>
            </div>
          </div>

          {video.status === 'pending' && (
            <button
              onClick={handleProcess}
              className="w-full mt-4 py-2.5 bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-500 hover:to-blue-500 text-white text-sm font-semibold rounded-xl transition-all flex items-center justify-center gap-2 shadow-lg shadow-purple-900/30"
            >
              <Sparkles className="w-4 h-4" />
              Procesar con IA
            </button>
          )}

          {video.status === 'processing' && (
            <div className="mt-3 flex items-center gap-2 text-xs text-purple-400/80">
              <div className="w-3 h-3 border border-purple-400/50 border-t-purple-400 rounded-full animate-spin flex-shrink-0" />
              Generando clips con IA...
            </div>
          )}

          {video.status === 'completed' && onToggle && (
            <button
              onClick={onToggle}
              disabled={clipCount === 0}
              className={`w-full mt-3 py-2 text-xs font-semibold rounded-xl border transition-all flex items-center justify-center gap-2 ${
                isExpanded
                  ? 'bg-purple-500/20 border-purple-500/40 text-purple-300'
                  : clipCount > 0
                    ? 'bg-white/[0.05] border-white/[0.08] text-gray-300 hover:border-purple-500/30 hover:text-purple-300'
                    : 'bg-white/[0.03] border-white/[0.05] text-gray-600 cursor-default'
              }`}
            >
              <Film className="w-3.5 h-3.5" />
              {clipCount > 0 ? `Ver clips (${clipCount})` : 'Sin clips generados'}
              {clipCount > 0 && (
                <ChevronDown className={`w-3.5 h-3.5 ml-auto transition-transform duration-200 ${isExpanded ? 'rotate-180' : ''}`} />
              )}
            </button>
          )}
        </div>
      </motion.div>

      {/* ── Expanded clips section ── */}
      <AnimatePresence>
        {isExpanded && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.22, ease: 'easeInOut' }}
            className="overflow-hidden"
          >
            <div className="mt-2 p-3 bg-white/[0.03] rounded-2xl border border-purple-500/20">
              <p className="text-[11px] text-gray-500 mb-2.5 flex items-center gap-1.5">
                <Sparkles className="w-3 h-3 text-purple-500" />
                {clipCount} clip{clipCount !== 1 ? 's' : ''} detectado{clipCount !== 1 ? 's' : ''} por IA
              </p>
              {videoClips.length === 0 ? (
                <p className="text-center text-xs text-gray-600 py-3">Sin clips generados</p>
              ) : (
                <div className="grid grid-cols-2 gap-2">
                  {videoClips.map((clip, i) => (
                    <ClipMiniCard key={clip.id} clip={clip} index={i} onPlay={onPlayClip} />
                  ))}
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function ClipMiniCard({ clip, index, onPlay }: { clip: any; index: number; onPlay?: (url: string) => void }) {
  const [busy, setBusy] = useState(false);

  const resolveUrl = async (): Promise<string | null> => {
    if (!clip.url) return null;
    // Legacy clips stored a signed https URL directly — use as-is
    if (clip.url.startsWith('http')) return clip.url as string;
    // New clips store the R2 key — fetch a fresh 1-hour signed URL
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return null;
    const res = await fetch(`/api/get-clip-url?key=${encodeURIComponent(clip.url as string)}`, {
      headers: { Authorization: `Bearer ${session.access_token}` },
    });
    const json = await res.json() as { url?: string };
    return json.url ?? null;
  };

  const handlePlay = async () => {
    setBusy(true);
    try {
      const url = await resolveUrl();
      if (url) onPlay?.(url);
    } catch { /* non-fatal */ } finally {
      setBusy(false);
    }
  };

  const handleDownload = async () => {
    setBusy(true);
    try {
      const url = await resolveUrl();
      if (!url) return;
      const a = document.createElement('a');
      a.href = url;
      a.download = `${(clip.title as string | undefined) ?? `clip-${index + 1}`}.mp4`;
      a.click();
    } catch { /* non-fatal */ } finally {
      setBusy(false);
    }
  };

  return (
    <div className="rounded-xl overflow-hidden border border-white/[0.06] bg-white/[0.02] group">
      <div
        className="relative aspect-video bg-gradient-to-br from-purple-900/40 to-blue-950/60 flex items-center justify-center cursor-pointer"
        onClick={handlePlay}
      >
        <Film className="w-5 h-5 text-purple-400/25" />
        <div className="absolute inset-0 flex items-center justify-center bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity">
          <div className="w-8 h-8 rounded-full bg-white/25 border border-white/40 flex items-center justify-center">
            {busy
              ? <div className="w-3 h-3 border border-white/40 border-t-white rounded-full animate-spin" />
              : <Play className="w-3.5 h-3.5 text-white fill-white ml-0.5" />}
          </div>
        </div>
        <div className="absolute top-1.5 left-1.5 flex items-center gap-1 px-1.5 py-0.5 bg-purple-600/90 rounded text-[9px] font-bold">
          <Sparkles className="w-2 h-2" />
          #{index + 1}
        </div>
      </div>
      <div className="p-2">
        <p className="text-[11px] font-medium text-white truncate mb-1.5">
          {clip.title ?? `Clip ${index + 1}`}
        </p>
        <div className="flex gap-1.5">
          <button
            onClick={handlePlay}
            disabled={busy}
            className="flex-1 py-1 text-[10px] font-semibold bg-gradient-to-r from-purple-600/80 to-blue-600/80 hover:from-purple-500 hover:to-blue-500 text-white rounded-md transition-all flex items-center justify-center gap-1 disabled:opacity-50"
          >
            <Play className="w-2.5 h-2.5" />
            Ver
          </button>
          <button
            onClick={handleDownload}
            disabled={busy}
            className="flex-1 py-1 text-[10px] font-medium bg-white/[0.07] hover:bg-white/[0.12] border border-white/[0.08] text-gray-300 rounded-md transition-all flex items-center justify-center gap-1 disabled:opacity-50"
          >
            <Download className="w-2.5 h-2.5" />
            Bajar
          </button>
        </div>
      </div>
    </div>
  );
}
