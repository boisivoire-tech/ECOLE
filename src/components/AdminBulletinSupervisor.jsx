import React, { useCallback, useEffect, useState } from "react";
import {
  apiRequest,
  formatDateFr,
  formatDateTimeFr,
  formatScore,
} from "../api/client.js";
import AlertBanner from "./AlertBanner.jsx";
import ConfirmModal from "./ConfirmModal.jsx";

export default function AdminBulletinSupervisor({ students, allTerms }) {
  const [studentId, setStudentId] = useState(
    students?.[0]?.id ? String(students[0].id) : ""
  );
  const [termId, setTermId] = useState(
    allTerms?.[0]?.id ? String(allTerms[0].id) : ""
  );
  const [bulletinData, setBulletinData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  const [successMsg, setSuccessMsg] = useState("");

  const [editingGrade, setEditingGrade] = useState(null);
  const [confirmState, setConfirmState] = useState(null);

  const loadBulletin = useCallback(async (sId, tId) => {
    if (!sId || !tId) return;
    setLoading(true);
    setErrorMsg("");
    try {
      const res = await apiRequest(
        `/api/admin/students/${sId}/bulletin?termId=${tId}`
      );
      setBulletinData(res);
    } catch (err) {
      setErrorMsg(err.message);
      setBulletinData(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (studentId && termId) {
      loadBulletin(studentId, termId);
    }
  }, [studentId, termId, loadBulletin]);

  function requestSaveGradeEdit(e) {
    e.preventDefault();
    if (!editingGrade) return;
    setConfirmState({
      title: "Confirmer la correction administrative de la note",
      message: `Enregistrer la correction de « ${editingGrade.title} » (${editingGrade.value}/20) ? La moyenne de l'élève et la date de dernière mise à jour seront actualisées.`,
      confirmLabel: "Appliquer la correction",
      variant: "primary",
      action: async () => {
        await apiRequest(`/api/admin/grades/${editingGrade.id}`, {
          method: "PUT",
          body: {
            title: editingGrade.title,
            value: editingGrade.value,
            weight: editingGrade.weight,
            evaluatedAt: editingGrade.evaluatedAt,
          },
        });
        setEditingGrade(null);
        setSuccessMsg("La note a été corrigée par l'administration.");
        await loadBulletin(studentId, termId);
      },
    });
  }

  function requestDeleteGrade(grade, subjectName) {
    setConfirmState({
      title: "Confirmer la suppression administrative de la note",
      message: `Supprimer définitivement la note « ${grade.title} » (${formatScore(
        grade.value
      )}/20 en ${subjectName}) ?`,
      confirmLabel: "Supprimer la note",
      variant: "danger",
      action: async () => {
        await apiRequest(`/api/admin/grades/${grade.id}`, {
          method: "DELETE",
        });
        setSuccessMsg("La note a été supprimée.");
        await loadBulletin(studentId, termId);
      },
    });
  }

  async function executeConfirmed() {
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

  const bulletin = bulletinData?.bulletin;

  return (
    <div className="stack-lg">
      <AlertBanner type="error" message={errorMsg} onClose={() => setErrorMsg("")} />
      <AlertBanner type="success" message={successMsg} onClose={() => setSuccessMsg("")} />

      <section className="card-panel">
        <h2>Contrôle des bulletins et correction exceptionnelle des notes</h2>
        <p className="muted-text">
          Consultez le relevé complet d'un élève tel qu'il est calculé et corrigez ou supprimez
          une note erronée si nécessaire.
        </p>

        <div className="filters-row">
          <div className="form-group inline-group grow">
            <label htmlFor="sup-student">Élève</label>
            <select
              id="sup-student"
              value={studentId}
              onChange={(e) => setStudentId(e.target.value)}
            >
              {students.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.lastName.toUpperCase()} {s.firstName} ({s.matricule})
                </option>
              ))}
            </select>
          </div>

          <div className="form-group inline-group">
            <label htmlFor="sup-term">Trimestre</label>
            <select
              id="sup-term"
              value={termId}
              onChange={(e) => setTermId(e.target.value)}
            >
              {allTerms.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name} ({t.yearLabel})
                </option>
              ))}
            </select>
          </div>
        </div>
      </section>

      {editingGrade && (
        <section className="card-panel highlight-panel">
          <h2>Corriger la note — {editingGrade.subjectName}</h2>
          <form onSubmit={requestSaveGradeEdit} className="form-grid-4">
            <div className="form-group">
              <label>Intitulé</label>
              <input
                type="text"
                value={editingGrade.title}
                onChange={(e) =>
                  setEditingGrade({ ...editingGrade, title: e.target.value })
                }
                required
              />
            </div>
            <div className="form-group">
              <label>Note (/20)</label>
              <input
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
              <label>Pondération</label>
              <input
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
              <label>Date</label>
              <input
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
                Enregistrer
              </button>
            </div>
          </form>
        </section>
      )}

      {loading ? (
        <div className="loading-box">Chargement du bulletin...</div>
      ) : !bulletinData?.enrolled || !bulletin ? (
        <div className="empty-card">
          Cet élève n'est pas inscrit sur l'année scolaire de ce trimestre.
        </div>
      ) : (
        <section className="card-panel">
          <div className="bulletin-banner">
            <div>
              <h3>
                {bulletinData.student.lastName.toUpperCase()}{" "}
                {bulletinData.student.firstName} ({bulletinData.student.matricule}) —{" "}
                {bulletinData.classroom.name}
              </h3>
              <p className="muted-text">
                {bulletinData.term.name} ({bulletinData.term.schoolYearLabel}) • Moyenne
                générale :{" "}
                <strong>{formatScore(bulletin.summary.generalAverage)} / 20</strong>
              </p>
            </div>
            <div className="last-update-box">
              <span className="last-update-label">Dernière mise à jour</span>
              <strong>{formatDateTimeFr(bulletin.summary.lastUpdatedAt)}</strong>
            </div>
          </div>

          <div className="table-responsive">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Matière</th>
                  <th className="col-center">Coef.</th>
                  <th>Notes enregistrées</th>
                  <th className="col-center">Moyenne</th>
                </tr>
              </thead>
              <tbody>
                {bulletin.subjects.map((sub) => (
                  <tr key={sub.classSubjectId}>
                    <td data-label="Matière">
                      <div className="subject-cell-title">{sub.subjectName}</div>
                      <div className="subject-cell-sub">Prof. : {sub.teacherName}</div>
                    </td>
                    <td data-label="Coef." className="col-center">
                      {sub.coefficient}
                    </td>
                    <td data-label="Notes">
                      {sub.grades.length === 0 ? (
                        <span className="muted-text">Aucune note</span>
                      ) : (
                        <div className="grade-chips">
                          {sub.grades.map((g) => (
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
                                      subjectName: sub.subjectName,
                                    })
                                  }
                                >
                                  Corriger
                                </button>
                                <button
                                  type="button"
                                  className="btn-link danger"
                                  onClick={() =>
                                    requestDeleteGrade(g, sub.subjectName)
                                  }
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
                        {sub.average !== null
                          ? `${formatScore(sub.average)} / 20`
                          : "—"}
                      </strong>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      <ConfirmModal
        open={Boolean(confirmState)}
        title={confirmState?.title}
        message={confirmState?.message}
        confirmLabel={confirmState?.confirmLabel}
        variant={confirmState?.variant}
        loading={busy}
        onConfirm={executeConfirmed}
        onCancel={() => setConfirmState(null)}
      />
    </div>
  );
}
