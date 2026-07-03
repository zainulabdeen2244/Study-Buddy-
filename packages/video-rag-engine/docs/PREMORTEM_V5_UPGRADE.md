# FORGE Video RAG 100H - Premortem Pro v5 Upgrade

This version keeps the clean boundary:

- no embedded FORGE skills
- no `/skills` folder
- no `*.SKILL.md` files
- no Python implementation files
- TypeScript-only source

## Premortem findings fixed in v5

1. **Weak transcript-first coverage at 100+ hours**
   - Fix: `video.premortem`, `video.coverage`, and `video.reindexPlan` now identify transcript-first repairs before expensive visual passes.

2. **Temporal hallucination**
   - Fix: `video.search` creates an adaptive evidence bundle with timestamp windows, temporal neighbors, modality risks, and suggested next action.

3. **Partial answers presented as fully supported**
   - Fix: `video.ask` now uses evidence-bundle support score and downgrades answers when support is weak.

4. **Uncontrolled OCR/vision costs**
   - Fix: `video.reindexPlan` prioritizes transcript, OCR keyframes, vision keyframes, memory rebuild, and compaction.

5. **Memory gaps across clip/scene/video/collection levels**
   - Fix: `video.memoryMap` reports clip, scene, video summary, collection memory, and large temporal gaps.

6. **Production readiness claimed too early**
   - Fix: `video.premortem`, `video.manifest`, `video.report`, and `video.auditAnswer` expose enough evidence for FORGE to block or downgrade production mode.

## New FORGE actions

```text
video.search       -> adaptive evidence bundle before answer generation
video.premortem    -> predictable failure-mode report for the collection
video.reindexPlan  -> cost-aware repair plan before expensive reindexing
video.memoryMap    -> hierarchical memory coverage and gap report
```

## Recommended FORGE orchestration order

```text
video.plan
-> video.ingest
-> video.coverage
-> video.manifest
-> video.premortem
-> video.reindexPlan if needed
-> video.search before user-facing answer
-> video.ask
-> video.auditAnswer
-> video.report
```

## Production notes

The included JSON store is for development and portable demos. For real 100+ hour or multi-user deployments, keep the TypeScript adapter boundary and replace storage/vector retrieval with Postgres + pgvector, Qdrant, LanceDB, or another production vector store.
