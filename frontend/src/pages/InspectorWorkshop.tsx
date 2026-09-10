// frontend/src/pages/InspectorWorkshop.tsx
import React, { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { useAuth } from "@clerk/clerk-react";
import { http } from "../api";
import AscariPopup from "../components/AscariPopup";

import FullCalendar from "@fullcalendar/react";
import dayGridPlugin from "@fullcalendar/daygrid";
import timeGridPlugin from "@fullcalendar/timegrid";
import interactionPlugin from "@fullcalendar/interaction";

type InspectorProfile = {
  id: string;
  workshopName: string;
  workshopAddress?: string | null;
  logoUrl?: string | null;
  email: string;
  phone: string;
  city?: string | null;
  radiusKm: number;
  workStartMin: number;
  workEndMin: number;
  calendarConfirmedColor?: string;
};

type Slot = {
  id: number;
  startAt: string;
  endAt: string;
  isAvailable: boolean;
};

type InspectionRequest = {
  id: number;
  startAt: string;
  endAt: string;
  status: "PENDING" | "ASSIGNED" | "SEEN" | "CONFIRMED" | "DONE" | "CANCELLED";
  car?: { title?: string | null; make?: string | null; model?: string | null };
};

type AvailabilityMode = "hour" | "day" | "multi";

type PopupState = {
  open: boolean;
  title?: string;
  message: string;
  variant: "success" | "error" | "warning" | "info";
  confirmText?: string;
  cancelText?: string;
  loading?: boolean;
  onConfirm?: (() => void | Promise<void>) | null;
};

function minutesToHHMM(m: number) {
  const hh = String(Math.floor(m / 60)).padStart(2, "0");
  const mm = String(m % 60).padStart(2, "0");
  return `${hh}:${mm}`;
}

function hhmmToMinutes(v: string) {
  const [hh, mm] = v.split(":").map((x) => Number(x));
  return hh * 60 + mm;
}

function formatDateTime(value: string) {
  return new Date(value).toLocaleString("it-IT", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

const COLOR_PALETTE = [
  "#22c55e",
  "#06b6d4",
  "#3b82f6",
  "#a855f7",
  "#f59e0b",
  "#ef4444",
  "#f97316",
  "#14b8a6",
];

export default function InspectorWorkshop() {
  const { getToken } = useAuth();

  const [profile, setProfile] = useState<InspectorProfile | null>(null);
  const [slots, setSlots] = useState<Slot[]>([]);
  const [requests, setRequests] = useState<InspectionRequest[]>([]);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const [workshopName, setWorkshopName] = useState("");
  const [workshopAddress, setWorkshopAddress] = useState("");
  const [logoUrl, setLogoUrl] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [city, setCity] = useState("");
  const [radiusKm, setRadiusKm] = useState(70);
  const [workStart, setWorkStart] = useState("09:00");
  const [workEnd, setWorkEnd] = useState("18:00");
  const [confirmedColor, setConfirmedColor] = useState("#22c55e");

  const [slotModalOpen, setSlotModalOpen] = useState(false);
  const [selectedDay, setSelectedDay] = useState<Date | null>(null);
  const [modalStart, setModalStart] = useState("09:00");
  const [modalEnd, setModalEnd] = useState("10:00");
  const [multiEndDay, setMultiEndDay] = useState("");
  const [availabilityMode, setAvailabilityMode] = useState<AvailabilityMode>("hour");
  const [slotModalError, setSlotModalError] = useState<string | null>(null);

  const [popup, setPopup] = useState<PopupState>({
    open: false,
    message: "",
    variant: "info",
    confirmText: "OK",
    cancelText: "Annulla",
    loading: false,
    onConfirm: null,
  });

  async function authHeaders() {
    const token = await getToken();
    if (!token) throw new Error("Token mancante");
    return { Authorization: `Bearer ${token}` };
  }

  function closePopup() {
    setPopup((prev) => ({
      ...prev,
      open: false,
      loading: false,
      onConfirm: null,
    }));
  }

  function openSuccessPopup(message: string, title = "Operazione completata") {
    setPopup({
      open: true,
      title,
      message,
      variant: "success",
      confirmText: "OK",
      cancelText: "Annulla",
      loading: false,
      onConfirm: null,
    });
  }

  function openErrorPopup(message: string, title = "Errore") {
    setPopup({
      open: true,
      title,
      message,
      variant: "error",
      confirmText: "Chiudi",
      cancelText: "Annulla",
      loading: false,
      onConfirm: null,
    });
  }

  function openConfirmPopup(params: {
    title: string;
    message: string;
    variant?: "success" | "error" | "warning" | "info";
    confirmText?: string;
    cancelText?: string;
    onConfirm: () => void | Promise<void>;
  }) {
    setPopup({
      open: true,
      title: params.title,
      message: params.message,
      variant: params.variant ?? "warning",
      confirmText: params.confirmText ?? "Conferma",
      cancelText: params.cancelText ?? "Annulla",
      loading: false,
      onConfirm: params.onConfirm,
    });
  }

  async function loadAll() {
    setErr(null);
    setLoading(true);

    try {
      const headers = await authHeaders();

      const me = await http.get("/inspector/me", { headers });
      const p = me.data?.inspectorProfile as InspectorProfile | null;
      setProfile(p);

      if (p) {
        const ws = minutesToHHMM(p.workStartMin ?? 540);
        const we = minutesToHHMM(p.workEndMin ?? 1080);

        setWorkshopName(p.workshopName ?? "");
        setWorkshopAddress(p.workshopAddress ?? "");
        setLogoUrl(p.logoUrl ?? "");
        setEmail(p.email ?? "");
        setPhone(p.phone ?? "");
        setCity((p.city ?? "") as string);
        setRadiusKm(p.radiusKm ?? 70);
        setWorkStart(ws);
        setWorkEnd(we);
        setConfirmedColor(p.calendarConfirmedColor ?? "#22c55e");

        setModalStart(ws);
        const endCandidate = Math.min((p.workStartMin ?? 540) + 60, p.workEndMin ?? 1080);
        setModalEnd(minutesToHHMM(endCandidate));
      }

      const sl = await http.get("/inspector/slots", { headers });
      setSlots(sl.data?.slots ?? []);

      const rec = await http.get("/inspector/inspections/received", { headers });
      setRequests(rec.data?.requests ?? []);
    } catch (e: any) {
      setErr(e?.response?.data?.error ?? e?.message ?? "Errore");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function handleLogoFile(file?: File | null) {
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      openErrorPopup("Seleziona un file immagine valido.", "Logo non valido");
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      openErrorPopup("Il logo non può superare 5 MB.", "Logo troppo grande");
      return;
    }

    const reader = new FileReader();
    reader.onload = () => setLogoUrl(String(reader.result ?? ""));
    reader.onerror = () => openErrorPopup("Impossibile leggere il file selezionato.");
    reader.readAsDataURL(file);
  }

  async function saveProfile() {
    setErr(null);
    setSaving(true);

    try {
      const startMin = hhmmToMinutes(workStart);
      const endMin = hhmmToMinutes(workEnd);

      if (endMin <= startMin) {
        throw new Error("L'orario di fine deve essere maggiore dell'orario di inizio.");
      }

      const headers = await authHeaders();

      const payload = {
        workshopName,
        workshopAddress: workshopAddress || null,
        logoUrl: logoUrl || null,
        email,
        phone,
        city: city || null,
        radiusKm: Number(radiusKm),
        workStartMin: startMin,
        workEndMin: endMin,
        calendarConfirmedColor: confirmedColor,
      };

      const { data } = await http.put("/inspector/me", payload, { headers });
      if (!data?.ok) throw new Error("Salvataggio fallito");

      await loadAll();
      openSuccessPopup("I dati dell’officina sono stati salvati correttamente.");
    } catch (e: any) {
      const msg = e?.response?.data?.error ?? e?.message ?? "Errore";
      setErr(msg);
      openErrorPopup(msg, "Salvataggio non riuscito");
    } finally {
      setSaving(false);
    }
  }

  async function removeSlot(id: number) {
    setErr(null);

    try {
      setPopup((prev) => ({ ...prev, loading: true }));

      const headers = await authHeaders();
      const { data } = await http.delete(`/inspector/slots/${id}`, { headers });
      if (!data?.ok) throw new Error("Eliminazione fallita");

      await loadAll();

      setPopup({
        open: true,
        title: "Slot rimosso",
        message: "Lo slot è stato rimosso correttamente dal calendario.",
        variant: "success",
        confirmText: "OK",
        cancelText: "Annulla",
        loading: false,
        onConfirm: null,
      });
    } catch (e: any) {
      const msg = e?.response?.data?.error ?? e?.message ?? "Errore";
      setErr(msg);
      setPopup({
        open: true,
        title: "Errore rimozione slot",
        message: msg,
        variant: "error",
        confirmText: "Chiudi",
        cancelText: "Annulla",
        loading: false,
        onConfirm: null,
      });
    }
  }

  async function createSlotFromModal() {
    setErr(null);
    setSlotModalError(null);

    if (!selectedDay) return;

    try {
      const headers = await authHeaders();
      const ws = hhmmToMinutes(workStart);
      const we = hhmmToMinutes(workEnd);

      if (we <= ws) {
        setSlotModalError("Controlla prima l'orario di apertura e chiusura dell'officina.");
        return;
      }

      const makeRange = (day: Date, startHHMM: string, endHHMM: string) => {
        const [sh, sm] = startHHMM.split(":").map(Number);
        const [eh, em] = endHHMM.split(":").map(Number);
        const start = new Date(day);
        const end = new Date(day);
        start.setHours(sh, sm, 0, 0);
        end.setHours(eh, em, 0, 0);
        return { startAt: start.toISOString(), endAt: end.toISOString() };
      };

      let ranges: Array<{ startAt: string; endAt: string }> = [];

      if (availabilityMode === "hour") {
        const startMin = hhmmToMinutes(modalStart);
        const endMin = hhmmToMinutes(modalEnd);
        if (endMin <= startMin) {
          setSlotModalError("L'orario di fine deve essere maggiore dell'inizio.");
          return;
        }
        if (startMin < ws || endMin > we) {
          setSlotModalError(`Lo slot deve essere tra ${workStart} e ${workEnd}.`);
          return;
        }
        ranges = [makeRange(selectedDay, modalStart, modalEnd)];
      }else if (availabilityMode === "day") {
            ranges = [makeRange(selectedDay, workStart, workEnd)];
          } else if (availabilityMode === "multi") {
            if (!multiEndDay) {
              setSlotModalError("Seleziona il giorno finale.");
              return;
            }

            const startDay = new Date(selectedDay);
            startDay.setHours(0, 0, 0, 0);

            const [year, month, day] = multiEndDay.split("-").map(Number);

            const endDay = new Date(year, month - 1, day);
            endDay.setHours(0, 0, 0, 0);

            if (endDay < startDay) {
              setSlotModalError(
                "Il giorno finale non può essere precedente al giorno iniziale."
              );
              return;
            }

            const diffDays =
              Math.floor(
                (endDay.getTime() - startDay.getTime()) /
                  (1000 * 60 * 60 * 24)
              ) + 1;

            if (diffDays > 7) {
              setSlotModalError(
                "Puoi inserire al massimo 7 giorni consecutivi."
              );
              return;
            }

            ranges = Array.from({ length: diffDays }, (_, index) => {
              const current = new Date(startDay);
              current.setDate(startDay.getDate() + index);

              return makeRange(
                current,
                workStart,
                workEnd
              );
            });
          }

      const { data } = ranges.length === 1
        ? await http.post("/inspector/slots", ranges[0], { headers })
        : await http.post("/inspector/slots/bulk", { slots: ranges }, { headers });

      if (!data?.ok) throw new Error("Creazione disponibilità fallita");

      setSlotModalOpen(false);
      setSelectedDay(null);
      setSlotModalError(null);
      setAvailabilityMode("hour");
      await loadAll();

      const message = availabilityMode === "multi"
        ? "La settimana è stata impostata come disponibile negli orari di lavoro."
        : availabilityMode === "day"
          ? "La giornata è stata impostata come disponibile negli orari di lavoro."
          : "Lo slot di disponibilità è stato creato correttamente.";
      openSuccessPopup(message);
    } catch (e: any) {
      const msg = e?.response?.data?.error ?? e?.message ?? "Errore";
      setSlotModalError(msg);
    }
  }

  const sortedSlots = useMemo(() => {
    return [...slots].sort(
      (a, b) => new Date(a.startAt).getTime() - new Date(b.startAt).getTime()
    );
  }, [slots]);

  const availableSlots = useMemo(() => {
    return sortedSlots.filter((s) => s.isAvailable);
  }, [sortedSlots]);

  const occupiedSlots = useMemo(() => {
    return sortedSlots.filter((s) => !s.isAvailable);
  }, [sortedSlots]);

  const confirmedAppointments = useMemo(() => {
    return (requests ?? [])
      .filter((r) => r.status === "CONFIRMED")
      .sort((a, b) => new Date(a.startAt).getTime() - new Date(b.startAt).getTime());
  }, [requests]);

  const nextAppointment = confirmedAppointments[0];

  const events = useMemo(() => {
    const slotEvents = sortedSlots.map((s) => ({
      id: `slot-${s.id}`,
      title: s.isAvailable ? "Disponibile" : "Occupato",
      start: s.startAt,
      end: s.endAt,
      backgroundColor: s.isAvailable ? "rgba(78,242,200,0.16)" : "rgba(255,255,255,0.08)",
      borderColor: s.isAvailable ? "rgba(78,242,200,0.45)" : "rgba(255,255,255,0.16)",
      textColor: s.isAvailable ? "#b8fff1" : "#d4d9e2",
      extendedProps: { kind: "SLOT", slotId: s.id, isAvailable: s.isAvailable },
    }));

    const appointmentEvents = confirmedAppointments.map((r) => {
      const carTitle = r.car?.title || `${r.car?.make ?? ""} ${r.car?.model ?? ""}`.trim();

      return {
        id: `appt-${r.id}`,
        title: carTitle ? `Perizia • ${carTitle}` : "Perizia confermata",
        start: r.startAt,
        end: r.endAt,
        backgroundColor: confirmedColor,
        borderColor: confirmedColor,
        textColor: "#061018",
        extendedProps: { kind: "APPOINTMENT", inspectionId: r.id },
      };
    });

    return [...slotEvents, ...appointmentEvents];
  }, [sortedSlots, confirmedAppointments, confirmedColor]);

  if (loading) {
    return (
      <div className="inspector-workshop-page">
        <div className="inspector-workshop-loading">
          <div className="inspector-workshop-loader" />
          <div>
            <strong>Caricamento officina</strong>
            <span>Sto preparando calendario e disponibilità...</span>
          </div>
        </div>
      </div>
    );
  }

  return (
    <>
      <main className="inspector-workshop-page">
        <div className="inspector-workshop-bg inspector-workshop-bg-one" />
        <div className="inspector-workshop-bg inspector-workshop-bg-two" />

        <section className="inspector-workshop-hero">
          <div>
            <div className="inspector-workshop-kicker">
              <span />
              AREA PERIZIATORE
            </div>

            <h1>Mia officina</h1>

            <p>
              Gestisci i dati della tua officina, il raggio operativo e le disponibilità
              per ricevere nuove richieste di perizia su Ascari.
            </p>
          </div>

          <div className="inspector-workshop-hero-card">
            {logoUrl && (
              <div className="inspector-workshop-hero-logo">
                <img src={logoUrl} alt={`Logo ${workshopName || "officina"}`} />
              </div>
            )}
            <span>Stato profilo</span>
            <strong>{profile ? "Officina attiva" : "Profilo non configurato"}</strong>
            <p>
              {profile
                ? "Il tuo profilo è visibile nel sistema di matching Ascari."
                : "Completa i dati per rendere operativa la tua officina."}
            </p>
          </div>
        </section>

        {err && (
          <div className="inspector-workshop-alert">
            <strong>Attenzione</strong>
            <span>{err}</span>
          </div>
        )}

        <section className="inspector-workshop-stats">
          <div className="inspector-workshop-stat">
            <span>Slot disponibili</span>
            <strong>{availableSlots.length}</strong>
            <p>Fasce orarie aperte</p>
          </div>

          <div className="inspector-workshop-stat">
            <span>Appuntamenti</span>
            <strong>{confirmedAppointments.length}</strong>
            <p>Perizie confermate</p>
          </div>

          <div className="inspector-workshop-stat">
            <span>Raggio operativo</span>
            <strong>{radiusKm} km</strong>
            <p>Copertura territoriale</p>
          </div>

          <div className="inspector-workshop-stat">
            <span>Orario lavoro</span>
            <strong>
              {workStart} - {workEnd}
            </strong>
            <p>Finestra disponibilità</p>
          </div>
        </section>

        <section className="inspector-workshop-grid">
          <div className="inspector-workshop-card inspector-workshop-form-card">
            <div className="inspector-workshop-card-head">
              <div>
                <span className="inspector-workshop-card-badge">DATI OFFICINA</span>
                <h2>Profilo operativo</h2>
                <p>Aggiorna informazioni, contatti e preferenze di calendario.</p>
              </div>
            </div>

            <div className="inspector-workshop-form-grid">
              <label className="inspector-workshop-field">
                <span>Nome officina</span>
                <input
                  className="input inspector-workshop-input"
                  value={workshopName}
                  onChange={(e) => setWorkshopName(e.target.value)}
                  placeholder="Es. Officina Ascari"
                />
              </label>

              <label className="inspector-workshop-field">
                <span>Città</span>
                <input
                  className="input inspector-workshop-input"
                  value={city}
                  onChange={(e) => setCity(e.target.value)}
                  placeholder="Es. Milano"
                />
              </label>

              <label className="inspector-workshop-field inspector-workshop-field-full">
                <span>Indirizzo officina</span>
                <input
                  className="input inspector-workshop-input"
                  value={workshopAddress}
                  onChange={(e) => setWorkshopAddress(e.target.value)}
                  placeholder="Es. Via Roma 10"
                />
              </label>

              <div className="inspector-workshop-field inspector-workshop-field-full">
                <span>Logo officina / periziatore</span>
                <div className="inspector-workshop-logo-editor">
                  <div className="inspector-workshop-logo-preview">
                    {logoUrl ? (
                      <img src={logoUrl} alt="Anteprima logo officina" />
                    ) : (
                      <span>{(workshopName || "A").slice(0, 1).toUpperCase()}</span>
                    )}
                  </div>

                  <div className="inspector-workshop-logo-controls">
                    <label className="btn secondary inspector-workshop-logo-button">
                      Scegli logo
                      <input
                        type="file"
                        accept="image/png,image/jpeg,image/webp,image/gif"
                        onChange={(e) => handleLogoFile(e.target.files?.[0])}
                      />
                    </label>
                    {logoUrl && (
                      <button className="btn secondary" type="button" onClick={() => setLogoUrl("")}>
                        Rimuovi
                      </button>
                    )}
                    <small>PNG, JPG o WebP. Massimo 5 MB.</small>
                  </div>
                </div>
              </div>

              <label className="inspector-workshop-field">
                <span>Email</span>
                <input
                  className="input inspector-workshop-input"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="email@dominio.it"
                />
              </label>

              <label className="inspector-workshop-field">
                <span>Telefono</span>
                <input
                  className="input inspector-workshop-input"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="+39..."
                />
              </label>

              <label className="inspector-workshop-field">
                <span>Raggio operativo</span>
                <div className="inspector-workshop-radius">
                  <input
                    className="input inspector-workshop-input"
                    type="number"
                    min={5}
                    max={300}
                    value={radiusKm}
                    onChange={(e) => setRadiusKm(Number(e.target.value))}
                  />
                  <em>km</em>
                </div>
              </label>

              <div className="inspector-workshop-time-box">
                <label className="inspector-workshop-field">
                  <span>Inizio lavoro</span>
                  <input
                    className="input inspector-workshop-input"
                    type="time"
                    value={workStart}
                    onChange={(e) => setWorkStart(e.target.value)}
                  />
                </label>

                <label className="inspector-workshop-field">
                  <span>Fine lavoro</span>
                  <input
                    className="input inspector-workshop-input"
                    type="time"
                    value={workEnd}
                    onChange={(e) => setWorkEnd(e.target.value)}
                  />
                </label>
              </div>
            </div>

            <div className="inspector-workshop-color-box">
              <div>
                <strong>Colore appuntamenti confermati</strong>
                <span>Usato nel calendario per distinguere le perizie confermate.</span>
              </div>

              <div className="inspector-workshop-colors">
                {COLOR_PALETTE.map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setConfirmedColor(c)}
                    title={c}
                    className={confirmedColor === c ? "active" : ""}
                    style={{ background: c }}
                  />
                ))}

                <small>
                  Selezionato: <b>{confirmedColor}</b>
                </small>
              </div>
            </div>

            <div className="inspector-workshop-actions">
              <button className="btn inspector-workshop-save" onClick={saveProfile} disabled={saving}>
                {saving ? "Salvataggio..." : "Salva dati officina"}
              </button>
            </div>
          </div>

          <aside className="inspector-workshop-side">
            <div className="inspector-workshop-card inspector-workshop-next-card">
              <span className="inspector-workshop-card-badge">PROSSIMA PERIZIA</span>

              {nextAppointment ? (
                <>
                  <h3>
                    {nextAppointment.car?.title ||
                      `${nextAppointment.car?.make ?? ""} ${nextAppointment.car?.model ?? ""}`.trim() ||
                      "Auto da periziare"}
                  </h3>
                  <p>{formatDateTime(nextAppointment.startAt)}</p>
                </>
              ) : (
                <>
                  <h3>Nessuna perizia confermata</h3>
                  <p>Quando un cliente confermerà un appuntamento, lo vedrai qui.</p>
                </>
              )}
            </div>

            <div className="inspector-workshop-card inspector-workshop-mini-list">
              <div className="inspector-workshop-mini-head">
                <span className="inspector-workshop-card-badge">SLOT</span>
                <strong>{sortedSlots.length}</strong>
              </div>

              <div className="inspector-workshop-mini-row">
                <span>Disponibili</span>
                <b>{availableSlots.length}</b>
              </div>

              <div className="inspector-workshop-mini-row">
                <span>Occupati</span>
                <b>{occupiedSlots.length}</b>
              </div>

              <div className="inspector-workshop-mini-row">
                <span>Confermati</span>
                <b>{confirmedAppointments.length}</b>
              </div>
            </div>
          </aside>
        </section>

        <section className="inspector-workshop-card inspector-workshop-calendar-card">
          <div className="inspector-workshop-calendar-head">
            <div>
              <span className="inspector-workshop-card-badge">CALENDARIO</span>
              <h2>Disponibilità officina</h2>
              <p>
                Tocca un giorno e scegli se renderti disponibile per una fascia oraria,
                per l'intera giornata o per tutta la settimana. Le perizie occupano solo
                l'orario prenotato, lasciando libero il resto della disponibilità.
              </p>
            </div>

            <div className="inspector-workshop-legend">
              <span>
                <i className="legend-available" />
                Disponibile
              </span>
              <span>
                <i className="legend-confirmed" style={{ background: confirmedColor }} />
                Confermato
              </span>
            </div>
          </div>

          <div className="calendar-wrap inspector-workshop-calendar-wrap">
            <FullCalendar
              plugins={[dayGridPlugin, timeGridPlugin, interactionPlugin]}
              initialView="dayGridMonth"
              headerToolbar={{
                left: "prev,next today",
                center: "title",
                right: "dayGridMonth,timeGridWeek,timeGridDay",
              }}
              buttonText={{
                today: "Oggi",
                month: "Mese",
                multi: "Giorni",
                day: "Giorno",
              }}
              height="auto"
              events={events}
              dateClick={(info) => {
                setErr(null);
                setSlotModalError(null);
                setSelectedDay(info.date);
                const yyyy = info.date.getFullYear();
                const mm = String(info.date.getMonth() + 1).padStart(2, "0");
                const dd = String(info.date.getDate()).padStart(2, "0");

                setMultiEndDay(`${yyyy}-${mm}-${dd}`);

                const ws = workStart;
                const wsMin = hhmmToMinutes(ws);
                const weMin = hhmmToMinutes(workEnd);

                setModalStart(ws);
                setModalEnd(minutesToHHMM(Math.min(wsMin + 60, weMin)));
                setAvailabilityMode("hour");

                setSlotModalOpen(true);
              }}
              eventClick={async (clickInfo) => {
                const kind = clickInfo.event.extendedProps?.kind;

                if (kind !== "SLOT") return;

                const slotId = Number(clickInfo.event.extendedProps?.slotId);
                const isAvailable = Boolean(clickInfo.event.extendedProps?.isAvailable);
                if (!slotId || !isAvailable) return;

                openConfirmPopup({
                  title: "Rimuovere questo slot?",
                  message: "Lo slot selezionato verrà eliminato dal calendario disponibilità.",
                  variant: "warning",
                  confirmText: "Sì, rimuovi",
                  cancelText: "Annulla",
                  onConfirm: () => removeSlot(slotId),
                });
              }}
            />
          </div>

          <div className="inspector-workshop-tip">
            <strong>Suggerimento</strong>
            <span>
              Puoi creare una disponibilità ampia: quando viene prenotata una perizia, Ascari
              mantiene automaticamente disponibili le fasce prima e dopo l'appuntamento.
            </span>
          </div>
        </section>

        {slotModalOpen && createPortal(
          <div className="modal-backdrop inspector-workshop-modal-backdrop" role="dialog" aria-modal="true">
            <div className="modal-card inspector-workshop-modal-card">
              <div className="modal-title inspector-workshop-modal-title">
                <div>
                  <span className="inspector-workshop-card-badge">NUOVO SLOT</span>
                  <h3>Crea disponibilità</h3>
                </div>

                <button
                  className="icon-btn"
                  onClick={() => {
                    setSlotModalOpen(false);
                    setSelectedDay(null);
                    setErr(null);
                    setSlotModalError(null);
                  }}
                  aria-label="Chiudi"
                >
                  ✕
                </button>
              </div>

              <div className="inspector-workshop-selected-day">
                <span>Giorno selezionato</span>
                <strong>{selectedDay ? selectedDay.toLocaleDateString("it-IT") : ""}</strong>
              </div>

              <div className="inspector-workshop-availability-modes" role="group" aria-label="Modalità disponibilità">
                <button
                  type="button"
                  className={availabilityMode === "hour" ? "active" : ""}
                  onClick={() => setAvailabilityMode("hour")}
                >
                  Fascia oraria
                </button>
                <button
                  type="button"
                  className={availabilityMode === "day" ? "active" : ""}
                  onClick={() => setAvailabilityMode("day")}
                >
                  Giorno intero
                </button>
                <button
                  type="button"
                  className={availabilityMode === "multi" ? "active" : ""}
                  onClick={() => setAvailabilityMode("multi")}
                >
                  Più giorni
                </button>
              </div>

              {availabilityMode === "hour" ? (
                <div className="modal-grid inspector-workshop-modal-grid">
                  <label className="inspector-workshop-field">
                    <span>Inizio</span>
                    <input
                      className="input inspector-workshop-input"
                      type="time"
                      value={modalStart}
                      onChange={(e) => setModalStart(e.target.value)}
                    />
                  </label>

                  <label className="inspector-workshop-field">
                    <span>Fine</span>
                    <input
                      className="input inspector-workshop-input"
                      type="time"
                      value={modalEnd}
                      onChange={(e) => setModalEnd(e.target.value)}
                    />
                  </label>
                </div>
              ) : availabilityMode === "day" ? (
                <div className="inspector-workshop-mode-summary">
                  <strong>Disponibile tutto il giorno</strong>

                  <span>
                    {workStart} - {workEnd}
                  </span>

                  <small>
                    Le perizie confermate verranno sottratte automaticamente
                    da questa disponibilità.
                  </small>
                </div>
              ) : (
                <div className="inspector-workshop-mode-summary">

                  <strong>Disponibilità per più giorni</strong>

                  <div className="modal-grid inspector-workshop-modal-grid">

                    <label className="inspector-workshop-field">
                      <span>Da</span>

                      <input
                        className="input inspector-workshop-input"
                        type="date"
                        value={
                          selectedDay
                            ? `${selectedDay.getFullYear()}-${String(
                                selectedDay.getMonth() + 1
                              ).padStart(2, "0")}-${String(
                                selectedDay.getDate()
                              ).padStart(2, "0")}`
                            : ""
                        }
                        disabled
                      />
                    </label>

                    <label className="inspector-workshop-field">
                      <span>A</span>

                      <input
                        className="input inspector-workshop-input"
                        type="date"
                        value={multiEndDay}
                        onChange={(e) => setMultiEndDay(e.target.value)}
                      />
                    </label>

                  </div>

                  <span>
                    Orario: {workStart} - {workEnd}
                  </span>

                  <small>
                    Le perizie confermate verranno sottratte automaticamente
                    dalla disponibilità dei singoli giorni.
                  </small>

                </div>
              )}

              {slotModalError && (
                <div className="inspector-workshop-modal-error">{slotModalError}</div>
              )}

              <div className="modal-actions inspector-workshop-modal-actions">
                <button className="btn" type="button" onClick={createSlotFromModal}>
                  {availabilityMode === "hour" ? "Salva slot" : availabilityMode === "day" ? "Salva giornata" : "Salva settimana"}
                </button>

                <button
                  className="btn secondary"
                  type="button"
                  onClick={() => {
                    setSlotModalOpen(false);
                    setSelectedDay(null);
                    setErr(null);
                    setSlotModalError(null);
                  }}
                >
                  Annulla
                </button>
              </div>
            </div>
          </div>,
          document.body
        )}
      </main>

      {popup.open && (
        <AscariPopup
          title={popup.title}
          message={popup.message}
          variant={popup.variant}
          confirmText={popup.confirmText}
          cancelText={popup.cancelText}
          loading={popup.loading}
          onClose={closePopup}
          onCancel={closePopup}
          onConfirm={
            popup.onConfirm
              ? async () => {
                  await popup.onConfirm?.();
                }
              : undefined
          }
          closeOnBackdrop={!popup.loading}
        />
      )}
    </>
  );
}