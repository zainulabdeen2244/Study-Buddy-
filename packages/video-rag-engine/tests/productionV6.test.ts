import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { LongVideoRagToolEngine } from "../src/core/engine.js";
import { ForgeVideoRagTool } from "../src/tool/forgeTool.js";
import { safeSpawn } from "../src/core/safeSpawn.js";
import { LocalVectorStore } from "../src/storage/vector/localVectorStore.js";

function tempDir() { return fs.mkdtempSync(path.join(os.tmpdir(), "forge-video-rag-v6-")); }

test("v6 provider status is truthful and exposed through FORGE action", async () => {
  const dir = tempDir();
  const tool = new ForgeVideoRagTool(new LongVideoRagToolEngine({ config: { dataDir: dir, workspaceRoot: dir, realProviders: true } }));
  const result = await tool.invoke({ action: "video.providerStatus", workspaceId: "w1", payload: {} });
  assert.equal(result.ok, true);
  const report = result.data as any;
  assert.ok(["production_capable", "partially_configured", "scaffold_only"].includes(report.readiness));
  assert.equal(report.realProvidersEnabled, true);
  assert.ok(Array.isArray(report.entries));
  assert.ok(report.entries.some((e: any) => e.capability === "download"));
  assert.ok(report.entries.some((e: any) => e.capability === "transcribe"));
});

test("v6 permission gate blocks real media ingest actions without approval", async () => {
  const dir = tempDir();
  const tool = new ForgeVideoRagTool(new LongVideoRagToolEngine({ config: { dataDir: dir, workspaceRoot: dir } }));
  const result = await tool.invoke({ action: "video.ingestUrl", workspaceId: "w1", payload: { url: "https://youtu.be/example" } });
  assert.equal(result.ok, false);
  assert.match(result.error || "", /approval|Permission/i);
});

test("v6 safeSpawn uses args arrays and captures output", async () => {
  const result = await safeSpawn(process.execPath, ["-e", "console.log('safe-spawn-ok')"], { timeoutMs: 10_000 });
  assert.equal(result.exitCode, 0);
  assert.match(result.stdout, /safe-spawn-ok/);
});

test("v6 local vector store can search stored vectors", () => {
  const store = new LocalVectorStore([{ id: "v1", collectionId: "c", evidenceId: "e1", dims: 3, vector: [1, 0, 0], createdAt: new Date().toISOString() }]);
  const hits = store.search("c", [1, 0, 0], 1);
  assert.equal(hits.length, 1);
  assert.equal(hits[0].vector.evidenceId, "e1");
  assert.ok(hits[0].score > 0.99);
});
