// frontend/src/pages/HistoryDetail.tsx

import React, { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useAuth } from "@clerk/clerk-react";
import { http } from "../api";
import AscariPopup from "../components/AscariPopup";

type HistoryRole = "SOLD" | "BOUGHT";

type HistoryDetailData = {
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

  buyer?: {
    id: string;
    name?: string | null;
    email: string;
  } | null;

  seller?: {
    id: string;
    name?: string | null;
    email: string;
  } | null;

  inspection?: Record<string, any> | null;
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

function safe(value: any, fallback = "-") {
  if (value === null || value === undefined || value === "") return fallback;
  return String(value);
}

function getCoverUrl(history?: HistoryDetailData | null) {
  if (!history) return "";

  if (history.car?.coverUrl) return history.car.coverUrl;

  if (Array.isArray(history.car?.photos) && history.car.photos.length > 0) {
    return history.car.photos[0];
  }

  return "";
}

function downloadBlob(blob: Blob, filename: string) {
  const url = window.URL.createObjectURL(blob);

  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();

  a.remove();
  window.URL.revokeObjectURL(url);
}

export default function HistoryDetail() {
  const { id } = useParams();
  const { getToken, isLoaded, isSignedIn } = useAuth();

  const [history, setHistory] = useState<HistoryDetailData | null>(null);
  const [loading, setLoading] = useState(true);
  const [downloading, setDownloading] = useState(false);

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

  const coverUrl = useMemo(() => getCoverUrl(history), [history]);

  async function loadDetail() {
    try {
      setLoading(true);

      const token = await getToken();

      const res = await http.get(`/history/${id}`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      setHistory(res.data?.history ?? null);
    } catch (err: any) {
      console.error("Errore dettaglio storico:", err);

      setPopup({
        open: true,
        title: "Errore storico",
        message:
          err?.response?.data?.error ||
          "Non è stato possibile caricare il dettaglio dello storico.",
        variant: "error",
      });
    } finally {
      setLoading(false);
    }
  }

  async function handleDownloadPdf() {
    if (!history) return;

    try {
      setDownloading(true);

      const token = await getToken();

      const res = await http.get(`/history/${history.id}/pdf`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
        responseType: "blob",
      });

      const make = safe(history.car?.make, "auto")
        .replace(/[^a-zA-Z0-9-_]/g, "_")
        .toLowerCase();

      const model = safe(history.car?.model, "storico")
        .replace(/[^a-zA-Z0-9-_]/g, "_")
        .toLowerCase();

      const type = history.role === "SOLD" ? "vendita" : "acquisto";

      downloadBlob(
        res.data,
        `ascari-storico-${type}-${make}-${model}-${history.id}.pdf`
      );
    } catch (err: any) {
      console.error("Errore download PDF storico:", err);

      setPopup({
        open: true,
        title: "Download non riuscito",
        message:
          err?.response?.data?.error ||
          "Non è stato possibile scaricare il PDF dello storico.",
        variant: "error",
      });
    } finally {
      setDownloading(false);
    }
  }

  useEffect(() => {
    if (!isLoaded || !isSignedIn || !id) return;
    loadDetail();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLoaded, isSignedIn, id]);

  if (loading) {
    return (
      <div style={styles.page}>
        <div style={styles.emptyCard}>
          <h1 style={styles.emptyTitle}>Caricamento storico...</h1>
          <p style={styles.emptyText}>Sto recuperando i dettagli.</p>
        </div>
      </div>
    );
  }

  if (!history) {
    return (
      <div style={styles.page}>
        <div style={styles.emptyCard}>
          <h1 style={styles.emptyTitle}>Storico non trovato</h1>
          <p style={styles.emptyText}>
            La voce storico richiesta non esiste oppure non è accessibile.
          </p>

          <Link to="/history" style={styles.backButton}>
            Torna allo storico
          </Link>
        </div>

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

  const isSold = history.role === "SOLD";
  const inspection = history.inspection || {};

  return (
    <div style={styles.page}>
      <div style={styles.topBar}>
        <Link to="/history" style={styles.backLink}>
          ← Torna allo storico
        </Link>

        <button
          type="button"
          onClick={handleDownloadPdf}
          disabled={downloading}
          style={{
            ...styles.downloadButton,
            opacity: downloading ? 0.7 : 1,
            cursor: downloading ? "not-allowed" : "pointer",
          }}
        >
          {downloading ? "Download..." : "Scarica PDF"}
        </button>
      </div>

      <section style={styles.hero}>
        <div style={styles.imageWrap}>
          {coverUrl ? (
            <img
              src={coverUrl}
              alt={history.car?.title || "Auto storico"}
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

        <div style={styles.heroContent}>
          <p style={styles.kicker}>STORICO ASCARI</p>

          <h1 style={styles.title}>
            {history.car?.title ||
              `${history.car?.make || ""} ${history.car?.model || ""}`.trim() ||
              "Auto"}
          </h1>

          <p style={styles.subtitle}>
            {history.car?.make} {history.car?.model}
            {history.car?.year ? ` · ${history.car.year}` : ""}
          </p>

          <div style={styles.priceBox}>
            <span style={styles.priceLabel}>Importo vendita</span>
            <strong style={styles.price}>{formatEuro(history.amountEur)}</strong>
          </div>

          <div style={styles.heroActions}>
            <div style={styles.smallInfo}>
              <span>Data</span>
              <strong>{formatDate(history.soldAt)}</strong>
            </div>

            <div style={styles.smallInfo}>
              <span>{isSold ? "Acquirente" : "Venditore"}</span>
              <strong>
                {history.counterparty?.name ||
                  history.counterparty?.email ||
                  "-"}
              </strong>
            </div>

            <div style={styles.smallInfo}>
              <span>Perizia</span>
              <strong>
                {history.hasInspection || history.car?.isPeriziata
                  ? "Presente"
                  : "Non presente"}
              </strong>
            </div>
          </div>
        </div>
      </section>

      <div style={styles.contentGrid}>
        <section style={styles.panel}>
          <h2 style={styles.sectionTitle}>Dettagli auto</h2>

          <div style={styles.rows}>
            <InfoRow label="Marca" value={history.car?.make} />
            <InfoRow label="Modello" value={history.car?.model} />
            <InfoRow label="Anno" value={history.car?.year} />
            <InfoRow label="Cambio" value={history.car?.transmission} />
            <InfoRow label="Alimentazione" value={history.car?.fuelType} />
            <InfoRow
              label="Chilometraggio"
              value={
                history.car?.mileageKm
                  ? `${history.car.mileageKm.toLocaleString("it-IT")} km`
                  : "-"
              }
            />
            <InfoRow label="Città" value={history.car?.city} />
            <InfoRow label="Indirizzo" value={history.car?.locationText} />
          </div>
        </section>

        <section style={styles.panel}>
          <h2 style={styles.sectionTitle}>Operazione</h2>

          <div style={styles.rows}>
            <InfoRow label="Stato" value={isSold ? "Venduta" : "Comprata"} />
            <InfoRow label="Importo" value={formatEuro(history.amountEur)} />
            <InfoRow
              label="Commissione Ascari"
              value={formatEuro(history.ascariFeeEur)}
            />
            <InfoRow
              label="Netto venditore"
              value={formatEuro(history.sellerNetEur)}
            />
            <InfoRow
              label={isSold ? "Acquirente" : "Venditore"}
              value={
                history.counterparty?.name ||
                history.counterparty?.email ||
                "-"
              }
            />
            <InfoRow
              label="Email"
              value={history.counterparty?.email || "-"}
            />
          </div>
        </section>
      </div>

      <section style={styles.panel}>
        <h2 style={styles.sectionTitle}>Esito perizia</h2>

        {history.hasInspection && history.inspection ? (
          <>
            <div style={styles.rows}>
              <InfoRow label="Titolo" value={inspection.title} />
              <InfoRow label="Stato generale" value={inspection.overallStatus} />
              <InfoRow label="Targa" value={inspection.plate} />
              <InfoRow label="VIN" value={inspection.vin} />
              <InfoRow label="KM rilevati" value={inspection.km} />
              <InfoRow
                label="Data perizia"
                value={formatDate(inspection.inspectionDate)}
              />
              <InfoRow label="Luogo" value={inspection.location} />
              <InfoRow
                label="Valore stimato"
                value={
                  inspection.estimatedValue
                    ? formatEuro(inspection.estimatedValue)
                    : "-"
                }
              />
            </div>

            <div style={styles.notesGrid}>
              <NoteBox label="Carrozzeria" value={inspection.bodyworkNotes} />
              <NoteBox label="Interni" value={inspection.interiorNotes} />
              <NoteBox label="Motore" value={inspection.engineNotes} />
              <NoteBox label="Meccanica" value={inspection.mechanicsNotes} />
              <NoteBox label="Pneumatici" value={inspection.tiresNotes} />
              <NoteBox label="Elettronica" value={inspection.electronicsNotes} />
              <NoteBox label="Test drive" value={inspection.testDriveNotes} />
              <NoteBox
                label="Difetti riscontrati"
                value={inspection.defectsFound}
              />
              <NoteBox
                label="Opinione finale"
                value={inspection.finalOpinion}
              />
            </div>
          </>
        ) : (
          <div style={styles.noInspection}>
            Nessun resoconto perizia associato a questa vendita.
          </div>
        )}
      </section>

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

function InfoRow({ label, value }: { label: string; value: any }) {
  return (
    <div style={styles.infoRow}>
      <span style={styles.infoRowLabel}>{label}</span>
      <strong style={styles.infoRowValue}>{safe(value)}</strong>
    </div>
  );
}

function NoteBox({ label, value }: { label: string; value: any }) {
  return (
    <div style={styles.noteBox}>
      <span style={styles.noteLabel}>{label}</span>
      <p style={styles.noteText}>{safe(value, "Nessuna nota")}</p>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  page: {
    maxWidth: 1180,
    margin: "0 auto",
    padding: "30px 18px 60px",
    color: "var(--text, #e9eef5)",
  },

  topBar: {
    display: "flex",
    justifyContent: "space-between",
    gap: 14,
    alignItems: "center",
    marginBottom: 18,
    flexWrap: "wrap",
  },

  backLink: {
    color: "rgba(233,238,245,0.72)",
    textDecoration: "none",
    fontWeight: 800,
  },

  backButton: {
    display: "inline-flex",
    marginTop: 18,
    padding: "11px 16px",
    borderRadius: 999,
    background: "linear-gradient(135deg, #00e0a4, #5b8cff)",
    color: "#061017",
    textDecoration: "none",
    fontWeight: 900,
  },

  downloadButton: {
    border: "none",
    borderRadius: 999,
    padding: "12px 18px",
    fontWeight: 900,
    background: "linear-gradient(135deg, #00e0a4, #5b8cff)",
    color: "#061017",
    boxShadow: "0 12px 34px rgba(0,224,164,0.22)",
  },

  hero: {
    display: "grid",
    gridTemplateColumns: "minmax(260px, 470px) 1fr",
    gap: 22,
    borderRadius: 26,
    padding: 18,
    border: "1px solid rgba(255,255,255,0.12)",
    background:
      "linear-gradient(180deg, rgba(255,255,255,0.075), rgba(255,255,255,0.045))",
    boxShadow: "0 24px 70px rgba(0,0,0,0.3)",
    marginBottom: 22,
  },

  imageWrap: {
    position: "relative",
    aspectRatio: "16 / 9",
    borderRadius: 20,
    overflow: "hidden",
    background: "rgba(255,255,255,0.04)",
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

  heroContent: {
    display: "flex",
    flexDirection: "column",
    justifyContent: "center",
    minWidth: 0,
  },

  kicker: {
    margin: "0 0 8px",
    color: "#00e0a4",
    fontSize: 12,
    fontWeight: 900,
    letterSpacing: 2,
  },

  title: {
    margin: 0,
    fontSize: 34,
    lineHeight: 1.08,
    fontWeight: 950,
    letterSpacing: -0.8,
  },

  subtitle: {
    margin: "10px 0 18px",
    color: "rgba(233,238,245,0.66)",
    fontSize: 15,
  },

  priceBox: {
    width: "fit-content",
    borderRadius: 18,
    padding: "12px 16px",
    background: "rgba(0,224,164,0.1)",
    border: "1px solid rgba(0,224,164,0.26)",
    marginBottom: 18,
  },

  priceLabel: {
    display: "block",
    color: "rgba(233,238,245,0.62)",
    fontSize: 12,
    marginBottom: 4,
  },

  price: {
    color: "#00e0a4",
    fontSize: 26,
    fontWeight: 950,
  },

  heroActions: {
    display: "grid",
    gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
    gap: 10,
  },

  smallInfo: {
    borderRadius: 16,
    padding: "10px 12px",
    background: "rgba(0,0,0,0.18)",
    border: "1px solid rgba(255,255,255,0.08)",
    minWidth: 0,
  },

  contentGrid: {
    display: "grid",
    gridTemplateColumns: "1fr 1fr",
    gap: 18,
    marginBottom: 18,
  },

  panel: {
    borderRadius: 24,
    padding: 20,
    background: "rgba(255,255,255,0.055)",
    border: "1px solid rgba(255,255,255,0.12)",
    boxShadow: "0 20px 55px rgba(0,0,0,0.22)",
  },

  sectionTitle: {
    margin: "0 0 16px",
    fontSize: 21,
    fontWeight: 950,
  },

  rows: {
    display: "grid",
    gap: 10,
  },

  infoRow: {
    display: "grid",
    gridTemplateColumns: "160px 1fr",
    gap: 12,
    alignItems: "center",
    padding: "11px 12px",
    borderRadius: 16,
    background: "rgba(0,0,0,0.16)",
    border: "1px solid rgba(255,255,255,0.07)",
  },

  infoRowLabel: {
    color: "rgba(233,238,245,0.55)",
    fontSize: 13,
  },

  infoRowValue: {
    color: "rgba(233,238,245,0.92)",
    fontSize: 14,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },

  notesGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
    gap: 12,
    marginTop: 16,
  },

  noteBox: {
    padding: 14,
    borderRadius: 18,
    background: "rgba(0,0,0,0.16)",
    border: "1px solid rgba(255,255,255,0.07)",
  },

  noteLabel: {
    display: "block",
    color: "#00e0a4",
    fontWeight: 900,
    fontSize: 13,
    marginBottom: 8,
  },

  noteText: {
    margin: 0,
    color: "rgba(233,238,245,0.72)",
    fontSize: 14,
    lineHeight: 1.5,
  },

  noInspection: {
    borderRadius: 18,
    padding: 18,
    background: "rgba(255,255,255,0.045)",
    color: "rgba(233,238,245,0.66)",
    border: "1px solid rgba(255,255,255,0.08)",
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