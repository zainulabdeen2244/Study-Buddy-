import { Evidence, TimelineSegment, VideoRecord } from "../core/types.js";
import { secondsToTimestamp } from "../core/utils.js";

export function buildTimeline(videos: VideoRecord[], evidence: Evidence[], segmentSeconds = 300): TimelineSegment[] {
  const segments: TimelineSegment[] = [];
  for (const video of videos) {
    for (let start=0; start<video.durationSec; start += segmentSeconds) {
      const end = Math.min(video.durationSec, start + segmentSeconds);
      const rows = evidence.filter(e => e.videoId === video.id && e.startSec < end && e.endSec >= start);
      if (!rows.length) continue;
      const modalities = [...new Set(rows.map(r=>r.modality))];
      const text = rows.slice(0, 5).map(r=>r.text).join(" ").slice(0, 520);
      segments.push({ videoId: video.id, startSec: start, endSec: end, title: `${video.title} ${secondsToTimestamp(start)}-${secondsToTimestamp(end)}`, summary: text, evidenceIds: rows.map(r=>r.id), modalities, density: Number((rows.length / Math.max(1, (end-start)/60)).toFixed(2)) });
    }
  }
  return segments;
}
