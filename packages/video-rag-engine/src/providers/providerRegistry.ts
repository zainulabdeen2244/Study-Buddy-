import { ToolConfig } from "../core/config.js";
import { commandExists } from "../core/safeSpawn.js";
import { EmbeddingProvider, HashEmbeddingProvider, OpenAIEmbeddingProvider } from "./embeddings.js";
import { TranscriptProvider, SyntheticTranscriptProvider, ProductionTranscriptProvider } from "./transcript.js";
import { OcrProvider, PlaceholderOcrProvider, ProductionOcrProvider } from "./ocr.js";
import { FrameProvider, KeyframeProvider, ProductionFrameProvider } from "./frames.js";

export type ProviderCapability = "download" | "probe" | "frame_extract" | "transcribe" | "ocr" | "vision_caption" | "embed" | "answer" | "store" | "vector_search";
export type ProviderStatus = "configured" | "missing_env" | "missing_binary" | "not_configured" | "fallback";

export interface ProviderStatusEntry {
  capability: ProviderCapability;
  provider: string;
  status: ProviderStatus;
  detail: string;
  productionReady: boolean;
}

export interface ProviderStatusReport {
  readiness: "production_capable" | "partially_configured" | "scaffold_only";
  realProvidersEnabled: boolean;
  storageMode: string;
  strictProductionGate: boolean;
  configuredCapabilities: ProviderCapability[];
  missingCapabilities: ProviderCapability[];
  entries: ProviderStatusEntry[];
  blockers: string[];
  nextActions: string[];
}

export interface ProviderRegistryOptions { embeddingDims: number; mode?: "deterministic" | "external-ready" | "production"; }
export interface ProviderRegistry { embeddings: EmbeddingProvider; transcript: TranscriptProvider; ocr: OcrProvider; frames: FrameProvider; notes: string[]; }

export function createProviderRegistry(options: ProviderRegistryOptions): ProviderRegistry {
  const production = options.mode === "production" || process.env.FORGE_VIDEO_RAG_REAL_PROVIDERS === "true";
  const notes = production ? [
    "Production provider registry enabled. Uses real adapters when env/binaries are configured.",
    "Falls back only for synthetic sources or explicitly disabled modalities."
  ] : [
    "Default providers are deterministic and test-safe.",
    "Set FORGE_VIDEO_RAG_REAL_PROVIDERS=true plus OPENAI_API_KEY/yt-dlp/ffmpeg/tesseract to enable real ingestion."
  ];
  return {
    embeddings: production && process.env.OPENAI_API_KEY ? new OpenAIEmbeddingProvider() : new HashEmbeddingProvider(options.embeddingDims),
    transcript: production ? new ProductionTranscriptProvider() : new SyntheticTranscriptProvider(),
    ocr: production ? new ProductionOcrProvider() : new PlaceholderOcrProvider(),
    frames: production ? new ProductionFrameProvider() : new KeyframeProvider(),
    notes
  };
}

export async function buildProviderStatusReport(config: ToolConfig): Promise<ProviderStatusReport> {
  const checks = {
    ytdlp: await commandExists("yt-dlp"),
    ffmpeg: await commandExists("ffmpeg"),
    ffprobe: await commandExists("ffprobe"),
    tesseract: await commandExists(process.env.FORGE_TESSERACT_CLI || "tesseract"),
    whisper: await commandExists(process.env.FORGE_WHISPER_CLI || "whisper"),
    openai: !!process.env.OPENAI_API_KEY
  };
  const entries: ProviderStatusEntry[] = [
    { capability: "download", provider: "yt-dlp", status: checks.ytdlp ? "configured" : "missing_binary", detail: checks.ytdlp ? "yt-dlp available" : "Install yt-dlp for real YouTube/download ingest", productionReady: checks.ytdlp },
    { capability: "probe", provider: "ffprobe", status: checks.ffprobe ? "configured" : "missing_binary", detail: checks.ffprobe ? "ffprobe available" : "Install FFmpeg/ffprobe for duration/stream metadata", productionReady: checks.ffprobe },
    { capability: "frame_extract", provider: "ffmpeg", status: checks.ffmpeg ? "configured" : "missing_binary", detail: checks.ffmpeg ? "ffmpeg available" : "Install FFmpeg for frame extraction", productionReady: checks.ffmpeg },
    { capability: "transcribe", provider: checks.openai ? "openai-transcription" : "whisper-cli", status: checks.openai || checks.whisper ? "configured" : "missing_env", detail: checks.openai ? "OPENAI_API_KEY configured" : checks.whisper ? "Whisper CLI available" : "Configure OPENAI_API_KEY or whisper CLI", productionReady: checks.openai || checks.whisper },
    { capability: "ocr", provider: "tesseract-cli", status: checks.tesseract ? "configured" : "missing_binary", detail: checks.tesseract ? "Tesseract available" : "Install Tesseract for real OCR", productionReady: checks.tesseract },
    { capability: "vision_caption", provider: "openai-vision", status: checks.openai ? "configured" : "missing_env", detail: checks.openai ? "OPENAI_API_KEY configured" : "Configure OPENAI_API_KEY for frame captions", productionReady: checks.openai },
    { capability: "embed", provider: checks.openai ? "openai-embedding" : "hash-embedding-local", status: checks.openai ? "configured" : "fallback", detail: checks.openai ? "OpenAI embeddings available" : "Hash embeddings active; okay for tests, not production semantic quality", productionReady: checks.openai },
    { capability: "answer", provider: checks.openai && config.useOpenAIAnswer ? "openai-grounded-answer" : "extractive-grounded-answer", status: checks.openai && config.useOpenAIAnswer ? "configured" : "fallback", detail: checks.openai && config.useOpenAIAnswer ? "LLM answer generation enabled" : "Extractive answer fallback active; set FORGE_VIDEO_RAG_USE_OPENAI_ANSWER=true for LLM answers", productionReady: checks.openai && config.useOpenAIAnswer },
    { capability: "store", provider: config.storeMode === "sqlite-cli" ? "sqlite-cli-store" : "json-file-store", status: config.storeMode === "sqlite-cli" && await commandExists("sqlite3") ? "configured" : "fallback", detail: config.storeMode === "sqlite-cli" ? ((await commandExists("sqlite3")) ? "SQLite CLI metadata store selected and sqlite3 is available" : "FORGE_VIDEO_RAG_STORE=sqlite-cli but sqlite3 binary is missing") : "JSON store is clean and test-safe. Use FORGE_VIDEO_RAG_STORE=sqlite-cli or a Postgres adapter for production scale.", productionReady: config.storeMode === "sqlite-cli" && await commandExists("sqlite3") },
    { capability: "vector_search", provider: checks.openai ? "openai-vector-inputs" : "hash-vector-inputs", status: checks.openai ? "configured" : "fallback", detail: checks.openai ? "Real embeddings can feed vector search" : "Hash vectors available only for deterministic local retrieval", productionReady: checks.openai }
  ];
  const configuredCapabilities = entries.filter(e => e.productionReady).map(e => e.capability);
  const missingCapabilities = entries.filter(e => !e.productionReady).map(e => e.capability);
  const requiredCore = ["download", "probe", "frame_extract", "transcribe", "ocr", "vision_caption", "embed", "answer"] as ProviderCapability[];
  const coreReady = requiredCore.filter(c => configuredCapabilities.includes(c)).length;
  const readiness = coreReady >= 7 ? "production_capable" : coreReady >= 3 ? "partially_configured" : "scaffold_only";
  const blockers = entries.filter(e => !e.productionReady && ["download","probe","frame_extract","transcribe","embed","store","vector_search"].includes(e.capability)).map(e => `${e.capability}: ${e.detail}`);
  const nextActions = entries.filter(e => !e.productionReady).map(e => `${e.capability}: ${e.detail}`);
  if (!config.realProviders) nextActions.unshift("Set FORGE_VIDEO_RAG_REAL_PROVIDERS=true to activate real provider adapters for local/youtube sources.");
  if (config.storeMode === "json") nextActions.push("Set FORGE_VIDEO_RAG_STORE=sqlite-cli for local production metadata persistence, or wire Postgres/pgvector in FORGE server mode.");
  return { readiness, realProvidersEnabled: config.realProviders, storageMode: config.storeMode, strictProductionGate: config.strictProductionGate, configuredCapabilities, missingCapabilities, entries, blockers, nextActions };
}
