import fs from "node:fs";
import path from "node:path";
import { assertExitOk, commandExists, safeSpawn } from "../core/safeSpawn.js";
import { Evidence, VideoRecord } from "../core/types.js";
import { fingerprintText, id, nowIso } from "../core/utils.js";
import { VisionCaptionProvider } from "./vision.js";

export interface MediaProbeResult {
  durationSec: number;
  width?: number;
  height?: number;
  hasAudio: boolean;
  hasVideo: boolean;
  raw: Record<string, unknown>;
}

export class FfmpegMediaProbe {
  name = "ffprobe";
  async status() {
    const ok = await commandExists("ffprobe");
    return { ok, detail: ok ? "ffprobe binary found" : "ffprobe binary missing. Install FFmpeg to read real video metadata." };
  }
  async probe(filePath: string): Promise<MediaProbeResult> {
    const result = assertExitOk(await safeSpawn("ffprobe", ["-v", "error", "-print_format", "json", "-show_format", "-show_streams", filePath], { timeoutMs: 60_000 }), "ffprobe");
    const data = JSON.parse(result.stdout || "{}") as any;
    const durationSec = Number(data.format?.duration || 0);
    const streams = Array.isArray(data.streams) ? data.streams : [];
    const video = streams.find((s: any) => s.codec_type === "video");
    return {
      durationSec: Number.isFinite(durationSec) && durationSec > 0 ? durationSec : 0,
      width: video?.width,
      height: video?.height,
      hasAudio: streams.some((s: any) => s.codec_type === "audio"),
      hasVideo: streams.some((s: any) => s.codec_type === "video"),
      raw: data
    };
  }
}

export interface ExtractedFrame {
  filePath: string;
  timestampSec: number;
}

export class FfmpegFrameExtractor {
  name = "ffmpeg-frame-extractor";
  async status() {
    const ok = await commandExists("ffmpeg");
    return { ok, detail: ok ? "ffmpeg binary found" : "ffmpeg binary missing. Install FFmpeg to enable real frame extraction." };
  }
  async extractFiles(mediaPath: string, outputDir: string, strideSec: number, durationSec: number): Promise<ExtractedFrame[]> {
    fs.mkdirSync(outputDir, { recursive: true });
    const fps = `1/${Math.max(1, Math.round(strideSec))}`;
    const pattern = path.join(outputDir, "frame_%06d.jpg");
    assertExitOk(await safeSpawn("ffmpeg", ["-hide_banner", "-loglevel", "error", "-y", "-i", mediaPath, "-vf", `fps=${fps},scale='min(1280,iw)':-2`, "-q:v", "3", pattern], { timeoutMs: 30 * 60_000, maxOutputBytes: 2_000_000 }), "ffmpeg frame extraction");
    const files = fs.readdirSync(outputDir).filter((f: string) => /^frame_\d+\.jpg$/.test(f)).sort();
    return files.map((file: string, index: number) => ({ filePath: path.join(outputDir, file), timestampSec: Math.min(index * strideSec, durationSec) }));
  }
  async extractEvidence(video: VideoRecord, strideSec: number, enableVision: boolean, vision?: VisionCaptionProvider): Promise<Evidence[]> {
    const mediaPath = typeof video.metadata.mediaPath === "string" ? video.metadata.mediaPath : video.sourceType === "local" ? video.uri : undefined;
    if (!mediaPath || !fs.existsSync(mediaPath)) return [];
    const frameDir = path.join(path.dirname(mediaPath), `.frames-${video.id}`);
    const frames = await this.extractFiles(mediaPath, frameDir, Math.max(10, strideSec), video.durationSec || 0);
    const rows: Evidence[] = [];
    for (const frame of frames) {
      let text = `Keyframe extracted from ${video.title} at ${Math.round(frame.timestampSec)}s.`;
      let provider = this.name;
      let confidence = 0.62;
      if (enableVision && vision) {
        const caption = await vision.caption(frame.filePath, { title: video.title, timestampSec: frame.timestampSec });
        text = caption.text;
        provider = caption.provider;
        confidence = caption.confidence;
      }
      rows.push({ id: id("ev"), collectionId: video.collectionId, videoId: video.id, modality: "frame", startSec: frame.timestampSec, endSec: Math.min(frame.timestampSec + 3, video.durationSec), text, confidence, metadata: { provider, filePath: frame.filePath, realProvider: true }, fingerprint: fingerprintText(text), createdAt: nowIso() });
    }
    return rows;
  }
}
