import { LongVideoRagToolEngine } from "../core/engine.js";
import { ToolInvocation, ToolResult, VideoSource, AskOptions, BatchIngestRequest, EvaluationCase, SpecRequest, TraceRequest, SearchEvidenceRequest, PremortemRequest, ReindexPlanRequest, MemoryMapRequest, ProviderStatusRequest, ProductionGateRequest } from "../core/types.js";
import { runWithForgeContract } from "../core/toolContract.js";
import { evaluateCases } from "../eval/evaluator.js";
import { healthCheck } from "../ops/health.js";
import { TraceStore } from "../observability/trace.js";
import { buildE2EProofPlan } from "../ops/e2ePlan.js";

export class ForgeVideoRagTool {
  constructor(private engine = new LongVideoRagToolEngine()) {}

  async invoke(invocation: ToolInvocation): Promise<ToolResult> {
    const traceStore = new TraceStore(this.engine.config.dataDir);
    const started = Date.now();
    const result = await runWithForgeContract(invocation, async (events) => {
      events.emit("video_rag.action.started", invocation.traceId || "trace", { action: invocation.action });
      switch (invocation.action) {
        case "video.plan": {
          const p = invocation.payload as { source: VideoSource; options?: any };
          return this.engine.ingest(p.source, { ...(p.options || {}), dryRun: true });
        }
        case "video.ingest": {
          const p = invocation.payload as { source: VideoSource; options?: any };
          return this.engine.ingest(p.source, p.options || {});
        }
        case "video.ingestUrl": {
          const p = invocation.payload as { url: string; collectionId?: string; title?: string; options?: any };
          return this.engine.ingest({ sourceType: "youtube", uri: p.url, collectionId: p.collectionId, title: p.title }, { ...(p.options || {}), collectionId: p.collectionId, title: p.title });
        }
        case "video.ingestFile": {
          const p = invocation.payload as { path: string; collectionId?: string; title?: string; options?: any };
          return this.engine.ingest({ sourceType: "local", uri: p.path, collectionId: p.collectionId, title: p.title }, { ...(p.options || {}), collectionId: p.collectionId, title: p.title });
        }
        case "video.ingestBatch":
          return this.engine.ingestBatch(invocation.payload as unknown as BatchIngestRequest);
        case "video.ask":
          return this.engine.ask(invocation.payload as unknown as AskOptions);
        case "video.search":
          return this.engine.searchEvidence(invocation.payload as unknown as SearchEvidenceRequest);
        case "video.auditAnswer":
          return this.engine.auditAnswer(invocation.payload as unknown as AskOptions);
        case "video.queryPlan": {
          const p = invocation.payload as { question: string };
          return this.engine.queryPlan(p.question || "");
        }
        case "video.timeline": {
          const p = invocation.payload as { collectionId: string; videoId?: string; segmentSeconds?: number };
          return this.engine.timeline(p.collectionId, p.videoId, p.segmentSeconds);
        }
        case "video.stats": {
          const p = invocation.payload as { collectionId: string };
          return this.engine.stats(p.collectionId || "default");
        }
        case "video.evaluate": {
          const p = invocation.payload as { cases: EvaluationCase[] };
          return evaluateCases(this.engine, p.cases);
        }
        case "video.health": {
          const p = invocation.payload as { collectionId?: string };
          return healthCheck(this.engine, p.collectionId);
        }
        case "video.coverage": {
          const p = invocation.payload as { collectionId: string };
          return this.engine.coverage(p.collectionId || "default");
        }
        case "video.manifest": {
          const p = invocation.payload as { collectionId: string };
          return this.engine.manifest(p.collectionId || "default");
        }
        case "video.report": {
          const p = invocation.payload as { collectionId: string };
          return this.engine.readinessReport(p.collectionId || "default");
        }
        case "video.premortem": {
          const p = invocation.payload as unknown as PremortemRequest;
          return this.engine.premortem(p.collectionId || "default");
        }
        case "video.reindexPlan": {
          const p = invocation.payload as unknown as ReindexPlanRequest;
          return this.engine.reindexPlan(p.collectionId || "default", p.mode);
        }
        case "video.memoryMap": {
          const p = invocation.payload as unknown as MemoryMapRequest;
          return this.engine.memoryMap(p.collectionId || "default");
        }
        case "video.providerStatus": {
          const _p = invocation.payload as unknown as ProviderStatusRequest;
          return this.engine.providerStatus();
        }
        case "video.productionGate": {
          const p = invocation.payload as unknown as ProductionGateRequest;
          return this.engine.productionGate({ source: p.source, options: p.options, action: p.action || "provider_check" });
        }
        case "video.e2ePlan": {
          const p = invocation.payload as { collectionId?: string };
          return buildE2EProofPlan(p.collectionId || "default");
        }
        case "video.spec": {
          const p = invocation.payload as unknown as SpecRequest;
          return this.engine.spec(p.goal, p.collectionId);
        }
        case "video.trace": {
          const p = invocation.payload as unknown as TraceRequest;
          const records = traceStore.read(p.traceId).slice(-(p.limit ?? 100));
          return { records, count: records.length };
        }
        default:
          throw new Error(`Unsupported FORGE video RAG action: ${invocation.action}`);
      }
    });
    traceStore.write({
      traceId: result.traceId,
      stage: result.action,
      status: result.ok ? "succeeded" : "failed",
      durationMs: Date.now() - started,
      metadata: { auditEvents: result.auditEvents, error: result.error || null }
    });
    return result;
  }
}
