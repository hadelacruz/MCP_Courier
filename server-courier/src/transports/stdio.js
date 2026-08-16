// stdio transport: newline-delimited JSON over stdin/stdout.
// This is the transport used when the host spawns this server as a local child process.
import readline from "node:readline";

export function startStdioTransport({ onMessage }) {
  const rl = readline.createInterface({ input: process.stdin, terminal: false });

  rl.on("line", (line) => {
    const trimmed = line.trim();
    if (!trimmed) return;
    onMessage(trimmed);
  });

  return {
    send(message) {
      process.stdout.write(JSON.stringify(message) + "\n");
    },
  };
}
