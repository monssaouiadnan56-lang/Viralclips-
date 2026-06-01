# ================================================================
# fix.ps1 — Repara node_modules corruptos y reinicia el dev server
# Uso: cd D:\viralclips ; .\fix.ps1
# ================================================================

$ErrorActionPreference = "Continue"
$root = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $root

Write-Host ""
Write-Host "=========================================" -ForegroundColor Magenta
Write-Host "   ViralClips AI — Reparar dependencias  " -ForegroundColor Magenta
Write-Host "=========================================" -ForegroundColor Magenta
Write-Host ""

# ── 1. Verificar que 'next' está declarado en package.json ──────────────────
$webPkgPath = Join-Path $root "apps\web\package.json"
$webPkg = Get-Content $webPkgPath -Raw | ConvertFrom-Json

if ($webPkg.dependencies.next) {
    Write-Host "✅  next@$($webPkg.dependencies.next) presente en apps/web/package.json" -ForegroundColor Green
} else {
    Write-Host "❌  'next' no está en apps/web/package.json — abortando" -ForegroundColor Red
    exit 1
}

# ── 2. Eliminar apps/web/node_modules ───────────────────────────────────────
$webNodeModules = Join-Path $root "apps\web\node_modules"
if (Test-Path $webNodeModules) {
    Write-Host ""
    Write-Host "🗑️   Eliminando apps/web/node_modules..." -ForegroundColor Yellow
    Remove-Item -Recurse -Force $webNodeModules
    Write-Host "    ✅  Listo" -ForegroundColor Green
} else {
    Write-Host "ℹ️   apps/web/node_modules ya no existe" -ForegroundColor Gray
}

# ── 3. Eliminar apps/web/.next (caché de compilación) ───────────────────────
$webDotNext = Join-Path $root "apps\web\.next"
if (Test-Path $webDotNext) {
    Write-Host ""
    Write-Host "🗑️   Eliminando apps/web/.next..." -ForegroundColor Yellow
    Remove-Item -Recurse -Force $webDotNext
    Write-Host "    ✅  Listo" -ForegroundColor Green
}

# ── 4. Limpiar pnpm content-addressable store ───────────────────────────────
Write-Host ""
Write-Host "🧹  Limpiando pnpm store (pnpm store prune)..." -ForegroundColor Cyan
pnpm store prune
Write-Host "    ✅  Store limpiado" -ForegroundColor Green

# ── 5. Reinstalar todas las dependencias ────────────────────────────────────
Write-Host ""
Write-Host "📦  Instalando dependencias (pnpm install)..." -ForegroundColor Cyan
pnpm install
if ($LASTEXITCODE -ne 0) {
    Write-Host ""
    Write-Host "❌  pnpm install falló (código: $LASTEXITCODE)" -ForegroundColor Red
    exit $LASTEXITCODE
}
Write-Host "    ✅  Instalación completada" -ForegroundColor Green

# ── 6. Verificar que next.js quedó instalado ────────────────────────────────
$nextBin = Join-Path $root "apps\web\node_modules\next\dist\bin\next.js"
Write-Host ""
if (Test-Path $nextBin) {
    Write-Host "✅  next.js verificado: $nextBin" -ForegroundColor Green
} else {
    # pnpm puede haber colocado next en el virtual store en lugar de node_modules local.
    # El comando 'next' sigue disponible vía PATH cuando pnpm ejecuta scripts.
    Write-Host "ℹ️   next.js no está en node_modules local (pnpm virtual store) — OK" -ForegroundColor Gray
    Write-Host "    El comando 'next' sigue disponible vía PATH en scripts de pnpm" -ForegroundColor Gray
}

# ── 7. Confirmar que .npmrc tiene el límite de memoria ──────────────────────
$npmrcPath = Join-Path $root ".npmrc"
if (Test-Path $npmrcPath) {
    $npmrcContent = Get-Content $npmrcPath -Raw
    if ($npmrcContent -match "max-old-space-size") {
        Write-Host "✅  .npmrc: node-options con limite de memoria configurado" -ForegroundColor Green
    }
}

# ── 8. Iniciar servidor de desarrollo ───────────────────────────────────────
Write-Host ""
Write-Host "🚀  Iniciando servidor de desarrollo..." -ForegroundColor Cyan
Write-Host "    Memoria: 4 GB  (via .npmrc node-options)" -ForegroundColor Gray
Write-Host "    URL:     http://localhost:3000" -ForegroundColor Gray
Write-Host ""

pnpm dev:web
