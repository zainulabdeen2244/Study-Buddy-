import { LongVideoRagToolEngine } from "../core/engine.js";
import { EvaluationCase, EvaluationResult } from "../core/types.js";
import { normalizeText } from "../core/utils.js";

export async function evaluateCases(engine: LongVideoRagToolEngine, cases: EvaluationCase[]): Promise<{ results: EvaluationResult[]; passRate: number }> {
  const results: EvaluationResult[] = [];
  for (const c of cases) {
    const answer = await engine.ask({ collectionId: c.collectionId, question: c.question, minConfidence: c.minConfidence ?? 0.25 });
    const text = normalizeText(answer.answer);
    const hits = c.expectedKeywords.filter(k => text.includes(normalizeText(k))).length;
    const keywordRecall = c.expectedKeywords.length ? hits / c.expectedKeywords.length : 1;
    const hasCitations = answer.citations.length > 0;
    const passed = keywordRecall >= 0.5 && hasCitations && answer.confidence >= (c.minConfidence ?? 0.25) && answer.status !== "insufficient_evidence";
    results.push({ caseId: c.id, passed, confidence: answer.confidence, keywordRecall, hasCitations, answer: answer.answer });
  }
  return { results, passRate: results.filter(r=>r.passed).length / Math.max(1, results.length) };
}
