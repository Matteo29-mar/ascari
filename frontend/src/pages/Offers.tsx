import React, { useEffect, useState } from "react";
import { useAuth } from "@clerk/clerk-react";
import { http } from "../api";
import { Link } from "react-router-dom";
import { useOffers } from "../context/OfferContext";


export default function OffersPage() {
  const { getToken } = useAuth();
  const [offers, setOffers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const { reloadOffers } = useOffers();


  async function load() {
    try {
      const token = await getToken();
      const { data } = await http.get("/offers/received", {
        headers: { Authorization: `Bearer ${token}` },
      });

      setOffers(data);
    } catch (err) {
      console.error("Errore caricamento offerte", err);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function acceptOffer(id: number) {
    const token = await getToken();
    await http.post(`/offers/${id}/accept`, {}, {
      headers: { Authorization: `Bearer ${token}` },
    });
    reloadOffers(); // 🔥 aggiorna badge
    load();         // 🔥 ricarica lista
  }

  async function rejectOffer(id: number) {
    const token = await getToken();
    await http.post(`/offers/${id}/reject`, {}, {
      headers: { Authorization: `Bearer ${token}` },
    });
    reloadOffers();
    load();
  }


  if (loading) return <p>Caricamento…</p>;

  return (
    <div>
      <h1 className="h1">Offerte ricevute</h1>

      {offers.length === 0 && (
        <p className="muted">Nessuna offerta ricevuta.</p>
      )}

      {offers.map((offer) => (
        <div key={offer.id} className="card" style={{ marginTop: 15 }}>
          <div className="card-body row space" style={{ alignItems: "center" }}>
            
            <img
              src={offer.car.coverUrl || offer.car.photos?.[0]}
              style={{ width: 120, height: 80, objectFit: "cover", borderRadius: 8 }}
            />

            <div style={{ flex: 1, marginLeft: 16 }}>
              <b>
                {offer.car.make} {offer.car.model} ({offer.amount} €)
              </b>
              <p className="muted">
                Offerta da: {offer.buyer.name || offer.buyer.email}  
              </p>
            </div>

            {/* Stato */}
            <span
              style={{
                padding: "4px 10px",
                borderRadius: 6,
                background:
                  offer.status === "PENDING"
                    ? "#444"
                    : offer.status === "ACCEPTED"
                    ? "#00ffcc"
                    : "#ff4d4d",
                color: "#000",
                fontWeight: 600,
              }}
            >
              {offer.status}
            </span>

            {/* Bottoni azione */}
            {offer.status === "PENDING" && (
              <div className="row" style={{ gap: 10, marginLeft: 20 }}>
                <button className="btn" onClick={() => acceptOffer(offer.id)}>
                  Accetta
                </button>
                <button className="btn secondary" onClick={() => rejectOffer(offer.id)}>
                  Rifiuta
                </button>
              </div>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
