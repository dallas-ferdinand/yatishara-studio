FROM node:22-bookworm-slim
RUN apt-get update \
  && DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends \
    ffmpeg ca-certificates fonts-dejavu-core fonts-liberation \
  && rm -rf /var/lib/apt/lists/* \
  && npm install -g tsx@4.20.5 \
  && ffmpeg -version \
  && ffprobe -version
WORKDIR /opt/yatishara-studio/services/studio-ffmpeg-worker
EXPOSE 8797
CMD ["node", "dist/server.mjs"]
