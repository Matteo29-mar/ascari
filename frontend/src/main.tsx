import React, { useState } from "react";
import { createRoot } from "react-dom/client";
import {
  BrowserRouter,
  Routes,
  Route,
  Navigate,
  Link,
  useNavigate
} from "react-router-dom";
import {
  ClerkProvider,
  useAuth as useClerkAuth,
  useClerk
} from "@clerk/clerk-react";

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

import "./styles.css";

import { AuthButtons } from "./components/AuthButtons";
import { OfferProvider, useOffers } from "./context/OfferContext";
import { ThemeProvider, useTheme } from "./context/ThemeContext";
import { SignedIn, SignedOut, RedirectToSignIn } from "@clerk/clerk-react";
import ExploreMap from "./pages/ExploreMap";


// ===============================
// Layout con navbar e contenuto
// ===============================
function Layout({ children }: { children: React.ReactNode }) {
  const { isSignedIn } = useClerkAuth();
  const { openSignIn } = useClerk();
  const nav = useNavigate();
  const { pendingCount } = useOffers();

  const { theme, toggleTheme } = useTheme(); // 👈 THEME

  return (
    <>
      <nav className="nav">
        <div className="nav-inner container">

          {/* LOGO (toggle nascosto light/dark) */}
          <div
            className="brand"
            style={{ display: "flex", alignItems: "center", gap: 8 }}
          >
            <img
              src={
                theme === "dark"
                  ? "/logos/logocut.png"
                  : "/logos/logocut-dark.png"
              }
              alt="Ascari Logo"
              onClick={toggleTheme}
              style={{
                width: 32,
                height: 32,
                borderRadius: 6,
                objectFit: "cover",
                cursor: "pointer"
              }}
            />
            <span>ASCARI</span>
          </div>

          {/* NAV ITEMS */}
          <div className="row" style={{ gap: 16, alignItems: "center" }}>

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
                      fontWeight: 600
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

  if (!isLoaded) return <div>Loading…</div>;

  if (!isSignedIn) {
    openSignIn();
    return null;
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
