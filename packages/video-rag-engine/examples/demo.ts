import { LongVideoRagToolEngine } from "../src/core/engine.js";

const engine = new LongVideoRagToolEngine({ config: { dataDir: ".data/demo-video-rag-ts" } });
await engine.ingest({ sourceType: "synthetic", uri: "demo://100h-course", title: "100H AI Course", collectionId: "demo", durationSec: 3 * 3600 }, { collectionId: "demo", enableOcr: true, enableVision: false });
console.log(await engine.stats("demo"));
console.log(await engine.ask({ collectionId: "demo", question: "What does the video explain about UI actions and important concepts?" }));
