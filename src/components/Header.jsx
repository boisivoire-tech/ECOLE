import React, { useState } from "react";
import { apiRequest } from "../api/client.js";
import AlertBanner from "./AlertBanner.jsx";

const ROLE_LABELS = {
  ADMIN: "Administration",
  TEACHER: "Espace Enseignant",
  PARENT: "Espace Parent d'élève",
};

export default function Header({ schoolName, user, onLogout }) {
  const [showPwdModal, setShowPwdModal] = useState(false);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  const [successMsg, setSuccessMsg] = useState("");

  const canChangePassword = user && (user.role === "ADMIN" || user.role === "TEACHER");

  function openModal() {
    setCurrentPassword("");
    setNewPassword("");
    setConfirmPassword("");
    setErrorMsg("");
    setSuccessMsg("");
    setShowPwdModal(true);
  }

  async function handleSubmitPassword(e) {
    e.preventDefault();
    setErrorMsg("");
    setSuccessMsg("");

    if (newPassword !== confirmPassword) {
      setErrorMsg("La confirmation ne correspond pas au nouveau mot de passe.");
      return;
    }

    setLoading(true);
    try {
      await apiRequest("/api/auth/change-password", {
        method: "POST",
        body: { currentPassword, newPassword },
      });
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      setSuccessMsg("Votre mot de passe a été modifié avec succès.");
    } catch (err) {
      setErrorMsg(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <header className="app-header no-print">
        <div className="header-inner">
          <div className="brand-block">
            <div className="brand-mark" aria-hidden="true">
              PS
            </div>
            <div>
              <div className="brand-title">Portail scolaire</div>
              <div className="brand-subtitle">{schoolName || "Établissement scolaire"}</div>
            </div>
          </div>

          {user && (
            <div className="user-controls">
              <div className="user-identity">
                <span className="role-pill">{ROLE_LABELS[user.role] || user.role}</span>
                <span className="user-name">
                  {user.firstName} {user.lastName}
                </span>
              </div>
              {canChangePassword && (
                <button
                  type="button"
                  className="btn btn-outline-light"
                  onClick={openModal}
                >
                  Mon mot de passe
                </button>
              )}
              <button type="button" className="btn btn-outline-light" onClick={onLogout}>
                Se déconnecter
              </button>
            </div>
          )}
        </div>
      </header>

      {showPwdModal && (
        <div
          className="modal-backdrop no-print"
          role="dialog"
          aria-modal="true"
          aria-labelledby="pwd-modal-title"
        >
          <div className="modal-card">
            <h3 id="pwd-modal-title" className="modal-title">
              Modifier mon mot de passe
            </h3>
            <p className="modal-message">
              Choisissez un mot de passe personnel d'au moins 10 caractères.
            </p>

            <AlertBanner type="error" message={errorMsg} onClose={() => setErrorMsg("")} />
            <AlertBanner
              type="success"
              message={successMsg}
              onClose={() => setSuccessMsg("")}
            />

            <form onSubmit={handleSubmitPassword} className="form-stack">
              <div className="form-group">
                <label htmlFor="cur-pwd">Mot de passe actuel</label>
                <input
                  id="cur-pwd"
                  type="password"
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  autoComplete="current-password"
                  required
                />
              </div>

              <div className="form-group">
                <label htmlFor="new-pwd">Nouveau mot de passe (10 caractères min.)</label>
                <input
                  id="new-pwd"
                  type="password"
                  minLength={10}
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  autoComplete="new-password"
                  required
                />
              </div>

              <div className="form-group">
                <label htmlFor="conf-pwd">Confirmer le nouveau mot de passe</label>
                <input
                  id="conf-pwd"
                  type="password"
                  minLength={10}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  autoComplete="new-password"
                  required
                />
              </div>

              <div className="modal-actions">
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => setShowPwdModal(false)}
                  disabled={loading}
                >
                  Fermer
                </button>
                <button type="submit" className="btn btn-primary" disabled={loading}>
                  {loading ? "Enregistrement..." : "Mettre à jour"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
