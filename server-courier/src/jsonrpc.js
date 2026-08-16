// Manual JSON-RPC 2.0 message construction/parsing.
// No MCP SDK involved — this is the whole wire-format layer for the protocol.

export const JSONRPC_VERSION = "2.0";

export const ErrorCodes = {
  PARSE_ERROR: -32700,
  INVALID_REQUEST: -32600,
  METHOD_NOT_FOUND: -32601,
  INVALID_PARAMS: -32602,
  INTERNAL_ERROR: -32603,
};

export function parseMessage(raw) {
  let msg;
  try {
    msg = JSON.parse(raw);
  } catch {
    throw new JsonRpcError(ErrorCodes.PARSE_ERROR, "Invalid JSON was received");
  }
  if (msg === null || typeof msg !== "object" || Array.isArray(msg)) {
    throw new JsonRpcError(ErrorCodes.INVALID_REQUEST, "Message must be a JSON object");
  }
  if (msg.jsonrpc !== JSONRPC_VERSION) {
    throw new JsonRpcError(ErrorCodes.INVALID_REQUEST, 'Missing or invalid "jsonrpc" version');
  }
  return msg;
}

export function isRequest(msg) {
  return typeof msg.method === "string" && ("id" in msg) && msg.id !== null;
}

export function isNotification(msg) {
  return typeof msg.method === "string" && !("id" in msg);
}

export function isResponse(msg) {
  return ("result" in msg || "error" in msg) && ("id" in msg);
}

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

export function makeResult(id, result) {
  return { jsonrpc: JSONRPC_VERSION, id, result };
}

export function makeError(id, code, message, data) {
  const error = { code, message };
  if (data !== undefined) error.data = data;
  return { jsonrpc: JSONRPC_VERSION, id, error };
}

export class JsonRpcError extends Error {
  constructor(code, message, data) {
    super(message);
    this.code = code;
    this.data = data;
  }
}
