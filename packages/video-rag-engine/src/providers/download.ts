import fs from "node:fs";
import path from "node:path";
import { assertExitOk, commandExists, safeSpawn } from "../core/safeSpawn.js";
import { validateRemoteUrl } from "../security/remoteUrlPolicy.js";
import { ToolConfig } from "../core/config.js";

export interface DownloadResult {
  sourceUrl: string;
  mediaPath: string;
  title?: string;
  provider: string;
  stdout: string;
}

export interface DownloaderProvider {
  name: string;
  status(): Promise<{ ok: boolean; detail: string }>;
  download(sourceUrl: string, outputDir: string, config: ToolConfig, approved?: boolean): Promise<DownloadResult>;
}

export class YtDlpDownloader implements DownloaderProvider {
  name = "yt-dlp";
  async status() {
    const ok = await commandExists("yt-dlp");
    return { ok, detail: ok ? "yt-dlp binary found" : "yt-dlp binary missing. Install yt-dlp to enable real YouTube/media download." };
  }
  async download(sourceUrl: string, outputDir: string, config: ToolConfig, approved = false): Promise<DownloadResult> {
    validateRemoteUrl(sourceUrl, { allowRemote: config.allowRemote, allowedHosts: config.allowedRemoteHosts });
    if (!approved) throw new Error("Remote media download requires FORGE permission approval.");
    fs.mkdirSync(outputDir, { recursive: true });
    const template = path.join(outputDir, "%(id)s.%(ext)s");
    const result = assertExitOk(await safeSpawn("yt-dlp", [
      "--no-playlist",
      "--restrict-filenames",
      "--print", "after_move:filepath",
      "-o", template,
      sourceUrl
    ], { timeoutMs: 30 * 60_000, maxOutputBytes: 4_000_000 }), "yt-dlp download");
    const lines = result.stdout.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
    const mediaPath = [...lines].reverse().find(l => fs.existsSync(l)) || lines.at(-1);
    if (!mediaPath || !fs.existsSync(mediaPath)) throw new Error(`yt-dlp did not produce a readable media file. stdout=${result.stdout.slice(-500)}`);
    return { sourceUrl, mediaPath, provider: this.name, stdout: result.stdout };
  }
}
