import { CostPlan } from "../core/types.js";
import { loadConfig } from "../core/config.js";
import { planCost } from "../retrieval/costControl.js";
import { CollectionManifest } from "./collectionManifest.js";

export interface ReindexPlanStep {
  id: string;
  priority: "critical" | "high" | "medium" | "low";
  videoId?: string;
  action: "transcript_first" | "ocr_keyframes" | "vision_keyframes" | "memory_rebuild" | "collection_summary" | "dedupe_compaction";
  reason: string;
  estimatedCostClass: "cheap" | "moderate" | "expensive";
  safeDefault: boolean;
}

export interface ReindexPlanReport {
  collectionId: string;
  generatedAt: string;
  mode: "transcript_first" | "balanced" | "visual_repair" | "production_hardening";
  steps: ReindexPlanStep[];
  costGuardrails: string[];
  estimatedVisionCalls: number;
  estimatedOcrCalls: number;
  notes: string[];
}

export function buildReindexPlan(manifest: CollectionManifest, mode: ReindexPlanReport["mode"] = "balanced"): ReindexPlanReport {
  const steps: ReindexPlanStep[] = [];
  let estimatedVisionCalls = 0;
  let estimatedOcrCalls = 0;
  const defaultConfig = loadConfig();
  for (const video of manifest.videos) {
    const pseudoCost: CostPlan = planCost({ sourceType: "synthetic", uri: video.uri, durationSec: video.durationSec }, defaultConfig, { enableVision: false });
    estimatedOcrCalls += pseudoCost.estimatedOcrCalls;
    estimatedVisionCalls += pseudoCost.estimatedVisionCalls;
    if ((video.modalityCounts.transcript || 0) === 0) {
      steps.push({ id: `step-transcript-${video.videoId}`, priority: "critical", videoId: video.videoId, action: "transcript_first", reason: `${video.title} has no transcript evidence.`, estimatedCostClass: "cheap", safeDefault: true });
    }
    if ((video.modalityCounts.ocr || 0) === 0 && (mode === "balanced" || mode === "visual_repair" || mode === "production_hardening")) {
      steps.push({ id: `step-ocr-${video.videoId}`, priority: video.quality === "weak" ? "high" : "medium", videoId: video.videoId, action: "ocr_keyframes", reason: `${video.title} has no OCR evidence for screen text/UI/diagrams.`, estimatedCostClass: "moderate", safeDefault: true });
    }
    if ((video.modalityCounts.frame || 0) === 0 && (mode === "visual_repair" || mode === "production_hardening")) {
      steps.push({ id: `step-vision-${video.videoId}`, priority: "medium", videoId: video.videoId, action: "vision_keyframes", reason: `${video.title} has no frame/vision evidence.`, estimatedCostClass: "expensive", safeDefault: false });
    }
    if (video.memory === 0) {
      steps.push({ id: `step-memory-${video.videoId}`, priority: "high", videoId: video.videoId, action: "memory_rebuild", reason: `${video.title} lacks clip/scene/video memory.`, estimatedCostClass: "cheap", safeDefault: true });
    }
  }
  if (!manifest.memoryLevels.collection) steps.push({ id: "step-collection-summary", priority: "high", action: "collection_summary", reason: "Collection-level memory is missing.", estimatedCostClass: "cheap", safeDefault: true });
  if (manifest.coverage.evidence > 500) steps.push({ id: "step-dedupe-compaction", priority: "medium", action: "dedupe_compaction", reason: "Large collections should compact repeated intros/outros/ads and duplicate explanations.", estimatedCostClass: "cheap", safeDefault: true });

  const priority = { critical: 0, high: 1, medium: 2, low: 3 } as const;
  steps.sort((a, b) => priority[a.priority] - priority[b.priority]);
  return {
    collectionId: manifest.collectionId,
    generatedAt: new Date().toISOString(),
    mode,
    steps,
    costGuardrails: [
      "Run transcript_first before OCR/vision.",
      "Run OCR only on keyframes or screen-text-trigger windows.",
      "Run vision_keyframes only after a user question or audit proves visual evidence is needed.",
      "Stop reindexing when coverage score and answer audits pass release threshold."
    ],
    estimatedVisionCalls,
    estimatedOcrCalls,
    notes: [
      "This is a plan, not execution. FORGE must route execution through permission gate.",
      "Use dry run before mutating indexes.",
      "For production 100+ hour collections, replace JSON store with vector DB/storage adapter."
    ]
  };
}
