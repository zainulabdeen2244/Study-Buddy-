# Architecture

FORGE request -> Permission Gate -> ForgeVideoRagTool -> LongVideoRagToolEngine -> Providers -> Store/Index -> Retrieval -> Verifier -> timestamp-cited answer.

## 100+ hour design

1. Ingest videos as jobs.
2. Extract transcript first.
3. Extract OCR/keyframes only within cost budget.
4. Embed transcript/OCR/frame captions.
5. Store evidence, vectors, and hierarchical memory.
6. Search hybrid semantic + keyword + timestamp.
7. Compose answer only from citations.
8. Mark weak answers as insufficient evidence.

## Why TypeScript

FORGE is primarily a web/workspace/orchestrator system. A TypeScript tool lets FORGE use the same runtime contracts for UI, API, tool registry, governance, and worker jobs.
