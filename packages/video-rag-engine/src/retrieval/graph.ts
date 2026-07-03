import { Evidence, QueryPlan } from "../core/types.js";
import { SearchHit } from "./search.js";

export interface EvidenceEdge { from: string; to: string; reason: "temporal" | "same-video" | "same-modality"; weight: number; }

export function buildEvidenceGraph(rows: Evidence[]): EvidenceEdge[] {
  const edges: EvidenceEdge[] = [];
  const sorted = [...rows].sort((a,b)=> a.videoId.localeCompare(b.videoId) || a.startSec-b.startSec);
  for (let i=0; i<sorted.length-1; i++) {
    const a = sorted[i], b = sorted[i+1];
    if (a.videoId === b.videoId && Math.abs(a.endSec - b.startSec) <= 90) edges.push({ from: a.id, to: b.id, reason: "temporal", weight: 0.12 });
    if (a.videoId === b.videoId) edges.push({ from: a.id, to: b.id, reason: "same-video", weight: 0.04 });
    if (a.modality === b.modality && a.videoId === b.videoId) edges.push({ from: a.id, to: b.id, reason: "same-modality", weight: 0.02 });
  }
  return edges;
}

export function graphExpandAndRerank(hits: SearchHit[], allEvidence: Evidence[], plan: QueryPlan, limit: number): SearchHit[] {
  const byId = new Map(allEvidence.map(e => [e.id, e]));
  const hitMap = new Map(hits.map(h => [h.evidence.id, { ...h }]));
  const edges = buildEvidenceGraph(allEvidence);
  for (const hit of hits.slice(0, Math.min(8, hits.length))) {
    for (const edge of edges.filter(e => e.from === hit.evidence.id || e.to === hit.evidence.id)) {
      const neighborId = edge.from === hit.evidence.id ? edge.to : edge.from;
      const ev = byId.get(neighborId);
      if (!ev) continue;
      const temporalBoost = plan.needsTemporalNeighborhood ? 0.14 : 0.04;
      const score = Math.min(1, hit.score * 0.82 + edge.weight + temporalBoost);
      const existing = hitMap.get(ev.id);
      if (!existing || existing.score < score) hitMap.set(ev.id, { evidence: ev, score, reasons: [`graph:${edge.reason}`] });
    }
  }
  for (const item of hitMap.values()) {
    item.score = Math.min(1, item.score * (plan.modalityWeights[item.evidence.modality] || 1));
  }
  return [...hitMap.values()].sort((a,b)=>b.score-a.score).slice(0, limit);
}
