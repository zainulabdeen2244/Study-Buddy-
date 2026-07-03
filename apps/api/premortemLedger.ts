import fs from "node:fs";
import path from "node:path";
import { nowIso, id } from "../../packages/video-rag-engine/src/core/utils.js";
import type { PremortemEntry } from "./studyBuddyTypes.js";

export class PremortemLedger {
  private file: string;
  constructor(dataDir: string) {
    this.file = path.join(dataDir, "study-buddy-premortem-ledger.jsonl");
    fs.mkdirSync(path.dirname(this.file), { recursive: true });
  }
  record(entry: Omit<PremortemEntry, "id" | "createdAt" | "status"> & { status?: PremortemEntry["status"] }): PremortemEntry {
    const row: PremortemEntry = { id: id("pre"), createdAt: nowIso(), status: entry.status || "recorded", module: entry.module, stage: entry.stage, likelyFailures: entry.likelyFailures, mitigations: entry.mitigations };
    fs.appendFileSync(this.file, JSON.stringify(row) + "\n");
    return row;
  }
  read(limit = 50): PremortemEntry[] {
    if (!fs.existsSync(this.file)) return [];
    return fs.readFileSync(this.file, "utf8").split(/\n+/).filter(Boolean).slice(-limit).map((line: string) => JSON.parse(line) as PremortemEntry).reverse();
  }
}

export function standardPremortem(module: string, stage: string): Omit<PremortemEntry, "id" | "createdAt" | "status"> {
  const common = [
    "Evidence can be missing, stale, or unsupported.",
    "Medical answer can drift into diagnosis, dosage, or patient-specific treatment.",
    "UI can look impressive while backend proof is weak.",
    "Provider keys or native binaries can be unavailable during live deployment."
  ];
  const mitigations = [
    "Run evidence-first retrieval and fail closed when support is low.",
    "Route every output through Study-Buddy medical safety gate.",
    "Expose VideoRAG audit, coverage, memory map, provider status, and production gate.",
    "Keep golden demo, transcript ingest, and deterministic fallback active without API keys."
  ];
  return { module, stage, likelyFailures: common, mitigations };
}
