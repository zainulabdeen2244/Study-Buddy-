# Cognition Memory Layer

Study-Buddy now includes a TypeScript-native cognition layer inspired by `C:\Users\Zain Ul Abdeen\Desktop\cognition` and the local books on second-brain workflows.

## What It Stores

- Episodic memory: recent user and assistant turns per chat session.
- Semantic memory: a rolling session summary that preserves the current topic and last user request.
- Procedural memory: workflow counters for which route/skill succeeded in a session.

## What It Retrieves

- Recent turns for continuity.
- Relevant turns using keyword/tag matching.
- Session summary for general help and follow-up questions.

## Safety Boundary

Conversation memory is not clinical evidence. It can help Study-Buddy understand follow-up wording such as "what did I ask before?" or "make a document from that", but clinical claims still require VideoRAG evidence, biomedical claims require research sources, and YouTube notes require captions/transcript.

## Runtime Surface

- Memory is persisted at `.data/study-buddy/cognition/conversation-memory.json`.
- `GET /api/conversation-memory?sessionId=...` returns memory stats.
- `ConversationMemoryAgent` appears in the safe workflow trace when context is recalled.
