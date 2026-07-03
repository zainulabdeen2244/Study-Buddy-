import fs from "node:fs";
import path from "node:path";
import { Evidence, Job, MemoryNode, VectorRow, VideoRecord } from "../../core/types.js";
import { assertExitOk, commandExists, safeSpawn } from "../../core/safeSpawn.js";
import { SQLITE_SCHEMA } from "../sqlSchemas.js";
import { VideoRagStore } from "../jsonStore.js";
import { nowIso } from "../../core/utils.js";

function q(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return "NULL";
  if (typeof value === "number") return Number.isFinite(value) ? String(value) : "0";
  return `'${String(value).replace(/'/g, "''")}'`;
}

function parseJsonRows<T>(stdout: string): T[] {
  const trimmed = stdout.trim();
  if (!trimmed) return [];
  try { return JSON.parse(trimmed) as T[]; } catch { return []; }
}

/**
 * Real SQLite-backed metadata store using the sqlite3 CLI.
 * It intentionally avoids native npm dependencies so the tool remains clean TypeScript source.
 * Production servers can replace this with a node-sqlite/postgres adapter later without changing the store contract.
 */
export class SqliteCliVideoRagStore implements VideoRagStore {
  constructor(public filePath: string) {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
  }

  async status(): Promise<{ ok: boolean; detail: string }> {
    const ok = await commandExists("sqlite3");
    return { ok, detail: ok ? `sqlite3 metadata store available at ${this.filePath}` : "sqlite3 CLI missing" };
  }

  private async exec(sql: string, json = false): Promise<string> {
    if (/\.system|\.shell/i.test(sql)) throw new Error("Blocked unsafe sqlite meta-command");
    const args = json ? ["-json", this.filePath, sql] : [this.filePath, sql];
    const result = assertExitOk(await safeSpawn("sqlite3", args, { timeoutMs: 120_000, maxOutputBytes: 8_000_000 }), "sqlite3 store");
    return result.stdout;
  }

  async init(): Promise<void> { await this.exec(SQLITE_SCHEMA); }

  async upsertVideo(video: VideoRecord): Promise<void> {
    await this.init();
    await this.exec(`INSERT OR REPLACE INTO videos (id, collection_id, uri, title, source_type, duration_sec, created_at, status, metadata_json) VALUES (${q(video.id)}, ${q(video.collectionId)}, ${q(video.uri)}, ${q(video.title)}, ${q(video.sourceType)}, ${q(video.durationSec)}, ${q(video.createdAt)}, ${q(video.status)}, ${q(JSON.stringify(video.metadata || {}))});`);
  }

  async getVideo(videoId: string): Promise<VideoRecord | undefined> {
    await this.init();
    const rows = parseJsonRows<any>(await this.exec(`SELECT * FROM videos WHERE id=${q(videoId)} LIMIT 1;`, true));
    return rows[0] ? this.rowToVideo(rows[0]) : undefined;
  }

  async listVideos(collectionId: string): Promise<VideoRecord[]> {
    await this.init();
    const rows = parseJsonRows<any>(await this.exec(`SELECT * FROM videos WHERE collection_id=${q(collectionId)} ORDER BY created_at ASC;`, true));
    return rows.map(r => this.rowToVideo(r));
  }

  async addEvidence(rows: Evidence[]): Promise<void> {
    if (!rows.length) return;
    await this.init();
    const sql = rows.map(e => `INSERT OR IGNORE INTO evidence (id, collection_id, video_id, modality, start_sec, end_sec, text, fingerprint, metadata_json, created_at) VALUES (${q(e.id)}, ${q(e.collectionId)}, ${q(e.videoId)}, ${q(e.modality)}, ${q(e.startSec)}, ${q(e.endSec)}, ${q(e.text)}, ${q(e.fingerprint)}, ${q(JSON.stringify(e.metadata || {}))}, ${q(e.createdAt)});`).join("\n");
    await this.exec(`BEGIN;\n${sql}\nCOMMIT;`);
  }

  async listEvidence(collectionId: string, videoId?: string): Promise<Evidence[]> {
    await this.init();
    const filter = videoId ? `AND video_id=${q(videoId)}` : "";
    const rows = parseJsonRows<any>(await this.exec(`SELECT * FROM evidence WHERE collection_id=${q(collectionId)} ${filter} ORDER BY video_id ASC, start_sec ASC;`, true));
    return rows.map(r => this.rowToEvidence(r));
  }

  async getEvidence(id: string): Promise<Evidence | undefined> {
    await this.init();
    const rows = parseJsonRows<any>(await this.exec(`SELECT * FROM evidence WHERE id=${q(id)} LIMIT 1;`, true));
    return rows[0] ? this.rowToEvidence(rows[0]) : undefined;
  }

  async addVectors(rows: VectorRow[]): Promise<void> {
    if (!rows.length) return;
    await this.init();
    const sql = rows.map(v => `INSERT OR IGNORE INTO vectors (id, collection_id, evidence_id, dims, vector_json, created_at) VALUES (${q(v.id)}, ${q(v.collectionId)}, ${q(v.evidenceId)}, ${q(v.dims)}, ${q(JSON.stringify(v.vector))}, ${q(v.createdAt)});`).join("\n");
    await this.exec(`BEGIN;\n${sql}\nCOMMIT;`);
  }

  async listVectors(collectionId: string): Promise<VectorRow[]> {
    await this.init();
    const rows = parseJsonRows<any>(await this.exec(`SELECT * FROM vectors WHERE collection_id=${q(collectionId)};`, true));
    return rows.map(r => ({ id: r.id, collectionId: r.collection_id, evidenceId: r.evidence_id, dims: Number(r.dims || 0), vector: JSON.parse(r.vector_json || "[]"), createdAt: r.created_at }));
  }

  async addMemory(nodes: MemoryNode[]): Promise<void> {
    if (!nodes.length) return;
    await this.init();
    const sql = nodes.map(m => `INSERT OR IGNORE INTO memory_nodes (id, collection_id, video_id, level, start_sec, end_sec, text, evidence_ids_json, created_at) VALUES (${q(m.id)}, ${q(m.collectionId)}, ${q(m.videoId)}, ${q(m.level)}, ${q(m.startSec)}, ${q(m.endSec)}, ${q(m.text)}, ${q(JSON.stringify(m.evidenceIds || []))}, ${q(m.createdAt)});`).join("\n");
    await this.exec(`BEGIN;\n${sql}\nCOMMIT;`);
  }

  async listMemory(collectionId: string): Promise<MemoryNode[]> {
    await this.init();
    const rows = parseJsonRows<any>(await this.exec(`SELECT * FROM memory_nodes WHERE collection_id=${q(collectionId)} ORDER BY video_id ASC, start_sec ASC;`, true));
    return rows.map(r => ({ id: r.id, collectionId: r.collection_id, videoId: r.video_id || undefined, level: r.level, startSec: r.start_sec === null ? undefined : Number(r.start_sec), endSec: r.end_sec === null ? undefined : Number(r.end_sec), text: r.text, evidenceIds: JSON.parse(r.evidence_ids_json || "[]"), createdAt: r.created_at }));
  }

  async createJob(job: Job): Promise<void> { await this.updateJob(job); }

  async updateJob(job: Job): Promise<void> {
    await this.init();
    const updated = { ...job, updatedAt: nowIso() };
    await this.exec(`INSERT OR REPLACE INTO jobs (id, kind, status, payload_json, progress, stage, error, created_at, updated_at) VALUES (${q(updated.id)}, ${q(updated.kind)}, ${q(updated.status)}, ${q(JSON.stringify(updated.payload || {}))}, ${q(updated.progress)}, ${q(updated.stage)}, ${q(updated.error)}, ${q(updated.createdAt)}, ${q(updated.updatedAt)});`);
  }

  async nextJob(): Promise<Job | undefined> {
    await this.init();
    const rows = parseJsonRows<any>(await this.exec(`SELECT * FROM jobs WHERE status='queued' ORDER BY created_at ASC LIMIT 1;`, true));
    return rows[0] ? this.rowToJob(rows[0]) : undefined;
  }

  async getJob(id: string): Promise<Job | undefined> {
    await this.init();
    const rows = parseJsonRows<any>(await this.exec(`SELECT * FROM jobs WHERE id=${q(id)} LIMIT 1;`, true));
    return rows[0] ? this.rowToJob(rows[0]) : undefined;
  }

  private rowToVideo(r: any): VideoRecord {
    return { id: r.id, collectionId: r.collection_id, uri: r.uri, title: r.title, sourceType: r.source_type, durationSec: Number(r.duration_sec || 0), createdAt: r.created_at, status: r.status, metadata: JSON.parse(r.metadata_json || "{}") };
  }
  private rowToEvidence(r: any): Evidence {
    return { id: r.id, collectionId: r.collection_id, videoId: r.video_id, modality: r.modality, startSec: Number(r.start_sec || 0), endSec: Number(r.end_sec || 0), text: r.text, metadata: JSON.parse(r.metadata_json || "{}"), fingerprint: r.fingerprint, createdAt: r.created_at };
  }
  private rowToJob(r: any): Job {
    return { id: r.id, kind: r.kind, status: r.status, payload: JSON.parse(r.payload_json || "{}"), progress: Number(r.progress || 0), stage: r.stage, error: r.error || undefined, createdAt: r.created_at, updatedAt: r.updated_at };
  }
}
