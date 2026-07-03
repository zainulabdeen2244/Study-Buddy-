import crypto from "node:crypto";
import path from "node:path";

export function nowIso(): string { return new Date().toISOString(); }
export function id(prefix = "id"): string { return `${prefix}_${crypto.randomBytes(8).toString("hex")}`; }
export function sha256(input: string): string { return crypto.createHash("sha256").update(input).digest("hex"); }
export function normalizeText(input: string): string { return input.toLowerCase().replace(/\s+/g, " ").replace(/[^a-z0-9:.,!?\- ]/g, "").trim(); }
export function fingerprintText(input: string): string { return sha256(normalizeText(input)).slice(0, 24); }
export function clamp(n: number, min: number, max: number): number { return Math.max(min, Math.min(max, n)); }
export function secondsToTimestamp(sec: number): string {
  const s = Math.max(0, Math.floor(sec)); const h = Math.floor(s / 3600); const m = Math.floor((s % 3600) / 60); const r = s % 60;
  return h > 0 ? `${h}:${String(m).padStart(2,"0")}:${String(r).padStart(2,"0")}` : `${m}:${String(r).padStart(2,"0")}`;
}
export function ensureInside(root: string, target: string): string {
  const resolvedRoot = path.resolve(root); const resolvedTarget = path.resolve(target);
  if (!resolvedTarget.startsWith(resolvedRoot + path.sep) && resolvedTarget !== resolvedRoot) throw new Error(`Path escapes workspace root: ${target}`);
  return resolvedTarget;
}
export function cosine(a: number[], b: number[]): number {
  const len = Math.min(a.length, b.length); let dot=0, na=0, nb=0;
  for (let i=0;i<len;i++){ dot+=a[i]*b[i]; na+=a[i]*a[i]; nb+=b[i]*b[i]; }
  if (!na || !nb) return 0; return dot/(Math.sqrt(na)*Math.sqrt(nb));
}
export function tokenize(input: string): string[] { return normalizeText(input).split(" ").filter(Boolean); }
