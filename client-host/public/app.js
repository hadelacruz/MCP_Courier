const messagesEl = document.getElementById("messages");
const emptyStateEl = document.getElementById("empty-state");
const composerEl = document.getElementById("composer");
const inputEl = document.getElementById("input");
const sendBtn = document.getElementById("send-btn");
const serverStatusEl = document.getElementById("server-status");
const serverListEl = document.getElementById("server-list");
const logListEl = document.getElementById("log-list");
const clearLogBtn = document.getElementById("clear-log-btn");

const SESSION_KEY = "mcp-courier-session-id";
const sessionId = localStorage.getItem(SESSION_KEY) ?? crypto.randomUUID();
localStorage.setItem(SESSION_KEY, sessionId);

init();

async function init() {
  await loadTools();
  connectLogStream();
  wireComposer();
}

// ---------- Servers / tools panel ----------

async function loadTools() {
  try {
    const res = await fetch("/api/tools");
    const data = await res.json();
    renderServerStatus(data.servers);
    renderServerList(data.servers, data.tools);
  } catch (err) {
    serverStatusEl.innerHTML = `<li><span class="status-dot offline"></span>Sin conexión al host</li>`;
  }
}

function renderServerStatus(servers) {
  serverStatusEl.innerHTML = servers
    .map(
      (s) =>
        `<li><span class="status-dot ${s.connected ? "" : "offline"}"></span>${escapeHtml(s.id)}</li>`
    )
    .join("");
}

function renderServerList(servers, toolsByServer) {
  serverListEl.innerHTML = servers
    .map((s) => {
      const count = toolsByServer[s.id]?.length ?? 0;
      const statusText = s.connected ? `${count} tools` : "desconectado";
      return `<li><span class="server-id">${escapeHtml(s.id)}</span><span class="server-count">${statusText}</span></li>`;
    })
    .join("");
}

// ---------- Live MCP log (SSE) ----------

function connectLogStream() {
  const source = new EventSource("/api/logs/stream");
  source.onmessage = (event) => {
    const record = JSON.parse(event.data);
    appendLogEntry(record);
  };
  source.onerror = () => {
    // EventSource retries automatically; nothing to do here.
  };
}

function appendLogEntry(record) {
  const empty = logListEl.querySelector(".log-empty");
  if (empty) empty.remove();

  const arrow = record.direction === "out" ? "→" : "←";
  const label =
    record.message?.method ??
    (record.message?.error ? `error: ${record.message.error.message}` : "result");

  const el = document.createElement("div");
  el.className = `log-entry ${record.direction}`;
  el.innerHTML = `
    <span class="arrow">${arrow}</span>
    <span class="log-tag ${escapeHtml(record.serverId)}">${escapeHtml(record.serverId)}</span>
    <span class="label">${escapeHtml(label)}</span>
  `;
  logListEl.appendChild(el);
  logListEl.scrollTop = logListEl.scrollHeight;
}

clearLogBtn.addEventListener("click", () => {
  logListEl.innerHTML = `<p class="log-empty">Vista limpiada. El historial completo sigue disponible en /api/logs.</p>`;
});

// ---------- Chat ----------

function wireComposer() {
  inputEl.addEventListener("input", () => {
    inputEl.style.height = "auto";
    inputEl.style.height = `${Math.min(inputEl.scrollHeight, 140)}px`;
  });

  inputEl.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      composerEl.requestSubmit();
    }
  });

  composerEl.addEventListener("submit", async (e) => {
    e.preventDefault();
    const text = inputEl.value.trim();
    if (!text) return;

    emptyStateEl?.remove();
    appendMessage("user", text);
    inputEl.value = "";
    inputEl.style.height = "auto";
    setSending(true);

    const typingEl = appendTyping();

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId, message: text }),
      });
      const data = await res.json();
      typingEl.remove();

      if (!res.ok) {
        appendMessage("assistant", data.error ?? "Ocurrió un error.", { error: true });
      } else {
        appendMessage("assistant", data.reply);
      }
    } catch (err) {
      typingEl.remove();
      appendMessage("assistant", `Error de conexión: ${err.message}`, { error: true });
    } finally {
      setSending(false);
      inputEl.focus();
    }
  });
}

function setSending(sending) {
  sendBtn.disabled = sending;
  inputEl.disabled = sending;
}

function appendMessage(role, text, { error = false } = {}) {
  const wrapper = document.createElement("div");
  wrapper.className = `message ${role}`;

  const bubble = document.createElement("div");
  bubble.className = `bubble${error ? " error" : ""}`;
  bubble.innerHTML = formatMessage(text);

  const meta = document.createElement("div");
  meta.className = "msg-meta";
  meta.textContent = new Date().toLocaleTimeString("es-GT", { hour: "2-digit", minute: "2-digit" });

  wrapper.appendChild(bubble);
  wrapper.appendChild(meta);
  messagesEl.appendChild(wrapper);
  messagesEl.scrollTop = messagesEl.scrollHeight;
  return wrapper;
}

function appendTyping() {
  const wrapper = document.createElement("div");
  wrapper.className = "message assistant";
  wrapper.innerHTML = `<div class="bubble typing"><span></span><span></span><span></span></div>`;
  messagesEl.appendChild(wrapper);
  messagesEl.scrollTop = messagesEl.scrollHeight;
  return wrapper;
}

// ---------- Minimal, dependency-free markdown-ish formatting ----------
// Handles just what the LLM tends to produce: **bold**, pipe tables, bullet
// lists and blank-line paragraphs. Escapes HTML first, so this is safe even
// though the input is model-generated text.

function formatMessage(raw) {
  const escaped = escapeHtml(raw);
  const blocks = escaped.split(/\n{2,}/);

  return blocks
    .map((block) => {
      const lines = block.split("\n");

      // A heading only ever needs its own line, but the LLM often glues the
      // paragraph that follows it onto the very next line with no blank
      // line in between — so match on the first line, not the whole block.
      const heading = lines[0].match(/^(#{1,6})\s+(.*)/);
      if (heading) {
        const level = Math.min(heading[1].length + 2, 6); // ## -> h4, ### -> h5, keeps chat text-sized
        const headingHtml = `<h${level}>${inlineFormat(heading[2])}</h${level}>`;
        const rest = lines.slice(1);
        if (rest.length === 0) return headingHtml;
        return headingHtml + `<p>${rest.map(inlineFormat).join("<br>")}</p>`;
      }

      if (lines.every((l) => /^\s*\|.*\|\s*$/.test(l)) && lines.length >= 2) {
        return renderTable(lines);
      }

      if (lines.every((l) => /^\s*[-*]\s+/.test(l) || l.trim() === "")) {
        const items = lines
          .filter((l) => l.trim())
          .map((l) => `<li>${inlineFormat(l.replace(/^\s*[-*]\s+/, ""))}</li>`)
          .join("");
        return `<ul>${items}</ul>`;
      }

      return `<p>${lines.map(inlineFormat).join("<br>")}</p>`;
    })
    .join("");
}

function renderTable(lines) {
  const rows = lines
    .map((l) => l.trim().replace(/^\||\|$/g, "").split("|").map((c) => c.trim()))
    .filter((cells) => !cells.every((c) => /^-+$/.test(c)));

  const [header, ...body] = rows;
  const thead = `<tr>${header.map((c) => `<th>${inlineFormat(c)}</th>`).join("")}</tr>`;
  const tbody = body.map((r) => `<tr>${r.map((c) => `<td>${inlineFormat(c)}</td>`).join("")}</tr>`).join("");
  return `<table><thead>${thead}</thead><tbody>${tbody}</tbody></table>`;
}

function inlineFormat(text) {
  return text.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
