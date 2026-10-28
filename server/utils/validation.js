export class AppError extends Error {
  constructor(message, statusCode = 400) {
    super(message);
    this.name = "AppError";
    this.statusCode = statusCode;
  }
}

export function normalizeText(value, fieldLabel, { min = 1, max = 120 } = {}) {
  const cleaned = String(value ?? "")
    .trim()
    .replace(/\s+/g, " ");
  if (cleaned.length < min) {
    throw new AppError(`Le champ « ${fieldLabel} » est obligatoire.`, 400);
  }
  if (cleaned.length > max) {
    throw new AppError(`Le champ « ${fieldLabel} » ne doit pas dépasser ${max} caractères.`, 400);
  }
  return cleaned;
}

export function normalizeOptionalText(value, { max = 500 } = {}) {
  if (value === undefined || value === null) return null;
  const cleaned = String(value).trim().replace(/\s+/g, " ");
  if (!cleaned) return null;
  if (cleaned.length > max) {
    throw new AppError(`Le texte saisi dépasse la limite autorisée (${max} caractères).`, 400);
  }
  return cleaned;
}

/**
 * Normalisation du nom de famille pour comparaison fiable (insensible à la casse et aux accents).
 */
export function normalizeNameComparison(value) {
  return String(value ?? "")
    .trim()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/[\s'’‘-]+/g, " ");
}

export function normalizeMatricule(value) {
  const cleaned = String(value ?? "")
    .trim()
    .toUpperCase()
    .replace(/\s+/g, "");
  if (!/^[A-Z0-9-]{3,30}$/.test(cleaned)) {
    throw new AppError(
      "Le matricule doit contenir entre 3 et 30 caractères (lettres, chiffres ou tirets).",
      400
    );
  }
  return cleaned;
}

export function parsePositiveInt(value, fieldLabel) {
  const num = Number(value);
  if (!Number.isInteger(num) || num <= 0) {
    throw new AppError(`Identifiant invalide pour « ${fieldLabel} ».`, 400);
  }
  return num;
}

export function validateCoefficient(value) {
  const num = Number(value);
  if (!Number.isInteger(num) || num < 1 || num > 20) {
    throw new AppError("Le coefficient doit être un nombre entier compris entre 1 et 20.", 400);
  }
  return num;
}

export function validateGradeValue(value) {
  const normalized = typeof value === "string" ? value.replace(",", ".") : value;
  const num = Number(normalized);
  if (!Number.isFinite(num) || num < 0 || num > 20) {
    throw new AppError("La note doit être un nombre compris entre 0 et 20.", 400);
  }
  return Math.round(num * 100) / 100;
}

export function validateWeight(value) {
  if (value === undefined || value === null || value === "") return 1;
  const normalized = typeof value === "string" ? value.replace(",", ".") : value;
  const num = Number(normalized);
  if (!Number.isFinite(num) || num <= 0 || num > 10) {
    throw new AppError(
      "La pondération de l'évaluation doit être un nombre supérieur à 0 et au maximum 10.",
      400
    );
  }
  return Math.round(num * 100) / 100;
}

export function validateNonNegativeInt(value, fieldLabel, max = 500) {
  const num = Number(value ?? 0);
  if (!Number.isInteger(num) || num < 0 || num > max) {
    throw new AppError(
      `Le champ « ${fieldLabel} » doit être un entier compris entre 0 et ${max}.`,
      400
    );
  }
  return num;
}

export function validateEmail(value, { required = true } = {}) {
  const cleaned = String(value ?? "").trim().toLowerCase();
  if (!cleaned) {
    if (required) {
      throw new AppError("L'adresse e-mail est obligatoire.", 400);
    }
    return null;
  }
  if (cleaned.length > 150 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleaned)) {
    throw new AppError("Le format de l'adresse e-mail est invalide.", 400);
  }
  return cleaned;
}

export function validatePassword(value) {
  const str = String(value ?? "");
  if (str.length < 10) {
    throw new AppError("Le mot de passe doit contenir au moins 10 caractères.", 400);
  }
  if (str.length > 128) {
    throw new AppError("Le mot de passe ne doit pas dépasser 128 caractères.", 400);
  }
  return str;
}

/**
 * Analyse une date au format AAAA-MM-JJ sans décalage de fuseau horaire.
 */
export function parseIsoDate(value, fieldLabel) {
  const str = String(value ?? "").trim();
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(str);
  if (!match) {
    throw new AppError(`Le champ « ${fieldLabel} » doit être au format AAAA-MM-JJ.`, 400);
  }
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);

  if (year < 1920 || year > 2100 || month < 1 || month > 12 || day < 1 || day > 31) {
    throw new AppError(`La date saisie pour « ${fieldLabel} » est invalide.`, 400);
  }

  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    throw new AppError(`La date saisie pour « ${fieldLabel} » n'existe pas dans le calendrier.`, 400);
  }

  return { iso: str, date };
}

/**
 * Formate un objet Date (ou chaîne) en AAAA-MM-JJ (UTC).
 */
export function formatDateIso(dateValue) {
  if (!dateValue) return null;
  if (typeof dateValue === "string" && /^\d{4}-\d{2}-\d{2}$/.test(dateValue)) {
    return dateValue;
  }
  const d = new Date(dateValue);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString().slice(0, 10);
}
