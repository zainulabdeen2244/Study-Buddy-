import fs from "node:fs";
import path from "node:path";
import { nowIso } from "./utils.js";

export class AuditLog {
  private file: string;
  constructor(dataDir: string) { this.file = path.join(dataDir, "audit.jsonl"); fs.mkdirSync(dataDir, { recursive: true }); }
  write(event: string, payload: Record<string, unknown>): void { fs.appendFileSync(this.file, JSON.stringify({ ts: nowIso(), event, ...payload }) + "\n"); }
}
