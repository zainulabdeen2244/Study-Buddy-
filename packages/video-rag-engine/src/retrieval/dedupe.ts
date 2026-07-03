import { Evidence } from "../core/types.js";

export function dedupeEvidence(rows: Evidence[], nearTimeSeconds = 3): { kept: Evidence[]; removed: Evidence[] } {
  const kept: Evidence[] = [];
  const removed: Evidence[] = [];
  for (const row of rows) {
    const duplicate = kept.find(k =>
      k.collectionId === row.collectionId &&
      k.videoId === row.videoId &&
      k.modality === row.modality &&
      k.fingerprint === row.fingerprint &&
      Math.abs(k.startSec - row.startSec) <= nearTimeSeconds
    );
    if (duplicate) removed.push(row); else kept.push(row);
  }
  return { kept, removed };
}
