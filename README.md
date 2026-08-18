# MCP Courier

A console/web chatbot host that talks to multiple **Model Context Protocol (MCP)**
servers — built for CC3067 Redes (Universidad del Valle de Guatemala), Project 1.

The chatbot acts as an import courier assistant for a US → Guatemala shipping
business: it quotes import costs, checks product restrictions, registers and
tracks packages, and can also manage files and a Git repository through the
official MCP Filesystem and Git servers.

The entire MCP wire protocol (JSON-RPC 2.0 framing, the `initialize` handshake,
`tools/list`, `tools/call`) is implemented by hand in this repo — no MCP SDK is
used anywhere, on either the client or the server side, per the assignment's
constraints. LLM SDKs (the OpenAI-compatible client) are used only to talk to
the language model itself, which is a separate concern from the MCP protocol.

## Architecture

```
                              Host (client-host)
   ┌───────────────────────────────────────────────────────────────┐
   │  llmClient.js  <──tool-use loop──>  OpenAI-compatible LLM API  │
   │       │                                                        │
   │  mcpManager.js  (aggregates tools from every connected server) │
   │       │                                                        │
   │  ┌────┴────┬─────────────┬─────────────┐                       │
   │  courier   │  fs         │  git        │  (mcpClient.js)       │
   └──┼─────────┼─────────────┼─────────────┼───────────────────────┘
      │ stdio or│ stdio       │ stdio       │
      │ HTTP    │ (npx)       │ (uvx)       │
      ▼         ▼             ▼
 ┌──────────┐ ┌───────────────────────┐ ┌───────────────────────┐
 │ server-  │ │ @modelcontextprotocol │ │ mcp-server-git         │
 │ courier  │ │ /server-filesystem    │ │ (official, Anthropic)  │
 │ (custom, │ │ (official, Anthropic) │ │                        │
 │ this repo)│ └───────────────────────┘ └───────────────────────┘
 └──────────┘
   local (stdio) or remote on EC2 (HTTP)
```

- **Host**: `client-host` — owns the conversation, calls the LLM, and decides
  when to invoke MCP tools. Two front ends share the same engine: a console
  REPL (`cli.js`) and a web UI (`server.js` + `public/`).
- **Clients**: one per connected MCP server, created by `mcpManager.js` /
  `mcpClient.js`. Transport-agnostic — the same client code talks to a local
  child process over stdio or to a remote server over HTTP.
- **Servers**: `server-courier` (this project's own server) plus the official
  Filesystem and Git servers from `github.com/modelcontextprotocol/servers`.

## Features implemented

| # | Feature | Where |
|---|---|---|
| 1 | LLM API connection (general questions) | `client-host/src/llmClient.js` |
| 2 | Multi-turn context per session | `client-host/src/sessionManager.js` |
| 3 | Live log of every MCP request/response | `client-host/src/logger.js` (console + web log panel) |
| 4 | Official Filesystem + Git MCP servers | `client-host/src/officialServers.js` |
| 5 | Custom local MCP server (courier use case) | `server-courier/` |
| 6 | Same server deployed remotely (EC2, HTTP transport) | `server-courier/src/transports/http.js` |
| — | Web UI (extra credit) | `client-host/public/` |

## Repository structure

```
MCP_Courier/
  server-courier/           # the custom MCP server (courier use case)
    src/
      jsonrpc.js             # manual JSON-RPC 2.0 message framing
      mcpProtocol.js          # initialize / tools-list / tools-call handling
      transports/
        stdio.js               # local child-process transport
        http.js                 # remote transport (used on EC2)
      tools/                  # the 6 courier tools
      db/                     # seed data (data.json) + runtime state (state.json, gitignored)
      index.js
  client-host/               # the host + MCP client(s)
    src/
      jsonrpc.js
      mcpClient.js             # stdio + HTTP transports, request/response matching
      mcpManager.js            # connects multiple servers, aggregates their tools
      connectCourier.js        # picks local vs. remote courier based on env
      officialServers.js       # config for the Filesystem/Git official servers
      llmClient.js             # tool-use loop against the LLM
      sessionManager.js        # per-session conversation history
      logger.js                # MCP interaction log (+ live event stream)
      cli.js                   # console chatbot entry point
      server.js                # web UI backend (Express)
    public/                   # web UI frontend (static HTML/CSS/JS)
  .gitignore
  README.md
```

## Prerequisites

- **Node.js 18+** (both for `server-courier` and `client-host`)
- **npx** (ships with npm) — used to run the official Filesystem server
- **Python 3 + [uv](https://docs.astral.sh/uv/)** (`uvx`) — used to run the
  official Git server
- An API key for an LLM with tool-calling support, and its base URL if it's
  not Anthropic itself (this project currently points at an
  OpenAI-compatible gateway — see `.env.example`)

## Installation

```bash
git clone <this-repo-url>
cd MCP_Courier

# server-courier has zero dependencies (Node built-ins only)
cd server-courier
npm install

cd ../client-host
npm install
cp .env.example .env
```

Edit `client-host/.env`:

| Variable | Required | Purpose |
|---|---|---|
| `LLM_API_KEY` | yes | API key for the LLM provider |
| `LLM_BASE_URL` | yes | Base URL of an OpenAI-compatible chat completions API |
| `LLM_MODEL` | yes | Model id (must support function/tool calling) |
| `MCP_WORKSPACE_DIR` | no | Absolute path to an existing, already `git init`-ed repo for the Filesystem/Git servers to operate on. Defaults to `client-host/workspace` if unset. |
| `MCP_COURIER_REMOTE_URL` | no | URL of a remote `server-courier` (e.g. `http://EC2_IP:8080/mcp`). If set, the courier server is used over HTTP instead of being spawned locally. Leave unset to use the local server. |

If you're using `MCP_WORKSPACE_DIR` (or the default `client-host/workspace`),
that folder must already be an initialized git repo with a git identity
configured, **before** you use it through the chatbot:

```bash
mkdir -p client-host/workspace
cd client-host/workspace
git init
git config user.name "Your Name"
git config user.email "you@example.com"
```

This is required because the official `mcp-server-git` has no `git init`
tool — see [Known limitations](#known-limitations).

## Usage

### Console chatbot

```bash
cd client-host
npm start
```

Commands inside the REPL: type your question normally; `log` prints the full
JSON-RPC interaction log so far; `salir` exits.

### Web UI

```bash
cd client-host
npm run web
```

Open `http://localhost:3000`. The page shows the chat, the list of connected
MCP servers with their tool counts, and a live-updating log of every MCP
request/response (via Server-Sent Events).

### Switching the courier server between local and remote

- **Local** (default): leave `MCP_COURIER_REMOTE_URL` unset in `.env`. The
  host spawns `server-courier/src/index.js` as a child process over stdio,
  same as it spawns the Filesystem/Git servers.
- **Remote**: set `MCP_COURIER_REMOTE_URL=http://<host>:<port>/mcp` in `.env`.
  The host connects to that URL over HTTP instead. No other code changes —
  `client-host` uses the exact same `mcpManager`/tool-use loop either way.

### Example prompts

- "¿Puedo importar perfumes?"
- "Compré unos audífonos de $60 en Amazon, pesan 1 libra, categoría electrónica. ¿Cuánto me sale traerlos?"
- "Registra un paquete de Ana López: una laptop de $800, 5 libras, electrónica." → then "¿y en qué estado va?"
- "Crea un archivo reporte.md con un resumen de mis paquetes, agrégalo al repo y haz commit."

## `server-courier` tool specification

All tools are exposed via standard MCP `tools/list` / `tools/call`. Full
JSON Schemas live in `server-courier/src/tools/*.js`; summary:

| Tool | Parameters | Returns |
|---|---|---|
| `consultar_restricciones` | `categoria: string` | `{ categoria, estado: "permitido"\|"restringido"\|"prohibido", requisitos }` |
| `calcular_dai` | `valorDeclarado: number, categoria: string` | `{ arancelPct, dai, ivaPct, iva, totalImpuestos }` |
| `cotizar_importacion` | `valorDeclarado: number, pesoLb: number, categoria: string` | Full cost breakdown: `flete`, `manejo`, `dai`, `iva`, `totalAPagarEnGuatemala`, `tiempoEstimado` |
| `registrar_paquete` | `cliente, descripcion, pesoLb, valorDeclarado, categoria` | Created package record with a generated `guia` (tracking number) |
| `rastrear` | `guia: string` | Package status + event history |
| `listar_sucursales` | `departamento?: string` | List of delivery branches, optionally filtered |

Data (tariffs, restrictions, branches) is seeded from `server-courier/src/db/data.json`
(illustrative data for the assignment, not official government figures).
Registered packages are persisted to `server-courier/src/db/state.json`
(gitignored — regenerated from the seed on first run).

### Transports

- **stdio**: newline-delimited JSON-RPC over the child process's stdin/stdout.
  `npm start` in `server-courier`.
- **HTTP**: single endpoint `POST /mcp`, one JSON-RPC message per request. A
  session id is minted on `initialize` and returned via the `Mcp-Session-Id`
  response header; subsequent requests are expected to echo it back.
  `MCP_TRANSPORT=http MCP_HTTP_PORT=8080 npm start` (or `npm run start:http`
  for the default port 8787).

## Remote deployment (EC2)

The same `server-courier` code runs unmodified on the EC2 instance, just with
`MCP_TRANSPORT=http`, kept alive with `pm2` + `systemd` so it survives SSH
disconnects and instance reboots.

```bash
# on the EC2 instance, inside server-courier/
npm install
sudo npm install -g pm2
MCP_TRANSPORT=http MCP_HTTP_PORT=8080 pm2 start src/index.js --name mcp-courier
pm2 save
pm2 startup   # run the sudo command it prints, once
```

To redeploy after pushing new commits:

```bash
ssh -i <your-key>.pem ubuntu@<EC2_PUBLIC_IP>
cd MCP_Courier && git pull
pm2 restart mcp-courier
```

**Note on stopping/starting the instance**: pm2 auto-restarts the server on
boot (no manual step needed), but unless an Elastic IP is attached, the
instance's public IP changes every time it's stopped and started — update
`MCP_COURIER_REMOTE_URL` in `client-host/.env` accordingly.

The EC2 Security Group must allow inbound TCP on the chosen port (8080 in
this deployment) from whichever IP(s) need to reach it.

## Known limitations

- **The official `mcp-server-git` has no `git init` tool.** Every one of its
  tools (`git_status`, `git_add`, `git_commit`, ...) assumes the target
  `repo_path` is already a git repository — confirmed by reading the source
  across multiple published versions. The workaround: any workspace used
  with the Git server must be `git init`-ed once, outside the chatbot, before
  first use (see [Installation](#installation)).
- **`mcp-server-git` pinning**: the latest `mcp-server-git` release breaks
  against `mcp>=2.0` (`AttributeError: 'Server' object has no attribute
  'list_tools'`). It's run via `uvx --with "mcp<2.0" mcp-server-git` to pin a
  compatible SDK version — see `client-host/src/officialServers.js`.
- **The HTTP transport is a deliberately simplified subset** of the MCP
  Streamable HTTP spec: request/response only, no server-initiated SSE push
  (not needed, since none of this project's tools require server-initiated
  messages), but it does implement session-id issuance/validation.
- **Git server sandboxing is a convention, not an enforced boundary.** The
  Filesystem server hard-restricts itself to its configured "allowed
  directory". The Git server does not — `repo_path` is just an argument the
  LLM supplies each call, kept pointed at the intended workspace only via the
  system prompt in `llmClient.js`.

## Adding the local server to Claude Desktop

The `server-courier` stdio transport speaks plain, spec-conformant MCP over
stdio, so it can be added to Claude Desktop like any other local server. In
`claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "mcp-courier": {
      "command": "node",
      "args": ["/absolute/path/to/MCP_Courier/server-courier/src/index.js"]
    }
  }
}
```

Restart Claude Desktop and the six courier tools should appear. The remote
HTTP deployment is not guaranteed to work with Claude Desktop/Claude.ai's
remote-connector feature as-is, since that expects full compliance with the
Streamable HTTP spec (this project's HTTP transport implements a simplified
subset sufficient for `client-host` — see [Known limitations](#known-limitations)).
