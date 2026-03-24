import React, { useEffect, useMemo, useState } from "react";
import { useAuth } from "@clerk/clerk-react";
import { http } from "../api";

import FullCalendar from "@fullcalendar/react";
import dayGridPlugin from "@fullcalendar/daygrid";
import timeGridPlugin from "@fullcalendar/timegrid";
import interactionPlugin from "@fullcalendar/interaction";

type InspectorProfile = {
  id: string;
  workshopName: string;
  workshopAddress?: string | null;
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

function minutesToHHMM(m: number) {
  const hh = String(Math.floor(m / 60)).padStart(2, "0");
  const mm = String(m % 60).padStart(2, "0");
  return `${hh}:${mm}`;
}

function hhmmToMinutes(v: string) {
  const [hh, mm] = v.split(":").map((x) => Number(x));
  return hh * 60 + mm;
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

  async function authHeaders() {
    const token = await getToken();
    if (!token) throw new Error("Token mancante");
    return { Authorization: `Bearer ${token}` };
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

  async function saveProfile() {
    setErr(null);
    setSaving(true);
    try {
      const headers = await authHeaders();

      const payload = {
        workshopName,
        workshopAddress: workshopAddress || null,
        email,
        phone,
        city: city || null,
        radiusKm: Number(radiusKm),
        workStartMin: hhmmToMinutes(workStart),
        workEndMin: hhmmToMinutes(workEnd),
        calendarConfirmedColor: confirmedColor,
      };

      const { data } = await http.put("/inspector/me", payload, { headers });
      if (!data?.ok) throw new Error("Salvataggio fallito");

      await loadAll();
    } catch (e: any) {
      setErr(e?.response?.data?.error ?? e?.message ?? "Errore");
    } finally {
      setSaving(false);
    }
  }

  async function removeSlot(id: number) {
    setErr(null);
    try {
      const headers = await authHeaders();
      const { data } = await http.delete(`/inspector/slots/${id}`, { headers });
      if (!data?.ok) throw new Error("Eliminazione fallita");
      await loadAll();
    } catch (e: any) {
      setErr(e?.response?.data?.error ?? e?.message ?? "Errore");
    }
  }

  async function createSlotFromModal() {
    setErr(null);
    if (!selectedDay) return;

    try {
      const headers = await authHeaders();

      const [sh, sm] = modalStart.split(":").map(Number);
      const [eh, em] = modalEnd.split(":").map(Number);

      const start = new Date(selectedDay);
      start.setHours(sh, sm, 0, 0);

      const end = new Date(selectedDay);
      end.setHours(eh, em, 0, 0);

      if (end <= start) {
        setErr("L'orario di fine deve essere maggiore dell'inizio.");
        return;
      }

      const ws = hhmmToMinutes(workStart);
      const we = hhmmToMinutes(workEnd);
      const startMin = hhmmToMinutes(modalStart);
      const endMin = hhmmToMinutes(modalEnd);

      if (startMin < ws || endMin > we) {
        setErr(`Lo slot deve essere tra ${workStart} e ${workEnd}.`);
        return;
      }

      const { data } = await http.post(
        "/inspector/slots",
        { startAt: start.toISOString(), endAt: end.toISOString() },
        { headers }
      );

      if (!data?.ok) throw new Error("Creazione slot fallita");

      setSlotModalOpen(false);
      setSelectedDay(null);
      await loadAll();
    } catch (e: any) {
      setErr(e?.response?.data?.error ?? e?.message ?? "Errore");
    }
  }

  const sortedSlots = useMemo(() => {
    return [...slots].sort(
      (a, b) => new Date(a.startAt).getTime() - new Date(b.startAt).getTime()
    );
  }, [slots]);

  const confirmedAppointments = useMemo(() => {
    return (requests ?? [])
      .filter((r) => r.status === "CONFIRMED")
      .sort((a, b) => new Date(a.startAt).getTime() - new Date(b.startAt).getTime());
  }, [requests]);

  const events = useMemo(() => {
    const slotEvents = sortedSlots.map((s) => ({
      id: `slot-${s.id}`,
      title: s.isAvailable ? "Disponibile" : "Occupato",
      start: s.startAt,
      end: s.endAt,
      backgroundColor: "rgba(34,197,94,0.18)",
      borderColor: "rgba(34,197,94,0.35)",
      textColor: "#b8ffe9",
      extendedProps: { kind: "SLOT", slotId: s.id, isAvailable: s.isAvailable },
    }));

    const appointmentEvents = confirmedAppointments.map((r) => {
      const carTitle = r.car?.title || `${r.car?.make ?? ""} ${r.car?.model ?? ""}`.trim();
      return {
        id: `appt-${r.id}`,
        title: carTitle ? `Appuntamento • ${carTitle}` : "Appuntamento",
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

  if (loading) return <div style={{ paddingTop: 18 }}>Loading…</div>;

  return (
    <div style={{ paddingTop: 18, maxWidth: 980 }}>
      <h1>Mia officina</h1>
      <p>Gestisci dati, raggio operativo e disponibilità.</p>

      {err && (
        <div style={{ color: "var(--danger)", marginTop: 10, marginBottom: 10 }}>
          {err}
        </div>
      )}

      <div className="panel" style={{ padding: 16, marginTop: 14 }}>
        <h2 style={{ marginTop: 0 }}>Dati officina</h2>

        <div style={{ display: "grid", gap: 12, gridTemplateColumns: "1fr 1fr" }}>
          <label>
            Nome officina
            <input value={workshopName} onChange={(e) => setWorkshopName(e.target.value)} />
          </label>

          <label>
            Città
            <input value={city} onChange={(e) => setCity(e.target.value)} />
          </label>

          <label>
            Indirizzo officina
            <input
              value={workshopAddress}
              onChange={(e) => setWorkshopAddress(e.target.value)}
              placeholder="Es. Via Roma 10"
            />
          </label>

          <label>
            Telefono
            <input value={phone} onChange={(e) => setPhone(e.target.value)} />
          </label>

          <label>
            Email
            <input value={email} onChange={(e) => setEmail(e.target.value)} />
          </label>

          <label>
            Raggio operativo (km)
            <input
              type="number"
              min={5}
              max={300}
              value={radiusKm}
              onChange={(e) => setRadiusKm(Number(e.target.value))}
            />
          </label>

          <div style={{ display: "grid", gap: 12 }}>
            <label>
              Orario inizio (work)
              <input type="time" value={workStart} onChange={(e) => setWorkStart(e.target.value)} />
            </label>

            <label>
              Orario fine (work)
              <input type="time" value={workEnd} onChange={(e) => setWorkEnd(e.target.value)} />
            </label>
          </div>
        </div>

        <div style={{ marginTop: 14 }}>
          <div style={{ fontWeight: 700, marginBottom: 8 }}>
            Colore appuntamenti confermati
          </div>

          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
            {COLOR_PALETTE.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => setConfirmedColor(c)}
                title={c}
                style={{
                  width: 28,
                  height: 28,
                  borderRadius: 999,
                  border: confirmedColor === c ? "2px solid white" : "1px solid rgba(255,255,255,0.25)",
                  background: c,
                  cursor: "pointer",
                }}
              />
            ))}

            <span style={{ color: "var(--muted)" }}>
              Selezionato: <b>{confirmedColor}</b>
            </span>
          </div>
        </div>

        <div style={{ marginTop: 14, display: "flex", gap: 10 }}>
          <button className="btn" onClick={saveProfile} disabled={saving}>
            {saving ? "Salvataggio..." : "Salva dati officina"}
          </button>
        </div>
      </div>

      <div className="panel" style={{ padding: 16, marginTop: 16 }}>
        <div className="section-head">
          <div>
            <h2 style={{ margin: 0 }}>Calendario disponibilità</h2>
            <p style={{ marginTop: 6, color: "var(--muted)" }}>
              Tocca un giorno per inserire uno slot. Tocca uno slot per rimuoverlo.
              Gli appuntamenti confermati sono colorati.
            </p>
          </div>
        </div>

        <div className="calendar-wrap">
          <FullCalendar
            plugins={[dayGridPlugin, timeGridPlugin, interactionPlugin]}
            initialView="dayGridMonth"
            headerToolbar={{
              left: "prev,next today",
              center: "title",
              right: "dayGridMonth,timeGridWeek,timeGridDay",
            }}
            height="auto"
            events={events}
            dateClick={(info) => {
              setErr(null);
              setSelectedDay(info.date);

              const ws = workStart;
              const wsMin = hhmmToMinutes(ws);
              const weMin = hhmmToMinutes(workEnd);

              setModalStart(ws);
              setModalEnd(minutesToHHMM(Math.min(wsMin + 60, weMin)));

              setSlotModalOpen(true);
            }}
            eventClick={async (clickInfo) => {
              const kind = clickInfo.event.extendedProps?.kind;

              if (kind !== "SLOT") {
                return;
              }

              const slotId = Number(clickInfo.event.extendedProps?.slotId);
              if (!slotId) return;

              if (!confirm("Rimuovere questo slot?")) return;
              await removeSlot(slotId);
            }}
          />
        </div>

        <p style={{ marginTop: 10, color: "var(--muted)" }}>
          Suggerimento: per precisione, usa la vista “Settimana” quando inserisci slot molto specifici.
        </p>
      </div>

      {slotModalOpen && (
        <div className="modal-backdrop" role="dialog" aria-modal="true">
          <div className="modal-card">
            <div className="modal-title">
              <h3 style={{ margin: 0 }}>Crea disponibilità</h3>
              <button
                className="icon-btn"
                onClick={() => {
                  setSlotModalOpen(false);
                  setSelectedDay(null);
                  setErr(null);
                }}
                aria-label="Chiudi"
              >
                ✕
              </button>
            </div>

            <div style={{ color: "var(--muted)", marginTop: 6 }}>
              Giorno: <b>{selectedDay ? selectedDay.toLocaleDateString() : ""}</b>
            </div>

            <div className="modal-grid">
              <label>
                Inizio
                <input type="time" value={modalStart} onChange={(e) => setModalStart(e.target.value)} />
              </label>

              <label>
                Fine
                <input type="time" value={modalEnd} onChange={(e) => setModalEnd(e.target.value)} />
              </label>
            </div>

            {err && <div style={{ color: "var(--danger)", marginTop: 10 }}>{err}</div>}

            <div className="modal-actions">
              <button className="btn" type="button" onClick={createSlotFromModal}>
                Salva slot
              </button>
              <button
                className="btn-link"
                type="button"
                onClick={() => {
                  setSlotModalOpen(false);
                  setSelectedDay(null);
                  setErr(null);
                }}
              >
                Annulla
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}