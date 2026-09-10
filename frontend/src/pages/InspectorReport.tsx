import React, { useEffect, useMemo, useState } from "react";
import { useAuth } from "@clerk/clerk-react";
import { useNavigate } from "react-router-dom";
import { http } from "../api";
import AscariPopup from "../components/AscariPopup";
import inspectionCarBlueprint from "../assets/inspection-car-blueprint.jpg";

type PendingRequest = {
  id: number;
  startAt: string;
  endAt: string;
  car?: {
    id: number;
    make: string;
    model: string;
    title: string;
    year: number;
    mileageKm?: number | null;
    coverUrl?: string | null;
    city?: string | null;
  };
  seller?: {
    id: string;
    name?: string | null;
    email?: string | null;
  };
};

type ReportCashout = {
  id: number;
  amountEur: number;
  currency: string;
  status: string;
  stripeTransferId?: string | null;
  paidAt?: string | null;
  createdAt: string;
};

type ArchiveReport = {
  id: number;
  title?: string | null;
  overallStatus?: string | null;
  plate?: string | null;
  km?: number | null;
  createdAt: string;
  cashout?: ReportCashout | null;
  car?: {
    id: number;
    make: string;
    model: string;
    year: number;
    coverUrl?: string | null;
  };
  inspectionRequest?: {
    id: number;
    startAt: string;
    endAt: string;
    status: string;
  };
};

type InspectionCategory =
  | "BODYWORK"
  | "INTERIOR"
  | "ENGINE"
  | "MECHANICS"
  | "TIRES"
  | "ELECTRONICS"
  | "TEST_DRIVE";

type Hotspot = {
  pointKey: string;
  pointLabel: string;
  category: InspectionCategory;
  x: number;
  y: number;
};

type PointRating = {
  score: number | null;
  note: string;
};

type FormState = {
  inspectionRequestId: string;
  title: string;
  overallStatus: string;
  plate: string;
  vin: string;
  km: string;
  inspectionDate: string;
  location: string;
  finalOpinion: string;
  valuationOpinion: string;
  estimatedValue: string;
};

type PopupState = {
  open: boolean;
  title?: string;
  message: string;
  variant?: "success" | "error" | "warning" | "info";
  confirmText?: string;
  cancelText?: string;
  loading?: boolean;
  onConfirm?: () => void;
};

const CATEGORY_LABELS: Record<InspectionCategory, string> = {
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

const HOTSPOTS: Hotspot[] = [
  { pointKey: "bodywork_front", pointLabel: "Frontale", category: "BODYWORK", x: 75, y: 37 },
  { pointKey: "bodywork_left", pointLabel: "Fiancata sinistra", category: "BODYWORK", x: 45, y: 38 },
  { pointKey: "bodywork_right", pointLabel: "Fiancata destra", category: "BODYWORK", x: 43, y: 68 },
  { pointKey: "bodywork_rear", pointLabel: "Posteriore", category: "BODYWORK", x: 80, y: 69 },
  { pointKey: "interior_cabin", pointLabel: "Abitacolo e interni", category: "INTERIOR", x: 38, y: 31 },
  { pointKey: "engine_main", pointLabel: "Motore", category: "ENGINE", x: 20, y: 37 },
  { pointKey: "mechanics_front", pointLabel: "Meccanica asse anteriore", category: "MECHANICS", x: 25, y: 51 },
  { pointKey: "mechanics_rear", pointLabel: "Meccanica asse posteriore", category: "MECHANICS", x: 57, y: 51 },
  { pointKey: "tires_front_left", pointLabel: "Pneumatico anteriore sinistro", category: "TIRES", x: 20, y: 45 },
  { pointKey: "tires_rear_left", pointLabel: "Pneumatico posteriore sinistro", category: "TIRES", x: 54, y: 45 },
  { pointKey: "tires_front_right", pointLabel: "Pneumatico anteriore destro", category: "TIRES", x: 54, y: 76 },
  { pointKey: "tires_rear_right", pointLabel: "Pneumatico posteriore destro", category: "TIRES", x: 20, y: 76 },
  { pointKey: "electronics_main", pointLabel: "Elettronica e strumentazione", category: "ELECTRONICS", x: 32, y: 35 },
  { pointKey: "test_drive", pointLabel: "Test drive", category: "TEST_DRIVE", x: 50, y: 56 },
];

const emptyForm: FormState = {
  inspectionRequestId: "",
  title: "",
  overallStatus: "",
  plate: "",
  vin: "",
  km: "",
  inspectionDate: "",
  location: "",
  finalOpinion: "",
  valuationOpinion: "",
  estimatedValue: "",
};

function emptyRatings(): Record<string, PointRating> {
  return Object.fromEntries(HOTSPOTS.map((point) => [point.pointKey, { score: null, note: "" }]));
}

function formatRange(startAt: string, endAt: string) {
  return `${new Date(startAt).toLocaleString("it-IT")} → ${new Date(endAt).toLocaleString("it-IT")}`;
}

function formatCashoutStatus(status?: string | null) {
  const normalized = String(status || "").toUpperCase();
  if (normalized === "PAID") return "Cashout pagato";
  if (normalized === "REQUESTED") return "Cashout richiesto";
  if (normalized === "FAILED") return "Cashout fallito";
  return "Cashout";
}

export default function InspectorReport() {
  const { getToken } = useAuth();
  const navigate = useNavigate();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [cashoutLoadingId, setCashoutLoadingId] = useState<number | null>(null);
  const [pending, setPending] = useState<PendingRequest[]>([]);
  const [archive, setArchive] = useState<ArchiveReport[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [selectedRequest, setSelectedRequest] = useState<PendingRequest | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [ratings, setRatings] = useState<Record<string, PointRating>>(emptyRatings);
  const [activePoint, setActivePoint] = useState<Hotspot | null>(null);
  const [pointDraft, setPointDraft] = useState<PointRating>({ score: null, note: "" });
  const [popup, setPopup] = useState<PopupState>({ open: false, message: "", variant: "info" });

  async function authHeaders() {
    const token = await getToken();
    if (!token) throw new Error("Token mancante");
    return { Authorization: `Bearer ${token}` };
  }

  async function loadAll() {
    const headers = await authHeaders();
    const [pendingRes, archiveRes] = await Promise.all([
      http.get("/inspection-reports/pending", { headers }),
      http.get("/inspection-reports/archive", { headers }),
    ]);
    setPending(pendingRes.data?.requests ?? []);
    setArchive(archiveRes.data?.reports ?? []);
  }

  useEffect(() => {
    (async () => {
      try {
        setLoading(true);
        await loadAll();
      } catch (e: any) {
        setPopup({
          open: true,
          title: "Errore caricamento",
          message: e?.response?.data?.error ?? e?.message ?? "Errore caricamento resoconti",
          variant: "error",
        });
      } finally {
        setLoading(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const completedPoints = useMemo(
    () => HOTSPOTS.filter((point) => ratings[point.pointKey]?.score != null).length,
    [ratings]
  );

  const categoryAverages = useMemo(() => {
    const result = {} as Record<InspectionCategory, number | null>;
    (Object.keys(CATEGORY_LABELS) as InspectionCategory[]).forEach((category) => {
      const categoryPoints = HOTSPOTS.filter((point) => point.category === category);
      const values = categoryPoints
        .map((point) => ratings[point.pointKey]?.score)
        .filter((score): score is number => typeof score === "number");
      result[category] = values.length
        ? Math.round((values.reduce((sum, score) => sum + score, 0) / values.length) * 10) / 10
        : null;
    });
    return result;
  }, [ratings]);

  const overallScore = useMemo(() => {
    const values = (Object.values(ratings) as PointRating[])
      .map((rating) => rating.score)
      .filter((score): score is number => typeof score === "number");
    if (!values.length) return null;
    return Math.round((values.reduce((sum, score) => sum + score, 0) / values.length) * 10) / 10;
  }, [ratings]);

  function openNewReport() {
    setShowForm(true);
    setSelectedRequest(null);
    setForm(emptyForm);
    setRatings(emptyRatings());
  }

  function selectRequest(request: PendingRequest) {
    setSelectedRequest(request);
    setRatings(emptyRatings());
    setForm({
      ...emptyForm,
      inspectionRequestId: String(request.id),
      title: `Resoconto ${request.car?.make ?? ""} ${request.car?.model ?? ""} ${request.car?.year ?? ""}`.trim(),
      km: request.car?.mileageKm != null ? String(request.car.mileageKm) : "",
      inspectionDate: new Date().toISOString().slice(0, 16),
      location: request.car?.city ?? "",
    });
  }

  function updateField<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function openPoint(point: Hotspot) {
    setActivePoint(point);
    setPointDraft(ratings[point.pointKey] || { score: null, note: "" });
  }

  function savePoint() {
    if (!activePoint || pointDraft.score == null) return;
    setRatings((prev) => ({ ...prev, [activePoint.pointKey]: pointDraft }));
    setActivePoint(null);
  }

  async function downloadPdf(reportId: number, showSuccessPopup = false) {
    try {
      const headers = await authHeaders();
      const response = await http.get(`/inspection-reports/${reportId}/pdf`, {
        headers,
        responseType: "blob",
      });
      const blob = new Blob([response.data], { type: "application/pdf" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `resoconto-${reportId}.pdf`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
      if (showSuccessPopup) {
        setPopup({ open: true, title: "PDF generato", message: "Il PDF della perizia è pronto.", variant: "success" });
      }
    } catch (e: any) {
      setPopup({
        open: true,
        title: "Errore PDF",
        message: e?.response?.data?.error ?? e?.message ?? "Errore generazione PDF",
        variant: "error",
      });
    }
  }

  async function saveReport(e: React.FormEvent) {
    e.preventDefault();
    if (!form.inspectionRequestId) {
      setPopup({ open: true, title: "Perizia mancante", message: "Seleziona una perizia prima di salvare.", variant: "warning" });
      return;
    }
    if (completedPoints !== HOTSPOTS.length) {
      setPopup({
        open: true,
        title: "Perizia incompleta",
        message: `Valuta tutti i punti dell'auto. Completati ${completedPoints}/${HOTSPOTS.length}.`,
        variant: "warning",
      });
      return;
    }
    if (!form.finalOpinion.trim()) {
      setPopup({ open: true, title: "Parere finale mancante", message: "Inserisci il parere finale prima di salvare.", variant: "warning" });
      return;
    }

    try {
      setSaving(true);
      const headers = await authHeaders();
      const payloadRatings = HOTSPOTS.map((point) => ({
        pointKey: point.pointKey,
        pointLabel: point.pointLabel,
        category: point.category,
        score: ratings[point.pointKey].score,
        note: ratings[point.pointKey].note.trim() || null,
      }));

      const { data } = await http.post(
        "/inspection-reports",
        {
          ...form,
          overallStatus: overallScore != null ? `${overallScore}/5` : null,
          km: form.km ? Number(form.km) : null,
          estimatedValue: form.estimatedValue ? Number(form.estimatedValue) : null,
          ratings: payloadRatings,
        },
        { headers }
      );

      const reportId = data?.report?.id;
      if (!reportId) throw new Error("Resoconto creato ma ID non ricevuto");
      await downloadPdf(reportId, false);
      setShowForm(false);
      setSelectedRequest(null);
      setForm(emptyForm);
      setRatings(emptyRatings());
      await loadAll();
      setPopup({
        open: true,
        title: "Resoconto salvato",
        message: "La perizia visuale è stata salvata e il PDF è stato generato.",
        variant: "success",
      });
    } catch (e: any) {
      setPopup({
        open: true,
        title: "Errore salvataggio",
        message: e?.response?.data?.error ?? e?.message ?? "Errore salvataggio resoconto",
        variant: "error",
      });
    } finally {
      setSaving(false);
    }
  }

  function deleteReport(reportId: number) {
    setPopup({
      open: true,
      title: "Eliminare resoconto?",
      message: "La perizia tornerà confermata e l'auto non risulterà più periziata.",
      variant: "warning",
      confirmText: deleting ? "Eliminazione..." : "Elimina",
      cancelText: "Annulla",
      onConfirm: async () => {
        try {
          setDeleting(true);
          const headers = await authHeaders();
          await http.delete(`/inspection-reports/${reportId}`, { headers });
          await loadAll();
          setDeleting(false);
          setPopup({ open: true, title: "Resoconto eliminato", message: "Il resoconto è stato eliminato.", variant: "success" });
        } catch (e: any) {
          setDeleting(false);
          setPopup({ open: true, title: "Errore eliminazione", message: e?.response?.data?.error ?? e?.message ?? "Errore eliminazione", variant: "error" });
        }
      },
    });
  }

  async function requestCashout(reportId: number) {
    try {
      setCashoutLoadingId(reportId);
      const headers = await authHeaders();
      const { data } = await http.post(`/stripe/inspection-reports/${reportId}/cashout`, {}, { headers });
      await loadAll();
      setPopup({
        open: true,
        title: data?.alreadyRequested ? "Cashout già richiesto" : "Cashout inviato",
        message: data?.message || "Richiesta cashout inviata.",
        variant: "success",
      });
    } catch (e: any) {
      const data = e?.response?.data;
      if (data?.needsOnboarding && data?.accountLinkUrl) {
        setPopup({
          open: true,
          title: "Completa i dati di pagamento",
          message: data?.message || "Completa i dati Stripe per ricevere il cashout.",
          variant: "warning",
          confirmText: "Vai a Stripe",
          cancelText: "Chiudi",
          onConfirm: () => { window.location.href = data.accountLinkUrl; },
        });
      } else {
        setPopup({ open: true, title: "Errore cashout", message: data?.error ?? e?.message ?? "Errore richiesta cashout", variant: "error" });
      }
    } finally {
      setCashoutLoadingId(null);
    }
  }

  if (loading) return <div className="container">Caricamento resoconti…</div>;

  return (
    <div className="inspector-report-page">
      <div className="inspector-report-heading">
        <div>
          <span className="dealer-profile-kicker">ASCARI PERIZIE</span>
          <h1>Resoconto</h1>
          <p className="muted">Valuta ogni area direttamente sullo schema dell'auto con un punteggio da 1 a 5.</p>
        </div>
        <button className="btn" type="button" onClick={openNewReport}>Nuovo resoconto</button>
      </div>

      {showForm && (
        <section className="card inspection-visual-card">
          <div className="card-body">
            <h2>Nuovo resoconto</h2>
            {!selectedRequest ? (
              <div className="inspection-request-picker">
                <p className="muted">Seleziona una perizia confermata.</p>
                {pending.length === 0 ? (
                  <p>Nessuna perizia confermata in attesa di resoconto.</p>
                ) : (
                  <div className="inspection-request-grid">
                    {pending.map((request) => (
                      <button className="inspection-request-card" type="button" key={request.id} onClick={() => selectRequest(request)}>
                        <strong>{request.car?.make} {request.car?.model} ({request.car?.year})</strong>
                        <span>{request.car?.title}</span>
                        <small>{formatRange(request.startAt, request.endAt)}</small>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            ) : (
              <form onSubmit={saveReport} className="inspection-visual-form">
                <div className="inspection-selected-car">
                  <div>
                    <span>Perizia selezionata</span>
                    <strong>{selectedRequest.car?.make} {selectedRequest.car?.model} ({selectedRequest.car?.year})</strong>
                  </div>
                  <button type="button" className="btn secondary" onClick={() => setSelectedRequest(null)}>Cambia</button>
                </div>

                <div className="inspection-meta-grid">
                  <input className="input" value={form.title} onChange={(e) => updateField("title", e.target.value)} placeholder="Titolo resoconto" />
                  <input className="input" value={form.plate} onChange={(e) => updateField("plate", e.target.value)} placeholder="Targa" />
                  <input className="input" value={form.vin} onChange={(e) => updateField("vin", e.target.value)} placeholder="VIN" />
                  <input className="input" type="number" value={form.km} onChange={(e) => updateField("km", e.target.value)} placeholder="Km" />
                  <input className="input" type="datetime-local" value={form.inspectionDate} onChange={(e) => updateField("inspectionDate", e.target.value)} />
                  <input className="input" value={form.location} onChange={(e) => updateField("location", e.target.value)} placeholder="Luogo" />
                </div>

                <div className="inspection-score-legend">
                  {[1, 2, 3, 4, 5].map((score) => (
                    <div key={score}><strong>{score}</strong><span>{SCORE_LABELS[score]}</span></div>
                  ))}
                </div>

                <div className="inspection-visual-layout">
                  <div className="inspection-car-map-wrap">
                    <div className="inspection-car-progress">
                      <strong>{completedPoints}/{HOTSPOTS.length} punti</strong>
                      <span>{overallScore != null ? `Media ${overallScore}/5` : "Completa i punti"}</span>
                    </div>
                    <div className="inspection-car-map">
                      <img src={inspectionCarBlueprint} alt="Schema automobile per perizia" />
                      {HOTSPOTS.map((point, index) => {
                        const score = ratings[point.pointKey]?.score;
                        return (
                          <button
                            key={point.pointKey}
                            type="button"
                            className={`inspection-hotspot ${score != null ? "completed" : ""}`}
                            style={{ left: `${point.x}%`, top: `${point.y}%` }}
                            onClick={() => openPoint(point)}
                            title={`${point.pointLabel}${score ? ` - ${score}/5` : ""}`}
                          >
                            {score ?? index + 1}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  <aside className="inspection-category-panel">
                    {(Object.keys(CATEGORY_LABELS) as InspectionCategory[]).map((category) => {
                      const points = HOTSPOTS.filter((point) => point.category === category);
                      const done = points.filter((point) => ratings[point.pointKey]?.score != null).length;
                      return (
                        <div className="inspection-category-card" key={category}>
                          <div><strong>{CATEGORY_LABELS[category]}</strong><span>{done}/{points.length}</span></div>
                          <small>Media {categoryAverages[category] ?? "—"}/5</small>
                        </div>
                      );
                    })}
                  </aside>
                </div>

                <div className="inspection-final-grid">
                  <label>
                    <span>Parere finale *</span>
                    <textarea className="input" rows={5} value={form.finalOpinion} onChange={(e) => updateField("finalOpinion", e.target.value)} placeholder="Conclusione generale della perizia..." required />
                  </label>
                  <label>
                    <span>Parere sulla valutazione dell'auto (facoltativo)</span>
                    <textarea className="input" rows={5} value={form.valuationOpinion} onChange={(e) => updateField("valuationOpinion", e.target.value)} placeholder="Commento sul valore economico, mercato, eventuali interventi..." />
                  </label>
                  <label>
                    <span>Valore stimato € (facoltativo)</span>
                    <input className="input" type="number" min={0} value={form.estimatedValue} onChange={(e) => updateField("estimatedValue", e.target.value)} placeholder="Es. 32000" />
                  </label>
                </div>

                <div className="inspection-form-actions">
                  <button className="btn" type="submit" disabled={saving}>{saving ? "Salvataggio…" : "Salva e genera PDF"}</button>
                  <button className="btn secondary" type="button" disabled={saving} onClick={() => { setShowForm(false); setSelectedRequest(null); }}>Annulla</button>
                </div>
              </form>
            )}
          </div>
        </section>
      )}

      <section className="inspection-archive-section">
        <div className="inspection-archive-heading">
          <h2>Archivio resoconti</h2>
          <span className="tag">{archive.length}</span>
        </div>
        {archive.length === 0 ? (
          <div className="card"><div className="card-body muted">Nessun resoconto archiviato.</div></div>
        ) : (
          <div className="grid inspection-archive-grid">
            {archive.map((report) => (
              <article className="card" key={report.id}>
                {report.car?.coverUrl && <img src={report.car.coverUrl} className="card-image" alt="Auto" />}
                <div className="card-body">
                  <span className="tag">#{report.id}</span>
                  <h3>{report.title || `${report.car?.make ?? ""} ${report.car?.model ?? ""}`}</h3>
                  <p className="muted">{new Date(report.createdAt).toLocaleString("it-IT")}</p>
                  {report.overallStatus && <p><strong>Valutazione:</strong> {report.overallStatus}</p>}
                  {report.cashout && <p className="muted">{formatCashoutStatus(report.cashout.status)}</p>}
                  <div className="card-actions">
                    <button className="btn" type="button" onClick={() => navigate(`/inspector/report/${report.id}`)}>Dettaglio</button>
                    <button className="btn secondary" type="button" onClick={() => downloadPdf(report.id, true)}>PDF</button>
                    {!report.cashout && (
                      <button className="btn secondary" type="button" disabled={cashoutLoadingId === report.id} onClick={() => requestCashout(report.id)}>
                        {cashoutLoadingId === report.id ? "Richiesta…" : "Richiedi cashout"}
                      </button>
                    )}
                    {!report.cashout && <button className="btn danger" type="button" onClick={() => deleteReport(report.id)}>Elimina</button>}
                  </div>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>

      {activePoint && (
        <div className="ascari-modal inspection-point-modal" onClick={() => setActivePoint(null)}>
          <div className="inspection-point-dialog" onClick={(event) => event.stopPropagation()}>
            <span className="dealer-profile-kicker">{CATEGORY_LABELS[activePoint.category]}</span>
            <h2>{activePoint.pointLabel}</h2>
            <p className="muted">Assegna un voto e aggiungi, se serve, una nota tecnica.</p>
            <div className="inspection-score-buttons">
              {[1, 2, 3, 4, 5].map((score) => (
                <button
                  type="button"
                  key={score}
                  className={pointDraft.score === score ? "selected" : ""}
                  onClick={() => setPointDraft((prev) => ({ ...prev, score }))}
                >
                  <strong>{score}</strong><span>{SCORE_LABELS[score]}</span>
                </button>
              ))}
            </div>
            <label className="inspection-point-note">
              <span>Nota del periziatore</span>
              <textarea className="input" rows={4} maxLength={1500} value={pointDraft.note} onChange={(e) => setPointDraft((prev) => ({ ...prev, note: e.target.value }))} placeholder="Es. graffio superficiale, usura irregolare, rumore in marcia..." />
            </label>
            <div className="inspection-form-actions">
              <button className="btn" type="button" disabled={pointDraft.score == null} onClick={savePoint}>Salva punto</button>
              <button className="btn secondary" type="button" onClick={() => setActivePoint(null)}>Annulla</button>
            </div>
          </div>
        </div>
      )}

      {popup.open && (
        <AscariPopup
          title={popup.title}
          message={popup.message}
          variant={popup.variant}
          confirmText={popup.confirmText}
          cancelText={popup.cancelText}
          loading={popup.loading}
          onConfirm={popup.onConfirm}
          onCancel={popup.onConfirm ? () => setPopup({ open: false, message: "", variant: "info" }) : undefined}
          onClose={() => setPopup({ open: false, message: "", variant: "info" })}
        />
      )}
    </div>
  );
}
