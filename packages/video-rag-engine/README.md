# FORGE Video RAG 100H Tool - Production Proof v7

Clean TypeScript-only FORGE Video RAG capability for long-video understanding. This package is a FORGE tool, not a skill pack.

## Clean boundary

```text
No embedded skills
No /skills folder
No *.SKILL.md files
No Python implementation
TypeScript-only source
```

## v7 focus

v7 fixes the most dangerous production issue: **false readiness**.

The tool now has a strict production gate that blocks real media ingest when required providers are missing or fallbacks are being used where production evidence is required.

## Main actions

```text
video.providerStatus
video.productionGate
video.e2ePlan
video.ingestUrl
video.ingestFile
video.ingest
video.search
video.ask
video.auditAnswer
video.coverage
video.manifest
video.report
video.premortem
video.reindexPlan
video.memoryMap
video.spec
video.trace
```

## Provider setup

For real production ingest:

```bash
FORGE_VIDEO_RAG_REAL_PROVIDERS=true
FORGE_VIDEO_RAG_STRICT_PRODUCTION=true
FORGE_VIDEO_RAG_STORE=sqlite-cli
OPENAI_API_KEY=...
```

Recommended binaries:

```text
yt-dlp
ffmpeg
ffprobe
tesseract
sqlite3
```

Optional:

```text
whisper CLI
```

## Useful CLI commands

```bash
npm install
npm test

node dist/src/cli/index.js provider-status
node dist/src/cli/index.js production-gate --type youtube --uri https://youtu.be/... --collection demo
node dist/src/cli/index.js e2e-plan --collection demo
node dist/src/cli/index.js ingest --type synthetic --uri demo --duration 7200 --collection demo
node dist/src/cli/index.js ask --collection demo --q "What is this collection about?"
node dist/src/cli/index.js report --collection demo
```

## Production rule

This tool should not be called 100% production-complete until the E2E proof plan passes on real media and then passes the 10h, 30h, and 100h benchmark ladder.

