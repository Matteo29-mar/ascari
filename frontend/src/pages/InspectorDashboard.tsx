import React, { useEffect, useState } from "react";
import { useAuth } from "@clerk/clerk-react";
import { http } from "../api";
import { useNavigate } from "react-router-dom";
import AscariPopup from "../components/AscariPopup";

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

type PopupState = {
  open: boolean;
  title?: string;
  message: string;
  variant: "success" | "error" | "warning" | "info";
  confirmText?: string;
  cancelText?: string;
  loading?: boolean;
  onConfirm?: (() => void | Promise<void>) | null;
  onClose?: (() => void) | null;
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

  const [popup, setPopup] = useState<PopupState>({
    open: false,
    message: "",
    variant: "info",
    confirmText: "OK",
    cancelText: "Annulla",
    loading: false,
    onConfirm: null,
    onClose: null,
  });

  async function authHeaders() {
    const token = await getToken();
    if (!token) throw new Error("Token mancante");
    return { Authorization: `Bearer ${token}` };
  }

  function closePopup() {
    setPopup((prev) => ({
      ...prev,
      open: false,
      loading: false,
      onConfirm: null,
      onClose: null,
    }));
  }

  function openInfoPopup(message: string, title = "Informazione") {
    setPopup({
      open: true,
      title,
      message,
      variant: "info",
      confirmText: "OK",
      cancelText: "Annulla",
      loading: false,
      onConfirm: null,
      onClose: closePopup,
    });
  }

  function openSuccessPopup(message: string, title = "Operazione completata") {
    setPopup({
      open: true,
      title,
      message,
      variant: "success",
      confirmText: "OK",
      cancelText: "Annulla",
      loading: false,
      onConfirm: null,
      onClose: closePopup,
    });
  }

  function openErrorPopup(message: string, title = "Errore") {
    setPopup({
      open: true,
      title,
      message,
      variant: "error",
      confirmText: "Chiudi",
      cancelText: "Annulla",
      loading: false,
      onConfirm: null,
      onClose: closePopup,
    });
  }

  function openConfirmPopup(params: {
    title: string;
    message: string;
    variant?: "success" | "error" | "warning" | "info";
    confirmText?: string;
    cancelText?: string;
    onConfirm: () => void | Promise<void>;
  }) {
    setPopup({
      open: true,
      title: params.title,
      message: params.message,
      variant: params.variant ?? "warning",
      confirmText: params.confirmText ?? "Conferma",
      cancelText: params.cancelText ?? "Annulla",
      loading: false,
      onConfirm: params.onConfirm,
      onClose: closePopup,
    });
  }

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

  async function confirmInspection(inspectionId: number) {
    try {
      setBusyId(inspectionId);

      const headers = await authHeaders();
      const { data } = await http.post(
        `/inspector/inspections/${inspectionId}/confirm`,
        {},
        { headers }
      );

      setRequests((prev) =>
        prev.map((r) => (r.id === inspectionId ? { ...r, status: "CONFIRMED" } : r))
      );

      if (data?.chatId) {
        navigate(`/chat/${data.chatId}`);
      } else {
        await loadRequests();
        openSuccessPopup("Perizia confermata correttamente.");
      }
    } catch (e: any) {
      openErrorPopup(
        e?.response?.data?.error ?? e?.message ?? "Errore conferma perizia",
        "Conferma non riuscita"
      );
    } finally {
      setBusyId(null);
    }
  }

  async function runCancelInspection(inspectionId: number) {
    try {
      setPopup((prev) => ({ ...prev, loading: true }));
      setBusyId(inspectionId);

      const headers = await authHeaders();
      await http.post(`/inspector/inspections/${inspectionId}/cancel`, {}, { headers });

      await loadRequests();

      setPopup({
        open: true,
        title: "Appuntamento annullato",
        message:
          "L'appuntamento è stato annullato correttamente.\n\nIl venditore verrà avvisato e lo slot è tornato disponibile.",
        variant: "success",
        confirmText: "OK",
        cancelText: "Annulla",
        loading: false,
        onConfirm: null,
        onClose: closePopup,
      });
    } catch (e: any) {
      setPopup({
        open: true,
        title: "Errore annullo appuntamento",
        message: e?.response?.data?.error ?? e?.message ?? "Errore annullo appuntamento",
        variant: "error",
        confirmText: "Chiudi",
        cancelText: "Annulla",
        loading: false,
        onConfirm: null,
        onClose: closePopup,
      });
    } finally {
      setBusyId(null);
    }
  }

  function cancelInspection(inspectionId: number) {
    openConfirmPopup({
      title: "Annullare questo appuntamento?",
      message:
        "Verrà inviato un messaggio automatico al venditore e lo slot tornerà disponibile.\n\nQuesta azione non è reversibile in automatico.",
      variant: "warning",
      confirmText: "Sì, annulla",
      cancelText: "Torna indietro",
      onConfirm: () => runCancelInspection(inspectionId),
    });
  }

  return (
    <>
      <div style={{ paddingTop: 18 }}>
        <h1>Perizie ricevute</h1>
        {loading && <p>Caricamento...</p>}
        {error && <p style={{ color: "salmon" }}>{error}</p>}

        {!loading && !error && requests.length === 0 && (
          <p>Nessuna richiesta assegnata al momento.</p>
        )}

        <div style={{ display: "grid", gap: 12, marginTop: 12 }}>
          {requests.map((r) => {
            const canConfirm =
              r.status === "ASSIGNED" || r.status === "PENDING" || r.status === "SEEN";
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

                    <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 10 }}>
                      {canConfirm && (
                        <button
                          className="btn"
                          onClick={() => confirmInspection(r.id)}
                          disabled={isBusy}
                        >
                          {isBusy ? "Operazione..." : "Conferma perizia"}
                        </button>
                      )}

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

      {popup.open && (
        <AscariPopup
          title={popup.title}
          message={popup.message}
          variant={popup.variant}
          confirmText={popup.confirmText}
          cancelText={popup.cancelText}
          loading={popup.loading}
          onClose={popup.onClose ?? closePopup}
          onCancel={closePopup}
          onConfirm={
            popup.onConfirm
              ? async () => {
                  await popup.onConfirm?.();
                }
              : undefined
          }
          closeOnBackdrop={!popup.loading}
        />
      )}
    </>
  );
}