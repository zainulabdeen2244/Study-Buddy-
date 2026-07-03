import fs from "node:fs";
import path from "node:path";
import { Answer, TimelineSegment } from "../core/types.js";

export function exportAnswerBundle(outDir: string, answer: Answer, timeline: TimelineSegment[]): string {
  fs.mkdirSync(outDir, { recursive: true });
  const file = path.join(outDir, `answer-bundle-${Date.now()}.json`);
  fs.writeFileSync(file, JSON.stringify({ answer, timeline }, null, 2));
  return file;
}
