import { Evidence, VideoRecord } from "../core/types.js";
import { fingerprintText, id, nowIso } from "../core/utils.js";

export interface FrameProvider { extract(video: VideoRecord, strideSec: number, enableVision: boolean): Promise<Evidence[]>; }

export class KeyframeProvider implements FrameProvider {
  async extract(video: VideoRecord, strideSec: number, enableVision: boolean): Promise<Evidence[]> {
    const rows: Evidence[] = [];
    for (let start = 0; start < (video.durationSec || 0); start += Math.max(10, strideSec)) {
      const text = enableVision
        ? `Vision description placeholder for ${video.title} near ${start}s. In production connect frame extraction + vision captioning here.`
        : `Keyframe selected for ${video.title} near ${start}s. Vision disabled; use as temporal anchor.`;
      rows.push({ id: id("ev"), collectionId: video.collectionId, videoId: video.id, modality: "frame", startSec: start, endSec: Math.min(start + 3, video.durationSec), text, metadata: { provider: "keyframe-provider", visionEnabled: enableVision }, fingerprint: fingerprintText(text), createdAt: nowIso() });
    }
    return rows;
  }
}

import { FfmpegFrameExtractor } from "./media.js";
import { OpenAIVisionCaptionProvider } from "./vision.js";
import fs from "node:fs";

export class ProductionFrameProvider implements FrameProvider {
  private extractor = new FfmpegFrameExtractor();
  private vision = new OpenAIVisionCaptionProvider();
  private fallback = new KeyframeProvider();
  async extract(video: VideoRecord, strideSec: number, enableVision: boolean): Promise<Evidence[]> {
    if (video.sourceType === "synthetic") return this.fallback.extract(video, strideSec, enableVision);
    const mediaPath = typeof video.metadata.mediaPath === "string" ? video.metadata.mediaPath : video.sourceType === "local" ? video.uri : undefined;
    if (!mediaPath || !fs.existsSync(mediaPath)) return [];
    const ffmpegStatus = await this.extractor.status();
    if (!ffmpegStatus.ok) return [];
    const visionStatus = enableVision ? await this.vision.status() : { ok: false, detail: "vision disabled" };
    return this.extractor.extractEvidence(video, strideSec, enableVision && visionStatus.ok, visionStatus.ok ? this.vision : undefined);
  }
}
