import { LongVideoRagToolEngine } from "../core/engine.js";
import { JobQueue } from "../core/jobQueue.js";
import { VideoSource, IngestOptions } from "../core/types.js";

async function main() {
  const engine = new LongVideoRagToolEngine();
  const queue = new JobQueue(engine.getStore());
  const job = await queue.claimNext();
  if (!job) { console.log("No queued jobs."); return; }
  try {
    if (job.kind === "ingest") {
      await queue.update(job, { stage: "ingesting", progress: 0.1 });
      const payload = job.payload as { source: VideoSource; options?: IngestOptions };
      const result = await engine.ingest(payload.source, payload.options || {});
      await queue.update(job, { status: "succeeded", stage: "done", progress: 1, payload: { ...job.payload, result } });
      console.log(JSON.stringify(result, null, 2));
      return;
    }
    throw new Error(`Unsupported job kind: ${job.kind}`);
  } catch (error) {
    await queue.update(job, { status: "failed", stage: "failed", error: error instanceof Error ? error.message : String(error) });
    throw error;
  }
}
main().catch(err => { console.error(err instanceof Error ? err.message : err); process.exit(1); });
