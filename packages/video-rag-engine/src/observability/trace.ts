import fs from "node:fs";
import path from "node:path";
import { nowIso } from "../core/utils.js";

export type TraceStatus = "started" | "succeeded" | "failed" | "blocked";

export interface TraceRecord {
  traceId: string;
  stage: string;
  status: TraceStatus;
  at: string;
  durationMs?: number;
  metadata: Record<string, unknown>;
}

export class TraceStore {
  constructor(private dir: string) { fs.mkdirSync(dir, { recursive: true }); }
  private file(): string { return path.join(this.dir, "trace-records.jsonl"); }
  write(record: Omit<TraceRecord, "at">): TraceRecord {
    const full = { ...record, at: nowIso() };
    fs.appendFileSync(this.file(), `${JSON.stringify(full)}\n`);
    return full;
  }
  read(traceId?: string): TraceRecord[] {
    if (!fs.existsSync(this.file())) return [];
    return fs.readFileSync(this.file(), "utf8").split("\n").filter(Boolean).map((line: string) => JSON.parse(line) as TraceRecord).filter((r: TraceRecord) => !traceId || r.traceId === traceId);
  }
}
