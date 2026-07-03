import { PermissionDecision, ToolInvocation, VideoSource } from "./types.js";

function sourceRisk(source: VideoSource): PermissionDecision {
  if (source.sourceType === "synthetic") return { allowed: true, risk: "low", reason: "Synthetic source is safe for local testing." };
  if (source.sourceType === "youtube") return { allowed: true, risk: "medium", reason: "YouTube ingestion downloads remote metadata/media and should be audited.", requiredApproval: "remote_media_ingest" };
  if (source.sourceType === "remote") return { allowed: false, risk: "high", reason: "Generic remote URLs are blocked unless FORGE policy explicitly allowlists the host.", requiredApproval: "remote_url_allowlist" };
  return { allowed: true, risk: "medium", reason: "Local video ingestion is workspace-scoped and needs path validation.", requiredApproval: "workspace_file_read" };
}

export function decidePermission(invocation: ToolInvocation): PermissionDecision {
  if (["video.ask", "video.stats", "video.timeline", "video.health", "video.coverage", "video.report", "video.spec", "video.trace", "video.manifest", "video.auditAnswer", "video.queryPlan", "video.search", "video.premortem", "video.reindexPlan", "video.memoryMap", "video.providerStatus", "video.productionGate", "video.e2ePlan"].includes(invocation.action)) {
    return { allowed: true, risk: "low", reason: "Read-only indexed-data action." };
  }
  if (invocation.action === "video.ingestUrl" || invocation.action === "video.ingestFile") {
    if (!invocation.approved) return { allowed: false, risk: "medium", reason: "Real media ingest requires FORGE approval before download/file read.", requiredApproval: "real_media_ingest" };
  }
  const payload = invocation.payload as any;
  const sources: VideoSource[] = payload?.sources || (payload?.source ? [payload.source] : []);
  const risks = sources.map(sourceRisk);
  const high = risks.find(r => r.risk === "high" && !invocation.approved);
  if (high) return high;
  const needsApproval = risks.find(r => r.requiredApproval && !invocation.approved);
  if (needsApproval) return { ...needsApproval, allowed: false };
  return { allowed: true, risk: risks.some(r=>r.risk==="medium") ? "medium" : "low", reason: "Approved by FORGE policy gate." };
}
