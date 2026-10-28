import crypto from "node:crypto";
import { promisify } from "node:util";

const scryptAsync = promisify(crypto.scrypt);

const SCRYPT_N = 16384;
const SCRYPT_R = 8;
const SCRYPT_P = 1;
const KEY_LENGTH = 64;

// Empreinte factice pré-calculée pour maintenir un temps de réponse constant
// lorsqu'un compte ou un élève n'existe pas (protection anti-énumération).
let cachedDummyHash = null;

/**
 * Hache un mot de passe ou un code à usage unique avec scrypt + sel aléatoire.
 */
export async function hashSecret(plainText) {
  const salt = crypto.randomBytes(16).toString("hex");
  const derivedKey = await scryptAsync(String(plainText), salt, KEY_LENGTH, {
    N: SCRYPT_N,
    r: SCRYPT_R,
    p: SCRYPT_P,
  });
  return `scrypt$${SCRYPT_N}$${SCRYPT_R}$${SCRYPT_P}$${salt}$${derivedKey.toString("hex")}`;
}

/**
 * Vérifie en temps constant un mot de passe ou un code à usage unique.
 */
export async function verifySecret(plainText, storedHash) {
  if (!plainText || !storedHash || typeof storedHash !== "string") {
    return false;
  }
  const parts = storedHash.split("$");
  if (parts.length !== 6 || parts[0] !== "scrypt") {
    return false;
  }
  const [, nStr, rStr, pStr, salt, expectedHex] = parts;
  const N = Number(nStr);
  const r = Number(rStr);
  const p = Number(pStr);
  if (!N || !r || !p || !salt || !expectedHex) {
    return false;
  }

  const expectedBuf = Buffer.from(expectedHex, "hex");
  const derivedBuf = await scryptAsync(String(plainText), salt, expectedBuf.length, {
    N,
    r,
    p,
  });

  if (derivedBuf.length !== expectedBuf.length) {
    return false;
  }
  return crypto.timingSafeEqual(derivedBuf, expectedBuf);
}

/**
 * Exécute un calcul scrypt équivalent afin d'éviter qu'un attaquant ne devine
 * l'existence d'un élève ou d'un compte en mesurant le temps de réponse.
 */
export async function performDummyVerification() {
  if (!cachedDummyHash) {
    cachedDummyHash = await hashSecret("valeur-factice-anti-enumeration-portail-scolaire");
  }
  await verifySecret("tentative-invalide", cachedDummyHash);
}

/**
 * Normalise un code à usage unique saisi (retire tirets et espaces, met en majuscules).
 */
export function normalizeOtpCode(rawCode) {
  return String(rawCode || "")
    .trim()
    .toUpperCase()
    .replace(/[\s-]+/g, "");
}

/**
 * Génère un code à usage unique lisible au format XXXX-XXXX (sans caractères ambigus 0/O/1/I).
 */
export function generateOtpCode() {
  const alphabet = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ";
  let chars = "";
  for (let i = 0; i < 8; i += 1) {
    chars += alphabet[crypto.randomInt(0, alphabet.length)];
  }
  return `${chars.slice(0, 4)}-${chars.slice(4, 8)}`;
}

/**
 * Génère un jeton CSRF aléatoire lié à la session utilisateur.
 */
export function generateCsrfToken() {
  return crypto.randomBytes(32).toString("hex");
}

/**
 * Compare deux jetons CSRF en temps constant.
 */
export function verifyCsrfToken(provided, expected) {
  if (!provided || !expected || typeof provided !== "string" || typeof expected !== "string") {
    return false;
  }
  const bufA = Buffer.from(provided, "utf8");
  const bufB = Buffer.from(expected, "utf8");
  if (bufA.length !== bufB.length) {
    return false;
  }
  return crypto.timingSafeEqual(bufA, bufB);
}

/**
 * Hache un identifiant pour les compteurs de limitation de débit (sans garder la donnée brute).
 */
export function hashRateKey(value) {
  return crypto
    .createHash("sha256")
    .update(String(value || "").trim().toLowerCase())
    .digest("hex");
}
