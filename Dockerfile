# trueroi engine image
#
# Bundles the three processing engines used by the ad-editing pipeline:
#   - ffmpeg    : audio/video extraction, transcoding, cutting
#   - WhisperX  : speech-to-text with word-level timestamps (silence/filler-word cuts)
#   - HyperFrames: HTML/CSS/animation -> deterministic MP4 motion graphics
#
# Base image ships CUDA 12.8 + cuDNN so WhisperX can use GPU acceleration when the
# container is run with `--gpus all` (see docker-compose.yml). Everything also works
# on CPU-only hosts, just slower for transcription.
FROM nvidia/cuda:12.8.1-cudnn-devel-ubuntu22.04

ENV DEBIAN_FRONTEND=noninteractive \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1

# --- System packages ---------------------------------------------------------
# ffmpeg          : engine #2, and a build/runtime dependency of the other two
# build-essential : native extensions for python/npm packages
# git, curl, ca-certificates : fetching sources/packages
# python3/pip     : WhisperX runtime
# lib*/fonts-*    : headless Chrome (Puppeteer) runtime deps for HyperFrames rendering
RUN apt-get update && apt-get install -y --no-install-recommends \
      ffmpeg \
      git \
      curl \
      ca-certificates \
      gnupg \
      build-essential \
      python3 \
      python3-pip \
      python3-venv \
      libnss3 \
      libatk1.0-0 \
      libatk-bridge2.0-0 \
      libcups2 \
      libdrm2 \
      libxkbcommon0 \
      libxcomposite1 \
      libxdamage1 \
      libxfixes3 \
      libxrandr2 \
      libgbm1 \
      libasound2 \
      libpango-1.0-0 \
      libpangocairo-1.0-0 \
      fonts-liberation \
    && rm -rf /var/lib/apt/lists/*

# --- Rust ---------------------------------------------------------------------
# Some WhisperX dependencies (tokenizers) build native extensions via Rust.
RUN curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y
ENV PATH="/root/.cargo/bin:${PATH}"

# --- Node.js 22 + Bun -----------------------------------------------------
# HyperFrames requires Node.js >= 22; upstream tooling assumes Bun is available.
RUN curl -fsSL https://deb.nodesource.com/setup_22.x | bash - \
    && apt-get install -y --no-install-recommends nodejs \
    && rm -rf /var/lib/apt/lists/*
RUN curl -fsSL https://bun.sh/install | bash
ENV PATH="/root/.bun/bin:${PATH}"

WORKDIR /app

# --- Engine: WhisperX -----------------------------------------------------
RUN pip3 install --no-cache-dir whisperx

# --- Engine: HyperFrames ----------------------------------------------------
# Installed globally so the `hyperframes` CLI is on PATH. `npm install` runs
# Puppeteer's postinstall, which downloads the headless Chrome build used for
# frame capture (the lib*/fonts-* packages above are its runtime dependencies).
RUN npm install -g hyperframes

# Working directories for the pipeline: raw footage in, rendered ads out.
RUN mkdir -p /app/footage /app/output

CMD ["/bin/bash"]
