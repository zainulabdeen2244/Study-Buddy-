import { Answer, AskOptions, Modality } from "../core/types.js";
import { tokenize } from "../core/utils.js";

export interface AnswerSupportAudit {
  question: string;
  status: Answer["status"];
  confidence: number;
  citationCount: number;
  modalityCoverage: Record<Modality, number>;
  matchedQuestionTerms: string[];
  missingQuestionTerms: string[];
  weaknesses: string[];
  recommendation: "accept" | "ask_followup" | "requery" | "ingest_more_evidence";
}

const stop = new Set(["the", "a", "an", "and", "or", "to", "of", "in", "on", "for", "is", "are", "was", "were", "what", "which", "how", "when", "where", "why", "does", "do", "did", "this", "that", "video", "videos", "collection"]);

function importantTerms(question: string): string[] {
  return [...new Set(tokenize(question).filter(t => t.length > 2 && !stop.has(t)))].slice(0, 18);
}

export function buildAnswerSupportAudit(options: AskOptions, answer: Answer): AnswerSupportAudit {
  const terms = importantTerms(options.question);
  const text = answer.citations.map(c => c.excerpt.toLowerCase()).join(" ");
  const matchedQuestionTerms = terms.filter(t => text.includes(t));
  const missingQuestionTerms = terms.filter(t => !text.includes(t));
  const modalityCoverage = answer.citations.reduce<Record<Modality, number>>((acc, c) => {
    acc[c.modality] = (acc[c.modality] || 0) + 1;
    return acc;
  }, { transcript: 0, ocr: 0, frame: 0, summary: 0, scene: 0, video: 0, collection: 0 });

  const weaknesses: string[] = [];
  if (!answer.citations.length) weaknesses.push("No citations support the answer.");
  if (answer.status !== "supported") weaknesses.push(`Answer status is ${answer.status}.`);
  if (answer.confidence < (options.minConfidence ?? 0.45)) weaknesses.push(`Confidence ${answer.confidence} is below desired threshold.`);
  if (matchedQuestionTerms.length < Math.min(2, terms.length)) weaknesses.push("Few important question terms appear inside cited evidence.");
  if (!modalityCoverage.transcript) weaknesses.push("No transcript support is present.");
  if ((modalityCoverage.ocr || 0) + (modalityCoverage.frame || 0) === 0) weaknesses.push("No OCR/frame visual support is present.");

  const recommendation: AnswerSupportAudit["recommendation"] =
    !answer.citations.length ? "ingest_more_evidence" :
    answer.status === "insufficient_evidence" ? "requery" :
    weaknesses.length >= 3 ? "ask_followup" : "accept";

  return {
    question: options.question,
    status: answer.status,
    confidence: answer.confidence,
    citationCount: answer.citations.length,
    modalityCoverage,
    matchedQuestionTerms,
    missingQuestionTerms,
    weaknesses,
    recommendation
  };
}
