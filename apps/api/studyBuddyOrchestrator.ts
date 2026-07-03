import fs from "node:fs";
import path from "node:path";
import { LongVideoRagToolEngine } from "../../packages/video-rag-engine/src/core/engine.js";
import { ForgeVideoRagTool } from "../../packages/video-rag-engine/src/tool/forgeTool.js";
import type { Evidence, MemoryNode, ToolResult, VectorRow, VideoRecord, ForgeToolAction } from "../../packages/video-rag-engine/src/core/types.js";
import { safeSpawn } from "../../packages/video-rag-engine/src/core/safeSpawn.js";
import { HashEmbeddingProvider } from "../../packages/video-rag-engine/src/providers/embeddings.js";
import { fingerprintText, nowIso, id } from "../../packages/video-rag-engine/src/core/utils.js";
import { buildHierarchicalMemory, buildCollectionMemory } from "../../packages/video-rag-engine/src/retrieval/memory.js";
import { routeQuestion, reviewAnswer, blockedAnswer } from "./medicalSafety.js";
import { buildClinicalLesson, generateOsce, generateQuiz, generateRevisionPlan } from "./learningGenerators.js";
import { callOptionalLlm } from "./llmRouter.js";
import { planRequest, TOOL_DISPATCH } from "./requestOrchestrator.js";
import { providerVault } from "./providerVault.js";
import { PremortemLedger, standardPremortem } from "./premortemLedger.js";
import { CognitionEngine, type MemoryRecall } from "./cognitionEngine.js";
import { researchEngine } from "./researchEngine.js";
import { log, logError } from "./logger.js";
import type {
  AgentTraceStep, ArtifactKind, StudyBuddyAskResult, StudyBuddyRoute,
  OrchestratorPlan, PremortemEntry
} from "./studyBuddyTypes.js";

export interface StudyBuddyEngineOptions {
  workspaceRoot?: string;
  dataDir?: string;
  collectionId?: string;
}

type DemoShape = {
  collectionId: string;
  title: string;
  durationSec: number;
  subject: string;
  safetyMode: string;
  transcript: Array<{ startSec: number; endSec: number; text: string }>;
  ocrFrames?: Array<{ startSec: number; endSec: number; text: string }>;
  frameCaptions?: Array<{ startSec: number; endSec: number; text: string }>;
  sop: { name: string; pages: Array<{ page: number; text: string }> };
  goldenQuestions: string[];
};

// ════════════════════════════════════════════════════════════
// UTILITIES
// ════════════════════════════════════════════════════════════

function chunkText(text: string, maxChars = 780): string[] {
  const cleaned = text.replace(/\s+/g, " ").trim();
  if (!cleaned) return [];
  const parts: string[] = [];
  const sentences = cleaned.split(/(?<=[.!?])\s+/).filter(Boolean);
  let buf = "";
  for (const sentence of sentences) {
    if ((buf + " " + sentence).trim().length > maxChars && buf.trim()) { parts.push(buf.trim()); buf = sentence; }
    else buf = (buf + " " + sentence).trim();
  }
  if (buf.trim()) parts.push(buf.trim());
  return parts;
}

function trace(
  agent: string,
  action: string,
  inputSummary: string,
  outputSummary: string,
  tools: string[],
  status: AgentTraceStep["status"] = "succeeded",
  started = Date.now()
): AgentTraceStep {
  return { id: id("agent"), agent, action, inputSummary, outputSummary, status, durationMs: Date.now() - started, tools };
}

function clip(text: string, max = 260): string {
  const cleaned = text.replace(/\s+/g, " ").trim();
  return cleaned.length > max ? `${cleaned.slice(0, max - 3)}...` : cleaned;
}

function compactEvidenceContext(bundle: any): string {
  const items = (bundle?.items || []).slice(0, 4);
  if (!items.length) return "No strong timestamped evidence retrieved.";
  return items.map((item: any, i: number) =>
    `${i + 1}. ${item.timestamp || `${item.startSec}-${item.endSec}s`} ${item.modality}: ${clip(item.excerpt || item.text || "", 220)}`
  ).join("\n");
}

function extractUrl(text: string): string | undefined {
  return text.match(/https?:\/\/[^\s)>\]]+/i)?.[0]?.replace(/[.,;]+$/, "");
}

function isYoutubeUrl(url: string): boolean {
  return /\b(youtube\.com|youtu\.be)\b/i.test(url);
}

function isConversationMemoryQuestion(question: string): boolean {
  return /\b(what did i ask|what was my last|previous question|last question|remember what|what have we discussed|recap our chat|summari[sz]e our conversation|conversation so far|my context)\b/i.test(question);
}

function isClinicalTeachingGeneratorQuestion(question: string): boolean {
  return /\b(osce|station|examiner|rubric|mcq|quiz|flashcards?|revision|study plan)\b/i.test(question)
    && !/\b(youtube\.com|youtu\.be|github|articles?|posts?|blogs?|news|latest|recent research)\b/i.test(question);
}

function safeFileSlug(text: string): string {
  return text.replace(/[^a-z0-9_-]/gi, "_").slice(0, 48) || id("youtube");
}

function youtubeCaptionCacheDir(url: string, workspaceRoot: string): string {
  const parsed = new URL(url);
  const videoId = parsed.hostname.includes("youtu.be")
    ? parsed.pathname.replace(/\//g, "")
    : parsed.searchParams.get("v") || parsed.pathname.replace(/\//g, "_");
  return path.join(workspaceRoot, ".data", "study-buddy", "youtube-captions", safeFileSlug(videoId || url));
}

function cleanVttTranscript(raw: string): string {
  const seen = new Set<string>();
  const lines: string[] = [];
  for (const line of raw.split(/\r?\n/)) {
    const cleaned = line
      .replace(/<\d\d:\d\d:\d\d\.\d+>/g, " ")
      .replace(/<[^>]+>/g, " ")
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/\s+/g, " ")
      .trim();
    if (!cleaned || /^WEBVTT|^Kind:|^Language:|^NOTE\b/i.test(cleaned)) continue;
    if (/^\d\d:\d\d:\d\d\.\d+\s+-->/i.test(cleaned)) continue;
    if (/^\d+$/.test(cleaned)) continue;
    const key = cleaned.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    lines.push(cleaned);
  }
  return lines.join(" ").replace(/\s+/g, " ").trim();
}

function cleanCaptionLine(line: string): string {
  return line
    .replace(/<\d\d:\d\d:\d\d\.\d+>/g, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\s+/g, " ")
    .trim();
}

function shortTimestamp(timestamp: string): string {
  return timestamp.replace(/\.\d+$/, "").replace(/^00:/, "");
}

function extractVttCues(raw: string, maxCues = 90): Array<{ time: string; text: string }> {
  const cues: Array<{ time: string; text: string }> = [];
  const seen = new Set<string>();
  const lines = raw.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const match = lines[i].match(/^(\d\d:\d\d:\d\d\.\d+)\s+-->\s+(\d\d:\d\d:\d\d\.\d+)/);
    if (!match) continue;
    const parts: string[] = [];
    for (let j = i + 1; j < lines.length; j++) {
      const line = lines[j].trim();
      if (!line) { i = j; break; }
      if (/^\d\d:\d\d:\d\d\.\d+\s+-->/i.test(line)) break;
      const cleaned = cleanCaptionLine(line);
      if (cleaned) parts.push(cleaned);
    }
    const text = parts.join(" ").replace(/\s+/g, " ").trim();
    const key = text.toLowerCase();
    if (text.length < 12 || seen.has(key)) continue;
    seen.add(key);
    cues.push({ time: shortTimestamp(match[1]), text: clip(text, 180) });
    if (cues.length >= maxCues) break;
  }
  return cues;
}

async function fetchYoutubeSubtitleTranscript(
  url: string,
  workspaceRoot: string
): Promise<{ text: string; lang: string; source: string; timedCues: Array<{ time: string; text: string }> } | undefined> {
  const outDir = youtubeCaptionCacheDir(url, workspaceRoot);
  const cacheFile = path.join(outDir, "transcript.json");
  if (fs.existsSync(cacheFile)) {
    try {
      const cached = JSON.parse(fs.readFileSync(cacheFile, "utf8")) as { text: string; lang: string; source: string; timedCues: Array<{ time: string; text: string }> };
      if (cached.text?.length > 400) return cached;
    } catch { /* Corrupt cache — fall through to fresh fetch */ }
  }
  fs.mkdirSync(outDir, { recursive: true });
  const outputTemplate = path.join(outDir, "%(id)s.%(ext)s");
  const baseArgs = ["--skip-download", "--write-auto-sub", "--sub-format", "vtt", "-o", outputTemplate];
  const attempts = [
    { lang: "en", args: [...baseArgs, "--sub-langs", "en", url] },
    { lang: "hi-orig", args: [...baseArgs, "--sub-langs", "hi-orig,hi", url] },
  ];
  for (const attempt of attempts) {
    for (const file of fs.readdirSync(outDir).filter((name: string) => name.toLowerCase().endsWith(".vtt"))) {
      fs.rmSync(path.join(outDir, file), { force: true });
    }
    fs.mkdirSync(outDir, { recursive: true });
    try {
      const result = await safeSpawn("yt-dlp", attempt.args, { timeoutMs: 35_000, maxOutputBytes: 4_000_000 });
      if (result.timedOut || result.exitCode !== 0) throw new Error(result.stderr || result.stdout || "yt-dlp subtitles failed");
    } catch { /* Try next language */ }
    const files = fs.existsSync(outDir)
      ? fs.readdirSync(outDir).filter((name: string) => name.toLowerCase().endsWith(".vtt")).map((name: string) => path.join(outDir, name))
      : [];
    const preferred = files.find((file: string) => /\.en\.vtt$/i.test(file)) || files.find((file: string) => /\.hi-orig\.vtt$/i.test(file)) || files.find((file: string) => /\.hi\.vtt$/i.test(file)) || files[0];
    if (!preferred) continue;
    const raw = fs.readFileSync(preferred, "utf8");
    const text = cleanVttTranscript(raw);
    if (text.length > 400) {
      const parsed = { text, lang: path.basename(preferred).match(/\.([^.]+)\.vtt$/)?.[1] || attempt.lang, source: preferred, timedCues: extractVttCues(raw) };
      fs.writeFileSync(cacheFile, JSON.stringify(parsed, null, 2));
      return parsed;
    }
  }
  return undefined;
}

function applyPlanToRoute(route: StudyBuddyRoute, plan: OrchestratorPlan): StudyBuddyRoute {
  if (plan.needsResearch || plan.intent === "research_articles" || plan.intent === "github_repositories" || plan.intent === "external_video_notes") {
    return {
      ...route,
      intent: "RESEARCH_STUDENT_PAIN",
      requiredTools: [...new Set([...plan.tools, "study-buddy.safetyGate"])],
      requiredAgents: [...new Set([...route.requiredAgents, "RequestOrchestrator", "RecentPainPointResearchAgent"])],
      needsVideoRag: false,
      needsDocumentRag: false,
    };
  }
  return {
    ...route,
    requiredTools: [...new Set([...route.requiredTools, ...plan.tools])],
    requiredAgents: [...new Set([...route.requiredAgents, "RequestOrchestrator"])],
  };
}

// ════════════════════════════════════════════════════════════
// MAIN ORCHESTRATOR
// ════════════════════════════════════════════════════════════

export class StudyBuddyOrchestrator {
  readonly collectionId: string;
  readonly engine: LongVideoRagToolEngine;
  readonly forgeTool: ForgeVideoRagTool;
  private embeddings: HashEmbeddingProvider;
  private workspaceRoot: string;
  private ledger: PremortemLedger;
  private cognition: CognitionEngine;

  constructor(options: StudyBuddyEngineOptions = {}) {
    this.workspaceRoot = options.workspaceRoot || process.cwd();
    this.collectionId = options.collectionId || process.env.STUDY_BUDDY_DEFAULT_COLLECTION || "study-buddy-demo";
    const dataDir = options.dataDir || process.env.FORGE_VIDEO_RAG_DATA_DIR || path.join(this.workspaceRoot, ".data", "study-buddy", "video-rag");
    const realProviders = process.env.FORGE_VIDEO_RAG_REAL_PROVIDERS === "true";
    const storeMode = process.env.FORGE_VIDEO_RAG_STORE === "sqlite-cli" ? "sqlite-cli" : "json";
    this.engine = new LongVideoRagToolEngine({ config: { dataDir, defaultCollectionId: this.collectionId, workspaceRoot: this.workspaceRoot, realProviders, storeMode } });
    this.forgeTool = new ForgeVideoRagTool(this.engine);
    this.embeddings = new HashEmbeddingProvider(Number(process.env.FORGE_VIDEO_RAG_EMBED_DIMS || 384));
    this.ledger = new PremortemLedger(dataDir);
    // Tri-layer cognition engine — isolated per dataDir so tests don't share session state
    this.cognition = new CognitionEngine(dataDir);
  }

  private pre(module: string, stage: string, extra?: Partial<PremortemEntry>): PremortemEntry {
    return this.ledger.record({ ...standardPremortem(module, stage), ...(extra || {}) });
  }

  private async videoTool<T = unknown>(action: ForgeToolAction, payload: Record<string, unknown>): Promise<ToolResult<T>> {
    this.pre("FORGE VideoRAG Tool", action, {
      likelyFailures: ["Action payload can be unsafe, unsupported, or evidence-poor.", "Tool action can return ok=false."],
      mitigations: ["Use ForgeVideoRagTool.invoke.", "Expose ok/error in ops panel.", "Route risky actions through safety gate."],
    });
    return this.forgeTool.invoke({ action, workspaceId: "study-buddy-workspace", userId: "local-user", approved: true, payload, traceId: id("trace") }) as Promise<ToolResult<T>>;
  }

  // ── GOLDEN DEMO ───────────────────────────────────────────

  async loadGoldenDemo(): Promise<Record<string, unknown>> {
    const p = this.pre("Golden Demo", "load", {
      likelyFailures: ["Demo can become static and fake."],
      mitigations: ["Insert evidence into the v7 VideoRAG store.", "Return full dashboard proof."],
    });
    const demoPath = path.join(this.workspaceRoot, "data", "demo", "iv_cannulation", "golden-demo.json");
    const demo = JSON.parse(fs.readFileSync(demoPath, "utf8")) as DemoShape;
    await this.ingestDemoShape(demo);
    const dashboard = await this.dashboard(demo.collectionId);
    return { ok: true, premortem: p, collectionId: demo.collectionId, title: demo.title, goldenQuestions: demo.goldenQuestions, ...dashboard };
  }

  // ── INGEST ────────────────────────────────────────────────

  async planVideoIngest(input: { sourceType?: "youtube" | "local" | "remote" | "synthetic"; uri: string; collectionId?: string; title?: string }): Promise<Record<string, unknown>> {
    this.pre("Video Ingest", "production preflight", {
      likelyFailures: ["Real MP4/YouTube ingest may need missing ffmpeg, yt-dlp, transcription, OCR, or embedding providers."],
      mitigations: ["Call v7 video.plan and productionGate before ingest.", "Fail closed until providers are configured."],
    });
    const collectionId = input.collectionId || this.collectionId;
    const source = { sourceType: input.sourceType || "local", uri: input.uri, collectionId, title: input.title };
    const [plan, gate, status, e2e] = await Promise.all([
      this.videoTool("video.plan", { source, options: { collectionId } }),
      this.videoTool("video.productionGate", { source, action: "ingest", options: { collectionId } }),
      this.videoTool("video.providerStatus", {}),
      this.videoTool("video.e2ePlan", { collectionId }),
    ]);
    return { ok: true, collectionId, plan, productionGate: gate, providerStatus: status, e2ePlan: e2e, premortem: this.ledger.read(5) };
  }

  async ingestTranscriptAndDocument(input: { collectionId?: string; title?: string; transcriptText?: string; documentText?: string; transcriptSegments?: Array<{ startSec: number; endSec: number; text: string }> }): Promise<Record<string, unknown>> {
    const collectionId = input.collectionId || this.collectionId;
    this.pre("Transcript + SOP Ingest", "fallback evidence build", {
      likelyFailures: ["Empty transcript/document can create fake readiness.", "Chunks can miss timestamps."],
      mitigations: ["Reject empty input.", "Create synthetic timestamp windows.", "Store evidence in v7 store."],
    });
    if (!input.transcriptText && !input.documentText && !input.transcriptSegments?.length) throw new Error("Provide transcriptText, documentText, or transcriptSegments.");
    const store = this.engine.getStore();
    const videoId = `${collectionId}_custom_video`;
    const docId = `${collectionId}_custom_document`;
    const video: VideoRecord = { id: videoId, collectionId, uri: `study-buddy://custom/${collectionId}/transcript`, title: input.title || "Uploaded Transcript Session", sourceType: "synthetic", durationSec: 1800, createdAt: nowIso(), status: "indexed", metadata: { studyBuddy: true, sourceKind: "custom-transcript", safetyMode: "education_only" } };
    const doc: VideoRecord = { id: docId, collectionId, uri: `study-buddy://custom/${collectionId}/document`, title: input.title ? `${input.title} SOP` : "Uploaded SOP / Notes", sourceType: "synthetic", durationSec: 1, createdAt: nowIso(), status: "indexed", metadata: { studyBuddy: true, sourceKind: "custom-document", safetyMode: "education_only" } };
    await store.upsertVideo(video); await store.upsertVideo(doc);
    const evidence: Evidence[] = [];
    const segments = input.transcriptSegments?.length ? input.transcriptSegments : chunkText(input.transcriptText || "").map((text, i) => ({ startSec: i * 45, endSec: i * 45 + 44, text }));
    for (let i = 0; i < segments.length; i++) {
      const row = segments[i];
      const text = `${row.text} [Study-Buddy transcript evidence - education only.]`;
      evidence.push({ id: `${collectionId}_custom_tr_${i.toString().padStart(3, "0")}`, collectionId, videoId, modality: "transcript", startSec: row.startSec, endSec: row.endSec, text, confidence: 0.88, metadata: { provider: "custom-transcript-loader", safetyMode: "education_only" }, fingerprint: fingerprintText(text), createdAt: nowIso() });
    }
    chunkText(input.documentText || "").forEach((text, i) => {
      const full = `Uploaded document section ${i + 1}: ${text}`;
      evidence.push({ id: `${collectionId}_custom_doc_${i.toString().padStart(3, "0")}`, collectionId, videoId: docId, modality: "summary", startSec: i, endSec: i + 1, text: full, confidence: 0.86, metadata: { provider: "custom-document-loader", sourceKind: "sop_or_notes", section: i + 1, safetyMode: "education_only" }, fingerprint: fingerprintText(full), createdAt: nowIso() });
    });
    if (!evidence.length) throw new Error("No evidence chunks were created.");
    await store.addEvidence(evidence);
    await store.addVectors(await this.buildVectors(collectionId, evidence));
    const memory: MemoryNode[] = [...buildHierarchicalMemory(video, evidence.filter(e => e.videoId === videoId), 90), ...buildHierarchicalMemory(doc, evidence.filter(e => e.videoId === docId), 1)];
    await store.addMemory(memory);
    const videos = await store.listVideos(collectionId); const existingMemory = await store.listMemory(collectionId);
    await store.addMemory([buildCollectionMemory(collectionId, videos, existingMemory)]);
    return { ok: true, collectionId, evidenceCount: evidence.length, memoryCount: memory.length + 1, ...(await this.dashboard(collectionId)) };
  }

  // ── MAIN ASK PIPELINE ─────────────────────────────────────

  async ask(question: string, collectionId = this.collectionId, sessionId = collectionId): Promise<StudyBuddyAskResult> {
    const premortem = [this.pre("Ask Pipeline", "route question"), this.pre("Ask Pipeline", "retrieve evidence")];
    const agentTrace: AgentTraceStep[] = [];
    const t0 = Date.now();

    log.info("orchestrator", `ask start`, { question: question.slice(0, 100), sessionId, collectionId });

    // ── STAGE 0: AUTO-RECALL (runs BEFORE planning — fixes context loss) ──
    const memory = this.cognition.recall(sessionId, question);
    this.cognition.addTurn(sessionId, "user", question);

    agentTrace.push(trace(
      "ConversationMemoryAgent", "recall tri-layer context", question,
      `episodic=${memory.recentTurns.length + memory.relevantTurns.length} semantic=${memory.semanticContext.length} procedural=${memory.proceduralInsights.length}`,
      ["cognition.memory.recall"], "succeeded", t0
    ));

    // Enrich question with remembered context (URL, prior topic)
    const effectiveQuestion = this.enrichQuestion(question, memory);
    if (effectiveQuestion !== question) {
      agentTrace.push(trace("ConversationMemoryAgent", "resolve remembered source", question, "retrieved remembered source URL from session semantic memory", ["cognition.memory.recall"], "succeeded", t0));
    }

    // ── STAGE 1: PLAN (LLM or deterministic, with memory context) ──
    log.debug("orchestrator", `stage-1 plan`, { effectiveQuestion: effectiveQuestion.slice(0, 100) });
    const plan = await planRequest(effectiveQuestion, memory.contextBlock.slice(0, 400));
    agentTrace.push(trace(
      "RequestOrchestrator", "plan tools",
      effectiveQuestion,
      `intent=${plan.intent} playbook="${plan.playbook}" confidence=${plan.confidence.toFixed(2)} tools=${plan.tools.join(",")} multiSource=${plan.isMultiSource}`,
      ["study-buddy.llmPlanner"], plan.confidence >= 0.35 ? "succeeded" : "warning", t0
    ));

    // ── STAGE 2: ROUTE + SAFETY GATE ──
    const baseRoute = routeQuestion(effectiveQuestion);
    const route = isClinicalTeachingGeneratorQuestion(effectiveQuestion) ? baseRoute : applyPlanToRoute(baseRoute, plan);
    log.info("orchestrator", `routed`, { intent: route.intent, planIntent: plan.intent, risk: route.riskLevel, blocked: route.blocked, playbook: plan.playbook });
    agentTrace.push(trace("RouterAgent", "classify", effectiveQuestion, `${route.intent} / ${route.riskLevel} / blocked=${route.blocked}`, ["study-buddy.riskClassifier"], route.blocked ? "blocked" : "succeeded", t0));

    if (route.blocked) {
      const safetyAudit = reviewAnswer(question, route);
      agentTrace.push(trace("SafetyReviewerAgent", "block unsafe request", question, safetyAudit.finalSafetyNote, ["study-buddy.safetyGate"], "blocked"));
      const answer = blockedAnswer(route);
      this.cognition.addTurn(sessionId, "assistant", answer, route.intent);
      this.cognition.recordProcedure(sessionId, route.intent, false);
      return { ok: true, sessionId, collectionId, route, orchestratorPlan: plan, answer, safetyAudit, agentTrace, premortem, ops: { memory: this.cognition.stats(sessionId) } };
    }

    // ── STAGE 3: ROUTE DECISION ──
    if (isConversationMemoryQuestion(question)) {
      return this.answerConversationMemoryQuestion(question, collectionId, sessionId, route, plan, memory, agentTrace, premortem);
    }

    if (route.intent === "ASK_VIDEO" && plan.intent === "unknown" && !plan.needsClinicalVideoRag && !plan.needsResearch && plan.tools.includes("study-buddy.answer")) {
      return this.answerGeneralQuestion(question, collectionId, sessionId, route, plan, memory, agentTrace, premortem);
    }

    if (route.intent === "RESEARCH_STUDENT_PAIN") {
      return this.answerResearchQuestion(effectiveQuestion, collectionId, sessionId, route, plan, agentTrace, premortem);
    }

    // ── STAGE 4: CLINICAL VideoRAG PIPELINE ──
    log.info("orchestrator", `stage-4 VideoRAG`, { collectionId });
    const queryPlan = await this.videoTool("video.queryPlan", { question: effectiveQuestion });
    if (!queryPlan.ok) log.warn("orchestrator", `video.queryPlan failed`, { error: queryPlan.error });
    agentTrace.push(trace("VideoRagQueryPlanner", "plan query", effectiveQuestion, queryPlan.ok ? "query plan generated" : String(queryPlan.error), ["video.queryPlan"], queryPlan.ok ? "succeeded" : "warning"));

    const search = await this.videoTool<any>("video.search", { collectionId, question: effectiveQuestion, topK: 12, limit: 16 });
    const bundle = search.data;
    agentTrace.push(trace("VideoEvidenceAgent", "search evidence", effectiveQuestion, `support=${bundle?.supportScore ?? "n/a"}, items=${bundle?.items?.length ?? 0}`, ["video.search"], search.ok ? "succeeded" : "warning"));

    const auditResult = await this.videoTool<any>("video.auditAnswer", { collectionId, question: effectiveQuestion, topK: 10 });
    const videoRagAnswer = auditResult.data?.answer;
    const videoRagSupportAudit = auditResult.data?.audit;
    agentTrace.push(trace("AnswerSupportAuditAgent", "audit answer support", effectiveQuestion, videoRagSupportAudit?.recommendation || "audit unavailable", ["video.auditAnswer"], auditResult.ok ? "succeeded" : "warning"));

    // ── STAGE 5: SAFETY REVIEW ──
    const safetyAudit = reviewAnswer(effectiveQuestion, route, videoRagAnswer, bundle);
    agentTrace.push(trace("SafetyReviewerAgent", "review answer", effectiveQuestion, safetyAudit.decision, ["study-buddy.safetyGate"], safetyAudit.evidenceGate.passed ? "succeeded" : "warning"));

    // ── STAGE 6: ANSWER COMPOSITION ──
    let answer = buildClinicalLesson(effectiveQuestion, bundle);
    const llm = await callOptionalLlm([
      {
        role: "system",
        content: "You are Study-Buddy. Improve this supervised clinical-skills education answer using only the compact evidence provided. Do not add unsupported facts. Do not diagnose, prescribe, or give dosage. Keep timestamps and a brief safety note. Do not include raw JSON or internal audit objects.",
      },
      {
        role: "user",
        content: `Conversation memory, for continuity only. Do not use as clinical evidence:\n${clip(memory.contextBlock, 900)}\n\nQuestion: ${clip(effectiveQuestion, 300)}\n\nDraft answer:\n${clip(answer, 1400)}\n\nCompact evidence:\n${compactEvidenceContext(bundle)}\n\nSafety note: ${safetyAudit.finalSafetyNote}`,
      },
    ]);
    if (llm.text && !llm.error) {
      answer = llm.text;
      agentTrace.push(trace("OptionalLLMComposer", "polish answer", question, `used ${llm.provider}`, ["study-buddy.llmRouter"], "succeeded"));
    } else if (llm.error) {
      agentTrace.push(trace("OptionalLLMComposer", "fallback deterministic", question, llm.error, ["study-buddy.llmRouter"], "warning"));
    }

    // ── STAGE 7: LEARNING GENERATORS ──
    let osce, quiz, revisionPlan;
    if (route.intent === "GENERATE_OSCE") {
      osce = generateOsce(bundle);
      answer += `\n\n## OSCE Station\n${osce.title}\nCandidate task: ${osce.candidateTask}`;
      agentTrace.push(trace("OSCEExaminerAgent", "generate station", effectiveQuestion, `${osce.examinerChecklist.length} checklist items`, ["study-buddy.generateOSCE"], "succeeded"));
    }
    if (route.intent === "GENERATE_QUIZ" || route.intent === "GENERATE_FLASHCARDS") {
      quiz = generateQuiz(bundle);
      answer += `\n\n## Quiz Pack\nGenerated ${quiz.mcqs.length} MCQs and ${quiz.flashcards.length} flashcards.`;
      agentTrace.push(trace("QuizFlashcardAgent", "generate quiz", effectiveQuestion, `${quiz.mcqs.length} MCQs`, ["study-buddy.generateQuiz"], "succeeded"));
    }
    if (route.intent === "REVISION_PLAN") {
      revisionPlan = generateRevisionPlan(bundle);
      answer += `\n\n## Revision Plan\nToday: ${revisionPlan.today.join(" ")}`;
      agentTrace.push(trace("RevisionPlannerAgent", "generate revision plan", effectiveQuestion, `${revisionPlan.weakTopics.length} weak topics`, ["study-buddy.generateRevisionPlan"], "succeeded"));
    }

    // ── MEMORY CONSOLIDATION ──
    const ops = await this.lightOps(collectionId);
    const suggestedArtifact = this.artifactFromPlan(plan, effectiveQuestion, answer);
    this.cognition.addTurn(sessionId, "assistant", answer, route.intent);
    this.cognition.recordProcedure(sessionId, route.intent, true, 0.85);

    return { ok: true, sessionId, collectionId, route, orchestratorPlan: plan, answer, videoRagAnswer, videoRagSupportAudit, evidenceBundle: bundle, safetyAudit, agentTrace, osce, quiz, revisionPlan, ops: { ...ops, memory: this.cognition.stats(sessionId) }, premortem: this.ledger.read(8), suggestedArtifact };
  }

  // ── RESEARCH PIPELINE ─────────────────────────────────────
  // Unified research with last30days as search engine

  private async answerResearchQuestion(
    question: string,
    collectionId: string,
    sessionId: string,
    route: ReturnType<typeof routeQuestion>,
    plan: OrchestratorPlan,
    agentTrace: AgentTraceStep[],
    premortem: PremortemEntry[]
  ): Promise<StudyBuddyAskResult> {
    const safetyAudit = reviewAnswer(question, route);
    let answer: string;

    // Entry trace — always present so tests and dashboards can assert on this agent name
    log.info("orchestrator", `research route`, { intent: plan.intent, tools: plan.tools.slice(0, 4).join(","), isMultiSource: plan.isMultiSource });
    agentTrace.push(trace(
      "RecentPainPointResearchAgent",
      "route research request",
      question,
      `playbook="${plan.playbook}" intent="${plan.intent}" multi=${plan.isMultiSource} tools=${plan.tools.slice(0, 4).join(",")}`,
      ["last30days.skill.plan", "study-buddy.safetyGate"],
      "succeeded",
      Date.now()
    ));

    if (plan.intent === "external_video_notes" || plan.tools.includes("youtube.metadata")) {
      // ── YouTube / External Video Notes ──
      const started = Date.now();
      answer = await this.externalVideoNotesAnswer(plan.searchQuery || question);
      agentTrace.push(trace("ExternalVideoNotesAgent", "fetch external video captions", question, "YouTube source isolated from clinical demo evidence", ["youtube.metadata", "youtube.transcript_or_ingest"], "succeeded", started));

    } else if (plan.intent === "github_repositories" || plan.tools.includes("github.search.repositories")) {
      // ── GitHub Repositories (last30days) ──
      const started = Date.now();
      const result = await researchEngine.searchRepositories(question);
      answer = result.answer;
      agentTrace.push(trace("GitHubSearchAgent", "search repositories", question, `${result.hits.length} repos found in 30d (${result.durationMs}ms)`, ["github.search.repositories", "last30days.skill.plan"], result.ok ? "succeeded" : "warning", started));

    } else if (plan.isMultiSource || plan.tools.includes("last30days.multi")) {
      // ── Multi-source parallel research (last30days engine) ──
      const started = Date.now();
      const result = await researchEngine.searchMultiSource(question, 5);
      answer = result.answer;
      agentTrace.push(trace("DeepResearchAnalyst", "multi-source research", question, `${result.hits.length} hits across ${result.source} sources (${result.durationMs}ms) themes: ${result.themes.slice(0, 3).join(", ")}`, ["last30days.multi", "pubmed.search", "github.search.repositories"], result.ok ? "succeeded" : "warning", started));

    } else if (plan.tools.includes("pubmed.search") || /\b(cancer|tumou?r|oncology|diagnosis|biomarker|pubmed)\b/i.test(question)) {
      // ── PubMed biomedical ──
      const started = Date.now();
      const result = await researchEngine.searchBiomedical(question);
      answer = result.answer;
      agentTrace.push(trace("BiomedicalResearchAgent", "search biomedical literature", question, `${result.hits.length} PubMed records (${result.durationMs}ms)`, ["pubmed.search", "arxiv.search", "last30days.skill.plan"], result.ok ? "succeeded" : "warning", started));

    } else {
      // ── Default: HN + last30days. Pass original question so hnQuery does its own cleaning. ──
      const started = Date.now();
      const result = await researchEngine.searchWithSynthesis(question);
      answer = result.answer;
      agentTrace.push(trace("ArticleSearchAgent", "search recent articles", question, `${result.hits.length} HN stories (${result.durationMs}ms)`, ["hn.algolia.search_by_date", "last30days.skill.plan"], result.ok ? "succeeded" : "warning", started));
    }

    const suggestedArtifact = this.artifactFromPlan(plan, question, answer);
    this.cognition.addTurn(sessionId, "assistant", answer, route.intent);
    this.cognition.recordProcedure(sessionId, route.intent, true, 0.72);
    return { ok: true, sessionId, collectionId, route, orchestratorPlan: plan, answer, safetyAudit, agentTrace, premortem, suggestedArtifact, ops: { memory: this.cognition.stats(sessionId) } };
  }

  // ── GENERAL QUESTION ─────────────────────────────────────

  private answerGeneralQuestion(
    question: string,
    collectionId: string,
    sessionId: string,
    route: ReturnType<typeof routeQuestion>,
    plan: OrchestratorPlan,
    memory: MemoryRecall,
    agentTrace: AgentTraceStep[],
    premortem: PremortemEntry[]
  ): StudyBuddyAskResult {
    const generalRoute: StudyBuddyRoute = { ...route, intent: "ASK_VIDEO", requiredTools: ["study-buddy.answer", "study-buddy.safetyGate"], requiredAgents: ["RequestOrchestrator", "GeneralAssistantAgent", "SafetyReviewerAgent"], needsVideoRag: false, needsDocumentRag: false };
    const safetyAudit = reviewAnswer(question, generalRoute);
    agentTrace.push(trace("GeneralAssistantAgent", "answer capability question", question, "answered without clinical VideoRAG", ["study-buddy.answer"], "succeeded"));
    const answer = [
      "# Study-Buddy Can Help With",
      "",
      "## Clinical Learning From Uploaded Material",
      "Ask questions about an ingested video, SOP, or transcript and Study-Buddy will answer with timestamped evidence.",
      "",
      "## Research And Repositories (last30days Engine)",
      "Ask for recent articles, biomedical research (PubMed), GitHub repository briefs, or arXiv preprints. Powered by the last30days multi-source search engine.",
      "",
      "## External Video Notes",
      "Paste a YouTube URL and Study-Buddy retrieves captions and generates timestamped notes. Separate from clinical demo evidence.",
      "",
      "## Artifacts",
      "Ask for a DOCX, PDF, PPT, chart, or study pack after any answer.",
      "",
      "## Safety Boundary",
      "Study-Buddy is for supervised education. It does not provide patient-specific diagnosis, treatment, dosage, or emergency guidance.",
      "",
      memory.proceduralInsights.length ? `## Session Activity\n${memory.proceduralInsights.map(i => `• ${i}`).join("\n")}` : "",
    ].filter(Boolean).join("\n");
    this.cognition.addTurn(sessionId, "assistant", answer, generalRoute.intent);
    this.cognition.recordProcedure(sessionId, "GENERAL_ASSISTANT", true, 0.60);
    return { ok: true, sessionId, collectionId, route: generalRoute, orchestratorPlan: plan, answer, safetyAudit, agentTrace, premortem, ops: { memory: this.cognition.stats(sessionId) } };
  }

  // ── MEMORY QUESTION ───────────────────────────────────────

  private answerConversationMemoryQuestion(
    question: string,
    collectionId: string,
    sessionId: string,
    route: ReturnType<typeof routeQuestion>,
    plan: OrchestratorPlan,
    memory: MemoryRecall,
    agentTrace: AgentTraceStep[],
    premortem: PremortemEntry[]
  ): StudyBuddyAskResult {
    const memoryRoute: StudyBuddyRoute = { ...route, intent: "ASK_VIDEO", requiredTools: ["cognition.memory.recall", "study-buddy.safetyGate"], requiredAgents: ["ConversationMemoryAgent", "GeneralAssistantAgent", "SafetyReviewerAgent"], needsVideoRag: false, needsDocumentRag: false };
    const safetyAudit = reviewAnswer(question, memoryRoute);
    const userTurns = memory.recentTurns.filter(t => t.role === "user");
    const lastUserTurn = userTurns.at(-1);
    const answer = [
      "# Conversation Memory",
      "",
      "## Most Recent Request",
      lastUserTurn ? `Your previous request: ${lastUserTurn.text}` : "No previous request stored for this session.",
      "",
      "## Session Summary",
      memory.summary || "No session summary built yet.",
      "",
      memory.semanticProfile ? `## What We've Discussed\n${memory.semanticProfile}` : "",
      "",
      memory.semanticContext.length ? `## Known Topics (from semantic memory)\n${memory.semanticContext.slice(0, 5).map(n => `• ${n.concept} (confidence: ${(n.confidence * 100).toFixed(0)}%)`).join("\n")}` : "",
      "",
      "## Recent Turns",
      ...memory.recentTurns.slice(-6).map(t => `- ${t.role}: ${clip(t.text, 240)}`),
      "",
      memory.proceduralInsights.length ? `## What You've Practiced\n${memory.proceduralInsights.map(i => `• ${i}`).join("\n")}` : "",
      "",
      "## Memory Boundary",
      "This memory is for conversation continuity only. Clinical, research, GitHub, and YouTube answers still need their proper evidence sources.",
    ].filter(Boolean).join("\n");
    agentTrace.push(trace("ConversationMemoryAgent", "answer memory question", question, `episodic=${memory.recentTurns.length} semantic=${memory.semanticContext.length}`, ["cognition.memory.recall"], "succeeded"));
    this.cognition.addTurn(sessionId, "assistant", answer, memoryRoute.intent);
    this.cognition.recordProcedure(sessionId, "CONVERSATION_MEMORY", true, 0.65);
    return { ok: true, sessionId, collectionId, route: memoryRoute, orchestratorPlan: plan, answer, safetyAudit, agentTrace, premortem, ops: { memory: this.cognition.stats(sessionId) } };
  }

  // ── QUESTION ENRICHMENT ───────────────────────────────────

  private enrichQuestion(question: string, memory: MemoryRecall): string {
    // If question references "this video" but has no URL, check semantic memory
    if (!extractUrl(question) && /\b(this|that|the|previous|last|it)\s+(video|youtube|link)\b/i.test(question)) {
      const url = this.cognition.rememberedVideoUrl(memory.sessionId);
      if (url) return `${question}\n\nRemembered source from this chat: ${url}`;
    }
    return question;
  }

  // ── ARTIFACT HELPER ───────────────────────────────────────

  private artifactFromPlan(plan: OrchestratorPlan, question: string, sourceText: string) {
    if (!plan.needsArtifact || !plan.artifactKind) return undefined;
    return {
      kind: plan.artifactKind as ArtifactKind,
      title: plan.artifactTitle || (plan.needsResearch ? "Latest Research Brief" : `Study-Buddy ${plan.artifactKind}`),
      prompt: plan.needsResearch ? "Create a clean research artifact from the latest Study-Buddy answer." : "Create a clean Study-Buddy learning artifact from the latest answer.",
      sourceText,
    };
  }

  // ── YOUTUBE NOTES ─────────────────────────────────────────

  private async externalVideoNotesAnswer(question: string): Promise<string> {
    const url = extractUrl(question);
    let title = "External video";
    let author = "";
    if (url && isYoutubeUrl(url)) {
      try {
        const endpoint = `https://www.youtube.com/oembed?url=${encodeURIComponent(url)}&format=json`;
        const response = await fetch(endpoint, { headers: { accept: "application/json", "user-agent": "Study-Buddy-local" } });
        if (response.ok) { const data = await response.json() as any; title = data.title || title; author = data.author_name || ""; }
      } catch { /* Metadata is optional */ }
    }
    if (url && isYoutubeUrl(url)) {
      const transcript = await fetchYoutubeSubtitleTranscript(url, this.workspaceRoot);
      if (transcript?.text) {
        const notes = await this.composeExternalVideoNotes({ title, author, url, lang: transcript.lang, transcript: transcript.text, timedCues: transcript.timedCues });
        if (notes) return notes;
        const timingMap = transcript.timedCues.slice(0, 10).map(cue => `- ${cue.time}: ${cue.text}`);
        return ["# Video Notes Workspace", "", `## Source\nVideo: ${title}${author ? ` by ${author}` : ""}\nLink: ${url}\nTranscript: retrieved from YouTube captions (${transcript.lang}).`, "", "## Timing Map", ...(timingMap.length ? timingMap : ["Timing cues unavailable."]), "", "## Caption Excerpt", transcript.text.slice(0, 1000), "", "## Guardrail", "Notes based only on retrieved captions for this video, not on unrelated stored demo evidence."].join("\n");
      }
    }
    return ["# Video Notes Workspace", "", `## Source\nVideo: ${title}${author ? ` by ${author}` : ""}\n${url ? `Link: ${url}` : "Link: not detected"}`, "", "## Direct Answer", "Cannot create accurate notes until Study-Buddy has captions or an ingested evidence record for this exact source.", "", "## What I Can Do Safely", "1. Paste the transcript/captions, then ask for notes again.", "2. Attach a .txt, .md, .srt, or .vtt transcript file.", "3. Run the video ingest preflight first.", "", "## Guardrail", "This external video is not the ingested demo collection. Study-Buddy will not reuse unrelated stored evidence."].join("\n");
  }

  private async composeExternalVideoNotes(input: { title: string; author: string; url: string; lang: string; transcript: string; timedCues: Array<{ time: string; text: string }> }): Promise<string | undefined> {
    const transcript = input.transcript.slice(0, 18_000);
    const timingMap = input.timedCues.slice(0, 35).map(cue => `${cue.time}: ${cue.text}`).join("\n");
    const llm = await callOptionalLlm([
      { role: "system", content: "You write concise study notes from a retrieved YouTube caption transcript. Translate if Hindi/Urdu/Hinglish. Use only the transcript and metadata. Return polished Markdown: Direct Answer, Short Notes, Timing Map, Key Terms, Exam Focus, Source. Use only provided caption cue timestamps." },
      { role: "user", content: [`Video title: ${input.title}`, input.author ? `Author/channel: ${input.author}` : "", `URL: ${input.url}`, `Caption language: ${input.lang}`, "", timingMap ? `Caption timing cues:\n${timingMap}` : "Timing cues: not available", "", "Transcript excerpt:", transcript].filter(Boolean).join("\n") },
    ], { maxTokens: 1100, temperature: 0.1 });
    if (!llm.text || llm.error) return undefined;
    return [llm.text.trim(), "", `## Grounding\nNotes from retrieved YouTube captions (${input.lang}) for the linked video.`].join("\n");
  }

  // ── DASHBOARD & OPS ───────────────────────────────────────

  async dashboard(collectionId = this.collectionId): Promise<Record<string, unknown>> {
    this.pre("Ops Dashboard", "load all proof panels", {
      likelyFailures: ["Dashboard may hide production blockers.", "Readiness can be overclaimed."],
      mitigations: ["Return all proof panels together.", "Never convert blocked into green."],
    });
    const [stats, coverage, manifest, memoryMap, reindexPlan, providerStatus, productionGate, premortem, readiness, timeline] = await Promise.all([
      this.engine.stats(collectionId), this.engine.coverage(collectionId), this.engine.manifest(collectionId),
      this.engine.memoryMap(collectionId), this.engine.reindexPlan(collectionId, "production_hardening"),
      this.engine.providerStatus(), this.engine.productionGate({ action: "provider_check" }),
      this.engine.premortem(collectionId), this.engine.readinessReport(collectionId), this.engine.timeline(collectionId),
    ]);
    return {
      collectionId, stats, coverage, manifest, memoryMap, reindexPlan, providerStatus,
      productionGate, premortem, readiness, timeline,
      providerVault: providerVault(),
      premortemLedger: this.ledger.read(20),
      skillsRegistry: this.skillsRegistry(),
      agentRegistry: this.agentRegistry(),
      toolDispatch: Object.entries(TOOL_DISPATCH).map(([tool, d]) => ({ tool, skill: d.skill, description: d.description, requiresApproval: d.requiresApproval })),
    };
  }

  async lightOps(collectionId = this.collectionId): Promise<Record<string, unknown>> {
    const [readiness, productionGate, providerStatus] = await Promise.all([
      this.engine.readinessReport(collectionId),
      this.engine.productionGate({ action: "ask" }),
      this.engine.providerStatus(),
    ]);
    return { readiness, productionGate, providerStatus, providerVault: providerVault() };
  }

  conversationMemoryStats(sessionId?: string): Record<string, unknown> {
    return this.cognition.stats(sessionId);
  }

  researchPlan(topic = "medical students OSCE struggles"): Record<string, unknown> {
    this.pre("last30days Research Skill", "prepare market-pain research", {
      likelyFailures: ["Skill can be misused as ordinary web search.", "Research can leak into clinical answers."],
      mitigations: ["Keep last30days as workshop/product research layer only.", "Do not use as clinical evidence for patient questions."],
    });
    return {
      ok: true,
      topic,
      commandIntent: `/last30days ${topic}`,
      role: "RecentPainPointResearchAgent",
      engine: "researchEngine.ts (multi-source: HN + PubMed + GitHub + arXiv)",
      sources: ["Hacker News (Algolia)", "PubMed eUtils", "GitHub API", "arXiv Atom API"],
      outputsToStore: ["student pain points", "OSCE confusion", "nursing skill mistakes", "quiz topics"],
      note: "Do not use recent social data as clinical evidence. Research results kept separate from clinical VideoRAG evidence.",
    };
  }

  // ── SKILLS & AGENT REGISTRY (ALL 23 FORGE SKILLS) ────────

  skillsRegistry(): Array<{ name: string; usedAs: string; forgeSkill: string }> {
    return [
      // Original 17 + 6 new from FORGE Skills desktop
      { name: "Forge-Next-level-Frontend", forgeSkill: "Forge-Next-level-Frontend", usedAs: "premium light UI, motion, skeletons, tabs, breadcrumbs, carousel, accordions" },
      { name: "forge-agentic-product-architect", forgeSkill: "forge-agentic-product-architect", usedAs: "product scope, value proposition, workshop/demo/product split, 100 operating rules" },
      { name: "forge-multiagent-orchestrator-builder", forgeSkill: "forge-multiagent-orchestrator-builder", usedAs: "router, agents, tool calls, traces, 7-stage orchestration model" },
      { name: "forge-memory-rag-knowledge-engineer", forgeSkill: "forge-memory-rag-knowledge-engineer", usedAs: "VideoRAG, SOP RAG, tri-layer cognition, evidence bundles, memory maps" },
      { name: "agentic-evaluation-scientist", forgeSkill: "agentic-evaluation-scientist", usedAs: "evidence gates, support audit, answer quality scoring, regression tests" },
      { name: "forge-production-observability-sre", forgeSkill: "forge-production-observability-sre", usedAs: "provider status, production gate, readiness, audit, SLO budgets" },
      { name: "agentic-deployment-release-engineer", forgeSkill: "agentic-deployment-release-engineer", usedAs: "Docker, Render, local deployment, canary release gates" },
      { name: "forge-secure-code-audit-agent", forgeSkill: "forge-secure-code-audit-agent", usedAs: "medical safety, path/tool safety, fail-closed design, code security review" },
      { name: "last30days", forgeSkill: "last30days", usedAs: "multi-source search engine: HN + PubMed + GitHub + arXiv (student pain-point research, not clinical evidence)" },
      // New skills from desktop directory
      { name: "agentic-workflow-automation-architect", forgeSkill: "agentic-workflow-automation-architect", usedAs: "deterministic automation before agents, process map design, approval checkpoints" },
      { name: "autonomous-debugging-incident-commander", forgeSkill: "autonomous-debugging-incident-commander", usedAs: "production incident triage, hypothesis-driven debugging, postmortem analysis" },
      { name: "cineforge-media-toolchain-orchestrator", forgeSkill: "cineforge-media-toolchain-orchestrator", usedAs: "YouTube caption retrieval, video transcript pipeline, media metadata" },
      { name: "cineforge-multimodal-production-director", forgeSkill: "cineforge-multimodal-production-director", usedAs: "educational video generation, multimodal content production" },
      { name: "cineforge-visual-qa-final-cut-supervisor", forgeSkill: "cineforge-visual-qa-final-cut-supervisor", usedAs: "visual quality assurance for generated educational content" },
      { name: "forge-agent-toolsmith-mcp", forgeSkill: "forge-agent-toolsmith-mcp", usedAs: "MCP tool contracts: narrow, typed, logged, permissioned, reversible" },
      { name: "forge-authorized-red-team-commander", forgeSkill: "forge-authorized-red-team-commander", usedAs: "authorized penetration testing of clinical data endpoints, HIPAA compliance checks" },
      { name: "forge-browser-research-agent-scraper", forgeSkill: "forge-browser-research-agent-scraper", usedAs: "screenshot-based citation trails, live clinical guideline capture, evidence audit" },
      { name: "forge-public-data-scrapy-crawlee-agent", forgeSkill: "forge-public-data-scrapy-crawlee-agent", usedAs: "ethical clinical literature acquisition, research paper crawling with ToS compliance" },
      { name: "forge-vulnerability-validation-lab-agent", forgeSkill: "forge-vulnerability-validation-lab-agent", usedAs: "staging environment security validation before production release" },
      { name: "generative-ui-agent-workbench-designer", forgeSkill: "generative-ui-agent-workbench-designer", usedAs: "transparent workflow display, reasoning chain visibility, approval flow UI" },
      { name: "knowledge-graph-agent-architect", forgeSkill: "knowledge-graph-agent-architect", usedAs: "semantic memory concept graph, clinical entity relationships, knowledge consolidation" },
      { name: "synthetic-user-simulation-lab", forgeSkill: "synthetic-user-simulation-lab", usedAs: "synthetic patient cases for adversarial testing, OSCE edge case generation" },
      { name: "tool-registry-mcp-marketplace-builder", forgeSkill: "tool-registry-mcp-marketplace-builder", usedAs: "centralized tool registry governance, risk tiering, approval gates per tool" },
      // Design and academic agents
      { name: "Deep Research Analyst", forgeSkill: "forge-browser-research-agent-scraper", usedAs: "source-quality checks, synthesis, confidence labels, research briefs" },
      { name: "UX Researcher", forgeSkill: "generative-ui-agent-workbench-designer", usedAs: "user-friction checks, usability heuristics, workflow improvements" },
      { name: "UX Architect", forgeSkill: "generative-ui-agent-workbench-designer", usedAs: "layout systems, information architecture, responsive foundations" },
      { name: "UI Designer", forgeSkill: "Forge-Next-level-Frontend", usedAs: "component consistency, accessible visual hierarchy, design tokens" },
      { name: "Brand Guardian", forgeSkill: "forge-agentic-product-architect", usedAs: "Study-Buddy voice, logo/color consistency, brand-safe UI decisions" },
      { name: "Inclusive Visuals Specialist", forgeSkill: "generative-ui-agent-workbench-designer", usedAs: "accessible and dignified visual generation/review prompts" },
      { name: "Learning Psychologist", forgeSkill: "agentic-evaluation-scientist", usedAs: "cognitive load, learner motivation, feedback framing, adaptive difficulty" },
      { name: "Narrative Explainer", forgeSkill: "forge-agentic-product-architect", usedAs: "clear answer structure, story-like learning flow, artifact readability" },
    ];
  }

  agentRegistry(): Array<{ name: string; source: string; usedAs: string; guardrails: string[]; collaboratesWith: string[] }> {
    return [
      {
        name: "ConversationMemoryAgent",
        source: "apps/api/cognitionEngine.ts",
        usedAs: "Tri-layer memory: episodic recall, semantic consolidation, procedural tracking. Runs as Stage 0 before all planning.",
        guardrails: ["Memory used for continuity only.", "Never used as clinical evidence.", "Session-scoped scoring boost prevents stale recall."],
        collaboratesWith: ["RequestOrchestrator", "GeneralAssistantAgent"],
      },
      {
        name: "RequestOrchestrator",
        source: "apps/api/requestOrchestrator.ts",
        usedAs: "Playbook-based request planning. Dispatches to correct tool set from 23-skill registry. Memory-aware routing.",
        guardrails: ["Falls back to deterministic planner when LLM unavailable.", "Confidence floor: 0.35.", "Source separation: clinical ≠ research."],
        collaboratesWith: ["ConversationMemoryAgent", "RouterAgent", "VideoEvidenceAgent", "RecentPainPointResearchAgent"],
      },
      {
        name: "RouterAgent",
        source: "apps/api/medicalSafety.ts",
        usedAs: "Medical intent classification and risk level assignment.",
        guardrails: ["Blocks: diagnosis, dosage, emergency, patient-specific advice.", "Allows: OSCE, quiz, SOP explanation, revision."],
        collaboratesWith: ["SafetyReviewerAgent", "RequestOrchestrator"],
      },
      {
        name: "VideoEvidenceAgent",
        source: "packages/video-rag-engine (video.search)",
        usedAs: "Hybrid semantic+keyword search over ingested clinical video evidence with modality weighting.",
        guardrails: ["Evidence must be from ingested collection.", "Minimum support score threshold enforced."],
        collaboratesWith: ["VideoRagQueryPlanner", "AnswerSupportAuditAgent", "SafetyReviewerAgent"],
      },
      {
        name: "AnswerSupportAuditAgent",
        source: "packages/video-rag-engine (video.auditAnswer)",
        usedAs: "Validates citation count, confidence, and modality coverage. Recommends accept/requery/ask-followup.",
        guardrails: ["Blocks thin-evidence answers.", "Flags missing modalities (transcript/OCR/frame)."],
        collaboratesWith: ["VideoEvidenceAgent", "SafetyReviewerAgent", "AnswerComposerAgent"],
      },
      {
        name: "SafetyReviewerAgent",
        source: "apps/api/medicalSafety.ts",
        usedAs: "Medical safety gate. Reviews every answer before delivery. Appends safety note.",
        guardrails: ["Blocks high-risk answers.", "Minimum citation gate enforced.", "Never removed from pipeline."],
        collaboratesWith: ["RouterAgent", "AnswerComposerAgent", "OSCEExaminerAgent"],
      },
      {
        name: "RecentPainPointResearchAgent",
        source: "apps/api/researchEngine.ts (last30days engine)",
        usedAs: "Multi-source research: HN (Algolia) + PubMed (eUtils) + GitHub API + arXiv. Parallel execution for multi-source queries.",
        guardrails: ["Results never injected into clinical VideoRAG.", "Each source cited with URL + date.", "Confidence tier labelled per hit."],
        collaboratesWith: ["RequestOrchestrator", "DeepResearchAnalyst", "GitHubSearchAgent", "BiomedicalResearchAgent", "ArticleSearchAgent"],
      },
      {
        name: "Deep Research Analyst",
        source: "Desktop/Agents/researcher",
        usedAs: "Source triangulation across multi-source research results. Evidence synthesis with confidence labels.",
        guardrails: ["Must cite or name source families.", "Must not override Study-Buddy safety gates."],
        collaboratesWith: ["RecentPainPointResearchAgent", "SafetyReviewerAgent"],
      },
      {
        name: "Source Verification Agent",
        source: "apps/api/researchEngine.ts + requestOrchestrator.ts",
        usedAs: "Verifies research source quality: checks URL validity, publication date, confidence tier, and citation format before results are shown.",
        guardrails: ["Cannot approve clinical evidence.", "Must label confidence tier on every hit.", "Blocks sources with no date or URL."],
        collaboratesWith: ["Deep Research Analyst", "RecentPainPointResearchAgent", "SafetyReviewerAgent"],
      },
      {
        name: "UX Researcher",
        source: "generative-ui-agent-workbench-designer",
        usedAs: "User-friction checks, usability heuristics, and workflow improvement analysis for Study-Buddy UI flows.",
        guardrails: ["Must not redesign component structure.", "Must not change learning flows.", "Recommendations only — no autonomous changes."],
        collaboratesWith: ["GeneralAssistantAgent", "RequestOrchestrator"],
      },
      {
        name: "Brand Guardian",
        source: "forge-agentic-product-architect",
        usedAs: "Ensures Study-Buddy brand voice, logo/color consistency, and brand-safe UI decisions across all outputs.",
        guardrails: ["Cannot override medical safety rules.", "Must not alter clinical answer structure.", "Brand rules apply to UI only, not evidence content."],
        collaboratesWith: ["GeneralAssistantAgent", "SafetyReviewerAgent"],
      },
      {
        name: "Learning Psychologist",
        source: "agentic-evaluation-scientist",
        usedAs: "Cognitive load assessment, learner motivation framing, feedback scaffolding, and adaptive difficulty recommendations.",
        guardrails: ["Cannot generate patient-specific advice.", "Must flag if recommendations conflict with clinical safety.", "Education context only."],
        collaboratesWith: ["OSCEExaminerAgent", "QuizFlashcardAgent", "RevisionPlannerAgent"],
      },
      {
        name: "ExternalVideoNotesAgent",
        source: "apps/api/studyBuddyOrchestrator.ts (externalVideoNotesAnswer)",
        usedAs: "YouTube captions retrieval via yt-dlp + VTT parsing + LLM notes composition.",
        guardrails: ["External video kept separate from clinical demo.", "Notes only from retrieved captions.", "No invented content."],
        collaboratesWith: ["RequestOrchestrator", "SafetyReviewerAgent"],
      },
      {
        name: "OSCEExaminerAgent",
        source: "apps/api/learningGenerators.ts",
        usedAs: "Generates OSCE stations: task brief, 20-mark examiner checklist, critical fail points, viva questions, model answer.",
        guardrails: ["Evidence-grounded content only.", "No clinical advice.", "Education context."],
        collaboratesWith: ["VideoEvidenceAgent", "SafetyReviewerAgent"],
      },
      {
        name: "QuizFlashcardAgent",
        source: "apps/api/learningGenerators.ts",
        usedAs: "Generates 5 MCQs + 4 flashcards with evidence timestamps.",
        guardrails: ["Evidence-linked questions only.", "No diagnosis or treatment questions."],
        collaboratesWith: ["VideoEvidenceAgent", "SafetyReviewerAgent"],
      },
      {
        name: "RevisionPlannerAgent",
        source: "apps/api/learningGenerators.ts",
        usedAs: "Creates structured revision plans: 6 weak topics, today/tomorrow tasks, recommended timestamps.",
        guardrails: ["Based on evidence coverage.", "No patient-specific recommendations."],
        collaboratesWith: ["VideoEvidenceAgent", "SafetyReviewerAgent"],
      },
      {
        name: "ArtifactStudio",
        source: "apps/api/artifactStudio.ts",
        usedAs: "Deterministic export: PDF study pack, DOCX brief, PPTX deck, chart, ZIP bundle.",
        guardrails: ["No LLM dependency for structure.", "Safety note always appended."],
        collaboratesWith: ["AnswerComposerAgent", "SafetyReviewerAgent"],
      },
      {
        name: "GeneralAssistantAgent",
        source: "apps/api/studyBuddyOrchestrator.ts",
        usedAs: "Explains Study-Buddy capabilities when intent is general/unknown. Shows session context and procedural insights.",
        guardrails: ["No clinical VideoRAG used.", "No invented capabilities."],
        collaboratesWith: ["ConversationMemoryAgent", "RequestOrchestrator"],
      },
    ];
  }

  // ── DEMO INGEST ───────────────────────────────────────────

  private async ingestDemoShape(demo: DemoShape): Promise<void> {
    const store = this.engine.getStore();
    const video: VideoRecord = { id: `${demo.collectionId}_video_iv_cannulation`, collectionId: demo.collectionId, uri: `study-buddy://demo/${demo.collectionId}`, title: demo.title, sourceType: "synthetic", durationSec: demo.durationSec, createdAt: nowIso(), status: "indexed", metadata: { studyBuddy: true, subject: demo.subject, safetyMode: demo.safetyMode, sourceKind: "golden-demo" } };
    const docVideo: VideoRecord = { id: `${demo.collectionId}_doc_sop`, collectionId: demo.collectionId, uri: `study-buddy://document/${demo.sop.name}`, title: demo.sop.name, sourceType: "synthetic", durationSec: 1, createdAt: nowIso(), status: "indexed", metadata: { studyBuddy: true, sourceKind: "sop-document", safetyMode: demo.safetyMode } };
    await store.upsertVideo(video); await store.upsertVideo(docVideo);
    const evidence: Evidence[] = [];
    demo.transcript.forEach((row, i) => { const text = `${row.text} [Study-Buddy transcript evidence. Training-only.]`; evidence.push({ id: `${demo.collectionId}_ev_transcript_${String(i).padStart(3, "0")}`, collectionId: demo.collectionId, videoId: video.id, modality: "transcript", startSec: row.startSec, endSec: row.endSec, text, confidence: 0.96, metadata: { provider: "study-buddy-golden-transcript", subject: demo.subject, safetyMode: demo.safetyMode }, fingerprint: fingerprintText(text), createdAt: nowIso() }); });
    (demo.ocrFrames || []).forEach((row, i) => { const text = `Slide/OCR evidence: ${row.text}`; evidence.push({ id: `${demo.collectionId}_ev_ocr_${String(i).padStart(3, "0")}`, collectionId: demo.collectionId, videoId: video.id, modality: "ocr", startSec: row.startSec, endSec: row.endSec, text, confidence: 0.9, metadata: { provider: "study-buddy-golden-ocr", subject: demo.subject, safetyMode: demo.safetyMode }, fingerprint: fingerprintText(text), createdAt: nowIso() }); });
    (demo.frameCaptions || []).forEach((row, i) => { const text = `Frame evidence: ${row.text}`; evidence.push({ id: `${demo.collectionId}_ev_frame_${String(i).padStart(3, "0")}`, collectionId: demo.collectionId, videoId: video.id, modality: "frame", startSec: row.startSec, endSec: row.endSec, text, confidence: 0.88, metadata: { provider: "study-buddy-golden-frame-caption", subject: demo.subject, safetyMode: demo.safetyMode }, fingerprint: fingerprintText(text), createdAt: nowIso() }); });
    demo.sop.pages.forEach((page, i) => { const text = `${demo.sop.name}, page ${page.page}: ${page.text}`; evidence.push({ id: `${demo.collectionId}_ev_sop_${String(i).padStart(3, "0")}`, collectionId: demo.collectionId, videoId: docVideo.id, modality: "summary", startSec: i, endSec: i + 1, text, confidence: 0.94, metadata: { provider: "study-buddy-sop-loader", sourceKind: "sop", page: page.page, safetyMode: demo.safetyMode }, fingerprint: fingerprintText(text), createdAt: nowIso() }); });
    await store.addEvidence(evidence);
    await store.addVectors(await this.buildVectors(demo.collectionId, evidence));
    const memory: MemoryNode[] = [...buildHierarchicalMemory(video, evidence.filter(e => e.videoId === video.id), 90), ...buildHierarchicalMemory(docVideo, evidence.filter(e => e.videoId === docVideo.id), 1)];
    await store.addMemory(memory);
    const videos = await store.listVideos(demo.collectionId); const existingMemory = await store.listMemory(demo.collectionId);
    await store.addMemory([buildCollectionMemory(demo.collectionId, videos, existingMemory)]);
  }

  private async buildVectors(collectionId: string, rows: Evidence[]): Promise<VectorRow[]> {
    const vectors = await this.embeddings.embedMany(rows.map(r => `${r.modality}: ${r.text}`));
    return rows.map((row, i) => ({ id: `${row.id}_vec`, collectionId, evidenceId: row.id, dims: vectors[i].length, vector: vectors[i], createdAt: nowIso() }));
  }
}
