# Study-Buddy v6 Verification Report

## Premortem Decision

The workshop build would fail if it tried to be a hospital platform, a generic document studio, or an overloaded dashboard. v6 keeps a smaller set of fully working features: golden demo, transcript/SOP ingest, timestamped answer, OSCE, quiz, safety gate, and five artifact skills.

## Artifact Skills Extracted

1. PDF Study Pack
2. DOCX Clinical Notes
3. PowerPoint OSCE Deck
4. Learning Summary Chart
5. Complete Study-Pack Bundle

Each artifact writes a manifest, checksum, trace, premortem entry, and release scorecard.

## Verification Commands

```bash
npm run build
npm test
PORT=7896 npm start
curl http://127.0.0.1:7896/api/status
curl http://127.0.0.1:7896/api/artifact-skills
curl -X POST http://127.0.0.1:7896/api/demo/load -H 'content-type: application/json' -d '{}'
curl -X POST http://127.0.0.1:7896/api/ask -H 'content-type: application/json' -d '{"question":"Where does the instructor explain hand hygiene?"}'
curl -X POST http://127.0.0.1:7896/api/artifacts/create -H 'content-type: application/json' -d '{"kind":"study-pack","title":"Demo Study Pack","prompt":"Create study pack","sourceText":"Hand hygiene evidence OSCE quiz safety revision"}'
```

## Results

- TypeScript build: passed.
- Node test suite: 9/9 passed.
- /api/status: returned version 6.0.0-workshop-focused.
- /api/artifact-skills: returned five core artifact skills.
- /api/demo/load: loaded golden demo.
- /api/ask: returned timestamped hand hygiene evidence and safety audit.
- /api/artifacts/create with study-pack: created downloadable zip bundle with checksum.

## Honest Remaining Boundary

Golden demo, transcript/SOP ingest, answer generation, artifact generation, and safety blocks work locally without API keys. Real arbitrary video ingestion still requires production providers such as ffmpeg, ffprobe, yt-dlp, transcription, OCR, embeddings, and LLM providers. The production gate reports this instead of pretending readiness.
