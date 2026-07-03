import { Evidence, MemoryNode, Modality, VideoRecord } from "../core/types.js";
import { secondsToTimestamp } from "../core/utils.js";
import { CoverageReport, buildCoverageReport } from "./coverage.js";

export interface VideoCoverageSummary {
  videoId: string;
  title: string;
  uri: string;
  durationSec: number;
  durationLabel: string;
  status: VideoRecord["status"];
  evidence: number;
  memory: number;
  modalityCounts: Record<string, number>;
  missingModalities: Modality[];
  quality: "empty" | "weak" | "usable" | "strong";
}

export interface ReindexRecommendation {
  priority: "critical" | "high" | "medium" | "low";
  videoId?: string;
  action: string;
  reason: string;
}

export interface CollectionManifest {
  collectionId: string;
  generatedAt: string;
  videos: VideoCoverageSummary[];
  coverage: CoverageReport;
  sourceMix: Record<string, number>;
  modalityTotals: Record<string, number>;
  memoryLevels: Record<string, number>;
  readiness: "empty" | "research_only" | "usable" | "production_candidate";
  reindexRecommendations: ReindexRecommendation[];
}

const requiredModalities: Modality[] = ["transcript", "summary", "scene", "video", "collection"];
const optionalButValuable: Modality[] = ["ocr", "frame"];

function countEvidence(rows: Evidence[]): Record<string, number> {
  return rows.reduce<Record<string, number>>((acc, row) => {
    acc[row.modality] = (acc[row.modality] || 0) + 1;
    return acc;
  }, {});
}

function qualityFor(modalityCounts: Record<string, number>, evidenceCount: number, memoryCount: number): VideoCoverageSummary["quality"] {
  if (!evidenceCount) return "empty";
  const transcriptOk = (modalityCounts.transcript || 0) >= 2;
  const summaryOk = (modalityCounts.summary || 0) >= 1 || memoryCount >= 1;
  const visualOk = (modalityCounts.frame || 0) >= 1 || (modalityCounts.ocr || 0) >= 1;
  if (transcriptOk && summaryOk && visualOk && memoryCount >= 2) return "strong";
  if (transcriptOk && summaryOk) return "usable";
  return "weak";
}

export function buildCollectionManifest(collectionId: string, videos: VideoRecord[], evidence: Evidence[], memory: MemoryNode[]): CollectionManifest {
  const evidenceByVideo = new Map<string, Evidence[]>();
  const memoryByVideo = new Map<string, MemoryNode[]>();
  for (const row of evidence) evidenceByVideo.set(row.videoId, [...(evidenceByVideo.get(row.videoId) || []), row]);
  for (const node of memory) if (node.videoId) memoryByVideo.set(node.videoId, [...(memoryByVideo.get(node.videoId) || []), node]);

  const videoSummaries = videos.map((video) => {
    const rows = evidenceByVideo.get(video.id) || [];
    const nodes = memoryByVideo.get(video.id) || [];
    const modalityCounts = countEvidence(rows);
    const missingModalities = [...requiredModalities, ...optionalButValuable].filter((m) => (modalityCounts[m] || 0) === 0 && !(m === "collection" && memory.some(n => n.level === "collection")));
    return {
      videoId: video.id,
      title: video.title,
      uri: video.uri,
      durationSec: video.durationSec,
      durationLabel: secondsToTimestamp(video.durationSec),
      status: video.status,
      evidence: rows.length,
      memory: nodes.length,
      modalityCounts,
      missingModalities,
      quality: qualityFor(modalityCounts, rows.length, nodes.length)
    } satisfies VideoCoverageSummary;
  });

  const sourceMix = videos.reduce<Record<string, number>>((acc, video) => {
    acc[video.sourceType] = (acc[video.sourceType] || 0) + 1;
    return acc;
  }, {});
  const modalityTotals = countEvidence(evidence);
  const memoryLevels = memory.reduce<Record<string, number>>((acc, node) => {
    acc[node.level] = (acc[node.level] || 0) + 1;
    return acc;
  }, {});
  const coverage = buildCoverageReport(collectionId, videos, evidence, memory);
  const strongVideos = videoSummaries.filter(v => v.quality === "strong").length;
  const usableVideos = videoSummaries.filter(v => v.quality === "strong" || v.quality === "usable").length;
  const readiness: CollectionManifest["readiness"] = !videos.length ? "empty" : coverage.score >= 0.82 && strongVideos >= Math.max(1, Math.ceil(videos.length * 0.6)) ? "production_candidate" : usableVideos >= Math.max(1, Math.ceil(videos.length * 0.5)) ? "usable" : "research_only";

  const reindexRecommendations: ReindexRecommendation[] = [];
  if (!videos.length) reindexRecommendations.push({ priority: "critical", action: "ingest", reason: "No videos exist in this collection." });
  for (const summary of videoSummaries) {
    if (summary.quality === "empty") reindexRecommendations.push({ priority: "critical", videoId: summary.videoId, action: "reingest_transcript_first", reason: `${summary.title} has no evidence rows.` });
    if ((summary.modalityCounts.transcript || 0) === 0) reindexRecommendations.push({ priority: "high", videoId: summary.videoId, action: "enable_asr_or_transcript_provider", reason: `${summary.title} has no transcript evidence.` });
    if ((summary.modalityCounts.ocr || 0) === 0 && (summary.modalityCounts.frame || 0) === 0) reindexRecommendations.push({ priority: "medium", videoId: summary.videoId, action: "sample_keyframes_for_visual_evidence", reason: `${summary.title} has no visual evidence.` });
    if (summary.memory === 0) reindexRecommendations.push({ priority: "medium", videoId: summary.videoId, action: "build_hierarchical_memory", reason: `${summary.title} has no clip/scene/video memory nodes.` });
  }
  if (!memoryLevels.collection) reindexRecommendations.push({ priority: "high", action: "build_collection_memory", reason: "Collection-level memory is missing." });

  return { collectionId, generatedAt: new Date().toISOString(), videos: videoSummaries, coverage, sourceMix, modalityTotals, memoryLevels, readiness, reindexRecommendations };
}
