// Streamable-HTTP-style transport (MCP spec 2025-11-25), hand-rolled on
// Node's built-in http module — no framework, same spirit as stdio.js.
//
// Single endpoint: POST /mcp with one JSON-RPC message per request body.
//   - Request  -> 200 + JSON-RPC response body
//   - Notification -> 202, empty body (no JSON-RPC response expected)
// A session id is minted on "initialize" and returned via the Mcp-Session-Id
// response header; the client is expected to echo it back on every
// subsequent call, same as the real spec (useful to point at in Wireshark).
import http from "node:http";
import { randomUUID } from "node:crypto";

export function startHttpTransport({ mcpServer, port, onLog }) {
  const sessions = new Set();

  const server = http.createServer((req, res) => {
    if (req.method !== "POST" || req.url !== "/mcp") {
      res.writeHead(404, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Not found. POST JSON-RPC messages to /mcp." }));
      return;
    }

    let body = "";
    req.on("data", (chunk) => {
      body += chunk;
    });

    req.on("end", async () => {
      let parsed;
      try {
        parsed = JSON.parse(body);
      } catch {
        parsed = null;
      }

      const incomingSessionId = req.headers["mcp-session-id"];
      if (parsed?.method !== "initialize" && incomingSessionId && !sessions.has(incomingSessionId)) {
        res.writeHead(404, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "Unknown or expired Mcp-Session-Id" }));
        return;
      }

      const response = await mcpServer.handleRaw(body, { onLog });

      let sessionId = incomingSessionId;
      if (parsed?.method === "initialize" && response) {
        sessionId = randomUUID();
        sessions.add(sessionId);
      }

      if (!response) {
        // It was a notification (e.g. notifications/initialized) — no JSON-RPC reply.
        res.writeHead(202, sessionId ? { "Mcp-Session-Id": sessionId } : {});
        res.end();
        return;
      }

      const headers = { "Content-Type": "application/json" };
      if (sessionId) headers["Mcp-Session-Id"] = sessionId;
      res.writeHead(200, headers);
      res.end(JSON.stringify(response));
    });
  });

  server.listen(port, () => {
    console.error(`[mcp-courier-server] HTTP transport listening on 0.0.0.0:${port}/mcp`);
  });

  return server;
}
