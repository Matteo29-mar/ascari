import AscariPopup from "./AscariPopup";

export type QrStats = {
  carId: number;
  title?: string;
  make?: string;
  model?: string;
  totalScans: number;
  uniqueVisitors: number;
  scansToday: number;
  scansLast7Days: number;
  scansLast30Days: number;
  offersReceived: number;
  likesReceived: number;
  conversionRate: number;
  lastScanAt?: string | null;
};

function formatDate(value?: string | null) {
  if (!value) return "—";

  const d = new Date(value);

  if (Number.isNaN(d.getTime())) return "—";

  return d.toLocaleString("it-IT", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function StatBox({ label, value }: { label: string; value: string | number }) {
  return (
    <div
      style={{
        border: "1px solid rgba(255,255,255,0.12)",
        background: "rgba(255,255,255,0.04)",
        borderRadius: 16,
        padding: 14,
      }}
    >
      <div className="muted" style={{ marginBottom: 6 }}>
        {label}
      </div>
      <b style={{ fontSize: 18 }}>{value}</b>
    </div>
  );
}

export default function QrStatsModal({
  stats,
  onClose,
}: {
  stats: QrStats;
  onClose: () => void;
}) {
  return (
    <AscariPopup
      title={`Statistiche ${stats.title || `${stats.make ?? ""} ${stats.model ?? ""}`}`}
      message="Andamento del QR Code e della card."
      variant="info"
      confirmText="Chiudi"
      onClose={onClose}
      maxWidth={720}
      showCloseButton={true}
    >
      <div
        style={{
          display: "grid",
          gap: 12,
          gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
          marginTop: 14,
        }}
      >
        <StatBox label="QR scansioni" value={stats.totalScans} />
        <StatBox label="Visitatori unici" value={stats.uniqueVisitors} />
        <StatBox label="Scansioni oggi" value={stats.scansToday} />
        <StatBox label="Ultimi 7 giorni" value={stats.scansLast7Days} />
        <StatBox label="Ultimi 30 giorni" value={stats.scansLast30Days} />
        <StatBox label="Offerte ricevute" value={stats.offersReceived} />
        <StatBox label="Mi piace ricevuti" value={stats.likesReceived} />
        <StatBox label="Conversione" value={`${stats.conversionRate}%`} />
        <StatBox label="Ultima scansione" value={formatDate(stats.lastScanAt)} />
      </div>
    </AscariPopup>
  );
}