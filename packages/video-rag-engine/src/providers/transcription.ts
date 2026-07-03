import fs from "node:fs";
import path from "node:path";
import { assertExitOk, commandExists, safeSpawn } from "../core/safeSpawn.js";
import { Evidence, VideoRecord } from "../core/types.js";
import { fingerprintText, id, nowIso } from "../core/utils.js";

export interface TranscriptionProvider {
  name: string;
  status(): Promise<{ ok: boolean; detail: string }>;
  transcribe(video: VideoRecord): Promise<Evidence[]>;
}

function mediaPathFor(video: VideoRecord): string | undefined {
  return typeof video.metadata.mediaPath === "string" ? video.metadata.mediaPath : video.sourceType === "local" ? video.uri : undefined;
}

function chunkTextToEvidence(video: VideoRecord, text: string, provider: string, confidence = 0.82): Evidence[] {
  const clean = text.replace(/\s+/g, " ").trim();
  if (!clean) return [];
  const duration = Math.max(1, video.durationSec || 60);
  const words = clean.split(" ");
  const targetWords = 130;
  const chunks: Evidence[] = [];
  for (let i = 0; i < words.length; i += targetWords) {
    const part = words.slice(i, i + targetWords).join(" ");
    const startSec = Math.floor((i / Math.max(1, words.length)) * duration);
    const endSec = Math.min(duration, Math.floor(((i + targetWords) / Math.max(1, words.length)) * duration));
    chunks.push({ id: id("ev"), collectionId: video.collectionId, videoId: video.id, modality: "transcript", startSec, endSec: Math.max(endSec, startSec + 5), text: part, confidence, metadata: { provider, realProvider: true }, fingerprint: fingerprintText(part), createdAt: nowIso() });
  }
  return chunks;
}

export class OpenAITranscriptionProvider implements TranscriptionProvider {
  name = "openai-transcription";
  constructor(private apiKey = process.env.OPENAI_API_KEY, private model = process.env.FORGE_VIDEO_RAG_TRANSCRIPTION_MODEL || "gpt-4o-mini-transcribe") {}
  async status() { return { ok: !!this.apiKey, detail: this.apiKey ? `OPENAI_API_KEY configured for ${this.model}` : "OPENAI_API_KEY missing for OpenAI transcription" }; }
  async transcribe(video: VideoRecord): Promise<Evidence[]> {
    if (!this.apiKey) throw new Error("OPENAI_API_KEY missing for OpenAI transcription provider");
    const mediaPath = mediaPathFor(video);
    if (!mediaPath || !fs.existsSync(mediaPath)) throw new Error("No media file available for transcription");
    const bytes = fs.readFileSync(mediaPath);
    const form = new FormData();
    form.append("model", this.model);
    form.append("file", new Blob([bytes]), path.basename(mediaPath));
    const res = await fetch("https://api.openai.com/v1/audio/transcriptions", { method: "POST", headers: { authorization: `Bearer ${this.apiKey}` }, body: form });
    if (!res.ok) throw new Error(`OpenAI transcription failed: ${res.status} ${await res.text()}`);
    const data = await res.json() as any;
    const text = data.text || data.transcript || "";
    return chunkTextToEvidence(video, text, this.name, 0.86);
  }
}

export class ExternalWhisperCliProvider implements TranscriptionProvider {
  name = "external-whisper-cli";
  constructor(private binary = process.env.FORGE_WHISPER_CLI || "whisper", private model = process.env.FORGE_WHISPER_MODEL || "base") {}
  async status() {
    const ok = await commandExists(this.binary);
    return { ok, detail: ok ? `${this.binary} binary found` : `${this.binary} binary missing. Configure FORGE_WHISPER_CLI or OPENAI_API_KEY.` };
  }
  async transcribe(video: VideoRecord): Promise<Evidence[]> {
    const mediaPath = mediaPathFor(video);
    if (!mediaPath || !fs.existsSync(mediaPath)) throw new Error("No media file available for whisper CLI transcription");
    const outputDir = path.join(path.dirname(mediaPath), `.transcript-${video.id}`);
    fs.mkdirSync(outputDir, { recursive: true });
    assertExitOk(await safeSpawn(this.binary, [mediaPath, "--model", this.model, "--output_format", "txt", "--output_dir", outputDir], { timeoutMs: 60 * 60_000, maxOutputBytes: 4_000_000 }), "whisper CLI transcription");
    const txt = fs.readdirSync(outputDir).find((f: string) => f.endsWith(".txt"));
    if (!txt) throw new Error("whisper CLI did not produce .txt transcript");
    return chunkTextToEvidence(video, fs.readFileSync(path.join(outputDir, txt), "utf8"), this.name, 0.78);
  }
}
