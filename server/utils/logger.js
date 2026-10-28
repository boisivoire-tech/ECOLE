/**
 * Journalisation minimale et sécurisée.
 * RÈGLE DE SÉCURITÉ : Ne jamais enregistrer de date de naissance, de note,
 * de mot de passe, de code à usage unique ou de secret dans les journaux.
 */

export function logInfo(event) {
  const ts = new Date().toISOString();
  console.log(`[${ts}] INFO ${String(event)}`);
}

export function logError(context, err) {
  const ts = new Date().toISOString();
  // On journalise uniquement le code d'erreur technique (ex. P2002) et le type,
  // jamais les paramètres SQL ni les valeurs saisies par l'utilisateur.
  const code = err && typeof err.code === "string" ? ` (code: ${err.code})` : "";
  const name = err && typeof err.name === "string" ? err.name : "ErreurServeur";
  console.error(`[${ts}] ERREUR ${String(context)} — ${name}${code}`);
}

export function requestLogger(req, res, next) {
  const startedAt = Date.now();
  // On retire toute chaîne de paramètres (?...) pour ne journaliser aucune donnée personnelle
  const cleanPath = (req.originalUrl || req.url || "/").split("?")[0];

  res.on("finish", () => {
    if (cleanPath.startsWith("/api")) {
      const durationMs = Date.now() - startedAt;
      const ts = new Date().toISOString();
      console.log(`[${ts}] HTTP ${req.method} ${cleanPath} -> ${res.statusCode} (${durationMs}ms)`);
    }
  });

  next();
}
