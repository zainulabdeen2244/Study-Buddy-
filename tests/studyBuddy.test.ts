import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { StudyBuddyOrchestrator } from "../apps/api/studyBuddyOrchestrator.js";

function fresh(name: string) {
  const dir = `.data/test-${name}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  fs.rmSync(dir, { recursive: true, force: true });
  return new StudyBuddyOrchestrator({ workspaceRoot: process.cwd(), dataDir: dir, collectionId: "study-buddy-demo" });
}

test("loads golden demo into actual FORGE VideoRAG store", async () => {
  const m = fresh("load");
  const res = await m.loadGoldenDemo();
  assert.equal(res.ok, true);
  assert.ok((res.stats as any).evidence >= 20);
  assert.ok((res.manifest as any).videos.length >= 2);
});

test("ask pipeline returns citations, safety audit, and agent trace", async () => {
  const m = fresh("ask");
  await m.loadGoldenDemo();
  const res = await m.ask("Where does the instructor explain hand hygiene?");
  assert.equal(res.ok, true);
  assert.ok(res.videoRagAnswer?.citations.length);
  assert.equal(res.safetyAudit.riskLevel, "low");
  assert.ok(res.agentTrace.length >= 4);
});

test("unsafe dosage question is blocked before retrieval output", async () => {
  const m = fresh("unsafe");
  await m.loadGoldenDemo();
  const res = await m.ask("What dose should I give my patient?");
  assert.equal(res.safetyAudit.decision, "blocked");
  assert.match(res.answer, /cannot/i);
});

test("generates OSCE station", async () => {
  const m = fresh("osce");
  await m.loadGoldenDemo();
  const res = await m.ask("Generate an OSCE station from this video and SOP.");
  assert.ok(res.osce);
  assert.ok(res.osce!.examinerChecklist.length >= 5);
});

test("generates quiz pack", async () => {
  const m = fresh("quiz");
  await m.loadGoldenDemo();
  const res = await m.ask("Generate five MCQs and flashcards with timestamps.");
  assert.ok(res.quiz);
  assert.equal(res.quiz!.mcqs.length, 5);
  assert.ok(res.quiz!.flashcards.length >= 3);
});

test("transcript and document ingest builds custom index", async () => {
  const m = fresh("ingest");
  const res = await m.ingestTranscriptAndDocument({ collectionId: "custom", transcriptText: "At 1 minute we explain hand hygiene. Then we clean the site and avoid retouching.", documentText: "Hand hygiene is required before sterile equipment. Dispose sharps safely." });
  assert.equal(res.ok, true);
  assert.ok((res.stats as any).evidence >= 2);
});

test("video preflight calls production gate and e2e plan", async () => {
  const m = fresh("plan");
  const res = await m.planVideoIngest({ uri: "./demo.mp4", sourceType: "local" });
  assert.equal(res.ok, true);
  assert.ok(res.productionGate);
  assert.ok(res.e2ePlan);
});

test("research plan keeps last30days separate from clinical evidence", () => {
  const m = fresh("research");
  const res = m.researchPlan("nursing students clinical skills mistakes");
  assert.equal(res.ok, true);
  assert.match(String(res.note), /not use recent social data as clinical evidence/i);
});

test("imported useful agents are registered with guardrails", () => {
  const m = fresh("agents");
  const agents = m.agentRegistry();
  const names = agents.map(agent => agent.name);
  assert.ok(names.includes("Deep Research Analyst"));
  assert.ok(names.includes("Source Verification Agent"));
  assert.ok(names.includes("UX Researcher"));
  assert.ok(names.includes("Brand Guardian"));
  assert.ok(names.includes("Learning Psychologist"));
  assert.ok(agents.every(agent => agent.guardrails.length >= 2));
});

test("research prompts skip clinical VideoRAG and LLM composer", async () => {
  const m = fresh("research-ask");
  const res = await m.ask("Find best trending GitHub repos about agentic AI agents");
  assert.equal(res.route.intent, "RESEARCH_STUDENT_PAIN");
  assert.equal(res.route.needsVideoRag, false);
  assert.equal(res.videoRagAnswer, undefined);
  assert.equal(res.evidenceBundle, undefined);
  assert.ok(res.agentTrace.some(step => step.agent === "RecentPainPointResearchAgent"));
  assert.ok(!res.agentTrace.some(step => step.agent === "OptionalLLMComposer"));
});

test("new article prompts route to research instead of clinical evidence", async () => {
  const m = fresh("article-research");
  const res = await m.ask("find the new articles on AI & AGI");
  assert.equal(res.route.intent, "RESEARCH_STUDENT_PAIN");
  assert.equal(res.route.needsVideoRag, false);
  assert.equal(res.videoRagAnswer, undefined);
  assert.equal(res.evidenceBundle, undefined);
  assert.ok(res.agentTrace.some(step => step.agent === "RecentPainPointResearchAgent"));
  assert.ok(!res.agentTrace.some(step => step.agent === "VideoEvidenceAgent"));
  assert.ok(!res.agentTrace.some(step => step.agent === "OptionalLLMComposer"));
});

test("biomedical research prompts do not hallucinate from clinical demo evidence", async () => {
  const m = fresh("biomedical-research");
  await m.loadGoldenDemo();
  const res = await m.ask("Tell me about the Research of Cancer diagnosis and solution ?");
  assert.equal(res.route.intent, "RESEARCH_STUDENT_PAIN");
  assert.equal(res.route.needsVideoRag, false);
  assert.equal(res.videoRagAnswer, undefined);
  assert.equal(res.evidenceBundle, undefined);
  assert.match(res.answer, /Biomedical Research Brief|PubMed|research education/i);
  assert.doesNotMatch(res.answer, /hand hygiene|cannulation|sharps|OSCE/i);
});

test("external youtube note prompts do not reuse clinical demo evidence", async () => {
  const m = fresh("external-video-notes");
  await m.loadGoldenDemo();
  const res = await m.ask("Give me short Notes from this video : https://www.youtube.com/live/ucFn05nNte8?si=eybXFLh-QKP5uDZ2");
  assert.equal(res.route.intent, "RESEARCH_STUDENT_PAIN");
  assert.equal(res.route.needsVideoRag, false);
  assert.equal(res.videoRagAnswer, undefined);
  assert.equal(res.evidenceBundle, undefined);
  assert.equal(res.orchestratorPlan?.intent, "external_video_notes");
  assert.match(res.answer, /Video Notes Workspace|Short Notes|transcript|external video|captions/i);
  assert.doesNotMatch(res.answer, /hand hygiene|cannulation|sharps|OSCE/i);
});

test("general help prompts do not fall into clinical demo evidence", async () => {
  const m = fresh("general-help");
  await m.loadGoldenDemo();
  const res = await m.ask("What can Study-Buddy help me do today?");
  assert.equal(res.route.needsVideoRag, false);
  assert.equal(res.videoRagAnswer, undefined);
  assert.equal(res.evidenceBundle, undefined);
  assert.match(res.answer, /Study-Buddy Can Help With|External Video Notes|Artifacts/i);
  assert.doesNotMatch(res.answer, /hand hygiene|cannulation|sharps|OSCE/i);
});

test("conversation memory recalls prior turns without using clinical VideoRAG", async () => {
  const m = fresh("conversation-memory");
  const sessionId = `memory-session-${Date.now()}`;
  await m.ask("Tell me about AGI from recent posts, articles, and blogs.", "study-buddy-demo", sessionId);
  const res = await m.ask("What did I ask before?", "study-buddy-demo", sessionId);
  assert.equal(res.route.needsVideoRag, false);
  assert.equal(res.videoRagAnswer, undefined);
  assert.equal(res.evidenceBundle, undefined);
  assert.match(res.answer, /AGI|recent posts|articles|blogs/i);
  assert.match(res.answer, /conversation continuity|Memory Boundary/i);
  assert.ok(res.agentTrace.some(step => step.agent === "ConversationMemoryAgent"));
});

test("conversation memory resolves remembered youtube source for follow-up video prompts", async () => {
  const m = fresh("remembered-youtube");
  const sessionId = `youtube-memory-session-${Date.now()}`;
  await m.ask("Give me short Notes from this video : https://www.youtube.com/live/ucFn05nNte8?si=eybXFLh-QKP5uDZ2", "study-buddy-demo", sessionId);
  const res = await m.ask("Explain that video and show the timing", "study-buddy-demo", sessionId);
  assert.equal(res.route.intent, "RESEARCH_STUDENT_PAIN");
  assert.equal(res.route.needsVideoRag, false);
  assert.equal(res.orchestratorPlan?.intent, "external_video_notes");
  assert.ok(res.agentTrace.some(step => step.agent === "ConversationMemoryAgent" && /previous URL|remembered source/i.test(step.outputSummary)));
  assert.doesNotMatch(res.answer, /hand hygiene|cannulation|sharps|OSCE/i);
});

test("orchestrator plans artifacts for research requests", async () => {
  const m = fresh("research-artifact");
  const res = await m.ask("Find GitHub repos about agentic AI agents and create a Word file");
  assert.equal(res.route.intent, "RESEARCH_STUDENT_PAIN");
  assert.equal(res.orchestratorPlan?.needsArtifact, true);
  assert.equal(res.suggestedArtifact?.kind, "docx");
  assert.ok(!res.agentTrace.some(step => step.agent === "OptionalLLMComposer"));
});

import { ArtifactStudio } from "../apps/api/artifactStudio.js";

test("artifact studio creates PDF, DOCX, PPTX and chart assets with manifests", () => {
  const studio = new ArtifactStudio(process.cwd());
  for (const kind of ["pdf", "docx", "pptx", "chart"] as const) {
    const res = studio.create({ kind, title: `Test ${kind}`, prompt: "Create a safe Study-Buddy learning artifact", sourceText: "Hand hygiene, OSCE checklist, quiz, safety audit." });
    assert.equal(res.ok, true);
    assert.ok(res.artifacts[0].sizeBytes > 100);
    assert.match(res.artifacts[0].checksum, /^[a-f0-9]{64}$/);
    assert.ok(fs.existsSync(res.artifacts[0].filePath));
  }
});
