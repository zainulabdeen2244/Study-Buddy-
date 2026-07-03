#!/usr/bin/env node
import { LongVideoRagToolEngine } from "../core/engine.js";
import { ForgeVideoRagTool } from "../tool/forgeTool.js";
import { VideoSource } from "../core/types.js";

function getArg(name: string, fallback?: string): string | undefined {
  const idx = process.argv.indexOf(`--${name}`);
  return idx >= 0 ? process.argv[idx+1] : fallback;
}

const cmd = process.argv[2];
const engine = new LongVideoRagToolEngine();
const tool = new ForgeVideoRagTool(engine);

if (cmd === "ingest") {
  const source: VideoSource = { sourceType: (getArg("type", "synthetic") as any), uri: getArg("uri", "demo")!, durationSec: Number(getArg("duration", "3600")), collectionId: getArg("collection", "default") };
  const result = await engine.ingest(source, { collectionId: source.collectionId, enableVision: getArg("vision", "false") === "true" });
  console.log(JSON.stringify(result, null, 2));
} else if (cmd === "batch") {
  const collectionId = getArg("collection", "default")!;
  const count = Number(getArg("count", "3"));
  const concurrency = Number(getArg("concurrency", "2"));
  const sources = Array.from({ length: count }, (_, i) => ({ sourceType: "synthetic" as const, uri: `demo-${i+1}`, durationSec: 3600, collectionId }));
  console.log(JSON.stringify(await engine.ingestBatch({ collectionId, sources, concurrency }), null, 2));
} else if (cmd === "ask") {
  const collectionId = getArg("collection", "default")!;
  const question = getArg("q", "What is this collection about?")!;
  console.log(JSON.stringify(await engine.ask({ collectionId, question }), null, 2));
} else if (cmd === "search") {
  const collectionId = getArg("collection", "default")!;
  const question = getArg("q", "What is this collection about?")!;
  console.log(JSON.stringify(await engine.searchEvidence({ collectionId, question }), null, 2));
} else if (cmd === "audit-answer") {
  const collectionId = getArg("collection", "default")!;
  const question = getArg("q", "What is this collection about?")!;
  console.log(JSON.stringify(await engine.auditAnswer({ collectionId, question }), null, 2));
} else if (cmd === "query-plan") {
  console.log(JSON.stringify(engine.queryPlan(getArg("q", "What text is on screen at 2:17?")!), null, 2));
} else if (cmd === "timeline") {
  console.log(JSON.stringify(await engine.timeline(getArg("collection", "default")!), null, 2));
} else if (cmd === "stats") {
  console.log(JSON.stringify(await engine.stats(getArg("collection", "default")!), null, 2));
} else if (cmd === "coverage") {
  console.log(JSON.stringify(await engine.coverage(getArg("collection", "default")!), null, 2));
} else if (cmd === "manifest") {
  console.log(JSON.stringify(await engine.manifest(getArg("collection", "default")!), null, 2));
} else if (cmd === "premortem") {
  console.log(JSON.stringify(await engine.premortem(getArg("collection", "default")!), null, 2));
} else if (cmd === "reindex-plan") {
  console.log(JSON.stringify(await engine.reindexPlan(getArg("collection", "default")!, getArg("mode", "balanced") as any), null, 2));
} else if (cmd === "memory-map") {
  console.log(JSON.stringify(await engine.memoryMap(getArg("collection", "default")!), null, 2));
} else if (cmd === "report") {
  console.log(JSON.stringify(await engine.readinessReport(getArg("collection", "default")!), null, 2));
} else if (cmd === "spec") {
  console.log(JSON.stringify(await engine.spec(getArg("goal", "Build long-video RAG capability")!, getArg("collection", "default")!), null, 2));
} else if (cmd === "provider-status") {
  console.log(JSON.stringify(await engine.providerStatus(), null, 2));
} else if (cmd === "production-gate") {
  const type = getArg("type", "youtube") as any;
  const source: VideoSource = { sourceType: type, uri: getArg("uri", "https://youtu.be/example")!, collectionId: getArg("collection", "default") };
  console.log(JSON.stringify(await engine.productionGate({ action: "ingest", source, options: { enableVision: getArg("vision", "false") === "true" } }), null, 2));
} else if (cmd === "e2e-plan") {
  const { buildE2EProofPlan } = await import("../ops/e2ePlan.js");
  console.log(JSON.stringify(buildE2EProofPlan(getArg("collection", "default")!), null, 2));
} else if (cmd === "trace") {
  console.log(JSON.stringify(await tool.invoke({ action: "video.trace", workspaceId: "cli", payload: { traceId: getArg("traceId"), limit: Number(getArg("limit", "100")) } }), null, 2));
} else {
  console.log(`FORGE Video RAG 100H TypeScript Tool\nCommands:\n  provider-status
  production-gate --type youtube --uri https://youtu.be/... --collection demo
  e2e-plan --collection demo
  ingest-url --url https://youtu.be/... --collection demo
  ingest-file --path ./video.mp4 --collection demo
  ingest --type synthetic --uri demo --duration 7200 --collection demo\n  batch --collection demo --count 5 --concurrency 2\n  ask --collection demo --q "What is explained?"\n  audit-answer --collection demo --q "What is shown at 2:17?"\n  query-plan --q "What text is on screen at 2:17?"\n  timeline --collection demo\n  stats --collection demo\n  coverage --collection demo\n  manifest --collection demo\n  report --collection demo\n  spec --goal "Build 100h video RAG" --collection demo\n  provider-status
  trace --limit 20`);
}
