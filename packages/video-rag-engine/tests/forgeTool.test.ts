import test from "node:test";
import assert from "node:assert/strict";
import { handleForgeToolCall } from "../src/forge/adapter.js";

test("FORGE adapter blocks ingest without approval", async () => {
  await assert.rejects(() => handleForgeToolCall({ action: "ingestVideo", args: { source: { sourceType: "synthetic", uri: "x" } } }), /Permission Gate/);
});
