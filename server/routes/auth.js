import express from "express";
import { prisma } from "../db.js";
import {
  generateCsrfToken,
  hashSecret,
  normalizeOtpCode,
  performDummyVerification,
  verifySecret,
} from "../utils/crypto.js";
import {
  AppError,
  formatDateIso,
  normalizeMatricule,
  normalizeNameComparison,
  normalizeText,
  parseIsoDate,
  validateEmail,
  validatePassword,
} from "../utils/validation.js";
import { requireAuth, requireRole } from "../middleware/auth.js";
import {
  accountAuthLimiter,
  checkAuthRateLimit,
  getClientIp,
  ipAuthLimiter,
} from "../middleware/rateLimit.js";
import { logError, logInfo } from "../utils/logger.js";

const router = express.Router();

const NEUTRAL_PARENT_AUTH_ERROR =
  "Vérification refusée : vérifiez les informations saisies, assurez-vous que votre compte parent est associé à l'élève par l'établissement et utilisez un code à usage unique valide.";

async function getSchoolName() {
  const settings = await prisma.schoolSettings.findUnique({ where: { id: 1 } });
  return settings?.schoolName || "Portail scolaire";
}

function regenerateSession(req) {
  return new Promise((resolve, reject) => {
    req.session.regenerate((err) => {
      if (err) return reject(err);
      resolve();
    });
  });
}

function saveSession(req) {
  return new Promise((resolve, reject) => {
    req.session.save((err) => {
      if (err) return reject(err);
      resolve();
    });
  });
}

/**
 * GET /api/auth/session
 * Renvoie l'état courant de la session, le nom de l'établissement et le jeton CSRF.
 */
router.get("/session", async (req, res) => {
  try {
    if (!req.session.csrfToken) {
      req.session.csrfToken = generateCsrfToken();
    }

    const schoolName = await getSchoolName();
    let userPayload = null;

    if (req.session.userId) {
      const user = await prisma.user.findUnique({
        where: { id: Number(req.session.userId) },
        select: {
          id: true,
          role: true,
          email: true,
          firstName: true,
          lastName: true,
          isActive: true,
        },
      });

      if (user && user.isActive) {
        userPayload = {
          id: user.id,
          role: user.role,
          email: user.email,
          firstName: user.firstName,
          lastName: user.lastName,
        };
      } else {
        delete req.session.userId;
      }
    }

    const hasPendingParentStep2 = Boolean(
      req.session.parentChallenge && req.session.parentChallenge.expiresAt > Date.now()
    );

    await saveSession(req);

    return res.json({
      csrfToken: req.session.csrfToken,
      schoolName,
      user: userPayload,
      pendingParentStep2: hasPendingParentStep2,
    });
  } catch (err) {
    logError("ConsultationSession", err);
    return res.status(500).json({ error: "Impossible de charger la session." });
  }
});

/**
 * POST /api/auth/staff/login
 * Connexion réservée aux Administrateurs et Enseignants (e-mail + mot de passe).
 */
router.post("/staff/login", async (req, res, next) => {
  try {
    const clientIp = getClientIp(req);
    const email = validateEmail(req.body?.email, { required: true });
    const password = String(req.body?.password ?? "");

    if (!password) {
      throw new AppError("Le mot de passe est obligatoire.", 400);
    }

    if (!checkAuthRateLimit(clientIp, `staff:${email}`, res)) {
      return;
    }

    const user = await prisma.user.findUnique({
      where: { email },
      select: {
        id: true,
        role: true,
        email: true,
        passwordHash: true,
        firstName: true,
        lastName: true,
        isActive: true,
      },
    });

    let valid = false;
    if (
      user &&
      user.isActive &&
      (user.role === "ADMIN" || user.role === "TEACHER") &&
      user.passwordHash
    ) {
      valid = await verifySecret(password, user.passwordHash);
    } else {
      await performDummyVerification();
    }

    if (!valid) {
      ipAuthLimiter.increment(`ip:${clientIp}`);
      accountAuthLimiter.increment(`acc:${clientIp}:staff:${email}`);
      return res.status(401).json({
        error: "Identifiants invalides. Vérifiez votre adresse e-mail et votre mot de passe.",
      });
    }

    accountAuthLimiter.reset(`acc:${clientIp}:staff:${email}`);

    await regenerateSession(req);
    req.session.userId = user.id;
    req.session.csrfToken = generateCsrfToken();
    await saveSession(req);

    logInfo(`Ouverture de session personnel (role=${user.role})`);

    return res.json({
      csrfToken: req.session.csrfToken,
      user: {
        id: user.id,
        role: user.role,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
      },
    });
  } catch (err) {
    return next(err);
  }
});

/**
 * POST /api/auth/parent/step1
 * Étape 1 : Matricule de l'élève + Nom de famille + Date de naissance.
 * Ne renvoie JAMAIS les notes ni aucune indication permettant de savoir si un élève existe.
 */
router.post("/parent/step1", async (req, res, next) => {
  try {
    const clientIp = getClientIp(req);
    const matricule = normalizeMatricule(req.body?.matricule);
    const lastName = normalizeText(req.body?.lastName, "Nom de famille", { min: 1, max: 80 });
    const parsedBirth = parseIsoDate(req.body?.birthDate, "Date de naissance");

    if (!checkAuthRateLimit(clientIp, `parent:${matricule}`, res)) {
      return;
    }

    // Recherche interne de l'élève et des comptes parents actifs rattachés par l'administrateur
    const student = await prisma.student.findUnique({
      where: { matricule },
      include: {
        parentLinks: {
          include: {
            parent: {
              include: {
                user: { select: { id: true, isActive: true, role: true } },
              },
            },
          },
        },
      },
    });

    // Calcul cryptographique constant pour empêcher toute mesure temporelle
    await performDummyVerification();

    let isMatch = false;
    let candidateParentIds = [];

    if (student) {
      const dbBirthIso = formatDateIso(student.birthDate);
      const sameLastName =
        normalizeNameComparison(student.lastName) === normalizeNameComparison(lastName);
      const sameBirthDate = dbBirthIso === parsedBirth.iso;

      const activeParents = student.parentLinks
        .filter((link) => link.parent?.user?.isActive && link.parent?.user?.role === "PARENT")
        .map((link) => link.parentId);

      if (sameLastName && sameBirthDate && activeParents.length > 0) {
        isMatch = true;
        candidateParentIds = activeParents;
      }
    }

    if (!isMatch) {
      // On incrémente silencieusement les compteurs pour bloquer le balayage de matricules
      ipAuthLimiter.increment(`ip:${clientIp}`);
      accountAuthLimiter.increment(`acc:${clientIp}:parent:${matricule}`);
    }

    // Défi stocké uniquement côté serveur dans la session (jamais exposé au navigateur)
    req.session.parentChallenge = {
      matched: isMatch,
      studentId: isMatch ? student.id : null,
      candidateParentIds,
      matriculeKey: matricule,
      attempts: 0,
      expiresAt: Date.now() + 10 * 60 * 1000, // Expire dans 10 minutes
    };

    await saveSession(req);

    return res.json({
      step: "OTP_REQUIRED",
      message:
        "Étape 1 enregistrée. Saisissez maintenant le code à usage unique remis ou envoyé par l'établissement.",
    });
  } catch (err) {
    return next(err);
  }
});

/**
 * POST /api/auth/parent/step2
 * Étape 2 : Vérification du code à usage unique (OTP) remis au parent par l'établissement.
 */
router.post("/parent/step2", async (req, res, next) => {
  try {
    const clientIp = getClientIp(req);
    const challenge = req.session.parentChallenge;

    if (!challenge || challenge.expiresAt <= Date.now()) {
      delete req.session.parentChallenge;
      await saveSession(req);
      return res.status(400).json({
        error: "La vérification a expiré. Veuillez recommencer depuis l'étape 1.",
        resetStep: true,
      });
    }

    const accountKey = `parent:${challenge.matriculeKey || "inconnu"}`;
    if (!checkAuthRateLimit(clientIp, accountKey, res)) {
      return;
    }

    const normalizedOtp = normalizeOtpCode(req.body?.otpCode);
    if (normalizedOtp.length < 6 || normalizedOtp.length > 20) {
      throw new AppError("Veuillez saisir le code à usage unique remis par l'établissement.", 400);
    }

    let authenticatedUser = null;
    let matchedOtpId = null;

    if (challenge.matched && Array.isArray(challenge.candidateParentIds) && challenge.candidateParentIds.length > 0) {
      const now = new Date();
      const validOtps = await prisma.parentOtpCode.findMany({
        where: {
          parentId: { in: challenge.candidateParentIds },
          usedAt: null,
          expiresAt: { gt: now },
        },
        include: {
          parent: {
            include: {
              user: {
                select: {
                  id: true,
                  role: true,
                  firstName: true,
                  lastName: true,
                  email: true,
                  isActive: true,
                },
              },
            },
          },
        },
        orderBy: { createdAt: "desc" },
      });

      if (validOtps.length === 0) {
        await performDummyVerification();
      } else {
        for (const otpRecord of validOtps) {
          const ok = await verifySecret(normalizedOtp, otpRecord.codeHash);
          if (ok && otpRecord.parent?.user?.isActive && otpRecord.parent.user.role === "PARENT") {
            // Revérification en temps réel que le lien parent-élève existe toujours
            const activeLink = await prisma.parentStudentLink.findUnique({
              where: {
                parentId_studentId: {
                  parentId: otpRecord.parentId,
                  studentId: challenge.studentId,
                },
              },
            });
            if (activeLink) {
              matchedOtpId = otpRecord.id;
              authenticatedUser = otpRecord.parent.user;
              break;
            }
          }
        }
      }
    } else {
      await performDummyVerification();
    }

    if (!authenticatedUser || !matchedOtpId) {
      challenge.attempts = (challenge.attempts || 0) + 1;
      ipAuthLimiter.increment(`ip:${clientIp}`);
      accountAuthLimiter.increment(`acc:${clientIp}:${accountKey}`);

      const resetStep = challenge.attempts >= 4;
      if (resetStep) {
        delete req.session.parentChallenge;
      }
      await saveSession(req);

      return res.status(401).json({
        error: NEUTRAL_PARENT_AUTH_ERROR,
        resetStep,
      });
    }

    // Consommation atomique du code à usage unique (ne peut servir qu'une seule fois)
    const consumed = await prisma.parentOtpCode.updateMany({
      where: { id: matchedOtpId, usedAt: null },
      data: { usedAt: new Date() },
    });

    if (consumed.count !== 1) {
      return res.status(401).json({
        error: NEUTRAL_PARENT_AUTH_ERROR,
        resetStep: true,
      });
    }

    accountAuthLimiter.reset(`acc:${clientIp}:${accountKey}`);

    await regenerateSession(req);
    req.session.userId = authenticatedUser.id;
    req.session.csrfToken = generateCsrfToken();
    await saveSession(req);

    logInfo("Ouverture de session parent par verification en 2 etapes");

    return res.json({
      csrfToken: req.session.csrfToken,
      user: {
        id: authenticatedUser.id,
        role: authenticatedUser.role,
        email: authenticatedUser.email,
        firstName: authenticatedUser.firstName,
        lastName: authenticatedUser.lastName,
      },
    });
  } catch (err) {
    return next(err);
  }
});

/**
 * POST /api/auth/parent/cancel
 * Permet de revenir à l'étape 1 de connexion parent.
 */
router.post("/parent/cancel", async (req, res, next) => {
  try {
    delete req.session.parentChallenge;
    await saveSession(req);
    return res.json({ ok: true });
  } catch (err) {
    return next(err);
  }
});

/**
 * POST /api/auth/change-password
 * Permet à un enseignant ou un administrateur connecté de modifier son propre mot de passe.
 */
router.post(
  "/change-password",
  requireAuth,
  requireRole("ADMIN", "TEACHER"),
  async (req, res, next) => {
    try {
      const currentPassword = String(req.body?.currentPassword ?? "");
      if (!currentPassword) {
        throw new AppError("Veuillez saisir votre mot de passe actuel.", 400);
      }
      const newPassword = validatePassword(req.body?.newPassword);
      if (currentPassword === newPassword) {
        throw new AppError(
          "Le nouveau mot de passe doit être différent du mot de passe actuel.",
          400
        );
      }

      const userRecord = await prisma.user.findUnique({
        where: { id: req.currentUser.id },
        select: { id: true, passwordHash: true },
      });

      const ok = userRecord?.passwordHash
        ? await verifySecret(currentPassword, userRecord.passwordHash)
        : false;
      if (!ok) {
        return res.status(401).json({
          error: "Le mot de passe actuel saisi est incorrect.",
        });
      }

      const passwordHash = await hashSecret(newPassword);
      await prisma.user.update({
        where: { id: req.currentUser.id },
        data: { passwordHash },
      });

      logInfo("Changement de mot de passe personnel effectue");
      return res.json({ ok: true });
    } catch (err) {
      return next(err);
    }
  }
);

/**
 * POST /api/auth/logout
 * Ferme proprement la session côté serveur et supprime le cookie.
 */
router.post("/logout", (req, res) => {
  req.session.destroy((err) => {
    if (err) {
      logError("DeconnexionSession", err);
      return res.status(500).json({ error: "Erreur lors de la déconnexion." });
    }
    res.clearCookie("portail_scolaire.sid");
    return res.json({ ok: true });
  });
});

export default router;
