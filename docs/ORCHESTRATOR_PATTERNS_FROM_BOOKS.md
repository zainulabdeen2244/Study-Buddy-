# Study-Buddy Orchestrator Patterns

These rules come from the local books review in `C:\Users\Zain Ul Abdeen\Desktop\books`, especially the sections on coherent AI stacks, human checkpoints, model orchestration, MLOps/evaluation, prompt workflow tools, and guardrails.

## Product Rules

1. Keep a small coherent tool stack.
   Study-Buddy should route to the minimum useful workflow: clinical VideoRAG, biomedical research, public article search, GitHub search, external video notes, or artifact studio.

2. Route before retrieve.
   Every answer starts with intent classification. Retrieval tools are selected only after the route is known.

3. Respect evidence ownership.
   Clinical demo evidence can answer only ingested clinical/demo questions. External YouTube/live videos require their own transcript or ingest record. Biomedical research uses PubMed-style literature search, not clinical skill transcripts.

4. Move information, not authority.
   Agents may draft, search, summarize, and create artifacts. High-risk medical advice, unsupported video notes, and hidden source reuse must fail closed.

5. Make handoffs explicit.
   RequestOrchestrator owns planning, route agents own retrieval/search, SafetyReviewer owns safety boundaries, ArtifactStudio owns files, and the UI shows only safe workflow summaries.

6. Evaluate the failures users actually hit.
   Regression tests must cover hallucination boundaries: AGI/GitHub research, biomedical research, external video notes, and real clinical VideoRAG.

7. Observe without leaking internals.
   Raw traces stay in logs/diagnostics. The chat shows concise workflow status and artifacts, not internal prompts, secrets, raw JSON audits, or chain-of-thought.

## Applied In Code

- `external_video_notes` intent separates YouTube/live notes from clinical VideoRAG.
- PubMed search handles biomedical research prompts such as cancer diagnosis.
- GitHub search explains repositories instead of only listing links.
- Artifact creation uses the latest answer as source text instead of copying the user prompt as the document body.
- UI skills expose user-tunable workflows while keeping trace internals out of the chat.
