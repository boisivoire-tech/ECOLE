import "dotenv/config";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import express from "express";
import session from "express-session";

import { PrismaSessionStore } from "./utils/sessionStore.js";
import { csrfProtection } from "./middleware/auth.js";
import { AppError } from "./utils/validation.js";
import { logError, requestLogger } from "./utils/logger.js";

import authRoutes from "./routes/auth.js";
import parentRoutes from "./routes/parent.js";
import teacherRoutes from "./routes/teacher.js";
import adminRoutes from "./routes/admin.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const distDir = path.resolve(__dirname, "..", "dist");

export function createApp() {
  const sessionSecret = process.env.SESSION_SECRET || "";
  if (
    sessionSecret.length < 32 ||
    sessionSecret.includes("REMPLACER_PAR_UNE_CHAINE")
  ) {
    console.error(
      "[ERREUR SÉCURITÉ] SESSION_SECRET est absent ou trop court dans le fichier .env (minimum 32 caractères aléatoires requis)."
    );
    process.exit(1);
  }

  const isProduction = process.env.NODE_ENV === "production";
  const sessionHours = Math.max(1, Number(process.env.SESSION_DURATION_HOURS) || 8);
  const sessionTtlMs = sessionHours * 60 * 60 * 1000;

  const app = express();
  app.disable("x-powered-by");

  if (isProduction) {
    app.set("trust proxy", 1);
  }

  // En-têtes de sécurité HTTP
  app.use((req, res, next) => {
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Referrer-Policy", "same-origin");
    if (isProduction) {
      res.setHeader("X-Frame-Options", "DENY");
    }
    if (req.path.startsWith("/api")) {
      // Interdit la mise en cache des notes et données personnelles sur un poste partagé
      res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, private");
      res.setHeader("Pragma", "no-cache");
    }
    next();
  });

  app.use(requestLogger);
  app.use(express.json({ limit: "256kb" }));

  // Sessions sécurisées stockées dans PostgreSQL via Prisma
  app.use(
    session({
      name: "portail_scolaire.sid",
      secret: sessionSecret,
      store: new PrismaSessionStore({ ttlMs: sessionTtlMs }),
      resave: false,
      saveUninitialized: false,
      rolling: true,
      cookie: {
        httpOnly: true,
        sameSite: "lax",
        secure: isProduction,
        maxAge: sessionTtlMs,
      },
    })
  );

  // Protection CSRF sur toutes les routes de l'API
  app.use("/api", csrfProtection);

  // Routes de l'API
  app.use("/api/auth", authRoutes);
  app.use("/api/parent", parentRoutes);
  app.use("/api/teacher", teacherRoutes);
  app.use("/api/admin", adminRoutes);

  app.use("/api", (_req, res) => {
    res.status(404).json({ error: "Route API introuvable." });
  });

  // En mode compilé (npm run build + npm start), Express sert aussi l'interface React
  if (fs.existsSync(path.join(distDir, "index.html"))) {
    app.use(express.static(distDir));
    app.get("*", (_req, res) => {
      res.sendFile(path.join(distDir, "index.html"));
    });
  }

  // Gestionnaire centralisé des erreurs (aucune fuite de secret ou de donnée sensible)
  app.use((err, _req, res, _next) => {
    if (err instanceof AppError) {
      return res.status(err.statusCode).json({ error: err.message });
    }

    if (err?.code === "P2002") {
      return res.status(409).json({
        error: "Conflit : un enregistrement identique existe déjà dans la base de données.",
      });
    }

    if (err?.code === "P2025") {
      return res.status(404).json({
        error: "L'élément demandé n'existe plus ou a déjà été supprimé.",
      });
    }

    logError("ErreurServeurAPI", err);
    return res.status(500).json({
      error: "Une erreur interne est survenue. Veuillez réessayer dans un instant.",
    });
  });

  return app;
}
