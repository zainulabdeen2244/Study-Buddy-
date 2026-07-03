import { nowIso } from "./utils.js";

export interface ForgeEvent {
  id: string;
  type: string;
  traceId: string;
  at: string;
  payload: Record<string, unknown>;
}

export class EventCollector {
  private events: ForgeEvent[] = [];
  emit(type: string, traceId: string, payload: Record<string, unknown> = {}): void {
    this.events.push({ id: `${Date.now()}-${this.events.length}`, type, traceId, at: nowIso(), payload });
  }
  names(): string[] { return this.events.map(e => e.type); }
  all(): ForgeEvent[] { return [...this.events]; }
}
