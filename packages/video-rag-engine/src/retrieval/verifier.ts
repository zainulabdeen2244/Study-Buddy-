import { Answer, Modality, QueryPlan, VerifierReport } from "../core/types.js";

export function verifyAnswer(answer: Answer, plan: QueryPlan): VerifierReport {
  const modalities = new Set(answer.citations.map(c => c.modality));
  const missing: Modality[] = [];
  if (plan.needsTranscript && !modalities.has("transcript")) missing.push("transcript");
  if (plan.needsOcr && !modalities.has("ocr")) missing.push("ocr");
  if (plan.needsVisual && !modalities.has("frame")) missing.push("frame");
  const weakClaims: string[] = [];
  if (!answer.citations.length) weakClaims.push("No timestamp citations were attached.");
  if (answer.confidence < plan.verifierThreshold) weakClaims.push(`Confidence is below verifier threshold ${plan.verifierThreshold}.`);
  for (const m of missing) weakClaims.push(`Question likely needs ${m} evidence, but none was retrieved.`);
  const contradictionRisk = Math.max(0, Math.min(1, missing.length * 0.18 + (answer.citations.length < 2 ? 0.22 : 0)));
  const penalty = missing.length * 0.08 + contradictionRisk * 0.15;
  const finalConfidence = Number(Math.max(0, answer.confidence - penalty).toFixed(3));
  const status = finalConfidence < plan.verifierThreshold ? "insufficient_evidence" : finalConfidence >= 0.62 ? "supported" : "partial";
  const notes = [...answer.verifierNotes, ...weakClaims];
  if (status === "supported") notes.push("Verifier found enough timestamped evidence for a supported answer.");
  return { supportedClaims: Math.max(0, answer.citations.length - weakClaims.length), weakClaims, missingModalities: missing, contradictionRisk, finalConfidence, status, notes };
}

export function applyVerifier(answer: Answer, report: VerifierReport): Answer {
  if (report.status === "insufficient_evidence") {
    return { ...answer, status: "insufficient_evidence", confidence: report.finalConfidence, answer: "I do not have enough grounded multimodal video evidence to answer this reliably.", verifierNotes: report.notes };
  }
  return { ...answer, status: report.status, confidence: report.finalConfidence, verifierNotes: report.notes };
}
