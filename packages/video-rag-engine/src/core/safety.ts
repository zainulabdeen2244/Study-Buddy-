import fs from "node:fs";
import net from "node:net";
import { ToolConfig } from "./config.js";
import { VideoSource } from "./types.js";
import { ensureInside } from "./utils.js";

function isPrivateIp(host: string): boolean {
  if (host === "localhost") return true;
  const ipVersion = net.isIP(host);
  if (ipVersion === 4) {
    const parts = host.split(".").map(Number);
    return parts[0] === 10 || parts[0] === 127 || (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) || (parts[0] === 192 && parts[1] === 168) || parts[0] === 169;
  }
  if (ipVersion === 6) return host === "::1" || host.startsWith("fc") || host.startsWith("fd") || host.startsWith("fe80");
  return false;
}

export function validateSource(source: VideoSource, config: ToolConfig): void {
  if (source.sourceType === "local") {
    const safePath = ensureInside(config.workspaceRoot, source.uri);
    if (!fs.existsSync(safePath)) throw new Error(`Local file does not exist: ${source.uri}`);
    const stat = fs.statSync(safePath);
    if (!stat.isFile()) throw new Error(`Local source is not a file: ${source.uri}`);
    if (stat.size > config.maxLocalVideoBytes) throw new Error(`Local video exceeds size limit: ${stat.size}`);
    return;
  }
  if (source.sourceType === "youtube" || source.sourceType === "remote") {
    const url = new URL(source.uri);
    if (!["http:", "https:"].includes(url.protocol)) throw new Error(`Unsupported URL protocol: ${url.protocol}`);
    const host = url.hostname.toLowerCase();
    if (isPrivateIp(host)) throw new Error(`Blocked private/local network host: ${host}`);
    if (!config.allowRemote && source.sourceType === "remote") throw new Error("Remote URLs are disabled by default. Use YouTube source or enable allowRemote.");
    const allowed = config.allowedRemoteHosts.some(h => host === h || host.endsWith(`.${h}`));
    if (!allowed) throw new Error(`Host not allowlisted: ${host}`);
    return;
  }
}
