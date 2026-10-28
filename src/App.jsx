import React, { Suspense, lazy, useCallback, useEffect, useState } from "react";
import { apiRequest, clearClientSession, setCsrfToken } from "./api/client.js";
import Header from "./components/Header.jsx";
import LoginPage from "./pages/LoginPage.jsx";

const ParentDashboard = lazy(() => import("./pages/ParentDashboard.jsx"));
const TeacherDashboard = lazy(() => import("./pages/TeacherDashboard.jsx"));
const AdminDashboard = lazy(() => import("./pages/AdminDashboard.jsx"));

export default function App() {
  const [initializing, setInitializing] = useState(true);
  const [schoolName, setSchoolName] = useState("Portail scolaire");
  const [user, setUser] = useState(null);
  const [pendingParentStep2, setPendingParentStep2] = useState(false);

  const checkSession = useCallback(async () => {
    setInitializing(true);
    try {
      const data = await apiRequest("/api/auth/session");
      if (data.csrfToken) {
        setCsrfToken(data.csrfToken);
      }
      if (data.schoolName) {
        setSchoolName(data.schoolName);
      }
      setUser(data.user || null);
      setPendingParentStep2(Boolean(data.pendingParentStep2));
    } catch {
      setUser(null);
    } finally {
      setInitializing(false);
    }
  }, []);

  useEffect(() => {
    checkSession();
  }, [checkSession]);

  async function handleLogout() {
    try {
      await apiRequest("/api/auth/logout", { method: "POST" });
    } catch {
      // Ignoré
    }
    clearClientSession();
    setUser(null);
    setPendingParentStep2(false);
    await checkSession();
  }

  return (
    <div className="app-shell">
      <Header schoolName={schoolName} user={user} onLogout={handleLogout} />

      {initializing ? (
        <main className="page-container">
          <div className="loading-box">Initialisation sécurisée du Portail scolaire...</div>
        </main>
      ) : !user ? (
        <LoginPage
          schoolName={schoolName}
          initialParentStep2={pendingParentStep2}
          onLoginSuccess={(loggedUser) => {
            setUser(loggedUser);
            setPendingParentStep2(false);
          }}
        />
      ) : (
        <Suspense
          fallback={
            <main className="page-container">
              <div className="loading-box">Chargement de votre espace...</div>
            </main>
          }
        >
          {user.role === "PARENT" ? (
            <ParentDashboard />
          ) : user.role === "TEACHER" ? (
            <TeacherDashboard />
          ) : user.role === "ADMIN" ? (
            <AdminDashboard onSchoolNameChange={(name) => setSchoolName(name)} />
          ) : (
            <main className="page-container">
              <div className="empty-card">Rôle de compte non reconnu.</div>
            </main>
          )}
        </Suspense>
      )}

      <footer className="app-footer no-print">
        <p>
          Portail scolaire — Accès strictement réservé aux parents d'élèves autorisés, aux
          enseignants et à l'administration de l'établissement.
        </p>
      </footer>
    </div>
  );
}
