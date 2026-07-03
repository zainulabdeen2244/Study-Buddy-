# Production Engine v6 Upgrade

v6 upgrades FORGE Video RAG from architecture scaffold to provider-ready TypeScript tool.

## Premortem fixes implemented

| v5 limitation | v6 fix |
|---|---|
| Synthetic transcript only | OpenAI transcription and external Whisper CLI providers |
| Placeholder OCR | Tesseract CLI OCR over extracted frames |
| Vision placeholder | OpenAI vision caption adapter |
| Hash-only embeddings | OpenAI embedding adapter with hash fallback |
| No real video download | yt-dlp downloader adapter |
| No real frame extraction | ffmpeg frame extractor and ffprobe probe |
| Fake readiness risk | providerStatus action and readiness gate |
| Raw command risk | safeSpawn args-array runner with timeout/output cap |
| JSON-only future concern | SQLite CLI schema adapter and local vector store migration path |

## Activation

```bash
FORGE_VIDEO_RAG_REAL_PROVIDERS=true
OPENAI_API_KEY=...
FORGE_VIDEO_RAG_USE_OPENAI_ANSWER=true
```

Optional binaries:

```text
yt-dlp
ffmpeg
ffprobe
tesseract
whisper
sqlite3
```

## FORGE runtime rule

Before production ingest, FORGE should call:

```text
video.providerStatus
video.premortem
video.reindexPlan
```

Then it may call `video.ingestUrl` or `video.ingestFile` only after the permission gate approves real media ingest.
