import net from "node:net";

export interface RemoteUrlPolicy {
  allowRemote: boolean;
  allowedHosts: string[];
}

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

export function validateRemoteUrl(uri: string, policy: RemoteUrlPolicy): URL {
  const url = new URL(uri);
  if (!["http:", "https:"].includes(url.protocol)) throw new Error(`Unsupported URL protocol: ${url.protocol}`);
  const host = url.hostname.toLowerCase();
  if (isPrivateIp(host)) throw new Error(`Blocked private/local network host: ${host}`);
  const allowed = policy.allowedHosts.some(h => host === h || host.endsWith(`.${h}`));
  if (!allowed) throw new Error(`Host not allowlisted: ${host}`);
  if (!policy.allowRemote && !["youtube.com", "www.youtube.com", "youtu.be"].some(h => host === h || host.endsWith(`.${h}`))) throw new Error("Remote URL ingestion is disabled by policy.");
  return url;
}
