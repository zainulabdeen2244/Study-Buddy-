import { Evidence, Modality, QueryPlan } from "../core/types.js";
import { secondsToTimestamp, tokenize } from "../core/utils.js";
import { SearchHit } from "./search.js";

export interface EvidenceBundleItem {
  evidenceId: string;
  videoId: string;
  modality: Modality;
  startSec: number;
  endSec: number;
  timestamp: string;
  score: number;
  excerpt: string;
  role: "primary" | "temporal_neighbor" | "modality_support";
  reasons: string[];
}

export interface EvidenceBundleRisk {
  kind: "missing_modality" | "thin_evidence" | "timestamp_uncertain" | "single_video_bias" | "low_term_support";
  severity: "low" | "medium" | "high";
  message: string;
}

export interface EvidenceBundle {
  question: string;
  queryPlan: QueryPlan;
  items: EvidenceBundleItem[];
  modalityCounts: Record<string, number>;
  videoCounts: Record<string, number>;
  temporalCoverage: { earliestSec?: number; latestSec?: number; spanSec: number };
  supportScore: number;
  risks: EvidenceBundleRisk[];
  suggestedNextAction: "answer" | "requery" | "ask_clarifying_question" | "ingest_more_evidence";
}

function toItem(hit: SearchHit, role: EvidenceBundleItem["role"]): EvidenceBundleItem {
  return {
    evidenceId: hit.evidence.id,
    videoId: hit.evidence.videoId,
    modality: hit.evidence.modality,
    startSec: hit.evidence.startSec,
    endSec: hit.evidence.endSec,
    timestamp: `${secondsToTimestamp(hit.evidence.startSec)}-${secondsToTimestamp(hit.evidence.endSec)}`,
    score: Number(hit.score.toFixed(4)),
    excerpt: hit.evidence.text.slice(0, 320),
    role,
    reasons: hit.reasons
  };
}

function countBy<T extends string>(values: T[]): Record<string, number> {
  return values.reduce<Record<string, number>>((acc, value) => {
    acc[value] = (acc[value] || 0) + 1;
    return acc;
  }, {});
}

function questionTermSupport(question: string, items: EvidenceBundleItem[]): number {
  const qTerms = tokenize(question).filter(t => t.length > 2);
  if (!qTerms.length) return 1;
  const text = items.map(i => i.excerpt.toLowerCase()).join(" ");
  const matched = new Set(qTerms.filter(t => text.includes(t)));
  return matched.size / Math.max(1, new Set(qTerms).size);
}

export function buildEvidenceBundle(question: string, plan: QueryPlan, hits: SearchHit[], allEvidence: Evidence[], limit = 12): EvidenceBundle {
  const byId = new Map(allEvidence.map(e => [e.id, e]));
  const items = new Map<string, EvidenceBundleItem>();
  const primaryHits = hits.slice(0, limit);
  for (const hit of primaryHits) items.set(hit.evidence.id, toItem(hit, "primary"));

  const windowSec = plan.temporalWindowSec ?? (plan.needsTemporalNeighborhood ? 120 : 45);
  for (const hit of primaryHits.slice(0, 5)) {
    const neighbors = allEvidence
      .filter(e => e.videoId === hit.evidence.videoId && e.id !== hit.evidence.id && Math.abs(e.startSec - hit.evidence.startSec) <= windowSec)
      .sort((a, b) => Math.abs(a.startSec - hit.evidence.startSec) - Math.abs(b.startSec - hit.evidence.startSec))
      .slice(0, 3);
    for (const ev of neighbors) {
      if (!byId.has(ev.id) || items.has(ev.id)) continue;
      items.set(ev.id, {
        evidenceId: ev.id,
        videoId: ev.videoId,
        modality: ev.modality,
        startSec: ev.startSec,
        endSec: ev.endSec,
        timestamp: `${secondsToTimestamp(ev.startSec)}-${secondsToTimestamp(ev.endSec)}`,
        score: Number(Math.max(0.01, (hit.score * 0.72)).toFixed(4)),
        excerpt: ev.text.slice(0, 320),
        role: "temporal_neighbor",
        reasons: [`temporal_neighbor±${windowSec}s`, `anchor=${hit.evidence.id}`]
      });
    }
  }

  const ordered = [...items.values()].sort((a, b) => b.score - a.score).slice(0, Math.max(limit, 12));
  const modalityCounts = countBy(ordered.map(i => i.modality));
  const videoCounts = countBy(ordered.map(i => i.videoId));
  const starts = ordered.map(i => i.startSec);
  const earliestSec = starts.length ? Math.min(...starts) : undefined;
  const latestSec = starts.length ? Math.max(...ordered.map(i => i.endSec)) : undefined;
  const termSupport = questionTermSupport(question, ordered);
  const modalityDiversity = Object.keys(modalityCounts).length / 4;
  const citationDensity = Math.min(1, ordered.filter(i => i.role === "primary").length / Math.max(3, plan.retrievalTopK / 4));
  const supportScore = Number(Math.min(1, termSupport * 0.45 + modalityDiversity * 0.25 + citationDensity * 0.3).toFixed(3));

  const risks: EvidenceBundleRisk[] = [];
  if (plan.needsTranscript && !modalityCounts.transcript) risks.push({ kind: "missing_modality", severity: "high", message: "Question likely needs spoken/transcript evidence, but the bundle has no transcript support." });
  if (plan.needsOcr && !modalityCounts.ocr) risks.push({ kind: "missing_modality", severity: "high", message: "Question likely needs OCR/screen text evidence, but the bundle has no OCR support." });
  if (plan.needsVisual && !modalityCounts.frame) risks.push({ kind: "missing_modality", severity: "medium", message: "Question likely needs visual evidence, but no frame evidence was retrieved." });
  if (ordered.length < 3) risks.push({ kind: "thin_evidence", severity: "high", message: "Fewer than three evidence items were retrieved." });
  if (typeof plan.timestampHintSec === "number" && ordered.length && !ordered.some(i => Math.abs(i.startSec - plan.timestampHintSec!) <= windowSec)) risks.push({ kind: "timestamp_uncertain", severity: "medium", message: "Timestamp hint did not retrieve a close temporal neighbor." });
  if (Object.keys(videoCounts).length === 1 && plan.intents.includes("cross_video")) risks.push({ kind: "single_video_bias", severity: "medium", message: "Cross-video question retrieved evidence from only one video." });
  if (termSupport < 0.35) risks.push({ kind: "low_term_support", severity: "medium", message: "Retrieved evidence has weak lexical support for the question terms." });

  const highRisks = risks.filter(r => r.severity === "high").length;
  const suggestedNextAction: EvidenceBundle["suggestedNextAction"] = highRisks ? "ingest_more_evidence" : supportScore < 0.42 ? "requery" : supportScore < 0.55 ? "ask_clarifying_question" : "answer";

  return {
    question,
    queryPlan: plan,
    items: ordered,
    modalityCounts,
    videoCounts,
    temporalCoverage: { earliestSec, latestSec, spanSec: earliestSec === undefined || latestSec === undefined ? 0 : latestSec - earliestSec },
    supportScore,
    risks,
    suggestedNextAction
  };
}
