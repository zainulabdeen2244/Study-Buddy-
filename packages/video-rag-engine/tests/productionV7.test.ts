import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { LongVideoRagToolEngine } from "../src/core/engine.js";
import { ForgeVideoRagTool } from "../src/tool/forgeTool.js";

function tempDir(name: string) { return fs.mkdtempSync(path.join(os.tmpdir(), name)); }

test("v7 production gate blocks real ingest when required providers are missing", async () => {
  const engine = new LongVideoRagToolEngine({ config: { dataDir: tempDir("video-rag-v7-gate-"), realProviders: true, allowRemote: true, allowedRemoteHosts: ["youtu.be"], strictProductionGate: true, allowDegradedProduction: false } });
  const gate = await engine.productionGate({ action: "ingest", source: { sourceType: "youtube", uri: "https://youtu.be/demo", collectionId: "demo" }, options: { enableVision: true } });
  assert.equal(gate.status, "blocked");
  assert.ok(gate.requiredCapabilities.includes("download"));
  assert.ok(gate.requiredCapabilities.includes("transcribe"));
  assert.ok(gate.blockers.length > 0);
});

test("v7 synthetic ingest still works while production gate protects real media", async () => {
  const engine = new LongVideoRagToolEngine({ config: { dataDir: tempDir("video-rag-v7-synthetic-"), realProviders: true, strictProductionGate: true } });
  const result = await engine.ingest({ sourceType: "synthetic", uri: "synthetic-demo", durationSec: 120, collectionId: "demo" }, { collectionId: "demo" });
  assert.ok(result.evidenceCount > 0);
  const report = await engine.readinessReport("demo");
  assert.ok(["ready", "needs_work", "blocked"].includes(report.status));
});

test("v7 FORGE exposes production gate and e2e proof plan actions", async () => {
  const engine = new LongVideoRagToolEngine({ config: { dataDir: tempDir("video-rag-v7-tool-"), realProviders: true, strictProductionGate: true } });
  const tool = new ForgeVideoRagTool(engine);
  const gate = await tool.invoke({ action: "video.productionGate", workspaceId: "test", payload: { action: "ingest", source: { sourceType: "local", uri: "./missing.mp4", collectionId: "demo" }, options: { enableVision: false } } });
  assert.equal(gate.ok, true);
  assert.equal((gate.data as any).status, "blocked");
  const plan = await tool.invoke({ action: "video.e2ePlan", workspaceId: "test", payload: { collectionId: "demo" } });
  assert.equal(plan.ok, true);
  assert.ok((plan.data as any).steps.length >= 5);
});

test("v7 package remains clean with no embedded skills or python implementation", async () => {
  const root = process.cwd();
  const forbidden: string[] = [];
  const walk = (dir: string) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      const rel = path.relative(root, full).replaceAll(path.sep, "/");
      if (rel.startsWith("node_modules/") || rel.startsWith("dist/")) continue;
      if (entry.isDirectory()) walk(full);
      else if (entry.name.endsWith(".SKILL.md") || entry.name.endsWith(".py") || rel.startsWith("skills/")) forbidden.push(rel);
    }
  };
  walk(root);
  assert.deepEqual(forbidden, []);
});
