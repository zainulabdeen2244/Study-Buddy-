import fs from "node:fs";
import path from "node:path";
import { assertExitOk, commandExists, safeSpawn } from "../core/safeSpawn.js";
import { Evidence, VideoRecord } from "../core/types.js";
import { fingerprintText, id, nowIso } from "../core/utils.js";
import { FfmpegFrameExtractor } from "./media.js";

export class TesseractCliOcrProvider {
  name = "tesseract-cli-ocr";
  constructor(private binary = process.env.FORGE_TESSERACT_CLI || "tesseract", private frameExtractor = new FfmpegFrameExtractor()) {}
  async status() {
    const ok = await commandExists(this.binary);
    return { ok, detail: ok ? `${this.binary} binary found` : `${this.binary} binary missing. Install Tesseract or configure OCR API.` };
  }
  async extract(video: VideoRecord, strideSec: number): Promise<Evidence[]> {
    const mediaPath = typeof video.metadata.mediaPath === "string" ? video.metadata.mediaPath : video.sourceType === "local" ? video.uri : undefined;
    if (!mediaPath || !fs.existsSync(mediaPath)) return [];
    const outputDir = path.join(path.dirname(mediaPath), `.ocr-frames-${video.id}`);
    const frames = await this.frameExtractor.extractFiles(mediaPath, outputDir, Math.max(15, strideSec), video.durationSec || 0);
    const rows: Evidence[] = [];
    for (const frame of frames) {
      const base = frame.filePath.replace(/\.[^.]+$/, "");
      const result = await safeSpawn(this.binary, [frame.filePath, base, "--psm", "6"], { timeoutMs: 60_000, maxOutputBytes: 1_000_000 });
      if (result.exitCode !== 0) continue;
      const txtPath = `${base}.txt`;
      const text = fs.existsSync(txtPath) ? fs.readFileSync(txtPath, "utf8").replace(/\s+/g, " ").trim() : "";
      if (text.length < 3) continue;
      rows.push({ id: id("ev"), collectionId: video.collectionId, videoId: video.id, modality: "ocr", startSec: frame.timestampSec, endSec: Math.min(frame.timestampSec + 5, video.durationSec), text, confidence: 0.72, metadata: { provider: this.name, filePath: frame.filePath, realProvider: true }, fingerprint: fingerprintText(text), createdAt: nowIso() });
    }
    return rows;
  }
}
