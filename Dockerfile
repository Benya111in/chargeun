FROM node:22-bookworm-slim

WORKDIR /app

RUN apt-get update \
  && apt-get install -y --no-install-recommends \
    ca-certificates \
    ffmpeg \
    python3 \
    python3-pip \
  && rm -rf /var/lib/apt/lists/*

RUN python3 -m pip install --break-system-packages yt-dlp

RUN corepack enable && corepack prepare pnpm@10.11.0 --activate

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./
COPY api ./api
COPY apps ./apps
COPY data ./data
COPY packages ./packages
COPY scripts ./scripts
COPY workers ./workers

RUN pnpm install --frozen-lockfile

EXPOSE 10000

CMD ["pnpm", "api:server"]
