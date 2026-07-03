# Complete TypeScript Source Map - FORGE Video RAG Production Proof v7

This package is a clean TypeScript FORGE tool. Skills are intentionally not embedded.

## Core
- `src/core/engine.ts` - main Video RAG engine
- `src/core/config.ts` - environment/config loader, production gate flags, storage mode
- `src/core/types.ts` - public contracts and action types
- `src/core/permissions.ts` - FORGE permission gate decision rules
- `src/core/toolContract.ts` - invocation wrapper and audit event collection
- `src/core/safeSpawn.ts` - safe args-array command execution
- `src/core/safety.ts` - source validation

## Providers
- `src/providers/download.ts` - yt-dlp downloader
- `src/providers/media.ts` - ffprobe and ffmpeg frame extraction
- `src/providers/transcription.ts` - OpenAI transcription and external Whisper CLI
- `src/providers/transcript.ts` - transcript provider selection
- `src/providers/ocr.ts` / `src/providers/ocrReal.ts` - OCR provider and Tesseract CLI
- `src/providers/vision.ts` - OpenAI vision captioning
- `src/providers/embeddings.ts` - OpenAI embeddings and deterministic fallback
- `src/providers/llm.ts` - grounded OpenAI answer provider
- `src/providers/providerRegistry.ts` - readiness and blocker reporting

## Storage
- `src/storage/jsonStore.ts` - deterministic JSON store for tests/demos
- `src/storage/sqlite/sqliteVideoRagStore.ts` - SQLite CLI VideoRagStore implementation
- `src/storage/sqlite/sqliteCliStore.ts` - SQLite schema utility
- `src/storage/vector/localVectorStore.ts` - local vector search adapter
- `src/storage/sqlSchemas.ts` - SQLite/Postgres schemas

## Retrieval and reports
- `src/retrieval/*` - query planning, hybrid search, evidence bundles, support audit, memory, timeline, verifier
- `src/reports/*` - coverage, manifest, premortem, reindex plan, memory map

## Production proof
- `src/ops/productionGate.ts` - strict production provider gate
- `src/ops/e2ePlan.ts` - E2E proof ladder before production claims
- `src/ops/health.ts` - health report

## FORGE surfaces
- `src/tool/forgeTool.ts` - FORGE action dispatcher
- `src/forge/adapter.ts` - FORGE adapter
- `src/forge/capabilityRegistry.ts` - capability registry
- `src/api/server.ts` - HTTP API
- `src/cli/index.ts` - CLI
- `src/workers/worker.ts` - worker entrypoint

## Tests
- `tests/productionV7.test.ts` - production gate, e2e plan, clean-boundary tests
- existing v3-v6 tests remain active

## Verification result

```text
npm test
24 tests passed
0 failed
```
