import { Answer, Citation } from "../core/types.js";
import { secondsToTimestamp } from "../core/utils.js";
import { SearchHit } from "./search.js";

export function composeGroundedAnswer(question: string, hits: SearchHit[], minConfidence = 0.35): Answer {
  const citations: Citation[] = hits.slice(0, 8).map(h => ({
    evidenceId: h.evidence.id,
    videoId: h.evidence.videoId,
    modality: h.evidence.modality,
    startSec: h.evidence.startSec,
    endSec: h.evidence.endSec,
    score: Number(h.score.toFixed(4)),
    excerpt: h.evidence.text.slice(0, 260)
  }));
  const top = hits[0]?.score ?? 0;
  const diversity = new Set(citations.map(c=>c.modality)).size / 4;
  const citationStrength = Math.min(1, citations.length / 4);
  const confidence = Math.max(0, Math.min(1, top * 1.25 + diversity * 0.25 + citationStrength * 0.18));
  const notes: string[] = [];
  if (!citations.length) notes.push("No evidence was retrieved.");
  if (confidence < minConfidence) notes.push(`Confidence ${confidence.toFixed(2)} is below threshold ${minConfidence}.`);
  if (citations.length && !citations.some(c=>c.modality === "transcript")) notes.push("No transcript citation was found; spoken content may be missing.");
  if (citations.length && !citations.some(c=>c.modality === "ocr" || c.modality === "frame")) notes.push("No visual citation was found; visual content may be missing.");

  if (!citations.length || confidence < minConfidence) {
    return { status: "insufficient_evidence", answer: "I do not have enough grounded video evidence to answer this reliably.", confidence: Number(confidence.toFixed(3)), citations, verifierNotes: notes };
  }
  const evidenceLines = citations.slice(0, 4).map(c => `[${secondsToTimestamp(c.startSec)}-${secondsToTimestamp(c.endSec)} ${c.modality}] ${c.excerpt}`).join(" ");
  const answer = `Based on the indexed video evidence, the best supported answer to “${question}” is: ${evidenceLines}`;
  const status = confidence >= 0.55 && citations.length >= 2 ? "supported" : "partial";
  if (status === "partial") notes.push("Answer is partial because evidence is limited or weakly matched.");
  return { status, answer, confidence: Number(confidence.toFixed(3)), citations, verifierNotes: notes };
}
