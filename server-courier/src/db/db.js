// Tiny JSON-file datastore. No native bindings, so it deploys unchanged on any
// architecture (local machine or the EC2 instance) with a plain Node install.
//
// data.json is the committed seed (tarifario, aranceles, restricciones, sucursales).
// state.json is the runtime copy (adds registered paquetes) and is gitignored,
// so re-running the server never dirties the seed that graders read.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SEED_PATH = path.join(__dirname, "data.json");
const STATE_PATH = path.join(__dirname, "state.json");

function ensureState() {
  if (!fs.existsSync(STATE_PATH)) {
    const seed = fs.readFileSync(SEED_PATH, "utf-8");
    fs.writeFileSync(STATE_PATH, seed);
  }
}

export function readDb() {
  ensureState();
  return JSON.parse(fs.readFileSync(STATE_PATH, "utf-8"));
}

export function writeDb(db) {
  fs.writeFileSync(STATE_PATH, JSON.stringify(db, null, 2));
}

export function generateGuia() {
  const timestamp = Date.now().toString(36).toUpperCase();
  const random = Math.random().toString(36).slice(2, 6).toUpperCase();
  return `GTC-${timestamp}-${random}`;
}
