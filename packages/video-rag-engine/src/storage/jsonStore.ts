import fs from "node:fs";
import path from "node:path";
import { Evidence, Job, MemoryNode, VectorRow, VideoRecord } from "../core/types.js";
import { nowIso } from "../core/utils.js";

export interface VideoRagStore {
  upsertVideo(video: VideoRecord): Promise<void>;
  getVideo(videoId: string): Promise<VideoRecord | undefined>;
  listVideos(collectionId: string): Promise<VideoRecord[]>;
  addEvidence(rows: Evidence[]): Promise<void>;
  listEvidence(collectionId: string, videoId?: string): Promise<Evidence[]>;
  getEvidence(id: string): Promise<Evidence | undefined>;
  addVectors(rows: VectorRow[]): Promise<void>;
  listVectors(collectionId: string): Promise<VectorRow[]>;
  addMemory(nodes: MemoryNode[]): Promise<void>;
  listMemory(collectionId: string): Promise<MemoryNode[]>;
  createJob(job: Job): Promise<void>;
  updateJob(job: Job): Promise<void>;
  nextJob(): Promise<Job | undefined>;
  getJob(id: string): Promise<Job | undefined>;
}

type DbShape = { videos: VideoRecord[]; evidence: Evidence[]; vectors: VectorRow[]; memory: MemoryNode[]; jobs: Job[] };

export class JsonFileStore implements VideoRagStore {
  private file: string;
  constructor(dataDir: string) { this.file = path.join(dataDir, "video-rag-db.json"); fs.mkdirSync(dataDir, { recursive: true }); }
  private read(): DbShape {
    if (!fs.existsSync(this.file)) return { videos: [], evidence: [], vectors: [], memory: [], jobs: [] };
    return JSON.parse(fs.readFileSync(this.file, "utf8")) as DbShape;
  }
  private write(db: DbShape): void { fs.writeFileSync(this.file, JSON.stringify(db, null, 2)); }
  async upsertVideo(video: VideoRecord): Promise<void> { const db=this.read(); const i=db.videos.findIndex(v=>v.id===video.id); i>=0?db.videos[i]=video:db.videos.push(video); this.write(db); }
  async getVideo(videoId: string): Promise<VideoRecord | undefined> { return this.read().videos.find(v=>v.id===videoId); }
  async listVideos(collectionId: string): Promise<VideoRecord[]> { return this.read().videos.filter(v=>v.collectionId===collectionId); }
  async addEvidence(rows: Evidence[]): Promise<void> { const db=this.read(); const existing=new Set(db.evidence.map(e=>e.id)); for (const r of rows) if(!existing.has(r.id)) db.evidence.push(r); this.write(db); }
  async listEvidence(collectionId: string, videoId?: string): Promise<Evidence[]> { return this.read().evidence.filter(e=>e.collectionId===collectionId && (!videoId || e.videoId===videoId)); }
  async getEvidence(id: string): Promise<Evidence | undefined> { return this.read().evidence.find(e=>e.id===id); }
  async addVectors(rows: VectorRow[]): Promise<void> { const db=this.read(); const existing=new Set(db.vectors.map(v=>v.id)); for (const r of rows) if(!existing.has(r.id)) db.vectors.push(r); this.write(db); }
  async listVectors(collectionId: string): Promise<VectorRow[]> { return this.read().vectors.filter(v=>v.collectionId===collectionId); }
  async addMemory(nodes: MemoryNode[]): Promise<void> { const db=this.read(); const existing=new Set(db.memory.map(m=>m.id)); for (const n of nodes) if(!existing.has(n.id)) db.memory.push(n); this.write(db); }
  async listMemory(collectionId: string): Promise<MemoryNode[]> { return this.read().memory.filter(m=>m.collectionId===collectionId); }
  async createJob(job: Job): Promise<void> { const db=this.read(); db.jobs.push(job); this.write(db); }
  async updateJob(job: Job): Promise<void> { const db=this.read(); const i=db.jobs.findIndex(j=>j.id===job.id); if(i<0) db.jobs.push(job); else db.jobs[i]={...job, updatedAt: nowIso()}; this.write(db); }
  async nextJob(): Promise<Job | undefined> { const db=this.read(); return db.jobs.find(j=>j.status==="queued"); }
  async getJob(id: string): Promise<Job | undefined> { return this.read().jobs.find(j=>j.id===id); }
}
