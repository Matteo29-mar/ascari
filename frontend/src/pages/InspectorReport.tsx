import React, { useEffect, useState } from "react";
import { useAuth } from "@clerk/clerk-react";
import { http } from "../api";
import { useNavigate } from "react-router-dom";
import AscariPopup from "../components/AscariPopup";

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

type ArchiveReport = {
  id: number;
  title?: string | null;
  overallStatus?: string | null;
  plate?: string | null;
  km?: number | null;
  createdAt: string;
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

type FormState = {
  inspectionRequestId: string;
  title: string;
  overallStatus: string;
  plate: string;
  vin: string;
  km: string;
  inspectionDate: string;
  location: string;
  bodyworkNotes: string;
  interiorNotes: string;
  engineNotes: string;
  mechanicsNotes: string;
  tiresNotes: string;
  electronicsNotes: string;
  testDriveNotes: string;
  defectsFound: string;
  finalOpinion: string;
  estimatedValue: string;
};

type PopupState = {
  open: boolean;
  title?: string;
  message: string;
  variant?: "success" | "error" | "warning" | "info";
  confirmText?: string;
  cancelText?: string;
  onConfirm?: () => void;
};

const emptyForm: FormState = {
  inspectionRequestId: "",
  title: "",
  overallStatus: "",
  plate: "",
  vin: "",
  km: "",
  inspectionDate: "",
  location: "",
  bodyworkNotes: "",
  interiorNotes: "",
  engineNotes: "",
  mechanicsNotes: "",
  tiresNotes: "",
  electronicsNotes: "",
  testDriveNotes: "",
  defectsFound: "",
  finalOpinion: "",
  estimatedValue: "",
};

function formatRange(startAt: string, endAt: string) {
  return `${new Date(startAt).toLocaleString()} → ${new Date(endAt).toLocaleString()}`;
}

export default function InspectorReport() {
  const { getToken } = useAuth();
  const navigate = useNavigate();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const [pending, setPending] = useState<PendingRequest[]>([]);
  const [archive, setArchive] = useState<ArchiveReport[]>([]);

  const [showForm, setShowForm] = useState(false);
  const [selectedRequest, setSelectedRequest] = useState<PendingRequest | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm);

  const [popup, setPopup] = useState<PopupState>({
    open: false,
    message: "",
    variant: "info",
  });

  async function authHeaders() {
    const token = await getToken();
    if (!token) throw new Error("Token mancante");
    return { Authorization: `Bearer ${token}` };
  }

  function openPopup(next: PopupState) {
    setPopup(next);
  }

  function closePopup() {
    setPopup({
      open: false,
      message: "",
      variant: "info",
    });
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
        openPopup({
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

  function openNewReport() {
    setShowForm(true);
    setSelectedRequest(null);
    setForm(emptyForm);
  }

  function selectRequest(r: PendingRequest) {
    setSelectedRequest(r);
    setForm({
      ...emptyForm,
      inspectionRequestId: String(r.id),
      title: `Resoconto ${r.car?.make ?? ""} ${r.car?.model ?? ""} ${r.car?.year ?? ""}`.trim(),
      km: r.car?.mileageKm != null ? String(r.car.mileageKm) : "",
      inspectionDate: new Date().toISOString().slice(0, 16),
      location: r.car?.city ?? "",
    });
  }

  function updateField<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  async function saveReport(e: React.FormEvent) {
    e.preventDefault();

    if (!form.inspectionRequestId) {
      openPopup({
        open: true,
        title: "Perizia mancante",
        message: "Seleziona una perizia prima di salvare il resoconto.",
        variant: "warning",
      });
      return;
    }

    try {
      setSaving(true);

      const headers = await authHeaders();

      const { data } = await http.post(
        "/inspection-reports",
        {
          ...form,
          km: form.km ? Number(form.km) : null,
          estimatedValue: form.estimatedValue ? Number(form.estimatedValue) : null,
        },
        { headers }
      );

      const reportId = data?.report?.id;
      if (!reportId) throw new Error("Resoconto creato ma ID non ricevuto");

      await downloadPdf(reportId, false);

      setShowForm(false);
      setSelectedRequest(null);
      setForm(emptyForm);

      await loadAll();

      openPopup({
        open: true,
        title: "Resoconto salvato",
        message: "Il resoconto è stato salvato correttamente e il PDF è stato generato.",
        variant: "success",
      });
    } catch (e: any) {
      openPopup({
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
    openPopup({
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
          closePopup();

          openPopup({
            open: true,
            title: "Resoconto eliminato",
            message: "Il resoconto è stato eliminato correttamente.",
            variant: "success",
          });
        } catch (e: any) {
          setDeleting(false);
          closePopup();

          openPopup({
            open: true,
            title: "Errore eliminazione",
            message: e?.response?.data?.error ?? e?.message ?? "Errore eliminazione resoconto",
            variant: "error",
          });
        }
      },
    });
  }

  async function downloadPdf(reportId: number, showSuccessPopup = false) {
    try {
      const headers = await authHeaders();

      const response = await http.get(`/inspection-reports/${reportId}/pdf`, {
        headers,
        responseType: "blob",
      });

      const blob = new Blob([response.data], { type: "application/pdf" });
      const url = window.URL.createObjectURL(blob);

      const a = document.createElement("a");
      a.href = url;
      a.download = `resoconto-${reportId}.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();

      window.URL.revokeObjectURL(url);

      if (showSuccessPopup) {
        openPopup({
          open: true,
          title: "PDF scaricato",
          message: "Il PDF è stato scaricato correttamente.",
          variant: "success",
        });
      }
    } catch (e: any) {
      openPopup({
        open: true,
        title: "Errore download",
        message: e?.response?.data?.error ?? e?.message ?? "Errore download PDF",
        variant: "error",
      });
    }
  }

  return (
    <div style={{ paddingTop: 18 }}>
      {popup.open && (
        <AscariPopup
          title={popup.title}
          message={popup.message}
          variant={popup.variant}
          confirmText={popup.confirmText}
          cancelText={popup.cancelText}
          loading={deleting}
          onConfirm={popup.onConfirm}
          onCancel={closePopup}
          onClose={closePopup}
        />
      )}

      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          gap: 12,
          flexWrap: "wrap",
        }}
      >
        <div>
          <h1>Resoconto</h1>
          <p>Compila e archivia i resoconti delle perizie completate.</p>
        </div>

        <button className="btn" onClick={openNewReport}>
          Nuovo resoconto
        </button>
      </div>

      {loading && <p style={{ marginTop: 20 }}>Caricamento...</p>}

      {showForm && (
        <div
          style={{
            marginTop: 24,
            border: "1px solid rgba(255,255,255,0.12)",
            borderRadius: 12,
            padding: 16,
            background: "rgba(255,255,255,0.03)",
          }}
        >
          <h2>Nuovo resoconto</h2>

          {!selectedRequest ? (
            <>
              <p>Seleziona una perizia confermata da completare.</p>

              {pending.length === 0 ? (
                <p>Nessuna perizia disponibile.</p>
              ) : (
                <div style={{ display: "grid", gap: 12, marginTop: 12 }}>
                  {pending.map((r) => (
                    <div
                      key={r.id}
                      onClick={() => selectRequest(r)}
                      style={{
                        border: "1px solid rgba(255,255,255,0.12)",
                        borderRadius: 12,
                        padding: 12,
                        background: "rgba(255,255,255,0.02)",
                        cursor: "pointer",
                      }}
                    >
                      <div style={{ fontWeight: 700 }}>
                        {r.car ? `${r.car.make} ${r.car.model} (${r.car.year})` : "Auto"}
                      </div>
                      <div style={{ opacity: 0.85, marginTop: 4 }}>
                        {formatRange(r.startAt, r.endAt)}
                      </div>
                      <div style={{ opacity: 0.75, marginTop: 4 }}>
                        Cliente: {r.seller?.name ?? "—"} {r.seller?.email ? `(${r.seller.email})` : ""}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </>
          ) : (
            <form onSubmit={saveReport} style={{ display: "grid", gap: 12, marginTop: 12 }}>
              <div style={{ opacity: 0.9 }}>
                <b>Perizia selezionata:</b>{" "}
                {selectedRequest.car?.make} {selectedRequest.car?.model} ({selectedRequest.car?.year})
              </div>

              <input
                className="input"
                placeholder="Titolo resoconto"
                value={form.title}
                onChange={(e) => updateField("title", e.target.value)}
              />

              <select
                className="input"
                value={form.overallStatus}
                onChange={(e) => updateField("overallStatus", e.target.value)}
              >
                <option value="">Esito generale</option>
                <option value="OTTIMO">OTTIMO</option>
                <option value="BUONO">BUONO</option>
                <option value="DISCRETO">DISCRETO</option>
                <option value="SCARSO">SCARSO</option>
              </select>

              <div style={{ display: "grid", gap: 12, gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))" }}>
                <input
                  className="input"
                  placeholder="Targa"
                  value={form.plate}
                  onChange={(e) => updateField("plate", e.target.value)}
                />
                <input
                  className="input"
                  placeholder="VIN"
                  value={form.vin}
                  onChange={(e) => updateField("vin", e.target.value)}
                />
                <input
                  className="input"
                  placeholder="KM"
                  value={form.km}
                  onChange={(e) => updateField("km", e.target.value)}
                />
                <input
                  className="input"
                  type="datetime-local"
                  value={form.inspectionDate}
                  onChange={(e) => updateField("inspectionDate", e.target.value)}
                />
                <input
                  className="input"
                  placeholder="Luogo"
                  value={form.location}
                  onChange={(e) => updateField("location", e.target.value)}
                />
                <input
                  className="input"
                  placeholder="Valore stimato (€)"
                  value={form.estimatedValue}
                  onChange={(e) => updateField("estimatedValue", e.target.value)}
                />
              </div>

              <textarea
                className="input"
                placeholder="Note carrozzeria"
                value={form.bodyworkNotes}
                onChange={(e) => updateField("bodyworkNotes", e.target.value)}
                rows={4}
              />
              <textarea
                className="input"
                placeholder="Note interni"
                value={form.interiorNotes}
                onChange={(e) => updateField("interiorNotes", e.target.value)}
                rows={4}
              />
              <textarea
                className="input"
                placeholder="Note motore"
                value={form.engineNotes}
                onChange={(e) => updateField("engineNotes", e.target.value)}
                rows={4}
              />
              <textarea
                className="input"
                placeholder="Note meccanica"
                value={form.mechanicsNotes}
                onChange={(e) => updateField("mechanicsNotes", e.target.value)}
                rows={4}
              />
              <textarea
                className="input"
                placeholder="Note pneumatici"
                value={form.tiresNotes}
                onChange={(e) => updateField("tiresNotes", e.target.value)}
                rows={4}
              />
              <textarea
                className="input"
                placeholder="Note elettronica"
                value={form.electronicsNotes}
                onChange={(e) => updateField("electronicsNotes", e.target.value)}
                rows={4}
              />
              <textarea
                className="input"
                placeholder="Note test drive"
                value={form.testDriveNotes}
                onChange={(e) => updateField("testDriveNotes", e.target.value)}
                rows={4}
              />
              <textarea
                className="input"
                placeholder="Difetti riscontrati"
                value={form.defectsFound}
                onChange={(e) => updateField("defectsFound", e.target.value)}
                rows={4}
              />
              <textarea
                className="input"
                placeholder="Parere finale"
                value={form.finalOpinion}
                onChange={(e) => updateField("finalOpinion", e.target.value)}
                rows={5}
              />

              <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                <button className="btn" type="submit" disabled={saving}>
                  {saving ? "Salvataggio..." : "Salva e genera PDF"}
                </button>

                <button
                  type="button"
                  className="btn secondary"
                  onClick={() => {
                    setShowForm(false);
                    setSelectedRequest(null);
                    setForm(emptyForm);
                  }}
                >
                  Annulla
                </button>
              </div>
            </form>
          )}
        </div>
      )}

      <h2 style={{ marginTop: 28 }}>Archivio resoconti</h2>

      {!loading && archive.length === 0 && <p>Nessun resoconto presente.</p>}

      <div style={{ display: "grid", gap: 12, marginTop: 12 }}>
        {archive.map((r) => (
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
                  {r.car ? `${r.car.make} ${r.car.model} (${r.car.year})` : "Resoconto"}
                </div>

                <div style={{ opacity: 0.85, marginTop: 4 }}>
                  {r.title || "Resoconto perizia"}
                </div>

                <div style={{ opacity: 0.75, marginTop: 4 }}>
                  Esito: <b>{r.overallStatus || "-"}</b> • Targa: <b>{r.plate || "-"}</b> • KM: <b>{r.km ?? "-"}</b>
                </div>

                <div style={{ opacity: 0.7, marginTop: 4 }}>
                  Creato il {new Date(r.createdAt).toLocaleString("it-IT")}
                </div>

                <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 10 }}>
                  <button className="btn" onClick={() => downloadPdf(r.id, true)}>
                    Scarica PDF
                  </button>

                  <button
                    className="btn secondary"
                    onClick={() => navigate(`/inspector/report/${r.id}`)}
                  >
                    Visualizza
                  </button>

                  <button className="btn secondary" onClick={() => deleteReport(r.id)}>
                    Elimina
                  </button>
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}