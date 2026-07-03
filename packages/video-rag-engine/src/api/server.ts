import http from "node:http";
import { LongVideoRagToolEngine } from "../core/engine.js";
import { ForgeVideoRagTool } from "../tool/forgeTool.js";
import { answerToCards, timelineToCards } from "../ui/presenters.js";

const engine = new LongVideoRagToolEngine();
const tool = new ForgeVideoRagTool(engine);

async function readJson(req: any): Promise<any> {
  const chunks: any[] = [];
  for await (const chunk of req) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  const raw = Buffer.concat(chunks).toString("utf8");
  return raw ? JSON.parse(raw) : {};
}

function send(res: any, status: number, body: unknown): void {
  res.writeHead(status, { "content-type": "application/json" });
  res.end(JSON.stringify(body, null, 2));
}

const routes = [
  "GET /health",
  "POST /forge/tool",
  "POST /ingest",
  "POST /ingest-url",
  "POST /ingest-file",
  "POST /ask",
  "POST /search",
  "POST /audit-answer",
  "POST /query-plan",
  "GET /timeline",
  "GET /stats",
  "GET /coverage",
  "GET /manifest",
  "GET /report",
  "GET /premortem",
  "GET /reindex-plan",
  "GET /memory-map",
  "GET /provider-status",
  "GET /trace",
  "POST /spec"
];

const server = http.createServer(async (req: any, res: any) => {
  try {
    const url = new URL(req.url || "/", "http://localhost");
    if (req.method === "GET" && url.pathname === "/health") return send(res, 200, await tool.invoke({ action: "video.health", workspaceId: "api", payload: { collectionId: url.searchParams.get("collectionId") || "default" } }));
    if (req.method === "POST" && url.pathname === "/forge/tool") return send(res, 200, await tool.invoke(await readJson(req)));
    if (req.method === "POST" && url.pathname === "/ingest") {
      const body = await readJson(req);
      return send(res, 200, await tool.invoke({ action: "video.ingest", workspaceId: body.workspaceId || "api", approved: !!body.approved, payload: body }));
    }
    if (req.method === "POST" && url.pathname === "/ingest-url") {
      const body = await readJson(req);
      return send(res, 200, await tool.invoke({ action: "video.ingestUrl", workspaceId: body.workspaceId || "api", approved: !!body.approved, payload: body }));
    }
    if (req.method === "POST" && url.pathname === "/ingest-file") {
      const body = await readJson(req);
      return send(res, 200, await tool.invoke({ action: "video.ingestFile", workspaceId: body.workspaceId || "api", approved: !!body.approved, payload: body }));
    }
    if (req.method === "POST" && url.pathname === "/ask") {
      const body = await readJson(req);
      const result = await tool.invoke({ action: "video.ask", workspaceId: body.workspaceId || "api", payload: body });
      return send(res, 200, result.ok ? { ...result, cards: answerToCards(result.data as any) } : result);
    }
    if (req.method === "POST" && url.pathname === "/search") {
      const body = await readJson(req);
      return send(res, 200, await tool.invoke({ action: "video.search", workspaceId: body.workspaceId || "api", payload: body }));
    }
    if (req.method === "POST" && url.pathname === "/audit-answer") {
      const body = await readJson(req);
      const result = await tool.invoke({ action: "video.auditAnswer", workspaceId: body.workspaceId || "api", payload: body });
      return send(res, 200, result.ok ? { ...result, cards: answerToCards((result.data as any).answer) } : result);
    }
    if (req.method === "POST" && url.pathname === "/query-plan") {
      const body = await readJson(req);
      return send(res, 200, await tool.invoke({ action: "video.queryPlan", workspaceId: body.workspaceId || "api", payload: { question: body.question || body.q || "" } }));
    }
    if (req.method === "GET" && url.pathname === "/timeline") {
      const collectionId = url.searchParams.get("collectionId") || "default";
      const timeline = await engine.timeline(collectionId);
      return send(res, 200, { timeline, cards: timelineToCards(timeline) });
    }
    if (req.method === "GET" && url.pathname === "/stats") return send(res, 200, await engine.stats(url.searchParams.get("collectionId") || "default"));
    if (req.method === "GET" && url.pathname === "/coverage") return send(res, 200, await engine.coverage(url.searchParams.get("collectionId") || "default"));
    if (req.method === "GET" && url.pathname === "/manifest") return send(res, 200, await engine.manifest(url.searchParams.get("collectionId") || "default"));
    if (req.method === "GET" && url.pathname === "/report") return send(res, 200, await engine.readinessReport(url.searchParams.get("collectionId") || "default"));
    if (req.method === "GET" && url.pathname === "/premortem") return send(res, 200, await engine.premortem(url.searchParams.get("collectionId") || "default"));
    if (req.method === "GET" && url.pathname === "/reindex-plan") return send(res, 200, await engine.reindexPlan(url.searchParams.get("collectionId") || "default", (url.searchParams.get("mode") || "balanced") as any));
    if (req.method === "GET" && url.pathname === "/memory-map") return send(res, 200, await engine.memoryMap(url.searchParams.get("collectionId") || "default"));
    if (req.method === "GET" && url.pathname === "/provider-status") return send(res, 200, await engine.providerStatus());
    if (req.method === "GET" && url.pathname === "/trace") return send(res, 200, await tool.invoke({ action: "video.trace", workspaceId: "api", payload: { traceId: url.searchParams.get("traceId") || undefined, limit: Number(url.searchParams.get("limit") || 100) } }));
    if (req.method === "POST" && url.pathname === "/spec") {
      const body = await readJson(req);
      return send(res, 200, await tool.invoke({ action: "video.spec", workspaceId: body.workspaceId || "api", payload: { goal: body.goal || "Build long-video RAG capability", collectionId: body.collectionId || "default" } }));
    }
    send(res, 404, { error: "Not found", routes });
  } catch (error) {
    send(res, 500, { error: error instanceof Error ? error.message : String(error) });
  }
});

const port = Number(process.env.PORT || 8787);
server.listen(port, () => console.log(`FORGE Video RAG TS Tool API running on :${port}`));
