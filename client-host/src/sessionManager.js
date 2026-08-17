// In-memory conversation history per session id, so a session keeps context
// across turns (e.g. "¿en qué fecha nació?" resolving against the previous
// answer). Lives only for the process's lifetime — fine for the CLI and for
// the web UI's single-server-process deployment.
const sessions = new Map();

export function getHistory(sessionId) {
  if (!sessions.has(sessionId)) sessions.set(sessionId, []);
  return sessions.get(sessionId);
}

export function resetSession(sessionId) {
  sessions.set(sessionId, []);
}
