# FORGE Clean TypeScript Upgrade

This version corrects the package boundary:

- This repository is a TypeScript tool/capability.
- It does not contain any embedded FORGE skills.
- It does not contain Python implementation files.
- External FORGE skills should be installed separately and may invoke this capability through the FORGE tool adapter.

## Added TypeScript Capabilities

- `src/spec/specEngine.ts` - locked spec bundle generator.
- `src/spec/traceability.ts` - spec-to-evidence release gate.
- `src/reports/coverage.ts` - transcript/OCR/frame/memory coverage report.
- `src/observability/trace.ts` - lightweight JSONL trace recorder.

## Actions

- `video.spec`
- `video.coverage`
- `video.report`
- `video.trace`

These actions are tool capabilities, not skill files.
