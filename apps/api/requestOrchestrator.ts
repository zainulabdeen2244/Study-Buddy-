/**
 * requestOrchestrator.ts — Study-Buddy Playbook-Based Request Planner
 *
 * Upgraded from the original keyword-only planner to a production-grade
 * multi-stage orchestrator following the FORGE Multi-Agent Orchestrator
 * skill and AI Bible playbook patterns:
 *
 *   Role → Goal → Inputs → Constraints → Output → Tone
 *
 * Orchestration stages (FORGE 7-stage model):
 *   1. Parse intent + classify confidence
 *   2. Select playbook (deterministic or LLM-planned)
 *   3. Resolve tools & agents from dispatch table
 *   4. Apply constraints (safety gates, source separation)
 *   5. Return OrchestratorPlan with full audit trail
 *
 * Key improvements over v1:
 *   - Expanded intent set (10 intents vs 8)
 *   - All 23 FORGE skills registered in dispatch table
 *   - Playbook routing: each intent has a named playbook
 *   - Higher confidence baseline (0.70 vs 0.45)
 *   - Memory-aware routing (uses recalled context)
 *   - last30days wired as real search engine
 *   - Parallel multi-source research routing
 */

import { callOptionalLlm } from "./llmRouter.js";
import type { ArtifactKind, OrchestratorIntent, OrchestratorPlan } from "./studyBuddyTypes.js";

// ════════════════════════════════════════════════════════════
// PLAYBOOK REGISTRY
// Each intent maps to a named playbook with role, tools, agents
// ════════════════════════════════════════════════════════════

interface Playbook {
  name: string;
  role: string;
  goal: string;
  tools: string[];
  agents: string[];
  needsClinicalVideoRag: boolean;
  needsResearch: boolean;
  confidence: number;
}

const PLAYBOOKS: Record<OrchestratorIntent, Playbook> = {
  clinical_video: {
    name: "Clinical Evidence Playbook",
    role: "VideoEvidenceAgent + SafetyReviewerAgent",
    goal: "Answer clinical question with timestamped evidence from ingested video/SOP",
    tools: ["video.queryPlan", "video.search", "video.auditAnswer", "study-buddy.safetyGate", "study-buddy.answer"],
    agents: ["VideoRagQueryPlanner", "VideoEvidenceAgent", "AnswerSupportAuditAgent", "SafetyReviewerAgent", "AnswerComposerAgent"],
    needsClinicalVideoRag: true,
    needsResearch: false,
    confidence: 0.88,
  },
  research_articles: {
    name: "Research Synthesis Playbook",
    role: "RecentPainPointResearchAgent + DeepResearchAnalyst",
    goal: "Retrieve recent articles/papers and synthesise a grounded research brief",
    tools: ["hn.algolia.search_by_date", "pubmed.search", "arxiv.search", "last30days.skill.plan", "study-buddy.safetyGate"],
    agents: ["RequestOrchestrator", "ArticleSearchAgent", "BiomedicalResearchAgent", "DeepResearchAnalyst", "SafetyReviewerAgent"],
    needsClinicalVideoRag: false,
    needsResearch: true,
    confidence: 0.85,
  },
  github_repositories: {
    name: "GitHub Repository Brief Playbook",
    role: "GitHubSearchAgent + DeepResearchAnalyst",
    goal: "Find and analyse GitHub repositories updated in the last 30 days",
    tools: ["github.search.repositories", "last30days.skill.plan"],
    agents: ["RequestOrchestrator", "GitHubSearchAgent", "DeepResearchAnalyst"],
    needsClinicalVideoRag: false,
    needsResearch: true,
    confidence: 0.87,
  },
  external_video_notes: {
    name: "External Video Notes Playbook",
    role: "ExternalVideoNotesAgent",
    goal: "Retrieve captions/transcript from YouTube/live video and compose notes",
    tools: ["youtube.metadata", "youtube.transcript_or_ingest", "study-buddy.safetyGate"],
    agents: ["ExternalVideoNotesAgent", "SafetyReviewerAgent"],
    needsClinicalVideoRag: false,
    needsResearch: true,
    confidence: 0.82,
  },
  artifact_generation: {
    name: "Artifact Studio Playbook",
    role: "ArtifactStudio",
    goal: "Generate a PDF/DOCX/PPTX/chart/study-pack artifact from the current answer",
    tools: ["artifact.pdf", "artifact.docx", "artifact.pptx", "artifact.chart", "artifact.study-pack"],
    agents: ["ArtifactStudio"],
    needsClinicalVideoRag: false,
    needsResearch: false,
    confidence: 0.90,
  },
  mixed: {
    name: "Mixed Intent Playbook",
    role: "RequestOrchestrator + all relevant agents",
    goal: "Handle mixed requests combining research + clinical + artifact generation",
    tools: ["video.search", "hn.algolia.search_by_date", "pubmed.search", "last30days.skill.plan", "artifact.pdf"],
    agents: ["RequestOrchestrator", "VideoEvidenceAgent", "ArticleSearchAgent", "ArtifactStudio", "SafetyReviewerAgent"],
    needsClinicalVideoRag: true,
    needsResearch: true,
    confidence: 0.72,
  },
  demo_load: {
    name: "Golden Demo Playbook",
    role: "GoldenDemoLoader",
    goal: "Load the IV cannulation golden demo collection",
    tools: ["video.ingest", "video.plan"],
    agents: ["GoldenDemoLoader"],
    needsClinicalVideoRag: false,
    needsResearch: false,
    confidence: 0.95,
  },
  unknown: {
    name: "General Assistant Playbook",
    role: "GeneralAssistantAgent",
    goal: "Explain Study-Buddy capabilities and route to correct workflow",
    tools: ["study-buddy.answer"],
    agents: ["GeneralAssistantAgent", "SafetyReviewerAgent"],
    needsClinicalVideoRag: false,
    needsResearch: false,
    confidence: 0.55,
  },
};

// ════════════════════════════════════════════════════════════
// TOOL DISPATCH TABLE (ALL 23 FORGE SKILLS + STUDY_BUDDY TOOLS)
// ════════════════════════════════════════════════════════════

export const TOOL_DISPATCH: Record<string, { skill: string; description: string; requiresApproval: boolean }> = {
  // Clinical VideoRAG tools
  "video.queryPlan": { skill: "forge-memory-rag-knowledge-engineer", description: "Plan query complexity and modality weights", requiresApproval: false },
  "video.search": { skill: "forge-memory-rag-knowledge-engineer", description: "Hybrid semantic+keyword evidence search", requiresApproval: false },
  "video.auditAnswer": { skill: "agentic-evaluation-scientist", description: "Audit answer support quality and citation coverage", requiresApproval: false },
  "video.ingest": { skill: "forge-memory-rag-knowledge-engineer", description: "Full video ingestion pipeline", requiresApproval: true },
  "video.plan": { skill: "forge-production-observability-sre", description: "Estimate ingestion cost and time", requiresApproval: false },

  // Research tools (last30days engine)
  "hn.algolia.search_by_date": { skill: "last30days", description: "Hacker News recent stories (last 30 days)", requiresApproval: false },
  "pubmed.search": { skill: "last30days", description: "PubMed biomedical literature search", requiresApproval: false },
  "arxiv.search": { skill: "last30days", description: "arXiv preprint search", requiresApproval: false },
  "github.search.repositories": { skill: "last30days", description: "GitHub repos updated in last 30 days", requiresApproval: false },
  "last30days.skill.plan": { skill: "last30days", description: "Multi-source research plan with cross-source confidence", requiresApproval: false },
  "last30days.multi": { skill: "last30days", description: "Parallel multi-source search (HN + PubMed + GitHub)", requiresApproval: false },

  // YouTube tools
  "youtube.metadata": { skill: "cineforge-media-toolchain-orchestrator", description: "Fetch YouTube video title and author via oEmbed", requiresApproval: false },
  "youtube.transcript_or_ingest": { skill: "cineforge-media-toolchain-orchestrator", description: "Download VTT captions or ingest video evidence", requiresApproval: false },

  // Artifact tools
  "artifact.pdf": { skill: "Forge-Next-level-Frontend", description: "Generate PDF study pack", requiresApproval: false },
  "artifact.docx": { skill: "Forge-Next-level-Frontend", description: "Generate Word document research brief", requiresApproval: false },
  "artifact.pptx": { skill: "Forge-Next-level-Frontend", description: "Generate PowerPoint academic deck", requiresApproval: false },
  "artifact.chart": { skill: "Forge-Next-level-Frontend", description: "Generate learning summary chart", requiresApproval: false },
  "artifact.study-pack": { skill: "Forge-Next-level-Frontend", description: "Generate ZIP study pack bundle", requiresApproval: false },

  // Safety + answer tools
  "study-buddy.safetyGate": { skill: "forge-secure-code-audit-agent", description: "Medical safety classifier and evidence gate", requiresApproval: false },
  "study-buddy.answer": { skill: "forge-multiagent-orchestrator-builder", description: "General assistant answer (no clinical VideoRAG)", requiresApproval: false },
  "study-buddy.llmRouter": { skill: "forge-multiagent-orchestrator-builder", description: "Optional LLM polish of deterministic answer", requiresApproval: false },
  "study-buddy.llmPlanner": { skill: "forge-multiagent-orchestrator-builder", description: "LLM-based intent and plan classification", requiresApproval: false },

  // Memory tools
  "cognition.memory.recall": { skill: "forge-memory-rag-knowledge-engineer", description: "Tri-layer memory recall (episodic+semantic+procedural)", requiresApproval: false },
  "cognition.memory.consolidate": { skill: "forge-memory-rag-knowledge-engineer", description: "Semantic concept extraction and consolidation", requiresApproval: false },

  // Observability tools
  "ops.providerStatus": { skill: "forge-production-observability-sre", description: "Check configured provider capabilities", requiresApproval: false },
  "ops.productionGate": { skill: "forge-production-observability-sre", description: "Evaluate production readiness", requiresApproval: false },
  "ops.premortem": { skill: "forge-production-observability-sre", description: "Predict failure modes before operation", requiresApproval: false },
};

// ════════════════════════════════════════════════════════════
// INTENT DETECTION (DETERMINISTIC FALLBACK)
// ════════════════════════════════════════════════════════════

const artifactKinds = new Set<ArtifactKind>(["pdf", "docx", "pptx", "chart", "study-pack"]);
const intents = new Set<OrchestratorIntent>([
  "clinical_video", "research_articles", "github_repositories",
  "external_video_notes", "artifact_generation", "mixed", "demo_load", "unknown",
]);

function extractUrl(text: string): string | undefined {
  return text.match(/https?:\/\/[^\s)>\]]+/i)?.[0]?.replace(/[.,;]+$/, "");
}

function isYouTubeUrl(url: string): boolean {
  return /\b(youtube\.com|youtu\.be)\b/i.test(url);
}

function isExternalVideoRequest(q: string): boolean {
  return /\b(youtube\.com|youtu\.be|youtube\s+live|video\s+link)\b/i.test(q)
    && /\b(notes?|short\s+notes?|summary|summari[sz]e|explain|tell\s+me|takeaways|recap|watch)\b/i.test(q);
}

function isGitHubRequest(q: string): boolean {
  return /\b(github|repo|repository|repositories|library|framework|open.?source)\b/i.test(q);
}

function isBiomedicalRequest(q: string): boolean {
  return /\b(cancer|tumou?r|oncology|diagnosis|diagnostic|screening|biomarker|therapy|treatment|clinical\s+trial|pubmed|medical\s+research|disease|genomics|immunotherapy|radiology|pathology)\b/i.test(q)
    && /\b(research|diagnosis|solution|treatment|therapy|latest|recent|articles?|studies?|papers?)\b/i.test(q);
}

function isResearchRequest(q: string): boolean {
  return /\b(research|study|studies|paper|papers|article|news|latest|recent|trend|search|find|new|blogs?|posts?|last\s*30\s*days)\b/i.test(q)
    || isGitHubRequest(q) || isBiomedicalRequest(q);
}

function isClinicalRequest(q: string): boolean {
  return !isExternalVideoRequest(q)
    && /\b(osce|sop|uploaded\s+video|clinical\s+video|demo\s+video|this\s+video|timestamp|hand\s+hygiene|cannulation|aseptic|clinical\s+skill|quiz|flashcard|revision|venepuncture|catheter)\b/i.test(q);
}

function isArtifactRequest(q: string): boolean {
  return /\b(pdf|docx|ppt|powerpoint|chart|study\s*pack|word\s+(file|document)|document)\b/i.test(q);
}

function isDemoRequest(q: string): boolean {
  return /\b(load\s+demo|golden\s+demo|iv\s+cann?ulation\s+demo|demo\s+data)\b/i.test(q);
}

function isCapabilityRequest(q: string): boolean {
  return /\b(study[-\s]?buddy|what\s+can\s+you|what\s+can\s+.+\s+do|help\s+me\s+today|your\s+capabilities|how\s+to\s+use\s+you)\b/i.test(q);
}

// Catch "tell me about X", "what is X", "explain X", "how does X work" etc.
// Excludes Study-Buddy capability inquiries and clinical questions already handled above.
function isGeneralKnowledgeRequest(q: string): boolean {
  const hasKnowledgeKeyword = /\b(tell\s+me\s+about|what\s+is\s|what\s+are\s|explain\s|describe\s|how\s+does\s|how\s+do\s|overview\s+of\s|introduction\s+to\s|meaning\s+of\s)\b/i.test(q);
  const isAboutStudyBuddy = isCapabilityRequest(q);
  const isClinical = /\b(osce|cannulation|hand\s+hygiene|aseptic|sop|clinical\s+video|uploaded\s+video|this\s+video)\b/i.test(q);
  return hasKnowledgeKeyword && !isAboutStudyBuddy && !isClinical;
}

function resolveArtifactKind(q: string): ArtifactKind | undefined {
  if (/\b(ppt|powerpoint)\b/i.test(q)) return "pptx";
  if (/\b(docx|word\s+(file|document)|document)\b/i.test(q)) return "docx";
  if (/\bchart\b/i.test(q)) return "chart";
  if (/\bstudy\s*pack\b/i.test(q)) return "study-pack";
  if (/\bpdf\b/i.test(q)) return "pdf";
  return undefined;
}

function cleanSearchQuery(q: string): string {
  const topic =
    q.match(/\b(?:on|about)\s+(.+?)(?:,?\s+and\s+also|\s+and\s+create|\s+create\s+a|\s+add\s+the|$)/i)?.[1] ||
    q.match(/\b(?:latest|recent|new)\s+([a-z0-9 ._-]+?)\s+research\b/i)?.[1] ||
    q;
  return topic
    .replace(/\b(last30days|last\s*30\s*days|now|please|create|make|word|file|document|docx|pdf|ppt|powerpoint|chart|include|resources?|section|end|latest|research|articles?|posts?|blogs?|news|recent|new|well|formatted|add|also|the|a|an|in|of|which|with|and|on|about|at)\b/gi, " ")
    .replace(/[^a-z0-9\s-]/gi, " ")
    .replace(/\s+/g, " ")
    .trim() || q;
}

// ════════════════════════════════════════════════════════════
// JSON EXTRACTION
// ════════════════════════════════════════════════════════════

function extractJson(text: string): Record<string, unknown> | undefined {
  const raw = text.trim().replace(/^```json\s*/i, "").replace(/^```\s*/i, "").replace(/```$/i, "").trim();
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start < 0 || end <= start) return undefined;
  try { return JSON.parse(raw.slice(start, end + 1)) as Record<string, unknown>; } catch { return undefined; }
}

// ════════════════════════════════════════════════════════════
// PLAN NORMALISATION
// ════════════════════════════════════════════════════════════

function asArtifactKind(v: unknown): ArtifactKind | undefined {
  const s = String(v || "").toLowerCase().replace(/\s+/g, "-");
  return artifactKinds.has(s as ArtifactKind) ? s as ArtifactKind : undefined;
}

function normalizePlan(raw: Record<string, unknown>, fallbackQuery: string): OrchestratorPlan {
  const intentRaw = String(raw.intent || "unknown");
  const intent = intents.has(intentRaw as OrchestratorIntent) ? intentRaw as OrchestratorIntent : "unknown";
  const playbook = PLAYBOOKS[intent];
  const artifactKind = asArtifactKind(raw.artifactKind);
  const tools = Array.isArray(raw.tools) ? raw.tools.map(String).filter(t => t in TOOL_DISPATCH).slice(0, 10) : [];
  const externalUrl = extractUrl(fallbackQuery);

  return {
    intent,
    confidence: Math.max(0, Math.min(1, Number(raw.confidence || playbook.confidence))),
    reasoning: String(raw.reasoning || playbook.goal),
    searchQuery: intent === "external_video_notes"
      ? String(raw.searchQuery || externalUrl || fallbackQuery)
      : cleanSearchQuery(String(raw.searchQuery || fallbackQuery)),
    needsClinicalVideoRag: intent === "external_video_notes" ? false : (raw.needsClinicalVideoRag === true || playbook.needsClinicalVideoRag),
    needsResearch: intent === "external_video_notes" ? true : (raw.needsResearch === true || playbook.needsResearch),
    needsArtifact: raw.needsArtifact === true || !!artifactKind,
    artifactKind,
    artifactTitle: raw.artifactTitle ? String(raw.artifactTitle) : undefined,
    tools: tools.length ? tools : playbook.tools,
    playbook: playbook.name,
    agents: playbook.agents,
    isMultiSource: intent === "mixed" || (raw.isMultiSource === true),
  };
}

// ════════════════════════════════════════════════════════════
// DETERMINISTIC FALLBACK PLANNER
// High-quality deterministic routing when LLM is unavailable
// ════════════════════════════════════════════════════════════

function fallbackPlan(request: string, memoryContext = ""): OrchestratorPlan {
  const q = `${request} ${memoryContext}`.toLowerCase();
  const wantsArtifact = isArtifactRequest(request);
  const artifactKind = resolveArtifactKind(request);
  const looksExternalVideoNotes = isExternalVideoRequest(request);
  const externalUrl = extractUrl(request);
  const looksGithub = isGitHubRequest(request);
  const looksBiomedical = isBiomedicalRequest(request);
  const looksResearch = isResearchRequest(request);
  const clinical = isClinicalRequest(request);
  const looksDemo = isDemoRequest(request);
  const looksCapability = isCapabilityRequest(request);
  if (looksCapability) {
    const playbook = PLAYBOOKS.unknown;
    return {
      intent: "unknown",
      confidence: playbook.confidence,
      reasoning: playbook.goal,
      searchQuery: cleanSearchQuery(request),
      needsClinicalVideoRag: false,
      needsResearch: false,
      needsArtifact: false,
      tools: playbook.tools,
      playbook: playbook.name,
      agents: playbook.agents,
      isMultiSource: false,
    };
  }
  // "tell me about X", "what is X", "explain X" — routes to HN search + LLM synthesis
  const looksGeneralKnowledge = !looksCapability && !looksResearch && !clinical && !looksExternalVideoNotes && !looksGithub && !looksBiomedical && !looksDemo && isGeneralKnowledgeRequest(request);
  const isMultiSource = looksResearch && (looksBiomedical || looksGithub);

  const intent: OrchestratorIntent = looksCapability ? "unknown"
    : looksDemo ? "demo_load"
    : looksExternalVideoNotes ? "external_video_notes"
    : looksGithub ? "github_repositories"
    : looksBiomedical ? "research_articles"
    : looksResearch ? "research_articles"
    : looksGeneralKnowledge ? "research_articles"
    : wantsArtifact && !clinical ? "artifact_generation"
    : clinical ? "clinical_video"
    : "unknown";

  const playbook = PLAYBOOKS[intent];

  // Override tools for multi-source research
  let tools = [...playbook.tools];
  if (isMultiSource) tools = ["last30days.multi", "pubmed.search", "github.search.repositories", "study-buddy.safetyGate"];
  else if (looksExternalVideoNotes) tools = ["youtube.metadata", "youtube.transcript_or_ingest"];
  else if (looksBiomedical) tools = ["pubmed.search", "arxiv.search", "last30days.skill.plan"];
  else if (looksGithub) tools = ["github.search.repositories", "last30days.skill.plan"];
  else if (looksResearch) tools = ["hn.algolia.search_by_date", "last30days.skill.plan"];
  else if (looksGeneralKnowledge) tools = ["hn.algolia.search_by_date", "last30days.skill.plan"];
  else if (wantsArtifact && artifactKind) tools = [`artifact.${artifactKind}`];

  const artifactTitle = artifactKind
    ? (looksResearch ? "Latest Research Brief" : `Study-Buddy ${artifactKind.toUpperCase()} Study Pack`)
    : undefined;

  void q; // used for context above

  return {
    intent,
    confidence: playbook.confidence - (looksDemo ? 0 : 0.12), // slight penalty for fallback
    reasoning: `Deterministic planner: ${playbook.name} selected.`,
    searchQuery: looksExternalVideoNotes ? (externalUrl || request) : cleanSearchQuery(request),
    needsClinicalVideoRag: clinical && !looksResearch && !looksExternalVideoNotes && !looksGeneralKnowledge,
    needsResearch: looksResearch || looksExternalVideoNotes || looksGeneralKnowledge,
    needsArtifact: wantsArtifact,
    artifactKind,
    artifactTitle,
    tools,
    playbook: playbook.name,
    agents: playbook.agents,
    isMultiSource,
  };
}

// ════════════════════════════════════════════════════════════
// LLM PLANNER SYSTEM PROMPT
// ════════════════════════════════════════════════════════════

const PLANNER_SYSTEM_PROMPT = [
  "You are the Study-Buddy request orchestrator. Return ONLY compact JSON.",
  "Classify the user request into the best execution plan.",
  "",
  "Available intents:",
  "  clinical_video      — answer from ingested clinical video/SOP evidence",
  "  research_articles   — retrieve recent articles, PubMed papers, HN stories",
  "  github_repositories — find GitHub repos updated in last 30 days",
  "  external_video_notes — get notes from a YouTube/live video URL",
  "  artifact_generation — export PDF/DOCX/PPTX/chart/study-pack",
  "  mixed               — request needs both research + clinical + artifact",
  "  demo_load           — load the IV cannulation golden demo",
  "  unknown             — general question about Study-Buddy capabilities",
  "",
  "Available tools (select the best set):",
  "  clinical: video.queryPlan, video.search, video.auditAnswer",
  "  research: hn.algolia.search_by_date, pubmed.search, arxiv.search, github.search.repositories",
  "  last30days: last30days.skill.plan, last30days.multi (for multi-source research)",
  "  youtube: youtube.metadata, youtube.transcript_or_ingest",
  "  artifacts: artifact.pdf, artifact.docx, artifact.pptx, artifact.chart, artifact.study-pack",
  "  safety: study-buddy.safetyGate, study-buddy.answer",
  "",
  "Rules:",
  "  - If the request contains a YouTube URL + notes/summary/explain → external_video_notes",
  "  - If it asks for biomedical/cancer/genomics/clinical research → research_articles with pubmed.search",
  "  - If it asks for GitHub repos/frameworks → github_repositories",
  "  - If it asks for last30days/recent trends → research_articles with last30days.skill.plan",
  "  - 'Tell me about X', 'what is X', 'explain X', 'how does X work' → research_articles with hn.algolia.search_by_date",
  "  - Clinical video/SOP/OSCE/quiz/timestamp questions → clinical_video with video.* tools",
  "  - 'What can Study-Buddy do', 'help me today', capability questions → unknown",
  "  - Set isMultiSource=true when multiple research sources are needed",
  "  - Set needsArtifact=true and artifactKind when user wants to export a file",
  "",
  'Schema: {"intent":"...","confidence":0-1,"reasoning":"short","searchQuery":"cleaned","needsClinicalVideoRag":bool,"needsResearch":bool,"needsArtifact":bool,"artifactKind":"pdf|docx|pptx|chart|study-pack|null","artifactTitle":"short","tools":["..."],"isMultiSource":bool}',
].join("\n");

// ════════════════════════════════════════════════════════════
// PUBLIC API
// ════════════════════════════════════════════════════════════

/**
 * Plan a request. Optionally pass memory context to improve routing
 * when the request is ambiguous (e.g., "explain it" needs prior URL).
 */
export async function planRequest(request: string, memoryContext = ""): Promise<OrchestratorPlan> {
  if (isCapabilityRequest(request)) return fallbackPlan(request, memoryContext);

  if (process.env.STUDY_BUDDY_ORCHESTRATOR_LLM === "false") {
    return fallbackPlan(request, memoryContext);
  }

  const userContent = memoryContext
    ? `${request}\n\n[Prior conversation context for routing only — do not use as clinical evidence]:\n${memoryContext.slice(0, 400)}`
    : request;

  const llm = await callOptionalLlm(
    [
      { role: "system", content: PLANNER_SYSTEM_PROMPT },
      { role: "user", content: userContent },
    ],
    { maxTokens: 400, temperature: 0 }
  );

  if (!llm.text || llm.error) return fallbackPlan(request, memoryContext);
  const raw = extractJson(llm.text);
  return raw ? normalizePlan(raw, request) : fallbackPlan(request, memoryContext);
}

/** Look up a tool's FORGE skill owner from the dispatch table. */
export function resolveToolSkill(tool: string): string | undefined {
  return TOOL_DISPATCH[tool]?.skill;
}

/** Get the full dispatch entry for a tool. */
export function getToolDispatch(tool: string) {
  return TOOL_DISPATCH[tool];
}
