# Study-Buddy AI

Study-Buddy AI is a TypeScript learning workspace for supervised study, OSCE practice, transcript/SOP revision, timestamped VideoRAG answers, quizzes, flashcards, revision plans, and exportable study artifacts.

It is not a doctor, diagnosis tool, prescription tool, emergency tool, or independent clinical procedure assistant. It is designed for education-only use with uploaded or demo learning material.

## What You Get

- Browser workspace with chat, answer, artifact, evidence, ingest, and proof panels.
- FORGE VideoRAG v7 engine under `packages/video-rag-engine`.
- Golden IV cannulation demo with transcript, SOP, OCR/frame evidence, and test questions.
- Transcript/SOP ingest for custom local learning collections.
- Medical safety gate for diagnosis, dosage, treatment, emergency, and unsupervised procedure requests.
- Deterministic artifact generation for PDF, DOCX, PPTX, SVG chart, and study-pack bundle.
- Provider status, production gate, coverage, manifest, memory map, reindex plan, and premortem proof endpoints.
- Optional LLM polishing through OpenAI or any OpenAI-compatible provider.

## Requirements

Install these first:

| Tool | Required | Notes |
| --- | --- | --- |
| Node.js 20 or newer | Yes | Includes `npm`. Download from `https://nodejs.org/`. |
| Git | Recommended | Useful for cloning, versioning, and sharing the project. |
| ffmpeg / ffprobe | Optional | Needed for real local video processing beyond transcript/SOP ingest. |
| yt-dlp | Optional | Needed for YouTube subtitle/video workflows. |
| API key for an LLM provider | Optional | The app runs in deterministic mode without keys. |

## Quick Start

From this folder:

```bash
npm install
npm run build
npm start
```

Open:

```text
http://localhost:7860
```

If PowerShell blocks `npm`, use:

```powershell
npm.cmd install
npm.cmd run build
npm.cmd start
```

## Run Tests

```bash
npm test
```

The test suite builds the TypeScript project and runs Node's built-in test runner against `dist/tests/*.test.js`.

## Demo Flow

1. Start the server with `npm start`.
2. Open `http://localhost:7860`.
3. Ask: `What can Study-Buddy help me do today?`
4. Load the demo from the UI, or call `POST /api/demo/load`.
5. Ask: `Where does the instructor explain hand hygiene?`
6. Ask: `Generate an OSCE station from this video and SOP.`
7. Create a PDF, DOCX, PPTX, chart, or complete study-pack artifact.
8. Check the Evidence and Proof panels for citations, safety audit, provider status, and production readiness.

## Environment Setup

Create a `.env` file in the project root only if you want optional LLM behavior or custom provider settings.

OpenAI example:

```bash
STUDY_BUDDY_USE_LLM=true
STUDY_BUDDY_LLM_PROVIDER=openai
STUDY_BUDDY_LLM_MODEL=gpt-4.1-mini
OPENAI_API_KEY=your_key_here
```

OpenAI-compatible provider example:

```bash
STUDY_BUDDY_USE_LLM=true
STUDY_BUDDY_LLM_BASE_URL=https://your-provider.example/v1
STUDY_BUDDY_LLM_API_KEY=your_key_here
STUDY_BUDDY_LLM_MODEL=your-model-name
```

Useful runtime options:

```bash
PORT=7860
STUDY_BUDDY_DEFAULT_COLLECTION=study-buddy-demo
FORGE_VIDEO_RAG_STORE=json
FORGE_VIDEO_RAG_REAL_PROVIDERS=false
```

## Commands

| Command | What It Does |
| --- | --- |
| `npm install` | Installs TypeScript and project dependencies. |
| `npm run build` | Compiles TypeScript into `dist/`. |
| `npm start` | Runs the compiled API and static web app. |
| `npm run dev` | Builds, then starts the app. |
| `npm test` | Builds and runs all tests. |
| `npm run smoke` | Runs the smoke demo script. |
| `npm run provider:status` | Prints provider/dashboard status. |

## Project Structure

```text
study-buddy/
  apps/api/                  Node API, orchestrator, safety, artifacts, memory
  apps/web/static/           Browser workspace UI
  data/demo/iv_cannulation/  Golden demo data
  docs/                      Architecture, deployment, memory, and scope docs
  packages/video-rag-engine/ FORGE VideoRAG engine
  resources/                 Imported skills and research helpers
  scripts/                   Smoke and provider-status scripts
  tests/                     Node test suite
```

## Main API Endpoints

| Endpoint | Purpose |
| --- | --- |
| `GET /api/status` | App status, routes, provider status, production gate. |
| `POST /api/demo/load` | Loads the golden IV cannulation demo. |
| `POST /api/ask` | Main Study-Buddy question endpoint. |
| `POST /api/osce` | OSCE generation helper. |
| `POST /api/quiz` | Quiz and flashcard generation helper. |
| `POST /api/revision` | Revision-plan helper. |
| `POST /api/ingest/text` | Ingest transcript and document/SOP text. |
| `POST /api/ingest/video-plan` | Preflight real video ingest. |
| `POST /api/artifacts/create` | Create PDF, DOCX, PPTX, chart, or study pack. |
| `GET /api/artifacts` | List generated artifacts. |
| `GET /generated/:file` | Download a generated artifact. |
| `GET /api/dashboard` | Collection dashboard. |
| `GET /api/provider-status` | Provider configuration status. |
| `GET /api/production-gate` | Production readiness checks. |

## Real Video and YouTube Setup

The golden demo and transcript/SOP ingest work without ffmpeg, yt-dlp, OCR, or paid providers.

For real MP4/YouTube workflows, install and configure:

- `ffmpeg` and `ffprobe` for media processing.
- `yt-dlp` for YouTube subtitle/video access.
- Transcription, OCR/vision, embedding, and LLM providers as needed.

Study-Buddy intentionally fails closed when production providers are missing. Use `/api/production-gate` before presenting real media ingest as production-ready.

## Safety Boundary

Study-Buddy allows education-only explanations, timestamped evidence review, OSCE generation, quizzes, flashcards, revision plans, and learning artifacts.

Study-Buddy blocks or redirects:

- Patient-specific diagnosis.
- Medication dosage or prescriptions.
- Treatment decisions.
- Emergency medical advice.
- Independent clinical-procedure guidance.

## Packaging Without `node_modules`

To share the project, zip the source folder without `node_modules`, `.data`, and generated artifacts. The recipient should run:

```bash
npm install
npm run build
npm start
```

This keeps the package small and lets dependencies install cleanly for the target machine.
