import { MemoryNode, VideoRecord } from "../core/types.js";

export interface MemoryMapReport {
  collectionId: string;
  generatedAt: string;
  levels: Record<string, number>;
  videos: Array<{ videoId: string; title: string; clipNodes: number; sceneNodes: number; hasVideoSummary: boolean; largestGapSec: number }>;
  gaps: string[];
  recommendations: string[];
}

export function buildMemoryMap(collectionId: string, videos: VideoRecord[], memory: MemoryNode[]): MemoryMapReport {
  const levels = memory.reduce<Record<string, number>>((acc, node) => { acc[node.level] = (acc[node.level] || 0) + 1; return acc; }, {});
  const rows = videos.map(video => {
    const nodes = memory.filter(m => m.videoId === video.id);
    const clips = nodes.filter(n => n.level === "clip" && typeof n.startSec === "number").sort((a, b) => (a.startSec || 0) - (b.startSec || 0));
    let largestGapSec = clips.length ? Math.max(0, clips[0].startSec || 0) : video.durationSec;
    for (let i = 0; i < clips.length - 1; i++) largestGapSec = Math.max(largestGapSec, Math.max(0, (clips[i + 1].startSec || 0) - (clips[i].endSec || 0)));
    if (clips.length) largestGapSec = Math.max(largestGapSec, Math.max(0, video.durationSec - (clips[clips.length - 1].endSec || 0)));
    return { videoId: video.id, title: video.title, clipNodes: clips.length, sceneNodes: nodes.filter(n => n.level === "scene").length, hasVideoSummary: nodes.some(n => n.level === "video"), largestGapSec };
  });
  const gaps: string[] = [];
  if (!levels.collection) gaps.push("Collection-level memory is missing.");
  for (const row of rows) {
    if (!row.clipNodes) gaps.push(`${row.title} has no clip memory.`);
    if (!row.sceneNodes) gaps.push(`${row.title} has no scene memory.`);
    if (!row.hasVideoSummary) gaps.push(`${row.title} has no video summary memory.`);
    if (row.largestGapSec > 300) gaps.push(`${row.title} has a memory gap larger than five minutes.`);
  }
  const recommendations = [...new Set(gaps.map(g => g.includes("Collection") ? "Build collection memory after video summaries." : g.includes("gap") ? "Rebuild clip memory with smaller segment size or repair missing evidence windows." : "Run hierarchical memory rebuild for affected videos."))];
  return { collectionId, generatedAt: new Date().toISOString(), levels, videos: rows, gaps, recommendations };
}
