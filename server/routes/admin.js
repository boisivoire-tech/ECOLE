import express from "express";
import { prisma } from "../db.js";
import { requireAuth, requireRole } from "../middleware/auth.js";
import { generateOtpCode, hashSecret, normalizeOtpCode } from "../utils/crypto.js";
import {
  AppError,
  formatDateIso,
  normalizeMatricule,
  normalizeOptionalText,
  normalizeText,
  parseIsoDate,
  parsePositiveInt,
  validateCoefficient,
  validateEmail,
  validateGradeValue,
  validateNonNegativeInt,
  validatePassword,
  validateWeight,
} from "../utils/validation.js";
import { buildStudentBulletin } from "../utils/grades.js";
import { logInfo } from "../utils/logger.js";

const router = express.Router();

router.use(requireAuth, requireRole("ADMIN"));

/**
 * GET /api/admin/overview
 * Charge l'ensemble des données de gestion pour le tableau de bord administrateur.
 */
router.get("/overview", async (_req, res, next) => {
  try {
    const [
      settingsRow,
      schoolYears,
      subjects,
      classrooms,
      teachers,
      parents,
      students,
      gradesCount,
    ] = await Promise.all([
      prisma.schoolSettings.findUnique({ where: { id: 1 } }),
      prisma.schoolYear.findMany({
        orderBy: { startDate: "desc" },
        include: {
          terms: { orderBy: { orderIndex: "asc" } },
        },
      }),
      prisma.subject.findMany({
        orderBy: { name: "asc" },
      }),
      prisma.classroom.findMany({
        orderBy: [{ schoolYear: { startDate: "desc" } }, { name: "asc" }],
        include: {
          schoolYear: { select: { id: true, label: true, isCurrent: true } },
          _count: { select: { enrollments: true } },
          classSubjects: {
            orderBy: { subject: { name: "asc" } },
            include: {
              subject: true,
              teacher: {
                include: {
                  user: { select: { id: true, firstName: true, lastName: true } },
                },
              },
            },
          },
        },
      }),
      prisma.user.findMany({
        where: { role: "TEACHER" },
        orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
        select: {
          id: true,
          email: true,
          firstName: true,
          lastName: true,
          phone: true,
          isActive: true,
          teacherProfile: {
            select: {
              id: true,
              specialty: true,
              classSubjects: {
                include: {
                  subject: { select: { name: true } },
                  classroom: {
                    select: {
                      name: true,
                      schoolYear: { select: { label: true } },
                    },
                  },
                },
              },
            },
          },
        },
      }),
      prisma.user.findMany({
        where: { role: "PARENT" },
        orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
        select: {
          id: true,
          email: true,
          firstName: true,
          lastName: true,
          phone: true,
          isActive: true,
          parentProfile: {
            select: {
              id: true,
              address: true,
              studentLinks: {
                include: {
                  student: {
                    select: {
                      id: true,
                      matricule: true,
                      firstName: true,
                      lastName: true,
                    },
                  },
                },
              },
              otpCodes: {
                where: {
                  usedAt: null,
                  expiresAt: { gt: new Date() },
                },
                orderBy: { createdAt: "desc" },
                select: {
                  id: true,
                  expiresAt: true,
                  createdAt: true,
                },
              },
            },
          },
        },
      }),
      prisma.student.findMany({
        orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
        include: {
          enrollments: {
            include: {
              classroom: { select: { id: true, name: true, level: true } },
              schoolYear: { select: { id: true, label: true, isCurrent: true } },
            },
          },
          parentLinks: {
            include: {
              parent: {
                include: {
                  user: { select: { id: true, firstName: true, lastName: true } },
                },
              },
            },
          },
          termReports: true,
        },
      }),
      prisma.grade.count(),
    ]);

    const settings = settingsRow || {
      id: 1,
      schoolName: "Établissement Scolaire",
      showAbsences: true,
      showRemarks: true,
    };

    return res.json({
      settings: {
        schoolName: settings.schoolName,
        showAbsences: settings.showAbsences,
        showRemarks: settings.showRemarks,
      },
      stats: {
        studentsCount: students.length,
        classroomsCount: classrooms.length,
        teachersCount: teachers.length,
        parentsCount: parents.length,
        gradesCount,
      },
      schoolYears: schoolYears.map((sy) => ({
        id: sy.id,
        label: sy.label,
        startDate: formatDateIso(sy.startDate),
        endDate: formatDateIso(sy.endDate),
        isCurrent: sy.isCurrent,
        terms: sy.terms.map((t) => ({
          id: t.id,
          name: t.name,
          orderIndex: t.orderIndex,
          isPublished: t.isPublished,
        })),
      })),
      subjects,
      classrooms: classrooms.map((c) => ({
        id: c.id,
        name: c.name,
        level: c.level,
        schoolYearId: c.schoolYearId,
        schoolYearLabel: c.schoolYear.label,
        studentsCount: c._count.enrollments,
        classSubjects: c.classSubjects.map((cs) => ({
          id: cs.id,
          subjectId: cs.subjectId,
          subjectCode: cs.subject.code,
          subjectName: cs.subject.name,
          coefficient: cs.coefficient,
          teacherId: cs.teacherId,
          teacherName: cs.teacher?.user
            ? `${cs.teacher.user.firstName} ${cs.teacher.user.lastName}`
            : null,
        })),
      })),
      teachers: teachers.map((t) => ({
        userId: t.id,
        teacherProfileId: t.teacherProfile?.id || null,
        email: t.email,
        firstName: t.firstName,
        lastName: t.lastName,
        phone: t.phone,
        isActive: t.isActive,
        specialty: t.teacherProfile?.specialty || "",
        assignments: (t.teacherProfile?.classSubjects || []).map((cs) => ({
          id: cs.id,
          classroomName: cs.classroom.name,
          schoolYearLabel: cs.classroom.schoolYear.label,
          subjectName: cs.subject.name,
          coefficient: cs.coefficient,
        })),
      })),
      parents: parents.map((p) => ({
        userId: p.id,
        parentProfileId: p.parentProfile?.id || null,
        email: p.email,
        firstName: p.firstName,
        lastName: p.lastName,
        phone: p.phone,
        isActive: p.isActive,
        address: p.parentProfile?.address || "",
        activeOtpCount: p.parentProfile?.otpCodes?.length || 0,
        latestOtpExpiresAt:
          p.parentProfile?.otpCodes?.[0]?.expiresAt?.toISOString() || null,
        children: (p.parentProfile?.studentLinks || []).map((sl) => ({
          linkId: sl.id,
          relationship: sl.relationship,
          studentId: sl.student.id,
          matricule: sl.student.matricule,
          firstName: sl.student.firstName,
          lastName: sl.student.lastName,
        })),
      })),
      students: students.map((s) => ({
        id: s.id,
        matricule: s.matricule,
        firstName: s.firstName,
        lastName: s.lastName,
        birthDate: formatDateIso(s.birthDate),
        enrollments: s.enrollments.map((e) => ({
          id: e.id,
          schoolYearId: e.schoolYearId,
          schoolYearLabel: e.schoolYear.label,
          classroomId: e.classroomId,
          classroomName: e.classroom.name,
          level: e.classroom.level,
        })),
        parents: s.parentLinks.map((pl) => ({
          linkId: pl.id,
          parentProfileId: pl.parentId,
          relationship: pl.relationship,
          parentName: `${pl.parent.user.firstName} ${pl.parent.user.lastName}`,
        })),
        termReports: s.termReports.map((tr) => ({
          id: tr.id,
          termId: tr.termId,
          justifiedAbsences: tr.justifiedAbsences,
          unjustifiedAbsences: tr.unjustifiedAbsences,
          lateCount: tr.lateCount,
          generalRemark: tr.generalRemark || "",
        })),
      })),
    });
  } catch (err) {
    return next(err);
  }
});

/**
 * PUT /api/admin/settings
 * Met à jour le nom de l'établissement et l'affichage des absences / remarques.
 */
router.put("/settings", async (req, res, next) => {
  try {
    const schoolName = normalizeText(req.body?.schoolName, "Nom de l'établissement", {
      min: 2,
      max: 120,
    });
    const showAbsences = Boolean(req.body?.showAbsences);
    const showRemarks = Boolean(req.body?.showRemarks);

    const updated = await prisma.schoolSettings.upsert({
      where: { id: 1 },
      create: { id: 1, schoolName, showAbsences, showRemarks },
      update: { schoolName, showAbsences, showRemarks },
    });

    logInfo("Mise a jour des parametres de l'etablissement");
    return res.json({ settings: updated });
  } catch (err) {
    return next(err);
  }
});

// ============================================================================
// ANNÉES SCOLAIRES & TRIMESTRES
// ============================================================================

router.post("/school-years", async (req, res, next) => {
  try {
    const label = normalizeText(req.body?.label, "Libellé de l'année scolaire", {
      min: 4,
      max: 30,
    });
    const { date: startDate } = parseIsoDate(req.body?.startDate, "Date de début");
    const { date: endDate } = parseIsoDate(req.body?.endDate, "Date de fin");
    const isCurrent = Boolean(req.body?.isCurrent);
    const createDefaultTerms = req.body?.createDefaultTerms !== false;

    if (endDate <= startDate) {
      throw new AppError("La date de fin doit être postérieure à la date de début.", 400);
    }

    const existing = await prisma.schoolYear.findUnique({ where: { label } });
    if (existing) {
      throw new AppError(`L'année scolaire « ${label} » existe déjà.`, 409);
    }

    const created = await prisma.$transaction(async (tx) => {
      if (isCurrent) {
        await tx.schoolYear.updateMany({ data: { isCurrent: false } });
      }
      const sy = await tx.schoolYear.create({
        data: { label, startDate, endDate, isCurrent },
      });

      if (createDefaultTerms) {
        await tx.term.createMany({
          data: [
            { schoolYearId: sy.id, name: "1er Trimestre", orderIndex: 1, isPublished: true },
            { schoolYearId: sy.id, name: "2e Trimestre", orderIndex: 2, isPublished: true },
            { schoolYearId: sy.id, name: "3e Trimestre", orderIndex: 3, isPublished: true },
          ],
        });
      }
      return sy;
    });

    return res.status(201).json({ schoolYear: created });
  } catch (err) {
    return next(err);
  }
});

router.patch("/school-years/:id/activate", async (req, res, next) => {
  try {
    const id = parsePositiveInt(req.params.id, "Année scolaire");
    await prisma.$transaction([
      prisma.schoolYear.updateMany({ data: { isCurrent: false } }),
      prisma.schoolYear.update({ where: { id }, data: { isCurrent: true } }),
    ]);
    return res.json({ ok: true });
  } catch (err) {
    return next(err);
  }
});

router.delete("/school-years/:id", async (req, res, next) => {
  try {
    const id = parsePositiveInt(req.params.id, "Année scolaire");
    await prisma.schoolYear.delete({ where: { id } });
    return res.json({ ok: true });
  } catch (err) {
    return next(err);
  }
});

router.post("/terms", async (req, res, next) => {
  try {
    const schoolYearId = parsePositiveInt(req.body?.schoolYearId, "Année scolaire");
    const name = normalizeText(req.body?.name, "Nom de la période", { min: 2, max: 60 });
    const orderIndex = parsePositiveInt(req.body?.orderIndex, "Ordre de la période");
    const isPublished = req.body?.isPublished !== false;

    const created = await prisma.term.create({
      data: { schoolYearId, name, orderIndex, isPublished },
    });
    return res.status(201).json({ term: created });
  } catch (err) {
    return next(err);
  }
});

router.patch("/terms/:id", async (req, res, next) => {
  try {
    const id = parsePositiveInt(req.params.id, "Période scolaire");
    const data = {};
    if (req.body?.name !== undefined) {
      data.name = normalizeText(req.body.name, "Nom de la période", { min: 2, max: 60 });
    }
    if (req.body?.isPublished !== undefined) {
      data.isPublished = Boolean(req.body.isPublished);
    }
    const updated = await prisma.term.update({ where: { id }, data });
    return res.json({ term: updated });
  } catch (err) {
    return next(err);
  }
});

router.delete("/terms/:id", async (req, res, next) => {
  try {
    const id = parsePositiveInt(req.params.id, "Période scolaire");
    await prisma.term.delete({ where: { id } });
    return res.json({ ok: true });
  } catch (err) {
    return next(err);
  }
});

// ============================================================================
// MATIÈRES, CLASSES & AFFECTATIONS
// ============================================================================

router.post("/subjects", async (req, res, next) => {
  try {
    const code = normalizeText(req.body?.code, "Code matière", { min: 2, max: 15 }).toUpperCase();
    const name = normalizeText(req.body?.name, "Nom de la matière", { min: 2, max: 80 });

    const duplicate = await prisma.subject.findFirst({
      where: { OR: [{ code }, { name }] },
    });
    if (duplicate) {
      throw new AppError("Une matière avec ce code ou ce nom existe déjà.", 409);
    }

    const created = await prisma.subject.create({ data: { code, name } });
    return res.status(201).json({ subject: created });
  } catch (err) {
    return next(err);
  }
});

router.put("/subjects/:id", async (req, res, next) => {
  try {
    const id = parsePositiveInt(req.params.id, "Matière");
    const code = normalizeText(req.body?.code, "Code matière", { min: 2, max: 15 }).toUpperCase();
    const name = normalizeText(req.body?.name, "Nom de la matière", { min: 2, max: 80 });

    const updated = await prisma.subject.update({
      where: { id },
      data: { code, name },
    });
    return res.json({ subject: updated });
  } catch (err) {
    return next(err);
  }
});

router.delete("/subjects/:id", async (req, res, next) => {
  try {
    const id = parsePositiveInt(req.params.id, "Matière");
    const usedCount = await prisma.classSubject.count({ where: { subjectId: id } });
    if (usedCount > 0) {
      throw new AppError(
        "Impossible de supprimer cette matière car elle est déjà rattachée à une ou plusieurs classes.",
        409
      );
    }
    await prisma.subject.delete({ where: { id } });
    return res.json({ ok: true });
  } catch (err) {
    return next(err);
  }
});

router.post("/classrooms", async (req, res, next) => {
  try {
    const schoolYearId = parsePositiveInt(req.body?.schoolYearId, "Année scolaire");
    const name = normalizeText(req.body?.name, "Nom de la classe", { min: 2, max: 40 });
    const level = normalizeText(req.body?.level, "Niveau", { min: 1, max: 30 });

    const duplicate = await prisma.classroom.findUnique({
      where: { schoolYearId_name: { schoolYearId, name } },
    });
    if (duplicate) {
      throw new AppError(`La classe « ${name} » existe déjà pour cette année scolaire.`, 409);
    }

    const created = await prisma.classroom.create({
      data: { schoolYearId, name, level },
    });
    return res.status(201).json({ classroom: created });
  } catch (err) {
    return next(err);
  }
});

router.put("/classrooms/:id", async (req, res, next) => {
  try {
    const id = parsePositiveInt(req.params.id, "Classe");
    const name = normalizeText(req.body?.name, "Nom de la classe", { min: 2, max: 40 });
    const level = normalizeText(req.body?.level, "Niveau", { min: 1, max: 30 });

    const updated = await prisma.classroom.update({
      where: { id },
      data: { name, level },
    });
    return res.json({ classroom: updated });
  } catch (err) {
    return next(err);
  }
});

router.delete("/classrooms/:id", async (req, res, next) => {
  try {
    const id = parsePositiveInt(req.params.id, "Classe");
    await prisma.classroom.delete({ where: { id } });
    return res.json({ ok: true });
  } catch (err) {
    return next(err);
  }
});

router.post("/class-subjects", async (req, res, next) => {
  try {
    const classroomId = parsePositiveInt(req.body?.classroomId, "Classe");
    const subjectId = parsePositiveInt(req.body?.subjectId, "Matière");
    const coefficient = validateCoefficient(req.body?.coefficient);
    const teacherId = req.body?.teacherId
      ? parsePositiveInt(req.body.teacherId, "Enseignant")
      : null;

    const existing = await prisma.classSubject.findUnique({
      where: { classroomId_subjectId: { classroomId, subjectId } },
    });
    if (existing) {
      throw new AppError("Cette matière est déjà enregistrée dans cette classe.", 409);
    }

    const created = await prisma.classSubject.create({
      data: { classroomId, subjectId, coefficient, teacherId },
    });
    return res.status(201).json({ classSubject: created });
  } catch (err) {
    return next(err);
  }
});

router.put("/class-subjects/:id", async (req, res, next) => {
  try {
    const id = parsePositiveInt(req.params.id, "Affectation matière");
    const coefficient = validateCoefficient(req.body?.coefficient);
    const teacherId = req.body?.teacherId
      ? parsePositiveInt(req.body.teacherId, "Enseignant")
      : null;

    const updated = await prisma.classSubject.update({
      where: { id },
      data: { coefficient, teacherId },
    });
    return res.json({ classSubject: updated });
  } catch (err) {
    return next(err);
  }
});

router.delete("/class-subjects/:id", async (req, res, next) => {
  try {
    const id = parsePositiveInt(req.params.id, "Affectation matière");
    await prisma.classSubject.delete({ where: { id } });
    return res.json({ ok: true });
  } catch (err) {
    return next(err);
  }
});

// ============================================================================
// ÉLÈVES, INSCRIPTIONS & VIE SCOLAIRE (ABSENCES / REMARQUES)
// ============================================================================

router.post("/students", async (req, res, next) => {
  try {
    const matricule = normalizeMatricule(req.body?.matricule);
    const lastName = normalizeText(req.body?.lastName, "Nom de famille", { min: 1, max: 80 });
    const firstName = normalizeText(req.body?.firstName, "Prénoms", { min: 1, max: 100 });
    const { date: birthDate } = parseIsoDate(req.body?.birthDate, "Date de naissance");
    const classroomId = req.body?.classroomId
      ? parsePositiveInt(req.body.classroomId, "Classe")
      : null;

    const existing = await prisma.student.findUnique({ where: { matricule } });
    if (existing) {
      throw new AppError(`Un élève avec le matricule « ${matricule} » existe déjà.`, 409);
    }

    const created = await prisma.$transaction(async (tx) => {
      const student = await tx.student.create({
        data: { matricule, lastName, firstName, birthDate },
      });

      if (classroomId) {
        const classroom = await tx.classroom.findUnique({ where: { id: classroomId } });
        if (!classroom) {
          throw new AppError("Classe introuvable.", 404);
        }
        await tx.enrollment.create({
          data: {
            studentId: student.id,
            classroomId: classroom.id,
            schoolYearId: classroom.schoolYearId,
          },
        });
      }

      return student;
    });

    logInfo("Creation d'un dossier eleve par l'administrateur");
    return res.status(201).json({
      student: {
        id: created.id,
        matricule: created.matricule,
        firstName: created.firstName,
        lastName: created.lastName,
      },
    });
  } catch (err) {
    return next(err);
  }
});

router.put("/students/:id", async (req, res, next) => {
  try {
    const id = parsePositiveInt(req.params.id, "Élève");
    const matricule = normalizeMatricule(req.body?.matricule);
    const lastName = normalizeText(req.body?.lastName, "Nom de famille", { min: 1, max: 80 });
    const firstName = normalizeText(req.body?.firstName, "Prénoms", { min: 1, max: 100 });
    const { date: birthDate } = parseIsoDate(req.body?.birthDate, "Date de naissance");
    const classroomId = req.body?.classroomId
      ? parsePositiveInt(req.body.classroomId, "Classe")
      : null;

    const conflict = await prisma.student.findFirst({
      where: { matricule, id: { not: id } },
    });
    if (conflict) {
      throw new AppError(`Le matricule « ${matricule} » est déjà attribué à un autre élève.`, 409);
    }

    await prisma.$transaction(async (tx) => {
      await tx.student.update({
        where: { id },
        data: { matricule, lastName, firstName, birthDate },
      });

      if (classroomId) {
        const classroom = await tx.classroom.findUnique({ where: { id: classroomId } });
        if (!classroom) {
          throw new AppError("Classe introuvable.", 404);
        }
        await tx.enrollment.upsert({
          where: {
            studentId_schoolYearId: {
              studentId: id,
              schoolYearId: classroom.schoolYearId,
            },
          },
          create: {
            studentId: id,
            classroomId: classroom.id,
            schoolYearId: classroom.schoolYearId,
          },
          update: {
            classroomId: classroom.id,
          },
        });
      }
    });

    return res.json({ ok: true });
  } catch (err) {
    return next(err);
  }
});

router.delete("/students/:id", async (req, res, next) => {
  try {
    const id = parsePositiveInt(req.params.id, "Élève");
    await prisma.student.delete({ where: { id } });
    logInfo("Suppression d'un dossier eleve par l'administrateur");
    return res.json({ ok: true });
  } catch (err) {
    return next(err);
  }
});

router.put("/students/:studentId/term-report", async (req, res, next) => {
  try {
    const studentId = parsePositiveInt(req.params.studentId, "Élève");
    const termId = parsePositiveInt(req.body?.termId, "Trimestre");
    const justifiedAbsences = validateNonNegativeInt(
      req.body?.justifiedAbsences,
      "Absences justifiées"
    );
    const unjustifiedAbsences = validateNonNegativeInt(
      req.body?.unjustifiedAbsences,
      "Absences non justifiées"
    );
    const lateCount = validateNonNegativeInt(req.body?.lateCount, "Retards");
    const generalRemark = normalizeOptionalText(req.body?.generalRemark, { max: 500 });

    const saved = await prisma.studentTermReport.upsert({
      where: { studentId_termId: { studentId, termId } },
      create: {
        studentId,
        termId,
        justifiedAbsences,
        unjustifiedAbsences,
        lateCount,
        generalRemark,
      },
      update: {
        justifiedAbsences,
        unjustifiedAbsences,
        lateCount,
        generalRemark,
      },
    });

    return res.json({ termReport: saved });
  } catch (err) {
    return next(err);
  }
});

// ============================================================================
// COMPTES ENSEIGNANTS
// ============================================================================

router.post("/teachers", async (req, res, next) => {
  try {
    const firstName = normalizeText(req.body?.firstName, "Prénom", { min: 1, max: 80 });
    const lastName = normalizeText(req.body?.lastName, "Nom", { min: 1, max: 80 });
    const email = validateEmail(req.body?.email, { required: true });
    const password = validatePassword(req.body?.password);
    const phone = normalizeOptionalText(req.body?.phone, { max: 40 });
    const specialty = normalizeOptionalText(req.body?.specialty, { max: 80 });

    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) {
      throw new AppError(`Un compte avec l'adresse e-mail « ${email} » existe déjà.`, 409);
    }

    const passwordHash = await hashSecret(password);

    const created = await prisma.user.create({
      data: {
        role: "TEACHER",
        email,
        passwordHash,
        firstName,
        lastName,
        phone,
        isActive: true,
        teacherProfile: {
          create: { specialty },
        },
      },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        teacherProfile: { select: { id: true } },
      },
    });

    logInfo("Creation d'un compte enseignant par l'administrateur");
    return res.status(201).json({ teacher: created });
  } catch (err) {
    return next(err);
  }
});

router.put("/teachers/:userId", async (req, res, next) => {
  try {
    const userId = parsePositiveInt(req.params.userId, "Enseignant");
    const target = await prisma.user.findUnique({
      where: { id: userId },
      include: { teacherProfile: true },
    });
    if (!target || target.role !== "TEACHER") {
      throw new AppError("Compte enseignant introuvable.", 404);
    }

    const firstName = normalizeText(req.body?.firstName, "Prénom", { min: 1, max: 80 });
    const lastName = normalizeText(req.body?.lastName, "Nom", { min: 1, max: 80 });
    const email = validateEmail(req.body?.email, { required: true });
    const phone = normalizeOptionalText(req.body?.phone, { max: 40 });
    const specialty = normalizeOptionalText(req.body?.specialty, { max: 80 });
    const isActive = req.body?.isActive !== undefined ? Boolean(req.body.isActive) : target.isActive;

    const data = { firstName, lastName, email, phone, isActive };
    if (req.body?.newPassword) {
      const validatedPwd = validatePassword(req.body.newPassword);
      data.passwordHash = await hashSecret(validatedPwd);
    }

    await prisma.$transaction([
      prisma.user.update({ where: { id: userId }, data }),
      prisma.teacherProfile.update({
        where: { userId },
        data: { specialty },
      }),
    ]);

    return res.json({ ok: true });
  } catch (err) {
    return next(err);
  }
});

router.delete("/teachers/:userId", async (req, res, next) => {
  try {
    const userId = parsePositiveInt(req.params.userId, "Enseignant");
    const target = await prisma.user.findUnique({ where: { id: userId } });
    if (!target || target.role !== "TEACHER") {
      throw new AppError("Compte enseignant introuvable.", 404);
    }
    await prisma.user.delete({ where: { id: userId } });
    logInfo("Suppression d'un compte enseignant par l'administrateur");
    return res.json({ ok: true });
  } catch (err) {
    return next(err);
  }
});

// ============================================================================
// COMPTES PARENTS, LIENS PARENT-ENFANT & CODES À USAGE UNIQUE (OTP)
// ============================================================================

router.post("/parents", async (req, res, next) => {
  try {
    const firstName = normalizeText(req.body?.firstName, "Prénom", { min: 1, max: 80 });
    const lastName = normalizeText(req.body?.lastName, "Nom", { min: 1, max: 80 });
    const email = validateEmail(req.body?.email, { required: false });
    const phone = normalizeOptionalText(req.body?.phone, { max: 40 });
    const address = normalizeOptionalText(req.body?.address, { max: 200 });

    if (email) {
      const existing = await prisma.user.findUnique({ where: { email } });
      if (existing) {
        throw new AppError(`L'adresse e-mail « ${email} » est déjà utilisée.`, 409);
      }
    }

    const rawOtp = generateOtpCode();
    const otpHash = await hashSecret(normalizeOtpCode(rawOtp));
    const expiresAt = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000); // Valable 14 jours

    const created = await prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          role: "PARENT",
          email,
          firstName,
          lastName,
          phone,
          isActive: true,
          parentProfile: {
            create: {
              address,
              otpCodes: {
                create: {
                  codeHash: otpHash,
                  expiresAt,
                },
              },
            },
          },
        },
        include: {
          parentProfile: true,
        },
      });

      if (req.body?.studentId) {
        const studentId = parsePositiveInt(req.body.studentId, "Élève");
        const relationship = normalizeText(req.body?.relationship || "Parent", "Lien de parenté", {
          min: 2,
          max: 40,
        });
        await tx.parentStudentLink.create({
          data: {
            parentId: user.parentProfile.id,
            studentId,
            relationship,
          },
        });
      }

      return user;
    });

    logInfo("Creation d'un compte parent par l'administrateur");

    // Le code en clair est retourné UNE SEULE FOIS à l'administrateur pour remise au parent
    return res.status(201).json({
      parent: {
        userId: created.id,
        parentProfileId: created.parentProfile.id,
        firstName: created.firstName,
        lastName: created.lastName,
      },
      generatedOtp: {
        code: rawOtp,
        expiresAt: expiresAt.toISOString(),
      },
    });
  } catch (err) {
    return next(err);
  }
});

router.put("/parents/:userId", async (req, res, next) => {
  try {
    const userId = parsePositiveInt(req.params.userId, "Parent");
    const target = await prisma.user.findUnique({ where: { id: userId } });
    if (!target || target.role !== "PARENT") {
      throw new AppError("Compte parent introuvable.", 404);
    }

    const firstName = normalizeText(req.body?.firstName, "Prénom", { min: 1, max: 80 });
    const lastName = normalizeText(req.body?.lastName, "Nom", { min: 1, max: 80 });
    const email = validateEmail(req.body?.email, { required: false });
    const phone = normalizeOptionalText(req.body?.phone, { max: 40 });
    const address = normalizeOptionalText(req.body?.address, { max: 200 });
    const isActive = req.body?.isActive !== undefined ? Boolean(req.body.isActive) : target.isActive;

    await prisma.$transaction([
      prisma.user.update({
        where: { id: userId },
        data: { firstName, lastName, email, phone, isActive },
      }),
      prisma.parentProfile.update({
        where: { userId },
        data: { address },
      }),
    ]);

    return res.json({ ok: true });
  } catch (err) {
    return next(err);
  }
});

router.delete("/parents/:userId", async (req, res, next) => {
  try {
    const userId = parsePositiveInt(req.params.userId, "Parent");
    const target = await prisma.user.findUnique({ where: { id: userId } });
    if (!target || target.role !== "PARENT") {
      throw new AppError("Compte parent introuvable.", 404);
    }
    await prisma.user.delete({ where: { id: userId } });
    logInfo("Suppression d'un compte parent par l'administrateur");
    return res.json({ ok: true });
  } catch (err) {
    return next(err);
  }
});

router.post("/parent-links", async (req, res, next) => {
  try {
    const parentId = parsePositiveInt(req.body?.parentProfileId, "Parent");
    const studentId = parsePositiveInt(req.body?.studentId, "Élève");
    const relationship = normalizeText(req.body?.relationship || "Parent", "Lien de parenté", {
      min: 2,
      max: 40,
    });

    const duplicate = await prisma.parentStudentLink.findUnique({
      where: { parentId_studentId: { parentId, studentId } },
    });
    if (duplicate) {
      throw new AppError("Ce parent est déjà associé à cet élève.", 409);
    }

    const link = await prisma.parentStudentLink.create({
      data: { parentId, studentId, relationship },
    });

    logInfo("Association parent-eleve creee par l'administrateur");
    return res.status(201).json({ link });
  } catch (err) {
    return next(err);
  }
});

router.delete("/parent-links/:linkId", async (req, res, next) => {
  try {
    const linkId = parsePositiveInt(req.params.linkId, "Lien parent-élève");
    await prisma.parentStudentLink.delete({ where: { id: linkId } });
    logInfo("Association parent-eleve retiree par l'administrateur");
    return res.json({ ok: true });
  } catch (err) {
    return next(err);
  }
});

/**
 * POST /api/admin/parents/:parentProfileId/otp
 * Génère un nouveau code à usage unique pour un parent (invalide les anciens codes non utilisés).
 * Le code généré n'est JAMAIS journalisé ni stocké en clair en base de données.
 */
router.post("/parents/:parentProfileId/otp", async (req, res, next) => {
  try {
    const parentProfileId = parsePositiveInt(req.params.parentProfileId, "Profil parent");
    const validDays = req.body?.validDays
      ? validateNonNegativeInt(req.body.validDays, "Durée de validité (jours)", 90) || 14
      : 14;

    const parentProfile = await prisma.parentProfile.findUnique({
      where: { id: parentProfileId },
      include: { user: { select: { firstName: true, lastName: true } } },
    });

    if (!parentProfile) {
      throw new AppError("Profil parent introuvable.", 404);
    }

    const rawOtp = generateOtpCode();
    const codeHash = await hashSecret(normalizeOtpCode(rawOtp));
    const expiresAt = new Date(Date.now() + validDays * 24 * 60 * 60 * 1000);

    await prisma.$transaction([
      // Invalidation des codes précédents non utilisés pour garder un seul code actif propre
      prisma.parentOtpCode.updateMany({
        where: { parentId: parentProfileId, usedAt: null },
        data: { usedAt: new Date() },
      }),
      prisma.parentOtpCode.create({
        data: {
          parentId: parentProfileId,
          codeHash,
          expiresAt,
        },
      }),
    ]);

    logInfo("Nouveau code a usage unique genere par l'administrateur");

    return res.status(201).json({
      parentName: `${parentProfile.user.firstName} ${parentProfile.user.lastName}`,
      code: rawOtp,
      expiresAt: expiresAt.toISOString(),
    });
  } catch (err) {
    return next(err);
  }
});

// ============================================================================
// CONTRÔLE ET CORRECTION DES NOTES / BULLETINS PAR L'ADMINISTRATEUR
// ============================================================================

router.get("/students/:studentId/bulletin", async (req, res, next) => {
  try {
    const studentId = parsePositiveInt(req.params.studentId, "Élève");
    const termId = parsePositiveInt(req.query.termId, "Trimestre");

    const [student, term, settingsRow] = await Promise.all([
      prisma.student.findUnique({
        where: { id: studentId },
        select: { id: true, matricule: true, firstName: true, lastName: true },
      }),
      prisma.term.findUnique({
        where: { id: termId },
        include: { schoolYear: true },
      }),
      prisma.schoolSettings.findUnique({ where: { id: 1 } }),
    ]);

    if (!student) throw new AppError("Élève introuvable.", 404);
    if (!term) throw new AppError("Trimestre introuvable.", 404);

    const enrollment = await prisma.enrollment.findUnique({
      where: {
        studentId_schoolYearId: {
          studentId: student.id,
          schoolYearId: term.schoolYearId,
        },
      },
      include: {
        classroom: {
          include: {
            classSubjects: {
              orderBy: { subject: { name: "asc" } },
              include: {
                subject: true,
                teacher: {
                  include: {
                    user: { select: { firstName: true, lastName: true } },
                  },
                },
              },
            },
          },
        },
      },
    });

    if (!enrollment) {
      return res.json({
        student,
        term: { id: term.id, name: term.name, schoolYearLabel: term.schoolYear.label },
        enrolled: false,
        bulletin: null,
      });
    }

    const [grades, subjectRemarks, termReport] = await Promise.all([
      prisma.grade.findMany({
        where: {
          studentId: student.id,
          termId: term.id,
          classSubject: { classroomId: enrollment.classroomId },
        },
      }),
      prisma.subjectTermRemark.findMany({
        where: {
          studentId: student.id,
          termId: term.id,
          classSubject: { classroomId: enrollment.classroomId },
        },
      }),
      prisma.studentTermReport.findUnique({
        where: { studentId_termId: { studentId: student.id, termId: term.id } },
      }),
    ]);

    const bulletin = buildStudentBulletin({
      classSubjects: enrollment.classroom.classSubjects,
      grades,
      subjectRemarks,
      termReport,
      settings: settingsRow || { showAbsences: true, showRemarks: true },
    });

    return res.json({
      student,
      classroom: { id: enrollment.classroom.id, name: enrollment.classroom.name },
      term: { id: term.id, name: term.name, schoolYearLabel: term.schoolYear.label },
      enrolled: true,
      bulletin,
    });
  } catch (err) {
    return next(err);
  }
});

router.put("/grades/:gradeId", async (req, res, next) => {
  try {
    const gradeId = parsePositiveInt(req.params.gradeId, "Note");
    const existing = await prisma.grade.findUnique({ where: { id: gradeId } });
    if (!existing) {
      throw new AppError("Note introuvable.", 404);
    }

    const title = normalizeText(req.body?.title, "Intitulé de l'évaluation", { min: 2, max: 80 });
    const value = validateGradeValue(req.body?.value);
    const weight = validateWeight(req.body?.weight);
    const { date: evaluatedAt } = parseIsoDate(
      req.body?.evaluatedAt || formatDateIso(existing.evaluatedAt),
      "Date de l'évaluation"
    );

    const updated = await prisma.grade.update({
      where: { id: gradeId },
      data: { title, value, weight, evaluatedAt },
    });

    logInfo("Correction d'une note par l'administrateur");
    return res.json({
      grade: {
        id: updated.id,
        title: updated.title,
        value: updated.value,
        weight: updated.weight,
        evaluatedAt: formatDateIso(updated.evaluatedAt),
      },
    });
  } catch (err) {
    return next(err);
  }
});

router.delete("/grades/:gradeId", async (req, res, next) => {
  try {
    const gradeId = parsePositiveInt(req.params.gradeId, "Note");
    await prisma.grade.delete({ where: { id: gradeId } });
    logInfo("Suppression d'une note par l'administrateur");
    return res.json({ ok: true });
  } catch (err) {
    return next(err);
  }
});

export default router;
