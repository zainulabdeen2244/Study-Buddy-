import { CoverageReport } from "./coverage.js";
import { CollectionManifest } from "./collectionManifest.js";

export interface PremortemFailureMode {
  id: string;
  severity: "low" | "medium" | "high" | "critical";
  likelihood: "low" | "medium" | "high";
  failure: string;
  whyItFails: string;
  fix: string;
  owner: "FORGE orchestrator" | "Video RAG tool" | "External provider" | "Human reviewer";
}

export interface VideoRagPremortemReport {
  collectionId: string;
  status: "healthy" | "watch" | "danger";
  generatedAt: string;
  summary: string;
  failureModes: PremortemFailureMode[];
  mandatoryFixes: string[];
  recommendedActions: string[];
}

export function buildVideoRagPremortem(collectionId: string, coverage: CoverageReport, manifest?: CollectionManifest): VideoRagPremortemReport {
  const failureModes: PremortemFailureMode[] = [
    {
      id: "VRAG-PM-001",
      severity: coverage.totalHours >= 100 && coverage.modalityCoverage.transcript !== "ok" ? "critical" : "high",
      likelihood: "high",
      failure: "100+ hour collection answers from weak transcript coverage.",
      whyItFails: "Long-video RAG collapses when the cheapest, densest modality is missing or weak; visual-only retrieval is expensive and sparse.",
      fix: "Use transcript-first indexing, then trigger OCR/vision only for timestamped gaps, visual questions, or low-confidence retrieval.",
      owner: "Video RAG tool"
    },
    {
      id: "VRAG-PM-002",
      severity: coverage.modalityCoverage.ocr === "missing" && coverage.modalityCoverage.frame === "missing" ? "high" : "medium",
      likelihood: "medium",
      failure: "Screen text, diagrams, UI labels, and visual evidence are invisible to the retriever.",
      whyItFails: "Transcript evidence cannot answer questions about what appears on screen.",
      fix: "Build keyframe/OCR coverage with scene-change sampling and store modality-specific evidence bundles.",
      owner: "External provider"
    },
    {
      id: "VRAG-PM-003",
      severity: "high",
      likelihood: "medium",
      failure: "Temporal hallucination: answer cites the wrong nearby moment.",
      whyItFails: "Long videos often repeat concepts; retrieval must preserve neighborhood, sequence, and timestamp distance.",
      fix: "Use temporal windows, adjacency expansion, timestamp proximity scoring, and answer support audits before final output.",
      owner: "Video RAG tool"
    },
    {
      id: "VRAG-PM-004",
      severity: "high",
      likelihood: "medium",
      failure: "A partial answer is presented as fully supported.",
      whyItFails: "Citation count alone does not prove that the evidence supports every question term or required modality.",
      fix: "Run answer support audit and downgrade to partial or insufficient_evidence when support is weak.",
      owner: "FORGE orchestrator"
    },
    {
      id: "VRAG-PM-005",
      severity: "medium",
      likelihood: "high",
      failure: "JSON storage becomes slow or fragile as collections grow.",
      whyItFails: "Single-file JSON is fine for demos but not for multi-user 100+ hour collections, vector search, or job recovery.",
      fix: "Use the storage adapter boundary and migrate to Postgres/pgvector, Qdrant, LanceDB, or a sharded JSON dev store for production.",
      owner: "FORGE orchestrator"
    },
    {
      id: "VRAG-PM-006",
      severity: "high",
      likelihood: "medium",
      failure: "Reindexing wastes cost by running vision/OCR over everything.",
      whyItFails: "Full visual passes over 100+ hours are expensive and often redundant.",
      fix: "Use adaptive reindex plans: transcript first, OCR-trigger frames, scene-change keyframes, and only vision where confidence is low.",
      owner: "Video RAG tool"
    },
    {
      id: "VRAG-PM-007",
      severity: "medium",
      likelihood: "medium",
      failure: "Duplicate intros, outros, ads, and repeated segments dominate retrieval.",
      whyItFails: "Repetitive segments inflate apparent support while adding no new facts.",
      fix: "Track fingerprints, duplicate clusters, and de-prioritize repeated low-information evidence.",
      owner: "Video RAG tool"
    },
    {
      id: "VRAG-PM-008",
      severity: "critical",
      likelihood: "low",
      failure: "Untrusted remote video source causes SSRF or private-network access.",
      whyItFails: "Video tools often fetch URLs; without allowlists they can reach local/admin networks.",
      fix: "Keep remote URL allowlist, private-IP blocking, permission gate, audit logs, and dry-run planning before ingest.",
      owner: "FORGE orchestrator"
    }
  ];

  if (manifest?.readiness === "research_only") {
    failureModes.push({
      id: "VRAG-PM-009",
      severity: "high",
      likelihood: "high",
      failure: "Collection is used for production Q&A while manifest says research_only.",
      whyItFails: "Evidence quality is below production threshold, but UI may still let users ask critical questions.",
      fix: "FORGE should gate production mode until readiness is usable or production_candidate.",
      owner: "FORGE orchestrator"
    });
  }

  const critical = failureModes.filter(f => f.severity === "critical").length;
  const high = failureModes.filter(f => f.severity === "high").length;
  const status: VideoRagPremortemReport["status"] = critical || coverage.score < 0.25 ? "danger" : high >= 4 || coverage.score < 0.55 ? "watch" : "healthy";
  const mandatoryFixes = [
    "Never answer without timestamped citations.",
    "Run queryPlan and evidenceBundle before answer generation for user-facing answers.",
    "Downgrade answers when required modalities are missing.",
    "Use reindexPlan before expensive OCR/vision passes.",
    "Keep remote ingest permission-gated and allowlisted."
  ];
  const recommendedActions = [...new Set([...(coverage.nextActions || []), ...(manifest?.reindexRecommendations || []).slice(0, 6).map(r => `${r.priority}: ${r.action} - ${r.reason}`)])];
  return {
    collectionId,
    status,
    generatedAt: new Date().toISOString(),
    summary: `Premortem status ${status}. Coverage score ${coverage.score}. The biggest risks are weak modality coverage, temporal hallucination, partial-answer overconfidence, and production storage limits.`,
    failureModes,
    mandatoryFixes,
    recommendedActions
  };
}
