import session from "express-session";
import { prisma } from "../db.js";
import { logError } from "./logger.js";

const DEFAULT_TTL_MS = 8 * 60 * 60 * 1000; // 8 heures par défaut

export class PrismaSessionStore extends session.Store {
  constructor({ ttlMs = DEFAULT_TTL_MS } = {}) {
    super();
    this.ttlMs = ttlMs;

    // Nettoyage automatique des sessions expirées toutes les 30 minutes
    this.cleanupTimer = setInterval(() => {
      this.pruneExpired().catch((err) => logError("NettoyageSessions", err));
    }, 30 * 60 * 1000);
    if (this.cleanupTimer.unref) {
      this.cleanupTimer.unref();
    }
  }

  computeExpiresAt(sess) {
    if (sess?.cookie?.expires) {
      return new Date(sess.cookie.expires);
    }
    if (sess?.cookie?.maxAge) {
      return new Date(Date.now() + Number(sess.cookie.maxAge));
    }
    return new Date(Date.now() + this.ttlMs);
  }

  async pruneExpired() {
    await prisma.session.deleteMany({
      where: { expiresAt: { lt: new Date() } },
    });
  }

  get(sid, callback) {
    prisma.session
      .findUnique({ where: { sid } })
      .then((record) => {
        if (!record) return callback(null, null);
        if (record.expiresAt.getTime() <= Date.now()) {
          return this.destroy(sid, () => callback(null, null));
        }
        const parsed = JSON.parse(record.data);
        return callback(null, parsed);
      })
      .catch((err) => {
        logError("LectureSession", err);
        callback(err);
      });
  }

  set(sid, sess, callback) {
    const expiresAt = this.computeExpiresAt(sess);
    const data = JSON.stringify(sess);
    prisma.session
      .upsert({
        where: { sid },
        create: { sid, data, expiresAt },
        update: { data, expiresAt },
      })
      .then(() => callback && callback(null))
      .catch((err) => {
        logError("EcritureSession", err);
        if (callback) callback(err);
      });
  }

  touch(sid, sess, callback) {
    const expiresAt = this.computeExpiresAt(sess);
    prisma.session
      .updateMany({
        where: { sid },
        data: { expiresAt },
      })
      .then(() => callback && callback(null))
      .catch((err) => {
        logError("ProlongationSession", err);
        if (callback) callback(err);
      });
  }

  destroy(sid, callback) {
    prisma.session
      .deleteMany({ where: { sid } })
      .then(() => callback && callback(null))
      .catch((err) => {
        logError("SuppressionSession", err);
        if (callback) callback(err);
      });
  }
}
