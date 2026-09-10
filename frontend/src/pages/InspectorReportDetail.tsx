import React, { useEffect, useMemo, useState } from "react";
import { useAuth } from "@clerk/clerk-react";
import { useNavigate, useParams } from "react-router-dom";
import { http } from "../api";

type InspectionRating = {
  id: number;
  pointKey: string;
  pointLabel: string;
  category: string;
  score: number;
  note?: string | null;
};

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
  valuationOpinion?: string | null;
  estimatedValue?: number | null;
  ratings?: InspectionRating[];
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

const CATEGORY_LABELS: Record<string, string> = {
  BODYWORK: "Carrozzeria",
  INTERIOR: "Interni",
  ENGINE: "Motore",
  MECHANICS: "Meccanica",
  TIRES: "Pneumatici",
  ELECTRONICS: "Elettronica",
  TEST_DRIVE: "Test drive",
};

const SCORE_LABELS: Record<number, string> = {
  1: "Da buttare",
  2: "Danneggiato",
  3: "Normale",
  4: "Buone condizioni",
  5: "Come nuovo",
};

function InfoRow({ label, value }: { label: string; value?: string | number | null }) {
  return (
    <div className="inspection-detail-info-row">
      <span>{label}</span>
      <strong>{value ?? "-"}</strong>
    </div>
  );
}

function NoteBlock({ title, value }: { title: string; value?: string | null }) {
  return (
    <div className="inspection-detail-note">
      <strong>{title}</strong>
      <div>{value?.trim() ? value : "-"}</div>
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
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `resoconto-${id}.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
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

  const groupedRatings = useMemo(() => {
    const groups: Record<string, InspectionRating[]> = {};
    for (const rating of report?.ratings || []) {
      (groups[rating.category] ||= []).push(rating);
    }
    return groups;
  }, [report]);

  if (loading) return <div className="container">Caricamento…</div>;
  if (!report) return <div className="container">Resoconto non trovato.</div>;

  const hasVisualRatings = (report.ratings?.length || 0) > 0;

  return (
    <div className="inspection-detail-page">
      <div className="inspection-report-heading">
        <div>
          <span className="dealer-profile-kicker">PERIZIA #{report.id}</span>
          <h1>{report.title || "Resoconto perizia"}</h1>
          <p className="muted">{report.car?.make} {report.car?.model} ({report.car?.year})</p>
        </div>
        <div className="inspection-form-actions">
          <button className="btn secondary" onClick={() => navigate("/inspector/report")}>Torna all'archivio</button>
          <button className="btn" onClick={downloadPdf}>Scarica PDF</button>
        </div>
      </div>

      <section className="card inspection-detail-card">
        {report.car?.coverUrl && <img src={report.car.coverUrl} alt="Auto periziata" className="inspection-detail-cover" />}
        <div className="card-body">
          <div className="inspection-detail-meta-grid">
            <div>
              <InfoRow label="Esito generale" value={report.overallStatus} />
              <InfoRow label="Targa" value={report.plate} />
              <InfoRow label="VIN" value={report.vin} />
              <InfoRow label="KM" value={report.km} />
              <InfoRow label="Data perizia" value={report.inspectionDate ? new Date(report.inspectionDate).toLocaleString("it-IT") : "-"} />
              <InfoRow label="Luogo" value={report.location} />
              <InfoRow label="Valore stimato" value={report.estimatedValue != null ? `${report.estimatedValue} €` : "-"} />
            </div>
            <div>
              <InfoRow label="Periziatore" value={report.inspectorUser?.name || "-"} />
              <InfoRow label="Email periziatore" value={report.inspectorUser?.email || "-"} />
              <InfoRow label="Auto" value={`${report.car?.make ?? ""} ${report.car?.model ?? ""}`} />
              <InfoRow label="Anno" value={report.car?.year} />
              <InfoRow label="Città auto" value={report.car?.city || "-"} />
              <InfoRow label="Creato il" value={new Date(report.createdAt).toLocaleString("it-IT")} />
            </div>
          </div>

          {hasVisualRatings ? (
            <div className="inspection-detail-ratings">
              <h2>Valutazione visuale</h2>
              <div className="inspection-detail-category-grid">
                {Object.entries(CATEGORY_LABELS).map(([category, label]) => {
                  const items = groupedRatings[category] || [];
                  if (!items.length) return null;
                  const average = Math.round((items.reduce((sum, item) => sum + item.score, 0) / items.length) * 10) / 10;
                  return (
                    <article className="inspection-detail-category" key={category}>
                      <div className="inspection-detail-category-head"><strong>{label}</strong><span>{average}/5</span></div>
                      {items.map((item) => (
                        <div className="inspection-detail-rating-row" key={item.id}>
                          <div><strong>{item.pointLabel}</strong><span>{item.score}/5 · {SCORE_LABELS[item.score]}</span></div>
                          {item.note && <p>{item.note}</p>}
                        </div>
                      ))}
                    </article>
                  );
                })}
              </div>
            </div>
          ) : (
            <div className="inspection-detail-legacy-grid">
              <NoteBlock title="Carrozzeria" value={report.bodyworkNotes} />
              <NoteBlock title="Interni" value={report.interiorNotes} />
              <NoteBlock title="Motore" value={report.engineNotes} />
              <NoteBlock title="Meccanica" value={report.mechanicsNotes} />
              <NoteBlock title="Pneumatici" value={report.tiresNotes} />
              <NoteBlock title="Elettronica" value={report.electronicsNotes} />
              <NoteBlock title="Test drive" value={report.testDriveNotes} />
              <NoteBlock title="Difetti riscontrati" value={report.defectsFound} />
            </div>
          )}

          <div className="inspection-detail-opinions">
            <NoteBlock title="Parere finale" value={report.finalOpinion} />
            {report.valuationOpinion && <NoteBlock title="Parere sulla valutazione dell'auto" value={report.valuationOpinion} />}
          </div>
        </div>
      </section>
    </div>
  );
}
