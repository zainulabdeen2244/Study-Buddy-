import fs from "node:fs";
import path from "node:path";
import { commandExists, safeSpawn, assertExitOk } from "../../core/safeSpawn.js";

export class SqliteCliDatabase {
  constructor(public filePath: string) { fs.mkdirSync(path.dirname(filePath), { recursive: true }); }
  async status() {
    const ok = await commandExists("sqlite3");
    return { ok, detail: ok ? "sqlite3 CLI available" : "sqlite3 CLI missing. JSON store remains active unless a Node SQLite dependency is installed." };
  }
  async exec(sql: string): Promise<string> {
    if (/\.system|\.shell/i.test(sql)) throw new Error("Blocked unsafe sqlite meta-command");
    const result = assertExitOk(await safeSpawn("sqlite3", [this.filePath, sql], { timeoutMs: 60_000, maxOutputBytes: 4_000_000 }), "sqlite3");
    return result.stdout;
  }
  async initVideoRagSchema(): Promise<void> {
    await this.exec(`
CREATE TABLE IF NOT EXISTS videos (id TEXT PRIMARY KEY, collection_id TEXT NOT NULL, json TEXT NOT NULL, created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS evidence (id TEXT PRIMARY KEY, collection_id TEXT NOT NULL, video_id TEXT NOT NULL, modality TEXT NOT NULL, start_sec REAL, end_sec REAL, text TEXT NOT NULL, json TEXT NOT NULL, created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS vectors (id TEXT PRIMARY KEY, collection_id TEXT NOT NULL, evidence_id TEXT NOT NULL, dims INTEGER, json TEXT NOT NULL, created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS memory (id TEXT PRIMARY KEY, collection_id TEXT NOT NULL, video_id TEXT, level TEXT NOT NULL, json TEXT NOT NULL, created_at TEXT NOT NULL);
CREATE INDEX IF NOT EXISTS idx_evidence_collection ON evidence(collection_id, video_id, modality);
CREATE INDEX IF NOT EXISTS idx_vectors_collection ON vectors(collection_id, evidence_id);
CREATE INDEX IF NOT EXISTS idx_memory_collection ON memory(collection_id, video_id, level);
`);
  }
}
