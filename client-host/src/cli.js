// Console chatbot: connects to the courier MCP server (local or remote, see
// connectCourier.js), then loops reading user input and printing the LLM's
// replies. This is the functional baseline (func. #1-3) before the web UI
// wraps the same engine.
import "dotenv/config";
import readline from "node:readline";
import { createMcpManager } from "./mcpManager.js";
import { createChatEngine } from "./llmClient.js";
import { logInteraction, getLogs } from "./logger.js";
import { officialServers, WORKSPACE_DIR } from "./officialServers.js";
import { connectCourier } from "./connectCourier.js";

async function main() {
  if (!process.env.LLM_API_KEY || !process.env.LLM_BASE_URL || !process.env.LLM_MODEL) {
    console.error("Falta LLM_API_KEY, LLM_BASE_URL o LLM_MODEL. Copia .env.example a .env y complétalo.");
    process.exit(1);
  }

  const mcpManager = createMcpManager({ onLog: logInteraction });
  await connectCourier(mcpManager);

  for (const server of officialServers) {
    try {
      await mcpManager.connectStdio(server.id, server.command, server.args, { shell: server.shell });
      console.log(`Conectado a servidor MCP oficial "${server.id}".`);
    } catch (err) {
      console.error(`No se pudo conectar al servidor MCP "${server.id}": ${err.message}`);
    }
  }

  const chatEngine = createChatEngine({ mcpManager, workspaceDir: WORKSPACE_DIR });
  const sessionId = "cli-session";

  console.log("MCP Courier — chatbot de consola.");
  console.log("Comandos: 'log' muestra el log de interacciones MCP, 'salir' termina.\n");

  const rl = readline.createInterface({ input: process.stdin, output: process.stdout, prompt: "tú> " });
  rl.prompt();

  rl.on("line", async (line) => {
    const text = line.trim();
    if (!text) return rl.prompt();

    if (text === "salir") {
      mcpManager.closeAll();
      rl.close();
      return;
    }

    if (text === "log") {
      console.log(JSON.stringify(getLogs(), null, 2));
      rl.prompt();
      return;
    }

    try {
      const reply = await chatEngine.chat(sessionId, text);
      console.log(`\nasistente> ${reply}\n`);
    } catch (err) {
      console.error("Error:", err.message);
    }
    rl.prompt();
  });

  rl.on("close", () => {
    mcpManager.closeAll();
    process.exit(0);
  });
}

main();
