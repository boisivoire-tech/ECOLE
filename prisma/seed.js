/**
 * ==============================================================================
 * DONNÉES FICTIVES DE DÉMONSTRATION UNIQUEMENT (prisma/seed.js)
 * ==============================================================================
 * Toutes les personnes, matricules, adresses e-mail (.local), notes et codes
 * présents dans ce fichier sont ENTIÈREMENT FICTIFS et destinés uniquement
 * aux tests en développement local.
 * Ce script refuse automatiquement de s'exécuter si NODE_ENV === "production".
 * ==============================================================================
 */

import "dotenv/config";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { prisma } from "../server/db.js";
import { hashSecret, normalizeOtpCode } from "../server/utils/crypto.js";

export async function seedDatabase({ silent = false } = {}) {
  if (process.env.NODE_ENV === "production") {
    throw new Error(
      "Le chargement de données fictives est strictement désactivé en production."
    );
  }
  if (!silent) {
    console.log("Chargement des DONNÉES FICTIVES DE DÉMONSTRATION...");
  }

  // Nettoyage dans l'ordre des dépendances pour pouvoir relancer la démo proprement
  await prisma.session.deleteMany();
  await prisma.grade.deleteMany();
  await prisma.subjectTermRemark.deleteMany();
  await prisma.studentTermReport.deleteMany();
  await prisma.parentOtpCode.deleteMany();
  await prisma.parentStudentLink.deleteMany();
  await prisma.enrollment.deleteMany();
  await prisma.classSubject.deleteMany();
  await prisma.student.deleteMany();
  await prisma.classroom.deleteMany();
  await prisma.subject.deleteMany();
  await prisma.term.deleteMany();
  await prisma.schoolYear.deleteMany();
  await prisma.teacherProfile.deleteMany();
  await prisma.parentProfile.deleteMany();
  await prisma.user.deleteMany();

  // 1. Paramètres de l'établissement fictif
  await prisma.schoolSettings.upsert({
    where: { id: 1 },
    create: {
      id: 1,
      schoolName: "Groupe Scolaire Les Palmiers (Démo fictive)",
      showAbsences: true,
      showRemarks: true,
    },
    update: {
      schoolName: "Groupe Scolaire Les Palmiers (Démo fictive)",
      showAbsences: true,
      showRemarks: true,
    },
  });

  // 2. Compte Administrateur fictif de démonstration
  const adminPasswordHash = await hashSecret("DemoAdmin-2026!");
  await prisma.user.create({
    data: {
      role: "ADMIN",
      email: "admin.fictif@ecole-demo.local",
      passwordHash: adminPasswordHash,
      firstName: "Clarisse",
      lastName: "N'Guessan",
      phone: "00 00 00 01 (Fictif)",
      isActive: true,
    },
  });

  // 3. Deux comptes Enseignants fictifs
  const teacher1Hash = await hashSecret("DemoProf1-2026!");
  const teacher1User = await prisma.user.create({
    data: {
      role: "TEACHER",
      email: "enseignant1.fictif@ecole-demo.local",
      passwordHash: teacher1Hash,
      firstName: "Aminata",
      lastName: "Koné",
      phone: "00 00 00 02 (Fictif)",
      isActive: true,
      teacherProfile: {
        create: { specialty: "Mathématiques & Sciences" },
      },
    },
    include: { teacherProfile: true },
  });

  const teacher2Hash = await hashSecret("DemoProf2-2026!");
  const teacher2User = await prisma.user.create({
    data: {
      role: "TEACHER",
      email: "enseignant2.fictif@ecole-demo.local",
      passwordHash: teacher2Hash,
      firstName: "Jean-Marc",
      lastName: "Kouadio",
      phone: "00 00 00 03 (Fictif)",
      isActive: true,
      teacherProfile: {
        create: { specialty: "Lettres, Langues & Histoire-Géographie" },
      },
    },
    include: { teacherProfile: true },
  });

  // 4. Année scolaire fictive 2026-2027 et ses 3 trimestres
  const schoolYear = await prisma.schoolYear.create({
    data: {
      label: "2026-2027",
      startDate: new Date(Date.UTC(2026, 8, 14)),
      endDate: new Date(Date.UTC(2027, 5, 30)),
      isCurrent: true,
    },
  });

  const term1 = await prisma.term.create({
    data: {
      schoolYearId: schoolYear.id,
      name: "1er Trimestre",
      orderIndex: 1,
      isPublished: true,
    },
  });

  const term2 = await prisma.term.create({
    data: {
      schoolYearId: schoolYear.id,
      name: "2e Trimestre",
      orderIndex: 2,
      isPublished: true,
    },
  });

  await prisma.term.create({
    data: {
      schoolYearId: schoolYear.id,
      name: "3e Trimestre",
      orderIndex: 3,
      isPublished: true,
    },
  });

  // 5. Matières scolaires
  const [subMath, subFran, subHg, subSvt, subAng] = await Promise.all([
    prisma.subject.create({ data: { code: "MATH", name: "Mathématiques" } }),
    prisma.subject.create({ data: { code: "FRAN", name: "Français" } }),
    prisma.subject.create({ data: { code: "HG", name: "Histoire-Géographie" } }),
    prisma.subject.create({ data: { code: "SVT", name: "Sciences de la Vie et de la Terre" } }),
    prisma.subject.create({ data: { code: "ANG", name: "Anglais" } }),
  ]);

  // 6. Classes fictives
  const class6A = await prisma.classroom.create({
    data: { schoolYearId: schoolYear.id, name: "6ème A", level: "6ème" },
  });
  const class3B = await prisma.classroom.create({
    data: { schoolYearId: schoolYear.id, name: "3ème B", level: "3ème" },
  });

  // 7. Affectation des matières, coefficients et enseignants aux classes
  const [cs6Math, cs6Fran, cs6Hg, cs6Svt, cs3Math, cs3Ang] = await Promise.all([
    prisma.classSubject.create({
      data: {
        classroomId: class6A.id,
        subjectId: subMath.id,
        teacherId: teacher1User.teacherProfile.id,
        coefficient: 4,
      },
    }),
    prisma.classSubject.create({
      data: {
        classroomId: class6A.id,
        subjectId: subFran.id,
        teacherId: teacher2User.teacherProfile.id,
        coefficient: 4,
      },
    }),
    prisma.classSubject.create({
      data: {
        classroomId: class6A.id,
        subjectId: subHg.id,
        teacherId: teacher2User.teacherProfile.id,
        coefficient: 2,
      },
    }),
    prisma.classSubject.create({
      data: {
        classroomId: class6A.id,
        subjectId: subSvt.id,
        teacherId: teacher1User.teacherProfile.id,
        coefficient: 2,
      },
    }),
    prisma.classSubject.create({
      data: {
        classroomId: class3B.id,
        subjectId: subMath.id,
        teacherId: teacher1User.teacherProfile.id,
        coefficient: 5,
      },
    }),
    prisma.classSubject.create({
      data: {
        classroomId: class3B.id,
        subjectId: subAng.id,
        teacherId: teacher2User.teacherProfile.id,
        coefficient: 3,
      },
    }),
  ]);

  // 8. Élèves fictifs (dates de naissance fictives)
  const studentAya = await prisma.student.create({
    data: {
      matricule: "ELV-DEMO-001",
      lastName: "Yao",
      firstName: "Aya Marie",
      birthDate: new Date(Date.UTC(2014, 4, 15)), // 2014-05-15
    },
  });

  const studentKoffi = await prisma.student.create({
    data: {
      matricule: "ELV-DEMO-002",
      lastName: "Yao",
      firstName: "Koffi Marc",
      birthDate: new Date(Date.UTC(2011, 10, 3)), // 2011-11-03
    },
  });

  const studentSalif = await prisma.student.create({
    data: {
      matricule: "ELV-DEMO-003",
      lastName: "Bamba",
      firstName: "Salif Junior",
      birthDate: new Date(Date.UTC(2014, 1, 22)), // 2014-02-22
    },
  });

  // Inscriptions des élèves dans leurs classes
  await prisma.enrollment.createMany({
    data: [
      { studentId: studentAya.id, classroomId: class6A.id, schoolYearId: schoolYear.id },
      { studentId: studentKoffi.id, classroomId: class3B.id, schoolYearId: schoolYear.id },
      { studentId: studentSalif.id, classroomId: class6A.id, schoolYearId: schoolYear.id },
    ],
  });

  // 9. Deux comptes Parents fictifs + liens parent-enfant + codes à usage unique fictifs
  const otpParent1Hash = await hashSecret(normalizeOtpCode("DEMO-7429"));
  const otpParent2Hash = await hashSecret(normalizeOtpCode("DEMO-9384"));
  const otpExpiry = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

  const parent1User = await prisma.user.create({
    data: {
      role: "PARENT",
      email: "parent.yao.fictif@ecole-demo.local",
      firstName: "Kouassi",
      lastName: "Yao",
      phone: "00 00 00 10 (Fictif)",
      isActive: true,
      parentProfile: {
        create: {
          address: "Quartier Démo, Rue des Écoles (Fictif)",
          otpCodes: {
            create: { codeHash: otpParent1Hash, expiresAt: otpExpiry },
          },
        },
      },
    },
    include: { parentProfile: true },
  });

  const parent2User = await prisma.user.create({
    data: {
      role: "PARENT",
      email: "parent.bamba.fictif@ecole-demo.local",
      firstName: "Fatou",
      lastName: "Bamba",
      phone: "00 00 00 11 (Fictif)",
      isActive: true,
      parentProfile: {
        create: {
          address: "Quartier Résidentiel Démo (Fictif)",
          otpCodes: {
            create: { codeHash: otpParent2Hash, expiresAt: otpExpiry },
          },
        },
      },
    },
    include: { parentProfile: true },
  });

  // Parent 1 (M. Yao) est rattaché à ses 2 enfants (Aya et Koffi)
  // Parent 2 (Mme Bamba) est rattachée uniquement à Salif
  await prisma.parentStudentLink.createMany({
    data: [
      {
        parentId: parent1User.parentProfile.id,
        studentId: studentAya.id,
        relationship: "Père",
      },
      {
        parentId: parent1User.parentProfile.id,
        studentId: studentKoffi.id,
        relationship: "Père",
      },
      {
        parentId: parent2User.parentProfile.id,
        studentId: studentSalif.id,
        relationship: "Mère",
      },
    ],
  });

  // 10. Notes fictives pour le 1er Trimestre et le 2e Trimestre
  await prisma.grade.createMany({
    data: [
      // Élève Aya Marie Yao (6ème A) — 1er Trimestre
      {
        studentId: studentAya.id,
        classSubjectId: cs6Math.id,
        termId: term1.id,
        recordedByTeacherId: teacher1User.teacherProfile.id,
        title: "Interrogation n°1",
        value: 15,
        weight: 1,
        evaluatedAt: new Date(Date.UTC(2026, 9, 5)),
      },
      {
        studentId: studentAya.id,
        classSubjectId: cs6Math.id,
        termId: term1.id,
        recordedByTeacherId: teacher1User.teacherProfile.id,
        title: "Devoir surveillé n°1",
        value: 16.5,
        weight: 2,
        evaluatedAt: new Date(Date.UTC(2026, 9, 20)),
      },
      {
        studentId: studentAya.id,
        classSubjectId: cs6Fran.id,
        termId: term1.id,
        recordedByTeacherId: teacher2User.teacherProfile.id,
        title: "Dictée et questions",
        value: 14,
        weight: 1,
        evaluatedAt: new Date(Date.UTC(2026, 9, 8)),
      },
      {
        studentId: studentAya.id,
        classSubjectId: cs6Fran.id,
        termId: term1.id,
        recordedByTeacherId: teacher2User.teacherProfile.id,
        title: "Rédaction trimestrielle",
        value: 15,
        weight: 2,
        evaluatedAt: new Date(Date.UTC(2026, 9, 22)),
      },
      {
        studentId: studentAya.id,
        classSubjectId: cs6Hg.id,
        termId: term1.id,
        recordedByTeacherId: teacher2User.teacherProfile.id,
        title: "Évaluation de géographie",
        value: 13.5,
        weight: 1,
        evaluatedAt: new Date(Date.UTC(2026, 9, 14)),
      },
      {
        studentId: studentAya.id,
        classSubjectId: cs6Svt.id,
        termId: term1.id,
        recordedByTeacherId: teacher1User.teacherProfile.id,
        title: "Travaux pratiques SVT",
        value: 17,
        weight: 1,
        evaluatedAt: new Date(Date.UTC(2026, 9, 18)),
      },
      // Élève Koffi Marc Yao (3ème B) — 1er Trimestre
      {
        studentId: studentKoffi.id,
        classSubjectId: cs3Math.id,
        termId: term1.id,
        recordedByTeacherId: teacher1User.teacherProfile.id,
        title: "Devoir type brevet n°1",
        value: 12.5,
        weight: 2,
        evaluatedAt: new Date(Date.UTC(2026, 9, 12)),
      },
      {
        studentId: studentKoffi.id,
        classSubjectId: cs3Ang.id,
        termId: term1.id,
        recordedByTeacherId: teacher2User.teacherProfile.id,
        title: "Compréhension écrite",
        value: 14.5,
        weight: 1,
        evaluatedAt: new Date(Date.UTC(2026, 9, 16)),
      },
      // Élève Salif Junior Bamba (6ème A) — 1er Trimestre
      {
        studentId: studentSalif.id,
        classSubjectId: cs6Math.id,
        termId: term1.id,
        recordedByTeacherId: teacher1User.teacherProfile.id,
        title: "Interrogation n°1",
        value: 11.5,
        weight: 1,
        evaluatedAt: new Date(Date.UTC(2026, 9, 5)),
      },
      {
        studentId: studentSalif.id,
        classSubjectId: cs6Fran.id,
        termId: term1.id,
        recordedByTeacherId: teacher2User.teacherProfile.id,
        title: "Dictée et questions",
        value: 13,
        weight: 1,
        evaluatedAt: new Date(Date.UTC(2026, 9, 8)),
      },
      // Une note au 2e Trimestre pour Aya
      {
        studentId: studentAya.id,
        classSubjectId: cs6Math.id,
        termId: term2.id,
        recordedByTeacherId: teacher1User.teacherProfile.id,
        title: "Interrogation début T2",
        value: 15.5,
        weight: 1,
        evaluatedAt: new Date(Date.UTC(2026, 11, 10)),
      },
    ],
  });

  // 11. Appréciations par matière et bilans d'absences/remarques fictifs
  await prisma.subjectTermRemark.createMany({
    data: [
      {
        studentId: studentAya.id,
        classSubjectId: cs6Math.id,
        termId: term1.id,
        remark: "Élève sérieuse et attentive, très bon raisonnement.",
      },
      {
        studentId: studentAya.id,
        classSubjectId: cs6Fran.id,
        termId: term1.id,
        remark: "Expression écrite soignée, poursuivez ainsi.",
      },
      {
        studentId: studentKoffi.id,
        classSubjectId: cs3Math.id,
        termId: term1.id,
        remark: "Ensemble convenable, intensifier les exercices d'entraînement.",
      },
    ],
  });

  await prisma.studentTermReport.createMany({
    data: [
      {
        studentId: studentAya.id,
        termId: term1.id,
        justifiedAbsences: 2,
        unjustifiedAbsences: 0,
        lateCount: 1,
        generalRemark:
          "Félicitations du conseil de classe pour le sérieux et la régularité du travail (Donnée fictive).",
      },
      {
        studentId: studentKoffi.id,
        termId: term1.id,
        justifiedAbsences: 4,
        unjustifiedAbsences: 1,
        lateCount: 2,
        generalRemark:
          "Trimestre encourageant. Maintenir les efforts en vue de l'examen de fin d'année (Donnée fictive).",
      },
      {
        studentId: studentSalif.id,
        termId: term1.id,
        justifiedAbsences: 0,
        unjustifiedAbsences: 0,
        lateCount: 0,
        generalRemark: "Bon début d'année scolaire, élève volontaire (Donnée fictive).",
      },
    ],
  });

  if (!silent) {
    console.log("[SUCCÈS] Données fictives de démonstration chargées avec succès.");
  }
}

const currentFile = fileURLToPath(import.meta.url);
if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(currentFile)) {
  seedDatabase()
    .catch((err) => {
      console.error("[ERREUR SEED]", err.message);
      process.exitCode = 1;
    })
    .finally(async () => {
      await prisma.$disconnect();
    });
}
