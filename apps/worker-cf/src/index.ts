export interface Env {
  VIDEOS: R2Bucket;
  WORKER_UPLOAD_SECRET: string;
}

const CORS: Record<string, string> = {
  'Access-Control-Allow-Origin':   '*',
  'Access-Control-Allow-Methods':  'GET, PUT, POST, DELETE, OPTIONS',
  'Access-Control-Allow-Headers':  '*',
  'Access-Control-Expose-Headers': 'ETag, Content-Length, Content-Type',
  'Access-Control-Max-Age':        '86400',
};

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: CORS });
    }

    const url = new URL(request.url);

    try {
      // ── POST /upload  →  FormData { file, videoId, filename } ────────────
      if (request.method === 'POST' && url.pathname === '/upload') {
        const unauthorized = requireUploadSecret(request, env);
        if (unauthorized) return unauthorized;
        return handleUploadFormData(request, env);
      }

      // ── PUT /upload/<key>  →  raw binary stream (fallback, sin límite) ───
      if (request.method === 'PUT' && url.pathname.startsWith('/upload/')) {
        const unauthorized = requireUploadSecret(request, env);
        if (unauthorized) return unauthorized;
        return handleUploadRaw(request, url, env);
      }

      // ── GET /file/<key>  →  sirve desde R2 con CORS ──────────────────────
      if (request.method === 'GET' && url.pathname.startsWith('/file/')) {
        return handleDownload(url, env);
      }

      // ── GET /health ───────────────────────────────────────────────────────
      if (url.pathname === '/health' && request.method === 'GET') {
        return Response.json({ status: 'ok', ts: Date.now() }, { headers: CORS });
      }

      // ── GET / ─────────────────────────────────────────────────────────────
      if (url.pathname === '/' && request.method === 'GET') {
        return Response.json({
          name: 'ViralClips Worker API',
          status: 'running',
          endpoints: {
            upload: 'PUT /upload/<videoId>/<filename>',
            download: 'GET /file/<key>',
            health: 'GET /health',
          },
        }, { headers: CORS });
      }

      return Response.json({ error: 'Not found' }, { status: 404, headers: CORS });

    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Internal error';
      console.error('[worker] error:', err);
      return Response.json({ error: msg }, { status: 500, headers: CORS });
    }
  },
};

function requireUploadSecret(request: Request, env: Env): Response | null {
  const secret = request.headers.get('x-worker-upload-secret');

  if (!env.WORKER_UPLOAD_SECRET || secret !== env.WORKER_UPLOAD_SECRET) {
    return Response.json({ error: 'No autorizado' }, { status: 401, headers: CORS });
  }

  return null;
}

// ── POST /upload — recibe FormData con los campos: file, videoId, filename ───

async function handleUploadFormData(request: Request, env: Env): Promise<Response> {
  const formData = await request.formData();

  const file     = formData.get('file')     as File   | null;
  const videoId  = formData.get('videoId')  as string | null;
  const filename = formData.get('filename') as string | null;

  if (!file)     return Response.json({ error: 'Campo "file" requerido'     }, { status: 400, headers: CORS });
  if (!videoId)  return Response.json({ error: 'Campo "videoId" requerido'  }, { status: 400, headers: CORS });
  if (!filename) return Response.json({ error: 'Campo "filename" requerido' }, { status: 400, headers: CORS });

  const key = `${videoId}/${filename}`;

  await env.VIDEOS.put(key, file.stream(), {
    httpMetadata: { contentType: file.type || 'video/mp4' },
  });

  return Response.json({ success: true, key }, { status: 201, headers: CORS });
}

// ── PUT /upload/<key> — body binario directo, sin buffering (archivos grandes) ─

async function handleUploadRaw(request: Request, url: URL, env: Env): Promise<Response> {
  const key = url.pathname.slice('/upload/'.length);

  if (!key)          return Response.json({ error: 'key vacío'        }, { status: 400, headers: CORS });
  if (!request.body) return Response.json({ error: 'body requerido'   }, { status: 400, headers: CORS });

  const contentType = request.headers.get('Content-Type') ?? 'application/octet-stream';

  await env.VIDEOS.put(key, request.body, {
    httpMetadata: { contentType },
  });

  return Response.json({ success: true, key }, { status: 201, headers: CORS });
}

// ── GET /file/<key> — sirve el archivo desde R2 con CORS ─────────────────────

async function handleDownload(url: URL, env: Env): Promise<Response> {
  const key    = url.pathname.slice('/file/'.length);
  if (!key) return Response.json({ error: 'key vacío' }, { status: 400, headers: CORS });

  const object = await env.VIDEOS.get(key);
  if (!object)  return Response.json({ error: 'Archivo no encontrado' }, { status: 404, headers: CORS });

  return new Response(object.body, {
    headers: {
      ...CORS,
      'Content-Type':   object.httpMetadata?.contentType ?? 'application/octet-stream',
      'Content-Length': String(object.size),
      'ETag':           object.etag,
    },
  });
}
