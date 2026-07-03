# Research and Design Notes

The upgraded FORGE tool follows the current long-video RAG direction:

- Long-video systems need auxiliary evidence such as ASR/audio, OCR/on-screen text, visual/object/keyframe information, and retrieval rather than feeding entire videos into an LLM.
- Newer research emphasizes structured spatio-temporal retrieval, intent-aware query planning, graph/multi-hop retrieval, adaptive retrieval granularity, and verification.
- Open-source examples show practical approaches for YouTube transcript RAG, multimodal video QA, video RAG, and vector stores such as Qdrant/LanceDB/pgvector.

Implementation choices in this package:

- Query planning: classify the question before retrieval.
- Hybrid retrieval: combine embeddings, lexical overlap, modality boosts, and timestamp hints.
- Graph expansion: pull nearby evidence from the same video/time window.
- Verifier: downgrade unsupported answers instead of pretending certainty.
- FORGE contract: every action goes through a typed invocation/result shape with audit events.

Production provider recommendations:

- ASR/transcript: YouTube Transcript API where available, Whisper/WhisperX for local media.
- OCR: PaddleOCR, Tesseract, or cloud OCR when policy permits.
- Visual captions: provider-routed vision model through FORGE.
- Vector DB: Qdrant, LanceDB, pgvector, or another FORGE-approved vector backend.
- Long-running jobs: FORGE worker queue with checkpointing and retries.
