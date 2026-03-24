// frontend/src/main.tsx
import React, { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  BrowserRouter,
  Routes,
  Route,
  Navigate,
  Link,
  useNavigate,
} from "react-router-dom";
import {
  ClerkProvider,
  useAuth as useClerkAuth,
  useClerk,
} from "@clerk/clerk-react";

import "./styles.css";

import Login from "./pages/Login";
import Register from "./pages/Register";
import MyGaragePage from "./pages/MyGarage";
import Cars from "./pages/Cars";
import CarDetail from "./pages/CarDetail";
import CarNew from "./pages/CarNew";
import CarEdit from "./pages/CarEdit";
import OffersReceived from "./pages/OffersReceived";
import ChatList from "./pages/ChatList";
import ChatPage from "./pages/Chat";
import ExploreMap from "./pages/ExploreMap";

import InspectorRegister from "./pages/InspectorRegister";
import InspectorDashboard from "./pages/InspectorDashboard";

import { AuthButtons } from "./components/AuthButtons";
import { OfferProvider, useOffers } from "./context/OfferContext";
import { ThemeProvider, useTheme } from "./context/ThemeContext";
import { useRole } from "./hooks/useRole";
import InspectorWorkshop from "./pages/InspectorWorkshop";
import InspectorReport from "./pages/InspectorReport";
import InspectorReportDetail from "./pages/InspectorReportDetail";


// ===============================
// Menu dropdown "Sei altro?"
// ===============================
function SeiAltroMenu() {
  const nav = useNavigate();
  const [open, setOpen] = useState(false);

  // chiude menu se clicchi fuori
  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      const target = e.target as HTMLElement;
      if (!target.closest?.("[data-sei-altro]")) setOpen(false);
    }
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, []);

  return (
    <div data-sei-altro style={{ position: "relative" }}>
      <button
        className="btn-link"
        type="button"
        onClick={() => setOpen((v) => !v)}
        style={{ display: "flex", gap: 8, alignItems: "center" }}
        aria-expanded={open}
      >
        Sei altro?
        <span aria-hidden style={{ opacity: 0.8 }}>
          ▾
        </span>
      </button>

      {open && (
        <div
          style={{
            position: "absolute",
            top: "calc(100% + 10px)",
            right: 0,
            minWidth: 200,
            padding: 8,
            borderRadius: 12,
            boxShadow: "var(--shadow)",
            background: "var(--panel-strong)",
            border: "1px solid rgba(255,255,255,0.12)",
            zIndex: 50,
          }}
        >
          <button
            className="btn-link"
            type="button"
            style={{ width: "100%", textAlign: "left", padding: "10px 10px" }}
            onClick={() => {
              setOpen(false);
              nav("/inspector/register");
            }}
          >
            Periziatore
          </button>
        </div>
      )}
    </div>
  );
}

// ===============================
// Layout con navbar e contenuto
// ===============================
function Layout({ children }: { children: React.ReactNode }) {
  const { isSignedIn } = useClerkAuth();
  const { openSignIn } = useClerk();
  const nav = useNavigate();
  const { pendingCount } = useOffers();
  const { theme, toggleTheme } = useTheme();

  const { role, isLoaded: roleLoaded } = useRole();
  const isInspector = role === "PERIZIATORE";

  // evita flash di menu sbagliato
  if (isSignedIn && !roleLoaded) return <div className="container">Loading…</div>;

  return (
    <>
      <nav className="nav">
        <div className="nav-inner container">
          {/* LOGO (toggle light/dark) */}
          <div
            className="brand"
            style={{ display: "flex", alignItems: "center", gap: 8 }}
          >
            <img
              src={
                theme === "dark" ? "/logos/logocut.png" : "/logos/logocut-dark.png"
              }
              alt="Ascari Logo"
              onClick={toggleTheme}
              style={{
                width: 32,
                height: 32,
                borderRadius: 6,
                objectFit: "cover",
                cursor: "pointer",
              }}
            />
            <span>ASCARI</span>
          </div>

          {/* NAV ITEMS */}
          <div className="row" style={{ gap: 16, alignItems: "center" }}>
            {!isInspector ? (
              <>
                <button
                  className="btn-link"
                  onClick={() => nav("/explore")}
                  style={{ display: "flex", gap: 8, alignItems: "center" }}
                  title="Esplora sulla mappa"
                >
                  <span aria-hidden>🔍</span>
                  Esplora
                </button>

                <Link to="/cars">Auto</Link>

                {isSignedIn && (
                  <Link to="/offers" style={{ position: "relative" }}>
                    Offerte
                    {pendingCount > 0 && (
                      <span
                        style={{
                          background: "var(--primary)",
                          color: "#000",
                          padding: "2px 6px",
                          borderRadius: "10px",
                          fontSize: "12px",
                          position: "absolute",
                          top: -6,
                          right: -14,
                          fontWeight: 600,
                        }}
                      >
                        {pendingCount}
                      </span>
                    )}
                  </Link>
                )}

                {isSignedIn && <Link to="/chat">Chat</Link>}

                <button
                  className="btn-link"
                  onClick={() => {
                    if (!isSignedIn) {
                      openSignIn();
                      return;
                    }
                    nav("/my-garage");
                  }}
                >
                  Il mio garage
                </button>

                {/* ✅ SEI ALTRO? */}
                {isSignedIn && <SeiAltroMenu />}
              </>
            ) : (
              <>
                <button className="btn-link" onClick={() => nav("/inspector")}>
                  Perizie ricevute
                </button>
                <button
                  className="btn-link"
                  onClick={() => nav("/inspector/workshop")}
                >
                  Mia officina
                </button>
                <button className="btn-link" onClick={() => nav("/inspector/chat")}>
                  Chat
                </button>
                <button
                  className="btn-link"
                  onClick={() => nav("/inspector/report")}
                >
                  Resoconto
                </button>
              </>
            )}

            <AuthButtons />
          </div>
        </div>
      </nav>

      <div className="container">{children}</div>
    </>
  );
}

// ===============================
// Middleware pagine protette
// ===============================
function RequireAuth({ children }: { children: React.ReactNode }) {
  const { isSignedIn, isLoaded } = useClerkAuth();
  const { openSignIn } = useClerk();

  if (!isLoaded) return <div className="container">Loading…</div>;

  if (!isSignedIn) {
    openSignIn();
    return null;
  }

  return <>{children}</>;
}

// ===============================
// Redirect base (role-aware)
// ===============================
function HomeRedirect() {
  const { isSignedIn, isLoaded } = useClerkAuth();
  const { role, isLoaded: roleLoaded } = useRole();

  if (!isLoaded || (isSignedIn && !roleLoaded)) {
    return <div className="container">Loading…</div>;
  }

  if (!isSignedIn) return <Navigate to="/cars" replace />;

  if (role === "PERIZIATORE") return <Navigate to="/inspector" replace />;
  return <Navigate to="/cars" replace />;
}

// ===============================
// Routing
// ===============================
function AppRoutes() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Layout><HomeRedirect /></Layout>} />

        <Route path="/login" element={<Layout><Login /></Layout>} />
        <Route path="/register" element={<Layout><Register /></Layout>} />

        <Route path="/cars" element={<Layout><Cars /></Layout>} />
        <Route path="/cars/:id" element={<Layout><CarDetail /></Layout>} />

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

        <Route
          path="/offers"
          element={
            <Layout>
              <RequireAuth>
                <OffersReceived />
              </RequireAuth>
            </Layout>
          }
        />

        <Route
          path="/chat"
          element={
            <Layout>
              <RequireAuth>
                <ChatList />
              </RequireAuth>
            </Layout>
          }
        />

        <Route
          path="/chat/:id"
          element={
            <Layout>
              <RequireAuth>
                <ChatPage />
              </RequireAuth>
            </Layout>
          }
        />

        <Route
          path="/explore"
          element={
            <Layout>
              <ExploreMap />
            </Layout>
          }
        />

        {/* ✅ PERIZIATORE */}
        <Route
          path="/inspector/register"
          element={
            <Layout>
              <RequireAuth>
                <InspectorRegister />
              </RequireAuth>
            </Layout>
          }
        />

        <Route
          path="/inspector"
          element={
            <Layout>
              <RequireAuth>
                <InspectorDashboard />
              </RequireAuth>
            </Layout>
          }
        />
        <Route
        path="/inspector/workshop"
        element={
          <Layout>
            <RequireAuth>
              <InspectorWorkshop />
            </RequireAuth>
          </Layout>
        }
      />
              {/* ✅ CHAT PERIZIATORE (usa le stesse pagine del venditore) */}
        <Route
          path="/inspector/chat"
          element={
            <Layout>
              <RequireAuth>
                <ChatList />
              </RequireAuth>
            </Layout>
          }
        />

        <Route
          path="/inspector/chat/:id"
          element={
            <Layout>
              <RequireAuth>
                <ChatPage />
              </RequireAuth>
            </Layout>
          }
        />
        <Route
          path="/inspector/report"
          element={
            <Layout>
              <RequireAuth>
                <InspectorReport />
              </RequireAuth>
            </Layout>
          }
        />
        <Route
          path="/inspector/report/:id"
          element={
            <Layout>
              <RequireAuth>
                <InspectorReportDetail />
              </RequireAuth>
            </Layout>
          }
        />
      </Routes>
    </BrowserRouter>
  );
}

// ===============================
// Bootstrap React + Clerk
// ===============================
const PUBLISHABLE_KEY = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY;

if (!PUBLISHABLE_KEY) {
  throw new Error("VITE_CLERK_PUBLISHABLE_KEY non definita");
}

createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <ClerkProvider publishableKey={PUBLISHABLE_KEY} afterSignOutUrl="/cars">
      <ThemeProvider>
        <OfferProvider>
          <AppRoutes />
        </OfferProvider>
      </ThemeProvider>
    </ClerkProvider>
  </React.StrictMode>
);
