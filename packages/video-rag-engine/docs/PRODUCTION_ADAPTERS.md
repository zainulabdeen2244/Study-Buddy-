# Production Adapters

This package intentionally ships with safe default local providers. Add these adapters for full production quality:

- SQLite adapter: use `better-sqlite3` and `src/storage/sqlSchemas.ts`.
- Postgres+pgvector adapter: use `POSTGRES_PGVECTOR_SCHEMA`.
- Vector DB adapter: Qdrant/LanceDB/Weaviate.
- ASR adapter: Whisper or provider ASR.
- OCR adapter: Tesseract.js, PaddleOCR service, or cloud OCR.
- Frame adapter: ffmpeg scene-change keyframes.
- Vision captioner: OpenAI/NVIDIA/Gemini/Claude vision provider routed by FORGE provider router.

Never let this tool download arbitrary URLs directly. Remote ingestion must stay behind FORGE approvals and URL allowlists.
