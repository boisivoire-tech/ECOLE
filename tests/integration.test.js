import test, { before, after } from "node:test";
import assert from "node:assert/strict";

import { createApp } from "../server/app.js";
import { prisma } from "../server/db.js";
import { seedDatabase } from "../prisma/seed.js";
import { accountAuthLimiter, ipAuthLimiter } from "../server/middleware/rateLimit.js";

let server;
let baseUrl;
const capturedLogs = [];
const originalLog = console.log;
const originalError = console.error;

class ApiClient {
  constructor() {
    this.cookies = new Map();
    this.csrfToken = null;
  }

  cookieHeader() {
    return Array.from(this.cookies.entries())
      .map(([k, v]) => `${k}=${v}`)
      .join("; ");
  }

  saveCookies(res) {
    const list = res.headers.getSetCookie ? res.headers.getSetCookie() : [];
    for (const raw of list) {
      const [pair] = raw.split(";");
      const eq = pair.indexOf("=");
      if (eq > 0) {
        const name = pair.slice(0, eq).trim();
        const val = pair.slice(eq + 1).trim();
        if (!val) this.cookies.delete(name);
        else this.cookies.set(name, val);
      }
    }
  }

  async request(path, { method = "GET", body, skipCsrf = false } = {}) {
    const headers = { Accept: "application/json" };
    const ck = this.cookieHeader();
    if (ck) headers.Cookie = ck;
    if (body !== undefined) headers["Content-Type"] = "application/json";
    if (!skipCsrf && !["GET", "HEAD"].includes(method) && this.csrfToken) {
      headers["X-CSRF-Token"] = this.csrfToken;
    }

    const res = await fetch(`${baseUrl}${path}`, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
    this.saveCookies(res);
    const data = await res.json().catch(() => ({}));
    if (data?.csrfToken) this.csrfToken = data.csrfToken;
    return { status: res.status, data };
  }
}

before(async () => {
  // Réinitialisation propre des données fictives avant les tests d'intégration
  await seedDatabase({ silent: true });

  console.log = (...args) => {
    capturedLogs.push(args.join(" "));
  };
  console.error = (...args) => {
    capturedLogs.push(args.join(" "));
  };

  const app = createApp();
  await new Promise((resolve) => {
    server = app.listen(0, "127.0.0.1", () => {
      const addr = server.address();
      baseUrl = `http://127.0.0.1:${addr.port}`;
      resolve();
    });
  });
});

after(async () => {
  console.log = originalLog;
  console.error = originalError;

  if (server) {
    await new Promise((resolve) => server.close(resolve));
  }
  // Restaure l'état initial de démonstration après l'exécution des tests
  await seedDatabase({ silent: true });
  await prisma.$disconnect();
});

test("Sécurité CSRF : bloque toute requête mutative sans jeton CSRF valide", async () => {
  const client = new ApiClient();
  await client.request("/api/auth/session");

  const blocked = await client.request("/api/auth/staff/login", {
    method: "POST",
    body: { email: "admin.fictif@ecole-demo.local", password: "DemoAdmin-2026!" },
    skipCsrf: true,
  });
  assert.equal(blocked.status, 403);
});

test("Connexion Parent : anti-énumération, interdiction sans OTP et code à usage unique", async () => {
  // 1. Matricule inexistant vs élève réel : réponses d'étape 1 et d'échec étape 2 identiques
  const cUnknown = new ApiClient();
  await cUnknown.request("/api/auth/session");
  const s1Unknown = await cUnknown.request("/api/auth/parent/step1", {
    method: "POST",
    body: { matricule: "ELV-FANTOME-999", lastName: "Inconnu", birthDate: "2014-05-15" },
  });
  const s2Unknown = await cUnknown.request("/api/auth/parent/step2", {
    method: "POST",
    body: { otpCode: "XXXX-YYYY" },
  });

  const cKnown = new ApiClient();
  await cKnown.request("/api/auth/session");
  const s1Known = await cKnown.request("/api/auth/parent/step1", {
    method: "POST",
    body: { matricule: "ELV-DEMO-001", lastName: "Yao", birthDate: "2014-05-15" },
  });

  // Vérifie qu'avec les 3 infos seules, l'accès aux résultats est strictement bloqué (401)
  const noOtpTry = await cKnown.request("/api/parent/dashboard");
  assert.equal(noOtpTry.status, 401);

  const s2WrongCode = await cKnown.request("/api/auth/parent/step2", {
    method: "POST",
    body: { otpCode: "MAUVAIS1" },
  });

  assert.equal(s1Unknown.status, 200);
  assert.deepEqual(s1Unknown.data, s1Known.data);
  assert.equal(s2Unknown.status, 401);
  assert.equal(s2WrongCode.status, 401);
  assert.equal(s2Unknown.data.error, s2WrongCode.data.error);

  // 2. Connexion valide avec le code à usage unique DEMO-7429
  const parent = new ApiClient();
  await parent.request("/api/auth/session");
  await parent.request("/api/auth/parent/step1", {
    method: "POST",
    body: { matricule: "ELV-DEMO-001", lastName: "Yao", birthDate: "2014-05-15" },
  });
  const okStep2 = await parent.request("/api/auth/parent/step2", {
    method: "POST",
    body: { otpCode: "DEMO-7429" },
  });
  assert.equal(okStep2.status, 200);
  assert.equal(okStep2.data.user.role, "PARENT");

  // 3. Cloisonnement strict : M. Yao voit ses 2 enfants mais reçoit 403 sur l'élève Salif Bamba
  const dash = await parent.request("/api/parent/dashboard");
  assert.equal(dash.status, 200);
  assert.equal(dash.data.children.length, 2);

  const salif = await prisma.student.findUnique({ where: { matricule: "ELV-DEMO-003" } });
  const forbidden = await parent.request(`/api/parent/children/${salif.id}/results`);
  assert.equal(forbidden.status, 403);

  // 4. Un code à usage unique consommé ne peut plus jamais resservir
  await parent.request("/api/auth/logout", { method: "POST" });
  await parent.request("/api/auth/session");
  await parent.request("/api/auth/parent/step1", {
    method: "POST",
    body: { matricule: "ELV-DEMO-001", lastName: "Yao", birthDate: "2014-05-15" },
  });
  const replay = await parent.request("/api/auth/parent/step2", {
    method: "POST",
    body: { otpCode: "DEMO-7429" },
  });
  assert.equal(replay.status, 401);
});

test("Protection anti-essais répétés : verrouillage temporaire 429 après abus", async () => {
  ipAuthLimiter.buckets.clear();
  accountAuthLimiter.buckets.clear();

  const brute = new ApiClient();
  await brute.request("/api/auth/session");

  let lastStatus = 0;
  for (let i = 0; i < 8; i += 1) {
    const res = await brute.request("/api/auth/staff/login", {
      method: "POST",
      body: { email: "cible.test@ecole-demo.local", password: "MauvaisPassword123!" },
    });
    lastStatus = res.status;
    if (lastStatus === 429) break;
  }

  assert.equal(lastStatus, 429, "Le serveur doit bloquer les essais répétés avec le code 429");
  ipAuthLimiter.buckets.clear();
  accountAuthLimiter.buckets.clear();
});

test("Droits Enseignant : saisie/correction autorisée, blocage autres matières et doublons", async () => {
  const teacher = new ApiClient();
  await teacher.request("/api/auth/session");
  const login = await teacher.request("/api/auth/staff/login", {
    method: "POST",
    body: { email: "enseignant1.fictif@ecole-demo.local", password: "DemoProf1-2026!" },
  });
  assert.equal(login.status, 200);

  // Interdiction d'accéder aux routes administrateur
  const adminDenied = await teacher.request("/api/admin/overview");
  assert.equal(adminDenied.status, 403);

  // Interdiction d'accéder à une matière confiée à l'enseignant 2 (Français)
  const franCs = await prisma.classSubject.findFirst({
    where: { subject: { code: "FRAN" } },
  });
  const otherSubjectDenied = await teacher.request(
    `/api/teacher/assignments/${franCs.id}/students`
  );
  assert.equal(otherSubjectDenied.status, 403);

  // Saisie d'une note valide dans sa propre classe/matière
  const assignments = await teacher.request("/api/teacher/assignments");
  const math6A = assignments.data.assignments.find(
    (a) => a.classroom.name === "6ème A" && a.subject.code === "MATH"
  );
  const term1Id = math6A.schoolYear.terms[0].id;
  const aya = await prisma.student.findUnique({ where: { matricule: "ELV-DEMO-001" } });

  const created = await teacher.request("/api/teacher/grades", {
    method: "POST",
    body: {
      classSubjectId: math6A.classSubjectId,
      studentId: aya.id,
      termId: term1Id,
      title: "Contrôle continu test",
      value: 17.75,
      weight: 1,
      evaluatedAt: "2026-10-28",
    },
  });
  assert.equal(created.status, 201);

  // Empêchement des doublons d'évaluation
  const duplicate = await teacher.request("/api/teacher/grades", {
    method: "POST",
    body: {
      classSubjectId: math6A.classSubjectId,
      studentId: aya.id,
      termId: term1Id,
      title: "Contrôle continu test",
      value: 15,
      weight: 1,
      evaluatedAt: "2026-10-28",
    },
  });
  assert.equal(duplicate.status, 409);
});

test("Administration : liaison parent obligatoire, nouvel OTP, visibilité absences et mot de passe", async () => {
  const admin = new ApiClient();
  await admin.request("/api/auth/session");
  const login = await admin.request("/api/auth/staff/login", {
    method: "POST",
    body: { email: "admin.fictif@ecole-demo.local", password: "DemoAdmin-2026!" },
  });
  assert.equal(login.status, 200);

  const overview = await admin.request("/api/admin/overview");
  const class6A = overview.data.classrooms.find((c) => c.name === "6ème A");
  const bambaParent = overview.data.parents.find((p) => p.lastName === "Bamba");

  // Création d'un nouvel élève SANS parent associé
  const newStu = await admin.request("/api/admin/students", {
    method: "POST",
    body: {
      matricule: "ELV-TEST-777",
      lastName: "Bamba",
      firstName: "Inès",
      birthDate: "2015-03-19",
      classroomId: class6A.id,
    },
  });
  assert.equal(newStu.status, 201);

  // Même avec un vrai code OTP de Mme Bamba, elle ne peut PAS se connecter via ELV-TEST-777 tant que l'admin ne l'a pas associée !
  const pTryUnlinked = new ApiClient();
  await pTryUnlinked.request("/api/auth/session");
  await pTryUnlinked.request("/api/auth/parent/step1", {
    method: "POST",
    body: { matricule: "ELV-TEST-777", lastName: "Bamba", birthDate: "2015-03-19" },
  });
  const unlinkedDenied = await pTryUnlinked.request("/api/auth/parent/step2", {
    method: "POST",
    body: { otpCode: "DEMO-9384" },
  });
  assert.equal(unlinkedDenied.status, 401);

  // L'administrateur associe maintenant Mme Bamba à Inès et régénère un code OTP
  const linkRes = await admin.request("/api/admin/parent-links", {
    method: "POST",
    body: {
      parentProfileId: bambaParent.parentProfileId,
      studentId: newStu.data.student.id,
      relationship: "Mère",
    },
  });
  assert.equal(linkRes.status, 201);

  const otpRes = await admin.request(
    `/api/admin/parents/${bambaParent.parentProfileId}/otp`,
    { method: "POST", body: { validDays: 14 } }
  );
  assert.equal(otpRes.status, 201);

  // Désactivation des absences et remarques
  await admin.request("/api/admin/settings", {
    method: "PUT",
    body: {
      schoolName: "Collège Test",
      showAbsences: false,
      showRemarks: false,
    },
  });

  // Maintenant Mme Bamba peut se connecter avec ELV-TEST-777 + nouveau code OTP !
  const pLinked = new ApiClient();
  await pLinked.request("/api/auth/session");
  await pLinked.request("/api/auth/parent/step1", {
    method: "POST",
    body: { matricule: "ELV-TEST-777", lastName: "Bamba", birthDate: "2015-03-19" },
  });
  const linkedOk = await pLinked.request("/api/auth/parent/step2", {
    method: "POST",
    body: { otpCode: otpRes.data.code },
  });
  assert.equal(linkedOk.status, 200);

  // Test contrôle et correction d'une note sur un bulletin par l'administrateur
  const ayaStudent = overview.data.students.find((s) => s.matricule === "ELV-DEMO-001");
  const term1 = overview.data.schoolYears[0].terms[0];
  const adminBull = await admin.request(
    `/api/admin/students/${ayaStudent.id}/bulletin?termId=${term1.id}`
  );
  assert.equal(adminBull.status, 200);
  const firstGrade = adminBull.data.bulletin.subjects
    .flatMap((s) => s.grades)[0];
  assert.ok(firstGrade);
  const adminFix = await admin.request(`/api/admin/grades/${firstGrade.id}`, {
    method: "PUT",
    body: {
      title: firstGrade.title,
      value: 16,
      weight: firstGrade.weight,
      evaluatedAt: firstGrade.evaluatedAt,
    },
  });
  assert.equal(adminFix.status, 200);

  // Test changement de son propre mot de passe par l'administrateur
  const pwdChange = await admin.request("/api/auth/change-password", {
    method: "POST",
    body: {
      currentPassword: "DemoAdmin-2026!",
      newPassword: "NouveauSecretAdmin-2026!",
    },
  });
  assert.equal(pwdChange.status, 200);

  // Vérification stricte de confidentialité des journaux serveur
  // (on retire uniquement l'horodatage initial [AAAA-MM-JJTHH:MM:SS.mmmZ])
  const fullLogText = capturedLogs
    .map((line) => line.replace(/^\[[^\]]+\]\s*/, ""))
    .join("\n");
  assert.equal(fullLogText.includes("2014-05-15"), false, "Aucune date de naissance dans les logs");
  assert.equal(fullLogText.includes("2015-03-19"), false, "Aucune date de naissance dans les logs");
  assert.equal(fullLogText.includes("17.75"), false, "Aucune note dans les logs");
  assert.equal(fullLogText.includes("DEMO-7429"), false, "Aucun code OTP dans les logs");
  assert.equal(fullLogText.includes(otpRes.data.code), false, "Aucun code OTP généré dans les logs");
  assert.equal(fullLogText.includes("DemoAdmin-2026!"), false, "Aucun mot de passe dans les logs");
});
