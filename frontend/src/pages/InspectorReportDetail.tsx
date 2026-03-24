import React, { useEffect, useState } from "react";
import { useAuth } from "@clerk/clerk-react";
import { useNavigate, useParams } from "react-router-dom";
import { http } from "../api";

type ReportDetail = {
  id: number;
  title?: string | null;
  overallStatus?: string | null;
  plate?: string | null;
  vin?: string | null;
  km?: number | null;
  inspectionDate?: string | null;
  location?: string | null;
  bodyworkNotes?: string | null;
  interiorNotes?: string | null;
  engineNotes?: string | null;
  mechanicsNotes?: string | null;
  tiresNotes?: string | null;
  electronicsNotes?: string | null;
  testDriveNotes?: string | null;
  defectsFound?: string | null;
  finalOpinion?: string | null;
  estimatedValue?: number | null;
  createdAt: string;
  updatedAt: string;
  car?: {
    id: number;
    make: string;
    model: string;
    title: string;
    year: number;
    coverUrl?: string | null;
    city?: string | null;
    mileageKm?: number | null;
  };
  inspectionRequest?: {
    id: number;
    startAt: string;
    endAt: string;
    status: string;
  };
  inspectorUser?: {
    id: string;
    name?: string | null;
    email?: string | null;
  };
};

function InfoRow({
  label,
  value,
}: {
  label: string;
  value?: string | number | null;
}) {
  return (
    <div
      style={{
        padding: "10px 0",
        borderBottom: "1px solid rgba(255,255,255,0.08)",
      }}
    >
      <div style={{ fontSize: 13, opacity: 0.7 }}>{label}</div>
      <div style={{ marginTop: 4, fontWeight: 600 }}>{value ?? "-"}</div>
    </div>
  );
}

function NoteBlock({
  title,
  value,
}: {
  title: string;
  value?: string | null;
}) {
  return (
    <div
      style={{
        border: "1px solid rgba(255,255,255,0.1)",
        borderRadius: 12,
        padding: 14,
        background: "rgba(255,255,255,0.03)",
      }}
    >
      <div style={{ fontWeight: 700, marginBottom: 8 }}>{title}</div>
      <div style={{ whiteSpace: "pre-wrap", lineHeight: 1.5, opacity: 0.92 }}>
        {value?.trim() ? value : "-"}
      </div>
    </div>
  );
}

export default function InspectorReportDetail() {
  const { id } = useParams();
  const { getToken } = useAuth();
  const navigate = useNavigate();

  const [loading, setLoading] = useState(true);
  const [report, setReport] = useState<ReportDetail | null>(null);

  async function authHeaders() {
    const token = await getToken();
    if (!token) throw new Error("Token mancante");
    return { Authorization: `Bearer ${token}` };
  }

  async function downloadPdf() {
    try {
      const headers = await authHeaders();
      const response = await http.get(`/inspection-reports/${id}/pdf`, {
        headers,
        responseType: "blob",
      });

      const blob = new Blob([response.data], { type: "application/pdf" });
      const url = window.URL.createObjectURL(blob);

      const a = document.createElement("a");
      a.href = url;
      a.download = `resoconto-${id}.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();

      window.URL.revokeObjectURL(url);
    } catch (e: any) {
      alert(e?.response?.data?.error ?? e?.message ?? "Errore download PDF");
    }
  }

  useEffect(() => {
    (async () => {
      try {
        setLoading(true);
        const headers = await authHeaders();
        const { data } = await http.get(`/inspection-reports/${id}`, { headers });
        setReport(data?.report ?? null);
      } catch (e: any) {
        alert(e?.response?.data?.error ?? e?.message ?? "Errore caricamento resoconto");
      } finally {
        setLoading(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  if (loading) return <div style={{ paddingTop: 18 }}>Caricamento...</div>;
  if (!report) return <div style={{ paddingTop: 18 }}>Resoconto non trovato.</div>;

  return (
    <div style={{ paddingTop: 18, paddingBottom: 24 }}>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          gap: 12,
          alignItems: "center",
          flexWrap: "wrap",
        }}
      >
        <div>
          <h1>{report.title || "Resoconto perizia"}</h1>
          <p style={{ opacity: 0.8 }}>
            Auto: {report.car?.make} {report.car?.model} ({report.car?.year})
          </p>
        </div>

        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <button className="btn secondary" onClick={() => navigate("/inspector/report")}>
            Torna all'archivio
          </button>
          <button className="btn" onClick={downloadPdf}>
            Scarica PDF
          </button>
        </div>
      </div>

      <div
        style={{
          marginTop: 18,
          border: "1px solid rgba(255,255,255,0.1)",
          borderRadius: 16,
          overflow: "hidden",
          background: "rgba(255,255,255,0.03)",
        }}
      >
        {report.car?.coverUrl ? (
          <img
            src={report.car.coverUrl}
            alt=""
            style={{
              width: "100%",
              maxHeight: 340,
              objectFit: "cover",
              display: "block",
            }}
          />
        ) : null}

        <div style={{ padding: 18 }}>
          <div
            style={{
              display: "grid",
              gap: 18,
              gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
            }}
          >
            <div>
              <InfoRow label="Esito generale" value={report.overallStatus} />
              <InfoRow label="Targa" value={report.plate} />
              <InfoRow label="VIN" value={report.vin} />
              <InfoRow label="KM" value={report.km} />
              <InfoRow
                label="Data perizia"
                value={
                  report.inspectionDate
                    ? new Date(report.inspectionDate).toLocaleString("it-IT")
                    : "-"
                }
              />
              <InfoRow label="Luogo" value={report.location} />
              <InfoRow
                label="Valore stimato"
                value={
                  report.estimatedValue != null
                    ? `${report.estimatedValue} €`
                    : "-"
                }
              />
            </div>

            <div>
              <InfoRow label="Periziatore" value={report.inspectorUser?.name || "-"} />
              <InfoRow label="Email periziatore" value={report.inspectorUser?.email || "-"} />
              <InfoRow label="Auto" value={`${report.car?.make} ${report.car?.model}`} />
              <InfoRow label="Anno" value={report.car?.year} />
              <InfoRow label="Città auto" value={report.car?.city || "-"} />
              <InfoRow
                label="Finestra appuntamento"
                value={
                  report.inspectionRequest
                    ? `${new Date(report.inspectionRequest.startAt).toLocaleString("it-IT")} → ${new Date(report.inspectionRequest.endAt).toLocaleString("it-IT")}`
                    : "-"
                }
              />
              <InfoRow
                label="Creato il"
                value={new Date(report.createdAt).toLocaleString("it-IT")}
              />
            </div>
          </div>

          <div
            style={{
              display: "grid",
              gap: 14,
              marginTop: 22,
              gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
            }}
          >
            <NoteBlock title="Carrozzeria" value={report.bodyworkNotes} />
            <NoteBlock title="Interni" value={report.interiorNotes} />
            <NoteBlock title="Motore" value={report.engineNotes} />
            <NoteBlock title="Meccanica" value={report.mechanicsNotes} />
            <NoteBlock title="Pneumatici" value={report.tiresNotes} />
            <NoteBlock title="Elettronica" value={report.electronicsNotes} />
            <NoteBlock title="Test drive" value={report.testDriveNotes} />
            <NoteBlock title="Difetti riscontrati" value={report.defectsFound} />
          </div>

          <div style={{ marginTop: 18 }}>
            <NoteBlock title="Parere finale" value={report.finalOpinion} />
          </div>
        </div>
      </div>
    </div>
  );
}