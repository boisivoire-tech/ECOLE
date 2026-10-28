import { prisma } from "../db.js";
import { generateCsrfToken, verifyCsrfToken } from "../utils/crypto.js";
import { logError } from "../utils/logger.js";

/**
 * Attribue un jeton CSRF à toute session et vérifie l'en-tête X-CSRF-Token
 * sur les requêtes qui modifient l'état (POST, PUT, PATCH, DELETE).
 */
export function csrfProtection(req, res, next) {
  if (!req.session) {
    return res.status(500).json({ error: "Session indisponible." });
  }

  if (!req.session.csrfToken) {
    req.session.csrfToken = generateCsrfToken();
  }

  const safeMethods = ["GET", "HEAD", "OPTIONS"];
  if (safeMethods.includes(req.method)) {
    return next();
  }

  const provided = req.headers["x-csrf-token"];
  if (!verifyCsrfToken(provided, req.session.csrfToken)) {
    return res.status(403).json({
      error: "Jeton de sécurité expiré ou invalide. Veuillez actualiser la page et réessayer.",
    });
  }

  return next();
}

/**
 * Vérifie que l'utilisateur est authentifié et que son compte est toujours actif.
 */
export async function requireAuth(req, res, next) {
  try {
    const userId = req.session?.userId;
    if (!userId) {
      return res.status(401).json({ error: "Veuillez vous connecter pour accéder à cet espace." });
    }

    const user = await prisma.user.findUnique({
      where: { id: Number(userId) },
      select: {
        id: true,
        role: true,
        email: true,
        firstName: true,
        lastName: true,
        isActive: true,
        teacherProfile: { select: { id: true, specialty: true } },
        parentProfile: { select: { id: true } },
      },
    });

    if (!user || !user.isActive) {
      req.session.destroy(() => {});
      return res.status(401).json({
        error: "Votre session n'est plus valide ou votre compte a été désactivé.",
      });
    }

    req.currentUser = user;
    return next();
  } catch (err) {
    logError("VerificationAuthentification", err);
    return res.status(500).json({ error: "Erreur interne lors de la vérification de la session." });
  }
}

/**
 * Restreint l'accès aux rôles explicitement autorisés.
 */
export function requireRole(...allowedRoles) {
  return (req, res, next) => {
    if (!req.currentUser || !allowedRoles.includes(req.currentUser.role)) {
      return res.status(403).json({
        error: "Accès refusé : vous ne disposez pas des droits nécessaires pour cette action.",
      });
    }
    return next();
  };
}
