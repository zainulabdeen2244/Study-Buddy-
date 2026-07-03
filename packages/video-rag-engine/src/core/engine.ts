import fs from "node:fs";
import path from "node:path";
import { loadConfig, ToolConfig } from "./config.js";
import { AskOptions, Answer, BatchIngestRequest, BatchIngestResult, Evidence, IngestOptions, IngestResult, ReadinessReport, ReindexPlanRequest, SearchEvidenceRequest, TimelineSegment, VectorRow, VideoRecord, VideoSource } from "./types.js";
import { id, nowIso } from "./utils.js";
import { validateSource } from "./safety.js";
import { AuditLog } from "./audit.js";
import { VideoRagStore, JsonFileStore } from "../storage/jsonStore.js";
import { SqliteCliVideoRagStore } from "../storage/sqlite/sqliteVideoRagStore.js";
import { EmbeddingProvider, HashEmbeddingProvider, OpenAIEmbeddingProvider } from "../providers/embeddings.js";
import { TranscriptProvider, SyntheticTranscriptProvider, ProductionTranscriptProvider } from "../providers/transcript.js";
import { OcrProvider, PlaceholderOcrProvider, ProductionOcrProvider } from "../providers/ocr.js";
import { FrameProvider, KeyframeProvider, ProductionFrameProvider } from "../providers/frames.js";
import { planCost } from "../retrieval/costControl.js";
import { dedupeEvidence } from "../retrieval/dedupe.js";
import { buildCollectionMemory, buildHierarchicalMemory } from "../retrieval/memory.js";
import { hybridSearch } from "../retrieval/search.js";
import { composeGroundedAnswer } from "../retrieval/answer.js";
import { planQuery } from "../retrieval/queryPlanner.js";
import { buildAnswerSupportAudit, AnswerSupportAudit } from "../retrieval/supportAudit.js";
import { graphExpandAndRerank } from "../retrieval/graph.js";
import { applyVerifier, verifyAnswer } from "../retrieval/verifier.js";
import { buildTimeline } from "../retrieval/timeline.js";
import { buildCoverageReport, CoverageReport } from "../reports/coverage.js";
import { buildEvidenceBundle, EvidenceBundle } from "../retrieval/evidenceBundle.js";
import { buildVideoRagPremortem, VideoRagPremortemReport } from "../reports/premortem.js";
import { buildReindexPlan, ReindexPlanReport } from "../reports/reindexPlan.js";
import { buildMemoryMap, MemoryMapReport } from "../reports/memoryMap.js";
import { buildCollectionManifest, CollectionManifest } from "../reports/collectionManifest.js";
import { createVideoRagSpec, SpecArtifactBundle } from "../spec/specEngine.js";
import { runSpecTraceabilityGate } from "../spec/traceability.js";
import { YtDlpDownloader, DownloaderProvider } from "../providers/download.js";
import { FfmpegMediaProbe } from "../providers/media.js";
import { OpenAIAnswerProvider, AnswerGeneratorProvider } from "../providers/llm.js";
import { buildProviderStatusReport, ProviderStatusReport } from "../providers/providerRegistry.js";
import { assertProductionGate, evaluateProductionGate, ProductionGateReport } from "../ops/productionGate.js";

export interface EngineDeps {
  config?: Partial<ToolConfig>;
  store?: VideoRagStore;
  embeddings?: EmbeddingProvider;
  transcript?: TranscriptProvider;
  ocr?: OcrProvider;
  frames?: FrameProvider;
  downloader?: DownloaderProvider;
  answerProvider?: AnswerGeneratorProvider;
}

export class LongVideoRagToolEngine {
  public config: ToolConfig;
  private store: VideoRagStore;
  private embeddings: EmbeddingProvider;
  private transcript: TranscriptProvider;
  private ocr: OcrProvider;
  private frames: FrameProvider;
  private audit: AuditLog;
  private downloader: DownloaderProvider;
  private probe: FfmpegMediaProbe;
  private answerProvider?: AnswerGeneratorProvider;

  constructor(deps: EngineDeps = {}) {
    this.config = loadConfig(deps.config);
    this.store = deps.store ?? (this.config.storeMode === "sqlite-cli" ? new SqliteCliVideoRagStore(path.join(this.config.dataDir, "video-rag.sqlite")) : new JsonFileStore(this.config.dataDir));
    this.embeddings = deps.embeddings ?? (this.config.realProviders && process.env.OPENAI_API_KEY ? new OpenAIEmbeddingProvider() : new HashEmbeddingProvider(this.config.embeddingDims));
    this.transcript = deps.transcript ?? (this.config.realProviders ? new ProductionTranscriptProvider() : new SyntheticTranscriptProvider());
    this.ocr = deps.ocr ?? (this.config.realProviders ? new ProductionOcrProvider() : new PlaceholderOcrProvider());
    this.frames = deps.frames ?? (this.config.realProviders ? new ProductionFrameProvider() : new KeyframeProvider());
    this.downloader = deps.downloader ?? new YtDlpDownloader();
    this.probe = new FfmpegMediaProbe();
    this.answerProvider = deps.answerProvider ?? (this.config.useOpenAIAnswer && process.env.OPENAI_API_KEY ? new OpenAIAnswerProvider() : undefined);
    this.audit = new AuditLog(this.config.dataDir);
  }

  getStore(): VideoRagStore { return this.store; }

  async ingest(source: VideoSource, options: IngestOptions = {}): Promise<IngestResult> {
    validateSource(source, this.config);
    const collectionId = options.collectionId || source.collectionId || this.config.defaultCollectionId;
    if (!options.dryRun && source.sourceType !== "synthetic") {
      const gate = await this.productionGate({ source, options, action: "ingest" });
      this.audit.write("production_gate.checked", { collectionId, status: gate.status, blockers: gate.blockers, requiredCapabilities: gate.requiredCapabilities });
      assertProductionGate(gate);
    }
    let preparedSource = source;
    const providerModes: string[] = [];
    let mediaPath: string | undefined;
    if (!options.dryRun && source.sourceType === "youtube" && this.config.realProviders) {
      const outDir = path.join(this.config.mediaDir, collectionId, id("download"));
      const download = await this.downloader.download(source.uri, outDir, this.config, true);
      mediaPath = download.mediaPath;
      providerModes.push(download.provider);
    }
    if (!options.dryRun && source.sourceType === "local") mediaPath = source.uri;
    let probedDuration = 0;
    let probeData: Record<string, unknown> | undefined;
    if (mediaPath && fs.existsSync(mediaPath) && this.config.realProviders) {
      const probeStatus = await this.probe.status();
      if (probeStatus.ok) {
        const probe = await this.probe.probe(mediaPath);
        probedDuration = probe.durationSec;
        probeData = { durationSec: probe.durationSec, width: probe.width, height: probe.height, hasAudio: probe.hasAudio, hasVideo: probe.hasVideo };
        providerModes.push("ffprobe");
      }
    }
    const durationSec = source.durationSec || probedDuration || 3600;
    const video: VideoRecord = {
      id: id("vid"), collectionId, uri: preparedSource.uri, title: options.title || source.title || source.uri,
      sourceType: source.sourceType, durationSec, createdAt: nowIso(), status: "created", metadata: { dryRun: !!options.dryRun, mediaPath, providerModes, realProviders: this.config.realProviders, storageMode: this.config.storeMode, probe: probeData }
    };
    const costPlan = planCost({ ...preparedSource, durationSec }, this.config, options);
    this.audit.write("ingest.started", { collectionId, videoId: video.id, uri: source.uri, costPlan });
    if (options.dryRun) {
      await this.store.upsertVideo(video);
      return { video, evidenceCount: 0, memoryCount: 0, dedupedCount: 0, costPlan };
    }

    const evidence: Evidence[] = [];
    const transcriptRows = (options.enableTranscript ?? true) ? await this.transcript.extract(video) : [];
    const ocrRows = (options.enableOcr ?? true) ? await this.ocr.extract(video, costPlan.ocrStrideSec) : [];
    const frameRows = await this.frames.extract(video, costPlan.frameStrideSec, options.enableVision ?? false);
    evidence.push(...transcriptRows, ...ocrRows, ...frameRows);
    if (this.config.realProviders && source.sourceType !== "synthetic" && evidence.length === 0) {
      const failedVideo = { ...video, status: "failed" as const, metadata: { ...video.metadata, failure: "no_real_evidence_extracted" } };
      await this.store.upsertVideo(failedVideo);
      this.audit.write("ingest.failed", { collectionId, videoId: video.id, reason: "No real transcript/OCR/frame evidence was extracted." });
      throw new Error("Production ingest produced zero real evidence. Check transcription/OCR/frame providers before claiming readiness.");
    }
    const deduped = dedupeEvidence(evidence);

    await this.store.upsertVideo({ ...video, status: "indexed", metadata: { ...video.metadata, evidenceBreakdown: { transcript: transcriptRows.length, ocr: ocrRows.length, frame: frameRows.length } } });
    await this.store.addEvidence(deduped.kept);
    const vectors = await this.buildVectors(collectionId, deduped.kept);
    await this.store.addVectors(vectors);
    const memory = buildHierarchicalMemory(video, deduped.kept, options.segmentSeconds ?? this.config.defaultSegmentSeconds);
    await this.store.addMemory(memory);
    const videos = await this.store.listVideos(collectionId);
    const existingMemory = await this.store.listMemory(collectionId);
    await this.store.addMemory([buildCollectionMemory(collectionId, videos, existingMemory)]);
    this.audit.write("ingest.succeeded", { collectionId, videoId: video.id, evidenceCount: deduped.kept.length, dedupedCount: deduped.removed.length });
    return { video: { ...video, status: "indexed" }, evidenceCount: deduped.kept.length, memoryCount: memory.length + 1, dedupedCount: deduped.removed.length, costPlan };
  }

  async searchEvidence(options: SearchEvidenceRequest): Promise<EvidenceBundle> {
    const queryPlan = planQuery(options.question);
    const topK = options.topK ?? queryPlan.retrievalTopK;
    const evidence = await this.store.listEvidence(options.collectionId, options.videoId);
    const vectors = await this.store.listVectors(options.collectionId);
    const queryVector = await this.embeddings.embed(options.question);
    const hits = hybridSearch(options.question, queryVector, evidence, vectors, Math.max(topK, 10), options.timestampHintSec ?? queryPlan.timestampHintSec);
    const expandedHits = graphExpandAndRerank(hits, evidence, queryPlan, Math.max(topK, 10));
    const bundle = buildEvidenceBundle(options.question, queryPlan, expandedHits, evidence, options.limit ?? Math.max(12, topK));
    this.audit.write("search.completed", { collectionId: options.collectionId, question: options.question, supportScore: bundle.supportScore, risks: bundle.risks.length, nextAction: bundle.suggestedNextAction });
    return bundle;
  }

  async ask(options: AskOptions): Promise<Answer> {
    const queryPlan = planQuery(options.question);
    const topK = options.topK ?? queryPlan.retrievalTopK;
    const evidence = await this.store.listEvidence(options.collectionId, options.videoId);
    const vectors = await this.store.listVectors(options.collectionId);
    const queryVector = await this.embeddings.embed(options.question);
    const hits = hybridSearch(options.question, queryVector, evidence, vectors, Math.max(topK, 8), options.timestampHintSec ?? queryPlan.timestampHintSec);
    const expandedHits = graphExpandAndRerank(hits, evidence, queryPlan, topK);
    const bundle = buildEvidenceBundle(options.question, queryPlan, expandedHits, evidence, Math.max(10, topK));
    let draft = composeGroundedAnswer(options.question, expandedHits, options.minConfidence ?? queryPlan.verifierThreshold);
    if (this.answerProvider && draft.citations.length > 0) {
      const evidenceById = new Map(evidence.map(ev => [ev.id, ev]));
      const citedEvidence = draft.citations.map(c => evidenceById.get(c.evidenceId)).filter(Boolean) as Evidence[];
      draft = await this.answerProvider.generate(options.question, citedEvidence, draft);
    }
    const report = verifyAnswer(draft, queryPlan);
    let answer = applyVerifier(draft, report);
    if (bundle.suggestedNextAction === "ingest_more_evidence" && answer.status === "supported") {
      answer = { ...answer, status: "partial", confidence: Math.min(answer.confidence, 0.61), verifierNotes: [...answer.verifierNotes, "Evidence bundle found high-risk gaps; downgraded from supported to partial."] };
    }
    if (bundle.supportScore < 0.32) {
      answer = { ...answer, status: "insufficient_evidence", confidence: Math.min(answer.confidence, bundle.supportScore), answer: "I do not have enough grounded multimodal video evidence to answer this reliably.", verifierNotes: [...answer.verifierNotes, "Evidence bundle support score is too low for a user-facing answer."] };
    }
    this.audit.write("ask.completed", { collectionId: options.collectionId, question: options.question, intents: queryPlan.intents, status: answer.status, confidence: answer.confidence, citations: answer.citations.length, bundleSupportScore: bundle.supportScore });
    return answer;
  }

  async ingestBatch(request: BatchIngestRequest): Promise<BatchIngestResult> {
    const results: BatchIngestResult["results"] = new Array(request.sources.length);
    const concurrency = Math.max(1, Math.min(request.concurrency ?? 2, 6));
    let cursor = 0;
    const worker = async () => {
      while (cursor < request.sources.length) {
        const index = cursor++;
        const source = request.sources[index];
        try {
          const result = await this.ingest({ ...source, collectionId: request.collectionId }, { ...(request.options || {}), collectionId: request.collectionId });
          results[index] = { uri: source.uri, videoId: result.video.id, evidenceCount: result.evidenceCount };
        } catch (error) {
          results[index] = { uri: source.uri, error: error instanceof Error ? error.message : String(error) };
        }
      }
    };
    await Promise.all(Array.from({ length: Math.min(concurrency, request.sources.length) }, () => worker()));
    return { collectionId: request.collectionId, total: request.sources.length, succeeded: results.filter(r=>!r.error).length, failed: results.filter(r=>!!r.error).length, results };
  }

  async timeline(collectionId: string, videoId?: string, segmentSeconds?: number): Promise<TimelineSegment[]> {
    const videos = videoId ? (await this.store.listVideos(collectionId)).filter(v=>v.id===videoId) : await this.store.listVideos(collectionId);
    const evidence = await this.store.listEvidence(collectionId, videoId);
    return buildTimeline(videos, evidence, segmentSeconds ?? this.config.defaultSegmentSeconds);
  }

  async stats(collectionId: string): Promise<Record<string, unknown>> {
    const videos = await this.store.listVideos(collectionId);
    const evidence = await this.store.listEvidence(collectionId);
    const memory = await this.store.listMemory(collectionId);
    const byModality = evidence.reduce<Record<string, number>>((acc, ev) => { acc[ev.modality] = (acc[ev.modality] || 0) + 1; return acc; }, {});
    return { collectionId, videos: videos.length, totalHours: Number((videos.reduce((s,v)=>s+v.durationSec,0)/3600).toFixed(2)), evidence: evidence.length, memory: memory.length, byModality };
  }


  async coverage(collectionId: string): Promise<CoverageReport> {
    const videos = await this.store.listVideos(collectionId);
    const evidence = await this.store.listEvidence(collectionId);
    const memory = await this.store.listMemory(collectionId);
    const report = buildCoverageReport(collectionId, videos, evidence, memory);
    this.audit.write("coverage.completed", { collectionId, score: report.score, gaps: report.gaps.length });
    return report;
  }


  queryPlan(question: string) {
    return planQuery(question);
  }

  async manifest(collectionId: string): Promise<CollectionManifest> {
    const videos = await this.store.listVideos(collectionId);
    const evidence = await this.store.listEvidence(collectionId);
    const memory = await this.store.listMemory(collectionId);
    const manifest = buildCollectionManifest(collectionId, videos, evidence, memory);
    this.audit.write("manifest.completed", { collectionId, videos: manifest.videos.length, readiness: manifest.readiness, recommendations: manifest.reindexRecommendations.length });
    return manifest;
  }

  async auditAnswer(options: AskOptions): Promise<{ answer: Answer; audit: AnswerSupportAudit }> {
    const answer = await this.ask(options);
    const audit = buildAnswerSupportAudit(options, answer);
    this.audit.write("answer.audit.completed", { collectionId: options.collectionId, status: answer.status, recommendation: audit.recommendation, weaknesses: audit.weaknesses.length });
    return { answer, audit };
  }

  async premortem(collectionId: string): Promise<VideoRagPremortemReport> {
    const coverage = await this.coverage(collectionId);
    const manifest = await this.manifest(collectionId);
    const report = buildVideoRagPremortem(collectionId, coverage, manifest);
    this.audit.write("premortem.completed", { collectionId, status: report.status, failures: report.failureModes.length });
    return report;
  }

  async reindexPlan(collectionId: string, mode: ReindexPlanRequest["mode"] = "balanced"): Promise<ReindexPlanReport> {
    const manifest = await this.manifest(collectionId);
    const plan = buildReindexPlan(manifest, mode);
    this.audit.write("reindex_plan.completed", { collectionId, mode: plan.mode, steps: plan.steps.length });
    return plan;
  }

  async memoryMap(collectionId: string): Promise<MemoryMapReport> {
    const videos = await this.store.listVideos(collectionId);
    const memory = await this.store.listMemory(collectionId);
    const report = buildMemoryMap(collectionId, videos, memory);
    this.audit.write("memory_map.completed", { collectionId, gaps: report.gaps.length, videos: report.videos.length });
    return report;
  }


  async providerStatus(): Promise<ProviderStatusReport> {
    const report = await buildProviderStatusReport(this.config);
    this.audit.write("provider_status.completed", { readiness: report.readiness, configured: report.configuredCapabilities.length, missing: report.missingCapabilities.length });
    return report;
  }

  async productionGate(params: { source?: VideoSource; options?: IngestOptions; action?: "ingest" | "ask" | "report" | "provider_check" } = {}): Promise<ProductionGateReport> {
    const providerStatus = await this.providerStatus();
    const report = evaluateProductionGate({ config: this.config, providerStatus, action: params.action || "provider_check", source: params.source, options: params.options });
    this.audit.write("production_gate.completed", { status: report.status, action: report.action, blockers: report.blockers.length, requiredCapabilities: report.requiredCapabilities });
    return report;
  }

  async readinessReport(collectionId: string): Promise<ReadinessReport> {
    const stats = await this.stats(collectionId);
    const coverage = await this.coverage(collectionId);
    const manifest = await this.manifest(collectionId);
    const provider = await this.providerStatus();
    const baseStatus = coverage.score >= 0.72 && manifest.readiness !== "research_only" ? "ready" : coverage.score >= 0.35 ? "needs_work" : "blocked";
    const status = this.config.realProviders && provider.readiness === "scaffold_only" ? "blocked" : baseStatus;
    return {
      collectionId,
      status,
      stats: { ...stats, providerReadiness: provider.readiness, storageMode: provider.storageMode },
      coverage: coverage as unknown as Record<string, unknown>,
      recommendations: [...new Set([...coverage.nextActions, ...manifest.reindexRecommendations.slice(0, 5).map(r => `${r.priority}: ${r.action} - ${r.reason}`), ...provider.nextActions.slice(0, 5)])],
      generatedAt: nowIso()
    };
  }

  async spec(goal: string, collectionId = this.config.defaultCollectionId): Promise<{ spec: SpecArtifactBundle; gate: ReturnType<typeof runSpecTraceabilityGate> }> {
    const spec = createVideoRagSpec(goal, collectionId);
    const coverage = await this.coverage(collectionId);
    const health = await import("../ops/health.js").then(m => m.healthCheck(this, collectionId));
    const gate = runSpecTraceabilityGate(spec, { health, coverageScore: coverage.score });
    this.audit.write("spec.created", { specId: spec.specId, collectionId, goal, gate: gate.releaseDecision });
    return { spec, gate };
  }

  private async buildVectors(collectionId: string, rows: Evidence[]): Promise<VectorRow[]> {
    const vectors = await this.embeddings.embedMany(rows.map(r => `${r.modality}: ${r.text}`));
    return rows.map((row, i) => ({ id: id("vec"), collectionId, evidenceId: row.id, dims: vectors[i].length, vector: vectors[i], createdAt: nowIso() }));
  }
}
