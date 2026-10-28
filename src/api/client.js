const SESSION_STORAGE_KEY = "portail_scolaire_session_token";

let csrfToken = null;
let memorySessionToken = readStoredSessionToken();
let inFlightSessionPromise = null;

function readStoredSessionToken() {
  try {
    if (typeof window !== "undefined" && window.sessionStorage) {
      return window.sessionStorage.getItem(SESSION_STORAGE_KEY) || null;
    }
  } catch {
    // Dans un iframe inter-domaine strict, sessionStorage peut être bloqué :
    // on conserve alors le jeton uniquement en mémoire vive JavaScript.
  }
  return null;
}

function writeStoredSessionToken(token) {
  memorySessionToken = token || null;
  try {
    if (typeof window !== "undefined" && window.sessionStorage) {
      if (token) {
        window.sessionStorage.setItem(SESSION_STORAGE_KEY, token);
      } else {
        window.sessionStorage.removeItem(SESSION_STORAGE_KEY);
      }
    }
  } catch {
    // Ignoré si le navigateur restreint sessionStorage en mode navigation privée/iframe
  }
}

export function setCsrfToken(token) {
  if (token) {
    csrfToken = token;
  }
}

export function clearClientSession() {
  csrfToken = null;
  writeStoredSessionToken(null);
}

async function performRawFetch(path, { method = "GET", body } = {}) {
  const upperMethod = method.toUpperCase();
  const headers = {
    Accept: "application/json",
  };

  if (body !== undefined) {
    headers["Content-Type"] = "application/json";
  }

  if (memorySessionToken) {
    headers["X-Session-Token"] = memorySessionToken;
  }

  if (!["GET", "HEAD", "OPTIONS"].includes(upperMethod) && csrfToken) {
    headers["X-CSRF-Token"] = csrfToken;
  }

  const response = await fetch(path, {
    method: upperMethod,
    headers,
    credentials: "include",
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  const returnedSessionHeader = response.headers.get("x-session-token");
  if (returnedSessionHeader === "none") {
    writeStoredSessionToken(null);
  } else if (returnedSessionHeader) {
    writeStoredSessionToken(returnedSessionHeader);
  }

  let payload = null;
  const contentType = response.headers.get("content-type") || "";
  if (contentType.includes("application/json")) {
    payload = await response.json();
  }

  if (payload?.csrfToken) {
    csrfToken = payload.csrfToken;
  }

  return { response, payload };
}

/**
 * Charge l'état de session (/api/auth/session) en dédupliquant les appels concurrents
 * (évite toute désynchronisation CSRF avec le double montage de React.StrictMode).
 */
export function fetchSession() {
  if (!inFlightSessionPromise) {
    inFlightSessionPromise = (async () => {
      try {
        const { response, payload } = await performRawFetch("/api/auth/session");
        if (!response.ok) {
          throw new Error(payload?.error || "Impossible de vérifier la session.");
        }
        return payload;
      } finally {
        inFlightSessionPromise = null;
      }
    })();
  }
  return inFlightSessionPromise;
}

export async function apiRequest(path, { method = "GET", body, _retried = false } = {}) {
  const upperMethod = method.toUpperCase();

  if (path === "/api/auth/session" && upperMethod === "GET") {
    return fetchSession();
  }

  // Si un appel modificateur part avant d'avoir reçu un jeton CSRF, on initialise d'abord la session
  if (!["GET", "HEAD", "OPTIONS"].includes(upperMethod) && !csrfToken) {
    await fetchSession().catch(() => {});
  }

  const { response, payload } = await performRawFetch(path, { method: upperMethod, body });

  // Si la session/jeton CSRF a expiré entre-temps (ex. redémarrage serveur),
  // on rafraîchit la session une seule fois de façon transparente et on relance la requête.
  if (
    !_retried &&
    response.status === 403 &&
    payload?.code === "CSRF_INVALID" &&
    !["GET", "HEAD", "OPTIONS"].includes(upperMethod)
  ) {
    await fetchSession();
    return apiRequest(path, { method: upperMethod, body, _retried: true });
  }

  if (!response.ok) {
    const err = new Error(
      payload?.error || `Erreur lors de la communication avec le serveur (${response.status}).`
    );
    err.status = response.status;
    err.payload = payload;
    throw err;
  }

  return payload;
}

export function formatScore(value) {
  if (value === null || value === undefined || Number.isNaN(Number(value))) {
    return "—";
  }
  return Number(value).toLocaleString("fr-FR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

export function formatDateFr(isoDate) {
  if (!isoDate) return "—";
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(isoDate));
  if (match) {
    const d = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
    return d.toLocaleDateString("fr-FR", {
      day: "2-digit",
      month: "long",
      year: "numeric",
      timeZone: "UTC",
    });
  }
  const d = new Date(isoDate);
  if (Number.isNaN(d.getTime())) return String(isoDate);
  return d.toLocaleDateString("fr-FR", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  });
}

export function formatDateTimeFr(isoDateTime) {
  if (!isoDateTime) return "Aucune mise à jour enregistrée";
  const d = new Date(isoDateTime);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("fr-FR", {
    day: "2-digit",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}
