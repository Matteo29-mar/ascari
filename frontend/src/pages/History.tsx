// frontend/src/pages/History.tsx

import React, { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "@clerk/clerk-react";
import { http } from "../api";
import AscariPopup from "../components/AscariPopup";

type HistoryRole = "SOLD" | "BOUGHT";

type HistoryItem = {
  id: number;
  role: HistoryRole;
  label: string;
  status: string;
  amountEur: number;
  ascariFeeEur?: number | null;
  sellerNetEur?: number | null;
  currency: string;
  soldAt: string;
  createdAt: string;
  hasInspection: boolean;
  car: {
    id?: number | null;
    make?: string | null;
    model?: string | null;
    title?: string | null;
    year?: number | null;
    coverUrl?: string | null;
    photos?: string[] | null;
    mileageKm?: number | null;
    fuelType?: string | null;
    transmission?: string | null;
    city?: string | null;
    locationText?: string | null;
    isPeriziata?: boolean;
  };
  counterparty?: {
    id: string;
    name?: string | null;
    email: string;
  } | null;
};

function formatEuro(value?: number | null) {
  if (value === null || value === undefined || !Number.isFinite(Number(value))) {
    return "-";
  }

  return `${Number(value).toLocaleString("it-IT")} €`;
}

function formatDate(value?: string | null) {
  if (!value) return "-";

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";

  return date.toLocaleDateString("it-IT", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

function getCoverUrl(item: HistoryItem) {
  if (item.car?.coverUrl) return item.car.coverUrl;

  if (Array.isArray(item.car?.photos) && item.car.photos.length > 0) {
    return item.car.photos[0];
  }

  return "";
}

export default function History() {
  const { getToken, isLoaded, isSignedIn } = useAuth();

  const [items, setItems] = useState<HistoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<"ALL" | HistoryRole>("ALL");

  const [popup, setPopup] = useState<{
    open: boolean;
    title: string;
    message: string;
    variant?: "success" | "error" | "warning" | "info";
  }>({
    open: false,
    title: "",
    message: "",
    variant: "info",
  });

  async function loadHistory() {
    try {
      setLoading(true);

      const token = await getToken();
      const res = await http.get("/history", {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      const payload = res.data;
      const history = Array.isArray(payload) ? payload : payload?.history;

      setItems(Array.isArray(history) ? history : []);
    } catch (err: any) {
      console.error("Errore caricamento storico:", err);

      setPopup({
        open: true,
        title: "Errore storico",
        message:
          err?.response?.data?.error ||
          "Non è stato possibile caricare lo storico.",
        variant: "error",
      });
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!isLoaded || !isSignedIn) return;
    loadHistory();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLoaded, isSignedIn]);

  const filteredItems = useMemo(() => {
    if (filter === "ALL") return items;
    return items.filter((item) => item.role === filter);
  }, [items, filter]);

  return (
    <div style={styles.page}>
      <div style={styles.header}>
        <div>
          <p style={styles.kicker}>ASCARI</p>
          <h1 style={styles.title}>Storico</h1>
          <p style={styles.subtitle}>
            Qui trovi le auto vendute e comprate ufficialmente tramite pagamento
            completato.
          </p>
        </div>

        <div style={styles.filters}>
          <button
            type="button"
            onClick={() => setFilter("ALL")}
            style={{
              ...styles.filterButton,
              ...(filter === "ALL" ? styles.filterButtonActive : {}),
            }}
          >
            Tutto
          </button>

          <button
            type="button"
            onClick={() => setFilter("SOLD")}
            style={{
              ...styles.filterButton,
              ...(filter === "SOLD" ? styles.filterButtonActive : {}),
            }}
          >
            Vendute
          </button>

          <button
            type="button"
            onClick={() => setFilter("BOUGHT")}
            style={{
              ...styles.filterButton,
              ...(filter === "BOUGHT" ? styles.filterButtonActive : {}),
            }}
          >
            Comprate
          </button>
        </div>
      </div>

      {loading ? (
        <div style={styles.emptyCard}>
          <h3 style={styles.emptyTitle}>Caricamento storico...</h3>
          <p style={styles.emptyText}>Sto recuperando le operazioni concluse.</p>
        </div>
      ) : filteredItems.length === 0 ? (
        <div style={styles.emptyCard}>
          <h3 style={styles.emptyTitle}>Nessuno storico disponibile</h3>
          <p style={styles.emptyText}>
            Quando un’auto viene venduta ufficialmente, comparirà qui.
          </p>
        </div>
      ) : (
        <div style={styles.grid}>
          {filteredItems.map((item) => {
            const coverUrl = getCoverUrl(item);
            const isSold = item.role === "SOLD";

            return (
              <Link
                key={item.id}
                to={`/history/${item.id}`}
                style={styles.cardLink}
              >
                <article style={styles.card}>
                  <div style={styles.imageWrap}>
                    {coverUrl ? (
                      <img
                        src={coverUrl}
                        alt={item.car?.title || "Auto storico"}
                        style={styles.image}
                      />
                    ) : (
                      <div style={styles.noImage}>ASCARI</div>
                    )}

                    <span
                      style={{
                        ...styles.badge,
                        ...(isSold ? styles.badgeSold : styles.badgeBought),
                      }}
                    >
                      {isSold ? "VENDUTA" : "COMPRATA"}
                    </span>
                  </div>

                  <div style={styles.cardBody}>
                    <div style={styles.cardTop}>
                      <div>
                        <h2 style={styles.carTitle}>
                          {item.car?.title ||
                            `${item.car?.make || ""} ${
                              item.car?.model || ""
                            }`.trim() ||
                            "Auto"}
                        </h2>

                        <p style={styles.carMeta}>
                          {item.car?.make} {item.car?.model}
                          {item.car?.year ? ` · ${item.car.year}` : ""}
                        </p>
                      </div>

                      <strong style={styles.price}>
                        {formatEuro(item.amountEur)}
                      </strong>
                    </div>

                    <div style={styles.infoGrid}>
                      <div style={styles.infoBox}>
                        <span style={styles.infoLabel}>Data</span>
                        <strong style={styles.infoValue}>
                          {formatDate(item.soldAt)}
                        </strong>
                      </div>

                      <div style={styles.infoBox}>
                        <span style={styles.infoLabel}>
                          {isSold ? "Acquirente" : "Venditore"}
                        </span>
                        <strong style={styles.infoValue}>
                          {item.counterparty?.name ||
                            item.counterparty?.email ||
                            "-"}
                        </strong>
                      </div>

                      <div style={styles.infoBox}>
                        <span style={styles.infoLabel}>Perizia</span>
                        <strong style={styles.infoValue}>
                          {item.hasInspection || item.car?.isPeriziata
                            ? "Presente"
                            : "Non presente"}
                        </strong>
                      </div>
                    </div>

                    <div style={styles.footer}>
                      <span style={styles.footerText}>
                        {item.car?.city || item.car?.locationText || "-"}
                      </span>

                      <span style={styles.openText}>Apri dettaglio →</span>
                    </div>
                  </div>
                </article>
              </Link>
            );
          })}
        </div>
      )}

      {popup.open && (
        <AscariPopup
            title={popup.title}
            message={popup.message}
            variant={popup.variant}
            onClose={() => setPopup((p) => ({ ...p, open: false }))}
        />
        )}
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  page: {
    maxWidth: 1180,
    margin: "0 auto",
    padding: "34px 18px 60px",
    color: "var(--text, #e9eef5)",
  },

  header: {
    display: "flex",
    justifyContent: "space-between",
    gap: 18,
    alignItems: "flex-end",
    marginBottom: 24,
    flexWrap: "wrap",
  },

  kicker: {
    margin: "0 0 6px",
    color: "#00e0a4",
    fontSize: 12,
    fontWeight: 900,
    letterSpacing: 2,
  },

  title: {
    margin: 0,
    fontSize: 34,
    fontWeight: 900,
    letterSpacing: -0.8,
  },

  subtitle: {
    margin: "8px 0 0",
    color: "rgba(233,238,245,0.68)",
    fontSize: 15,
    maxWidth: 620,
    lineHeight: 1.5,
  },

  filters: {
    display: "flex",
    gap: 10,
    background: "rgba(255,255,255,0.06)",
    border: "1px solid rgba(255,255,255,0.12)",
    padding: 6,
    borderRadius: 999,
  },

  filterButton: {
    border: "none",
    borderRadius: 999,
    padding: "10px 15px",
    fontWeight: 800,
    cursor: "pointer",
    background: "transparent",
    color: "rgba(233,238,245,0.72)",
  },

  filterButtonActive: {
    background: "linear-gradient(135deg, #00e0a4, #5b8cff)",
    color: "#061017",
    boxShadow: "0 10px 28px rgba(0,224,164,0.22)",
  },

  grid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fill, minmax(310px, 1fr))",
    gap: 18,
  },

  cardLink: {
    textDecoration: "none",
    color: "inherit",
  },

  card: {
    overflow: "hidden",
    borderRadius: 22,
    border: "1px solid rgba(255,255,255,0.12)",
    background:
      "linear-gradient(180deg, rgba(255,255,255,0.075), rgba(255,255,255,0.045))",
    boxShadow: "0 22px 60px rgba(0,0,0,0.28)",
    transition: "transform .18s ease, border-color .18s ease",
  },

  imageWrap: {
    position: "relative",
    aspectRatio: "16 / 9",
    background: "rgba(255,255,255,0.04)",
    overflow: "hidden",
  },

  image: {
    width: "100%",
    height: "100%",
    objectFit: "cover",
    display: "block",
  },

  noImage: {
    width: "100%",
    height: "100%",
    display: "grid",
    placeItems: "center",
    color: "rgba(233,238,245,0.55)",
    fontWeight: 900,
    letterSpacing: 3,
  },

  badge: {
    position: "absolute",
    top: 12,
    left: 12,
    padding: "8px 11px",
    borderRadius: 999,
    fontSize: 12,
    fontWeight: 900,
    letterSpacing: 0.5,
    border: "1px solid rgba(255,255,255,0.22)",
    backdropFilter: "blur(10px)",
  },

  badgeSold: {
    background: "rgba(0,224,164,0.92)",
    color: "#061017",
  },

  badgeBought: {
    background: "rgba(91,140,255,0.92)",
    color: "#fff",
  },

  cardBody: {
    padding: 18,
  },

  cardTop: {
    display: "flex",
    justifyContent: "space-between",
    gap: 12,
    alignItems: "flex-start",
    marginBottom: 16,
  },

  carTitle: {
    margin: 0,
    fontSize: 19,
    fontWeight: 900,
    lineHeight: 1.2,
  },

  carMeta: {
    margin: "6px 0 0",
    color: "rgba(233,238,245,0.62)",
    fontSize: 13,
  },

  price: {
    whiteSpace: "nowrap",
    color: "#00e0a4",
    fontSize: 18,
  },

  infoGrid: {
    display: "grid",
    gridTemplateColumns: "1fr",
    gap: 10,
  },

  infoBox: {
    borderRadius: 16,
    padding: "10px 12px",
    background: "rgba(0,0,0,0.18)",
    border: "1px solid rgba(255,255,255,0.08)",
  },

  infoLabel: {
    display: "block",
    fontSize: 11,
    color: "rgba(233,238,245,0.55)",
    marginBottom: 4,
  },

  infoValue: {
    display: "block",
    fontSize: 13,
    color: "rgba(233,238,245,0.92)",
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },

  footer: {
    marginTop: 16,
    display: "flex",
    justifyContent: "space-between",
    gap: 12,
    alignItems: "center",
  },

  footerText: {
    color: "rgba(233,238,245,0.55)",
    fontSize: 13,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },

  openText: {
    color: "#00e0a4",
    fontSize: 13,
    fontWeight: 900,
    whiteSpace: "nowrap",
  },

  emptyCard: {
    borderRadius: 24,
    border: "1px solid rgba(255,255,255,0.12)",
    background: "rgba(255,255,255,0.055)",
    padding: 34,
    textAlign: "center",
    boxShadow: "0 22px 60px rgba(0,0,0,0.22)",
  },

  emptyTitle: {
    margin: 0,
    fontSize: 22,
    fontWeight: 900,
  },

  emptyText: {
    margin: "10px auto 0",
    color: "rgba(233,238,245,0.65)",
    maxWidth: 520,
    lineHeight: 1.5,
  },
};