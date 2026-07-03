import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { LongVideoRagToolEngine } from "../src/core/engine.js";

function tempDir() { return fs.mkdtempSync(path.join(os.tmpdir(), "forge-video-rag-ts-")); }

test("ingests synthetic long video and answers with citations", async () => {
  const dir = tempDir();
  const engine = new LongVideoRagToolEngine({ config: { dataDir: dir, workspaceRoot: dir } });
  const result = await engine.ingest({ sourceType: "synthetic", uri: "synthetic://course", title: "Course", collectionId: "c1", durationSec: 7200 }, { collectionId: "c1", enableOcr: true });
  assert.ok(result.evidenceCount > 0);
  const stats = await engine.stats("c1");
  assert.equal(stats.videos, 1);
  const answer = await engine.ask({ collectionId: "c1", question: "What important concepts are explained?" });
  assert.ok(answer.citations.length > 0);
  assert.notEqual(answer.status, "insufficient_evidence");
});

test("dry run creates plan without evidence", async () => {
  const dir = tempDir();
  const engine = new LongVideoRagToolEngine({ config: { dataDir: dir, workspaceRoot: dir } });
  const result = await engine.ingest({ sourceType: "synthetic", uri: "synthetic://huge", collectionId: "c2", durationSec: 100 * 3600 }, { collectionId: "c2", dryRun: true });
  assert.equal(result.evidenceCount, 0);
  assert.ok(result.costPlan.estimatedVisionCalls > 0);
});
