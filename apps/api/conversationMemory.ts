import fs from "node:fs";
import path from "node:path";
import { id, nowIso } from "../../packages/video-rag-engine/src/core/utils.js";

export interface ConversationTurn {
  id: string;
  role: "user" | "assistant";
  text: string;
  route?: string;
  tags: string[];
  createdAt: string;
}

export interface SessionMemory {
  sessionId: string;
  summary: string;
  turns: ConversationTurn[];
  procedural: Record<string, { uses: number; successes: number; lastUsed: string }>;
  updatedAt: string;
}

export interface MemoryRecall {
  sessionId: string;
  summary: string;
  recentTurns: ConversationTurn[];
  relevantTurns: ConversationTurn[];
  contextBlock: string;
}

function tokenize(text: string): string[] {
  return [...new Set(String(text).toLowerCase().replace(/[^a-z0-9\s-]/g, " ").split(/\s+/).filter(w => w.length > 2))];
}

function tagsFor(text: string, route?: string): string[] {
  const tags = new Set<string>();
  if (route) tags.add(route.toLowerCase());
  if (/youtube|youtu\.be|video notes|captions?/i.test(text)) tags.add("external-video");
  if (/pubmed|cancer|diagnosis|biomedical|clinical trial/i.test(text)) tags.add("biomedical-research");
  if (/github|repo|repositories/i.test(text)) tags.add("github");
  if (/docx|pdf|ppt|artifact|word file|document/i.test(text)) tags.add("artifact");
  if (/osce|quiz|flashcard|hand hygiene|cannulation|aseptic/i.test(text)) tags.add("clinical-learning");
  if (/agi|ai agent|agentic/i.test(text)) tags.add("ai-research");
  return [...tags].slice(0, 8);
}

function clip(text: string, max = 900): string {
  const clean = String(text || "").replace(/\s+/g, " ").trim();
  return clean.length > max ? `${clean.slice(0, max - 3)}...` : clean;
}

function scoreTurn(queryTokens: string[], turn: ConversationTurn): number {
  const haystack = `${turn.text} ${turn.tags.join(" ")}`.toLowerCase();
  let score = 0;
  for (const token of queryTokens) if (haystack.includes(token)) score += 1;
  return score / Math.max(1, queryTokens.length);
}

export class ConversationMemoryStore {
  private filePath: string;
  private sessions = new Map<string, SessionMemory>();

  constructor(private workspaceRoot: string) {
    this.filePath = path.join(workspaceRoot, ".data", "study-buddy", "cognition", "conversation-memory.json");
    this.load();
  }

  private load(): void {
    try {
      if (!fs.existsSync(this.filePath)) return;
      const raw = JSON.parse(fs.readFileSync(this.filePath, "utf8")) as { sessions?: SessionMemory[] };
      for (const session of raw.sessions || []) this.sessions.set(session.sessionId, session);
    } catch {
      this.sessions.clear();
    }
  }

  private save(): void {
    fs.mkdirSync(path.dirname(this.filePath), { recursive: true });
    fs.writeFileSync(this.filePath, JSON.stringify({ sessions: [...this.sessions.values()] }, null, 2));
  }

  getSession(sessionId: string): SessionMemory {
    const existing = this.sessions.get(sessionId);
    if (existing) return existing;
    const created: SessionMemory = { sessionId, summary: "", turns: [], procedural: {}, updatedAt: nowIso() };
    this.sessions.set(sessionId, created);
    return created;
  }

  recall(sessionId: string, query: string, limit = 5): MemoryRecall {
    const session = this.getSession(sessionId);
    const queryTokens = tokenize(query);
    const recentTurns = session.turns.slice(-8);
    const relevantTurns = session.turns
      .map(turn => ({ turn, score: scoreTurn(queryTokens, turn) }))
      .filter(item => item.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, limit)
      .map(item => item.turn);
    const lines = [
      session.summary ? `Session summary: ${session.summary}` : "",
      recentTurns.length ? "Recent turns:" : "",
      ...recentTurns.map(turn => `- ${turn.role}: ${clip(turn.text, 180)}`),
      relevantTurns.length ? "Relevant remembered turns:" : "",
      ...relevantTurns.map(turn => `- ${turn.role} [${turn.tags.join(", ")}]: ${clip(turn.text, 220)}`)
    ].filter(Boolean);
    return { sessionId, summary: session.summary, recentTurns, relevantTurns, contextBlock: lines.join("\n") };
  }

  addTurn(sessionId: string, role: "user" | "assistant", text: string, route?: string): ConversationTurn {
    const session = this.getSession(sessionId);
    const turn: ConversationTurn = { id: id("turn"), role, text: clip(text, 6000), route, tags: tagsFor(text, route), createdAt: nowIso() };
    session.turns.push(turn);
    if (session.turns.length > 40) session.turns = session.turns.slice(-40);
    session.summary = this.buildSummary(session);
    session.updatedAt = nowIso();
    this.save();
    return turn;
  }

  recordProcedure(sessionId: string, workflow: string, success: boolean): void {
    const session = this.getSession(sessionId);
    const current = session.procedural[workflow] || { uses: 0, successes: 0, lastUsed: nowIso() };
    current.uses += 1;
    if (success) current.successes += 1;
    current.lastUsed = nowIso();
    session.procedural[workflow] = current;
    session.updatedAt = nowIso();
    this.save();
  }

  stats(sessionId?: string): Record<string, unknown> {
    const sessions = sessionId ? [this.getSession(sessionId)] : [...this.sessions.values()];
    return {
      sessions: sessions.length,
      turns: sessions.reduce((sum, session) => sum + session.turns.length, 0),
      semanticSummaries: sessions.filter(session => session.summary).length,
      proceduralWorkflows: sessions.reduce((sum, session) => sum + Object.keys(session.procedural).length, 0),
      updatedAt: nowIso()
    };
  }

  private buildSummary(session: SessionMemory): string {
    const userTurns = session.turns.filter(turn => turn.role === "user").slice(-8);
    const topics = new Set<string>();
    for (const turn of userTurns) for (const tag of turn.tags) topics.add(tag);
    const lastAsk = userTurns.at(-1)?.text || "";
    const topicText = [...topics].slice(0, 6).join(", ") || "general Study-Buddy use";
    return `User has recently worked on ${topicText}. Last user request: ${clip(lastAsk, 220)}`;
  }
}
