// Connects to multiple MCP servers at once and presents them to the LLM
// tool-use loop as one flat, unambiguous tool list. Tool names are namespaced
// as "<serverId>__<toolName>" so servers with overlapping tool names (e.g. two
// filesystem-like servers) can coexist. Kept in MCP's own shape (name,
// description, inputSchema) — provider-specific conversion (Anthropic,
// OpenAI-compatible, etc.) happens in the LLM client, not here.
import { createStdioTransport, createMcpClient } from "./mcpClient.js";

export function createMcpManager({ onLog } = {}) {
  const clients = new Map();

  async function connectStdio(id, command, args, opts = {}) {
    const transport = createStdioTransport({ command, args, ...opts });
    const client = createMcpClient({ id, transport, onLog });
    await client.initialize();
    clients.set(id, client);
    return client;
  }

  async function getToolDefinitions() {
    const tools = [];
    for (const client of clients.values()) {
      const list = await client.listTools();
      for (const t of list) {
        tools.push({
          name: `${client.id}__${t.name}`,
          description: `[${client.id}] ${t.description}`,
          inputSchema: t.inputSchema,
        });
      }
    }
    return tools;
  }

  async function callTool(qualifiedName, args) {
    const sep = qualifiedName.indexOf("__");
    if (sep === -1) throw new Error(`Malformed tool name: "${qualifiedName}"`);
    const serverId = qualifiedName.slice(0, sep);
    const toolName = qualifiedName.slice(sep + 2);
    const client = clients.get(serverId);
    if (!client) throw new Error(`No connected MCP server with id "${serverId}"`);
    return client.callTool(toolName, args);
  }

  function closeAll() {
    for (const client of clients.values()) client.close();
  }

  return { connectStdio, getToolDefinitions, callTool, closeAll };
}
