// Connects to the courier MCP server: spawned locally over stdio by default,
// or over HTTP against a remote deployment (e.g. the EC2 instance) when
// MCP_COURIER_REMOTE_URL is set. Shared by cli.js and server.js so both entry
// points switch the same way, with no code path divergence between them.
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const COURIER_SERVER_ENTRY = path.join(__dirname, "..", "..", "server-courier", "src", "index.js");

export async function connectCourier(mcpManager) {
  const remoteUrl = process.env.MCP_COURIER_REMOTE_URL;

  if (remoteUrl) {
    await mcpManager.connectHttp("courier", remoteUrl);
    console.log(`Conectado al servidor MCP courier remoto (${remoteUrl}).`);
  } else {
    await mcpManager.connectStdio("courier", process.execPath, [COURIER_SERVER_ENTRY]);
    console.log("Conectado al servidor MCP courier local (stdio).");
  }
}
