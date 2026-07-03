import test from "node:test";
import assert from "node:assert/strict";
import os from "node:os";
import path from "node:path";
import { LongVideoRagToolEngine } from "../src/core/engine.js";

test("spec engine creates locked spec and traceability gate without embedded skills", async () => {
  const engine = new LongVideoRagToolEngine({ config: { dataDir: path.join(os.tmpdir(), `forge-vrag-spec-${Date.now()}`) } });
  const result = await engine.spec("Build a 100+ hour video RAG tool for FORGE with workspace streaming and verification", "demo");
  assert.equal(result.spec.specLock.sourceOfTruth, "spec");
  assert.ok(result.spec.specLock.hash.length >= 16);
  assert.ok(result.spec.requirements.length >= 5);
  assert.ok(result.spec.traceabilityMap.some(t => t.requirementId === "REQ-002"));
  assert.ok(result.gate.checks.length >= 3);
  assert.equal(Object.prototype.hasOwnProperty.call(result, "skills"), false);
  assert.ok(["pass", "needs_work", "blocked"].includes(result.gate.releaseDecision));
});

test("coverage report exposes gaps and next actions before ingest", async () => {
  const engine = new LongVideoRagToolEngine({ config: { dataDir: path.join(os.tmpdir(), `forge-vrag-coverage-${Date.now()}`) } });
  const report = await engine.coverage("empty");
  assert.equal(report.videos, 0);
  assert.ok(report.gaps.length > 0);
  assert.ok(report.nextActions.length > 0);
});

