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

export default function OffersReceived() {
  const [list, setList] = useState<Offer[]>([]);
  const [confirmOfferId, setConfirmOfferId] = useState<number | null>(null);

  const { getToken } = useAuth();
  const nav = useNavigate();

  useEffect(() => {
    load();
  }, []);

  async function load() {
    const token = await getToken();
    const { data } = await http.get("/offers/received", {
      headers: { Authorization: `Bearer ${token}` },
    });
    setList(data);
  }

  async function respond(id: number, action: "accept" | "decline") {
    const token = await getToken();

    const { data } = await http.post(
      `/offers/${id}/${action}`,
      {},
      { headers: { Authorization: `Bearer ${token}` } }
    );

    setList((prev) =>
      prev.map((o) =>
        o.id === id
          ? {
              ...o,
              status: action === "accept" ? "ACCEPTED" : "REJECTED",
              chatId: data.chatId ?? o.chatId ?? null,
            }
          : o
      )
    );
  }

  async function deleteOffer(id: number, force = false) {
    const token = await getToken();
    await http.delete(`/offers/${id}${force ? "?force=true" : ""}`, {
      headers: { Authorization: `Bearer ${token}` },
    });

    setConfirmOfferId(null);
    setList((prev) => prev.filter((o) => o.id !== id));
  }

  return (
    <div>
      <h1 className="h1">Offerte ricevute</h1>

      {list.length === 0 && <p className="muted">Nessuna offerta ricevuta.</p>}

      {list.map((offer) => (
        <div key={offer.id} className="card" style={{ marginBottom: 14 }}>
          <div className="card-body row" style={{ alignItems: "center", gap: 20 }}>

            <img
              src={offer.car.photos?.[0] || "/placeholder.jpg"}
              style={{ width: 120, height: 80, objectFit: "cover", borderRadius: 8 }}
            />

            <div style={{ flex: 1 }}>
              <b>{offer.car.make} {offer.car.model}</b>
              <p className="muted">Da: {offer.buyer.email}</p>
              <p>Offerta: <b>{offer.amount} €</b></p>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: 10, minWidth: 140 }}>

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
                  textAlign: "center"
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
                      setConfirmOfferId(offer.id); // 🔥 POPUP
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
      ))}

      {/* MODAL CONFERMA */}
      {confirmOfferId && (
        <div className="modal-backdrop">
          <div className="modal">
            <h3>Eliminare la chat?</h3>
            <p>
              Eliminando l’offerta verrà cancellata <b>tutta la conversazione</b>.
            </p>

            <div className="modal-actions">
              <button
                className="btn secondary"
                onClick={() => setConfirmOfferId(null)}
              >
                No
              </button>

              <button
                className="btn danger"
                onClick={() => deleteOffer(confirmOfferId, true)}
              >
                Sì, elimina
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
