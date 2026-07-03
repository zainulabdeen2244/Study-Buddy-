# FORGE Video RAG Production Engine v6 Upgrade

## Summary

This release upgrades the clean TypeScript FORGE Video RAG tool from a high-quality architecture scaffold into a provider-ready production engine.

## Boundaries preserved

- No embedded skills.
- No `/skills` folder.
- No `*.SKILL.md` files.
- No Python implementation.
- FORGE skills remain installed separately.
- This package remains a clean TypeScript FORGE capability/tool.

## New production provider layer

Added real provider adapters:

```text
src/providers/download.ts          yt-dlp downloader
src/providers/media.ts             ffprobe metadata + ffmpeg frame extraction
src/providers/transcription.ts     OpenAI STT + external Whisper CLI
src/providers/ocrReal.ts           Tesseract CLI OCR
src/providers/vision.ts            OpenAI vision captioning
src/providers/llm.ts               OpenAI grounded answer generation
src/providers/embeddings.ts        OpenAI embeddings adapter
```

Added safety/runtime foundation:

```text
src/core/safeSpawn.ts              args-array command runner
src/security/pathPolicy.ts         workspace path guard
src/security/remoteUrlPolicy.ts    SSRF/allowlist URL guard
src/security/commandPolicy.ts      command allowlist/risk classifier
```

Added storage migration path:

```text
src/storage/vector/localVectorStore.ts
src/storage/sqlite/sqliteCliStore.ts
```

## New actions

```text
video.providerStatus
video.ingestUrl
video.ingestFile
```

## Provider truthfulness

`video.providerStatus` reports:

```text
production_capable
partially_configured
scaffold_only
```

It checks real availability for:

```text
yt-dlp
ffprobe
ffmpeg
OpenAI/Whisper transcription
Tesseract OCR
OpenAI vision captions
OpenAI embeddings
OpenAI grounded answers
store/vector readiness
```

## Verification

```text
npm test
20 tests passed
0 failed
```
