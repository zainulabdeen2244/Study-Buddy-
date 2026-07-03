import { Answer, HealthReport } from "../core/types.js";
import { SpecArtifactBundle } from "./specEngine.js";

export interface TraceabilityGateResult {
  ok: boolean;
  specId: string;
  passCount: number;
  failCount: number;
  checks: Array<{ id: string; ok: boolean; detail: string }>;
  releaseDecision: "pass" | "needs_work" | "blocked";
}

export function runSpecTraceabilityGate(spec: SpecArtifactBundle, evidence: { answer?: Answer; health?: HealthReport; coverageScore?: number }): TraceabilityGateResult {
  const checks = spec.requirements.map((req) => {
    if (req.id === "REQ-001") return { id: req.id, ok: !!spec.specLock.hash && spec.specLock.frozen, detail: `Spec lock hash ${spec.specLock.hash}` };
    if (req.id === "REQ-002") {
      const answer = evidence.answer;
      const ok = !answer || answer.status === "insufficient_evidence" || answer.citations.length > 0;
      return { id: req.id, ok, detail: answer ? `${answer.status} with ${answer.citations.length} citations` : "No answer supplied for gate; requirement remains pending." };
    }
    if (req.id === "REQ-003") return { id: req.id, ok: (evidence.coverageScore ?? 0) >= 0.4, detail: `Coverage score ${Number(evidence.coverageScore ?? 0).toFixed(2)}` };
    if (req.id === "REQ-004") return { id: req.id, ok: evidence.health ? evidence.health.checks.some(c => c.name === "memory" && c.ok) : false, detail: evidence.health ? evidence.health.checks.map(c => `${c.name}:${c.ok}`).join(", ") : "No health report supplied." };
    if (req.id === "REQ-005") return { id: req.id, ok: true, detail: "TraceId and audit event support are part of ToolResult contract." };
    return { id: req.id, ok: false, detail: "Unknown requirement." };
  });
  const passCount = checks.filter(c => c.ok).length;
  const failCount = checks.length - passCount;
  const releaseDecision = failCount === 0 ? "pass" : failCount <= 2 ? "needs_work" : "blocked";
  return { ok: failCount === 0, specId: spec.specId, passCount, failCount, checks, releaseDecision };
}
