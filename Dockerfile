# NearEdit — server + no-build frontend in one image.
# Transcription, vision and LLM providers are optional and run elsewhere
# (see docs/app-spec/INTELLIGENCE.md); this image needs only FFmpeg.
FROM node:22-bookworm-slim

RUN apt-get update \
  && apt-get install -y --no-install-recommends \
    ffmpeg fontconfig fonts-dejavu-core fonts-liberation ca-certificates \
  && rm -rf /var/lib/apt/lists/*

# Optional: web clips record real web pages with chrome-headless-shell.
#   docker build --build-arg WEB_CAPTURE=1 -t nearedit .
# adds that browser and the libraries it needs (roughly 500 MB more).
ARG WEB_CAPTURE=0
RUN if [ "$WEB_CAPTURE" = "1" ]; then \
      apt-get update \
      && apt-get install -y --no-install-recommends \
        libasound2 libatk-bridge2.0-0 libatk1.0-0 libatspi2.0-0 libcairo2 libcups2 \
        libdbus-1-3 libexpat1 libgbm1 libglib2.0-0 libnspr4 libnss3 libpango-1.0-0 \
        libudev1 libx11-6 libxcb1 libxcomposite1 libxdamage1 libxext6 libxfixes3 \
        libxkbcommon0 libxrandr2 \
      && rm -rf /var/lib/apt/lists/*; \
    fi

WORKDIR /app

# Dependencies first so source changes do not invalidate this layer.
# postinstall (scripts/setup.js) vendors hybrids and builds the icon sprite.
COPY package.json package-lock.json ./
COPY scripts ./scripts
RUN npm ci --omit=dev && npm cache clean --force

COPY . .

# The browser goes into the image, not into /data (a volume would hide it).
# Chrome's own sandbox does not work under Docker's default seccomp profile,
# so recordings rely on the container for isolation; the address filter of
# docs/app-spec/WEBCLIP.md still applies.
RUN if [ "$WEB_CAPTURE" = "1" ]; then \
      NEAREDIT_DATA_DIR=/opt/nearedit WEB_CAPTURE_NO_SANDBOX=1 node scripts/install-browser.js \
      && ln -s "$(find /opt/nearedit/browsers -type f -name chrome-headless-shell | head -n 1)" \
        /usr/local/bin/chrome-headless-shell; \
    fi

# /data: project registry, renders and caches.  /media: your footage.
ENV PORT=6556 \
    NEAREDIT_DATA_DIR=/data \
    BROWSE_ROOTS=/media \
    WEB_CAPTURE_BROWSER=/usr/local/bin/chrome-headless-shell \
    WEB_CAPTURE_NO_SANDBOX=1
RUN mkdir -p /data /media && chown node:node /data
VOLUME ["/data", "/media"]
EXPOSE 6556

USER node
CMD ["node", "--env-file-if-exists=.env", "src/server.js"]
