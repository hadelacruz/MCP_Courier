// Config for the official MCP servers required by func. #4: Filesystem and
// Git (both from github.com/modelcontextprotocol/servers). Both are spawned
// as stdio child processes, same as our own courier server — the client
// doesn't care who wrote the server on the other end of the pipe.
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Sandboxed on purpose: Filesystem's "allowed directories" and Git's
// "repo_path" both point here, so the LLM can never touch anything outside
// this folder. Bootstrapped once with `git init` outside the chatbot, because
// the official git server has no init tool (see README/docs for details).
export const WORKSPACE_DIR = path.join(__dirname, "..", "workspace");

const isWindows = process.platform === "win32";
const quote = (value) => (/\s/.test(value) ? `"${value}"` : value);

// Filesystem: npx is a .cmd shim on Windows, which Node can only spawn via a
// shell — and its array-args-to-command-line quoting has proven unreliable
// with spaces in the path (splits "Octavo Semestre" into two args). So on
// Windows we build and quote the whole command line ourselves and hand it to
// cmd.exe verbatim; on Linux (EC2) npx is a plain executable, args array is fine.
const filesystemServer = isWindows
  ? {
      id: "fs",
      command: `npx.cmd -y @modelcontextprotocol/server-filesystem ${quote(WORKSPACE_DIR)}`,
      shell: true,
    }
  : {
      id: "fs",
      command: "npx",
      args: ["-y", "@modelcontextprotocol/server-filesystem", WORKSPACE_DIR],
    };

// Git: uvx is a real executable on every platform, so it's spawned directly
// (no shell). That also sidesteps cmd.exe treating the "<" in "mcp<2.0" as an
// input-redirection operator, which is what shell:true broke on here before.
const gitServer = {
  id: "git",
  command: "uvx",
  // mcp-server-git currently breaks under mcp>=2.0 (Server.list_tools
  // AttributeError), so it's pinned to run against an older mcp SDK build.
  args: ["--with", "mcp<2.0", "mcp-server-git"],
};

export const officialServers = [filesystemServer, gitServer];
