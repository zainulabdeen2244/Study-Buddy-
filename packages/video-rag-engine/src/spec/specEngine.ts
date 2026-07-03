import { id, nowIso, sha256 } from "../core/utils.js";

export type SpecMode = "feature" | "bugfix" | "research" | "integration";
export type RequirementPriority = "must" | "should" | "could";

export interface RequirementSpec {
  id: string;
  priority: RequirementPriority;
  statement: string;
  acceptanceCriteria: string[];
  evidenceRequired: string[];
}

export interface DesignSpec {
  architecture: string[];
  dataContracts: string[];
  toolContracts: string[];
  boundaries: string[];
  verificationStrategy: string[];
}

export interface TaskSpec {
  id: string;
  title: string;
  purpose: string;
  inputs: string[];
  outputs: string[];
  blockedUntil: string[];
  verification: string[];
}

export interface SpecArtifactBundle {
  specId: string;
  mode: SpecMode;
  title: string;
  createdAt: string;
  specLock: {
    sourceOfTruth: "spec";
    frozen: boolean;
    hash: string;
    allowedChangePath: string;
  };
  requirements: RequirementSpec[];
  design: DesignSpec;
  tasks: TaskSpec[];
  doNotBuild: string[];
  unchangedBehavior: string[];
  acceptanceMatrix: Array<{ requirementId: string; taskIds: string[]; proof: string[]; status: "pending" | "verified" }>;
  traceabilityMap: Array<{ requirementId: string; designRefs: string[]; taskIds: string[]; expectedArtifacts: string[]; expectedTests: string[] }>;
  verificationPlan: string[];
  decisionLog: string[];
}

function cleanGoal(goal: string): string {
  return goal.replace(/\s+/g, " ").trim() || "Build a grounded long-video RAG capability for FORGE";
}

function inferMode(goal: string): SpecMode {
  const g = goal.toLowerCase();
  if (/(bug|fix|broken|error|regression|fails)/.test(g)) return "bugfix";
  if (/(integrate|adapter|mcp|tool|capability)/.test(g)) return "integration";
  if (/(research|rag|video|collection|knowledge|question|answer)/.test(g)) return "research";
  return "feature";
}

export function createVideoRagSpec(goalInput: string, collectionId = "default"): SpecArtifactBundle {
  const goal = cleanGoal(goalInput);
  const mode = inferMode(goal);
  const specId = id("spec");
  const title = mode === "bugfix" ? `Bugfix Spec: ${goal}` : `Feature Spec: ${goal}`;
  const requirements: RequirementSpec[] = [
    {
      id: "REQ-001",
      priority: "must",
      statement: `FORGE must convert the user goal into a locked, inspectable specification before video ingestion, retrieval, or answer generation for collection '${collectionId}'.`,
      acceptanceCriteria: ["SPEC_LOCK is present", "requirements, design, tasks, do-not-build, unchanged behavior, and acceptance matrix exist", "spec hash is recorded before implementation"],
      evidenceRequired: ["specId", "specLock.hash", "acceptanceMatrix"]
    },
    {
      id: "REQ-002",
      priority: "must",
      statement: "Every answer over long-video collections must include timestamped citations and verifier notes.",
      acceptanceCriteria: ["answer.citations length is greater than zero for supported answers", "citations include videoId, startSec, endSec, modality, excerpt", "unsupported answers are downgraded instead of hallucinated"],
      evidenceRequired: ["Answer.citations", "VerifierReport.status", "VerifierReport.notes"]
    },
    {
      id: "REQ-003",
      priority: "must",
      statement: "100+ hour usage must be cost-aware and transcript-first, with OCR/vision gated by sampling strategy.",
      acceptanceCriteria: ["CostPlan exists before ingest", "vision and OCR calls are estimated", "warnings are emitted for expensive or weakly grounded plans"],
      evidenceRequired: ["CostPlan", "ingest audit event", "coverage report"]
    },
    {
      id: "REQ-004",
      priority: "should",
      statement: "FORGE should maintain clip, scene, video, and collection memory so repeated questions use hierarchical context instead of re-reading everything.",
      acceptanceCriteria: ["memory nodes exist at multiple levels", "collection summary exists", "memory is traceable to evidenceIds"],
      evidenceRequired: ["MemoryNode[]", "collection memory", "evidenceIds"]
    },
    {
      id: "REQ-005",
      priority: "should",
      statement: "The tool should expose live workspace events so FORGE can show planning, ingestion, indexing, retrieval, verification, and report generation progress.",
      acceptanceCriteria: ["ToolResult.auditEvents includes stage names", "traceId is stable", "API can expose event names to UI"],
      evidenceRequired: ["ToolResult.traceId", "auditEvents", "event stream"]
    }
  ];

  const design: DesignSpec = {
    architecture: [
      "Mission Interpreter creates SPEC_LOCK and strict artifacts before execution.",
      "Permission Gate reviews ingest risk before any remote/local media operation.",
      "Engine builds transcript, OCR, frame, summary, scene, video, and collection evidence.",
      "Retriever uses query planning, hybrid search, graph expansion, and verifier downgrade.",
      "FORGE UI consumes answer cards, timeline cards, coverage reports, and trace events."
    ],
    dataContracts: ["VideoRecord", "Evidence", "VectorRow", "MemoryNode", "Answer", "Citation", "VerifierReport", "CoverageReport"],
    toolContracts: ["video.plan", "video.ingest", "video.ingestBatch", "video.ask", "video.timeline", "video.coverage", "video.report", "video.spec", "video.health"],
    boundaries: [
      "No generic remote URL ingestion unless host is allowlisted.",
      "No answer may claim facts outside retrieved evidence.",
      "No fake generated transcript/OCR/vision success in production mode.",
      "No spec change after freeze without spec-diff and new hash."
    ],
    verificationStrategy: ["TypeScript build", "node:test suite", "citation presence checks", "modality coverage checks", "spec-code traceability map"]
  };

  const tasks: TaskSpec[] = [
    { id: "TASK-001", title: "Lock spec", purpose: "Freeze the contract before build", inputs: ["user goal"], outputs: ["SPEC_LOCK", "requirements", "do-not-build"], blockedUntil: [], verification: ["specLock.hash exists"] },
    { id: "TASK-002", title: "Plan ingest", purpose: "Estimate cost and risk before indexing", inputs: ["VideoSource", "IngestOptions"], outputs: ["CostPlan"], blockedUntil: ["TASK-001"], verification: ["CostPlan warnings reviewed"] },
    { id: "TASK-003", title: "Index evidence", purpose: "Create transcript/OCR/frame evidence and memory", inputs: ["approved source", "CostPlan"], outputs: ["Evidence[]", "VectorRow[]", "MemoryNode[]"], blockedUntil: ["TASK-002"], verification: ["evidenceCount > 0", "memoryCount > 0"] },
    { id: "TASK-004", title: "Answer with proof", purpose: "Retrieve and verify grounded answers", inputs: ["question", "collectionId"], outputs: ["Answer", "Citation[]", "VerifierReport"], blockedUntil: ["TASK-003"], verification: ["supported answers include citations", "weak answers downgraded"] },
    { id: "TASK-005", title: "Generate release evidence", purpose: "Produce coverage, stats, timeline, and readiness report", inputs: ["collectionId"], outputs: ["CoverageReport", "ReadinessReport"], blockedUntil: ["TASK-003"], verification: ["all gaps are explicit"] }
  ];

  const doNotBuild = [
    "Do not claim production ASR/OCR/vision if only placeholder providers are configured.",
    "Do not ingest private or non-allowlisted remote URLs without approval.",
    "Do not answer from memory without timestamped evidence for the claim.",
    "Do not use raw shell execution or hidden downloads.",
    "Do not silently expand scope from video RAG into unrelated app generation."
  ];

  const unchangedBehavior = [
    "Existing FORGE permission gate remains authoritative.",
    "Existing CLI/API commands must remain backward compatible.",
    "Synthetic test mode must keep running without paid providers.",
    "No external dependency is required for default test mode."
  ];

  const acceptanceMatrix = requirements.map((r, index) => ({
    requirementId: r.id,
    taskIds: tasks.filter((_, i) => i <= Math.min(tasks.length - 1, index + 1)).map(t => t.id),
    proof: r.evidenceRequired,
    status: "pending" as const
  }));

  const traceabilityMap = requirements.map((r, index) => ({
    requirementId: r.id,
    designRefs: [design.dataContracts[index % design.dataContracts.length], design.toolContracts[index % design.toolContracts.length]],
    taskIds: acceptanceMatrix[index].taskIds,
    expectedArtifacts: r.evidenceRequired,
    expectedTests: ["npm run build", "npm test", `traceability:${r.id}`]
  }));

  const hash = sha256(JSON.stringify({ title, requirements, design, tasks, doNotBuild, unchangedBehavior })).slice(0, 32);
  return {
    specId,
    mode,
    title,
    createdAt: nowIso(),
    specLock: { sourceOfTruth: "spec", frozen: true, hash, allowedChangePath: "Create spec-diff, update requirements/design/tasks, regenerate acceptance matrix, then re-freeze." },
    requirements,
    design,
    tasks,
    doNotBuild,
    unchangedBehavior,
    acceptanceMatrix,
    traceabilityMap,
    verificationPlan: ["Run typecheck/build", "Run unit tests", "Run dry-run video.plan", "Run synthetic ingest", "Ask citation-backed question", "Generate coverage report"],
    decisionLog: [`${nowIso()} - Initial spec generated from user goal and frozen with hash ${hash}.`]
  };
}
