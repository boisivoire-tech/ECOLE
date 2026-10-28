import React, { useCallback, useEffect, useState } from "react";
import {
  apiRequest,
  formatDateFr,
  formatDateTimeFr,
  formatScore,
} from "../api/client.js";
import AlertBanner from "../components/AlertBanner.jsx";

export default function ParentDashboard() {
  const [dashboard, setDashboard] = useState(null);
  const [selectedChildId, setSelectedChildId] = useState(null);
  const [selectedYearId, setSelectedYearId] = useState("");
  const [selectedTermId, setSelectedTermId] = useState("");
  const [resultsData, setResultsData] = useState(null);

  const [loadingDash, setLoadingDash] = useState(true);
  const [loadingResults, setLoadingResults] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");

  const loadDashboard = useCallback(async () => {
    setLoadingDash(true);
    setErrorMsg("");
    try {
      const data = await apiRequest("/api/parent/dashboard");
      setDashboard(data);

      if (data.children?.length > 0) {
        setSelectedChildId(data.children[0].id);
      }
      if (data.defaultSchoolYearId) {
        setSelectedYearId(String(data.defaultSchoolYearId));
      }
      if (data.defaultTermId) {
        setSelectedTermId(String(data.defaultTermId));
      }
    } catch (err) {
      setErrorMsg(err.message);
    } finally {
      setLoadingDash(false);
    }
  }, []);

  useEffect(() => {
    loadDashboard();
  }, [loadDashboard]);

  const loadResults = useCallback(async (studentId, yearId, termId) => {
    if (!studentId || !yearId) return;
    setLoadingResults(true);
    setErrorMsg("");
    try {
      const params = new URLSearchParams();
      params.set("schoolYearId", String(yearId));
      if (termId) {
        params.set("termId", String(termId));
      }
      const data = await apiRequest(
        `/api/parent/children/${studentId}/results?${params.toString()}`
      );
      setResultsData(data);
    } catch (err) {
      setErrorMsg(err.message);
      setResultsData(null);
    } finally {
      setLoadingResults(false);
    }
  }, []);

  useEffect(() => {
    if (selectedChildId && selectedYearId) {
      loadResults(selectedChildId, selectedYearId, selectedTermId);
    }
  }, [selectedChildId, selectedYearId, selectedTermId, loadResults]);

  function handleYearChange(newYearId) {
    setSelectedYearId(newYearId);
    const yearObj = dashboard?.schoolYears?.find((y) => String(y.id) === String(newYearId));
    const firstTerm = yearObj?.terms?.[0];
    setSelectedTermId(firstTerm ? String(firstTerm.id) : "");
  }

  if (loadingDash) {
    return (
      <main className="page-container">
        <div className="loading-box">Chargement de votre espace parent...</div>
      </main>
    );
  }

  const currentYearObj = dashboard?.schoolYears?.find(
    (y) => String(y.id) === String(selectedYearId)
  );
  const availableTerms = currentYearObj?.terms || [];
  const bulletin = resultsData?.bulletin;
  const showRemarks = Boolean(bulletin?.visibility?.showRemarks);
  const showAbsences = Boolean(bulletin?.visibility?.showAbsences);

  return (
    <main className="page-container">
      <AlertBanner type="error" message={errorMsg} onClose={() => setErrorMsg("")} />

      <section className="section-block no-print">
        <div className="section-header">
          <div>
            <h1>Mes enfants rattachés</h1>
            <p className="section-subtitle">
              Sélectionnez un enfant pour consulter ses notes et moyennes détaillées par période.
            </p>
          </div>
        </div>

        {!dashboard?.children?.length ? (
          <div className="empty-card">
            Aucun élève n'est actuellement associé à votre compte parent. Veuillez contacter
            l'administration de l'établissement.
          </div>
        ) : (
          <div className="children-grid">
            {dashboard.children.map((child) => {
              const isSelected = child.id === selectedChildId;
              return (
                <article
                  key={child.id}
                  className={`child-card ${isSelected ? "selected" : ""}`}
                >
                  <div className="child-card-top">
                    <div>
                      <span className="badge badge-neutral">{child.matricule}</span>
                      <span className="badge badge-soft">{child.relationship}</span>
                      <h2 className="child-name">
                        {child.lastName.toUpperCase()} {child.firstName}
                      </h2>
                      <p className="child-class">
                        {child.currentClassroom
                          ? `Classe : ${child.currentClassroom.name} (${child.currentClassroom.schoolYearLabel})`
                          : "Non inscrit sur l'année en cours"}
                      </p>
                    </div>
                    {child.quickSummary && (
                      <div className="child-avg-pill">
                        <span className="avg-label">Moyenne</span>
                        <strong className="avg-value">
                          {formatScore(child.quickSummary.generalAverage)}
                          <small>/20</small>
                        </strong>
                      </div>
                    )}
                  </div>

                  {child.quickSummary && (
                    <div className="child-card-meta">
                      <span>
                        {child.quickSummary.termName} —{" "}
                        {child.quickSummary.evaluatedSubjectsCount}/
                        {child.quickSummary.totalSubjectsCount} matière(s) évaluée(s)
                      </span>
                      <span>
                        Mise à jour : {formatDateTimeFr(child.quickSummary.lastUpdatedAt)}
                      </span>
                    </div>
                  )}

                  <button
                    type="button"
                    className={`btn btn-block ${isSelected ? "btn-primary" : "btn-secondary"}`}
                    onClick={() => setSelectedChildId(child.id)}
                  >
                    {isSelected
                      ? "Bulletin affiché ci-dessous"
                      : "Consulter les résultats détaillés"}
                  </button>
                </article>
              );
            })}
          </div>
        )}
      </section>

      {selectedChildId && (
        <section className="section-block bulletin-section">
          <div className="bulletin-toolbar no-print">
            <div className="filters-row">
              <div className="form-group inline-group">
                <label htmlFor="select-school-year">Année scolaire</label>
                <select
                  id="select-school-year"
                  value={selectedYearId}
                  onChange={(e) => handleYearChange(e.target.value)}
                >
                  {(dashboard?.schoolYears || []).map((sy) => (
                    <option key={sy.id} value={sy.id}>
                      {sy.label} {sy.isCurrent ? "(Année en cours)" : ""}
                    </option>
                  ))}
                </select>
              </div>

              <div className="form-group inline-group">
                <label htmlFor="select-term">Trimestre / Période</label>
                <select
                  id="select-term"
                  value={selectedTermId}
                  onChange={(e) => setSelectedTermId(e.target.value)}
                  disabled={availableTerms.length === 0}
                >
                  {availableTerms.length === 0 ? (
                    <option value="">Aucune période publiée</option>
                  ) : (
                    availableTerms.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.name}
                      </option>
                    ))
                  )}
                </select>
              </div>
            </div>

            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => window.print()}
            >
              Imprimer ce relevé
            </button>
          </div>

          {loadingResults ? (
            <div className="loading-box">Chargement du relevé de notes...</div>
          ) : !resultsData?.enrolled ? (
            <div className="empty-card">
              Cet élève n'a pas d'inscription enregistrée sur l'année scolaire sélectionnée.
            </div>
          ) : !bulletin ? (
            <div className="empty-card">
              Aucun trimestre publié n'est disponible pour cette année scolaire.
            </div>
          ) : (
            <div className="bulletin-sheet">
              <div className="bulletin-banner">
                <div>
                  <div className="bulletin-school-title">
                    {dashboard?.schoolName || "Portail scolaire"}
                  </div>
                  <h2 className="bulletin-heading">
                    Relevé de résultats — {resultsData.student.lastName.toUpperCase()}{" "}
                    {resultsData.student.firstName}
                  </h2>
                  <p className="bulletin-meta-line">
                    Matricule : <strong>{resultsData.student.matricule}</strong> • Classe :{" "}
                    <strong>{resultsData.classroom.name}</strong> • Année :{" "}
                    <strong>{resultsData.schoolYear.label}</strong> • Période :{" "}
                    <strong>{resultsData.term.name}</strong>
                  </p>
                </div>
                <div className="last-update-box">
                  <span className="last-update-label">Dernière mise à jour des résultats</span>
                  <strong>{formatDateTimeFr(bulletin.summary.lastUpdatedAt)}</strong>
                </div>
              </div>

              <div className="kpi-grid">
                <div className="kpi-card kpi-highlight">
                  <span className="kpi-label">Moyenne générale</span>
                  <strong className="kpi-value">
                    {formatScore(bulletin.summary.generalAverage)}
                    {bulletin.summary.generalAverage !== null && <small> / 20</small>}
                  </strong>
                  {bulletin.summary.mention && (
                    <span className="kpi-sub">{bulletin.summary.mention}</span>
                  )}
                </div>

                <div className="kpi-card">
                  <span className="kpi-label">Total des coefficients</span>
                  <strong className="kpi-value">{bulletin.summary.totalCoefficients}</strong>
                  <span className="kpi-sub">Sur les matières évaluées</span>
                </div>

                <div className="kpi-card">
                  <span className="kpi-label">Total points pondérés</span>
                  <strong className="kpi-value">
                    {formatScore(bulletin.summary.totalWeightedPoints)}
                  </strong>
                  <span className="kpi-sub">Somme (Moyenne × Coef.)</span>
                </div>

                <div className="kpi-card">
                  <span className="kpi-label">Matières évaluées</span>
                  <strong className="kpi-value">
                    {bulletin.summary.evaluatedSubjectsCount} /{" "}
                    {bulletin.summary.totalSubjectsCount}
                  </strong>
                  <span className="kpi-sub">Disciplines de la classe</span>
                </div>
              </div>

              <div className="table-responsive">
                <table className="data-table bulletin-table">
                  <thead>
                    <tr>
                      <th>Matière & Enseignant</th>
                      <th className="col-center">Coef.</th>
                      <th>Notes détaillées (/20)</th>
                      <th className="col-center">Moyenne matière</th>
                      <th className="col-center">Moy. × Coef.</th>
                      {showRemarks && <th>Appréciation de l'enseignant</th>}
                    </tr>
                  </thead>
                  <tbody>
                    {bulletin.subjects.map((sub) => (
                      <tr key={sub.classSubjectId}>
                        <td data-label="Matière">
                          <div className="subject-cell-title">{sub.subjectName}</div>
                          <div className="subject-cell-sub">Prof. : {sub.teacherName}</div>
                        </td>
                        <td data-label="Coefficient" className="col-center">
                          <span className="coef-badge">{sub.coefficient}</span>
                        </td>
                        <td data-label="Notes (/20)">
                          {sub.grades.length === 0 ? (
                            <span className="muted-text">Aucune note enregistrée</span>
                          ) : (
                            <div className="grade-chips">
                              {sub.grades.map((g) => (
                                <span
                                  key={g.id}
                                  className="grade-chip"
                                  title={`Évalué le ${formatDateFr(g.evaluatedAt)}`}
                                >
                                  <strong>{formatScore(g.value)}</strong>
                                  <small>
                                    {g.title}
                                    {g.weight !== 1 ? ` (×${g.weight})` : ""}
                                  </small>
                                </span>
                              ))}
                            </div>
                          )}
                        </td>
                        <td data-label="Moyenne matière" className="col-center">
                          <strong
                            className={`avg-score ${
                              sub.average !== null && sub.average < 10 ? "score-low" : ""
                            }`}
                          >
                            {sub.average !== null ? `${formatScore(sub.average)} / 20` : "—"}
                          </strong>
                        </td>
                        <td data-label="Points pondérés" className="col-center">
                          {sub.weightedPoints !== null ? formatScore(sub.weightedPoints) : "—"}
                        </td>
                        {showRemarks && (
                          <td data-label="Appréciation">
                            {sub.subjectRemark ? (
                              <span>{sub.subjectRemark}</span>
                            ) : (
                              <span className="muted-text">—</span>
                            )}
                          </td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {(showAbsences || showRemarks) && (
                <div className="school-life-grid">
                  {showAbsences && bulletin.attendance && (
                    <div className="info-panel">
                      <h3>Assiduité & Absences sur la période</h3>
                      <div className="attendance-stats">
                        <div className="attendance-item">
                          <span>Absences justifiées</span>
                          <strong>{bulletin.attendance.justifiedAbsences} h</strong>
                        </div>
                        <div className="attendance-item">
                          <span>Absences non justifiées</span>
                          <strong>{bulletin.attendance.unjustifiedAbsences} h</strong>
                        </div>
                        <div className="attendance-item">
                          <span>Retards signalés</span>
                          <strong>{bulletin.attendance.lateCount}</strong>
                        </div>
                      </div>
                    </div>
                  )}

                  {showRemarks && (
                    <div className="info-panel">
                      <h3>Observation générale de l'établissement</h3>
                      <p className="general-remark-text">
                        {bulletin.generalRemark ||
                          "Aucune observation générale n'a encore été saisie pour ce trimestre."}
                      </p>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </section>
      )}
    </main>
  );
}
