import React, { useEffect, useState } from "react";
import { http } from "../api";
import { useAuth } from "@clerk/clerk-react";
import { useNavigate } from "react-router-dom";

type Offer = {
  id: number;
  amount: number;
  status: string;
  createdAt: string;
  buyer: { name?: string; email: string };
  chatId?: number | null;
  car: { id: number; make: string; model: string; photos?: string[] | null };
};

// ✅ normalizza: backend può restituire [] oppure {offers:[]} oppure {data:[]} ecc.
function normalizeOffers(payload: any): Offer[] {
  if (Array.isArray(payload)) return payload as Offer[];

  if (payload && Array.isArray(payload.offers)) return payload.offers as Offer[];
  if (payload && Array.isArray(payload.data)) return payload.data as Offer[];
  if (payload && Array.isArray(payload.items)) return payload.items as Offer[];

  // a volte può arrivare { result: [...] }
  if (payload && Array.isArray(payload.result)) return payload.result as Offer[];

  return [];
}

export default function OffersReceived() {
  const [list, setList] = useState<Offer[]>([]);
  const [confirmOfferId, setConfirmOfferId] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  const { getToken } = useAuth();
  const nav = useNavigate();

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function load() {
    setLoading(true);
    setErr(null);

    try {
      const token = await getToken();
      if (!token) {
        setErr("Utente non autenticato");
        setList([]);
        return;
      }

      const res = await http.get("/offers/received", {
        headers: { Authorization: `Bearer ${token}` },
      });

      const offers = normalizeOffers(res.data);
      setList(offers);
    } catch (e: any) {
      console.error("Errore caricamento offerte ricevute:", e);
      setErr(e?.response?.data?.error || e?.message || "Errore caricamento offerte");
      setList([]);
    } finally {
      setLoading(false);
    }
  }

  async function respond(id: number, action: "accept" | "decline") {
    setErr(null);
    try {
      const token = await getToken();
      if (!token) {
        setErr("Utente non autenticato");
        return;
      }

      const res = await http.post(
        `/offers/${id}/${action}`,
        {},
        { headers: { Authorization: `Bearer ${token}` } }
      );

      const chatIdFromServer = res?.data?.chatId ?? null;

      setList((prev) =>
        (Array.isArray(prev) ? prev : []).map((o) =>
          o.id === id
            ? {
                ...o,
                status: action === "accept" ? "ACCEPTED" : "REJECTED",
                chatId: chatIdFromServer ?? o.chatId ?? null,
              }
            : o
        )
      );
    } catch (e: any) {
      console.error("Errore risposta offerta:", e);
      setErr(e?.response?.data?.error || e?.message || "Errore aggiornamento offerta");
    }
  }

  async function deleteOffer(id: number, force = false) {
    setErr(null);
    try {
      const token = await getToken();
      if (!token) {
        setErr("Utente non autenticato");
        return;
      }

      await http.delete(`/offers/${id}${force ? "?force=true" : ""}`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      setConfirmOfferId(null);
      setList((prev) => (Array.isArray(prev) ? prev : []).filter((o) => o.id !== id));
    } catch (e: any) {
      console.error("Errore eliminazione offerta:", e);
      setErr(e?.response?.data?.error || e?.message || "Errore eliminazione offerta");
    }
  }

  const safeList = Array.isArray(list) ? list : [];

  return (
    <div>
      <h1 className="h1">Offerte ricevute</h1>

      {loading && <p className="muted">Caricamento offerte...</p>}
      {err && <p style={{ color: "var(--danger)" }}>{err}</p>}

      {!loading && safeList.length === 0 && (
        <p className="muted">Nessuna offerta ricevuta.</p>
      )}

      {safeList.map((offer) => {
        const cover =
          (Array.isArray(offer.car?.photos) && offer.car.photos?.[0]) ||
          "/cars/placeholder.jpg";

        return (
          <div key={offer.id} className="card" style={{ marginBottom: 14 }}>
            <div className="card-body row" style={{ alignItems: "center", gap: 20 }}>
              <img
                src={cover}
                alt="car"
                style={{ width: 120, height: 80, objectFit: "cover", borderRadius: 8 }}
              />

              <div style={{ flex: 1 }}>
                <b>
                  {offer.car?.make} {offer.car?.model}
                </b>
                <p className="muted">Da: {offer.buyer?.name || offer.buyer?.email}</p>
                <p>
                  Offerta: <b>{offer.amount} €</b>
                </p>
              </div>

              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: 10,
                  minWidth: 140,
                }}
              >
                <span
                  style={{
                    padding: "4px 10px",
                    borderRadius: 6,
                    background:
                      offer.status === "ACCEPTED"
                        ? "#00ffcc"
                        : offer.status === "PENDING"
                        ? "#ffaa00"
                        : "#ff4444",
                    color: "#000",
                    fontWeight: 600,
                    textAlign: "center",
                  }}
                >
                  {offer.status}
                </span>

                {offer.status === "ACCEPTED" && offer.chatId && (
                  <button
                    className="btn"
                    style={{ background: "#0066ff", color: "white" }}
                    onClick={() => nav(`/chat/${offer.chatId}`)}
                  >
                    💬 Apri chat
                  </button>
                )}

                {offer.status !== "PENDING" && (
                  <button
                    className="btn secondary"
                    style={{ background: "#ff4444", color: "white" }}
                    onClick={() => {
                      if (offer.status === "ACCEPTED") {
                        setConfirmOfferId(offer.id);
                      } else {
                        deleteOffer(offer.id);
                      }
                    }}
                  >
                    🗑 Elimina
                  </button>
                )}
              </div>

              {offer.status === "PENDING" && (
                <div className="row" style={{ gap: 8, marginLeft: 10 }}>
                  <button
                    className="btn"
                    style={{ background: "#00ffaa", color: "#000" }}
                    onClick={() => respond(offer.id, "accept")}
                  >
                    Accetta
                  </button>

                  <button
                    className="btn secondary"
                    style={{ background: "#ff6666", color: "#fff" }}
                    onClick={() => respond(offer.id, "decline")}
                  >
                    Rifiuta
                  </button>
                </div>
              )}
            </div>
          </div>
        );
      })}

      {/* MODAL CONFERMA */}
      {confirmOfferId && (
        <div className="modal-backdrop">
          <div className="modal">
            <h3>Eliminare la chat?</h3>
            <p>
              Eliminando l’offerta verrà cancellata <b>tutta la conversazione</b>.
            </p>

            <div className="modal-actions">
              <button className="btn secondary" onClick={() => setConfirmOfferId(null)}>
                No
              </button>

              <button className="btn danger" onClick={() => deleteOffer(confirmOfferId, true)}>
                Sì, elimina
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
