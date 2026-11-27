# NearEdit — server + no-build frontend in one image.
# Transcription, vision and LLM providers are optional and run elsewhere
# (see docs/app-spec/INTELLIGENCE.md); this image needs only FFmpeg.
FROM node:22-bookworm-slim

RUN apt-get update \
  && apt-get install -y --no-install-recommends \
    ffmpeg fontconfig fonts-dejavu-core fonts-liberation ca-certificates \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Dependencies first so source changes do not invalidate this layer.
# postinstall (scripts/setup.js) vendors hybrids and builds the icon sprite.
COPY package.json package-lock.json ./
COPY scripts ./scripts
RUN npm ci --omit=dev && npm cache clean --force

COPY . .

# /data: project registry, renders and caches.  /media: your footage.
ENV PORT=6556 \
    NEAREDIT_DATA_DIR=/data \
    BROWSE_ROOTS=/media
RUN mkdir -p /data /media && chown node:node /data
VOLUME ["/data", "/media"]
EXPOSE 6556

USER node
CMD ["node", "--env-file-if-exists=.env", "src/server.js"]
