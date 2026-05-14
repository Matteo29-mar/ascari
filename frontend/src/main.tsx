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
import InspectorWorkshop from "./pages/InspectorWorkshop";
import InspectorReport from "./pages/InspectorReport";
import InspectorReportDetail from "./pages/InspectorReportDetail";
import PaymentReturn from "./pages/PaymentReturn";
import History from "./pages/History";
import HistoryDetail from "./pages/HistoryDetail";

import { AuthButtons } from "./components/AuthButtons";
import AscariPopup from "./components/AscariPopup";
import { OfferProvider, useOffers } from "./context/OfferContext";
import { ThemeProvider, useTheme } from "./context/ThemeContext";
import { useRole } from "./hooks/useRole";
import {
  getUnreadChatCount,
  getStripeAccountStatus,
  createStripeOnboardingLink,
} from "./api";

type StripeAccountStatus = {
  accountId?: string | null;
  status: "NOT_STARTED" | "PENDING" | "ENABLED";
  chargesEnabled: boolean;
  payoutsEnabled: boolean;
  detailsSubmitted: boolean;
  onboardingCompleted: boolean;
};

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

function PaymentsPage() {
  const { isSignedIn, getToken } = useClerkAuth();
  const { openSignIn } = useClerk();

  const [status, setStatus] = useState<StripeAccountStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [popup, setPopup] = useState<{
    open: boolean;
    title?: string;
    message?: string;
    variant?: "success" | "error" | "warning" | "info";
  }>({
    open: false,
    title: "",
    message: "",
    variant: "info",
  });

  async function loadStatus() {
    if (!isSignedIn) {
      setStatus(null);
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      const token = await getToken();
      if (!token) {
        setStatus(null);
        return;
      }

      const data = await getStripeAccountStatus(token);
      setStatus(data);
    } catch (e: any) {
      setPopup({
        open: true,
        title: "Errore pagamenti",
        message:
          e?.response?.data?.error ||
          e?.message ||
          "Impossibile caricare lo stato dei pagamenti.",
        variant: "error",
      });
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadStatus();
  }, [isSignedIn]);

  async function handleEnablePayments() {
    if (!isSignedIn) {
      openSignIn();
      return;
    }

    try {
      setBusy(true);
      const token = await getToken();
      if (!token) {
        openSignIn();
        return;
      }

      const data = await createStripeOnboardingLink(token);
      if (!data?.url) {
        throw new Error("Link onboarding Stripe non disponibile");
      }

      window.location.href = data.url;
    } catch (e: any) {
      setPopup({
        open: true,
        title: "Errore Stripe",
        message:
          e?.response?.data?.error ||
          e?.message ||
          "Impossibile avviare l’onboarding Stripe.",
        variant: "error",
      });
    } finally {
      setBusy(false);
    }
  }

  const badge = (() => {
    if (!status) return { text: "Non disponibile", color: "#94a3b8" };
    if (status.status === "ENABLED") return { text: "Abilitato", color: "#34d399" };
    if (status.status === "PENDING") return { text: "In verifica", color: "#fbbf24" };
    return { text: "Non configurato", color: "#94a3b8" };
  })();

  return (
    <div style={{ maxWidth: 980, margin: "0 auto" }}>
      <h1 className="h1">Pagamenti</h1>
      <p className="muted" style={{ lineHeight: 1.7 }}>
        Collega Stripe per ricevere i pagamenti delle vendite su Ascari.
        Una volta abilitato l’account, potrai configurare il prezzo vendita
        sulle tue auto e vedere in tempo reale il netto venditore e la commissione Ascari.
      </p>

      <div className="card" style={{ marginTop: 18 }}>
        <div className="card-body">
          {loading ? (
            <p>Caricamento stato pagamenti...</p>
          ) : (
            <>
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  gap: 16,
                  alignItems: "center",
                  flexWrap: "wrap",
                }}
              >
                <div>
                  <h3 style={{ marginTop: 0, marginBottom: 8 }}>Stato account Stripe</h3>
                  <div
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: 8,
                      padding: "8px 12px",
                      borderRadius: 999,
                      border: `1px solid ${badge.color}55`,
                      background: `${badge.color}22`,
                      color: badge.color,
                      fontWeight: 800,
                    }}
                  >
                    <span
                      style={{
                        width: 8,
                        height: 8,
                        borderRadius: "50%",
                        background: badge.color,
                      }}
                    />
                    {badge.text}
                  </div>
                </div>

                <button
                  className="btn"
                  type="button"
                  onClick={handleEnablePayments}
                  disabled={busy}
                  style={{ minWidth: 220 }}
                >
                  {busy
                    ? "Attendere..."
                    : status?.status === "ENABLED"
                    ? "Aggiorna dati pagamenti"
                    : "Abilita pagamenti"}
                </button>
              </div>

              <div
                style={{
                  marginTop: 18,
                  display: "grid",
                  gap: 12,
                  gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
                }}
              >
                <div
                  style={{
                    border: "1px solid rgba(255,255,255,0.12)",
                    background: "rgba(255,255,255,0.03)",
                    borderRadius: 16,
                    padding: 14,
                  }}
                >
                  <div className="muted" style={{ marginBottom: 6 }}>
                    Dati inviati a Stripe
                  </div>
                  <b>{status?.detailsSubmitted ? "Sì" : "No"}</b>
                </div>

                <div
                  style={{
                    border: "1px solid rgba(255,255,255,0.12)",
                    background: "rgba(255,255,255,0.03)",
                    borderRadius: 16,
                    padding: 14,
                  }}
                >
                  <div className="muted" style={{ marginBottom: 6 }}>
                    Charges abilitate
                  </div>
                  <b>{status?.chargesEnabled ? "Sì" : "No"}</b>
                </div>

                <div
                  style={{
                    border: "1px solid rgba(255,255,255,0.12)",
                    background: "rgba(255,255,255,0.03)",
                    borderRadius: 16,
                    padding: 14,
                  }}
                >
                  <div className="muted" style={{ marginBottom: 6 }}>
                    Payout abilitati
                  </div>
                  <b>{status?.payoutsEnabled ? "Sì" : "No"}</b>
                </div>
              </div>
            </>
          )}
        </div>
      </div>

      {popup.open && (
        <AscariPopup
          title={popup.title}
          message={popup.message}
          variant={popup.variant}
          onClose={() =>
            setPopup({ open: false, title: "", message: "", variant: "info" })
          }
        />
      )}
    </div>
  );
}

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

      {/* {isSignedIn && (
        <Link
          to="/history"
          className={mobile ? "nav-mobile-link" : ""}
          onClick={mobile ? closeMobileMenu : undefined}
        >
          Storico
        </Link>
      )} */}

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
                src={theme === "dark" ? "/logos/logocut.png" : "/logos/logocut-dark.png"}
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
          path="/payments"
          element={
            <Layout>
              <RequireAuth>
                <PaymentsPage />
              </RequireAuth>
            </Layout>
          }
        />

        <Route
          path="/history"
          element={
            <Layout>
              <RequireAuth>
                <History />
              </RequireAuth>
            </Layout>
          }
        />

        <Route
          path="/history/:id"
          element={
            <Layout>
              <RequireAuth>
                <HistoryDetail />
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
        <Route
          path="/payments/return"
          element={
            <Layout>
              <RequireAuth>
                <PaymentReturn />
              </RequireAuth>
            </Layout>
          }
        />
      </Routes>
    </BrowserRouter>
  );
}

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