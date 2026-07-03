import { ForgeVideoRagTool } from "../tool/forgeTool.js";
import { ToolInvocation, ToolResult } from "../core/types.js";

export interface ForgeRuntimeContext {
  workspaceId: string;
  userId?: string;
  approved?: boolean;
  traceId?: string;
}

const actions: ToolInvocation["action"][] = [
  "video.plan", "video.ingest", "video.ingestBatch", "video.ask", "video.search", "video.auditAnswer", "video.queryPlan",
  "video.timeline", "video.stats", "video.evaluate", "video.health", "video.coverage", "video.manifest", "video.premortem",
  "video.reindexPlan", "video.memoryMap", "video.providerStatus", "video.ingestUrl", "video.ingestFile", "video.report", "video.spec", "video.trace"
];

export class ForgeVideoRagAdapter {
  constructor(private tool = new ForgeVideoRagTool()) {}

  async run(action: ToolInvocation["action"], payload: Record<string, unknown>, context: ForgeRuntimeContext): Promise<ToolResult> {
    return this.tool.invoke({ action, payload, workspaceId: context.workspaceId, userId: context.userId, approved: context.approved, traceId: context.traceId });
  }

  describe() {
    return {
      id: "forge.video_rag_100h.typescript_tool.production_v6",
      actions,
      requiresPermissionGate: true,
      emitsAuditEvents: true,
      uiSurfaces: ["collection stats", "timeline", "answer cards", "citations", "evidence bundle", "answer support audit", "coverage report", "collection manifest", "premortem", "reindex plan", "memory map", "spec lock", "traceability gate", "evaluation report", "trace records", "provider status", "real ingest controls"]
    };
  }
}

export async function handleForgeToolCall(input: { action: string; args?: Record<string, unknown>; approved?: boolean }): Promise<ToolResult> {
  if (input.action === "ingestVideo" && !input.approved) throw new Error("Permission Gate approval required for video ingest");
  const adapter = new ForgeVideoRagAdapter();
  const action = input.action === "ingestVideo" ? "video.ingest" : input.action as ToolInvocation["action"];
  return adapter.run(action, input.args || {}, { workspaceId: "legacy", approved: !!input.approved });
}
