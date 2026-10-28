import { createApp } from "./app.js";
import { prisma } from "./db.js";
import { logInfo } from "./utils/logger.js";

const port = Number(process.env.PORT || process.env.API_PORT || 3001);
const host =
  process.env.API_HOST ||
  (process.env.NODE_ENV === "production" ? "0.0.0.0" : "127.0.0.1");

const app = createApp();

const server = app.listen(port, host, () => {
  logInfo(`Serveur Portail scolaire actif sur http://localhost:${port}`);
});

async function gracefulShutdown() {
  server.close(async () => {
    await prisma.$disconnect();
    process.exit(0);
  });
}

process.on("SIGINT", gracefulShutdown);
process.on("SIGTERM", gracefulShutdown);
