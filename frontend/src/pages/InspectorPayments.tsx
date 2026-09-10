// frontend/src/pages/InspectorPayments.tsx
import React, { useEffect, useState } from "react";
import { useAuth } from "@clerk/clerk-react";
import { http } from "../api";
import AscariPopup from "../components/AscariPopup";

type StripeAccountStatus = {
  accountId?: string | null;
  status: "NOT_STARTED" | "PENDING" | "ENABLED";
  chargesEnabled: boolean;
  payoutsEnabled: boolean;
  detailsSubmitted: boolean;
  onboardingCompleted: boolean;
};

type InspectorCashout = {
  id: number;
  amountEur: number;
  currency: string;
  status: string;
  stripeTransferId?: string | null;
  paidAt?: string | null;
  createdAt: string;
  report?: {
    id: number;
    title?: string | null;
    overallStatus?: string | null;
    plate?: string | null;
    createdAt: string;
    car?: {
      id: number;
      make: string;
      model: string;
      year: number;
      coverUrl?: string | null;
    };
  };
};

export default function InspectorPayments() {
  const { getToken, isSignedIn } = useAuth();

  const [status, setStatus] = useState<StripeAccountStatus | null>(null);
  const [cashouts, setCashouts] = useState<InspectorCashout[]>([]);
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

  async function authHeaders() {
    const token = await getToken();
    if (!token) throw new Error("Token mancante");
    return { Authorization: `Bearer ${token}` };
  }

  async function loadAll() {
    if (!isSignedIn) return;

    const headers = await authHeaders();
    const [statusRes, cashoutsRes] = await Promise.all([
      http.get("/stripe/account/status", { headers }),
      http.get("/stripe/inspector-cashouts", { headers }),
    ]);

    setStatus(statusRes.data);
    setCashouts(cashoutsRes.data?.cashouts ?? []);
  }

  useEffect(() => {
    (async () => {
      try {
        setLoading(true);
        await loadAll();
      } catch (e: any) {
        setPopup({
          open: true,
          title: "Errore pagamenti",
          message:
            e?.response?.data?.error ||
            e?.message ||
            "Impossibile caricare l’area pagamenti periziatore.",
          variant: "error",
        });
      } finally {
        setLoading(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isSignedIn]);

  async function handleStripeOnboarding() {
    try {
      setBusy(true);
      const headers = await authHeaders();

      const { data } = await http.post(
        "/stripe/account/onboarding-link",
        {},
        { headers }
      );

      if (!data?.url) {
        throw new Error("Link Stripe non disponibile");
      }

      window.location.href = data.url;
    } catch (e: any) {
      setPopup({
        open: true,
        title: "Errore Stripe",
        message:
          e?.response?.data?.error ||
          e?.message ||
          "Impossibile aprire l’onboarding Stripe.",
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

  const totalPaid = cashouts
    .filter((c) => String(c.status).toUpperCase() === "PAID")
    .reduce((sum, c) => sum + (Number(c.amountEur) || 0), 0);

  return (
    <div style={{ maxWidth: 1040, margin: "0 auto" }}>
      {popup.open && (
        <AscariPopup
          title={popup.title}
          message={popup.message}
          variant={popup.variant}
          onClose={() => setPopup({ open: false, title: "", message: "", variant: "info" })}
        />
      )}

      <h1 className="h1">Pagamenti periziatore</h1>
      <p className="muted" style={{ lineHeight: 1.7 }}>
        Collega Stripe per ricevere i cashout delle perizie completate su Ascari.
        Ogni resoconto completato può generare un cashout da 120€.
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
                  onClick={handleStripeOnboarding}
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
                <div className="card" style={{ margin: 0 }}>
                  <div className="card-body">
                    <div className="muted" style={{ marginBottom: 6 }}>Dati inviati a Stripe</div>
                    <b>{status?.detailsSubmitted ? "Sì" : "No"}</b>
                  </div>
                </div>

                <div className="card" style={{ margin: 0 }}>
                  <div className="card-body">
                    <div className="muted" style={{ marginBottom: 6 }}>Charges abilitate</div>
                    <b>{status?.chargesEnabled ? "Sì" : "No"}</b>
                  </div>
                </div>

                <div className="card" style={{ margin: 0 }}>
                  <div className="card-body">
                    <div className="muted" style={{ marginBottom: 6 }}>Payout abilitati</div>
                    <b>{status?.payoutsEnabled ? "Sì" : "No"}</b>
                  </div>
                </div>
              </div>
            </>
          )}
        </div>
      </div>

      <div className="card" style={{ marginTop: 18 }}>
        <div className="card-body">
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              gap: 12,
              flexWrap: "wrap",
            }}
          >
            <div>
              <h3 style={{ marginTop: 0 }}>Archivio cashout</h3>
              <p className="muted" style={{ marginBottom: 0 }}>
                Totale ricevuto/richiesto: <b>{totalPaid} €</b>
              </p>
            </div>
          </div>

          {loading ? (
            <p style={{ marginTop: 14 }}>Caricamento transazioni...</p>
          ) : cashouts.length === 0 ? (
            <p style={{ marginTop: 14 }}>Nessuna transazione cashout presente.</p>
          ) : (
            <div style={{ display: "grid", gap: 12, marginTop: 14 }}>
              {cashouts.map((c) => (
                <div
                  key={c.id}
                  style={{
                    border: "1px solid rgba(255,255,255,0.12)",
                    background: "rgba(255,255,255,0.03)",
                    borderRadius: 16,
                    padding: 14,
                    display: "flex",
                    gap: 12,
                    alignItems: "center",
                  }}
                >
                  {c.report?.car?.coverUrl ? (
                    <img
                      src={c.report.car.coverUrl}
                      alt=""
                      style={{
                        width: 84,
                        height: 58,
                        borderRadius: 10,
                        objectFit: "cover",
                      }}
                    />
                  ) : null}

                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 800 }}>
                      {c.report?.car
                        ? `${c.report.car.make} ${c.report.car.model} (${c.report.car.year})`
                        : `Resoconto #${c.report?.id ?? "-"}`}
                    </div>

                    <div className="muted" style={{ marginTop: 4 }}>
                      {c.report?.title || "Cashout resoconto perizia"}
                    </div>

                    <div style={{ marginTop: 5, opacity: 0.78 }}>
                      Stato: <b>{c.status}</b> • Importo: <b>{c.amountEur} €</b>
                      {c.paidAt ? ` • Pagato il ${new Date(c.paidAt).toLocaleString("it-IT")}` : ""}
                    </div>

                    {c.stripeTransferId ? (
                      <div style={{ marginTop: 4, opacity: 0.65, fontSize: 13 }}>
                        Transfer Stripe: {c.stripeTransferId}
                      </div>
                    ) : null}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
