# ViralClips — Guía para Codex

## Qué es este proyecto
SaaS que recibe vídeos largos (podcasts, YouTube) y extrae 3-5 clips virales
en formato 9:16 con subtítulos estilo TikTok usando IA.

## Stack

| Capa | Tecnología |
|------|-----------|
| Frontend | Next.js 14 (App Router) + TypeScript + Tailwind + shadcn/ui |
| Worker | Node.js + TypeScript (Railway) |
| Auth & DB | Supabase (Postgres + Auth + Storage) |
| Transcripción | OpenAI Whisper API |
| Análisis | OpenAI GPT-4o-mini |
| Edición de vídeo | FFmpeg (fluent-ffmpeg) |
| Monorepo | pnpm workspaces |

## Estructura

```
viralclips/
├── apps/
│   ├── web/          # Next.js 14 — frontend y API routes
│   └── worker/       # Node.js — procesamiento de vídeo en background
├── packages/
│   └── shared/       # Tipos TypeScript compartidos
├── AGENTS.md
├── package.json
└── pnpm-workspace.yaml
```

## Arquitectura del flujo principal

```
Usuario sube vídeo
  → apps/web guarda en Supabase Storage
  → crea Job en BD con status "queued"
  → POST a worker /process
     → worker descarga vídeo
     → Whisper: transcripción
     → GPT-4o-mini: identifica 3-5 momentos virales con timestamps
     → FFmpeg: corta clips + añade subtítulos (9:16)
     → guarda clips en Supabase Storage
     → actualiza Job a "done"
  → web hace polling / realtime y muestra clips
```

## Tipos del dominio (packages/shared)

- **Video**: vídeo subido por el usuario
- **Clip**: fragmento viral extraído de un vídeo
- **Job**: tarea de procesamiento (transcribe → analyze → render)
- **TranscriptSegment**: segmento de la transcripción con timestamps

## Convenciones de código

- **TypeScript estricto**: `strict: true` + `noUncheckedIndexedAccess` + `noImplicitOverride`
- **Cero `any`**: usar tipos explícitos o `unknown` con narrowing
- **Imports absolutos**: `@/` en web, rutas relativas en worker y shared
- **Funciones pequeñas**: máx. ~30 líneas; extraer si crece
- **Sin comentarios obvios**: solo cuando el WHY no es evidente
- **Sin manejo de errores defensivo innecesario**: confiar en garantías del framework
- **Nombres descriptivos**: `extractViralClips`, no `processVideo`

## Comandos frecuentes

```bash
# Arrancar todo en desarrollo
pnpm dev:web       # Next.js en http://localhost:3000
pnpm dev:worker    # Worker en http://localhost:3001

# Typecheck
pnpm typecheck

# Añadir componente shadcn/ui (desde apps/web)
pnpm dlx shadcn@latest add button
pnpm dlx shadcn@latest add card
```

## Variables de entorno

Copiar `.env.example` a `.env.local` (web) o `.env` (worker) y rellenar.
Ver los archivos `.env.example` en cada app.

## Deploy

- **web**: Vercel (conectar repo, auto-deploy en push a main)
- **worker**: Railway (Dockerfile o buildpack Node, variables de entorno en dashboard)
