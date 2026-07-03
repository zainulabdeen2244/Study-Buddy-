import { ToolConfig } from "../core/config.js";
import { IngestOptions, VideoSource } from "../core/types.js";
import { ProviderCapability, ProviderStatusReport } from "../providers/providerRegistry.js";

export type ProductionGateStatus = "allowed" | "blocked" | "degraded_allowed" | "not_applicable";

export interface ProductionGateReport {
  status: ProductionGateStatus;
  action: "ingest" | "ask" | "report" | "provider_check";
  sourceType?: VideoSource["sourceType"];
  strictProductionGate: boolean;
  allowDegradedProduction: boolean;
  realProvidersEnabled: boolean;
  requiredCapabilities: ProviderCapability[];
  missingRequiredCapabilities: ProviderCapability[];
  forbiddenFallbacks: ProviderCapability[];
  blockers: string[];
  warnings: string[];
  nextActions: string[];
}

const uniq = <T>(items: T[]) => [...new Set(items)];

export function requiredCapabilitiesForIngest(source: VideoSource | undefined, options: IngestOptions | undefined): ProviderCapability[] {
  if (!source || source.sourceType === "synthetic") return [];
  const required: ProviderCapability[] = [];
  if (source.sourceType === "youtube" || source.sourceType === "remote") required.push("download");
  required.push("probe");
  required.push("frame_extract");
  if (options?.enableTranscript !== false) required.push("transcribe");
  if (options?.enableOcr !== false) required.push("ocr");
  if (options?.enableVision === true) required.push("vision_caption");
  required.push("embed");
  required.push("store");
  required.push("vector_search");
  return uniq(required);
}

export function evaluateProductionGate(params: {
  config: ToolConfig;
  providerStatus: ProviderStatusReport;
  action: ProductionGateReport["action"];
  source?: VideoSource;
  options?: IngestOptions;
}): ProductionGateReport {
  const { config, providerStatus, action, source, options } = params;
  const warnings: string[] = [];
  const blockers: string[] = [];
  const nextActions: string[] = [];

  const requiredCapabilities = action === "ingest" ? requiredCapabilitiesForIngest(source, options) : action === "ask" ? ["embed", "vector_search"] as ProviderCapability[] : [];
  const configured = new Set(providerStatus.configuredCapabilities);
  const missingRequiredCapabilities = requiredCapabilities.filter(c => !configured.has(c));
  const fallbackEntries = providerStatus.entries.filter(e => requiredCapabilities.includes(e.capability) && e.status === "fallback");
  const forbiddenFallbacks = fallbackEntries.map(e => e.capability);

  if (!config.realProviders && source?.sourceType !== "synthetic") {
    blockers.push("Real providers are disabled. Set FORGE_VIDEO_RAG_REAL_PROVIDERS=true for production ingest.");
  }
  if (config.realProviders && config.storeMode === "json" && source?.sourceType !== "synthetic") {
    warnings.push("JSON store is active. It is allowed for smoke tests, but SQLite/Postgres is required before 100+ hour production use.");
  }
  for (const cap of missingRequiredCapabilities) {
    const entry = providerStatus.entries.find(e => e.capability === cap);
    blockers.push(`${cap} not production-ready: ${entry?.detail || "missing provider"}`);
  }
  for (const cap of forbiddenFallbacks) {
    const entry = providerStatus.entries.find(e => e.capability === cap);
    blockers.push(`${cap} is using fallback provider: ${entry?.provider || "unknown"}. Fallbacks cannot pass strict production mode.`);
  }

  nextActions.push(...providerStatus.nextActions.filter(a => requiredCapabilities.some(c => a.startsWith(`${c}:`))));
  if (config.storeMode === "json") nextActions.push("Set FORGE_VIDEO_RAG_STORE=sqlite-cli for local production, or replace with Postgres/pgvector in FORGE server mode.");
  if (!config.useOpenAIAnswer) nextActions.push("Set FORGE_VIDEO_RAG_USE_OPENAI_ANSWER=true for LLM-grounded final answers; extractive answers remain safe fallback for smoke tests.");

  if (requiredCapabilities.length === 0) {
    return { status: "not_applicable", action, sourceType: source?.sourceType, strictProductionGate: config.strictProductionGate, allowDegradedProduction: config.allowDegradedProduction || !!options?.allowDegradedProviders, realProvidersEnabled: config.realProviders, requiredCapabilities, missingRequiredCapabilities, forbiddenFallbacks, blockers: [], warnings, nextActions };
  }

  const degradedAllowed = config.allowDegradedProduction || !!options?.allowDegradedProviders || !config.strictProductionGate;
  if (blockers.length && degradedAllowed) {
    return { status: "degraded_allowed", action, sourceType: source?.sourceType, strictProductionGate: config.strictProductionGate, allowDegradedProduction: true, realProvidersEnabled: config.realProviders, requiredCapabilities, missingRequiredCapabilities, forbiddenFallbacks, blockers, warnings, nextActions };
  }
  if (blockers.length) {
    return { status: "blocked", action, sourceType: source?.sourceType, strictProductionGate: config.strictProductionGate, allowDegradedProduction: false, realProvidersEnabled: config.realProviders, requiredCapabilities, missingRequiredCapabilities, forbiddenFallbacks, blockers, warnings, nextActions };
  }
  return { status: "allowed", action, sourceType: source?.sourceType, strictProductionGate: config.strictProductionGate, allowDegradedProduction: config.allowDegradedProduction || !!options?.allowDegradedProviders, realProvidersEnabled: config.realProviders, requiredCapabilities, missingRequiredCapabilities, forbiddenFallbacks, blockers, warnings, nextActions };
}

export function assertProductionGate(report: ProductionGateReport): void {
  if (report.status === "blocked") {
    throw new Error(`Production gate blocked ${report.action}: ${report.blockers.join(" | ")}`);
  }
}
