import { id } from "./utils.js";
import { ToolInvocation, ToolResult } from "./types.js";
import { decidePermission } from "./permissions.js";
import { EventCollector } from "./events.js";

export async function runWithForgeContract<T>(invocation: ToolInvocation, fn: (events: EventCollector) => Promise<T>): Promise<ToolResult<T>> {
  const traceId = invocation.traceId || id("trace");
  const events = new EventCollector();
  events.emit("tool.invocation.received", traceId, { action: invocation.action, workspaceId: invocation.workspaceId });
  const decision = decidePermission(invocation);
  events.emit("permission.decision", traceId, decision as unknown as Record<string, unknown>);
  if (!decision.allowed) {
    return { ok: false, action: invocation.action, traceId, error: decision.reason, auditEvents: events.names() };
  }
  try {
    const data = await fn(events);
    events.emit("tool.invocation.succeeded", traceId, { action: invocation.action });
    return { ok: true, action: invocation.action, traceId, data, auditEvents: events.names() };
  } catch (error) {
    events.emit("tool.invocation.failed", traceId, { error: error instanceof Error ? error.message : String(error) });
    return { ok: false, action: invocation.action, traceId, error: error instanceof Error ? error.message : String(error), auditEvents: events.names() };
  }
}
