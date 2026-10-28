import { formatDateIso } from "./validation.js";

export function round2(value) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

export function computeSubjectAverage(grades) {
  if (!Array.isArray(grades) || grades.length === 0) {
    return null;
  }
  let weightedSum = 0;
  let totalWeight = 0;
  for (const g of grades) {
    const w = Number(g.weight) > 0 ? Number(g.weight) : 1;
    weightedSum += Number(g.value) * w;
    totalWeight += w;
  }
  if (totalWeight <= 0) return null;
  return round2(weightedSum / totalWeight);
}

export function getMentionForAverage(average) {
  if (average === null || average === undefined) return null;
  if (average >= 16) return "Très bien";
  if (average >= 14) return "Bien";
  if (average >= 12) return "Assez bien";
  if (average >= 10) return "Passable";
  return "Travail à renforcer";
}

/**
 * Construit le bulletin complet d'un élève pour un trimestre donné.
 * Respecte strictement les paramètres showAbsences et showRemarks de l'établissement.
 */
export function buildStudentBulletin({
  classSubjects,
  grades,
  subjectRemarks,
  termReport,
  settings,
}) {
  const showAbsences = Boolean(settings?.showAbsences);
  const showRemarks = Boolean(settings?.showRemarks);

  const gradesByClassSubject = new Map();
  for (const grade of grades) {
    const list = gradesByClassSubject.get(grade.classSubjectId) || [];
    list.push(grade);
    gradesByClassSubject.set(grade.classSubjectId, list);
  }

  const remarksByClassSubject = new Map();
  for (const item of subjectRemarks || []) {
    remarksByClassSubject.set(item.classSubjectId, item);
  }

  let totalWeightedPoints = 0;
  let totalCoefficients = 0;
  let evaluatedSubjectsCount = 0;
  let latestTimestampMs = 0;

  const trackDate = (dt) => {
    if (!dt) return;
    const ms = new Date(dt).getTime();
    if (Number.isFinite(ms) && ms > latestTimestampMs) {
      latestTimestampMs = ms;
    }
  };

  const subjects = classSubjects.map((cs) => {
    const rawGrades = gradesByClassSubject.get(cs.id) || [];
    const sortedGrades = [...rawGrades].sort(
      (a, b) => new Date(a.evaluatedAt).getTime() - new Date(b.evaluatedAt).getTime()
    );

    for (const g of sortedGrades) {
      trackDate(g.updatedAt || g.createdAt);
    }

    const average = computeSubjectAverage(sortedGrades);
    const weightedPoints = average !== null ? round2(average * cs.coefficient) : null;

    if (average !== null) {
      totalWeightedPoints += weightedPoints;
      totalCoefficients += cs.coefficient;
      evaluatedSubjectsCount += 1;
    }

    const remarkObj = remarksByClassSubject.get(cs.id);
    if (showRemarks && remarkObj) {
      trackDate(remarkObj.updatedAt || remarkObj.createdAt);
    }

    const teacherUser = cs.teacher?.user;
    const teacherName = teacherUser
      ? `${teacherUser.firstName} ${teacherUser.lastName}`
      : "Non affecté";

    return {
      classSubjectId: cs.id,
      subjectCode: cs.subject.code,
      subjectName: cs.subject.name,
      coefficient: cs.coefficient,
      teacherName,
      grades: sortedGrades.map((g) => ({
        id: g.id,
        title: g.title,
        value: g.value,
        weight: g.weight,
        evaluatedAt: formatDateIso(g.evaluatedAt),
      })),
      average,
      weightedPoints,
      subjectRemark: showRemarks ? remarkObj?.remark || null : undefined,
    };
  });

  if (termReport) {
    if (showAbsences || showRemarks) {
      trackDate(termReport.updatedAt || termReport.createdAt);
    }
  }

  const generalAverage =
    totalCoefficients > 0 ? round2(totalWeightedPoints / totalCoefficients) : null;

  return {
    subjects,
    summary: {
      evaluatedSubjectsCount,
      totalSubjectsCount: classSubjects.length,
      totalCoefficients,
      totalWeightedPoints: round2(totalWeightedPoints),
      generalAverage,
      mention: getMentionForAverage(generalAverage),
      lastUpdatedAt: latestTimestampMs > 0 ? new Date(latestTimestampMs).toISOString() : null,
    },
    visibility: {
      showAbsences,
      showRemarks,
    },
    attendance: showAbsences
      ? {
          justifiedAbsences: termReport?.justifiedAbsences ?? 0,
          unjustifiedAbsences: termReport?.unjustifiedAbsences ?? 0,
          lateCount: termReport?.lateCount ?? 0,
        }
      : null,
    generalRemark: showRemarks ? termReport?.generalRemark || null : null,
  };
}
