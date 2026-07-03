import { Evidence, MemoryNode, Modality, VideoRecord } from "../core/types.js";

export interface CoverageReport {
  collectionId: string;
  videos: number;
  totalHours: number;
  evidence: number;
  memory: number;
  modalityCounts: Record<string, number>;
  modalityCoverage: Record<Modality, "missing" | "weak" | "ok">;
  score: number;
  gaps: string[];
  nextActions: string[];
}

const modalities: Modality[] = ["transcript", "ocr", "frame", "summary", "scene", "video", "collection"];

export function buildCoverageReport(collectionId: string, videos: VideoRecord[], evidence: Evidence[], memory: MemoryNode[]): CoverageReport {
  const totalHours = Number((videos.reduce((sum, v) => sum + v.durationSec, 0) / 3600).toFixed(2));
  const modalityCounts = evidence.reduce<Record<string, number>>((acc, ev) => { acc[ev.modality] = (acc[ev.modality] || 0) + 1; return acc; }, {});
  const modalityCoverage = Object.fromEntries(modalities.map((m) => {
    const count = modalityCounts[m] || 0;
    const state = count === 0 ? "missing" : count < Math.max(2, videos.length) ? "weak" : "ok";
    return [m, state];
  })) as Record<Modality, "missing" | "weak" | "ok">;
  const okCount = Object.values(modalityCoverage).filter(v => v === "ok").length;
  const weakCount = Object.values(modalityCoverage).filter(v => v === "weak").length;
  const memoryScore = memory.length ? 0.15 : 0;
  const videoScore = videos.length ? 0.1 : 0;
  const score = Number(Math.min(1, okCount / modalities.length * 0.65 + weakCount / modalities.length * 0.1 + memoryScore + videoScore).toFixed(3));
  const gaps: string[] = [];
  if (!videos.length) gaps.push("No videos indexed.");
  for (const [m, state] of Object.entries(modalityCoverage)) if (state !== "ok") gaps.push(`${m} evidence is ${state}.`);
  if (totalHours >= 100 && modalityCoverage.transcript !== "ok") gaps.push("100+ hour collection needs strong transcript/ASR coverage first.");
  if (!memory.length) gaps.push("Hierarchical memory has not been created.");
  const nextActions = gaps.map(g => {
    if (g.includes("transcript")) return "Enable transcript/ASR provider and reindex transcript evidence.";
    if (g.includes("ocr")) return "Enable OCR only on selected keyframes or OCR-trigger frames.";
    if (g.includes("frame")) return "Enable keyframe extraction with scene-change sampling, not every frame.";
    if (g.includes("memory")) return "Run memory build for clip, scene, video, and collection levels.";
    if (g.includes("No videos")) return "Ingest at least one source using video.plan before video.ingest.";
    return `Review gap: ${g}`;
  });
  return { collectionId, videos: videos.length, totalHours, evidence: evidence.length, memory: memory.length, modalityCounts, modalityCoverage, score, gaps, nextActions: [...new Set(nextActions)] };
}
