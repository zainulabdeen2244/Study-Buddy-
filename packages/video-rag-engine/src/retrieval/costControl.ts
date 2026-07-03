import { CostPlan, IngestOptions, VideoSource } from "../core/types.js";
import { ToolConfig } from "../core/config.js";

export function planCost(source: VideoSource, config: ToolConfig, options: IngestOptions): CostPlan {
  const duration = source.durationSec || 3600;
  const hours = Math.max(duration / 3600, 1 / 60);
  const maxFrames = options.maxFramesPerHour ?? config.defaultMaxFramesPerHour;
  const maxOcr = options.maxOcrFramesPerHour ?? config.defaultMaxOcrFramesPerHour;
  const frameStrideSec = Math.max(1, Math.ceil(3600 / Math.max(1, maxFrames)));
  const ocrStrideSec = Math.max(1, Math.ceil(3600 / Math.max(1, maxOcr)));
  const warnings: string[] = [];
  if (duration >= 360000) warnings.push("100+ hour collection detected: use queue workers and resumable ingestion.");
  if ((options.enableVision ?? false) && maxFrames > 300) warnings.push("High vision-frame budget may become expensive.");
  return { estimatedHours: hours, frameStrideSec, ocrStrideSec, estimatedVisionCalls: Math.ceil(duration / frameStrideSec), estimatedOcrCalls: Math.ceil(duration / ocrStrideSec), transcriptFirst: true, warnings };
}
