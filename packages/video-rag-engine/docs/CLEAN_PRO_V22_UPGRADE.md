# Clean Pro v2.2 Upgrade

This upgrade used the uploaded pro-source package as the architecture baseline, while keeping the corrected FORGE boundary:

- TypeScript source only.
- No embedded skills.
- No Python implementation.
- External FORGE skills call this package through the adapter.

## New capabilities

1. `CollectionManifest`
   - per-video evidence quality,
   - missing modalities,
   - source mix,
   - memory levels,
   - readiness classification,
   - reindex recommendations.

2. `AnswerSupportAudit`
   - verifies citation count,
   - checks important question terms inside cited excerpts,
   - detects missing transcript/visual support,
   - recommends accept, requery, follow-up, or ingest-more-evidence.

3. Real trace reads
   - tool invocations now write trace records,
   - `video.trace` returns actual records instead of a placeholder message.

4. Query plan surface
   - `video.queryPlan` makes retrieval intent visible to FORGE workspace/debug panels.

## Important boundary

Do not add `/skills`, `*.SKILL.md`, or Python implementation files to this repo. Skills are installed separately by FORGE.
