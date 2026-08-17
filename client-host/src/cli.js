// Console chatbot: connects to the local courier MCP server over stdio,
// then loops reading user input and printing Claude's replies. This is the
// functional baseline (func. #1-3) before the web UI wraps the same engine.
import "dotenv/config";
import readline from "node:readline";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createMcpManager } from "./mcpManager.js";
import { createChatEngine } from "./anthropicClient.js";
import { logInteraction, getLogs } from "./logger.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const COURIER_SERVER_ENTRY = path.join(__dirname, "..", "..", "server-courier", "src", "index.js");

async function main() {
  if (!process.env.ANTHROPIC_API_KEY) {
    console.error("Falta ANTHROPIC_API_KEY. Copia .env.example a .env y coloca tu API key.");
    process.exit(1);
  }

  const mcpManager = createMcpManager({ onLog: logInteraction });
  await mcpManager.connectStdio("courier", process.execPath, [COURIER_SERVER_ENTRY]);

  const chatEngine = createChatEngine({ mcpManager });
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
