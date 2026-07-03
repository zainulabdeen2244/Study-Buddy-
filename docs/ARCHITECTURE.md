# Architecture

```text
Browser UI
  -> Study-Buddy API
  -> Premortem Ledger
  -> Router + Medical Safety Classifier
  -> ForgeVideoRagTool.invoke(...)
  -> LongVideoRagToolEngine
  -> Evidence Bundle + Answer Support Audit
  -> Study-Buddy Learning Generators
  -> Safety Gate
  -> Ops Proof Panels
```

## Core rule

No clinical answer is shown without:

1. routing,
2. VideoRAG evidence search,
3. answer support audit,
4. medical safety review,
5. safety note,
6. visible operation trace.

## Why TypeScript

The uploaded FORGE VideoRAG v7 tool is TypeScript, production-gated, and FORGE-native. Study-Buddy v4 keeps that spine intact instead of translating it into a weaker Python-only scaffold.

## Python / Gradio

Gradio is optional for workshops. It wraps the Node API and does not replace the production backend.
