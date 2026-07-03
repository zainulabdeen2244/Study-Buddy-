/**
 * cognitionEngine.ts — Study-Buddy Tri-Layer Memory System
 *
 * Implements Episodic + Semantic + Procedural memory layers inspired by
 * cognitive science architecture. Directly fixes session context loss by:
 *   1. Auto-recall at turn start (Stage 0 before any planning)
 *   2. Session-scoped scoring boost (1.5x for in-session memories)
 *   3. Immediate semantic consolidation after every turn
 *   4. Procedural tracking with success-rate quality scores
 *   5. Composite ranking: recency × importance × relevance × session-boost
 *
 * Replaces the flat ConversationMemoryStore with a production-grade
 * tri-modal store that persists between restarts and never loses context.
 */

import fs from "node:fs";
import path from "node:path";
import { id, nowIso } from "../../packages/video-rag-engine/src/core/utils.js";

// ════════════════════════════════════════════════════════════
// TYPES
// ════════════════════════════════════════════════════════════

/** A single timestamped interaction turn — the raw event log. */
export interface EpisodicMemory {
  id: string;
  sessionId: string;
  role: "user" | "assistant";
  text: string;               // clipped to 4000 chars
  route?: string;             // e.g. "ASK_VIDEO", "GENERATE_OSCE"
  tags: string[];             // semantic tags extracted at creation
  importance: number;         // 0-1: drives recall priority
  createdAt: string;
}

/** A concept or fact extracted from episodes — the knowledge graph layer. */
export interface SemanticNode {
  id: string;
  concept: string;            // e.g. "IV cannulation", "OSCE preparation"
  definition: string;         // one-line distillation
  confidence: number;         // 0-1
  tags: string[];
  relatedConcepts: string[];
  sourceTurnIds: string[];
  sessionIds: string[];
  createdAt: string;
  updatedAt: string;
  accessCount: number;
}

/** Workflow performance tracking — how well skills execute over time. */
export interface ProceduralMemory {
  workflow: string;
  uses: number;
  successes: number;
  recentOutcomes: boolean[];  // last 10 — ring buffer
  lastUsed: string;
  avgImportance: number;      // average importance of turns that triggered it
}

/** Per-session state stored to disk. */
export interface SessionState {
  sessionId: string;
  summary: string;
  semanticProfile: string;   // distilled user interest profile
  episodic: EpisodicMemory[];
  procedural: Record<string, ProceduralMemory>;
  updatedAt: string;
}

/** The flat file store structure. */
export interface CognitionStore {
  sessions: SessionState[];
  semantic: SemanticNode[];
  updatedAt: string;
}

/** What the orchestrator receives at the start of every turn. */
export interface MemoryRecall {
  sessionId: string;
  summary: string;
  semanticProfile: string;
  recentTurns: EpisodicMemory[];
  relevantTurns: EpisodicMemory[];
  semanticContext: SemanticNode[];
  proceduralInsights: string[];
  contextBlock: string;
}

// ════════════════════════════════════════════════════════════
// ROUTE IMPORTANCE TABLE
// Routes that carry more learning signal get higher importance
// ════════════════════════════════════════════════════════════
const ROUTE_IMPORTANCE: Record<string, number> = {
  GENERATE_OSCE: 0.92,
  GENERATE_QUIZ: 0.90,
  GENERATE_FLASHCARDS: 0.88,
  REVISION_PLAN: 0.87,
  EXPLAIN_PROCEDURE: 0.85,
  ASK_VIDEO: 0.80,
  FIND_TIMESTAMP: 0.78,
  RESEARCH_STUDENT_PAIN: 0.72,
  SAFETY_REVIEW_ONLY: 0.65,
};

// ════════════════════════════════════════════════════════════
// SEMANTIC CONCEPT PATTERNS
// Defines what concepts to extract from text
// ════════════════════════════════════════════════════════════
const SEMANTIC_PATTERNS: Array<{ pattern: RegExp; concept: string; tags: string[] }> = [
  { pattern: /\biv\s+cann?ulation\b/i, concept: "IV cannulation", tags: ["clinical-skill", "clinical-learning"] },
  { pattern: /\bhand\s+hygiene\b/i, concept: "hand hygiene", tags: ["clinical-skill", "infection-control"] },
  { pattern: /\binfection\s+control\b/i, concept: "infection control", tags: ["clinical-skill", "safety"] },
  { pattern: /\baseptic\s+(technique|non.touch)\b/i, concept: "aseptic technique", tags: ["clinical-skill", "sterility"] },
  { pattern: /\bosce\b/i, concept: "OSCE preparation", tags: ["assessment", "clinical-learning"] },
  { pattern: /\bclinical\s+skill\b/i, concept: "clinical skills", tags: ["clinical-learning"] },
  { pattern: /\bquiz|flashcard\b/i, concept: "quiz and revision", tags: ["assessment", "revision"] },
  { pattern: /\brevision\s+plan|study\s+plan\b/i, concept: "revision planning", tags: ["revision", "study"] },
  { pattern: /\bcancer|tumou?r|oncology\b/i, concept: "oncology", tags: ["biomedical-research"] },
  { pattern: /\bdiagnos(is|tic)\b/i, concept: "diagnosis", tags: ["biomedical-research", "clinical"] },
  { pattern: /\bimmunotherapy\b/i, concept: "immunotherapy", tags: ["biomedical-research", "treatment"] },
  { pattern: /\bgenomics|genomic\b/i, concept: "genomics", tags: ["biomedical-research"] },
  { pattern: /\bgithub|repositories?\b/i, concept: "GitHub repositories", tags: ["github", "research"] },
  { pattern: /\bpubmed|biomedical\s+research\b/i, concept: "biomedical literature", tags: ["biomedical-research"] },
  { pattern: /\byoutube\.com|youtu\.be\b/i, concept: "YouTube video content", tags: ["external-video"] },
  { pattern: /\bartifact|pdf|docx|pptx|powerpoint\b/i, concept: "study artifacts", tags: ["artifact"] },
  { pattern: /\bagi|agentic\s+ai|llm\b/i, concept: "AI and AGI research", tags: ["ai-research"] },
  { pattern: /\bvenepuncture|phlebotomy\b/i, concept: "venepuncture", tags: ["clinical-skill"] },
  { pattern: /\bcatheter|catheterisation\b/i, concept: "catheterisation", tags: ["clinical-skill"] },
  { pattern: /\bblood\s+pressure|bp\b/i, concept: "blood pressure monitoring", tags: ["clinical-skill"] },
  { pattern: /\bsop|standard\s+operating\b/i, concept: "standard operating procedures", tags: ["clinical-learning", "sop"] },
];

// ════════════════════════════════════════════════════════════
// TAG DETECTION
// ════════════════════════════════════════════════════════════
function tagsFor(text: string, route?: string): string[] {
  const tags = new Set<string>();
  if (route) tags.add(route.toLowerCase().replace(/_/g, "-"));
  if (/youtube|youtu\.be|video\s+notes|captions?/i.test(text)) tags.add("external-video");
  if (/pubmed|cancer|tumou?r|biomedical|clinical\s+trial|genomics|immunotherapy/i.test(text)) tags.add("biomedical-research");
  if (/github|repo|repositories/i.test(text)) tags.add("github");
  if (/docx|pdf|ppt|artifact|word\s+file|document|powerpoint/i.test(text)) tags.add("artifact");
  if (/osce|quiz|flashcard|hand\s+hygiene|cannulation|aseptic|clinical\s+skill|sop|revision/i.test(text)) tags.add("clinical-learning");
  if (/agi|ai\s+agent|agentic|llm|gpt|claude|gemini/i.test(text)) tags.add("ai-research");
  if (/hacker\s+news|hackernews|hn\.algolia/i.test(text)) tags.add("tech-research");
  if (/research|article|paper|study|pubmed/i.test(text)) tags.add("research");
  return [...tags].slice(0, 10);
}

// ════════════════════════════════════════════════════════════
// IMPORTANCE SCORING
// ════════════════════════════════════════════════════════════
function scoreImportance(role: "user" | "assistant", route: string | undefined, tags: string[], text: string): number {
  const routeScore = route ? (ROUTE_IMPORTANCE[route] ?? 0.65) : 0.60;
  const roleBoost = role === "user" ? 0.10 : 0.0;
  const tagBoost = Math.min(0.15, tags.length * 0.025);
  const lengthBoost = text.length > 200 ? 0.05 : 0;
  const urlBoost = /https?:\/\//i.test(text) ? 0.08 : 0;
  return Math.min(1.0, routeScore + roleBoost + tagBoost + lengthBoost + urlBoost);
}

// ════════════════════════════════════════════════════════════
// TOKENISATION
// ════════════════════════════════════════════════════════════
function tokenize(text: string): Set<string> {
  return new Set(
    String(text)
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, " ")
      .split(/\s+/)
      .filter(w => w.length > 2)
  );
}

function tokenOverlap(queryTokens: Set<string>, candidate: string): number {
  if (!queryTokens.size) return 0;
  const haystack = candidate.toLowerCase();
  let hits = 0;
  for (const token of queryTokens) if (haystack.includes(token)) hits++;
  return hits / queryTokens.size;
}

// ════════════════════════════════════════════════════════════
// RECENCY DECAY
// Half-life = 12h within a session; 48h across sessions
// ════════════════════════════════════════════════════════════
function recencyScore(createdAt: string, sameSession: boolean): number {
  const ageMs = Date.now() - new Date(createdAt).getTime();
  const halfLifeMs = sameSession ? 12 * 60 * 60 * 1000 : 48 * 60 * 60 * 1000;
  return Math.exp(-0.693 * ageMs / halfLifeMs);
}

// ════════════════════════════════════════════════════════════
// COMPOSITE EPISODIC SCORING
// score = 0.35 × relevance + 0.25 × importance + 0.20 × recency + 0.20 × sessionBoost
// ════════════════════════════════════════════════════════════
function scoreEpisodic(
  mem: EpisodicMemory,
  queryTokens: Set<string>,
  activeSessionId: string
): number {
  const sameSession = mem.sessionId === activeSessionId;
  const relevance = tokenOverlap(queryTokens, `${mem.text} ${mem.tags.join(" ")}`);
  const recency = recencyScore(mem.createdAt, sameSession);
  const sessionBoost = sameSession ? 0.20 : 0.0;
  return (relevance * 0.35) + (mem.importance * 0.25) + (recency * 0.20) + sessionBoost;
}

// ════════════════════════════════════════════════════════════
// COMPOSITE SEMANTIC SCORING
// score = 0.50 × relevance + 0.30 × confidence + 0.20 × recency
// ════════════════════════════════════════════════════════════
function scoreSemantic(node: SemanticNode, queryTokens: Set<string>): number {
  const relevance = tokenOverlap(queryTokens, `${node.concept} ${node.definition} ${node.tags.join(" ")}`);
  const recency = recencyScore(node.updatedAt, false);
  return (relevance * 0.50) + (node.confidence * 0.30) + (recency * 0.20);
}

// ════════════════════════════════════════════════════════════
// SEMANTIC CONCEPT EXTRACTION
// ════════════════════════════════════════════════════════════
function extractConcepts(
  text: string,
  tags: string[],
  turnId: string,
  sessionId: string,
  existing: SemanticNode[]
): SemanticNode[] {
  const newNodes: SemanticNode[] = [];
  const existingConcepts = new Map(existing.map(n => [n.concept.toLowerCase(), n]));

  for (const { pattern, concept, tags: conceptTags } of SEMANTIC_PATTERNS) {
    if (!pattern.test(text)) continue;

    const existingNode = existingConcepts.get(concept.toLowerCase());
    if (existingNode) {
      if (!existingNode.sourceTurnIds.includes(turnId)) existingNode.sourceTurnIds.push(turnId);
      if (!existingNode.sessionIds.includes(sessionId)) existingNode.sessionIds.push(sessionId);
      existingNode.confidence = Math.min(1.0, existingNode.confidence + 0.05);
      existingNode.updatedAt = nowIso();
      existingNode.accessCount++;
      continue;
    }

    const allTags = [...new Set([...tags, ...conceptTags])];
    const node: SemanticNode = {
      id: id("sem"),
      concept,
      definition: `User discussed ${concept} in clinical/research context.`,
      confidence: 0.75,
      tags: allTags,
      relatedConcepts: [],
      sourceTurnIds: [turnId],
      sessionIds: [sessionId],
      createdAt: nowIso(),
      updatedAt: nowIso(),
      accessCount: 1,
    };
    newNodes.push(node);
    existingConcepts.set(concept.toLowerCase(), node);
  }

  // Also extract YouTube URLs as semantic nodes (so follow-up questions remember the source)
  const urlMatch = text.match(/https?:\/\/(?:www\.)?(?:youtube\.com|youtu\.be)[^\s)>\]]+/i);
  if (urlMatch) {
    const url = urlMatch[0].replace(/[.,;]+$/, "");
    const urlConcept = `YouTube: ${url}`;
    if (!existingConcepts.has(urlConcept.toLowerCase())) {
      newNodes.push({
        id: id("sem"),
        concept: urlConcept,
        definition: `YouTube video URL referenced in this session.`,
        confidence: 0.95,
        tags: ["external-video", "youtube"],
        relatedConcepts: [],
        sourceTurnIds: [turnId],
        sessionIds: [sessionId],
        createdAt: nowIso(),
        updatedAt: nowIso(),
        accessCount: 1,
      });
    }
  }

  return newNodes;
}

// ════════════════════════════════════════════════════════════
// PROCEDURAL SUCCESS RATE
// ════════════════════════════════════════════════════════════
function computeSuccessRate(mem: ProceduralMemory): number {
  const recent = mem.recentOutcomes;
  if (!recent.length) return mem.uses > 0 ? mem.successes / mem.uses : 0;
  return recent.filter(Boolean).length / recent.length;
}

// ════════════════════════════════════════════════════════════
// CONTEXT BLOCK BUILDER
// ════════════════════════════════════════════════════════════
function clip(text: string, max: number): string {
  const clean = String(text || "").replace(/\s+/g, " ").trim();
  return clean.length > max ? `${clean.slice(0, max - 3)}...` : clean;
}

function buildContextBlock(
  recall: Omit<MemoryRecall, "contextBlock">
): string {
  const lines: string[] = [];

  if (recall.summary) lines.push(`Session summary: ${recall.summary}`);
  if (recall.semanticProfile) lines.push(`User interests: ${recall.semanticProfile}`);

  if (recall.semanticContext.length) {
    lines.push("Known topics from this conversation:");
    for (const node of recall.semanticContext.slice(0, 5)) {
      lines.push(`  • ${node.concept} (confidence ${(node.confidence * 100).toFixed(0)}%)`);
    }
  }

  if (recall.recentTurns.length) {
    lines.push("Recent turns:");
    for (const t of recall.recentTurns.slice(-6)) {
      lines.push(`  ${t.role}: ${clip(t.text, 200)}`);
    }
  }

  if (recall.relevantTurns.length) {
    lines.push("Relevant remembered turns:");
    for (const t of recall.relevantTurns.slice(0, 5)) {
      lines.push(`  ${t.role} [${t.tags.slice(0, 3).join(", ")}]: ${clip(t.text, 250)}`);
    }
  }

  if (recall.proceduralInsights.length) {
    lines.push("Procedural context:");
    for (const insight of recall.proceduralInsights) lines.push(`  • ${insight}`);
  }

  return lines.filter(Boolean).join("\n");
}

// ════════════════════════════════════════════════════════════
// SESSION SUMMARY BUILDER
// ════════════════════════════════════════════════════════════
function buildSummary(session: SessionState): string {
  const userTurns = session.episodic.filter(t => t.role === "user").slice(-10);
  const allTags = new Set<string>();
  for (const t of userTurns) for (const tag of t.tags) allTags.add(tag);
  const topicList = [...allTags].slice(0, 6).join(", ") || "general Study-Buddy use";
  const lastAsk = userTurns.at(-1)?.text || "";
  return `User has worked on: ${topicList}. Last request: ${clip(lastAsk, 240)}`;
}

function buildSemanticProfile(session: SessionState, semantic: SemanticNode[]): string {
  const sessionSemantics = semantic
    .filter(n => n.sessionIds.includes(session.sessionId))
    .sort((a, b) => b.confidence * b.accessCount - a.confidence * a.accessCount)
    .slice(0, 6)
    .map(n => n.concept);
  if (!sessionSemantics.length) return "";
  return `Interested in: ${sessionSemantics.join(", ")}`;
}

// ════════════════════════════════════════════════════════════
// PROCEDURAL INSIGHTS
// ════════════════════════════════════════════════════════════
function buildProceduralInsights(procedural: Record<string, ProceduralMemory>): string[] {
  return Object.values(procedural)
    .filter(p => p.uses >= 2)
    .sort((a, b) => b.uses - a.uses)
    .slice(0, 4)
    .map(p => {
      const rate = (computeSuccessRate(p) * 100).toFixed(0);
      return `${p.workflow}: used ${p.uses}× (${rate}% success rate)`;
    });
}

// ════════════════════════════════════════════════════════════
// TRI-LAYER COGNITION ENGINE
// ════════════════════════════════════════════════════════════
export class CognitionEngine {
  private filePath: string;
  private sessions = new Map<string, SessionState>();
  private semantic: SemanticNode[] = [];

  constructor(dataDir: string) {
    this.filePath = path.join(dataDir, "cognition", "cognition-store.json");
    this.load();
  }

  // ── PERSISTENCE ──────────────────────────────────────────

  private load(): void {
    try {
      if (!fs.existsSync(this.filePath)) return;
      const raw = JSON.parse(fs.readFileSync(this.filePath, "utf8")) as CognitionStore;
      for (const session of raw.sessions || []) this.sessions.set(session.sessionId, session);
      this.semantic = raw.semantic || [];
    } catch {
      this.sessions.clear();
      this.semantic = [];
    }
  }

  private save(): void {
    fs.mkdirSync(path.dirname(this.filePath), { recursive: true });
    const store: CognitionStore = {
      sessions: [...this.sessions.values()],
      semantic: this.semantic,
      updatedAt: nowIso(),
    };
    fs.writeFileSync(this.filePath, JSON.stringify(store, null, 2));
  }

  // ── SESSION ACCESS ────────────────────────────────────────

  getSession(sessionId: string): SessionState {
    const existing = this.sessions.get(sessionId);
    if (existing) return existing;
    const created: SessionState = {
      sessionId,
      summary: "",
      semanticProfile: "",
      episodic: [],
      procedural: {},
      updatedAt: nowIso(),
    };
    this.sessions.set(sessionId, created);
    return created;
  }

  // ── STAGE 0: AUTO-RECALL ──────────────────────────────────
  // Called BEFORE planning so orchestrator always has context

  recall(sessionId: string, query: string, limit = 6): MemoryRecall {
    const session = this.getSession(sessionId);
    const queryTokens = tokenize(query);

    // Recent turns (always include last 8 turns regardless of score)
    const recentTurns = session.episodic.slice(-8);

    // Relevant turns: scored across ALL sessions (with session boost)
    const allEpisodic = [...this.sessions.values()].flatMap(s => s.episodic);
    const relevantTurns = allEpisodic
      .filter(m => !recentTurns.some(r => r.id === m.id)) // exclude already-recent
      .map(m => ({ mem: m, score: scoreEpisodic(m, queryTokens, sessionId) }))
      .filter(x => x.score > 0.15)
      .sort((a, b) => b.score - a.score)
      .slice(0, limit)
      .map(x => x.mem);

    // Semantic context: concepts most relevant to this query
    const semanticContext = this.semantic
      .map(n => ({ node: n, score: scoreSemantic(n, queryTokens) }))
      .filter(x => x.score > 0.20)
      .sort((a, b) => b.score - a.score)
      .slice(0, 6)
      .map(x => {
        x.node.accessCount++;
        return x.node;
      });

    // Procedural insights
    const proceduralInsights = buildProceduralInsights(session.procedural);

    const partial: Omit<MemoryRecall, "contextBlock"> = {
      sessionId,
      summary: session.summary,
      semanticProfile: session.semanticProfile,
      recentTurns,
      relevantTurns,
      semanticContext,
      proceduralInsights,
    };

    return { ...partial, contextBlock: buildContextBlock(partial) };
  }

  // ── ADD TURN (EPISODIC + SEMANTIC CONSOLIDATION) ──────────

  addTurn(
    sessionId: string,
    role: "user" | "assistant",
    text: string,
    route?: string
  ): EpisodicMemory {
    const session = this.getSession(sessionId);
    const tags = tagsFor(text, route);
    const importance = scoreImportance(role, route, tags, text);
    const turn: EpisodicMemory = {
      id: id("ep"),
      sessionId,
      role,
      text: clip(text, 4000),
      route,
      tags,
      importance,
      createdAt: nowIso(),
    };

    // Add to episodic store; cap at 60 turns per session
    session.episodic.push(turn);
    if (session.episodic.length > 60) session.episodic = session.episodic.slice(-60);

    // Immediate semantic consolidation — extract concepts from user turns
    if (role === "user") {
      const newNodes = extractConcepts(text, tags, turn.id, sessionId, this.semantic);
      this.semantic.push(...newNodes);
      // Cap global semantic store at 500 nodes; prune lowest confidence + oldest
      if (this.semantic.length > 500) {
        this.semantic = this.semantic
          .sort((a, b) => (b.confidence * b.accessCount) - (a.confidence * a.accessCount))
          .slice(0, 500);
      }
    }

    // Rebuild summaries
    session.summary = buildSummary(session);
    session.semanticProfile = buildSemanticProfile(session, this.semantic);
    session.updatedAt = nowIso();

    this.save();
    return turn;
  }

  // ── PROCEDURAL RECORDING ──────────────────────────────────

  recordProcedure(
    sessionId: string,
    workflow: string,
    success: boolean,
    importanceHint = 0.7
  ): void {
    const session = this.getSession(sessionId);
    const existing = session.procedural[workflow] ?? {
      workflow,
      uses: 0,
      successes: 0,
      recentOutcomes: [],
      lastUsed: nowIso(),
      avgImportance: importanceHint,
    };

    existing.uses++;
    if (success) existing.successes++;
    existing.recentOutcomes.push(success);
    if (existing.recentOutcomes.length > 10) existing.recentOutcomes.shift();
    existing.lastUsed = nowIso();
    existing.avgImportance = (existing.avgImportance * 0.8) + (importanceHint * 0.2);

    session.procedural[workflow] = existing;
    session.updatedAt = nowIso();
    this.save();
  }

  // ── REMEMBERED VIDEO URL ──────────────────────────────────
  // Searches semantic nodes for YouTube URLs from this session

  rememberedVideoUrl(sessionId: string): string | undefined {
    const sessionNodes = this.semantic
      .filter(n => n.sessionIds.includes(sessionId) && n.concept.startsWith("YouTube:"))
      .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
    if (!sessionNodes.length) return undefined;
    const url = sessionNodes[0].concept.replace(/^YouTube:\s*/i, "").trim();
    return /^https?:\/\//i.test(url) ? url : undefined;
  }

  // ── STATS ─────────────────────────────────────────────────

  stats(sessionId?: string): Record<string, unknown> {
    const sessions = sessionId
      ? [this.getSession(sessionId)]
      : [...this.sessions.values()];

    return {
      sessions: sessions.length,
      episodicTurns: sessions.reduce((s, sess) => s + sess.episodic.length, 0),
      semanticNodes: this.semantic.length,
      proceduralWorkflows: sessions.reduce(
        (s, sess) => s + Object.keys(sess.procedural).length, 0
      ),
      avgImportance: sessions.length
        ? (sessions.flatMap(s => s.episodic).reduce(
            (s, t) => s + t.importance, 0
          ) / Math.max(1, sessions.flatMap(s => s.episodic).length)).toFixed(2)
        : 0,
      updatedAt: nowIso(),
    };
  }

  // ── BACKWARD COMPATIBILITY SHIM ───────────────────────────
  // Allows old ConversationMemoryStore callers to work unchanged

  /** @deprecated Use recall() instead */
  getMemoryRecallAsConversationMemory(sessionId: string, query: string): {
    sessionId: string;
    summary: string;
    recentTurns: Array<{ id: string; role: string; text: string; route?: string; tags: string[]; createdAt: string }>;
    relevantTurns: Array<{ id: string; role: string; text: string; route?: string; tags: string[]; createdAt: string }>;
    contextBlock: string;
  } {
    const r = this.recall(sessionId, query);
    return {
      sessionId: r.sessionId,
      summary: r.summary,
      recentTurns: r.recentTurns,
      relevantTurns: r.relevantTurns,
      contextBlock: r.contextBlock,
    };
  }
}
