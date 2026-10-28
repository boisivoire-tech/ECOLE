import React, { useCallback, useEffect, useState } from "react";
import { apiRequest, formatDateFr, formatScore } from "../api/client.js";
import AlertBanner from "../components/AlertBanner.jsx";
import ConfirmModal from "../components/ConfirmModal.jsx";

export default function TeacherDashboard() {
  const [assignments, setAssignments] = useState([]);
  const [selectedAssignmentId, setSelectedAssignmentId] = useState("");
  const [selectedTermId, setSelectedTermId] = useState("");
  const [classRoster, setClassRoster] = useState(null);

  const [loadingInit, setLoadingInit] = useState(true);
  const [loadingRoster, setLoadingRoster] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  const [successMsg, setSuccessMsg] = useState("");

  // Formulaire d'ajout de note
  const [newStudentId, setNewStudentId] = useState("");
  const [newTitle, setNewTitle] = useState("");
  const [newValue, setNewValue] = useState("");
  const [newWeight, setNewWeight] = useState("1");
  const [newDate, setNewDate] = useState(() => new Date().toISOString().slice(0, 10));

  // Édition d'une note existante
  const [editingGrade, setEditingGrade] = useState(null);

  // Saisie d'appréciation matière par élève
  const [remarkDrafts, setRemarkDrafts] = useState({});

  // Fenêtre de confirmation (suppression ou correction importante)
  const [confirmState, setConfirmState] = useState(null);

  const loadAssignments = useCallback(async () => {
    setLoadingInit(true);
    setErrorMsg("");
    try {
      const data = await apiRequest("/api/teacher/assignments");
      const list = data.assignments || [];
      setAssignments(list);
      if (list.length > 0) {
        const first = list[0];
        setSelectedAssignmentId(String(first.classSubjectId));
        if (first.schoolYear?.terms?.length > 0) {
          setSelectedTermId(String(first.schoolYear.terms[0].id));
        }
      }
    } catch (err) {
      setErrorMsg(err.message);
    } finally {
      setLoadingInit(false);
    }
  }, []);

  useEffect(() => {
    loadAssignments();
  }, [loadAssignments]);

  const loadRoster = useCallback(async (assignmentId, termId) => {
    if (!assignmentId || !termId) return;
    setLoadingRoster(true);
    setErrorMsg("");
    try {
      const data = await apiRequest(
        `/api/teacher/assignments/${assignmentId}/students?termId=${termId}`
      );
      setClassRoster(data);
      const drafts = {};
      for (const st of data.students || []) {
        drafts[st.id] = st.subjectRemark || "";
      }
      setRemarkDrafts(drafts);
      if (data.students?.length > 0) {
        setNewStudentId((prev) =>
          data.students.some((s) => String(s.id) === String(prev))
            ? prev
            : String(data.students[0].id)
        );
      } else {
        setNewStudentId("");
      }
    } catch (err) {
      setErrorMsg(err.message);
    } finally {
      setLoadingRoster(false);
    }
  }, []);

  useEffect(() => {
    if (selectedAssignmentId && selectedTermId) {
      loadRoster(selectedAssignmentId, selectedTermId);
    }
  }, [selectedAssignmentId, selectedTermId, loadRoster]);

  function handleSelectAssignment(newId) {
    setSelectedAssignmentId(newId);
    const found = assignments.find((a) => String(a.classSubjectId) === String(newId));
    const firstTerm = found?.schoolYear?.terms?.[0];
    setSelectedTermId(firstTerm ? String(firstTerm.id) : "");
  }

  async function handleCreateGrade(e) {
    e.preventDefault();
    setErrorMsg("");
    setSuccessMsg("");
    setSubmitting(true);
    try {
      await apiRequest("/api/teacher/grades", {
        method: "POST",
        body: {
          classSubjectId: Number(selectedAssignmentId),
          studentId: Number(newStudentId),
          termId: Number(selectedTermId),
          title: newTitle,
          value: newValue,
          weight: newWeight,
          evaluatedAt: newDate,
        },
      });
      setNewTitle("");
      setNewValue("");
      setNewWeight("1");
      setSuccessMsg("La note a été enregistrée et la moyenne de l'élève a été recalculée.");
      await loadRoster(selectedAssignmentId, selectedTermId);
    } catch (err) {
      setErrorMsg(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  function requestUpdateGradeConfirmation(e) {
    e.preventDefault();
    if (!editingGrade) return;
    setConfirmState({
      title: "Confirmer la correction de la note",
      message: `Voulez-vous enregistrer la modification de la note « ${editingGrade.title} » (${editingGrade.value}/20) pour l'élève ${editingGrade.studentName} ? La moyenne sera immédiatement mise à jour côté parent.`,
      confirmLabel: "Enregistrer la correction",
      variant: "primary",
      action: async () => {
        await apiRequest(`/api/teacher/grades/${editingGrade.id}`, {
          method: "PUT",
          body: {
            title: editingGrade.title,
            value: editingGrade.value,
            weight: editingGrade.weight,
            evaluatedAt: editingGrade.evaluatedAt,
          },
        });
        setEditingGrade(null);
        setSuccessMsg("La note a été corrigée avec succès.");
        await loadRoster(selectedAssignmentId, selectedTermId);
      },
    });
  }

  function requestDeleteGrade(grade, studentName) {
    setConfirmState({
      title: "Confirmer la suppression de la note",
      message: `Êtes-vous sûr de vouloir supprimer définitivement l'évaluation « ${grade.title} » (${formatScore(
        grade.value
      )}/20) de ${studentName} ?`,
      confirmLabel: "Supprimer la note",
      variant: "danger",
      action: async () => {
        await apiRequest(`/api/teacher/grades/${grade.id}`, {
          method: "DELETE",
        });
        setSuccessMsg("La note a été supprimée.");
        await loadRoster(selectedAssignmentId, selectedTermId);
      },
    });
  }

  async function handleSaveRemark(studentId) {
    setErrorMsg("");
    setSuccessMsg("");
    try {
      await apiRequest("/api/teacher/remarks", {
        method: "PUT",
        body: {
          classSubjectId: Number(selectedAssignmentId),
          studentId: Number(studentId),
          termId: Number(selectedTermId),
          remark: remarkDrafts[studentId] || "",
        },
      });
      setSuccessMsg("L'appréciation de l'élève a été enregistrée.");
      await loadRoster(selectedAssignmentId, selectedTermId);
    } catch (err) {
      setErrorMsg(err.message);
    }
  }

  async function executeConfirmedAction() {
    if (!confirmState?.action) return;
    setSubmitting(true);
    setErrorMsg("");
    try {
      await confirmState.action();
      setConfirmState(null);
    } catch (err) {
      setErrorMsg(err.message);
      setConfirmState(null);
    } finally {
      setSubmitting(false);
    }
  }

  if (loadingInit) {
    return (
      <main className="page-container">
        <div className="loading-box">Chargement de votre espace enseignant...</div>
      </main>
    );
  }

  const currentAssignment = assignments.find(
    (a) => String(a.classSubjectId) === String(selectedAssignmentId)
  );
  const terms = currentAssignment?.schoolYear?.terms || [];

  return (
    <main className="page-container">
      <div className="section-header">
        <div>
          <h1>Espace Enseignant — Saisie et suivi des notes</h1>
          <p className="section-subtitle">
            Vous accédez uniquement aux classes et aux matières qui vous ont été attribuées par
            l'administration.
          </p>
        </div>
      </div>

      <AlertBanner type="error" message={errorMsg} onClose={() => setErrorMsg("")} />
      <AlertBanner type="success" message={successMsg} onClose={() => setSuccessMsg("")} />

      {assignments.length === 0 ? (
        <div className="empty-card">
          Aucune classe ni matière ne vous est encore attribuée. Veuillez contacter
          l'administrateur de l'établissement.
        </div>
      ) : (
        <>
          <section className="card-panel">
            <div className="filters-row">
              <div className="form-group inline-group grow">
                <label htmlFor="teacher-assignment">Classe et matière attribuée</label>
                <select
                  id="teacher-assignment"
                  value={selectedAssignmentId}
                  onChange={(e) => handleSelectAssignment(e.target.value)}
                >
                  {assignments.map((a) => (
                    <option key={a.classSubjectId} value={a.classSubjectId}>
                      {a.classroom.name} — {a.subject.name} (Coef. {a.coefficient}) —{" "}
                      {a.schoolYear.label}
                    </option>
                  ))}
                </select>
              </div>

              <div className="form-group inline-group">
                <label htmlFor="teacher-term">Trimestre / Période</label>
                <select
                  id="teacher-term"
                  value={selectedTermId}
                  onChange={(e) => setSelectedTermId(e.target.value)}
                >
                  {terms.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </section>

          <section className="card-panel">
            <h2>Saisir une nouvelle note</h2>
            {!classRoster?.students?.length ? (
              <p className="muted-text">Aucun élève n'est inscrit dans cette classe.</p>
            ) : (
              <form onSubmit={handleCreateGrade} className="form-grid-5">
                <div className="form-group">
                  <label htmlFor="grade-student">Élève</label>
                  <select
                    id="grade-student"
                    value={newStudentId}
                    onChange={(e) => setNewStudentId(e.target.value)}
                    required
                  >
                    {classRoster.students.map((st) => (
                      <option key={st.id} value={st.id}>
                        {st.lastName.toUpperCase()} {st.firstName} ({st.matricule})
                      </option>
                    ))}
                  </select>
                </div>

                <div className="form-group">
                  <label htmlFor="grade-title">Intitulé de l'évaluation</label>
                  <input
                    id="grade-title"
                    type="text"
                    placeholder="Ex. Devoir surveillé n°2"
                    value={newTitle}
                    onChange={(e) => setNewTitle(e.target.value)}
                    required
                  />
                </div>

                <div className="form-group">
                  <label htmlFor="grade-value">Note (/20)</label>
                  <input
                    id="grade-value"
                    type="number"
                    step="0.25"
                    min="0"
                    max="20"
                    placeholder="Ex. 15.5"
                    value={newValue}
                    onChange={(e) => setNewValue(e.target.value)}
                    required
                  />
                </div>

                <div className="form-group">
                  <label htmlFor="grade-weight">Pondération</label>
                  <input
                    id="grade-weight"
                    type="number"
                    step="0.5"
                    min="0.5"
                    max="10"
                    value={newWeight}
                    onChange={(e) => setNewWeight(e.target.value)}
                    required
                  />
                </div>

                <div className="form-group">
                  <label htmlFor="grade-date">Date d'évaluation</label>
                  <input
                    id="grade-date"
                    type="date"
                    value={newDate}
                    onChange={(e) => setNewDate(e.target.value)}
                    required
                  />
                </div>

                <div className="form-actions-end">
                  <button type="submit" className="btn btn-primary" disabled={submitting}>
                    {submitting ? "Enregistrement..." : "Ajouter la note"}
                  </button>
                </div>
              </form>
            )}
          </section>

          {editingGrade && (
            <section className="card-panel highlight-panel">
              <h2>Corriger une note — {editingGrade.studentName}</h2>
              <form onSubmit={requestUpdateGradeConfirmation} className="form-grid-4">
                <div className="form-group">
                  <label htmlFor="edit-title">Intitulé</label>
                  <input
                    id="edit-title"
                    type="text"
                    value={editingGrade.title}
                    onChange={(e) =>
                      setEditingGrade({ ...editingGrade, title: e.target.value })
                    }
                    required
                  />
                </div>

                <div className="form-group">
                  <label htmlFor="edit-value">Note (/20)</label>
                  <input
                    id="edit-value"
                    type="number"
                    step="0.25"
                    min="0"
                    max="20"
                    value={editingGrade.value}
                    onChange={(e) =>
                      setEditingGrade({ ...editingGrade, value: e.target.value })
                    }
                    required
                  />
                </div>

                <div className="form-group">
                  <label htmlFor="edit-weight">Pondération</label>
                  <input
                    id="edit-weight"
                    type="number"
                    step="0.5"
                    min="0.5"
                    max="10"
                    value={editingGrade.weight}
                    onChange={(e) =>
                      setEditingGrade({ ...editingGrade, weight: e.target.value })
                    }
                    required
                  />
                </div>

                <div className="form-group">
                  <label htmlFor="edit-date">Date</label>
                  <input
                    id="edit-date"
                    type="date"
                    value={editingGrade.evaluatedAt}
                    onChange={(e) =>
                      setEditingGrade({ ...editingGrade, evaluatedAt: e.target.value })
                    }
                    required
                  />
                </div>

                <div className="form-actions-end">
                  <button
                    type="button"
                    className="btn btn-secondary"
                    onClick={() => setEditingGrade(null)}
                  >
                    Annuler
                  </button>
                  <button type="submit" className="btn btn-primary">
                    Valider la correction
                  </button>
                </div>
              </form>
            </section>
          )}

          <section className="card-panel">
            <div className="panel-title-row">
              <h2>
                Élèves inscrits — {classRoster?.assignment?.classroomName} (
                {classRoster?.assignment?.subjectName}, Coef.{" "}
                {classRoster?.assignment?.coefficient})
              </h2>
              <span className="badge badge-neutral">{classRoster?.term?.name}</span>
            </div>

            {loadingRoster ? (
              <div className="loading-box">Chargement des notes de la classe...</div>
            ) : !classRoster?.students?.length ? (
              <p className="muted-text">Aucun élève inscrit dans cette classe.</p>
            ) : (
              <div className="table-responsive">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Élève</th>
                      <th>Notes enregistrées (cliquez pour corriger ou supprimer)</th>
                      <th className="col-center">Moyenne matière</th>
                      <th>Appréciation trimestrielle</th>
                    </tr>
                  </thead>
                  <tbody>
                    {classRoster.students.map((st) => {
                      const fullName = `${st.lastName.toUpperCase()} ${st.firstName}`;
                      return (
                        <tr key={st.id}>
                          <td data-label="Élève">
                            <div className="subject-cell-title">{fullName}</div>
                            <div className="subject-cell-sub">{st.matricule}</div>
                          </td>
                          <td data-label="Notes">
                            {st.grades.length === 0 ? (
                              <span className="muted-text">Aucune note</span>
                            ) : (
                              <div className="grade-chips">
                                {st.grades.map((g) => (
                                  <div key={g.id} className="grade-chip editable">
                                    <div>
                                      <strong>{formatScore(g.value)}/20</strong>{" "}
                                      <small>
                                        {g.title}
                                        {g.weight !== 1 ? ` (×${g.weight})` : ""} —{" "}
                                        {formatDateFr(g.evaluatedAt)}
                                      </small>
                                    </div>
                                    <div className="chip-actions">
                                      <button
                                        type="button"
                                        className="btn-link"
                                        onClick={() =>
                                          setEditingGrade({
                                            ...g,
                                            studentName: fullName,
                                          })
                                        }
                                      >
                                        Corriger
                                      </button>
                                      <button
                                        type="button"
                                        className="btn-link danger"
                                        onClick={() => requestDeleteGrade(g, fullName)}
                                      >
                                        Supprimer
                                      </button>
                                    </div>
                                  </div>
                                ))}
                              </div>
                            )}
                          </td>
                          <td data-label="Moyenne" className="col-center">
                            <strong>
                              {st.subjectAverage !== null
                                ? `${formatScore(st.subjectAverage)} / 20`
                                : "—"}
                            </strong>
                          </td>
                          <td data-label="Appréciation">
                            <div className="inline-remark-box">
                              <input
                                type="text"
                                placeholder="Observation facultative..."
                                value={remarkDrafts[st.id] ?? ""}
                                onChange={(e) =>
                                  setRemarkDrafts({
                                    ...remarkDrafts,
                                    [st.id]: e.target.value,
                                  })
                                }
                              />
                              <button
                                type="button"
                                className="btn btn-sm btn-secondary"
                                onClick={() => handleSaveRemark(st.id)}
                              >
                                Enregistrer
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </>
      )}

      <ConfirmModal
        open={Boolean(confirmState)}
        title={confirmState?.title}
        message={confirmState?.message}
        confirmLabel={confirmState?.confirmLabel}
        variant={confirmState?.variant}
        loading={submitting}
        onConfirm={executeConfirmedAction}
        onCancel={() => setConfirmState(null)}
      />
    </main>
  );
}
