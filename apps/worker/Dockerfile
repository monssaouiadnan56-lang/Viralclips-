FROM node:20-slim

# Install Python, yt-dlp and ffmpeg
RUN apt-get update && apt-get install -y \
    python3 \
    python3-pip \
    ffmpeg \
    && pip3 install yt-dlp --break-system-packages \
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/*

# Install pnpm
RUN npm install -g pnpm@9

WORKDIR /app

# Copy workspace manifests for dependency caching
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml* ./
COPY packages/shared/package.json packages/shared/
COPY apps/worker/package.json apps/worker/

# Install only worker and its workspace deps
RUN pnpm install --filter worker...

# Copy source
COPY packages/shared/ packages/shared/
COPY apps/worker/ apps/worker/

# Build
RUN pnpm --filter worker build

WORKDIR /app/apps/worker

EXPOSE 3001

ENV NODE_ENV=production

CMD ["node", "dist/index.js"]
