import { Evidence, VideoRecord } from "../core/types.js";
import { fingerprintText, id, nowIso } from "../core/utils.js";

export interface OcrProvider { extract(video: VideoRecord, strideSec: number): Promise<Evidence[]>; }

export class PlaceholderOcrProvider implements OcrProvider {
  async extract(video: VideoRecord, strideSec: number): Promise<Evidence[]> {
    const rows: Evidence[] = [];
    for (let start = 0; start < (video.durationSec || 0); start += Math.max(15, strideSec)) {
      const text = `OCR candidate text from ${video.title} near ${start}s. Replace PlaceholderOcrProvider with Tesseract.js, PaddleOCR service, or cloud OCR in production.`;
      rows.push({ id: id("ev"), collectionId: video.collectionId, videoId: video.id, modality: "ocr", startSec: start, endSec: Math.min(start + 5, video.durationSec), text, metadata: { provider: "placeholder-ocr" }, fingerprint: fingerprintText(text), createdAt: nowIso() });
    }
    return rows;
  }
}

import { TesseractCliOcrProvider } from "./ocrReal.js";
import fs from "node:fs";

export class ProductionOcrProvider implements OcrProvider {
  private tesseract = new TesseractCliOcrProvider();
  private fallback = new PlaceholderOcrProvider();
  async extract(video: VideoRecord, strideSec: number): Promise<Evidence[]> {
    if (video.sourceType === "synthetic") return this.fallback.extract(video, strideSec);
    const mediaPath = typeof video.metadata.mediaPath === "string" ? video.metadata.mediaPath : video.sourceType === "local" ? video.uri : undefined;
    if (!mediaPath || !fs.existsSync(mediaPath)) return [];
    const status = await this.tesseract.status();
    if (!status.ok) return [];
    return this.tesseract.extract(video, strideSec);
  }
}
