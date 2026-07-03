/**
 * logger.ts — Study-Buddy structured logger
 *
 * Writes to stdout AND to a rolling log file at .data/study-buddy/logs/study-buddy.log
 * Format: [ISO_TIMESTAMP] [LEVEL] [MODULE] message  {json_context}
 *
 * Levels: DEBUG | INFO | WARN | ERROR
 * Set LOG_LEVEL=debug to see debug logs. Default is INFO.
 */

import fs from "node:fs";
import path from "node:path";

type LogLevel = "DEBUG" | "INFO" | "WARN" | "ERROR";

const LEVELS: Record<LogLevel, number> = { DEBUG: 0, INFO: 1, WARN: 2, ERROR: 3 };
const envLevel = (process.env.LOG_LEVEL || "info").toUpperCase() as LogLevel;
const MIN_LEVEL = LEVELS[envLevel] ?? LEVELS.INFO;

// Log file path — created lazily on first write
let logFilePath: string | null = null;
let logStream: ReturnType<typeof fs.createWriteStream> | null = null;

function openLogStream(workspaceRoot = process.cwd()): void {
  if (logStream) return;
  try {
    const dir = path.join(workspaceRoot, ".data", "study-buddy", "logs");
    fs.mkdirSync(dir, { recursive: true });
    logFilePath = path.join(dir, "study-buddy.log");
    logStream = fs.createWriteStream(logFilePath, { flags: "a" });
  } catch { /* non-fatal — console still works */ }
}

function formatCtx(ctx?: Record<string, unknown>): string {
  if (!ctx || !Object.keys(ctx).length) return "";
  try { return "  " + JSON.stringify(ctx); } catch { return ""; }
}

function write(level: LogLevel, module: string, message: string, ctx?: Record<string, unknown>): void {
  if (LEVELS[level] < MIN_LEVEL) return;
  const ts = new Date().toISOString();
  const line = `[${ts}] [${level.padEnd(5)}] [${module.padEnd(20)}] ${message}${formatCtx(ctx)}`;

  // Always print to stderr for ERROR, stdout otherwise (so logs don't pollute JSON API responses)
  if (level === "ERROR") process.stderr.write(line + "\n");
  else process.stdout.write(line + "\n");

  // Append to file (lazy open)
  if (!logStream) openLogStream();
  if (logStream) {
    try { logStream.write(line + "\n"); } catch { /* non-fatal */ }
  }
}

export const log = {
  debug: (module: string, message: string, ctx?: Record<string, unknown>) => write("DEBUG", module, message, ctx),
  info:  (module: string, message: string, ctx?: Record<string, unknown>) => write("INFO",  module, message, ctx),
  warn:  (module: string, message: string, ctx?: Record<string, unknown>) => write("WARN",  module, message, ctx),
  error: (module: string, message: string, ctx?: Record<string, unknown>) => write("ERROR", module, message, ctx),
};

/** Convenience: log an error with full stack trace */
export function logError(module: string, message: string, err: unknown, extra?: Record<string, unknown>): void {
  const isErr = err instanceof Error;
  write("ERROR", module, message, {
    ...extra,
    error: isErr ? err.message : String(err),
    stack: isErr ? err.stack?.split("\n").slice(0, 6).join(" | ") : undefined,
  });
}

/** Returns a function that logs a timer when called */
export function timer(module: string, label: string): () => number {
  const t0 = Date.now();
  log.debug(module, `→ ${label}`);
  return () => {
    const ms = Date.now() - t0;
    log.debug(module, `← ${label} (${ms}ms)`);
    return ms;
  };
}
