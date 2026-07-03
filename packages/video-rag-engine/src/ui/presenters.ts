import { Answer, TimelineSegment } from "../core/types.js";
import { secondsToTimestamp } from "../core/utils.js";

export interface UiCard { title: string; subtitle: string; body: string; severity?: "info" | "warning" | "success"; }

export function answerToCards(answer: Answer): UiCard[] {
  const cards: UiCard[] = [{ title: `Answer: ${answer.status}`, subtitle: `Confidence ${Math.round(answer.confidence*100)}%`, body: answer.answer, severity: answer.status === "supported" ? "success" : answer.status === "partial" ? "warning" : "info" }];
  for (const c of answer.citations) cards.push({ title: `${c.modality} citation`, subtitle: `${secondsToTimestamp(c.startSec)}-${secondsToTimestamp(c.endSec)}`, body: c.excerpt, severity: "info" });
  return cards;
}

export function timelineToCards(timeline: TimelineSegment[]): UiCard[] {
  return timeline.slice(0, 50).map(s => ({ title: s.title, subtitle: `${s.modalities.join(" + ")} · density ${s.density}`, body: s.summary, severity: "info" }));
}
