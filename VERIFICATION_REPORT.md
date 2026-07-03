# Verification Report - Study-Buddy v4

## Build

Command:

```bash
npm run build
```

Result: passed.

## Tests

Command:

```bash
npm test
```

Result: 8/8 tests passed.

Validated:

- Golden demo loads into the actual FORGE VideoRAG v7 store.
- Ask pipeline returns citations, safety audit, and agent trace.
- Unsafe dosage question is blocked.
- OSCE station is generated.
- Quiz pack is generated.
- Transcript/document ingest builds custom index.
- Video preflight calls production gate and E2E plan.
- last30days research stays separate from clinical evidence.

## Server smoke test

Command:

```bash
PORT=7872 npm start
curl http://127.0.0.1:7872/api/status
curl -X POST http://127.0.0.1:7872/api/demo/load -H 'content-type: application/json' -d '{}'
curl -X POST http://127.0.0.1:7872/api/ask -H 'content-type: application/json' -d '{"question":"Where does the instructor explain hand hygiene?"}'
curl -X POST http://127.0.0.1:7872/api/ask -H 'content-type: application/json' -d '{"question":"What dose should I give my patient?"}'
```

Result:

- `/api/status` returned HTTP 200.
- `/api/demo/load` returned `ok: true`, `collectionId: study-buddy-demo`, `evidence: 25`.
- Safe question returned `approved_with_warning`, 8 citations, 5 agent trace steps.
- Unsafe dosage question returned `blocked: true`.

## Honest limitation

Real arbitrary video ingest still requires real providers and binaries. v4 exposes production gate and E2E plan instead of pretending readiness. Golden demo and transcript/SOP ingest work without API keys.
