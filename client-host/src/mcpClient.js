// Generic MCP client: handshake + request/response matching, decoupled from
// the transport. StdioTransport is implemented here for local child-process
// servers (Fase 5 adds an HttpTransport with the same {send, onMessage} shape
// so createMcpClient below doesn't need to change).
import { spawn } from "node:child_process";
import readline from "node:readline";
import { makeRequest, makeNotification } from "./jsonrpc.js";

const REQUEST_TIMEOUT_MS = 15000;
let nextId = 1;

export function createStdioTransport({ command, args, cwd, env, shell = false }) {
  const spawnOptions = {
    cwd,
    env: { ...process.env, ...env },
    stdio: ["pipe", "pipe", "pipe"],
    shell,
  };
  // Two call shapes on purpose: with an args array (the normal, safe case),
  // or with `command` as one pre-quoted string and shell:true (needed for
  // Windows .cmd shims like npx.cmd, where Node's own array-to-command-line
  // quoting has proven unreliable with paths that contain spaces).
  const child = args ? spawn(command, args, spawnOptions) : spawn(command, spawnOptions);

  let onMessage = () => {};
  const rl = readline.createInterface({ input: child.stdout, terminal: false });
  rl.on("line", (line) => {
    const trimmed = line.trim();
    if (trimmed) onMessage(trimmed);
  });

  child.stderr.on("data", (chunk) => {
    process.stderr.write(chunk); // server's own [in]/[out] protocol log, useful while debugging
  });

  return {
    onReceive(handler) {
      onMessage = handler;
    },
    send(text) {
      child.stdin.write(text + "\n");
    },
    close() {
      child.stdin.end();
      child.kill();
    },
  };
}

export function createMcpClient({ id, transport, onLog }) {
  const pending = new Map();
  let toolCache = null;

  transport.onReceive((raw) => {
    let msg;
    try {
      msg = JSON.parse(raw);
    } catch {
      return;
    }
    onLog?.({ serverId: id, direction: "in", message: msg });

    if ("id" in msg && msg.id !== null && ("result" in msg || "error" in msg)) {
      const waiter = pending.get(msg.id);
      if (!waiter) return;
      pending.delete(msg.id);
      if ("error" in msg) waiter.reject(new Error(msg.error.message));
      else waiter.resolve(msg.result);
    }
  });

  function request(method, params) {
    const id_ = nextId++;
    const msg = makeRequest(id_, method, params);
    onLog?.({ serverId: id, direction: "out", message: msg });
    transport.send(JSON.stringify(msg));

    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        pending.delete(id_);
        reject(new Error(`Timed out waiting for response to "${method}" (id ${id_})`));
      }, REQUEST_TIMEOUT_MS);

      pending.set(id_, {
        resolve: (result) => {
          clearTimeout(timer);
          resolve(result);
        },
        reject: (err) => {
          clearTimeout(timer);
          reject(err);
        },
      });
    });
  }

  function notify(method, params) {
    const msg = makeNotification(method, params);
    onLog?.({ serverId: id, direction: "out", message: msg });
    transport.send(JSON.stringify(msg));
  }

  async function initialize() {
    await request("initialize", {
      protocolVersion: "2025-11-25",
      capabilities: {},
      clientInfo: { name: "mcp-courier-client-host", version: "0.1.0" },
    });
    notify("notifications/initialized");
  }

  async function listTools() {
    if (!toolCache) {
      const result = await request("tools/list");
      toolCache = result.tools;
    }
    return toolCache;
  }

  async function callTool(name, args) {
    return request("tools/call", { name, arguments: args });
  }

  function close() {
    transport.close();
  }

  return { id, initialize, listTools, callTool, close };
}
