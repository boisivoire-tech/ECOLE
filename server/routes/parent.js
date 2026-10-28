import express from "express";
import { prisma } from "../db.js";
import { requireAuth, requireRole } from "../middleware/auth.js";
import { buildStudentBulletin } from "../utils/grades.js";
import { AppError, parsePositiveInt } from "../utils/validation.js";

const router = express.Router();

router.use(requireAuth, requireRole("PARENT"));

async function getSettings() {
  const settings = await prisma.schoolSettings.findUnique({ where: { id: 1 } });
  return (
    settings || {
      schoolName: "Portail scolaire",
      showAbsences: true,
      showRemarks: true,
    }
  );
}

/**
 * GET /api/parent/dashboard
 * Renvoie la liste des enfants explicitement associés au parent connecté,
 * les années scolaires et périodes publiées, ainsi qu'un aperçu des résultats.
 */
router.get("/dashboard", async (req, res, next) => {
  try {
    const parentProfileId = req.currentUser.parentProfile?.id;
    if (!parentProfileId) {
      return res.status(403).json({ error: "Profil parent introuvable." });
    }

    const [settings, schoolYears, links] = await Promise.all([
      getSettings(),
      prisma.schoolYear.findMany({
        orderBy: { startDate: "desc" },
        include: {
          terms: {
            where: { isPublished: true },
            orderBy: { orderIndex: "asc" },
          },
        },
      }),
      prisma.parentStudentLink.findMany({
        where: { parentId: parentProfileId },
        orderBy: { createdAt: "asc" },
        include: {
          student: {
            include: {
              enrollments: {
                include: {
                  classroom: {
                    include: {
                      classSubjects: {
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
                  schoolYear: true,
                },
              },
            },
          },
        },
      }),
    ]);

    const defaultSchoolYear =
      schoolYears.find((sy) => sy.isCurrent) || schoolYears[0] || null;
    const defaultTerm =
      defaultSchoolYear?.terms?.[0] || null;

    const children = await Promise.all(
      links.map(async (link) => {
        const student = link.student;
        const currentEnrollment = defaultSchoolYear
          ? student.enrollments.find((e) => e.schoolYearId === defaultSchoolYear.id)
          : student.enrollments[0] || null;

        let quickSummary = null;
        if (currentEnrollment && defaultTerm) {
          const [grades, subjectRemarks, termReport] = await Promise.all([
            prisma.grade.findMany({
              where: {
                studentId: student.id,
                termId: defaultTerm.id,
                classSubject: { classroomId: currentEnrollment.classroomId },
              },
            }),
            settings.showRemarks
              ? prisma.subjectTermRemark.findMany({
                  where: {
                    studentId: student.id,
                    termId: defaultTerm.id,
                    classSubject: { classroomId: currentEnrollment.classroomId },
                  },
                })
              : Promise.resolve([]),
            settings.showAbsences || settings.showRemarks
              ? prisma.studentTermReport.findUnique({
                  where: {
                    studentId_termId: {
                      studentId: student.id,
                      termId: defaultTerm.id,
                    },
                  },
                })
              : Promise.resolve(null),
          ]);

          const bulletin = buildStudentBulletin({
            classSubjects: currentEnrollment.classroom.classSubjects,
            grades,
            subjectRemarks,
            termReport,
            settings,
          });

          quickSummary = {
            schoolYearLabel: defaultSchoolYear.label,
            termName: defaultTerm.name,
            generalAverage: bulletin.summary.generalAverage,
            mention: bulletin.summary.mention,
            evaluatedSubjectsCount: bulletin.summary.evaluatedSubjectsCount,
            totalSubjectsCount: bulletin.summary.totalSubjectsCount,
            lastUpdatedAt: bulletin.summary.lastUpdatedAt,
          };
        }

        return {
          id: student.id,
          matricule: student.matricule,
          firstName: student.firstName,
          lastName: student.lastName,
          relationship: link.relationship,
          enrollments: student.enrollments.map((e) => ({
            schoolYearId: e.schoolYearId,
            schoolYearLabel: e.schoolYear.label,
            classroomId: e.classroomId,
            classroomName: e.classroom.name,
            level: e.classroom.level,
          })),
          currentClassroom: currentEnrollment
            ? {
                name: currentEnrollment.classroom.name,
                level: currentEnrollment.classroom.level,
                schoolYearLabel: currentEnrollment.schoolYear.label,
              }
            : null,
          quickSummary,
        };
      })
    );

    return res.json({
      schoolName: settings.schoolName,
      visibility: {
        showAbsences: settings.showAbsences,
        showRemarks: settings.showRemarks,
      },
      schoolYears: schoolYears.map((sy) => ({
        id: sy.id,
        label: sy.label,
        isCurrent: sy.isCurrent,
        terms: sy.terms.map((t) => ({
          id: t.id,
          name: t.name,
          orderIndex: t.orderIndex,
        })),
      })),
      defaultSchoolYearId: defaultSchoolYear?.id || null,
      defaultTermId: defaultTerm?.id || null,
      children,
    });
  } catch (err) {
    return next(err);
  }
});

/**
 * GET /api/parent/children/:studentId/results
 * Renvoie le bulletin complet d'un enfant associé pour l'année et le trimestre choisis.
 * Bloque strictement toute tentative d'accès à un autre élève.
 */
router.get("/children/:studentId/results", async (req, res, next) => {
  try {
    const parentProfileId = req.currentUser.parentProfile?.id;
    const studentId = parsePositiveInt(req.params.studentId, "Élève");

    // Contrôle strict d'autorisation : ce parent est-il bien lié à cet élève ?
    const link = await prisma.parentStudentLink.findUnique({
      where: {
        parentId_studentId: {
          parentId: parentProfileId,
          studentId,
        },
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
    });

    if (!link) {
      return res.status(403).json({
        error: "Accès refusé : vous n'êtes pas autorisé à consulter les résultats de cet élève.",
      });
    }

    const settings = await getSettings();

    let schoolYear = null;
    if (req.query.schoolYearId) {
      const syId = parsePositiveInt(req.query.schoolYearId, "Année scolaire");
      schoolYear = await prisma.schoolYear.findUnique({
        where: { id: syId },
        include: {
          terms: {
            where: { isPublished: true },
            orderBy: { orderIndex: "asc" },
          },
        },
      });
    } else {
      schoolYear =
        (await prisma.schoolYear.findFirst({
          where: { isCurrent: true },
          include: {
            terms: {
              where: { isPublished: true },
              orderBy: { orderIndex: "asc" },
            },
          },
        })) ||
        (await prisma.schoolYear.findFirst({
          orderBy: { startDate: "desc" },
          include: {
            terms: {
              where: { isPublished: true },
              orderBy: { orderIndex: "asc" },
            },
          },
        }));
    }

    if (!schoolYear) {
      throw new AppError("Aucune année scolaire disponible.", 404);
    }

    let term = null;
    if (req.query.termId) {
      const tId = parsePositiveInt(req.query.termId, "Trimestre");
      term = schoolYear.terms.find((t) => t.id === tId) || null;
      if (!term) {
        throw new AppError("Ce trimestre n'est pas disponible ou n'est pas encore publié.", 404);
      }
    } else {
      term = schoolYear.terms[0] || null;
    }

    const enrollment = await prisma.enrollment.findUnique({
      where: {
        studentId_schoolYearId: {
          studentId: link.student.id,
          schoolYearId: schoolYear.id,
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
        student: link.student,
        relationship: link.relationship,
        schoolYear: { id: schoolYear.id, label: schoolYear.label },
        term: term ? { id: term.id, name: term.name } : null,
        enrolled: false,
        classroom: null,
        bulletin: null,
      });
    }

    if (!term) {
      return res.json({
        student: link.student,
        relationship: link.relationship,
        schoolYear: { id: schoolYear.id, label: schoolYear.label },
        term: null,
        enrolled: true,
        classroom: {
          id: enrollment.classroom.id,
          name: enrollment.classroom.name,
          level: enrollment.classroom.level,
        },
        bulletin: null,
      });
    }

    const [grades, subjectRemarks, termReport] = await Promise.all([
      prisma.grade.findMany({
        where: {
          studentId: link.student.id,
          termId: term.id,
          classSubject: { classroomId: enrollment.classroomId },
        },
      }),
      settings.showRemarks
        ? prisma.subjectTermRemark.findMany({
            where: {
              studentId: link.student.id,
              termId: term.id,
              classSubject: { classroomId: enrollment.classroomId },
            },
          })
        : Promise.resolve([]),
      settings.showAbsences || settings.showRemarks
        ? prisma.studentTermReport.findUnique({
            where: {
              studentId_termId: {
                studentId: link.student.id,
                termId: term.id,
              },
            },
          })
        : Promise.resolve(null),
    ]);

    const bulletin = buildStudentBulletin({
      classSubjects: enrollment.classroom.classSubjects,
      grades,
      subjectRemarks,
      termReport,
      settings,
    });

    return res.json({
      student: link.student,
      relationship: link.relationship,
      schoolYear: { id: schoolYear.id, label: schoolYear.label },
      term: { id: term.id, name: term.name, orderIndex: term.orderIndex },
      enrolled: true,
      classroom: {
        id: enrollment.classroom.id,
        name: enrollment.classroom.name,
        level: enrollment.classroom.level,
      },
      bulletin,
    });
  } catch (err) {
    return next(err);
  }
});

export default router;
