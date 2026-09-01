# trueroi

Editing pipeline for turning raw recorded footage into short vertical (9:16)
Facebook ads for window and door contractors.

## Engines

This repo installs three processing engines into a single Docker image:

| Engine | Role |
|---|---|
| [ffmpeg](https://github.com/ffmpeg/ffmpeg) | Extracts/transcodes audio & video, cuts clips |
| [WhisperX](https://github.com/m-bain/whisperX) | Transcribes with word-level timestamps, used to auto-cut filler words and dead air |
| [HyperFrames](https://github.com/heygen-com/hyperframes) | Renders HTML/CSS/animation motion graphics to MP4 |

No app code is wired up yet — this just gets the three engines installed and
runnable together. The pipeline logic (extract → transcribe → cut → overlay
motion graphics) comes next.

## Setup

Requires [Docker](https://docs.docker.com/get-docker/). For GPU-accelerated
WhisperX transcription, also install the
[NVIDIA Container Toolkit](https://docs.nvidia.com/datacenter/cloud-native/container-toolkit/latest/install-guide.html)
on the host; CPU-only works too (just slower), remove the `deploy:` block in
`docker-compose.yml` in that case.

```bash
cp .env.example .env   # fill in HF_TOKEN if you need WhisperX diarization
docker compose build
docker compose up -d
docker compose exec engines bash
```

Inside the container:

```bash
ffmpeg -version
whisperx --help
hyperframes --help
```

Drop raw recordings in `./footage` (mounted at `/app/footage` in the
container) and write rendered output to `./output` (`/app/output`).
