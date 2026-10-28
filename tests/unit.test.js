import test from "node:test";
import assert from "node:assert/strict";

import {
  generateCsrfToken,
  generateOtpCode,
  hashSecret,
  normalizeOtpCode,
  verifyCsrfToken,
  verifySecret,
} from "../server/utils/crypto.js";
import {
  formatDateIso,
  normalizeMatricule,
  normalizeNameComparison,
  parseIsoDate,
  validateCoefficient,
  validateEmail,
  validateGradeValue,
  validatePassword,
} from "../server/utils/validation.js";
import {
  buildStudentBulletin,
  computeSubjectAverage,
  getMentionForAverage,
} from "../server/utils/grades.js";

test("Cryptographie : hachage scrypt unique et vérification exacte", async () => {
  const hash1 = await hashSecret("MotDePasseSolide2026!");
  const hash2 = await hashSecret("MotDePasseSolide2026!");

  assert.notEqual(hash1, hash2, "Deux hachages doivent utiliser deux sels différents");
  assert.equal(hash1.includes("MotDePasseSolide2026!"), false);
  assert.equal(await verifySecret("MotDePasseSolide2026!", hash1), true);
  assert.equal(await verifySecret("MotDePasseSolide2026!", hash2), true);
  assert.equal(await verifySecret("MauvaisMotDePasse", hash1), false);
});

test("Codes à usage unique (OTP) : format sans ambiguïté et normalisation", () => {
  for (let i = 0; i < 25; i += 1) {
    const code = generateOtpCode();
    assert.match(code, /^[2-9A-HJ-NP-Z]{4}-[2-9A-HJ-NP-Z]{4}$/);
  }
  assert.equal(normalizeOtpCode(" abcd - 2345 "), "ABCD2345");
});

test("Jeton CSRF : génération et comparaison en temps constant", () => {
  const token = generateCsrfToken();
  assert.equal(token.length, 64);
  assert.equal(verifyCsrfToken(token, token), true);
  assert.equal(verifyCsrfToken("autre", token), false);
  assert.equal(verifyCsrfToken(null, token), false);
});

test("Validation des notes, coefficients, dates et noms accentués/apostrophes mobiles", () => {
  assert.equal(validateGradeValue("15,5"), 15.5);
  assert.equal(validateGradeValue(0), 0);
  assert.equal(validateGradeValue(20), 20);
  assert.throws(() => validateGradeValue(-0.5));
  assert.throws(() => validateGradeValue(20.25));
  assert.throws(() => validateGradeValue("abc"));

  assert.equal(validateCoefficient(4), 4);
  assert.throws(() => validateCoefficient(0));
  assert.throws(() => validateCoefficient(25));
  assert.throws(() => validateCoefficient(2.5));

  const validLeap = parseIsoDate("2024-02-29", "Date");
  assert.equal(formatDateIso(validLeap.date), "2024-02-29");
  assert.throws(() => parseIsoDate("2026-02-29", "Date"));
  assert.throws(() => parseIsoDate("2026-02-31", "Date"));

  assert.equal(
    normalizeNameComparison("N’Guessan"),
    normalizeNameComparison("n'guessan")
  );
  assert.equal(normalizeNameComparison("Kouamé"), normalizeNameComparison("KOUAME"));

  assert.equal(normalizeMatricule(" elv-2026-01 "), "ELV-2026-01");
  assert.equal(validateEmail("  Prof@Ecole.CI "), "prof@ecole.ci");
  assert.throws(() => validatePassword("court123"));
  assert.equal(validatePassword("AssezLong2026!"), "AssezLong2026!");
});

test("Calcul des moyennes par matière, moyenne générale et masquage absences/remarques", () => {
  assert.equal(computeSubjectAverage([]), null);
  assert.equal(
    computeSubjectAverage([
      { value: 15, weight: 1 },
      { value: 16.5, weight: 2 },
      { value: 18, weight: 1 },
    ]),
    16.5
  );

  const classSubjects = [
    {
      id: 1,
      coefficient: 4,
      subject: { code: "MATH", name: "Mathématiques" },
      teacher: { user: { firstName: "Aminata", lastName: "Koné" } },
    },
    {
      id: 2,
      coefficient: 2,
      subject: { code: "HG", name: "Histoire-Géographie" },
      teacher: { user: { firstName: "Jean-Marc", lastName: "Kouadio" } },
    },
    {
      id: 3,
      coefficient: 3,
      subject: { code: "ANG", name: "Anglais" },
      teacher: null,
    },
  ];

  const grades = [
    {
      id: 101,
      classSubjectId: 1,
      title: "Devoir 1",
      value: 15,
      weight: 1,
      evaluatedAt: new Date("2026-10-05T00:00:00.000Z"),
      updatedAt: new Date("2026-10-05T10:00:00.000Z"),
    },
    {
      id: 102,
      classSubjectId: 2,
      title: "Interro 1",
      value: 12,
      weight: 1,
      evaluatedAt: new Date("2026-10-12T00:00:00.000Z"),
      updatedAt: new Date("2026-10-20T14:30:00.000Z"),
    },
  ];

  // Anglais (coef 3) n'a pas encore de note : totalCoefficients doit être 4 + 2 = 6 (et non 9)
  // Moyenne générale = (15 * 4 + 12 * 2) / 6 = (60 + 24) / 6 = 14.00
  const bulletinVisible = buildStudentBulletin({
    classSubjects,
    grades,
    subjectRemarks: [{ classSubjectId: 1, remark: "Bon travail", updatedAt: new Date("2026-10-18T08:00:00.000Z") }],
    termReport: {
      justifiedAbsences: 2,
      unjustifiedAbsences: 1,
      lateCount: 0,
      generalRemark: "Ensemble sérieux",
      updatedAt: new Date("2026-10-19T08:00:00.000Z"),
    },
    settings: { showAbsences: true, showRemarks: true },
  });

  assert.equal(bulletinVisible.summary.totalCoefficients, 6);
  assert.equal(bulletinVisible.summary.totalWeightedPoints, 84);
  assert.equal(bulletinVisible.summary.generalAverage, 14);
  assert.equal(getMentionForAverage(14), "Bien");
  assert.equal(bulletinVisible.summary.lastUpdatedAt, "2026-10-20T14:30:00.000Z");
  assert.equal(bulletinVisible.attendance.justifiedAbsences, 2);
  assert.equal(bulletinVisible.generalRemark, "Ensemble sérieux");

  const bulletinHidden = buildStudentBulletin({
    classSubjects,
    grades,
    subjectRemarks: [{ classSubjectId: 1, remark: "Secret", updatedAt: new Date("2026-10-25T08:00:00.000Z") }],
    termReport: {
      justifiedAbsences: 5,
      unjustifiedAbsences: 2,
      lateCount: 1,
      generalRemark: "Masqué",
      updatedAt: new Date("2026-10-25T08:00:00.000Z"),
    },
    settings: { showAbsences: false, showRemarks: false },
  });

  assert.equal(bulletinHidden.attendance, null);
  assert.equal(bulletinHidden.generalRemark, null);
  assert.equal(bulletinHidden.subjects[0].subjectRemark, undefined);
});
