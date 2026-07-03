import { Modality, QueryIntent, QueryPlan } from "../core/types.js";

const modalityBase: Record<Modality, number> = { transcript: 1, ocr: 0.9, frame: 0.9, summary: 0.75, scene: 0.7, video: 0.55, collection: 0.45 };

export function extractTimestampHint(question: string): number | undefined {
  const mmss = question.match(/\b(\d{1,2}):(\d{2})(?::(\d{2}))?\b/);
  if (mmss) {
    if (mmss[3]) return Number(mmss[1]) * 3600 + Number(mmss[2]) * 60 + Number(mmss[3]);
    return Number(mmss[1]) * 60 + Number(mmss[2]);
  }
  const minute = question.match(/\b(?:at|around)\s+(\d+(?:\.\d+)?)\s*(?:min|minute|minutes)\b/i);
  if (minute) return Math.round(Number(minute[1]) * 60);
  return undefined;
}

export function planQuery(question: string): QueryPlan {
  const q = question.toLowerCase();
  const intents: QueryIntent[] = [];
  if (/say|said|speak|speaker|audio|voice|explain|lecture|transcript/.test(q)) intents.push("spoken");
  if (/show|screen|look|image|diagram|visual|button|click|scene|object/.test(q)) intents.push("visual");
  if (/text|title|subtitle|caption|written|code|ocr/.test(q)) intents.push("ocr");
  if (extractTimestampHint(question) !== undefined || /at|around|before|after|between/.test(q)) intents.push("timestamp");
  if (/summarize|summary|overview|whole|all videos|collection/.test(q)) intents.push(q.includes("collection") || q.includes("all videos") ? "cross_video" : "summary");
  if (!intents.length) intents.push("unknown");
  const weights = { ...modalityBase };
  if (intents.includes("spoken")) weights.transcript += 0.45;
  if (intents.includes("ocr")) weights.ocr += 0.5;
  if (intents.includes("visual")) weights.frame += 0.45;
  if (intents.includes("summary") || intents.includes("cross_video")) { weights.summary += 0.35; weights.scene += 0.25; weights.video += 0.25; weights.collection += 0.35; }
  const complexity: QueryPlan["complexity"] = intents.includes("cross_video") || /compare|across|all videos|collection|timeline|relationship|why|how/.test(q) ? "complex" : intents.includes("timestamp") || intents.length >= 2 ? "moderate" : "simple";
  const temporalWindowSec = complexity === "complex" ? 240 : intents.includes("timestamp") ? 120 : 60;
  const searchPasses: QueryPlan["searchPasses"] = ["semantic", "keyword"];
  if (intents.includes("timestamp")) searchPasses.push("temporal");
  if (intents.includes("visual") || intents.includes("ocr") || intents.includes("spoken")) searchPasses.push("modality");
  if (intents.includes("summary") || intents.includes("cross_video")) searchPasses.push("memory");
  return {
    question,
    intents,
    complexity,
    temporalWindowSec,
    searchPasses,
    needsTranscript: intents.includes("spoken") || intents.includes("summary") || intents.includes("cross_video"),
    needsVisual: intents.includes("visual"),
    needsOcr: intents.includes("ocr"),
    needsTemporalNeighborhood: intents.includes("timestamp"),
    retrievalTopK: intents.includes("cross_video") ? 24 : intents.includes("summary") ? 18 : 12,
    modalityWeights: weights,
    timestampHintSec: extractTimestampHint(question),
    verifierThreshold: intents.includes("unknown") ? 0.35 : 0.45
  };
}
