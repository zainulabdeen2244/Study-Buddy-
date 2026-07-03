import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { LongVideoRagToolEngine } from "../src/core/engine.js";
import { ForgeVideoRagTool } from "../src/tool/forgeTool.js";

function tempDir() { return fs.mkdtempSync(path.join(os.tmpdir(), "forge-video-rag-v22-")); }

test("clean pro manifest exposes per-video quality and reindex recommendations", async () => {
  const dir = tempDir();
  const engine = new LongVideoRagToolEngine({ config: { dataDir: dir, workspaceRoot: dir } });
  await engine.ingest({ sourceType: "synthetic", uri: "synthetic://manifest", title: "Manifest Demo", collectionId: "c1", durationSec: 3600 }, { collectionId: "c1", enableOcr: true });
  const manifest = await engine.manifest("c1");
  assert.equal(manifest.collectionId, "c1");
  assert.equal(manifest.videos.length, 1);
  assert.ok(["usable", "production_candidate", "research_only"].includes(manifest.readiness));
  assert.ok(manifest.videos[0].evidence > 0);
  assert.ok(Object.keys(manifest.modalityTotals).length > 0);
});

test("answer support audit checks citations and question-term support", async () => {
  const dir = tempDir();
  const engine = new LongVideoRagToolEngine({ config: { dataDir: dir, workspaceRoot: dir } });
  await engine.ingest({ sourceType: "synthetic", uri: "synthetic://audit", title: "Audit Demo", collectionId: "c2", durationSec: 3600 }, { collectionId: "c2", enableOcr: true });
  const result = await engine.auditAnswer({ collectionId: "c2", question: "What important concepts does the speaker explain?" });
  assert.ok(result.answer.citations.length > 0);
  assert.ok(result.audit.citationCount > 0);
  assert.ok(["accept", "ask_followup", "requery", "ingest_more_evidence"].includes(result.audit.recommendation));
});

test("forge tool writes real trace records and exposes query plan action", async () => {
  const dir = tempDir();
  const tool = new ForgeVideoRagTool(new LongVideoRagToolEngine({ config: { dataDir: dir, workspaceRoot: dir } }));
  const plan = await tool.invoke({ action: "video.queryPlan", workspaceId: "w1", payload: { question: "What text is written on screen at 2:17?" } });
  assert.equal(plan.ok, true);
  assert.equal((plan.data as any).needsOcr, true);
  const trace = await tool.invoke({ action: "video.trace", workspaceId: "w1", payload: { limit: 10 } });
  assert.equal(trace.ok, true);
  assert.ok((trace.data as any).count >= 1);
});

test("package stays clean: no embedded skills and no python implementation", () => {
  const root = process.cwd();
  const allFiles: string[] = [];
  const walk = (dir: string) => {
    for (const entry of fs.readdirSync(dir)) {
      if (["node_modules", "dist", ".git"].includes(entry)) continue;
      const full = path.join(dir, entry);
      const stat = fs.statSync(full);
      if (stat.isDirectory()) walk(full); else allFiles.push(path.relative(root, full));
    }
  };
  walk(root);
  assert.equal(allFiles.some(f => f.includes("/skills/") || f.startsWith("skills/")), false);
  assert.equal(allFiles.some(f => f.endsWith(".SKILL.md")), false);
  assert.equal(allFiles.some(f => f.endsWith(".py")), false);
});
