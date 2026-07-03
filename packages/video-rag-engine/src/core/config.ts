import path from "node:path";

export interface ToolConfig {
  workspaceRoot: string;
  dataDir: string;
  defaultCollectionId: string;
  defaultSegmentSeconds: number;
  maxLocalVideoBytes: number;
  defaultMaxFramesPerHour: number;
  defaultMaxOcrFramesPerHour: number;
  allowRemote: boolean;
  allowedRemoteHosts: string[];
  embeddingDims: number;
  realProviders: boolean;
  mediaDir: string;
  useOpenAIAnswer: boolean;
  storeMode: "json" | "sqlite-cli";
  strictProductionGate: boolean;
  allowDegradedProduction: boolean;
}


export function loadConfig(overrides: Partial<ToolConfig> = {}): ToolConfig {
  const workspaceRoot = process.env.FORGE_WORKSPACE_ROOT || process.cwd();
  return {
    workspaceRoot,
    dataDir: process.env.FORGE_VIDEO_RAG_DATA_DIR || path.join(workspaceRoot, ".data", "video-rag"),
    defaultCollectionId: process.env.FORGE_VIDEO_RAG_COLLECTION || "default",
    defaultSegmentSeconds: Number(process.env.FORGE_VIDEO_RAG_SEGMENT_SECONDS || 60),
    maxLocalVideoBytes: Number(process.env.FORGE_VIDEO_RAG_MAX_LOCAL_BYTES || 2_000_000_000),
    defaultMaxFramesPerHour: Number(process.env.FORGE_VIDEO_RAG_MAX_FRAMES_PER_HOUR || 120),
    defaultMaxOcrFramesPerHour: Number(process.env.FORGE_VIDEO_RAG_MAX_OCR_PER_HOUR || 240),
    allowRemote: process.env.FORGE_VIDEO_RAG_ALLOW_REMOTE === "true",
    allowedRemoteHosts: (process.env.FORGE_VIDEO_RAG_ALLOWED_HOSTS || "youtube.com,www.youtube.com,youtu.be").split(",").map((s: string)=>s.trim()).filter(Boolean),
    embeddingDims: Number(process.env.FORGE_VIDEO_RAG_EMBED_DIMS || 384),
    realProviders: process.env.FORGE_VIDEO_RAG_REAL_PROVIDERS === "true",
    mediaDir: process.env.FORGE_VIDEO_RAG_MEDIA_DIR || path.join(workspaceRoot, ".data", "video-rag", "media"),
    useOpenAIAnswer: process.env.FORGE_VIDEO_RAG_USE_OPENAI_ANSWER === "true",
    storeMode: (process.env.FORGE_VIDEO_RAG_STORE || "json") as "json" | "sqlite-cli",
    strictProductionGate: process.env.FORGE_VIDEO_RAG_STRICT_PRODUCTION !== "false",
    allowDegradedProduction: process.env.FORGE_VIDEO_RAG_ALLOW_DEGRADED_PRODUCTION === "true",
    ...overrides
  };
}
