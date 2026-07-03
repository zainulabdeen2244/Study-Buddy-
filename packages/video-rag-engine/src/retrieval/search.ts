import { Evidence, VectorRow } from "../core/types.js";
import { cosine, tokenize } from "../core/utils.js";

export interface SearchHit { evidence: Evidence; score: number; reasons: string[]; }

export function hybridSearch(question: string, queryVector: number[], evidence: Evidence[], vectors: VectorRow[], topK: number, timestampHintSec?: number): SearchHit[] {
  const vecByEvidence = new Map(vectors.map(v => [v.evidenceId, v.vector]));
  const qTokens = new Set(tokenize(question));
  const hits: SearchHit[] = evidence.map(ev => {
    const evTokens = new Set(tokenize(ev.text));
    const overlap = [...qTokens].filter(t => evTokens.has(t)).length / Math.max(1, qTokens.size);
    const semantic = vecByEvidence.has(ev.id) ? cosine(queryVector, vecByEvidence.get(ev.id)!) : 0;
    const modalityBoost = ev.modality === "transcript" ? 0.08 : ev.modality === "ocr" ? 0.07 : ev.modality === "frame" ? 0.05 : 0.03;
    const timeBoost = typeof timestampHintSec === "number" ? Math.max(0, 0.15 - Math.min(Math.abs(ev.startSec - timestampHintSec) / 600, 0.15)) : 0;
    const score = semantic * 0.55 + overlap * 0.35 + modalityBoost + timeBoost;
    const reasons = [`semantic=${semantic.toFixed(3)}`, `keyword=${overlap.toFixed(3)}`, `modality=${ev.modality}`, `timeBoost=${timeBoost.toFixed(3)}`];
    return { evidence: ev, score, reasons };
  });
  return hits.sort((a,b)=>b.score-a.score).slice(0, topK);
}
