import { createMcpServer } from "./mcpProtocol.js";
import { startStdioTransport } from "./transports/stdio.js";
import { startHttpTransport } from "./transports/http.js";
import { consultarRestricciones } from "./tools/consultarRestricciones.js";
import { calcularDai } from "./tools/calcularDai.js";
import { cotizarImportacion } from "./tools/cotizarImportacion.js";
import { registrarPaquete } from "./tools/registrarPaquete.js";
import { rastrear } from "./tools/rastrear.js";
import { listarSucursales } from "./tools/listarSucursales.js";

const tools = [
  consultarRestricciones,
  calcularDai,
  cotizarImportacion,
  registrarPaquete,
  rastrear,
  listarSucursales,
];

const server = createMcpServer({
  name: "mcp-courier-server",
  version: "0.1.0",
  tools,
});

const transport = process.env.MCP_TRANSPORT ?? "stdio";

const onLog = ({ direction, message }) =>
  console.error(`[mcp-courier-server] ${direction === "in" ? "<-" : "->"}`, JSON.stringify(message));

if (transport === "stdio") {
  const conn = startStdioTransport({
    onMessage: async (raw) => {
      const response = await server.handleRaw(raw, { onLog });
      if (response) conn.send(response);
    },
  });
} else if (transport === "http") {
  const port = Number(process.env.MCP_HTTP_PORT ?? 8787);
  startHttpTransport({ mcpServer: server, port, onLog });
} else {
  console.error(`Unknown MCP_TRANSPORT "${transport}". Use "stdio" or "http".`);
  process.exit(1);
}
