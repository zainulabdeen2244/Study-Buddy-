import type { Answer } from "../../packages/video-rag-engine/src/core/types.js";
import type { EvidenceBundle } from "../../packages/video-rag-engine/src/retrieval/evidenceBundle.js";
import type { AnswerSupportAudit } from "../../packages/video-rag-engine/src/retrieval/supportAudit.js";

export type MedicalRiskLevel = "low" | "medium" | "high";
export type StudyBuddyIntent = "ASK_VIDEO" | "FIND_TIMESTAMP" | "EXPLAIN_PROCEDURE" | "GENERATE_OSCE" | "GENERATE_QUIZ" | "GENERATE_FLASHCARDS" | "REVISION_PLAN" | "SAFETY_REVIEW_ONLY" | "RESEARCH_STUDENT_PAIN";
export type SafetyDecision = "approved" | "approved_with_warning" | "rewrite_required" | "blocked";

export interface StudyBuddyRoute {
  intent: StudyBuddyIntent;
  riskLevel: MedicalRiskLevel;
  blocked: boolean;
  blockReason?: string;
  requiredTools: string[];
  requiredAgents: string[];
  needsVideoRag: boolean;
  needsDocumentRag: boolean;
  needsSafetyReview: boolean;
}

export interface SafetyAudit {
  decision: SafetyDecision;
  riskLevel: MedicalRiskLevel;
  unsafeClaims: string[];
  missingEvidence: string[];
  requiredRevisions: string[];
  finalSafetyNote: string;
  evidenceGate: {
    minimumCitations: number;
    actualCitations: number;
    supportScore?: number;
    passed: boolean;
  };
}

export interface AgentTraceStep {
  id: string;
  agent: string;
  action: string;
  inputSummary: string;
  outputSummary: string;
  status: "planned" | "running" | "succeeded" | "blocked" | "warning";
  durationMs: number;
  tools: string[];
}

export interface OsceStation {
  title: string;
  timeMinutes: number;
  candidateTask: string;
  examinerChecklist: Array<{ item: string; marks: number; evidence?: string }>;
  vivaQuestions: string[];
  criticalFailPoints: string[];
  modelAnswer: string;
  evidenceUsed: string[];
}

export interface QuizPack {
  mcqs: Array<{ question: string; options: string[]; correct: string; explanation: string; evidence?: string }>;
  flashcards: Array<{ front: string; back: string; evidence?: string }>;
}

export interface RevisionPlan {
  weakTopics: string[];
  today: string[];
  tomorrow: string[];
  recommendedTimestamps: string[];
}

export interface PremortemEntry {
  id: string;
  module: string;
  stage: string;
  likelyFailures: string[];
  mitigations: string[];
  status: "recorded" | "passed" | "warning";
  createdAt: string;
}

export interface StudyBuddyAskResult {
  ok: boolean;
  sessionId: string;
  collectionId: string;
  route: StudyBuddyRoute;
  orchestratorPlan?: OrchestratorPlan;
  answer: string;
  videoRagAnswer?: Answer;
  videoRagSupportAudit?: AnswerSupportAudit;
  evidenceBundle?: EvidenceBundle;
  safetyAudit: SafetyAudit;
  agentTrace: AgentTraceStep[];
  osce?: OsceStation;
  quiz?: QuizPack;
  revisionPlan?: RevisionPlan;
  ops?: Record<string, unknown>;
  premortem?: PremortemEntry[];
  suggestedArtifact?: ArtifactCreateRequest;
  artifacts?: ArtifactRecord[];
}

export type ArtifactKind = "pdf" | "docx" | "pptx" | "chart" | "study-pack";
export type OrchestratorIntent = "clinical_video" | "research_articles" | "github_repositories" | "external_video_notes" | "artifact_generation" | "mixed" | "demo_load" | "unknown";
export type ResearchSource = "hackernews" | "github" | "pubmed" | "arxiv" | "youtube" | "general" | "multi";

export interface OrchestratorPlan {
  intent: OrchestratorIntent;
  confidence: number;
  reasoning: string;
  searchQuery?: string;
  needsClinicalVideoRag: boolean;
  needsResearch: boolean;
  needsArtifact: boolean;
  artifactKind?: ArtifactKind;
  artifactTitle?: string;
  tools: string[];
  /** Named playbook selected for this request */
  playbook?: string;
  /** Agent roster for this playbook */
  agents?: string[];
  /** Whether multi-source parallel research is needed */
  isMultiSource?: boolean;
}

/** Research hit from any source (HN, GitHub, PubMed, arXiv, YouTube) */
export interface ResearchHit {
  title: string;
  url: string;
  summary: string;
  source: ResearchSource;
  date: string;
  confidence: "high" | "medium" | "low";
  signals?: string;
  authors?: string;
}

/** Full research result from the researchEngine */
export interface ResearchResult {
  ok: boolean;
  source: ResearchSource;
  query: string;
  hits: ResearchHit[];
  themes: string[];
  answer: string;
  citations: string[];
  error?: string;
  durationMs: number;
}

/** Agent handoff context — passed between agents for collaboration */
export interface AgentHandoff {
  fromAgent: string;
  toAgent: string;
  payload: Record<string, unknown>;
  traceId: string;
  timestamp: string;
}

export interface ArtifactCreateRequest {
  kind: ArtifactKind;
  title?: string;
  prompt?: string;
  sourceText?: string;
  collectionId?: string;
}

export interface ArtifactRecord {
  id: string;
  kind: ArtifactKind;
  title: string;
  fileName: string;
  filePath: string;
  url: string;
  mime: string;
  sizeBytes: number;
  checksum: string;
  createdAt: string;
  source: string;
  licenseNote: string;
}

export interface ArtifactCreateResult {
  ok: boolean;
  runId: string;
  artifacts: ArtifactRecord[];
  manifest: Record<string, unknown>;
  trace: AgentTraceStep[];
  warnings: string[];
}
