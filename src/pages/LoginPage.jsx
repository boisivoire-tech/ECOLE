import React, { useState } from "react";
import { apiRequest } from "../api/client.js";
import AlertBanner from "../components/AlertBanner.jsx";

export default function LoginPage({
  schoolName,
  initialParentStep2 = false,
  onLoginSuccess,
}) {
  const [activeTab, setActiveTab] = useState("PARENT"); // "PARENT" | "STAFF"
  const [parentStep, setParentStep] = useState(initialParentStep2 ? 2 : 1);

  // Formulaire Parent — Étape 1
  const [matricule, setMatricule] = useState("");
  const [lastName, setLastName] = useState("");
  const [birthDate, setBirthDate] = useState("");

  // Formulaire Parent — Étape 2
  const [otpCode, setOtpCode] = useState("");

  // Formulaire Personnel (Admin / Enseignant)
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  const [infoMsg, setInfoMsg] = useState("");

  async function handleParentStep1(e) {
    e.preventDefault();
    setErrorMsg("");
    setInfoMsg("");
    setLoading(true);
    try {
      const res = await apiRequest("/api/auth/parent/step1", {
        method: "POST",
        body: { matricule, lastName, birthDate },
      });
      setParentStep(2);
      setOtpCode("");
      setInfoMsg(
        res.message ||
          "Étape 1 enregistrée. Veuillez saisir le code à usage unique remis par l'établissement."
      );
    } catch (err) {
      setErrorMsg(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function handleParentStep2(e) {
    e.preventDefault();
    setErrorMsg("");
    setInfoMsg("");
    setLoading(true);
    try {
      const res = await apiRequest("/api/auth/parent/step2", {
        method: "POST",
        body: { otpCode },
      });
      onLoginSuccess(res.user);
    } catch (err) {
      setErrorMsg(err.message);
      if (err.payload?.resetStep) {
        setParentStep(1);
        setOtpCode("");
      }
    } finally {
      setLoading(false);
    }
  }

  async function handleResetParentStep() {
    setErrorMsg("");
    setInfoMsg("");
    setOtpCode("");
    try {
      await apiRequest("/api/auth/parent/cancel", { method: "POST" });
    } catch {
      // Ignoré
    }
    setParentStep(1);
  }

  async function handleStaffLogin(e) {
    e.preventDefault();
    setErrorMsg("");
    setInfoMsg("");
    setLoading(true);
    try {
      const res = await apiRequest("/api/auth/staff/login", {
        method: "POST",
        body: { email, password },
      });
      onLoginSuccess(res.user);
    } catch (err) {
      setErrorMsg(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="auth-wrapper">
      <section className="auth-card">
        <div className="auth-hero">
          <h1>Bienvenue sur le Portail scolaire</h1>
          <p className="auth-school-name">{schoolName || "Établissement scolaire"}</p>
          <p className="auth-lead">
            Consultation confidentielle des notes, des moyennes trimestrielles et du suivi
            scolaire des élèves.
          </p>
        </div>

        <div className="auth-tabs" role="tablist" aria-label="Choix du type de compte">
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === "PARENT"}
            className={`auth-tab ${activeTab === "PARENT" ? "active" : ""}`}
            onClick={() => {
              setActiveTab("PARENT");
              setErrorMsg("");
              setInfoMsg("");
            }}
          >
            Parents d'élèves
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === "STAFF"}
            className={`auth-tab ${activeTab === "STAFF" ? "active" : ""}`}
            onClick={() => {
              setActiveTab("STAFF");
              setErrorMsg("");
              setInfoMsg("");
            }}
          >
            Enseignants & Administration
          </button>
        </div>

        <AlertBanner type="error" message={errorMsg} onClose={() => setErrorMsg("")} />
        <AlertBanner type="info" message={infoMsg} onClose={() => setInfoMsg("")} />

        {activeTab === "PARENT" && parentStep === 1 && (
          <form onSubmit={handleParentStep1} className="form-stack">
            <div className="step-indicator">
              <span className="step-badge">Étape 1 sur 2</span>
              <span>Identification de votre enfant</span>
            </div>

            <div className="form-group">
              <label htmlFor="parent-matricule">Matricule de l'élève</label>
              <input
                id="parent-matricule"
                type="text"
                placeholder="Ex. ELV-2026-001"
                value={matricule}
                onChange={(e) => setMatricule(e.target.value)}
                autoComplete="off"
                required
              />
            </div>

            <div className="form-group">
              <label htmlFor="parent-lastname">Nom de famille de l'élève</label>
              <input
                id="parent-lastname"
                type="text"
                placeholder="Ex. Yao"
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
                autoComplete="family-name"
                required
              />
            </div>

            <div className="form-group">
              <label htmlFor="parent-birthdate">Date de naissance de l'élève</label>
              <input
                id="parent-birthdate"
                type="date"
                value={birthDate}
                onChange={(e) => setBirthDate(e.target.value)}
                required
              />
            </div>

            <div className="security-note">
              <strong>Protection renforcée :</strong> ces trois informations seules ne permettent
              jamais d'afficher les notes. Un code personnel à usage unique remis par
              l'établissement vous sera demandé à l'étape suivante.
            </div>

            <button type="submit" className="btn btn-primary btn-block" disabled={loading}>
              {loading ? "Vérification en cours..." : "Continuer vers l'étape 2"}
            </button>
          </form>
        )}

        {activeTab === "PARENT" && parentStep === 2 && (
          <form onSubmit={handleParentStep2} className="form-stack">
            <div className="step-indicator">
              <span className="step-badge">Étape 2 sur 2</span>
              <span>Code à usage unique remis par l'établissement</span>
            </div>

            <div className="form-group">
              <label htmlFor="parent-otp">Code à usage unique</label>
              <input
                id="parent-otp"
                type="text"
                className="otp-input"
                placeholder="XXXX-XXXX"
                value={otpCode}
                onChange={(e) => setOtpCode(e.target.value)}
                autoComplete="one-time-code"
                required
              />
              <small className="field-hint">
                Saisissez le code confidentiel remis ou envoyé par le secrétariat de
                l'établissement. Ce code ne peut être utilisé qu'une seule fois.
              </small>
            </div>

            <div className="form-actions-split">
              <button
                type="button"
                className="btn btn-secondary"
                onClick={handleResetParentStep}
                disabled={loading}
              >
                Revenir à l'étape 1
              </button>
              <button type="submit" className="btn btn-primary" disabled={loading}>
                {loading ? "Validation..." : "Accéder aux résultats"}
              </button>
            </div>
          </form>
        )}

        {activeTab === "STAFF" && (
          <form onSubmit={handleStaffLogin} className="form-stack">
            <div className="form-group">
              <label htmlFor="staff-email">Adresse e-mail professionnelle</label>
              <input
                id="staff-email"
                type="email"
                placeholder="prenom.nom@etablissement.fr"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="username"
                required
              />
            </div>

            <div className="form-group">
              <label htmlFor="staff-password">Mot de passe</label>
              <input
                id="staff-password"
                type="password"
                placeholder="Votre mot de passe"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="current-password"
                required
              />
            </div>

            <button type="submit" className="btn btn-primary btn-block" disabled={loading}>
              {loading ? "Connexion en cours..." : "Se connecter"}
            </button>
          </form>
        )}
      </section>
    </main>
  );
}
