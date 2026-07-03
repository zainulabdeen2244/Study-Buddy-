import { Evidence, MemoryNode, VideoRecord } from "../core/types.js";
import { id, nowIso } from "../core/utils.js";

export function buildHierarchicalMemory(video: VideoRecord, evidence: Evidence[], segmentSeconds = 60): MemoryNode[] {
  const nodes: MemoryNode[] = [];
  for (let start = 0; start < video.durationSec; start += segmentSeconds) {
    const end = Math.min(video.durationSec, start + segmentSeconds);
    const ev = evidence.filter(e => e.videoId === video.id && e.startSec < end && e.endSec >= start).slice(0, 12);
    if (!ev.length) continue;
    nodes.push({ id: id("mem"), collectionId: video.collectionId, videoId: video.id, level: "clip", startSec: start, endSec: end, text: summarizeTexts(ev.map(e => e.text), `Clip ${start}-${end}s`), evidenceIds: ev.map(e=>e.id), createdAt: nowIso() });
  }
  const sceneSize = segmentSeconds * 5;
  for (let start = 0; start < video.durationSec; start += sceneSize) {
    const end = Math.min(video.durationSec, start + sceneSize);
    const clipNodes = nodes.filter(n => n.level === "clip" && n.startSec! < end && n.endSec! >= start);
    if (!clipNodes.length) continue;
    nodes.push({ id: id("mem"), collectionId: video.collectionId, videoId: video.id, level: "scene", startSec: start, endSec: end, text: summarizeTexts(clipNodes.map(n => n.text), `Scene ${start}-${end}s`), evidenceIds: clipNodes.flatMap(n=>n.evidenceIds), createdAt: nowIso() });
  }
  const sceneNodes = nodes.filter(n => n.level === "scene");
  if (sceneNodes.length) nodes.push({ id: id("mem"), collectionId: video.collectionId, videoId: video.id, level: "video", text: summarizeTexts(sceneNodes.map(n => n.text), `Video summary: ${video.title}`), evidenceIds: sceneNodes.flatMap(n=>n.evidenceIds), createdAt: nowIso() });
  return nodes;
}

export function buildCollectionMemory(collectionId: string, videos: VideoRecord[], existing: MemoryNode[]): MemoryNode {
  const videoNodes = existing.filter(n => n.level === "video");
  return { id: id("mem"), collectionId, level: "collection", text: summarizeTexts(videoNodes.map(n => n.text), `Collection summary across ${videos.length} videos`), evidenceIds: videoNodes.flatMap(n=>n.evidenceIds).slice(0, 500), createdAt: nowIso() };
}

function summarizeTexts(texts: string[], prefix: string): string {
  const joined = texts.join(" ").replace(/\s+/g, " ").slice(0, 1200);
  return `${prefix}: ${joined}`;
}
