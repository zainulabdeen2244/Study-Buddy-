import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { LongVideoRagToolEngine } from "../src/core/engine.js";
import { ForgeVideoRagTool } from "../src/tool/forgeTool.js";

function tempDir() { return fs.mkdtempSync(path.join(os.tmpdir(), "forge-video-rag-v5-")); }

test("v5 evidence search returns bundle with risks and temporal metadata", async () => {
  const dir = tempDir();
  const engine = new LongVideoRagToolEngine({ config: { dataDir: dir, workspaceRoot: dir } });
  await engine.ingest({ sourceType: "synthetic", uri: "synthetic://bundle", title: "Bundle Demo", collectionId: "v5", durationSec: 3600 }, { collectionId: "v5", enableOcr: true, enableVision: true });
  const bundle = await engine.searchEvidence({ collectionId: "v5", question: "What text is written on screen at 2:17?" });
  assert.equal(bundle.queryPlan.needsOcr, true);
  assert.ok(bundle.items.length > 0);
  assert.ok(bundle.supportScore >= 0);
  assert.ok(["answer", "requery", "ask_clarifying_question", "ingest_more_evidence"].includes(bundle.suggestedNextAction));
  assert.ok(typeof bundle.temporalCoverage.spanSec === "number");
});

test("v5 premortem, reindex plan, and memory map are exposed as FORGE actions", async () => {
  const dir = tempDir();
  const tool = new ForgeVideoRagTool(new LongVideoRagToolEngine({ config: { dataDir: dir, workspaceRoot: dir } }));
  await tool.invoke({ action: "video.ingest", workspaceId: "w1", approved: true, payload: { source: { sourceType: "synthetic", uri: "synthetic://pm", title: "PM", collectionId: "v5", durationSec: 1200 }, options: { collectionId: "v5", enableOcr: true } } });
  const premortem = await tool.invoke({ action: "video.premortem", workspaceId: "w1", payload: { collectionId: "v5" } });
  assert.equal(premortem.ok, true);
  assert.ok((premortem.data as any).failureModes.length >= 5);
  const reindexPlan = await tool.invoke({ action: "video.reindexPlan", workspaceId: "w1", payload: { collectionId: "v5", mode: "production_hardening" } });
  assert.equal(reindexPlan.ok, true);
  assert.ok(Array.isArray((reindexPlan.data as any).steps));
  const memoryMap = await tool.invoke({ action: "video.memoryMap", workspaceId: "w1", payload: { collectionId: "v5" } });
  assert.equal(memoryMap.ok, true);
  assert.ok((memoryMap.data as any).levels.clip >= 1);
});
