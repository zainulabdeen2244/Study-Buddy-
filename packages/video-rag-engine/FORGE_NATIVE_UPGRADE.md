# FORGE Native Upgrade

This version turns the video RAG package into a FORGE-native TypeScript tool.

## New production capabilities

- FORGE tool invocation contract with `ToolInvocation` and `ToolResult`.
- Permission-gate decisions before ingest/batch operations.
- Query planner that detects spoken, OCR, visual, timestamp, summary, and cross-video intent.
- Graph expansion over nearby evidence so answers can use temporal neighborhoods instead of isolated frames.
- Verifier pass that downgrades weak answers to `insufficient_evidence`.
- Batch ingest API for 100+ hour collections.
- Timeline API for FORGE workspace UI.
- UI presenter functions for answer/citation/timeline cards.
- Health checks for runtime readiness.

## Recommended FORGE wiring

Capability → Main Orchestrator → Permission Gate → `ForgeVideoRagAdapter.run()` → Tool Engine → Audit/Event trail → Cognition Observer.

The tool must not download remote media directly from UI buttons. FORGE should send a signed/approved invocation after policy review.
