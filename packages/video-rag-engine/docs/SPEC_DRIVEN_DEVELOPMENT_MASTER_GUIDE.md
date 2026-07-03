# FORGE Spec-Driven Development Master Guide

## The core idea

Spec-Driven Development means the specification is the source of truth and code is the implementation artifact.

FORGE should never build high-level software directly from a vague prompt. It should first convert the prompt into a strict spec system:

```text
SPEC_LOCK.md
requirements.md
design.md
tasks.md
do-not-build.md
unchanged-behavior.md
acceptance-matrix.md
traceability-map.json
verification-plan.md
```

## How to write high-level specs

A strong FORGE spec has five properties:

1. It is explicit about what to build.
2. It is explicit about what not to build.
3. It describes how the system will be built.
4. It breaks implementation into small tasks.
5. It defines evidence required to prove completion.

## Feature specs

Use three main files:

```text
requirements.md - what must happen
design.md - how it will be built
tasks.md - implementation order
```

Plus boundary and proof files:

```text
do-not-build.md
unchanged-behavior.md
acceptance-matrix.md
traceability-map.json
verification-plan.md
```

## Bugfix specs

Use one focused file:

```text
bugfix-<slug>.md
```

It must include current behavior, expected behavior, reproduction steps, allowed files, forbidden files, unchanged behavior, verification, and rollback plan.

## FORGE law

```text
No serious build without SPEC_LOCK.
No implementation without tasks.
No completion without verification evidence.
No bugfix without unchanged behavior.
No release without traceability.
```
