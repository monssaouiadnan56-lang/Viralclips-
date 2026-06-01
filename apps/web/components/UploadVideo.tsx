'use client';

import { useState, useCallback } from 'react';
import { createClient } from '@supabase/supabase-js';
import { motion, AnimatePresence } from 'framer-motion';
import { Upload, X, FileVideo, CheckCircle } from 'lucide-react';
import { toast } from 'sonner';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const supabase = createClient(supabaseUrl, supabaseAnonKey);

interface Props {
  onSuccess?: () => void;
}

// Envía el video al Worker via PUT con body binario directo.
// El Worker hace streaming a R2 sin buffering → sin límite de tamaño.
// XHR da progreso real; FormData bufferea todo en memoria y falla con archivos >128 MB.
function uploadToWorker(
  file: File,
  workerUrl: string,
  videoId: string,
  filename: string,
  onProgress: (pct: number) => void,
): Promise<string> {
  const key = `${videoId}/${filename}`;
  const url = `${workerUrl}/upload/${key}`;

  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();

    xhr.upload.addEventListener('progress', (e) => {
      if (e.lengthComputable) onProgress(Math.round((e.loaded / e.total) * 100));
    });

    xhr.addEventListener('load', () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        try {
          const body = JSON.parse(xhr.responseText) as { key?: string };
          resolve(body.key ?? key);
        } catch {
          resolve(key);
        }
      } else {
        let msg = `HTTP ${xhr.status}`;
        try {
          const body = JSON.parse(xhr.responseText) as { error?: string };
          if (body.error) msg = body.error;
        } catch { /* ignore */ }
        reject(new Error(`Worker: ${msg}`));
      }
    });

    xhr.addEventListener('error', () => reject(new Error('Error de red durante el upload')));
    xhr.addEventListener('abort', () => reject(new Error('Upload cancelado')));

    xhr.open('PUT', url);
    xhr.setRequestHeader('Content-Type', file.type || 'video/mp4');
    xhr.send(file); // body binario directo — el Worker lo hace stream a R2
  });
}

export default function UploadVideoAdvanced({ onSuccess }: Props) {
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [dragActive, setDragActive] = useState(false);

  const validateAndSetFile = (selected: File) => {
    if (!selected.type.startsWith('video/')) {
      toast.error('Por favor sube solo archivos de video');
      return;
    }
    if (selected.size > 500 * 1024 * 1024) {
      toast.error('El video no puede superar los 500MB');
      return;
    }
    setFile(selected);
    toast.success(`Video seleccionado: ${selected.name}`);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files?.[0]) validateAndSetFile(e.target.files[0]);
  };

  const handleDrag = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(e.type === 'dragenter' || e.type === 'dragover');
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    if (e.dataTransfer.files?.[0]) validateAndSetFile(e.dataTransfer.files[0]);
  }, []);

  const handleUpload = async () => {
    if (!file) return;
    setUploading(true);
    setProgress(0);

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('No hay sesión activa');

      const workerUrl = process.env.NEXT_PUBLIC_CLOUDFLARE_WORKER_URL;
      if (!workerUrl) throw new Error('NEXT_PUBLIC_CLOUDFLARE_WORKER_URL no configurado');

      // ID estable que vincula la clave R2 con la fila de la BD
      const videoId  = crypto.randomUUID();
      const ext      = file.name.split('.').pop() ?? 'mp4';
      const filename = `${Date.now()}.${ext}`;

      // ── 1. Subir al Worker via PUT streaming (sin límite de tamaño) ─────
      const r2Key = await uploadToWorker(file, workerUrl, videoId, filename, setProgress);

      // ── 2. Guardar referencia en Supabase (lógica de BD sin cambios) ──────
      const { error: dbError } = await supabase.from('videos').insert({
        id:         videoId,
        user_id:    user.id,
        title:      file.name,
        source_url: r2Key,    // clave R2, ej: "uuid/1714000000000.mp4"
        status:     'pending',
      });

      if (dbError) throw dbError;

      toast.success('¡Video subido correctamente!');
      setFile(null);
      setProgress(0);
      onSuccess?.();

    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : 'Error desconocido';
      toast.error(`Error al subir: ${msg}`);
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="bg-white/[0.04] backdrop-blur-sm p-8 rounded-2xl border border-white/[0.07]">
      <h3 className="text-base font-bold text-white mb-6 flex items-center gap-2">
        <Upload className="w-4 h-4 text-purple-400" />
        Subir nuevo video
      </h3>

      {/* Drag & Drop Zone */}
      <div
        className={`relative border-2 border-dashed rounded-xl p-8 text-center transition-all duration-200 ${
          dragActive
            ? 'border-purple-500/70 bg-purple-500/10'
            : 'border-white/[0.15] hover:border-purple-500/50 hover:bg-white/[0.02]'
        }`}
        onDragEnter={handleDrag}
        onDragLeave={handleDrag}
        onDragOver={handleDrag}
        onDrop={handleDrop}
      >
        <input
          type="file"
          accept="video/*"
          onChange={handleFileChange}
          className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
        />
        <div className="space-y-4">
          <div className="w-14 h-14 mx-auto bg-purple-500/20 rounded-full flex items-center justify-center">
            <Upload className="w-7 h-7 text-purple-400" />
          </div>
          <div>
            <p className="text-white font-medium mb-1">Arrastra tu video aquí</p>
            <p className="text-sm text-gray-500">o haz clic para seleccionar</p>
          </div>
          <p className="text-xs text-gray-600">MP4, MOV, AVI hasta 500MB · Almacenado en Cloudflare R2</p>
        </div>
      </div>

      {/* File Preview + Progress */}
      <AnimatePresence>
        {file && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="mt-5 p-4 bg-white/[0.03] rounded-xl border border-white/[0.07]"
          >
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-3 min-w-0">
                <FileVideo className="w-8 h-8 text-purple-400 flex-shrink-0" />
                <div className="min-w-0">
                  <p className="text-sm font-medium text-white truncate">{file.name}</p>
                  <p className="text-xs text-gray-500">{(file.size / (1024 * 1024)).toFixed(2)} MB</p>
                </div>
              </div>
              {!uploading && (
                <button
                  onClick={() => setFile(null)}
                  className="p-1.5 hover:bg-white/10 rounded-lg transition flex-shrink-0"
                >
                  <X className="w-4 h-4 text-gray-500" />
                </button>
              )}
            </div>

            {/* Progress bar */}
            {uploading && (
              <div className="mb-4">
                <div className="flex justify-between text-xs text-gray-400 mb-1.5">
                  <span>Subiendo a Cloudflare R2...</span>
                  <span>{progress}%</span>
                </div>
                <div className="w-full h-1.5 bg-white/10 rounded-full overflow-hidden">
                  <motion.div
                    className="h-full bg-gradient-to-r from-purple-500 to-blue-500 rounded-full"
                    style={{ width: `${progress}%` }}
                    transition={{ duration: 0.2 }}
                  />
                </div>
              </div>
            )}

            <button
              onClick={handleUpload}
              disabled={uploading}
              className="w-full py-2.5 bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-500 hover:to-blue-500 text-white text-sm font-semibold rounded-xl transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              {uploading ? (
                <>
                  <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  Subiendo {progress}%...
                </>
              ) : (
                <>
                  <CheckCircle className="w-4 h-4" />
                  Subir a R2
                </>
              )}
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
