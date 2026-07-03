import { HealthReport } from "../core/types.js";
import { LongVideoRagToolEngine } from "../core/engine.js";

export async function healthCheck(engine: LongVideoRagToolEngine, collectionId = "default"): Promise<HealthReport> {
  const stats = await engine.stats(collectionId);
  const checks = [
    { name: "store", ok: true, detail: "Store responded to stats request." },
    { name: "evidence", ok: Number(stats.evidence || 0) > 0, detail: `${stats.evidence || 0} evidence rows indexed.` },
    { name: "memory", ok: Number(stats.memory || 0) > 0, detail: `${stats.memory || 0} memory nodes indexed.` }
  ];
  const recommendations: string[] = [];
  if (!checks[1].ok) recommendations.push("Ingest at least one video before asking production questions.");
  if ((stats as any).totalHours >= 100 && !(stats as any).byModality?.transcript) recommendations.push("For 100+ hours, enable transcript/ASR as first-class evidence.");
  return { status: checks.every(c=>c.ok) ? "ok" : "degraded", checks, recommendations };
}
