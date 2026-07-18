# Convex self-hosted backend with ffmpeg/ffprobe for Studio video export.
# Used by /opt/convex-studio-self-hosted on the VPS (see docs/deployment.md).
FROM ghcr.io/get-convex/convex-backend:latest

USER root
RUN apt-get update \
  && DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends \
    ffmpeg \
    ca-certificates \
  && rm -rf /var/lib/apt/lists/* \
  && ffmpeg -version \
  && ffprobe -version
