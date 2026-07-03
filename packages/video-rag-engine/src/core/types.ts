export type Modality = "transcript" | "ocr" | "frame" | "summary" | "scene" | "video" | "collection";
export type AnswerStatus = "supported" | "partial" | "insufficient_evidence";
export type JobStatus = "queued" | "running" | "succeeded" | "failed" | "cancelled";

export interface VideoSource {
  sourceType: "youtube" | "local" | "remote" | "synthetic";
  uri: string;
  title?: string;
  collectionId?: string;
  durationSec?: number;
}

export interface Evidence {
  id: string;
  collectionId: string;
  videoId: string;
  modality: Modality;
  startSec: number;
  endSec: number;
  text: string;
  score?: number;
  confidence?: number;
  metadata: Record<string, unknown>;
  fingerprint: string;
  createdAt: string;
}

export interface VideoRecord {
  id: string;
  collectionId: string;
  uri: string;
  title: string;
  sourceType: VideoSource["sourceType"];
  durationSec: number;
  createdAt: string;
  status: "created" | "indexed" | "failed";
  metadata: Record<string, unknown>;
}

export interface IngestOptions {
  collectionId?: string;
  title?: string;
  force?: boolean;
  dryRun?: boolean;
  maxFramesPerHour?: number;
  maxOcrFramesPerHour?: number;
  segmentSeconds?: number;
  enableOcr?: boolean;
  enableVision?: boolean;
  enableTranscript?: boolean;
  allowDegradedProviders?: boolean;
}


export interface IngestResult {
  video: VideoRecord;
  evidenceCount: number;
  memoryCount: number;
  dedupedCount: number;
  costPlan: CostPlan;
}

export interface AskOptions {
  collectionId: string;
  question: string;
  videoId?: string;
  topK?: number;
  timestampHintSec?: number;
  requireCitations?: boolean;
  minConfidence?: number;
}

export interface Citation {
  evidenceId: string;
  videoId: string;
  modality: Modality;
  startSec: number;
  endSec: number;
  score: number;
  excerpt: string;
}

export interface Answer {
  status: AnswerStatus;
  answer: string;
  confidence: number;
  citations: Citation[];
  verifierNotes: string[];
}

export interface VectorRow {
  id: string;
  collectionId: string;
  evidenceId: string;
  dims: number;
  vector: number[];
  createdAt: string;
}

export interface Job {
  id: string;
  kind: "ingest" | "evaluate" | "summarize" | "reindex";
  status: JobStatus;
  payload: Record<string, unknown>;
  progress: number;
  stage: string;
  error?: string;
  createdAt: string;
  updatedAt: string;
}

export interface MemoryNode {
  id: string;
  collectionId: string;
  videoId?: string;
  level: "clip" | "scene" | "video" | "collection";
  startSec?: number;
  endSec?: number;
  text: string;
  evidenceIds: string[];
  createdAt: string;
}

export interface CostPlan {
  estimatedHours: number;
  frameStrideSec: number;
  ocrStrideSec: number;
  estimatedVisionCalls: number;
  estimatedOcrCalls: number;
  transcriptFirst: boolean;
  warnings: string[];
}

export interface EvaluationCase {
  id: string;
  collectionId: string;
  question: string;
  expectedKeywords: string[];
  minConfidence?: number;
}

export interface EvaluationResult {
  caseId: string;
  passed: boolean;
  confidence: number;
  keywordRecall: number;
  hasCitations: boolean;
  answer: string;
}


export type ForgeToolAction = "video.plan" | "video.ingest" | "video.ingestBatch" | "video.ask" | "video.search" | "video.timeline" | "video.stats" | "video.evaluate" | "video.health" | "video.coverage" | "video.report" | "video.spec" | "video.trace" | "video.manifest" | "video.auditAnswer" | "video.queryPlan" | "video.premortem" | "video.reindexPlan" | "video.memoryMap" | "video.providerStatus" | "video.ingestUrl" | "video.ingestFile" | "video.productionGate" | "video.e2ePlan";
export type QueryIntent = "spoken" | "visual" | "ocr" | "timestamp" | "summary" | "cross_video" | "unknown";
export type RiskLevel = "low" | "medium" | "high";

export interface QueryPlan {
  question: string;
  intents: QueryIntent[];
  complexity?: "simple" | "moderate" | "complex";
  temporalWindowSec?: number;
  searchPasses?: Array<"semantic" | "keyword" | "temporal" | "modality" | "memory">;
  needsTranscript: boolean;
  needsVisual: boolean;
  needsOcr: boolean;
  needsTemporalNeighborhood: boolean;
  retrievalTopK: number;
  modalityWeights: Record<Modality, number>;
  timestampHintSec?: number;
  verifierThreshold: number;
}

export interface PermissionDecision {
  allowed: boolean;
  risk: RiskLevel;
  reason: string;
  requiredApproval?: string;
}

export interface ToolInvocation<T = Record<string, unknown>> {
  action: ForgeToolAction;
  workspaceId: string;
  userId?: string;
  approved?: boolean;
  payload: T;
  traceId?: string;
}

export interface ToolResult<T = unknown> {
  ok: boolean;
  action: ForgeToolAction;
  traceId: string;
  data?: T;
  error?: string;
  auditEvents: string[];
}

export interface BatchIngestRequest {
  collectionId: string;
  sources: VideoSource[];
  options?: IngestOptions;
  concurrency?: number;
}

export interface BatchIngestResult {
  collectionId: string;
  total: number;
  succeeded: number;
  failed: number;
  results: Array<{ uri: string; videoId?: string; evidenceCount?: number; error?: string }>;
}

export interface TimelineSegment {
  videoId: string;
  startSec: number;
  endSec: number;
  title: string;
  summary: string;
  evidenceIds: string[];
  modalities: Modality[];
  density: number;
}

export interface VerifierReport {
  supportedClaims: number;
  weakClaims: string[];
  missingModalities: Modality[];
  contradictionRisk: number;
  finalConfidence: number;
  status: AnswerStatus;
  notes: string[];
}

export interface HealthReport {
  status: "ok" | "degraded" | "failed";
  checks: Array<{ name: string; ok: boolean; detail: string }>;
  recommendations: string[];
}

export interface ReadinessReport {
  collectionId: string;
  status: "ready" | "needs_work" | "blocked";
  stats: Record<string, unknown>;
  coverage: Record<string, unknown>;
  recommendations: string[];
  generatedAt: string;
}

export interface SpecRequest {
  goal: string;
  collectionId?: string;
}


export interface TraceRequest {
  traceId?: string;
  limit?: number;
}

export interface AuditAnswerRequest extends AskOptions {}


export interface SearchEvidenceRequest extends AskOptions {
  includeTemporalNeighbors?: boolean;
  limit?: number;
}

export interface PremortemRequest {
  collectionId: string;
}

export interface ReindexPlanRequest {
  collectionId: string;
  mode?: "transcript_first" | "balanced" | "visual_repair" | "production_hardening";
}

export interface MemoryMapRequest {
  collectionId: string;
}

export interface ProviderStatusRequest {
  includeSetup?: boolean;
}

export interface ProductionGateRequest {
  collectionId?: string;
  source?: VideoSource;
  options?: IngestOptions;
  action?: "ingest" | "ask" | "report" | "provider_check";
}

