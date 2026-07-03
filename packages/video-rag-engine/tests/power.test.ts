import test from "node:test";
import assert from "node:assert/strict";
import os from "node:os";
import path from "node:path";
import { LongVideoRagToolEngine } from "../src/core/engine.js";
import { ForgeVideoRagTool } from "../src/tool/forgeTool.js";
import { planQuery } from "../src/retrieval/queryPlanner.js";

test("query planner detects timestamp and modality intent", () => {
  const plan = planQuery("What text was written on screen at 2:17?");
  assert.equal(plan.timestampHintSec, 137);
  assert.ok(plan.needsOcr);
  assert.ok(plan.needsTemporalNeighborhood);
});

test("batch ingest creates multiple indexed videos and timeline", async () => {
  const engine = new LongVideoRagToolEngine({ config: { dataDir: path.join(os.tmpdir(), `forge-vrag-${Date.now()}`) } });
  const batch = await engine.ingestBatch({ collectionId: "c1", sources: [
    { sourceType: "synthetic", uri: "a", durationSec: 1800 },
    { sourceType: "synthetic", uri: "b", durationSec: 1800 }
  ]});
  assert.equal(batch.succeeded, 2);
  const timeline = await engine.timeline("c1");
  assert.ok(timeline.length > 0);
  const answer = await engine.ask({ collectionId: "c1", question: "What does the speaker explain?" });
  assert.ok(answer.citations.length > 0);
});

test("FORGE tool exposes health and plan actions", async () => {
  const tool = new ForgeVideoRagTool(new LongVideoRagToolEngine({ config: { dataDir: path.join(os.tmpdir(), `forge-vrag-tool-${Date.now()}`) } }));
  const health = await tool.invoke({ action: "video.health", workspaceId: "w1", payload: { collectionId: "default" } });
  assert.equal(health.ok, true);
  const plan = await tool.invoke({ action: "video.plan", workspaceId: "w1", approved: true, payload: { source: { sourceType: "synthetic", uri: "x", durationSec: 7200 } } });
  assert.equal(plan.ok, true);
});
