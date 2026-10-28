import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "..");

const children = [];

function launch(label, args) {
  const child = spawn(process.execPath, args, {
    cwd: rootDir,
    stdio: "inherit",
    env: process.env,
  });

  child.on("exit", (code, signal) => {
    if (signal) return;
    if (code && code !== 0) {
      console.error(`[${label}] Arrêt inattendu (code ${code}). Fermeture des services...`);
      shutdown(code);
    }
  });

  children.push(child);
  return child;
}

let shuttingDown = false;
function shutdown(exitCode = 0) {
  if (shuttingDown) return;
  shuttingDown = true;
  for (const child of children) {
    if (!child.killed) {
      child.kill("SIGTERM");
    }
  }
  setTimeout(() => process.exit(exitCode), 300);
}

process.on("SIGINT", () => shutdown(0));
process.on("SIGTERM", () => shutdown(0));

console.log("Démarrage du Portail scolaire (Serveur Express + Interface React Vite)...");
launch("Serveur API", ["--watch", path.join("server", "index.js")]);
launch("Interface Vite", [path.join("node_modules", "vite", "bin", "vite.js")]);
