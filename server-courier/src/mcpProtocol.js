// Manual MCP message handling on top of jsonrpc.js: the initialize handshake,
// tools/list and tools/call. Transport-agnostic — stdio.js and (later) http.js
// just feed raw text in and get JSON-RPC message objects back out.
import {
  parseMessage,
  isRequest,
  isNotification,
  makeResult,
  makeError,
  ErrorCodes,
  JsonRpcError,
} from "./jsonrpc.js";

const PROTOCOL_VERSION = "2025-11-25";

export function createMcpServer({ name, version, tools }) {
  const toolsByName = new Map(tools.map((t) => [t.name, t]));

  async function handleRequest(msg) {
    const { id, method, params } = msg;

    switch (method) {
      case "initialize":
        return makeResult(id, {
          protocolVersion: PROTOCOL_VERSION,
          capabilities: { tools: {} },
          serverInfo: { name, version },
        });

      case "ping":
        return makeResult(id, {});

      case "tools/list":
        return makeResult(id, {
          tools: tools.map((t) => ({
            name: t.name,
            description: t.description,
            inputSchema: t.inputSchema,
          })),
        });

      case "tools/call": {
        const toolName = params?.name;
        const tool = toolsByName.get(toolName);
        if (!tool) {
          return makeError(id, ErrorCodes.METHOD_NOT_FOUND, `Unknown tool: ${toolName}`);
        }
        try {
          const result = await tool.handler(params?.arguments ?? {});
          return makeResult(id, {
            content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
            isError: false,
          });
        } catch (err) {
          return makeResult(id, {
            content: [{ type: "text", text: `Error: ${err.message}` }],
            isError: true,
          });
        }
      }

      default:
        return makeError(id, ErrorCodes.METHOD_NOT_FOUND, `Unknown method: ${method}`);
    }
  }

  function handleNotification(msg) {
    // "notifications/initialized" and friends: nothing to reply, just acknowledged.
    return { method: msg.method };
  }

  async function handleRaw(raw, { onLog } = {}) {
    let msg;
    try {
      msg = parseMessage(raw);
    } catch (err) {
      if (err instanceof JsonRpcError) {
        return makeError(null, err.code, err.message);
      }
      return makeError(null, ErrorCodes.PARSE_ERROR, "Invalid JSON was received");
    }

    onLog?.({ direction: "in", message: msg });

    if (isRequest(msg)) {
      const response = await handleRequest(msg);
      onLog?.({ direction: "out", message: response });
      return response;
    }

    if (isNotification(msg)) {
      handleNotification(msg);
      return null; // notifications get no response
    }

    return makeError(null, ErrorCodes.INVALID_REQUEST, "Message is neither a request nor a notification");
  }

  return { handleRaw };
}
