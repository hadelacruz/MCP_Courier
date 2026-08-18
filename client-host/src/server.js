// Web UI: same mcpManager/chatEngine the CLI uses, wrapped behind a small
// Express API + a static frontend. One shared MCP connection pool for the
// whole process (fine for a single-user course demo); each browser tab gets
// its own conversation via a sessionId kept in localStorage.
import "dotenv/config";
import express from "express";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";
import { createMcpManager } from "./mcpManager.js";
import { createChatEngine } from "./llmClient.js";
import { logInteraction, getLogs, logEvents } from "./logger.js";
import { officialServers, WORKSPACE_DIR } from "./officialServers.js";
import { connectCourier } from "./connectCourier.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIR = path.join(__dirname, "..", "public");
const PORT = process.env.PORT || 3000;

async function main() {
  if (!process.env.LLM_API_KEY || !process.env.LLM_BASE_URL || !process.env.LLM_MODEL) {
    console.error("Falta LLM_API_KEY, LLM_BASE_URL o LLM_MODEL. Copia .env.example a .env y complétalo.");
    process.exit(1);
  }

  const mcpManager = createMcpManager({ onLog: logInteraction });
  const serverStatus = [];

  await connectCourier(mcpManager);
  serverStatus.push({ id: "courier", connected: true });

  for (const server of officialServers) {
    try {
      await mcpManager.connectStdio(server.id, server.command, server.args, { shell: server.shell });
      serverStatus.push({ id: server.id, connected: true });
    } catch (err) {
      serverStatus.push({ id: server.id, connected: false, error: err.message });
      console.error(`No se pudo conectar al servidor MCP "${server.id}": ${err.message}`);
    }
  }

  const chatEngine = createChatEngine({ mcpManager, workspaceDir: WORKSPACE_DIR });

  const app = express();
  app.use(express.json());
  app.use(express.static(PUBLIC_DIR));

  app.get("/api/session", (req, res) => {
    res.json({ sessionId: randomUUID() });
  });

  app.get("/api/tools", async (req, res) => {
    const tools = await mcpManager.getToolDefinitions();
    const byServer = {};
    for (const tool of tools) {
      const [serverId, ...rest] = tool.name.split("__");
      const toolName = rest.join("__");
      const description = tool.description.replace(/^\[.*?\]\s*/, "");
      (byServer[serverId] ??= []).push({ name: toolName, description });
    }
    res.json({ servers: serverStatus, tools: byServer });
  });

  app.get("/api/logs", (req, res) => {
    res.json(getLogs());
  });

  app.get("/api/logs/stream", (req, res) => {
    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    });

    const onLog = (record) => {
      res.write(`data: ${JSON.stringify(record)}\n\n`);
    };
    logEvents.on("log", onLog);

    req.on("close", () => {
      logEvents.off("log", onLog);
    });
  });

  app.post("/api/chat", async (req, res) => {
    const { sessionId, message } = req.body ?? {};
    if (!sessionId || typeof message !== "string" || !message.trim()) {
      return res.status(400).json({ error: "Falta sessionId o message." });
    }
    try {
      const reply = await chatEngine.chat(sessionId, message);
      res.json({ reply });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  app.listen(PORT, () => {
    console.log(`MCP Courier UI escuchando en http://localhost:${PORT}`);
  });
}

main();
