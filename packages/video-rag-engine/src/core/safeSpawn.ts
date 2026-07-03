import { spawn } from "node:child_process";

export interface SafeSpawnResult {
  command: string;
  args: string[];
  cwd?: string;
  exitCode: number | null;
  timedOut: boolean;
  stdout: string;
  stderr: string;
  durationMs: number;
}

export interface SafeSpawnOptions {
  cwd?: string;
  timeoutMs?: number;
  maxOutputBytes?: number;
  env?: Record<string, string | undefined>;
}

export function commandExists(command: string, timeoutMs = 3000): Promise<boolean> {
  return new Promise(resolve => {
    const child = spawn(command, ["--version"], { stdio: ["ignore", "pipe", "pipe"] });
    const timer = setTimeout(() => { child.kill("SIGKILL"); resolve(false); }, timeoutMs);
    child.on("error", () => { clearTimeout(timer); resolve(false); });
    child.on("close", () => { clearTimeout(timer); resolve(true); });
  });
}

export function safeSpawn(command: string, args: string[], options: SafeSpawnOptions = {}): Promise<SafeSpawnResult> {
  if (!command || /\s/.test(command)) throw new Error(`Unsafe command name: ${command}`);
  if (!Array.isArray(args)) throw new Error("safeSpawn requires args array");
  const started = Date.now();
  const timeoutMs = options.timeoutMs ?? 120_000;
  const maxOutputBytes = options.maxOutputBytes ?? 2_000_000;
  return new Promise((resolve, reject) => {
    let stdout = "";
    let stderr = "";
    let timedOut = false;
    const child = spawn(command, args, {
      cwd: options.cwd,
      shell: false,
      env: { ...process.env, ...(options.env || {}) },
      stdio: ["ignore", "pipe", "pipe"]
    });
    const timer = setTimeout(() => {
      timedOut = true;
      child.kill("SIGKILL");
    }, timeoutMs);
    const append = (kind: "stdout" | "stderr", chunk: any) => {
      const text = String(chunk);
      if (kind === "stdout") stdout = (stdout + text).slice(-maxOutputBytes);
      else stderr = (stderr + text).slice(-maxOutputBytes);
    };
    child.stdout?.on("data", (c: any) => append("stdout", c));
    child.stderr?.on("data", (c: any) => append("stderr", c));
    child.on("error", (err: any) => { clearTimeout(timer); reject(err); });
    child.on("close", (code: any) => {
      clearTimeout(timer);
      resolve({ command, args, cwd: options.cwd, exitCode: code, timedOut, stdout, stderr, durationMs: Date.now() - started });
    });
  });
}

export function assertExitOk(result: SafeSpawnResult, label: string): SafeSpawnResult {
  if (result.timedOut) throw new Error(`${label} timed out after ${result.durationMs}ms`);
  if (result.exitCode !== 0) throw new Error(`${label} failed with exit ${result.exitCode}: ${result.stderr || result.stdout}`);
  return result;
}
