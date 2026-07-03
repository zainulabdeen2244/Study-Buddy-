# FORGE Video RAG Production Proof v7 Upgrade

v7 fixes the biggest remaining gap from v6: **the tool can no longer silently look production-ready while required real providers are missing**.

## Boundary kept

- No embedded FORGE skills
- No `/skills` folder
- No `*.SKILL.md` files
- No Python implementation files
- TypeScript-only FORGE capability/tool source

## What v7 adds

### 1. Strict production gate

New action:

```text
video.productionGate
```

The gate checks the source and requested ingest options, then requires the exact providers needed for that run:

- YouTube/remote source: download provider
- Local/remote media: ffprobe media probe
- Any real media: ffmpeg frame extraction
- Transcript enabled: transcription provider
- OCR enabled: OCR provider
- Vision enabled: vision caption provider
- Every real production ingest: embedding provider, store, vector search

If `FORGE_VIDEO_RAG_REAL_PROVIDERS=true` and strict mode is enabled, missing providers block ingest before any expensive or misleading work begins.

### 2. Placeholder/fallback blocking

Fallback providers remain available for deterministic tests and synthetic demos, but v7 blocks them from passing strict real-media production mode.

Blocked examples:

```text
hash embeddings in production
json store for 100h production mode
missing ffmpeg/ffprobe
tesseract missing when OCR is requested
OpenAI/Whisper missing when transcript is requested
```

### 3. SQLite CLI metadata store option

New source:

```text
src/storage/sqlite/sqliteVideoRagStore.ts
```

Enable it with:

```bash
FORGE_VIDEO_RAG_STORE=sqlite-cli
```

This gives FORGE a real metadata persistence path without adding native npm dependencies. JSON remains default for tests and demos.

### 4. E2E proof plan

New action:

```text
video.e2ePlan
```

New CLI:

```bash
forge-video-rag e2e-plan --collection demo
```

It outputs the exact proof ladder required before claiming production completion:

1. provider-status
2. YouTube smoke ingest
3. local MP4 smoke ingest
4. grounded answer check
5. readiness report

### 5. Provider status improved

`video.providerStatus` now reports:

- storage mode
- strict production gate mode
- production blockers
- configured capabilities
- missing capabilities
- next actions

### 6. Safer real ingest behavior

Real media ingest now fails if no real evidence is extracted. It does not create an indexed video with zero useful evidence and pretend success.

### 7. More tests

v7 adds tests proving:

- production gate blocks real ingest when providers are missing
- synthetic mode still works for local tests
- FORGE exposes production gate and E2E proof plan actions
- package remains clean with no embedded skills or Python implementation

## Production status after v7

v7 is stronger than v6 because it actively prevents false readiness claims. It still must be tested on real 1h, 10h, 30h, and 100h video collections before anyone calls the system fully production-proven.
