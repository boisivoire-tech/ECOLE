import express from "express";
import { prisma } from "../db.js";
import { requireAuth, requireRole } from "../middleware/auth.js";
import { computeSubjectAverage } from "../utils/grades.js";
import {
  AppError,
  formatDateIso,
  normalizeOptionalText,
  normalizeText,
  parseIsoDate,
  parsePositiveInt,
  validateGradeValue,
  validateWeight,
} from "../utils/validation.js";

const router = express.Router();

router.use(requireAuth, requireRole("TEACHER"));

async function getAuthorizedClassSubject(teacherProfileId, classSubjectId) {
  const cs = await prisma.classSubject.findUnique({
    where: { id: classSubjectId },
    include: {
      subject: true,
      classroom: {
        include: {
          schoolYear: {
            include: {
              terms: { orderBy: { orderIndex: "asc" } },
            },
          },
        },
      },
    },
  });

  if (!cs || cs.teacherId !== teacherProfileId) {
    throw new AppError(
      "Accès refusé : vous n'êtes pas autorisé à consulter ou modifier les notes de cette classe/matière.",
      403
    );
  }
  return cs;
}

/**
 * GET /api/teacher/assignments
 * Renvoie uniquement les classes et matières confiées à l'enseignant connecté.
 */
router.get("/assignments", async (req, res, next) => {
  try {
    const teacherProfileId = req.currentUser.teacherProfile?.id;
    if (!teacherProfileId) {
      return res.status(403).json({ error: "Profil enseignant introuvable." });
    }

    const assignments = await prisma.classSubject.findMany({
      where: { teacherId: teacherProfileId },
      include: {
        subject: true,
        classroom: {
          include: {
            schoolYear: {
              include: {
                terms: { orderBy: { orderIndex: "asc" } },
              },
            },
            _count: { select: { enrollments: true } },
          },
        },
      },
      orderBy: [
        { classroom: { schoolYear: { startDate: "desc" } } },
        { classroom: { name: "asc" } },
        { subject: { name: "asc" } },
      ],
    });

    return res.json({
      assignments: assignments.map((a) => ({
        classSubjectId: a.id,
        coefficient: a.coefficient,
        subject: {
          id: a.subject.id,
          code: a.subject.code,
          name: a.subject.name,
        },
        classroom: {
          id: a.classroom.id,
          name: a.classroom.name,
          level: a.classroom.level,
          studentCount: a.classroom._count.enrollments,
        },
        schoolYear: {
          id: a.classroom.schoolYear.id,
          label: a.classroom.schoolYear.label,
          isCurrent: a.classroom.schoolYear.isCurrent,
          terms: a.classroom.schoolYear.terms.map((t) => ({
            id: t.id,
            name: t.name,
            orderIndex: t.orderIndex,
            isPublished: t.isPublished,
          })),
        },
      })),
    });
  } catch (err) {
    return next(err);
  }
});

/**
 * GET /api/teacher/assignments/:classSubjectId/students?termId=...
 * Liste les élèves inscrits dans cette classe avec leurs notes pour la matière et le trimestre.
 */
router.get("/assignments/:classSubjectId/students", async (req, res, next) => {
  try {
    const teacherProfileId = req.currentUser.teacherProfile?.id;
    const classSubjectId = parsePositiveInt(req.params.classSubjectId, "Affectation");

    const cs = await getAuthorizedClassSubject(teacherProfileId, classSubjectId);

    const terms = cs.classroom.schoolYear.terms;
    let selectedTerm = null;
    if (req.query.termId) {
      const termId = parsePositiveInt(req.query.termId, "Trimestre");
      selectedTerm = terms.find((t) => t.id === termId) || null;
      if (!selectedTerm) {
        throw new AppError("Trimestre invalide pour cette année scolaire.", 400);
      }
    } else {
      selectedTerm = terms[0] || null;
    }

    if (!selectedTerm) {
      throw new AppError("Aucun trimestre n'est configuré pour cette année scolaire.", 400);
    }

    const [enrollments, grades, remarks] = await Promise.all([
      prisma.enrollment.findMany({
        where: {
          classroomId: cs.classroomId,
          schoolYearId: cs.classroom.schoolYearId,
        },
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
        orderBy: [
          { student: { lastName: "asc" } },
          { student: { firstName: "asc" } },
        ],
      }),
      prisma.grade.findMany({
        where: {
          classSubjectId: cs.id,
          termId: selectedTerm.id,
        },
        orderBy: [{ evaluatedAt: "asc" }, { id: "asc" }],
      }),
      prisma.subjectTermRemark.findMany({
        where: {
          classSubjectId: cs.id,
          termId: selectedTerm.id,
        },
      }),
    ]);

    const gradesByStudent = new Map();
    for (const g of grades) {
      const arr = gradesByStudent.get(g.studentId) || [];
      arr.push(g);
      gradesByStudent.set(g.studentId, arr);
    }

    const remarkByStudent = new Map();
    for (const r of remarks) {
      remarkByStudent.set(r.studentId, r.remark);
    }

    const students = enrollments.map((enr) => {
      const stGrades = gradesByStudent.get(enr.student.id) || [];
      return {
        id: enr.student.id,
        matricule: enr.student.matricule,
        firstName: enr.student.firstName,
        lastName: enr.student.lastName,
        grades: stGrades.map((g) => ({
          id: g.id,
          title: g.title,
          value: g.value,
          weight: g.weight,
          evaluatedAt: formatDateIso(g.evaluatedAt),
          updatedAt: g.updatedAt.toISOString(),
        })),
        subjectAverage: computeSubjectAverage(stGrades),
        subjectRemark: remarkByStudent.get(enr.student.id) || "",
      };
    });

    return res.json({
      assignment: {
        classSubjectId: cs.id,
        coefficient: cs.coefficient,
        subjectName: cs.subject.name,
        subjectCode: cs.subject.code,
        classroomName: cs.classroom.name,
        schoolYearLabel: cs.classroom.schoolYear.label,
      },
      term: {
        id: selectedTerm.id,
        name: selectedTerm.name,
      },
      students,
    });
  } catch (err) {
    return next(err);
  }
});

/**
 * POST /api/teacher/grades
 * Ajoute une nouvelle note pour un élève autorisé.
 */
router.post("/grades", async (req, res, next) => {
  try {
    const teacherProfileId = req.currentUser.teacherProfile?.id;
    const classSubjectId = parsePositiveInt(req.body?.classSubjectId, "Affectation");
    const studentId = parsePositiveInt(req.body?.studentId, "Élève");
    const termId = parsePositiveInt(req.body?.termId, "Trimestre");
    const title = normalizeText(req.body?.title, "Intitulé de l'évaluation", { min: 2, max: 80 });
    const value = validateGradeValue(req.body?.value);
    const weight = validateWeight(req.body?.weight);

    const todayIso = new Date().toISOString().slice(0, 10);
    const { date: evaluatedAt } = parseIsoDate(
      req.body?.evaluatedAt || todayIso,
      "Date de l'évaluation"
    );

    const cs = await getAuthorizedClassSubject(teacherProfileId, classSubjectId);

    const validTerm = cs.classroom.schoolYear.terms.find((t) => t.id === termId);
    if (!validTerm) {
      throw new AppError("Ce trimestre n'appartient pas à l'année scolaire de la classe.", 400);
    }

    const enrollment = await prisma.enrollment.findUnique({
      where: {
        studentId_schoolYearId: {
          studentId,
          schoolYearId: cs.classroom.schoolYearId,
        },
      },
    });

    if (!enrollment || enrollment.classroomId !== cs.classroomId) {
      throw new AppError("Accès refusé : cet élève n'est pas inscrit dans votre classe.", 403);
    }

    const duplicate = await prisma.grade.findUnique({
      where: {
        studentId_classSubjectId_termId_title: {
          studentId,
          classSubjectId,
          termId,
          title,
        },
      },
    });

    if (duplicate) {
      throw new AppError(
        `Une note intitulée « ${title} » existe déjà pour cet élève sur ce trimestre. Modifiez la note existante ou choisissez un autre intitulé.`,
        409
      );
    }

    const created = await prisma.grade.create({
      data: {
        studentId,
        classSubjectId,
        termId,
        recordedByTeacherId: teacherProfileId,
        title,
        value,
        weight,
        evaluatedAt,
      },
    });

    return res.status(201).json({
      grade: {
        id: created.id,
        title: created.title,
        value: created.value,
        weight: created.weight,
        evaluatedAt: formatDateIso(created.evaluatedAt),
        updatedAt: created.updatedAt.toISOString(),
      },
    });
  } catch (err) {
    return next(err);
  }
});

/**
 * PUT /api/teacher/grades/:gradeId
 * Corrige une note existante dans l'une des matières/classes de l'enseignant.
 */
router.put("/grades/:gradeId", async (req, res, next) => {
  try {
    const teacherProfileId = req.currentUser.teacherProfile?.id;
    const gradeId = parsePositiveInt(req.params.gradeId, "Note");

    const existing = await prisma.grade.findUnique({
      where: { id: gradeId },
      include: { classSubject: true },
    });

    if (!existing) {
      throw new AppError("Note introuvable.", 404);
    }
    if (existing.classSubject.teacherId !== teacherProfileId) {
      throw new AppError("Accès refusé : vous ne pouvez pas modifier cette note.", 403);
    }

    const title = normalizeText(req.body?.title, "Intitulé de l'évaluation", { min: 2, max: 80 });
    const value = validateGradeValue(req.body?.value);
    const weight = validateWeight(req.body?.weight);
    const { date: evaluatedAt } = parseIsoDate(
      req.body?.evaluatedAt || formatDateIso(existing.evaluatedAt),
      "Date de l'évaluation"
    );

    const conflict = await prisma.grade.findFirst({
      where: {
        id: { not: gradeId },
        studentId: existing.studentId,
        classSubjectId: existing.classSubjectId,
        termId: existing.termId,
        title,
      },
    });

    if (conflict) {
      throw new AppError(
        `Une autre note intitulée « ${title} » existe déjà pour cet élève sur ce trimestre.`,
        409
      );
    }

    const updated = await prisma.grade.update({
      where: { id: gradeId },
      data: {
        title,
        value,
        weight,
        evaluatedAt,
        recordedByTeacherId: teacherProfileId,
      },
    });

    return res.json({
      grade: {
        id: updated.id,
        title: updated.title,
        value: updated.value,
        weight: updated.weight,
        evaluatedAt: formatDateIso(updated.evaluatedAt),
        updatedAt: updated.updatedAt.toISOString(),
      },
    });
  } catch (err) {
    return next(err);
  }
});

/**
 * DELETE /api/teacher/grades/:gradeId
 * Supprime une note appartenant à une classe/matière de l'enseignant.
 */
router.delete("/grades/:gradeId", async (req, res, next) => {
  try {
    const teacherProfileId = req.currentUser.teacherProfile?.id;
    const gradeId = parsePositiveInt(req.params.gradeId, "Note");

    const existing = await prisma.grade.findUnique({
      where: { id: gradeId },
      include: { classSubject: true },
    });

    if (!existing) {
      throw new AppError("Note introuvable.", 404);
    }
    if (existing.classSubject.teacherId !== teacherProfileId) {
      throw new AppError("Accès refusé : vous ne pouvez pas supprimer cette note.", 403);
    }

    await prisma.grade.delete({ where: { id: gradeId } });
    return res.json({ ok: true });
  } catch (err) {
    return next(err);
  }
});

/**
 * PUT /api/teacher/remarks
 * Enregistre ou met à jour l'appréciation d'un élève dans la matière de l'enseignant.
 */
router.put("/remarks", async (req, res, next) => {
  try {
    const teacherProfileId = req.currentUser.teacherProfile?.id;
    const classSubjectId = parsePositiveInt(req.body?.classSubjectId, "Affectation");
    const studentId = parsePositiveInt(req.body?.studentId, "Élève");
    const termId = parsePositiveInt(req.body?.termId, "Trimestre");
    const remark = normalizeOptionalText(req.body?.remark, { max: 300 });

    const cs = await getAuthorizedClassSubject(teacherProfileId, classSubjectId);
    const validTerm = cs.classroom.schoolYear.terms.find((t) => t.id === termId);
    if (!validTerm) {
      throw new AppError("Trimestre invalide.", 400);
    }

    const enrollment = await prisma.enrollment.findUnique({
      where: {
        studentId_schoolYearId: {
          studentId,
          schoolYearId: cs.classroom.schoolYearId,
        },
      },
    });

    if (!enrollment || enrollment.classroomId !== cs.classroomId) {
      throw new AppError("Accès refusé : cet élève n'appartient pas à cette classe.", 403);
    }

    if (!remark) {
      await prisma.subjectTermRemark.deleteMany({
        where: { studentId, classSubjectId, termId },
      });
      return res.json({ remark: "" });
    }

    const saved = await prisma.subjectTermRemark.upsert({
      where: {
        studentId_classSubjectId_termId: {
          studentId,
          classSubjectId,
          termId,
        },
      },
      create: { studentId, classSubjectId, termId, remark },
      update: { remark },
    });

    return res.json({ remark: saved.remark });
  } catch (err) {
    return next(err);
  }
});

export default router;
