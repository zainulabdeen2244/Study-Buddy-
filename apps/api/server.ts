import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { StudyBuddyOrchestrator } from "./studyBuddyOrchestrator.js";
import { ArtifactStudio } from "./artifactStudio.js";
import { log, logError } from "./logger.js";

const root = process.cwd();
function loadLocalEnv(filePath = path.join(root, ".env")): void {
  if (!fs.existsSync(filePath)) return;
  const raw = fs.readFileSync(filePath, "utf8");
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq <= 0) continue;
    const key = trimmed.slice(0, eq).trim();
    const value = trimmed.slice(eq + 1).trim().replace(/^["']|["']$/g, "");
    if (!(key in process.env)) process.env[key] = value;
  }
}

loadLocalEnv();
const staticDir = path.join(root, "apps", "web", "static");
const studyBuddy = new StudyBuddyOrchestrator({ workspaceRoot: root });
const artifactStudio = new ArtifactStudio(root);
const generatedDir = path.join(root, ".data", "study-buddy", "generated");

async function readJson(req: any): Promise<any> {
  const chunks: any[] = [];
  for await (const chunk of req) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  const raw = Buffer.concat(chunks).toString("utf8");
  return raw ? JSON.parse(raw) : {};
}

function cors() { return { "access-control-allow-origin": "*", "access-control-allow-headers": "content-type", "access-control-allow-methods": "GET,POST,OPTIONS" }; }
function sendJson(res: any, status: number, body: unknown): void { res.writeHead(status, { "content-type": "application/json; charset=utf-8", ...cors() }); res.end(JSON.stringify(body, null, 2)); }
function sendText(res: any, status: number, body: string, type = "text/plain"): void { res.writeHead(status, { "content-type": `${type}; charset=utf-8`, ...cors() }); res.end(body); }
function safeStaticPath(urlPath: string): string | null {
  const normalized = path.normalize(path.join(staticDir, urlPath === "/" ? "index.html" : urlPath.replace(/^\//, "")));
  return normalized.startsWith(staticDir) ? normalized : null;
}
function contentType(filePath: string): string { const ext = path.extname(filePath); return ext === ".html" ? "text/html" : ext === ".css" ? "text/css" : ext === ".js" ? "text/javascript" : ext === ".svg" ? "image/svg+xml" : ext === ".json" ? "application/json" : "application/octet-stream"; }

const routes = [
  "GET /",
  "GET /api/status",
  "POST /api/demo/load",
  "POST /api/ask",
  "POST /api/ingest/text",
  "POST /api/ingest/video-plan",
  "POST /api/osce",
  "POST /api/quiz",
  "POST /api/revision",
  "POST /api/research/plan",
  "POST /api/artifacts/create",
  "GET /api/artifacts",
  "GET /api/artifact-skills",
  "GET /api/agents",
  "GET /generated/:file",
  "GET /api/dashboard",
  "GET /api/provider-status",
  "GET /api/production-gate",
  "GET /api/coverage",
  "GET /api/manifest",
  "GET /api/memory-map",
  "GET /api/conversation-memory",
  "GET /api/reindex-plan",
  "GET /api/premortem",
  "POST /api/videorag/ask",
  "POST /api/videorag/search"
];

const server = http.createServer(async (req: any, res: any) => {
  const t0 = Date.now();
  try {
    if (req.method === "OPTIONS") return sendJson(res, 200, { ok: true });
    const url = new URL(req.url || "/", "http://localhost");
    const collectionId = url.searchParams.get("collectionId") || studyBuddy.collectionId;
    log.info("server", `${req.method} ${url.pathname}`);

    if (req.method === "GET" && (url.pathname === "/" || url.pathname === "/index.html" || url.pathname.startsWith("/assets/"))) {
      const p = safeStaticPath(url.pathname);
      if (!p || !fs.existsSync(p) || fs.statSync(p).isDirectory()) return sendJson(res, 404, { error: "Asset not found" });
      return sendText(res, 200, fs.readFileSync(p, "utf8"), contentType(p));
    }
    if (req.method === "GET" && url.pathname.startsWith("/generated/")) {
      const requested = path.basename(url.pathname);
      const p = path.join(generatedDir, requested);
      if (!p.startsWith(generatedDir) || !fs.existsSync(p) || fs.statSync(p).isDirectory()) return sendJson(res, 404, { error: "Generated artifact not found" });
      const ext = path.extname(p);
      const type = ext === ".pdf" ? "application/pdf" : ext === ".docx" ? "application/vnd.openxmlformats-officedocument.wordprocessingml.document" : ext === ".pptx" ? "application/vnd.openxmlformats-officedocument.presentationml.presentation" : ext === ".svg" ? "image/svg+xml" : ext === ".zip" ? "application/zip" : "application/octet-stream";
      res.writeHead(200, { "content-type": type, "content-disposition": `attachment; filename=\"${requested}\"`, ...cors() });
      return res.end(fs.readFileSync(p));
    }
    if (req.method === "GET" && url.pathname === "/api/status") {
      const [providerStatus, productionGate] = await Promise.all([studyBuddy.engine.providerStatus(), studyBuddy.engine.productionGate({ action: "provider_check" })]);
      return sendJson(res, 200, { ok: true, app: "Study-Buddy", version: "6.0.0-workshop-focused", collectionId: studyBuddy.collectionId, routes, providerStatus, productionGate });
    }
    if (req.method === "POST" && url.pathname === "/api/demo/load") return sendJson(res, 200, await studyBuddy.loadGoldenDemo());
    if (req.method === "POST" && url.pathname === "/api/ask") {
      const body = await readJson(req);
      const question = String(body.question || body.q || "");
      const sessionId = body.sessionId || body.chatId || body.collectionId || studyBuddy.collectionId;
      log.info("ask", `question="${question.slice(0, 120)}"`, { sessionId, collectionId: body.collectionId || studyBuddy.collectionId });
      const result = await studyBuddy.ask(question, body.collectionId || studyBuddy.collectionId, sessionId);
      log.info("ask", `done intent=${result.route.intent} safetyDecision=${result.safetyAudit.decision}`, { durationMs: Date.now() - t0, agentSteps: result.agentTrace.length });
      if (result.suggestedArtifact && body.autoArtifact !== false) {
        const artifactResult = artifactStudio.create(result.suggestedArtifact);
        result.artifacts = artifactResult.artifacts;
        result.agentTrace.push(...artifactResult.trace);
      }
      return sendJson(res, 200, result);
    }
    if (req.method === "POST" && url.pathname === "/api/osce") { const body = await readJson(req); return sendJson(res, 200, await studyBuddy.ask(String(body.question || "Generate an OSCE station from this video and SOP."), body.collectionId || studyBuddy.collectionId, body.sessionId || body.chatId || body.collectionId || studyBuddy.collectionId)); }
    if (req.method === "POST" && url.pathname === "/api/quiz") { const body = await readJson(req); return sendJson(res, 200, await studyBuddy.ask(String(body.question || "Generate five MCQs and flashcards with timestamps."), body.collectionId || studyBuddy.collectionId, body.sessionId || body.chatId || body.collectionId || studyBuddy.collectionId)); }
    if (req.method === "POST" && url.pathname === "/api/revision") { const body = await readJson(req); return sendJson(res, 200, await studyBuddy.ask(String(body.question || "Create a revision plan for weak topics."), body.collectionId || studyBuddy.collectionId, body.sessionId || body.chatId || body.collectionId || studyBuddy.collectionId)); }
    if (req.method === "POST" && url.pathname === "/api/research/plan") { const body = await readJson(req); return sendJson(res, 200, studyBuddy.researchPlan(String(body.topic || "medical students OSCE struggles"))); }
    if (req.method === "POST" && url.pathname === "/api/artifacts/create") { const body = await readJson(req); return sendJson(res, 200, artifactStudio.create(body)); }
    if (req.method === "GET" && url.pathname === "/api/artifacts") return sendJson(res, 200, { ok: true, artifacts: artifactStudio.list() });
    if (req.method === "GET" && url.pathname === "/api/artifact-skills") return sendJson(res, 200, { ok: true, skills: artifactStudio.skills() });
    if (req.method === "GET" && url.pathname === "/api/agents") return sendJson(res, 200, { ok: true, agents: studyBuddy.agentRegistry() });
    if (req.method === "POST" && url.pathname === "/api/ingest/text") { const body = await readJson(req); return sendJson(res, 200, await studyBuddy.ingestTranscriptAndDocument(body)); }
    if (req.method === "POST" && url.pathname === "/api/ingest/video-plan") { const body = await readJson(req); return sendJson(res, 200, await studyBuddy.planVideoIngest(body)); }
    if (req.method === "GET" && url.pathname === "/api/dashboard") return sendJson(res, 200, await studyBuddy.dashboard(collectionId));
    if (req.method === "GET" && url.pathname === "/api/provider-status") return sendJson(res, 200, await studyBuddy.engine.providerStatus());
    if (req.method === "GET" && url.pathname === "/api/production-gate") return sendJson(res, 200, await studyBuddy.engine.productionGate({ action: "provider_check" }));
    if (req.method === "GET" && url.pathname === "/api/coverage") return sendJson(res, 200, await studyBuddy.engine.coverage(collectionId));
    if (req.method === "GET" && url.pathname === "/api/manifest") return sendJson(res, 200, await studyBuddy.engine.manifest(collectionId));
    if (req.method === "GET" && url.pathname === "/api/memory-map") return sendJson(res, 200, await studyBuddy.engine.memoryMap(collectionId));
    if (req.method === "GET" && url.pathname === "/api/conversation-memory") return sendJson(res, 200, { ok: true, stats: studyBuddy.conversationMemoryStats(url.searchParams.get("sessionId") || undefined) });
    if (req.method === "GET" && url.pathname === "/api/reindex-plan") return sendJson(res, 200, await studyBuddy.engine.reindexPlan(collectionId, "production_hardening"));
    if (req.method === "GET" && url.pathname === "/api/premortem") return sendJson(res, 200, await studyBuddy.engine.premortem(collectionId));
    if (req.method === "POST" && url.pathname === "/api/videorag/ask") { const body = await readJson(req); return sendJson(res, 200, await studyBuddy.engine.auditAnswer({ collectionId: body.collectionId || studyBuddy.collectionId, question: String(body.question || body.q || ""), topK: Number(body.topK || 10) })); }
    if (req.method === "POST" && url.pathname === "/api/videorag/search") { const body = await readJson(req); return sendJson(res, 200, await studyBuddy.engine.searchEvidence({ collectionId: body.collectionId || studyBuddy.collectionId, question: String(body.question || body.q || ""), topK: Number(body.topK || 12), limit: Number(body.limit || 16) })); }
    log.warn("server", `404 ${req.method} ${url.pathname}`);
    return sendJson(res, 404, { error: "Not found", routes });
  } catch (error) {
    logError("server", `Unhandled request error ${req.method} ${req.url}`, error, { durationMs: Date.now() - t0 });
    return sendJson(res, 500, { error: error instanceof Error ? error.message : String(error), stack: process.env.NODE_ENV === "production" ? undefined : error instanceof Error ? error.stack : undefined });
  }
});

const port = Number(process.env.PORT || 7860);
server.listen(port, () => {
  log.info("server", `Study-Buddy v6 running on http://localhost:${port}`, { logLevel: process.env.LOG_LEVEL || "info", logFile: ".data/study-buddy/logs/study-buddy.log" });
});
