// Manual JSON-RPC 2.0 message construction/parsing, client side.
// Mirrors server-courier/src/jsonrpc.js — kept as a separate copy on purpose:
// this project and server-courier are independently deployable (this one runs
// wherever the host runs; the other ships to EC2), so they don't share a module.

export const JSONRPC_VERSION = "2.0";

export function makeRequest(id, method, params) {
  const msg = { jsonrpc: JSONRPC_VERSION, id, method };
  if (params !== undefined) msg.params = params;
  return msg;
}

export function makeNotification(method, params) {
  const msg = { jsonrpc: JSONRPC_VERSION, method };
  if (params !== undefined) msg.params = params;
  return msg;
}

export function isResponse(msg) {
  return ("result" in msg || "error" in msg) && "id" in msg;
}
