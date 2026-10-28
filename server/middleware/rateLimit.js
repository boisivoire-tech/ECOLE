import { hashRateKey } from "../utils/crypto.js";

/**
 * Protection contre les essais répétés, la force brute et le balayage de matricules.
 */
class AttemptTracker {
  constructor({ windowMs, maxAttempts }) {
    this.windowMs = windowMs;
    this.maxAttempts = maxAttempts;
    this.buckets = new Map();

    const timer = setInterval(() => this.cleanup(), 5 * 60 * 1000);
    if (timer.unref) timer.unref();
  }

  cleanup() {
    const now = Date.now();
    for (const [key, entry] of this.buckets.entries()) {
      if (entry.resetAt <= now) {
        this.buckets.delete(key);
      }
    }
  }

  getEntry(rawKey) {
    const key = hashRateKey(rawKey);
    const now = Date.now();
    const existing = this.buckets.get(key);
    if (!existing || existing.resetAt <= now) {
      const fresh = { count: 0, resetAt: now + this.windowMs };
      this.buckets.set(key, fresh);
      return { key, entry: fresh };
    }
    return { key, entry: existing };
  }

  isBlocked(rawKey) {
    const { entry } = this.getEntry(rawKey);
    if (entry.count >= this.maxAttempts) {
      const retryAfterSec = Math.max(1, Math.ceil((entry.resetAt - Date.now()) / 1000));
      return { blocked: true, retryAfterSec };
    }
    return { blocked: false, retryAfterSec: 0 };
  }

  increment(rawKey) {
    const { entry } = this.getEntry(rawKey);
    entry.count += 1;
    return entry.count;
  }

  reset(rawKey) {
    const key = hashRateKey(rawKey);
    this.buckets.delete(key);
  }
}

// Limite globale par adresse IP sur les routes d'authentification (anti-balayage de matricules)
export const ipAuthLimiter = new AttemptTracker({
  windowMs: 15 * 60 * 1000, // 15 minutes
  maxAttempts: 20,
});

// Limite ciblée par couple (IP + identifiant/matricule) contre les essais répétés
export const accountAuthLimiter = new AttemptTracker({
  windowMs: 15 * 60 * 1000, // 15 minutes
  maxAttempts: 6,
});

export function getClientIp(req) {
  return req.ip || req.socket?.remoteAddress || "unknown-ip";
}

export function checkAuthRateLimit(ipKey, accountKey, res) {
  const ipCheck = ipAuthLimiter.isBlocked(`ip:${ipKey}`);
  if (ipCheck.blocked) {
    res.setHeader("Retry-After", String(ipCheck.retryAfterSec));
    res.status(429).json({
      error:
        "Trop de tentatives de connexion depuis votre connexion. Par sécurité, veuillez patienter quelques minutes avant de réessayer.",
    });
    return false;
  }

  if (accountKey) {
    const accCheck = accountAuthLimiter.isBlocked(`acc:${ipKey}:${accountKey}`);
    if (accCheck.blocked) {
      res.setHeader("Retry-After", String(accCheck.retryAfterSec));
      res.status(429).json({
        error:
          "Trop d'essais infructueux. Veuillez patienter 15 minutes ou contacter l'administration de l'établissement.",
      });
      return false;
    }
  }

  return true;
}
