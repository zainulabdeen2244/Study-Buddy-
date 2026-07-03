import { VideoRagStore } from "../storage/jsonStore.js";
import { Job } from "./types.js";
import { id, nowIso } from "./utils.js";

export class JobQueue {
  constructor(private store: VideoRagStore) {}
  async enqueue(kind: Job["kind"], payload: Record<string, unknown>): Promise<Job> {
    const job: Job = { id: id("job"), kind, status: "queued", payload, progress: 0, stage: "queued", createdAt: nowIso(), updatedAt: nowIso() };
    await this.store.createJob(job); return job;
  }
  async claimNext(): Promise<Job | undefined> {
    const job = await this.store.nextJob();
    if (!job) return undefined;
    job.status = "running"; job.stage = "claimed"; job.updatedAt = nowIso();
    await this.store.updateJob(job); return job;
  }
  async update(job: Job, patch: Partial<Job>): Promise<Job> { Object.assign(job, patch, { updatedAt: nowIso() }); await this.store.updateJob(job); return job; }
}
