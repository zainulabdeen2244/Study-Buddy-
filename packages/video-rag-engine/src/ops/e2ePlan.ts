export interface E2EProofStep {
  id: string;
  command: string;
  requiredEvidence: string[];
  passCondition: string;
}

export function buildE2EProofPlan(collectionId = "default") {
  const steps: E2EProofStep[] = [
    { id: "provider-status", command: "forge-video-rag provider-status", requiredEvidence: ["provider readiness report"], passCondition: "download/probe/frame/transcribe/embed/store statuses are truthful" },
    { id: "youtube-smoke", command: `FORGE_VIDEO_RAG_REAL_PROVIDERS=true forge-video-rag ingest-url --url <youtube-url> --collection ${collectionId}`, requiredEvidence: ["downloaded media", "ffprobe metadata", "transcript evidence", "frame evidence", "vectors"], passCondition: "ingest completes or blocks with explicit missing-provider reason" },
    { id: "local-smoke", command: `FORGE_VIDEO_RAG_REAL_PROVIDERS=true forge-video-rag ingest-file --path ./sample.mp4 --collection ${collectionId}`, requiredEvidence: ["local file probed", "frames extracted", "OCR/vision if enabled"], passCondition: "local ingest completes with real timestamps" },
    { id: "ask-grounded", command: `forge-video-rag ask --collection ${collectionId} --q \"Summarize with timestamps\"`, requiredEvidence: ["answer", "citations", "support audit"], passCondition: "answer is supported or explicitly insufficient_evidence" },
    { id: "readiness-report", command: `forge-video-rag report --collection ${collectionId}`, requiredEvidence: ["coverage", "manifest", "recommendations"], passCondition: "readiness does not claim ready when evidence is missing" }
  ];
  return { collectionId, goal: "prove real end-to-end Video RAG before claiming production completion", steps, finalRule: "No 100% completion claim until these commands pass on real media and a 10h/30h/100h benchmark ladder." };
}
