export type CommandRisk = "low" | "medium" | "high" | "critical";

export interface CommandPolicyDecision {
  allowed: boolean;
  risk: CommandRisk;
  reason: string;
  requiresApproval?: boolean;
}

const READ_ONLY = new Set(["ffprobe", "ffmpeg", "tesseract", "yt-dlp"]);

export function evaluateCommand(command: string, args: string[], approved = false): CommandPolicyDecision {
  if (!READ_ONLY.has(command)) return { allowed: false, risk: "critical", reason: `Command not allowlisted: ${command}`, requiresApproval: true };
  if (args.some(a => a.includes("..") || a.includes(";") || a.includes("&&") || a.includes("|"))) {
    return { allowed: false, risk: "high", reason: "Blocked suspicious command argument", requiresApproval: true };
  }
  if (command === "yt-dlp" && !approved) return { allowed: false, risk: "medium", reason: "Remote media download requires FORGE approval", requiresApproval: true };
  return { allowed: true, risk: command === "yt-dlp" ? "medium" : "low", reason: "Command is allowlisted and uses args array" };
}
