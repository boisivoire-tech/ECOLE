import React, { useCallback, useEffect, useState } from "react";
import { apiRequest, formatDateFr, formatDateTimeFr } from "../api/client.js";
import AlertBanner from "../components/AlertBanner.jsx";
import ConfirmModal from "../components/ConfirmModal.jsx";
import AdminBulletinSupervisor from "../components/AdminBulletinSupervisor.jsx";

const TABS = [
  { id: "OVERVIEW", label: "Paramètres & Vue globale" },
  { id: "YEARS", label: "Années & Périodes" },
  { id: "CLASSES", label: "Classes & Matières" },
  { id: "STUDENTS", label: "Élèves & Vie scolaire" },
  { id: "BULLETINS", label: "Bulletins & Notes" },
  { id: "TEACHERS", label: "Enseignants" },
  { id: "PARENTS", label: "Parents & Codes d'accès" },
];

export default function AdminDashboard({ onSchoolNameChange }) {
  const [activeTab, setActiveTab] = useState("OVERVIEW");
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  const [successMsg, setSuccessMsg] = useState("");
  const [confirmState, setConfirmState] = useState(null);

  // Encadré d'affichage unique du dernier code OTP généré pour un parent
  const [generatedOtpBanner, setGeneratedOtpBanner] = useState(null);

  // 1. Paramètres établissement
  const [schoolName, setSchoolName] = useState("");
  const [showAbsences, setShowAbsences] = useState(true);
  const [showRemarks, setShowRemarks] = useState(true);

  // 2. Années & Trimestres
  const [yearLabel, setYearLabel] = useState("");
  const [yearStart, setYearStart] = useState("2026-09-14");
  const [yearEnd, setYearEnd] = useState("2027-06-30");
  const [yearIsCurrent, setYearIsCurrent] = useState(false);

  // 3. Matières, Classes & Affectations
  const [subCode, setSubCode] = useState("");
  const [subName, setSubName] = useState("");
  const [clsYearId, setClsYearId] = useState("");
  const [clsName, setClsName] = useState("");
  const [clsLevel, setClsLevel] = useState("");
  const [assignClassId, setAssignClassId] = useState("");
  const [assignSubjectId, setAssignSubjectId] = useState("");
  const [assignTeacherId, setAssignTeacherId] = useState("");
  const [assignCoef, setAssignCoef] = useState("2");
  const [editingAssignment, setEditingAssignment] = useState(null);

  // 4. Élèves & Vie scolaire
  const [stuMatricule, setStuMatricule] = useState("");
  const [stuLastName, setStuLastName] = useState("");
  const [stuFirstName, setStuFirstName] = useState("");
  const [stuBirthDate, setStuBirthDate] = useState("");
  const [stuClassroomId, setStuClassroomId] = useState("");
  const [editingStudent, setEditingStudent] = useState(null);
  const [reportStudentId, setReportStudentId] = useState("");
  const [reportTermId, setReportTermId] = useState("");
  const [reportJustified, setReportJustified] = useState("0");
  const [reportUnjustified, setReportUnjustified] = useState("0");
  const [reportLate, setReportLate] = useState("0");
  const [reportRemark, setReportRemark] = useState("");

  // 5. Enseignants
  const [teaFirstName, setTeaFirstName] = useState("");
  const [teaLastName, setTeaLastName] = useState("");
  const [teaEmail, setTeaEmail] = useState("");
  const [teaPhone, setTeaPhone] = useState("");
  const [teaSpecialty, setTeaSpecialty] = useState("");
  const [teaPassword, setTeaPassword] = useState("");
  const [editingTeacher, setEditingTeacher] = useState(null);

  // 6. Parents & Liens
  const [parFirstName, setParFirstName] = useState("");
  const [parLastName, setParLastName] = useState("");
  const [parPhone, setParPhone] = useState("");
  const [parEmail, setParEmail] = useState("");
  const [parAddress, setParAddress] = useState("");
  const [parInitStudentId, setParInitStudentId] = useState("");
  const [parInitRelation, setParInitRelation] = useState("Parent");

  const [linkParentId, setLinkParentId] = useState("");
  const [linkStudentId, setLinkStudentId] = useState("");
  const [linkRelation, setLinkRelation] = useState("Père");
  const [editingParent, setEditingParent] = useState(null);

  const loadOverview = useCallback(async () => {
    setLoading(true);
    setErrorMsg("");
    try {
      const overview = await apiRequest("/api/admin/overview");
      setData(overview);

      setSchoolName(overview.settings.schoolName);
      setShowAbsences(overview.settings.showAbsences);
      setShowRemarks(overview.settings.showRemarks);

      const currentYear =
        overview.schoolYears.find((y) => y.isCurrent) || overview.schoolYears[0];
      if (currentYear) {
        setClsYearId((prev) => prev || String(currentYear.id));
        if (currentYear.terms?.length > 0) {
          setReportTermId((prev) => prev || String(currentYear.terms[0].id));
        }
      }
      if (overview.classrooms.length > 0) {
        setAssignClassId((prev) => prev || String(overview.classrooms[0].id));
        setStuClassroomId((prev) => prev || String(overview.classrooms[0].id));
      }
      if (overview.subjects.length > 0) {
        setAssignSubjectId((prev) => prev || String(overview.subjects[0].id));
      }
      if (overview.students.length > 0) {
        setReportStudentId((prev) => prev || String(overview.students[0].id));
        setLinkStudentId((prev) => prev || String(overview.students[0].id));
      }
      if (overview.parents.length > 0) {
        setLinkParentId((prev) => prev || String(overview.parents[0].parentProfileId));
      }
    } catch (err) {
      setErrorMsg(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadOverview();
  }, [loadOverview]);

  // Synchronise le formulaire Vie scolaire lorsqu'on change d'élève ou de trimestre
  useEffect(() => {
    if (!data || !reportStudentId || !reportTermId) return;
    const student = data.students.find((s) => String(s.id) === String(reportStudentId));
    const existing = student?.termReports?.find(
      (r) => String(r.termId) === String(reportTermId)
    );
    if (existing) {
      setReportJustified(String(existing.justifiedAbsences));
      setReportUnjustified(String(existing.unjustifiedAbsences));
      setReportLate(String(existing.lateCount));
      setReportRemark(existing.generalRemark || "");
    } else {
      setReportJustified("0");
      setReportUnjustified("0");
      setReportLate("0");
      setReportRemark("");
    }
  }, [data, reportStudentId, reportTermId]);

  async function runConfirmedAction() {
    if (!confirmState?.action) return;
    setBusy(true);
    setErrorMsg("");
    setSuccessMsg("");
    try {
      await confirmState.action();
      setConfirmState(null);
    } catch (err) {
      setErrorMsg(err.message);
      setConfirmState(null);
    } finally {
      setBusy(false);
    }
  }

  // ---- Actions Paramètres ----
  function handleSaveSettingsSubmit(e) {
    e.preventDefault();
    setConfirmState({
      title: "Confirmer la modification des paramètres de l'établissement",
      message:
        "Ces réglages modifient immédiatement le nom affiché et la visibilité des absences et remarques sur les relevés consultés par tous les parents. Continuer ?",
      confirmLabel: "Appliquer les paramètres",
      variant: "primary",
      action: async () => {
        await apiRequest("/api/admin/settings", {
          method: "PUT",
          body: { schoolName, showAbsences, showRemarks },
        });
        if (onSchoolNameChange) onSchoolNameChange(schoolName);
        setSuccessMsg("Paramètres de l'établissement enregistrés.");
        await loadOverview();
      },
    });
  }

  // ---- Actions Années & Périodes ----
  async function handleCreateSchoolYear(e) {
    e.preventDefault();
    setBusy(true);
    setErrorMsg("");
    setSuccessMsg("");
    try {
      await apiRequest("/api/admin/school-years", {
        method: "POST",
        body: {
          label: yearLabel,
          startDate: yearStart,
          endDate: yearEnd,
          isCurrent: yearIsCurrent,
          createDefaultTerms: true,
        },
      });
      setYearLabel("");
      setSuccessMsg("L'année scolaire et ses 3 trimestres ont été créés.");
      await loadOverview();
    } catch (err) {
      setErrorMsg(err.message);
    } finally {
      setBusy(false);
    }
  }

  function requestActivateYear(sy) {
    setConfirmState({
      title: "Changer l'année scolaire active",
      message: `Définir « ${sy.label} » comme année scolaire en cours par défaut pour tout l'établissement ?`,
      confirmLabel: "Activer cette année",
      variant: "primary",
      action: async () => {
        await apiRequest(`/api/admin/school-years/${sy.id}/activate`, {
          method: "PATCH",
        });
        setSuccessMsg(`L'année scolaire ${sy.label} est désormais active.`);
        await loadOverview();
      },
    });
  }

  function requestDeleteYear(sy) {
    setConfirmState({
      title: "Supprimer une année scolaire",
      message: `Attention : supprimer l'année « ${sy.label} » supprimera également ses trimestres, ses classes et les notes rattachées. Confirmer cette suppression ?`,
      confirmLabel: "Supprimer définitivement",
      variant: "danger",
      action: async () => {
        await apiRequest(`/api/admin/school-years/${sy.id}`, { method: "DELETE" });
        setSuccessMsg("Année scolaire supprimée.");
        await loadOverview();
      },
    });
  }

  function requestToggleTerm(term) {
    const nextState = !term.isPublished;
    setConfirmState({
      title: nextState ? "Publier la période aux parents" : "Masquer la période aux parents",
      message: nextState
        ? `Rendre « ${term.name} » visible dans l'espace parent ?`
        : `Masquer temporairement « ${term.name} » dans l'espace parent ?`,
      confirmLabel: nextState ? "Publier" : "Masquer",
      variant: "primary",
      action: async () => {
        await apiRequest(`/api/admin/terms/${term.id}`, {
          method: "PATCH",
          body: { isPublished: nextState },
        });
        setSuccessMsg("Visibilité du trimestre mise à jour.");
        await loadOverview();
      },
    });
  }

  // ---- Actions Matières, Classes & Affectations ----
  async function handleCreateSubject(e) {
    e.preventDefault();
    setBusy(true);
    setErrorMsg("");
    setSuccessMsg("");
    try {
      await apiRequest("/api/admin/subjects", {
        method: "POST",
        body: { code: subCode, name: subName },
      });
      setSubCode("");
      setSubName("");
      setSuccessMsg("Matière ajoutée.");
      await loadOverview();
    } catch (err) {
      setErrorMsg(err.message);
    } finally {
      setBusy(false);
    }
  }

  function requestDeleteSubject(sub) {
    setConfirmState({
      title: "Supprimer une matière",
      message: `Voulez-vous supprimer la matière « ${sub.name} (${sub.code}) » ?`,
      confirmLabel: "Supprimer",
      variant: "danger",
      action: async () => {
        await apiRequest(`/api/admin/subjects/${sub.id}`, { method: "DELETE" });
        setSuccessMsg("Matière supprimée.");
        await loadOverview();
      },
    });
  }

  async function handleCreateClassroom(e) {
    e.preventDefault();
    setBusy(true);
    setErrorMsg("");
    setSuccessMsg("");
    try {
      await apiRequest("/api/admin/classrooms", {
        method: "POST",
        body: {
          schoolYearId: Number(clsYearId),
          name: clsName,
          level: clsLevel,
        },
      });
      setClsName("");
      setClsLevel("");
      setSuccessMsg("Classe créée avec succès.");
      await loadOverview();
    } catch (err) {
      setErrorMsg(err.message);
    } finally {
      setBusy(false);
    }
  }

  function requestDeleteClassroom(cls) {
    setConfirmState({
      title: "Supprimer une classe",
      message: `Attention : supprimer la classe « ${cls.name} » supprimera ses inscriptions et ses affectations de matières. Confirmer ?`,
      confirmLabel: "Supprimer la classe",
      variant: "danger",
      action: async () => {
        await apiRequest(`/api/admin/classrooms/${cls.id}`, { method: "DELETE" });
        setSuccessMsg("Classe supprimée.");
        await loadOverview();
      },
    });
  }

  async function handleAssignClassSubject(e) {
    e.preventDefault();
    setBusy(true);
    setErrorMsg("");
    setSuccessMsg("");
    try {
      await apiRequest("/api/admin/class-subjects", {
        method: "POST",
        body: {
          classroomId: Number(assignClassId),
          subjectId: Number(assignSubjectId),
          coefficient: Number(assignCoef),
          teacherId: assignTeacherId ? Number(assignTeacherId) : null,
        },
      });
      setSuccessMsg("Matière et coefficient rattachés à la classe.");
      await loadOverview();
    } catch (err) {
      setErrorMsg(err.message);
    } finally {
      setBusy(false);
    }
  }

  function requestSaveAssignmentEdit(e) {
    e.preventDefault();
    if (!editingAssignment) return;
    setConfirmState({
      title: "Confirmer la modification du coefficient ou de l'enseignant",
      message: `Modifier l'affectation de « ${editingAssignment.subjectName} » (${editingAssignment.classroomName}) recalculera automatiquement les moyennes générales de la classe. Continuer ?`,
      confirmLabel: "Enregistrer",
      variant: "primary",
      action: async () => {
        await apiRequest(`/api/admin/class-subjects/${editingAssignment.id}`, {
          method: "PUT",
          body: {
            coefficient: Number(editingAssignment.coefficient),
            teacherId: editingAssignment.teacherId
              ? Number(editingAssignment.teacherId)
              : null,
          },
        });
        setEditingAssignment(null);
        setSuccessMsg("Affectation mise à jour.");
        await loadOverview();
      },
    });
  }

  function requestDeleteAssignment(cs, classroomName) {
    setConfirmState({
      title: "Retirer une matière de la classe",
      message: `Attention : retirer « ${cs.subjectName} » de la classe « ${classroomName} » supprimera aussi les notes saisies dans cette matière pour cette classe. Confirmer ?`,
      confirmLabel: "Retirer la matière",
      variant: "danger",
      action: async () => {
        await apiRequest(`/api/admin/class-subjects/${cs.id}`, { method: "DELETE" });
        setSuccessMsg("Affectation supprimée.");
        await loadOverview();
      },
    });
  }

  // ---- Actions Élèves & Vie scolaire ----
  async function handleCreateStudent(e) {
    e.preventDefault();
    setBusy(true);
    setErrorMsg("");
    setSuccessMsg("");
    try {
      await apiRequest("/api/admin/students", {
        method: "POST",
        body: {
          matricule: stuMatricule,
          lastName: stuLastName,
          firstName: stuFirstName,
          birthDate: stuBirthDate,
          classroomId: stuClassroomId ? Number(stuClassroomId) : null,
        },
      });
      setStuMatricule("");
      setStuLastName("");
      setStuFirstName("");
      setStuBirthDate("");
      setSuccessMsg("Dossier élève créé et inscrit avec succès.");
      await loadOverview();
    } catch (err) {
      setErrorMsg(err.message);
    } finally {
      setBusy(false);
    }
  }

  function requestSaveStudentEdit(e) {
    e.preventDefault();
    if (!editingStudent) return;
    setConfirmState({
      title: "Confirmer la modification du dossier élève",
      message: `Enregistrer les changements d'état civil ou de classe pour l'élève ${editingStudent.lastName.toUpperCase()} ${editingStudent.firstName} (${editingStudent.matricule}) ?`,
      confirmLabel: "Enregistrer les modifications",
      variant: "primary",
      action: async () => {
        await apiRequest(`/api/admin/students/${editingStudent.id}`, {
          method: "PUT",
          body: {
            matricule: editingStudent.matricule,
            lastName: editingStudent.lastName,
            firstName: editingStudent.firstName,
            birthDate: editingStudent.birthDate,
            classroomId: editingStudent.classroomId
              ? Number(editingStudent.classroomId)
              : null,
          },
        });
        setEditingStudent(null);
        setSuccessMsg("Dossier élève mis à jour.");
        await loadOverview();
      },
    });
  }

  function requestDeleteStudent(st) {
    setConfirmState({
      title: "Supprimer un dossier élève",
      message: `Êtes-vous sûr de vouloir supprimer définitivement l'élève ${st.lastName.toUpperCase()} ${st.firstName} (${st.matricule}) ainsi que toutes ses notes et inscriptions ?`,
      confirmLabel: "Supprimer l'élève",
      variant: "danger",
      action: async () => {
        await apiRequest(`/api/admin/students/${st.id}`, { method: "DELETE" });
        setSuccessMsg("Dossier élève supprimé.");
        await loadOverview();
      },
    });
  }

  async function handleSaveTermReport(e) {
    e.preventDefault();
    setBusy(true);
    setErrorMsg("");
    setSuccessMsg("");
    try {
      await apiRequest(`/api/admin/students/${reportStudentId}/term-report`, {
        method: "PUT",
        body: {
          termId: Number(reportTermId),
          justifiedAbsences: Number(reportJustified),
          unjustifiedAbsences: Number(reportUnjustified),
          lateCount: Number(reportLate),
          generalRemark: reportRemark,
        },
      });
      setSuccessMsg("Absences et observation trimestrielle enregistrées.");
      await loadOverview();
    } catch (err) {
      setErrorMsg(err.message);
    } finally {
      setBusy(false);
    }
  }

  // ---- Actions Enseignants ----
  async function handleCreateTeacher(e) {
    e.preventDefault();
    setBusy(true);
    setErrorMsg("");
    setSuccessMsg("");
    try {
      await apiRequest("/api/admin/teachers", {
        method: "POST",
        body: {
          firstName: teaFirstName,
          lastName: teaLastName,
          email: teaEmail,
          phone: teaPhone,
          specialty: teaSpecialty,
          password: teaPassword,
        },
      });
      setTeaFirstName("");
      setTeaLastName("");
      setTeaEmail("");
      setTeaPhone("");
      setTeaSpecialty("");
      setTeaPassword("");
      setSuccessMsg("Compte enseignant créé avec mot de passe chiffré.");
      await loadOverview();
    } catch (err) {
      setErrorMsg(err.message);
    } finally {
      setBusy(false);
    }
  }

  function requestSaveTeacherEdit(e) {
    e.preventDefault();
    if (!editingTeacher) return;
    setConfirmState({
      title: "Confirmer la modification du compte enseignant",
      message: `Appliquer les modifications sur le compte de ${editingTeacher.firstName} ${editingTeacher.lastName} ?`,
      confirmLabel: "Enregistrer",
      variant: "primary",
      action: async () => {
        await apiRequest(`/api/admin/teachers/${editingTeacher.userId}`, {
          method: "PUT",
          body: {
            firstName: editingTeacher.firstName,
            lastName: editingTeacher.lastName,
            email: editingTeacher.email,
            phone: editingTeacher.phone,
            specialty: editingTeacher.specialty,
            isActive: editingTeacher.isActive,
            newPassword: editingTeacher.newPassword || undefined,
          },
        });
        setEditingTeacher(null);
        setSuccessMsg("Compte enseignant mis à jour.");
        await loadOverview();
      },
    });
  }

  function requestDeleteTeacher(t) {
    setConfirmState({
      title: "Supprimer un compte enseignant",
      message: `Supprimer définitivement le compte enseignant de ${t.firstName} ${t.lastName} (${t.email}) ? Ses classes/matières passeront en statut « Non affecté » sans perdre les notes des élèves.`,
      confirmLabel: "Supprimer le compte",
      variant: "danger",
      action: async () => {
        await apiRequest(`/api/admin/teachers/${t.userId}`, { method: "DELETE" });
        setSuccessMsg("Compte enseignant supprimé.");
        await loadOverview();
      },
    });
  }

  // ---- Actions Parents, Liens & Codes OTP ----
  async function handleCreateParent(e) {
    e.preventDefault();
    setBusy(true);
    setErrorMsg("");
    setSuccessMsg("");
    try {
      const res = await apiRequest("/api/admin/parents", {
        method: "POST",
        body: {
          firstName: parFirstName,
          lastName: parLastName,
          phone: parPhone,
          email: parEmail,
          address: parAddress,
          studentId: parInitStudentId ? Number(parInitStudentId) : undefined,
          relationship: parInitRelation,
        },
      });
      setParFirstName("");
      setParLastName("");
      setParPhone("");
      setParEmail("");
      setParAddress("");
      setParInitStudentId("");

      setGeneratedOtpBanner({
        parentName: `${res.parent.firstName} ${res.parent.lastName}`,
        code: res.generatedOtp.code,
        expiresAt: res.generatedOtp.expiresAt,
      });
      setSuccessMsg(
        "Compte parent créé ! Notez ou remettez immédiatement le code à usage unique affiché ci-dessous."
      );
      await loadOverview();
    } catch (err) {
      setErrorMsg(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function handleLinkParentStudent(e) {
    e.preventDefault();
    setBusy(true);
    setErrorMsg("");
    setSuccessMsg("");
    try {
      await apiRequest("/api/admin/parent-links", {
        method: "POST",
        body: {
          parentProfileId: Number(linkParentId),
          studentId: Number(linkStudentId),
          relationship: linkRelation,
        },
      });
      setSuccessMsg("L'élève a bien été rattaché au compte parent.");
      await loadOverview();
    } catch (err) {
      setErrorMsg(err.message);
    } finally {
      setBusy(false);
    }
  }

  function requestUnlinkParentStudent(linkId, parentName, childName) {
    setConfirmState({
      title: "Retirer le lien parent-enfant",
      message: `Retirer l'association entre ${parentName} et l'élève ${childName} ? Ce parent ne pourra plus consulter ses résultats.`,
      confirmLabel: "Retirer l'association",
      variant: "danger",
      action: async () => {
        await apiRequest(`/api/admin/parent-links/${linkId}`, { method: "DELETE" });
        setSuccessMsg("Lien parent-enfant retiré.");
        await loadOverview();
      },
    });
  }

  function requestGenerateNewOtp(parent) {
    setConfirmState({
      title: "Générer un nouveau code à usage unique",
      message: `Générer un nouveau code à usage unique pour ${parent.firstName} ${parent.lastName} ? Tout code précédent non utilisé sera immédiatement invalidé.`,
      confirmLabel: "Générer le code",
      variant: "primary",
      action: async () => {
        const res = await apiRequest(
          `/api/admin/parents/${parent.parentProfileId}/otp`,
          { method: "POST", body: { validDays: 14 } }
        );
        setGeneratedOtpBanner({
          parentName: res.parentName,
          code: res.code,
          expiresAt: res.expiresAt,
        });
        setSuccessMsg("Nouveau code à usage unique généré.");
        await loadOverview();
      },
    });
  }

  function requestSaveParentEdit(e) {
    e.preventDefault();
    if (!editingParent) return;
    setConfirmState({
      title: "Confirmer la modification du compte parent",
      message: `Enregistrer les modifications sur la fiche parent de ${editingParent.firstName} ${editingParent.lastName} ?`,
      confirmLabel: "Enregistrer",
      variant: "primary",
      action: async () => {
        await apiRequest(`/api/admin/parents/${editingParent.userId}`, {
          method: "PUT",
          body: {
            firstName: editingParent.firstName,
            lastName: editingParent.lastName,
            phone: editingParent.phone,
            email: editingParent.email,
            address: editingParent.address,
            isActive: editingParent.isActive,
          },
        });
        setEditingParent(null);
        setSuccessMsg("Fiche parent mise à jour.");
        await loadOverview();
      },
    });
  }

  function requestDeleteParent(p) {
    setConfirmState({
      title: "Supprimer un compte parent",
      message: `Supprimer définitivement le compte parent de ${p.firstName} ${p.lastName} ? Les dossiers scolaires des élèves sont conservés.`,
      confirmLabel: "Supprimer le compte parent",
      variant: "danger",
      action: async () => {
        await apiRequest(`/api/admin/parents/${p.userId}`, { method: "DELETE" });
        setSuccessMsg("Compte parent supprimé.");
        await loadOverview();
      },
    });
  }

  if (loading) {
    return (
      <main className="page-container">
        <div className="loading-box">Chargement de l'espace d'administration...</div>
      </main>
    );
  }

  const allTerms = (data?.schoolYears || []).flatMap((sy) =>
    sy.terms.map((t) => ({ ...t, yearLabel: sy.label }))
  );

  return (
    <main className="page-container">
      <div className="section-header">
        <div>
          <h1>Administration de l'établissement</h1>
          <p className="section-subtitle">
            Gestion des périodes scolaires, classes, matières, élèves, enseignants, parents et
            codes d'accès sécurisés.
          </p>
        </div>
      </div>

      <nav className="subnav-tabs" aria-label="Rubriques d'administration">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            className={`subnav-btn ${activeTab === t.id ? "active" : ""}`}
            onClick={() => {
              setActiveTab(t.id);
              setErrorMsg("");
              setSuccessMsg("");
            }}
          >
            {t.label}
          </button>
        ))}
      </nav>

      <AlertBanner type="error" message={errorMsg} onClose={() => setErrorMsg("")} />
      <AlertBanner type="success" message={successMsg} onClose={() => setSuccessMsg("")} />

      {generatedOtpBanner && (
        <div className="otp-reveal-box" role="region" aria-label="Code à usage unique généré">
          <div>
            <span className="badge badge-warning">Affichage unique — Ne sera plus visible ensuite</span>
            <h3>Code à usage unique pour {generatedOtpBanner.parentName}</h3>
            <p>
              Remettez ce code confidentiel au parent (valable jusqu'au{" "}
              {formatDateTimeFr(generatedOtpBanner.expiresAt)}, utilisable une seule fois) :
            </p>
            <div className="otp-code-display">{generatedOtpBanner.code}</div>
          </div>
          <div className="otp-reveal-actions">
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => {
                if (navigator.clipboard) {
                  navigator.clipboard.writeText(generatedOtpBanner.code);
                  setSuccessMsg("Code copié dans le presse-papiers.");
                }
              }}
            >
              Copier le code
            </button>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => setGeneratedOtpBanner(null)}
            >
              J'ai noté ce code
            </button>
          </div>
        </div>
      )}

      {/* ONGLET 1 : VUE D'ENSEMBLE & PARAMÈTRES */}
      {activeTab === "OVERVIEW" && data && (
        <div className="stack-lg">
          <div className="kpi-grid">
            <div className="kpi-card">
              <span className="kpi-label">Élèves enregistrés</span>
              <strong className="kpi-value">{data.stats.studentsCount}</strong>
            </div>
            <div className="kpi-card">
              <span className="kpi-label">Classes ouvertes</span>
              <strong className="kpi-value">{data.stats.classroomsCount}</strong>
            </div>
            <div className="kpi-card">
              <span className="kpi-label">Enseignants</span>
              <strong className="kpi-value">{data.stats.teachersCount}</strong>
            </div>
            <div className="kpi-card">
              <span className="kpi-label">Comptes parents</span>
              <strong className="kpi-value">{data.stats.parentsCount}</strong>
            </div>
          </div>

          <section className="card-panel">
            <h2>Paramètres de publication de l'établissement</h2>
            <p className="muted-text">
              Choisissez si les absences et les remarques/appréciations doivent apparaître sur les
              bulletins consultés par les parents.
            </p>
            <form onSubmit={handleSaveSettingsSubmit} className="form-stack max-w-md">
              <div className="form-group">
                <label htmlFor="cfg-school-name">Nom officiel de l'établissement</label>
                <input
                  id="cfg-school-name"
                  type="text"
                  value={schoolName}
                  onChange={(e) => setSchoolName(e.target.value)}
                  required
                />
              </div>

              <label className="checkbox-row">
                <input
                  type="checkbox"
                  checked={showAbsences}
                  onChange={(e) => setShowAbsences(e.target.checked)}
                />
                <span>
                  <strong>Activer l'affichage des absences et retards</strong> sur les relevés
                  parents
                </span>
              </label>

              <label className="checkbox-row">
                <input
                  type="checkbox"
                  checked={showRemarks}
                  onChange={(e) => setShowRemarks(e.target.checked)}
                />
                <span>
                  <strong>Activer l'affichage des remarques et appréciations</strong> sur les
                  relevés parents
                </span>
              </label>

              <div>
                <button type="submit" className="btn btn-primary" disabled={busy}>
                  Enregistrer les paramètres
                </button>
              </div>
            </form>
          </section>
        </div>
      )}

      {/* ONGLET 2 : ANNÉES & TRIMESTRES */}
      {activeTab === "YEARS" && data && (
        <div className="stack-lg">
          <section className="card-panel">
            <h2>Ajouter une année scolaire</h2>
            <form onSubmit={handleCreateSchoolYear} className="form-grid-4">
              <div className="form-group">
                <label htmlFor="sy-label">Libellé (ex. 2027-2028)</label>
                <input
                  id="sy-label"
                  type="text"
                  placeholder="2027-2028"
                  value={yearLabel}
                  onChange={(e) => setYearLabel(e.target.value)}
                  required
                />
              </div>
              <div className="form-group">
                <label htmlFor="sy-start">Date de rentrée</label>
                <input
                  id="sy-start"
                  type="date"
                  value={yearStart}
                  onChange={(e) => setYearStart(e.target.value)}
                  required
                />
              </div>
              <div className="form-group">
                <label htmlFor="sy-end">Date de fin d'année</label>
                <input
                  id="sy-end"
                  type="date"
                  value={yearEnd}
                  onChange={(e) => setYearEnd(e.target.value)}
                  required
                />
              </div>
              <div className="form-group">
                <label className="checkbox-row compact">
                  <input
                    type="checkbox"
                    checked={yearIsCurrent}
                    onChange={(e) => setYearIsCurrent(e.target.checked)}
                  />
                  <span>Définir comme année active</span>
                </label>
                <button type="submit" className="btn btn-primary" disabled={busy}>
                  Créer l'année (+ 3 trimestres)
                </button>
              </div>
            </form>
          </section>

          <section className="card-panel">
            <h2>Années et périodes scolaires configurées</h2>
            <div className="stack-md">
              {data.schoolYears.map((sy) => (
                <div key={sy.id} className="subcard">
                  <div className="panel-title-row">
                    <div>
                      <strong>{sy.label}</strong>{" "}
                      {sy.isCurrent && <span className="badge badge-success">Année en cours</span>}
                      <div className="subject-cell-sub">
                        Du {formatDateFr(sy.startDate)} au {formatDateFr(sy.endDate)}
                      </div>
                    </div>
                    <div className="row-actions">
                      {!sy.isCurrent && (
                        <button
                          type="button"
                          className="btn btn-sm btn-secondary"
                          onClick={() => requestActivateYear(sy)}
                        >
                          Définir active
                        </button>
                      )}
                      <button
                        type="button"
                        className="btn btn-sm btn-danger"
                        onClick={() => requestDeleteYear(sy)}
                      >
                        Supprimer
                      </button>
                    </div>
                  </div>

                  <div className="term-pills-row">
                    {sy.terms.map((t) => (
                      <div key={t.id} className="term-pill-card">
                        <span>
                          <strong>{t.name}</strong> —{" "}
                          {t.isPublished ? "Publié aux parents" : "Masqué"}
                        </span>
                        <button
                          type="button"
                          className="btn-link"
                          onClick={() => requestToggleTerm(t)}
                        >
                          {t.isPublished ? "Masquer" : "Publier"}
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </section>
        </div>
      )}

      {/* ONGLET 3 : CLASSES & MATIÈRES */}
      {activeTab === "CLASSES" && data && (
        <div className="stack-lg">
          <div className="two-col-grid">
            <section className="card-panel">
              <h2>Nouvelle matière</h2>
              <form onSubmit={handleCreateSubject} className="form-stack">
                <div className="form-group">
                  <label htmlFor="sub-code">Code court (ex. PHYS)</label>
                  <input
                    id="sub-code"
                    type="text"
                    placeholder="PHYS"
                    value={subCode}
                    onChange={(e) => setSubCode(e.target.value)}
                    required
                  />
                </div>
                <div className="form-group">
                  <label htmlFor="sub-name">Intitulé complet</label>
                  <input
                    id="sub-name"
                    type="text"
                    placeholder="Physique-Chimie"
                    value={subName}
                    onChange={(e) => setSubName(e.target.value)}
                    required
                  />
                </div>
                <button type="submit" className="btn btn-primary" disabled={busy}>
                  Ajouter la matière
                </button>
              </form>

              <hr className="divider" />
              <h3>Catalogue des matières ({data.subjects.length})</h3>
              <ul className="compact-list">
                {data.subjects.map((s) => (
                  <li key={s.id}>
                    <span>
                      <strong>{s.name}</strong> <small>({s.code})</small>
                    </span>
                    <button
                      type="button"
                      className="btn-link danger"
                      onClick={() => requestDeleteSubject(s)}
                    >
                      Supprimer
                    </button>
                  </li>
                ))}
              </ul>
            </section>

            <section className="card-panel">
              <h2>Nouvelle classe</h2>
              <form onSubmit={handleCreateClassroom} className="form-stack">
                <div className="form-group">
                  <label htmlFor="cls-year">Année scolaire</label>
                  <select
                    id="cls-year"
                    value={clsYearId}
                    onChange={(e) => setClsYearId(e.target.value)}
                    required
                  >
                    {data.schoolYears.map((sy) => (
                      <option key={sy.id} value={sy.id}>
                        {sy.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="form-group">
                  <label htmlFor="cls-name">Nom de la classe (ex. 5ème A)</label>
                  <input
                    id="cls-name"
                    type="text"
                    placeholder="5ème A"
                    value={clsName}
                    onChange={(e) => setClsName(e.target.value)}
                    required
                  />
                </div>
                <div className="form-group">
                  <label htmlFor="cls-level">Niveau (ex. 5ème)</label>
                  <input
                    id="cls-level"
                    type="text"
                    placeholder="5ème"
                    value={clsLevel}
                    onChange={(e) => setClsLevel(e.target.value)}
                    required
                  />
                </div>
                <button type="submit" className="btn btn-primary" disabled={busy}>
                  Créer la classe
                </button>
              </form>
            </section>
          </div>

          <section className="card-panel">
            <h2>Associer une matière, un coefficient et un enseignant à une classe</h2>
            <form onSubmit={handleAssignClassSubject} className="form-grid-4">
              <div className="form-group">
                <label htmlFor="asg-cls">Classe</label>
                <select
                  id="asg-cls"
                  value={assignClassId}
                  onChange={(e) => setAssignClassId(e.target.value)}
                  required
                >
                  {data.classrooms.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name} ({c.schoolYearLabel})
                    </option>
                  ))}
                </select>
              </div>
              <div className="form-group">
                <label htmlFor="asg-sub">Matière</label>
                <select
                  id="asg-sub"
                  value={assignSubjectId}
                  onChange={(e) => setAssignSubjectId(e.target.value)}
                  required
                >
                  {data.subjects.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name} ({s.code})
                    </option>
                  ))}
                </select>
              </div>
              <div className="form-group">
                <label htmlFor="asg-coef">Coefficient</label>
                <input
                  id="asg-coef"
                  type="number"
                  min="1"
                  max="20"
                  value={assignCoef}
                  onChange={(e) => setAssignCoef(e.target.value)}
                  required
                />
              </div>
              <div className="form-group">
                <label htmlFor="asg-tea">Enseignant responsable</label>
                <select
                  id="asg-tea"
                  value={assignTeacherId}
                  onChange={(e) => setAssignTeacherId(e.target.value)}
                >
                  <option value="">-- Non affecté --</option>
                  {data.teachers.map((t) => (
                    <option key={t.teacherProfileId} value={t.teacherProfileId}>
                      {t.lastName.toUpperCase()} {t.firstName}
                    </option>
                  ))}
                </select>
              </div>
              <div className="form-actions-end">
                <button type="submit" className="btn btn-primary" disabled={busy}>
                  Associer à la classe
                </button>
              </div>
            </form>
          </section>

          {editingAssignment && (
            <section className="card-panel highlight-panel">
              <h2>
                Modifier l'affectation — {editingAssignment.subjectName} (
                {editingAssignment.classroomName})
              </h2>
              <form onSubmit={requestSaveAssignmentEdit} className="form-grid-4">
                <div className="form-group">
                  <label htmlFor="edit-asg-coef">Coefficient</label>
                  <input
                    id="edit-asg-coef"
                    type="number"
                    min="1"
                    max="20"
                    value={editingAssignment.coefficient}
                    onChange={(e) =>
                      setEditingAssignment({
                        ...editingAssignment,
                        coefficient: e.target.value,
                      })
                    }
                    required
                  />
                </div>
                <div className="form-group">
                  <label htmlFor="edit-asg-tea">Enseignant</label>
                  <select
                    id="edit-asg-tea"
                    value={editingAssignment.teacherId || ""}
                    onChange={(e) =>
                      setEditingAssignment({
                        ...editingAssignment,
                        teacherId: e.target.value,
                      })
                    }
                  >
                    <option value="">-- Non affecté --</option>
                    {data.teachers.map((t) => (
                      <option key={t.teacherProfileId} value={t.teacherProfileId}>
                        {t.lastName.toUpperCase()} {t.firstName}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="form-actions-end">
                  <button
                    type="button"
                    className="btn btn-secondary"
                    onClick={() => setEditingAssignment(null)}
                  >
                    Annuler
                  </button>
                  <button type="submit" className="btn btn-primary">
                    Enregistrer
                  </button>
                </div>
              </form>
            </section>
          )}

          <section className="card-panel">
            <h2>Classes et matières affectées</h2>
            <div className="stack-md">
              {data.classrooms.map((cls) => (
                <div key={cls.id} className="subcard">
                  <div className="panel-title-row">
                    <div>
                      <strong>
                        {cls.name} — Niveau {cls.level}
                      </strong>{" "}
                      <span className="badge badge-neutral">{cls.schoolYearLabel}</span>{" "}
                      <span className="badge badge-soft">{cls.studentsCount} élève(s)</span>
                    </div>
                    <button
                      type="button"
                      className="btn btn-sm btn-danger"
                      onClick={() => requestDeleteClassroom(cls)}
                    >
                      Supprimer la classe
                    </button>
                  </div>

                  {cls.classSubjects.length === 0 ? (
                    <p className="muted-text">Aucune matière associée à cette classe.</p>
                  ) : (
                    <div className="table-responsive">
                      <table className="data-table">
                        <thead>
                          <tr>
                            <th>Matière</th>
                            <th className="col-center">Coef.</th>
                            <th>Enseignant</th>
                            <th>Actions</th>
                          </tr>
                        </thead>
                        <tbody>
                          {cls.classSubjects.map((cs) => (
                            <tr key={cs.id}>
                              <td data-label="Matière">{cs.subjectName}</td>
                              <td data-label="Coefficient" className="col-center">
                                {cs.coefficient}
                              </td>
                              <td data-label="Enseignant">
                                {cs.teacherName || <span className="muted-text">Non affecté</span>}
                              </td>
                              <td data-label="Actions">
                                <div className="row-actions">
                                  <button
                                    type="button"
                                    className="btn-link"
                                    onClick={() =>
                                      setEditingAssignment({
                                        ...cs,
                                        classroomName: cls.name,
                                      })
                                    }
                                  >
                                    Modifier
                                  </button>
                                  <button
                                    type="button"
                                    className="btn-link danger"
                                    onClick={() => requestDeleteAssignment(cs, cls.name)}
                                  >
                                    Retirer
                                  </button>
                                </div>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </section>
        </div>
      )}

      {/* ONGLET 4 : ÉLÈVES & VIE SCOLAIRE */}
      {activeTab === "STUDENTS" && data && (
        <div className="stack-lg">
          <section className="card-panel">
            <h2>Inscrire un nouvel élève</h2>
            <form onSubmit={handleCreateStudent} className="form-grid-5">
              <div className="form-group">
                <label htmlFor="stu-mat">Matricule unique</label>
                <input
                  id="stu-mat"
                  type="text"
                  placeholder="ELV-2026-010"
                  value={stuMatricule}
                  onChange={(e) => setStuMatricule(e.target.value)}
                  required
                />
              </div>
              <div className="form-group">
                <label htmlFor="stu-ln">Nom de famille</label>
                <input
                  id="stu-ln"
                  type="text"
                  placeholder="Kouassi"
                  value={stuLastName}
                  onChange={(e) => setStuLastName(e.target.value)}
                  required
                />
              </div>
              <div className="form-group">
                <label htmlFor="stu-fn">Prénoms</label>
                <input
                  id="stu-fn"
                  type="text"
                  placeholder="Awa Grâce"
                  value={stuFirstName}
                  onChange={(e) => setStuFirstName(e.target.value)}
                  required
                />
              </div>
              <div className="form-group">
                <label htmlFor="stu-bd">Date de naissance</label>
                <input
                  id="stu-bd"
                  type="date"
                  value={stuBirthDate}
                  onChange={(e) => setStuBirthDate(e.target.value)}
                  required
                />
              </div>
              <div className="form-group">
                <label htmlFor="stu-cls">Classe d'inscription</label>
                <select
                  id="stu-cls"
                  value={stuClassroomId}
                  onChange={(e) => setStuClassroomId(e.target.value)}
                >
                  <option value="">-- Choisir plus tard --</option>
                  {data.classrooms.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name} ({c.schoolYearLabel})
                    </option>
                  ))}
                </select>
              </div>
              <div className="form-actions-end">
                <button type="submit" className="btn btn-primary" disabled={busy}>
                  Enregistrer l'élève
                </button>
              </div>
            </form>
          </section>

          {editingStudent && (
            <section className="card-panel highlight-panel">
              <h2>Modifier le dossier de l'élève ({editingStudent.matricule})</h2>
              <form onSubmit={requestSaveStudentEdit} className="form-grid-5">
                <div className="form-group">
                  <label>Matricule</label>
                  <input
                    type="text"
                    value={editingStudent.matricule}
                    onChange={(e) =>
                      setEditingStudent({ ...editingStudent, matricule: e.target.value })
                    }
                    required
                  />
                </div>
                <div className="form-group">
                  <label>Nom de famille</label>
                  <input
                    type="text"
                    value={editingStudent.lastName}
                    onChange={(e) =>
                      setEditingStudent({ ...editingStudent, lastName: e.target.value })
                    }
                    required
                  />
                </div>
                <div className="form-group">
                  <label>Prénoms</label>
                  <input
                    type="text"
                    value={editingStudent.firstName}
                    onChange={(e) =>
                      setEditingStudent({ ...editingStudent, firstName: e.target.value })
                    }
                    required
                  />
                </div>
                <div className="form-group">
                  <label>Date de naissance</label>
                  <input
                    type="date"
                    value={editingStudent.birthDate}
                    onChange={(e) =>
                      setEditingStudent({ ...editingStudent, birthDate: e.target.value })
                    }
                    required
                  />
                </div>
                <div className="form-group">
                  <label>Classe</label>
                  <select
                    value={editingStudent.classroomId || ""}
                    onChange={(e) =>
                      setEditingStudent({ ...editingStudent, classroomId: e.target.value })
                    }
                  >
                    <option value="">-- Non affecté --</option>
                    {data.classrooms.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name} ({c.schoolYearLabel})
                      </option>
                    ))}
                  </select>
                </div>
                <div className="form-actions-end">
                  <button
                    type="button"
                    className="btn btn-secondary"
                    onClick={() => setEditingStudent(null)}
                  >
                    Annuler
                  </button>
                  <button type="submit" className="btn btn-primary">
                    Enregistrer
                  </button>
                </div>
              </form>
            </section>
          )}

          <section className="card-panel">
            <h2>Saisie des absences et de la remarque générale trimestrielle</h2>
            <form onSubmit={handleSaveTermReport} className="form-grid-5">
              <div className="form-group">
                <label htmlFor="rep-student">Élève</label>
                <select
                  id="rep-student"
                  value={reportStudentId}
                  onChange={(e) => setReportStudentId(e.target.value)}
                  required
                >
                  {data.students.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.lastName.toUpperCase()} {s.firstName} ({s.matricule})
                    </option>
                  ))}
                </select>
              </div>
              <div className="form-group">
                <label htmlFor="rep-term">Trimestre</label>
                <select
                  id="rep-term"
                  value={reportTermId}
                  onChange={(e) => setReportTermId(e.target.value)}
                  required
                >
                  {allTerms.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name} ({t.yearLabel})
                    </option>
                  ))}
                </select>
              </div>
              <div className="form-group">
                <label htmlFor="rep-just">Abs. justifiées (h)</label>
                <input
                  id="rep-just"
                  type="number"
                  min="0"
                  value={reportJustified}
                  onChange={(e) => setReportJustified(e.target.value)}
                />
              </div>
              <div className="form-group">
                <label htmlFor="rep-unjust">Abs. non justifiées (h)</label>
                <input
                  id="rep-unjust"
                  type="number"
                  min="0"
                  value={reportUnjustified}
                  onChange={(e) => setReportUnjustified(e.target.value)}
                />
              </div>
              <div className="form-group">
                <label htmlFor="rep-late">Retards</label>
                <input
                  id="rep-late"
                  type="number"
                  min="0"
                  value={reportLate}
                  onChange={(e) => setReportLate(e.target.value)}
                />
              </div>
              <div className="form-group span-full">
                <label htmlFor="rep-remark">Observation générale du trimestre</label>
                <input
                  id="rep-remark"
                  type="text"
                  placeholder="Appréciation du conseil de classe..."
                  value={reportRemark}
                  onChange={(e) => setReportRemark(e.target.value)}
                />
              </div>
              <div className="form-actions-end">
                <button type="submit" className="btn btn-primary" disabled={busy}>
                  Enregistrer le bilan vie scolaire
                </button>
              </div>
            </form>
          </section>

          <section className="card-panel">
            <h2>Liste des élèves ({data.students.length})</h2>
            <div className="table-responsive">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Matricule</th>
                    <th>Nom & Prénoms</th>
                    <th>Date de naissance</th>
                    <th>Classe actuelle</th>
                    <th>Parent(s) rattaché(s)</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {data.students.map((s) => {
                    const enr = s.enrollments[0];
                    return (
                      <tr key={s.id}>
                        <td data-label="Matricule">
                          <strong>{s.matricule}</strong>
                        </td>
                        <td data-label="Nom & Prénoms">
                          {s.lastName.toUpperCase()} {s.firstName}
                        </td>
                        <td data-label="Naissance">{formatDateFr(s.birthDate)}</td>
                        <td data-label="Classe">
                          {enr ? `${enr.classroomName} (${enr.schoolYearLabel})` : "Non inscrit"}
                        </td>
                        <td data-label="Parents">
                          {s.parents.length === 0 ? (
                            <span className="muted-text">Aucun parent lié</span>
                          ) : (
                            s.parents
                              .map((p) => `${p.parentName} (${p.relationship})`)
                              .join(", ")
                          )}
                        </td>
                        <td data-label="Actions">
                          <div className="row-actions">
                            <button
                              type="button"
                              className="btn-link"
                              onClick={() =>
                                setEditingStudent({
                                  id: s.id,
                                  matricule: s.matricule,
                                  lastName: s.lastName,
                                  firstName: s.firstName,
                                  birthDate: s.birthDate,
                                  classroomId: enr?.classroomId || "",
                                })
                              }
                            >
                              Modifier
                            </button>
                            <button
                              type="button"
                              className="btn-link danger"
                              onClick={() => requestDeleteStudent(s)}
                            >
                              Supprimer
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>
        </div>
      )}

      {/* ONGLET 5 : ENSEIGNANTS */}
      {activeTab === "TEACHERS" && data && (
        <div className="stack-lg">
          <section className="card-panel">
            <h2>Créer un compte enseignant</h2>
            <form onSubmit={handleCreateTeacher} className="form-grid-3">
              <div className="form-group">
                <label htmlFor="t-fn">Prénom</label>
                <input
                  id="t-fn"
                  type="text"
                  value={teaFirstName}
                  onChange={(e) => setTeaFirstName(e.target.value)}
                  required
                />
              </div>
              <div className="form-group">
                <label htmlFor="t-ln">Nom de famille</label>
                <input
                  id="t-ln"
                  type="text"
                  value={teaLastName}
                  onChange={(e) => setTeaLastName(e.target.value)}
                  required
                />
              </div>
              <div className="form-group">
                <label htmlFor="t-em">Adresse e-mail de connexion</label>
                <input
                  id="t-em"
                  type="email"
                  value={teaEmail}
                  onChange={(e) => setTeaEmail(e.target.value)}
                  required
                />
              </div>
              <div className="form-group">
                <label htmlFor="t-sp">Spécialité (facultatif)</label>
                <input
                  id="t-sp"
                  type="text"
                  placeholder="Ex. Mathématiques"
                  value={teaSpecialty}
                  onChange={(e) => setTeaSpecialty(e.target.value)}
                />
              </div>
              <div className="form-group">
                <label htmlFor="t-ph">Téléphone (facultatif)</label>
                <input
                  id="t-ph"
                  type="text"
                  value={teaPhone}
                  onChange={(e) => setTeaPhone(e.target.value)}
                />
              </div>
              <div className="form-group">
                <label htmlFor="t-pw">Mot de passe provisoire (10 car. min.)</label>
                <input
                  id="t-pw"
                  type="password"
                  minLength={10}
                  value={teaPassword}
                  onChange={(e) => setTeaPassword(e.target.value)}
                  required
                />
              </div>
              <div className="form-actions-end">
                <button type="submit" className="btn btn-primary" disabled={busy}>
                  Créer le compte enseignant
                </button>
              </div>
            </form>
          </section>

          {editingTeacher && (
            <section className="card-panel highlight-panel">
              <h2>
                Modifier le compte enseignant — {editingTeacher.firstName}{" "}
                {editingTeacher.lastName}
              </h2>
              <form onSubmit={requestSaveTeacherEdit} className="form-grid-3">
                <div className="form-group">
                  <label>Prénom</label>
                  <input
                    type="text"
                    value={editingTeacher.firstName}
                    onChange={(e) =>
                      setEditingTeacher({ ...editingTeacher, firstName: e.target.value })
                    }
                    required
                  />
                </div>
                <div className="form-group">
                  <label>Nom</label>
                  <input
                    type="text"
                    value={editingTeacher.lastName}
                    onChange={(e) =>
                      setEditingTeacher({ ...editingTeacher, lastName: e.target.value })
                    }
                    required
                  />
                </div>
                <div className="form-group">
                  <label>E-mail</label>
                  <input
                    type="email"
                    value={editingTeacher.email}
                    onChange={(e) =>
                      setEditingTeacher({ ...editingTeacher, email: e.target.value })
                    }
                    required
                  />
                </div>
                <div className="form-group">
                  <label>Spécialité</label>
                  <input
                    type="text"
                    value={editingTeacher.specialty || ""}
                    onChange={(e) =>
                      setEditingTeacher({ ...editingTeacher, specialty: e.target.value })
                    }
                  />
                </div>
                <div className="form-group">
                  <label>Nouveau mot de passe (laisser vide pour conserver)</label>
                  <input
                    type="password"
                    minLength={10}
                    placeholder="10 caractères minimum"
                    value={editingTeacher.newPassword || ""}
                    onChange={(e) =>
                      setEditingTeacher({ ...editingTeacher, newPassword: e.target.value })
                    }
                  />
                </div>
                <div className="form-group">
                  <label className="checkbox-row compact">
                    <input
                      type="checkbox"
                      checked={editingTeacher.isActive}
                      onChange={(e) =>
                        setEditingTeacher({ ...editingTeacher, isActive: e.target.checked })
                      }
                    />
                    <span>Compte actif (autorisé à se connecter)</span>
                  </label>
                </div>
                <div className="form-actions-end">
                  <button
                    type="button"
                    className="btn btn-secondary"
                    onClick={() => setEditingTeacher(null)}
                  >
                    Annuler
                  </button>
                  <button type="submit" className="btn btn-primary">
                    Enregistrer
                  </button>
                </div>
              </form>
            </section>
          )}

          <section className="card-panel">
            <h2>Comptes enseignants ({data.teachers.length})</h2>
            <div className="table-responsive">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Enseignant</th>
                    <th>E-mail</th>
                    <th>Classes & Matières</th>
                    <th>Statut</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {data.teachers.map((t) => (
                    <tr key={t.userId}>
                      <td data-label="Enseignant">
                        <strong>
                          {t.lastName.toUpperCase()} {t.firstName}
                        </strong>
                        {t.specialty && <div className="subject-cell-sub">{t.specialty}</div>}
                      </td>
                      <td data-label="E-mail">{t.email}</td>
                      <td data-label="Affectations">
                        {t.assignments.length === 0 ? (
                          <span className="muted-text">Aucune classe attribuée</span>
                        ) : (
                          t.assignments
                            .map((a) => `${a.classroomName} : ${a.subjectName}`)
                            .join(" • ")
                        )}
                      </td>
                      <td data-label="Statut">
                        <span
                          className={`badge ${t.isActive ? "badge-success" : "badge-danger"}`}
                        >
                          {t.isActive ? "Actif" : "Désactivé"}
                        </span>
                      </td>
                      <td data-label="Actions">
                        <div className="row-actions">
                          <button
                            type="button"
                            className="btn-link"
                            onClick={() => setEditingTeacher({ ...t, newPassword: "" })}
                          >
                            Modifier
                          </button>
                          <button
                            type="button"
                            className="btn-link danger"
                            onClick={() => requestDeleteTeacher(t)}
                          >
                            Supprimer
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </div>
      )}

      {/* ONGLET 6 : PARENTS, ASSOCIATIONS ENFANTS & CODES OTP */}
      {activeTab === "PARENTS" && data && (
        <div className="stack-lg">
          <div className="two-col-grid">
            <section className="card-panel">
              <h2>Créer un compte parent</h2>
              <form onSubmit={handleCreateParent} className="form-stack">
                <div className="two-col-form">
                  <div className="form-group">
                    <label htmlFor="p-fn">Prénom du parent</label>
                    <input
                      id="p-fn"
                      type="text"
                      value={parFirstName}
                      onChange={(e) => setParFirstName(e.target.value)}
                      required
                    />
                  </div>
                  <div className="form-group">
                    <label htmlFor="p-ln">Nom de famille</label>
                    <input
                      id="p-ln"
                      type="text"
                      value={parLastName}
                      onChange={(e) => setParLastName(e.target.value)}
                      required
                    />
                  </div>
                </div>
                <div className="two-col-form">
                  <div className="form-group">
                    <label htmlFor="p-ph">Téléphone</label>
                    <input
                      id="p-ph"
                      type="text"
                      placeholder="Ex. 07 00 00 00"
                      value={parPhone}
                      onChange={(e) => setParPhone(e.target.value)}
                    />
                  </div>
                  <div className="form-group">
                    <label htmlFor="p-em">E-mail (facultatif)</label>
                    <input
                      id="p-em"
                      type="email"
                      value={parEmail}
                      onChange={(e) => setParEmail(e.target.value)}
                    />
                  </div>
                </div>
                <div className="form-group">
                  <label htmlFor="p-init-stu">Associer dès maintenant un enfant (facultatif)</label>
                  <select
                    id="p-init-stu"
                    value={parInitStudentId}
                    onChange={(e) => setParInitStudentId(e.target.value)}
                  >
                    <option value="">-- Associer plus tard --</option>
                    {data.students.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.lastName.toUpperCase()} {s.firstName} ({s.matricule})
                      </option>
                    ))}
                  </select>
                </div>
                {parInitStudentId && (
                  <div className="form-group">
                    <label htmlFor="p-init-rel">Lien de parenté</label>
                    <select
                      id="p-init-rel"
                      value={parInitRelation}
                      onChange={(e) => setParInitRelation(e.target.value)}
                    >
                      <option value="Père">Père</option>
                      <option value="Mère">Mère</option>
                      <option value="Tuteur légal">Tuteur légal</option>
                      <option value="Parent">Parent</option>
                    </select>
                  </div>
                )}
                <button type="submit" className="btn btn-primary" disabled={busy}>
                  Créer le parent et générer son 1er code
                </button>
              </form>
            </section>

            <section className="card-panel">
              <h2>Relier un parent existant à un enfant</h2>
              <p className="muted-text">
                Un parent ne peut consulter les résultats d'un élève que s'il lui est associé ici.
              </p>
              <form onSubmit={handleLinkParentStudent} className="form-stack">
                <div className="form-group">
                  <label htmlFor="lnk-parent">Compte parent</label>
                  <select
                    id="lnk-parent"
                    value={linkParentId}
                    onChange={(e) => setLinkParentId(e.target.value)}
                    required
                  >
                    {data.parents.map((p) => (
                      <option key={p.parentProfileId} value={p.parentProfileId}>
                        {p.lastName.toUpperCase()} {p.firstName}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="form-group">
                  <label htmlFor="lnk-student">Élève à rattacher</label>
                  <select
                    id="lnk-student"
                    value={linkStudentId}
                    onChange={(e) => setLinkStudentId(e.target.value)}
                    required
                  >
                    {data.students.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.lastName.toUpperCase()} {s.firstName} ({s.matricule})
                      </option>
                    ))}
                  </select>
                </div>
                <div className="form-group">
                  <label htmlFor="lnk-rel">Lien de parenté</label>
                  <select
                    id="lnk-rel"
                    value={linkRelation}
                    onChange={(e) => setLinkRelation(e.target.value)}
                  >
                    <option value="Père">Père</option>
                    <option value="Mère">Mère</option>
                    <option value="Tuteur légal">Tuteur légal</option>
                    <option value="Parent">Parent</option>
                  </select>
                </div>
                <button type="submit" className="btn btn-primary" disabled={busy}>
                  Associer cet enfant au parent
                </button>
              </form>
            </section>
          </div>

          {editingParent && (
            <section className="card-panel highlight-panel">
              <h2>
                Modifier la fiche parent — {editingParent.firstName} {editingParent.lastName}
              </h2>
              <form onSubmit={requestSaveParentEdit} className="form-grid-3">
                <div className="form-group">
                  <label>Prénom</label>
                  <input
                    type="text"
                    value={editingParent.firstName}
                    onChange={(e) =>
                      setEditingParent({ ...editingParent, firstName: e.target.value })
                    }
                    required
                  />
                </div>
                <div className="form-group">
                  <label>Nom</label>
                  <input
                    type="text"
                    value={editingParent.lastName}
                    onChange={(e) =>
                      setEditingParent({ ...editingParent, lastName: e.target.value })
                    }
                    required
                  />
                </div>
                <div className="form-group">
                  <label>Téléphone</label>
                  <input
                    type="text"
                    value={editingParent.phone || ""}
                    onChange={(e) =>
                      setEditingParent({ ...editingParent, phone: e.target.value })
                    }
                  />
                </div>
                <div className="form-group">
                  <label>E-mail (facultatif)</label>
                  <input
                    type="email"
                    value={editingParent.email || ""}
                    onChange={(e) =>
                      setEditingParent({ ...editingParent, email: e.target.value })
                    }
                  />
                </div>
                <div className="form-group">
                  <label>Adresse (facultatif)</label>
                  <input
                    type="text"
                    value={editingParent.address || ""}
                    onChange={(e) =>
                      setEditingParent({ ...editingParent, address: e.target.value })
                    }
                  />
                </div>
                <div className="form-group">
                  <label className="checkbox-row compact">
                    <input
                      type="checkbox"
                      checked={editingParent.isActive}
                      onChange={(e) =>
                        setEditingParent({ ...editingParent, isActive: e.target.checked })
                      }
                    />
                    <span>Compte actif (autorisé à consulter)</span>
                  </label>
                </div>
                <div className="form-actions-end">
                  <button
                    type="button"
                    className="btn btn-secondary"
                    onClick={() => setEditingParent(null)}
                  >
                    Annuler
                  </button>
                  <button type="submit" className="btn btn-primary">
                    Enregistrer
                  </button>
                </div>
              </form>
            </section>
          )}

          <section className="card-panel">
            <h2>Comptes parents, enfants associés et codes à usage unique</h2>
            <div className="table-responsive">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Parent</th>
                    <th>Enfants associés</th>
                    <th>Code à usage unique</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {data.parents.map((p) => {
                    const parentFullName = `${p.firstName} ${p.lastName}`;
                    return (
                      <tr key={p.userId}>
                        <td data-label="Parent">
                          <strong>
                            {p.lastName.toUpperCase()} {p.firstName}
                          </strong>
                          {p.phone && <div className="subject-cell-sub">Tél. : {p.phone}</div>}
                        </td>
                        <td data-label="Enfants associés">
                          {p.children.length === 0 ? (
                            <span className="muted-text">Aucun enfant lié</span>
                          ) : (
                            <div className="grade-chips">
                              {p.children.map((ch) => (
                                <span key={ch.linkId} className="grade-chip">
                                  <strong>
                                    {ch.lastName.toUpperCase()} {ch.firstName}
                                  </strong>
                                  <small>
                                    {ch.matricule} ({ch.relationship})
                                  </small>
                                  <button
                                    type="button"
                                    className="btn-link danger"
                                    onClick={() =>
                                      requestUnlinkParentStudent(
                                        ch.linkId,
                                        parentFullName,
                                        `${ch.firstName} ${ch.lastName}`
                                      )
                                    }
                                  >
                                    Retirer
                                  </button>
                                </span>
                              ))}
                            </div>
                          )}
                        </td>
                        <td data-label="Code OTP">
                          {p.activeOtpCount > 0 ? (
                            <span className="badge badge-success">
                              1 code actif (non utilisé)
                            </span>
                          ) : (
                            <span className="badge badge-neutral">
                              Aucun code actif — à générer
                            </span>
                          )}
                        </td>
                        <td data-label="Actions">
                          <div className="row-actions">
                            <button
                              type="button"
                              className="btn btn-sm btn-primary"
                              onClick={() => requestGenerateNewOtp(p)}
                            >
                              Générer un code OTP
                            </button>
                            <button
                              type="button"
                              className="btn-link"
                              onClick={() => setEditingParent({ ...p })}
                            >
                              Modifier
                            </button>
                            <button
                              type="button"
                              className="btn-link danger"
                              onClick={() => requestDeleteParent(p)}
                            >
                              Supprimer
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>
        </div>
      )}

      {/* ONGLET BULLETINS & NOTES */}
      {activeTab === "BULLETINS" && data && (
        <AdminBulletinSupervisor students={data.students} allTerms={allTerms} />
      )}

      <ConfirmModal
        open={Boolean(confirmState)}
        title={confirmState?.title}
        message={confirmState?.message}
        confirmLabel={confirmState?.confirmLabel}
        variant={confirmState?.variant}
        loading={busy}
        onConfirm={runConfirmedAction}
        onCancel={() => setConfirmState(null)}
      />
    </main>
  );
}
