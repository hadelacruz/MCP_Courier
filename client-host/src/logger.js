// Central log of every JSON-RPC message exchanged with any MCP server.
// Fed by mcpClient's onLog callback, so what's recorded here is exactly what
// went on the wire (or child-process pipe) — not a reconstruction after the fact.
// Also emits a "log" event on logEvents, which the web UI (server.js) forwards
// to the browser over SSE so the log panel updates live as tool calls happen.
import { EventEmitter } from "node:events";

const logs = [];
const MAX_LOGS = 500;
export const logEvents = new EventEmitter();

export function logInteraction(entry) {
  const record = { timestamp: new Date().toISOString(), ...entry };
  logs.push(record);
  if (logs.length > MAX_LOGS) logs.shift();

  const arrow = record.direction === "out" ? "->" : "<-";
  const label =
    record.message.method ??
    (record.message.error ? `error: ${record.message.error.message}` : "result");
  console.error(`[mcp-log] [${record.serverId}] ${arrow} ${label}`);

  logEvents.emit("log", record);
  return record;
}

export function getLogs() {
  return logs;
}
