// frontend/src/main.tsx
import React from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Routes, Route, Navigate, Link, useNavigate } from 'react-router-dom';
import { ClerkProvider, useAuth as useClerkAuth, useClerk } from '@clerk/clerk-react';

import Login from './pages/Login';
import Register from './pages/Register';
import MyGaragePage from './pages/MyGarage';
import Cars from './pages/Cars';
import CarDetail from './pages/CarDetail';
import CarNew from './pages/CarNew';
import CarEdit from './pages/CarEdit';
import './styles.css';
import { AuthButtons } from './components/AuthButtons';

// ===============================
// Layout con navbar e contenuto
// ===============================
function Layout({ children }: { children: React.ReactNode }) {
  const { isSignedIn, isLoaded } = useClerkAuth();
  const { openSignIn } = useClerk();
  const nav = useNavigate();

  return (
    <>
      <nav className="nav">
        <div className="nav-inner container">
          <div className="brand">
            <span
              style={{
                width: 12,
                height: 12,
                borderRadius: 999,
                background: 'linear-gradient(135deg,var(--brand),var(--accent))',
                display: 'inline-block',
              }}
            />
            <span className="badge">ASCARI</span>
          </div>

          <div className="row" style={{ gap: 16 }}>
            <Link to="/cars">Auto</Link>

            {/* 🔥 Il mio garage → popup Clerk se non loggato */}
            <button
              className="btn-link"
              onClick={() => {
                if (!isSignedIn) {
                  openSignIn();  // 👈 apre il popup
                  return;
                }
                nav("/my-garage"); // 👈 se loggato, vai alla pagina
              }}
            >
              Il mio garage
            </button>

            <AuthButtons />
          </div>
        </div>
      </nav>

      <div className="container">{children}</div>
    </>
  );
}

// ===============================
// Middleware per pagine protette
// ===============================
function RequireAuth({ children }: { children: React.ReactNode }) {
  const { isSignedIn, isLoaded } = useClerkAuth();
  const { openSignIn } = useClerk();

  if (!isLoaded) return <div>Loading …</div>;

  // ❌ niente redirect a /login
  // ✅ ora mostra solo il popup Clerk
  if (!isSignedIn) {
    openSignIn(); // 👈 popup Clerk
    return null;  // evita redirect
  }

  return <>{children}</>;
}

// ===============================
// Routing
// ===============================
function AppRoutes() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Navigate to="/cars" replace />} />

        {/* Pagine login/register (non servono più, ma le lasciamo finché non le elimini) */}
        <Route path="/login" element={<Layout><Login /></Layout>} />
        <Route path="/register" element={<Layout><Register /></Layout>} />

        {/* Pubbliche */}
        <Route path="/cars" element={<Layout><Cars /></Layout>} />
        <Route path="/cars/:id" element={<Layout><CarDetail /></Layout>} />

        {/* Create new car → protetta */}
        <Route
          path="/cars/new"
          element={
            <Layout>
              <RequireAuth>
                <CarNew />
              </RequireAuth>
            </Layout>
          }
        />

        {/* Edit → protetta */}
        <Route
          path="/cars/edit/:id"
          element={
            <Layout>
              <RequireAuth>
                <CarEdit />
              </RequireAuth>
            </Layout>
          }
        />

        {/* My garage → protetta */}
        <Route
          path="/my-garage"
          element={
            <Layout>
              <RequireAuth>
                <MyGaragePage />
              </RequireAuth>
            </Layout>
          }
        />
      </Routes>
    </BrowserRouter>
  );
}

// ===============================
// Inizializzazione Clerk + React
// ===============================
const PUBLISHABLE_KEY = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY;

if (!PUBLISHABLE_KEY) {
  throw new Error('VITE_CLERK_PUBLISHABLE_KEY non definita');
}

createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ClerkProvider publishableKey={PUBLISHABLE_KEY} afterSignOutUrl="/cars">
      <AppRoutes />
    </ClerkProvider>
  </React.StrictMode>
);
