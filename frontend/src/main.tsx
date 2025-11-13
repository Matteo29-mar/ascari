// frontend/src/main.tsx
import React from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Routes, Route, Navigate, Link } from 'react-router-dom';
import { ClerkProvider, useAuth as useClerkAuth } from '@clerk/clerk-react';

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
            ASCARI <span className="badge">DEV</span>
          </div>
          <div className="row" style={{ gap: 16 }}>
            <Link to="/cars">Auto</Link>
            <Link to="/my-garage">Il mio garage</Link> {/* 👈 link al garage */}
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

  if (!isLoaded) return <div>Loading …</div>;
  if (!isSignedIn) return <Navigate to="/login" replace />;
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

        {/* Pubbliche */}
        <Route path="/login" element={<Layout><Login /></Layout>} />
        <Route path="/register" element={<Layout><Register /></Layout>} />
        <Route path="/cars" element={<Layout><Cars /></Layout>} />

        {/* Protette */}
        <Route
          path="/cars/:id"
          element={
            <Layout>
              <RequireAuth>
                <CarDetail />
              </RequireAuth>
            </Layout>
          }
        />
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

        {/* 👇 nuova rotta protetta: Il mio garage */}
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
