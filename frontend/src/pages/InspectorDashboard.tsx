// frontend/src/pages/InspectorDashboard.tsx
import React, { useEffect, useState } from "react";
import { useAuth } from "@clerk/clerk-react";
import { http } from "../api";
import { useNavigate } from "react-router-dom";

type InspectionRequest = {
  id: number;
  status: string;
  matchType: string;
  startAt: string;
  endAt: string;
  car?: {
    id: number;
    make: string;
    model: string;
    year: number;
    city?: string | null;
    coverUrl?: string | null;
  };
  seller?: {
    id: string;
    name?: string | null;
    email?: string | null;
  };
};

function formatRange(startAt: string, endAt: string) {
  return `${new Date(startAt).toLocaleString()} → ${new Date(endAt).toLocaleString()}`;
}

export default function InspectorDashboard() {
  const { getToken } = useAuth();
  const navigate = useNavigate();

  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [requests, setRequests] = useState<InspectionRequest[]>([]);

  async function authHeaders() {
    const token = await getToken();
    if (!token) throw new Error("Token mancante");
    return { Authorization: `Bearer ${token}` };
  }

  // ✅ ricarica elenco perizie
  async function loadRequests() {
    const headers = await authHeaders();
    const { data } = await http.get("/inspector/inspections/received", { headers });
    setRequests(data?.requests ?? []);
  }

  useEffect(() => {
    (async () => {
      try {
        setLoading(true);
        setError(null);
        await loadRequests();
      } catch (e: any) {
        setError(e?.response?.data?.error ?? e?.message ?? "Errore caricamento perizie");
      } finally {
        setLoading(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ✅ conferma perizia
  async function confirmInspection(inspectionId: number) {
    try {
      setBusyId(inspectionId);

      const headers = await authHeaders();
      const { data } = await http.post(
        `/inspector/inspections/${inspectionId}/confirm`,
        {},
        { headers }
      );

      // aggiorno subito UI
      setRequests((prev) =>
        prev.map((r) => (r.id === inspectionId ? { ...r, status: "CONFIRMED" } : r))
      );

      // vai alla chat creata
      if (data?.chatId) {
        navigate(`/chat/${data.chatId}`);
      } else {
        await loadRequests();
      }
    } catch (e: any) {
      alert(e?.response?.data?.error ?? e?.message ?? "Errore conferma perizia");
    } finally {
      setBusyId(null);
    }
  }

  // ✅ annulla perizia (punto 2)
  async function cancelInspection(inspectionId: number) {
    const ok = confirm(
      "Vuoi annullare questo appuntamento?\n\nVerrà inviato un messaggio automatico al venditore e lo slot tornerà disponibile."
    );
    if (!ok) return;

    try {
      setBusyId(inspectionId);

      const headers = await authHeaders();
      await http.post(`/inspector/inspections/${inspectionId}/cancel`, {}, { headers });

      // refresh: aggiorna elenco (e la chat sparirà dal periziatore per filtro backend)
      await loadRequests();

      alert("Appuntamento annullato ✅");
    } catch (e: any) {
      alert(e?.response?.data?.error ?? e?.message ?? "Errore annullo appuntamento");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div style={{ paddingTop: 18 }}>
      <h1>Dashboard Periziatore</h1>
      <p>Da qui vedrai: Perizie ricevute • Mia officina • Chat • Resoconto</p>

      <h2 style={{ marginTop: 24 }}>Perizie ricevute</h2>

      {loading && <p>Caricamento...</p>}
      {error && <p style={{ color: "salmon" }}>{error}</p>}

      {!loading && !error && requests.length === 0 && (
        <p>Nessuna richiesta assegnata al momento.</p>
      )}

      <div style={{ display: "grid", gap: 12, marginTop: 12 }}>
        {requests.map((r) => {
          const canConfirm = r.status === "ASSIGNED" || r.status === "PENDING" || r.status === "SEEN";
          const canCancel = r.status === "ASSIGNED" || r.status === "CONFIRMED";
          const isBusy = busyId === r.id;

          return (
            <div
              key={r.id}
              style={{
                border: "1px solid rgba(255,255,255,0.12)",
                borderRadius: 12,
                padding: 12,
                background: "rgba(255,255,255,0.03)",
              }}
            >
              <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
                {r.car?.coverUrl ? (
                  <img
                    src={r.car.coverUrl}
                    alt=""
                    style={{
                      width: 90,
                      height: 60,
                      objectFit: "cover",
                      borderRadius: 10,
                    }}
                  />
                ) : null}

                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 700 }}>
                    {r.car ? `${r.car.make} ${r.car.model} (${r.car.year})` : "Auto"}
                  </div>

                  <div style={{ opacity: 0.85 }}>{formatRange(r.startAt, r.endAt)}</div>

                  <div style={{ opacity: 0.8, marginTop: 4 }}>
                    Status: <b>{r.status}</b> • Match: <b>{r.matchType}</b>
                  </div>

                  {r.seller?.email && (
                    <div style={{ opacity: 0.75, marginTop: 4 }}>
                      Cliente: {r.seller.name ?? "—"} ({r.seller.email})
                    </div>
                  )}

                  {/* AZIONI */}
                  <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 10 }}>
                    {/* ✅ Conferma */}
                    {canConfirm && (
                      <button
                        className="btn"
                        onClick={() => confirmInspection(r.id)}
                        disabled={isBusy}
                      >
                        {isBusy ? "Operazione..." : "Conferma perizia"}
                      </button>
                    )}

                    {/* ✅ Annulla (punto 2) */}
                    {canCancel && (
                      <button
                        className="btn secondary"
                        onClick={() => cancelInspection(r.id)}
                        disabled={isBusy}
                        title="Annulla l'appuntamento e libera lo slot"
                      >
                        {isBusy ? "Operazione..." : "Annulla appuntamento"}
                      </button>
                    )}
                  </div>

                  {/* FEEDBACK */}
                  {r.status === "CONFIRMED" && (
                    <div style={{ marginTop: 10, opacity: 0.85 }}>
                      ✅ Perizia confermata (chat creata)
                    </div>
                  )}

                  {r.status === "CANCELLED" && (
                    <div style={{ marginTop: 10, opacity: 0.85 }}>
                      ❌ Perizia annullata
                    </div>
                  )}

                  {r.status === "DONE" && (
                    <div style={{ marginTop: 10, opacity: 0.85 }}>
                      🏁 Perizia completata
                    </div>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}