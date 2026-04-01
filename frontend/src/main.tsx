// frontend/src/main.tsx
import React, { useEffect, useState, useCallback } from "react";
import { createRoot } from "react-dom/client";
import {
  BrowserRouter,
  Routes,
  Route,
  Navigate,
  Link,
  useNavigate,
  useLocation,
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
import { getUnreadChatCount } from "./api";

// ===============================
// Menu dropdown "Sei altro?"
// ===============================
function SeiAltroMenu({
  mobile = false,
  onNavigate,
}: {
  mobile?: boolean;
  onNavigate?: () => void;
}) {
  const nav = useNavigate();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      const target = e.target as HTMLElement;
      if (!target.closest?.("[data-sei-altro]")) setOpen(false);
    }
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, []);

  return (
    <div
      data-sei-altro
      className={`sei-altro ${mobile ? "mobile" : ""}`}
      style={{ position: "relative" }}
    >
      <button
        className={`btn-link ${mobile ? "nav-mobile-link" : ""}`}
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
      >
        <span>Sei altro?</span>
        <span aria-hidden style={{ opacity: 0.8 }}>
          ▾
        </span>
      </button>

      {open && (
        <div className={`sei-altro-dropdown ${mobile ? "mobile" : ""}`}>
          <button
            className={`btn-link ${mobile ? "nav-mobile-link" : ""}`}
            type="button"
            style={{
              width: "100%",
              textAlign: "left",
              padding: mobile ? "12px 14px" : "10px 10px",
            }}
            onClick={() => {
              setOpen(false);
              onNavigate?.();
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
  const { isSignedIn, getToken } = useClerkAuth();
  const { openSignIn } = useClerk();
  const nav = useNavigate();
  const location = useLocation();

  const { pendingCount } = useOffers();
  const { theme, toggleTheme } = useTheme();

  const { role, isLoaded: roleLoaded } = useRole();
  const isInspector = role === "PERIZIATORE";

  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [unreadChatCount, setUnreadChatCount] = useState(0);

  const loadUnreadChatCount = useCallback(async () => {
    if (!isSignedIn) {
      setUnreadChatCount(0);
      return;
    }

    try {
      const token = await getToken();
      if (!token) {
        setUnreadChatCount(0);
        return;
      }

      const count = await getUnreadChatCount(token);
      setUnreadChatCount(Number.isFinite(count) ? count : 0);
    } catch (e) {
      console.error("Errore caricamento badge chat:", e);
      setUnreadChatCount(0);
    }
  }, [getToken, isSignedIn]);

  useEffect(() => {
    setMobileMenuOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    function onResize() {
      if (window.innerWidth > 900) {
        setMobileMenuOpen(false);
      }
    }
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  useEffect(() => {
    document.body.style.overflow = mobileMenuOpen ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [mobileMenuOpen]);

  useEffect(() => {
    if (!isSignedIn) {
      setUnreadChatCount(0);
      return;
    }

    loadUnreadChatCount();

    const interval = window.setInterval(() => {
      loadUnreadChatCount();
    }, 5000);

    return () => window.clearInterval(interval);
  }, [isSignedIn, loadUnreadChatCount]);

  useEffect(() => {
    function onUnreadRefresh() {
      loadUnreadChatCount();
    }

    window.addEventListener("ascari:refresh-chat-unread", onUnreadRefresh);
    return () => {
      window.removeEventListener("ascari:refresh-chat-unread", onUnreadRefresh);
    };
  }, [loadUnreadChatCount]);

  if (isSignedIn && !roleLoaded) return <div className="container">Loading…</div>;

  const goToMyGarage = () => {
    if (!isSignedIn) {
      openSignIn();
      return;
    }
    nav("/my-garage");
  };

  const closeMobileMenu = () => setMobileMenuOpen(false);

  const renderStandardNav = (mobile = false) => (
    <>
      <button
        className={mobile ? "nav-mobile-link" : "btn-link"}
        onClick={() => {
          if (mobile) closeMobileMenu();
          nav("/explore");
        }}
        title="Esplora sulla mappa"
      >
        <span aria-hidden>🔍</span>
        <span>Esplora</span>
      </button>

      <Link
        to="/cars"
        className={mobile ? "nav-mobile-link" : ""}
        onClick={mobile ? closeMobileMenu : undefined}
      >
        Auto
      </Link>

      {isSignedIn && (
        <Link
          to="/offers"
          className={mobile ? "nav-mobile-link nav-mobile-link-badge" : "nav-link-badge"}
          onClick={mobile ? closeMobileMenu : undefined}
        >
          <span>Offerte</span>
          {pendingCount > 0 && <span className="nav-pill">{pendingCount}</span>}
        </Link>
      )}

      {isSignedIn && (
        <Link
          to="/chat"
          className={mobile ? "nav-mobile-link nav-mobile-link-badge" : "nav-link-badge"}
          onClick={mobile ? closeMobileMenu : undefined}
        >
          <span>Chat</span>
          {unreadChatCount > 0 && <span className="nav-pill">{unreadChatCount}</span>}
        </Link>
      )}

      <button
        className={mobile ? "nav-mobile-link" : "btn-link"}
        onClick={() => {
          if (mobile) closeMobileMenu();
          goToMyGarage();
        }}
      >
        Il mio garage
      </button>

      {isSignedIn && (
        <SeiAltroMenu mobile={mobile} onNavigate={mobile ? closeMobileMenu : undefined} />
      )}
    </>
  );

  const renderInspectorNav = (mobile = false) => (
    <>
      <button
        className={mobile ? "nav-mobile-link" : "btn-link"}
        onClick={() => {
          if (mobile) closeMobileMenu();
          nav("/inspector");
        }}
      >
        Perizie ricevute
      </button>

      <button
        className={mobile ? "nav-mobile-link" : "btn-link"}
        onClick={() => {
          if (mobile) closeMobileMenu();
          nav("/inspector/workshop");
        }}
      >
        Mia officina
      </button>

      <Link
        to="/inspector/chat"
        className={mobile ? "nav-mobile-link nav-mobile-link-badge" : "nav-link-badge"}
        onClick={mobile ? closeMobileMenu : undefined}
      >
        <span>Chat</span>
        {unreadChatCount > 0 && <span className="nav-pill">{unreadChatCount}</span>}
      </Link>

      <button
        className={mobile ? "nav-mobile-link" : "btn-link"}
        onClick={() => {
          if (mobile) closeMobileMenu();
          nav("/inspector/report");
        }}
      >
        Resoconto
      </button>
    </>
  );

  return (
    <>
      <nav className="nav">
        <div className="nav-inner container">
          <div className="nav-left">
            <Link to={isInspector ? "/inspector" : "/cars"} className="brand brand-link">
              <img
                src={
                  theme === "dark" ? "/logos/logocut.png" : "/logos/logocut-dark.png"
                }
                alt="Ascari Logo"
                onClick={(e) => {
                  e.preventDefault();
                  toggleTheme();
                }}
                style={{
                  width: 32,
                  height: 32,
                  borderRadius: 6,
                  objectFit: "cover",
                  cursor: "pointer",
                }}
              />
              <span>ASCARI</span>
            </Link>
          </div>

          <div className="nav-desktop">
            <div className="nav-links">
              {!isInspector ? renderStandardNav(false) : renderInspectorNav(false)}
            </div>

            <div className="nav-auth">
              <AuthButtons />
            </div>
          </div>

          <div className="nav-mobile-actions">
            <div className="nav-mobile-auth">
              <AuthButtons />
            </div>

            <button
              type="button"
              className="hamburger-btn"
              aria-label={mobileMenuOpen ? "Chiudi menu" : "Apri menu"}
              aria-expanded={mobileMenuOpen}
              onClick={() => setMobileMenuOpen((v) => !v)}
            >
              <span />
              <span />
              <span />
            </button>
          </div>
        </div>

        {mobileMenuOpen && (
          <>
            <div className="nav-mobile-overlay" onClick={closeMobileMenu} />
            <div className="nav-mobile-panel">
              <div className="nav-mobile-panel-inner">
                {!isInspector ? renderStandardNav(true) : renderInspectorNav(true)}

                <div className="nav-mobile-auth-block">
                  <AuthButtons />
                </div>
              </div>
            </div>
          </>
        )}
      </nav>

      <div className="container page-container">{children}</div>
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
        <Route
          path="/"
          element={
            <Layout>
              <HomeRedirect />
            </Layout>
          }
        />

        <Route
          path="/login"
          element={
            <Layout>
              <Login />
            </Layout>
          }
        />
        <Route
          path="/register"
          element={
            <Layout>
              <Register />
            </Layout>
          }
        />

        <Route
          path="/cars"
          element={
            <Layout>
              <Cars />
            </Layout>
          }
        />
        <Route
          path="/cars/:id"
          element={
            <Layout>
              <CarDetail />
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