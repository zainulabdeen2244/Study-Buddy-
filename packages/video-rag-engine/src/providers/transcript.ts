import { Evidence, VideoRecord } from "../core/types.js";
import { fingerprintText, id, nowIso } from "../core/utils.js";

export interface TranscriptProvider { extract(video: VideoRecord): Promise<Evidence[]>; }

export class SyntheticTranscriptProvider implements TranscriptProvider {
  async extract(video: VideoRecord): Promise<Evidence[]> {
    const duration = video.durationSec || 3600;
    const step = 60;
    const rows: Evidence[] = [];
    for (let start = 0; start < duration; start += step) {
      const end = Math.min(duration, start + step);
      const text = `Synthetic transcript for ${video.title} from ${start}s to ${end}s. This segment may include spoken explanation, visual demonstration, UI actions, and important concepts.`;
      rows.push({ id: id("ev"), collectionId: video.collectionId, videoId: video.id, modality: "transcript", startSec: start, endSec: end, text, metadata: { provider: "synthetic" }, fingerprint: fingerprintText(text), createdAt: nowIso() });
    }
    return rows;
  }
}

import { OpenAITranscriptionProvider, ExternalWhisperCliProvider, TranscriptionProvider } from "./transcription.js";
import fs from "node:fs";

export class ProductionTranscriptProvider implements TranscriptProvider {
  private openai = new OpenAITranscriptionProvider();
  private whisper = new ExternalWhisperCliProvider();
  private fallback = new SyntheticTranscriptProvider();
  async extract(video: VideoRecord): Promise<Evidence[]> {
    if (video.sourceType === "synthetic") return this.fallback.extract(video);
    const mediaPath = typeof video.metadata.mediaPath === "string" ? video.metadata.mediaPath : video.sourceType === "local" ? video.uri : undefined;
    if (!mediaPath || !fs.existsSync(mediaPath)) return [];
    const openaiStatus = await this.openai.status();
    if (openaiStatus.ok) return this.openai.transcribe(video);
    const whisperStatus = await this.whisper.status();
    if (whisperStatus.ok) return this.whisper.transcribe(video);
    return [];
  }
}
