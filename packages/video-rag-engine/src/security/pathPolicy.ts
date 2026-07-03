import fs from "node:fs";
import path from "node:path";
import { ensureInside } from "../core/utils.js";

export interface WorkspacePathPolicy {
  workspaceRoot: string;
  projectId?: string;
  runId?: string;
}

export function resolveWorkspacePath(policy: WorkspacePathPolicy, candidate: string): string {
  const base = policy.projectId ? path.join(policy.workspaceRoot, policy.projectId, policy.runId || "default") : policy.workspaceRoot;
  fs.mkdirSync(base, { recursive: true });
  return ensureInside(base, candidate);
}

export function assertReadableFileInside(workspaceRoot: string, filePath: string, maxBytes?: number): string {
  const resolved = ensureInside(workspaceRoot, filePath);
  const stat = fs.statSync(resolved);
  if (!stat.isFile()) throw new Error(`Not a file: ${filePath}`);
  if (maxBytes && stat.size > maxBytes) throw new Error(`File exceeds size limit: ${stat.size}`);
  return resolved;
}
