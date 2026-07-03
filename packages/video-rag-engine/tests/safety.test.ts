import test from "node:test";
import assert from "node:assert/strict";
import { validateSource } from "../src/core/safety.js";
import { loadConfig } from "../src/core/config.js";

test("blocks private network remote URLs", () => {
  const config = loadConfig({ allowRemote: true, allowedRemoteHosts: ["127.0.0.1"] });
  assert.throws(() => validateSource({ sourceType: "remote", uri: "http://127.0.0.1/admin" }, config), /private/);
});

test("blocks non-allowlisted remote host", () => {
  const config = loadConfig({ allowRemote: true, allowedRemoteHosts: ["youtube.com"] });
  assert.throws(() => validateSource({ sourceType: "remote", uri: "https://evil.example/video.mp4" }, config), /allowlisted/);
});
