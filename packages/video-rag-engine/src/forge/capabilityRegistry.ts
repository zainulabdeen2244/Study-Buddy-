export const forgeVideoRagCapability = {
  id: "forge.video_rag_100h.typescript_tool.premortem_v5",
  name: "FORGE Video RAG 100H Premortem Pro Tool",
  actions: [
    "video.plan", "video.ingest", "video.ingestBatch", "video.ask", "video.search", "video.auditAnswer", "video.queryPlan",
    "video.timeline", "video.stats", "video.evaluate", "video.health", "video.coverage", "video.manifest", "video.premortem",
    "video.reindexPlan", "video.memoryMap", "video.report", "video.spec", "video.trace"
  ],
  governance: { permissionGate: true, auditLog: true, workspaceScoped: true, remoteUrlAllowlist: true, premortemBeforeProduction: true, evidenceBundleBeforeAnswer: true },
  strengths: ["100+ hour collection indexing", "timestamp citations", "adaptive evidence bundles", "hierarchical memory", "query planning", "graph expansion", "premortem", "reindex plans", "verifier confidence", "UI-ready cards"],
  limitations: ["Not mathematically 100% correct", "Accuracy depends on transcript/OCR/vision providers", "Production vector DB adapters should be enabled for very large deployments"]
} as const;
