import { useEffect, useState } from "react";
import {
  useAuth,
  SignedIn,
  SignedOut,
  RedirectToSignIn,
} from "@clerk/clerk-react";
import { getMyGarage } from "../api";
import { Link } from "react-router-dom";
import LikeButton from "../components/LikeButton";
import { http } from "../api";
import AscariPopup from "../components/AscariPopup";

type Car = {
  id: number;
  title: string;
  make: string;
  model: string;
  year: number;
  coverUrl?: string | null;
  photos?: string[] | null;
  likedByMe?: boolean;
  likes?: { id: string }[];

  isPeriziata?: boolean;
  periziaUploadedAt?: string | null;
  periziaDocUrl?: string | null;

  city?: string | null;
};

type MyGarageResponse = {
  myCars: Car[];
  likedCars: Car[];
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

type MatchSuggestion = {
  slotId: number;
  inspectorId: string;
  inspectorName: string;
  inspectorCity: string | null;
  startAt: string;
  endAt: string;
};

function BadgePerizia({ ok }: { ok: boolean }) {
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 8,
        padding: "6px 10px",
        borderRadius: 999,
        fontWeight: 800,
        fontSize: 12,
        border: ok
          ? "1px solid rgba(0,255,180,0.35)"
          : "1px solid rgba(239,68,68,0.45)",
        background: ok ? "rgba(0,255,180,0.12)" : "rgba(239,68,68,0.10)",
        color: ok ? "#b8ffe9" : "#ffb4b4",
      }}
      title={ok ? "Auto periziata" : "Auto non periziata"}
    >
      <span
        style={{
          width: 8,
          height: 8,
          borderRadius: "50%",
          background: ok ? "rgba(0,255,180,0.9)" : "rgba(239,68,68,0.9)",
          display: "inline-block",
        }}
      />
      Periziata: {ok ? "SI" : "NO"}
    </span>
  );
}

function normalizeGarage(payload: any): MyGarageResponse {
  if (
    payload &&
    Array.isArray(payload.myCars) &&
    Array.isArray(payload.likedCars)
  ) {
    return payload as MyGarageResponse;
  }

  const candidate = payload?.data ?? payload?.garage ?? payload;

  const myCars = Array.isArray(candidate?.myCars) ? candidate.myCars : [];
  const likedCars = Array.isArray(candidate?.likedCars)
    ? candidate.likedCars
    : [];

  return { myCars, likedCars };
}

function todayISO() {
  const d = new Date();
  return d.toISOString().slice(0, 10);
}

function formatDateTimeLocal(v?: string | null) {
  if (!v) return "";
  const d = new Date(v);
  if (isNaN(d.getTime())) return "";

  return d.toLocaleString("it-IT", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatTimeLocal(v?: string | null) {
  if (!v) return "";
  const d = new Date(v);
  if (isNaN(d.getTime())) return "";

  return d.toLocaleTimeString("it-IT", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function MyGarageContent() {
  const { getToken } = useAuth();

  const [data, setData] = useState<MyGarageResponse>({
    myCars: [],
    likedCars: [],
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [uploadingCarId, setUploadingCarId] = useState<number | null>(null);

  const [openReqModal, setOpenReqModal] = useState(false);
  const [reqCar, setReqCar] = useState<Car | null>(null);
  const [reqDate, setReqDate] = useState<string>(todayISO());
  const [reqStart, setReqStart] = useState<string>("09:00");
  const [reqEnd, setReqEnd] = useState<string>("10:00");
  const [reqLoading, setReqLoading] = useState(false);
  const [reqErr, setReqErr] = useState<string | null>(null);

  const [expandedRadiusKm, setExpandedRadiusKm] = useState<number>(100);
  const [showRadiusSearch, setShowRadiusSearch] = useState(false);
  const [pendingSuggestion, setPendingSuggestion] =
    useState<MatchSuggestion | null>(null);

  const [popup, setPopup] = useState<PopupState>({
    open: false,
    message: "",
    variant: "info",
  });

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

  async function loadGarage() {
    setLoading(true);
    try {
      setError(null);
      const token = await getToken();

      if (!token) {
        setError("Utente non autenticato");
        setData({ myCars: [], likedCars: [] });
        return;
      }

      const res = await getMyGarage(token);
      const normalized = normalizeGarage(res);
      setData(normalized);
    } catch (e: any) {
      console.error("Errore caricamento garage:", e);
      setError(e?.message || "Errore caricamento garage");
      setData({ myCars: [], likedCars: [] });
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadGarage();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function uploadPerizia(carId: number, file: File) {
    try {
      const token = await getToken();
      if (!token) {
        openPopup({
          open: true,
          title: "Accesso richiesto",
          message: "Devi essere loggato per caricare la perizia.",
          variant: "warning",
        });
        return;
      }

      const fd = new FormData();
      fd.append("file", file);

      setUploadingCarId(carId);

      await http.post(`/cars/${carId}/perizia/upload`, fd, {
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "multipart/form-data",
        },
      });

      openPopup({
        open: true,
        title: "Perizia caricata",
        message: "La perizia è stata caricata con successo.",
        variant: "success",
      });

      await loadGarage();
    } catch (e: any) {
      console.error(e);
      openPopup({
        open: true,
        title: "Errore upload",
        message:
          e?.response?.data?.error || e?.message || "Errore upload perizia",
        variant: "error",
      });
    } finally {
      setUploadingCarId(null);
    }
  }

  function openContactInspector(car: Car) {
    setReqErr(null);
    setReqCar(car);
    setReqDate(todayISO());
    setReqStart("09:00");
    setReqEnd("10:00");
    setExpandedRadiusKm(100);
    setShowRadiusSearch(false);
    setPendingSuggestion(null);
    setOpenReqModal(true);
  }

  async function acceptSuggestedSlot(slotId: number) {
    if (!reqCar) return;

    setReqLoading(true);
    setReqErr(null);

    try {
      const token = await getToken();
      if (!token) {
        setReqErr("Non sei autenticato");
        return;
      }

      const { data } = await http.post(
        "/inspector/inspections/request",
        {
          carId: reqCar.id,
          requestedDate: reqDate,
          startTime: reqStart,
          endTime: reqEnd,
          suggestedSlotId: slotId,
        },
        { headers: { Authorization: `Bearer ${token}` } }
      );

      if (!data?.ok || !data?.match) {
        throw new Error(
          data?.error || "Impossibile confermare la proposta"
        );
      }

      setPendingSuggestion(null);
      setShowRadiusSearch(false);
      setOpenReqModal(false);
      setReqCar(null);

      openPopup({
        open: true,
        title: "Richiesta inviata",
        message:
          "Hai accettato l’orario alternativo. La richiesta è stata inviata correttamente.",
        variant: "success",
      });
    } catch (e: any) {
      setReqErr(e?.response?.data?.error ?? e?.message ?? "Errore");
    } finally {
      setReqLoading(false);
    }
  }

  async function submitInspectionRequest(useExpandedRadius = false) {
    if (!reqCar) return;

    setReqErr(null);
    setReqLoading(true);

    try {
      const token = await getToken();
      if (!token) {
        setReqErr("Non sei autenticato");
        return;
      }

      const payload: any = {
        carId: reqCar.id,
        requestedDate: reqDate,
        startTime: reqStart,
        endTime: reqEnd,
      };

      if (useExpandedRadius) {
        payload.expandedRadiusKm = expandedRadiusKm;
      }

      const { data } = await http.post(
        "/inspector/inspections/request",
        payload,
        { headers: { Authorization: `Bearer ${token}` } }
      );

      if (!data?.ok) {
        throw new Error(data?.error || "Richiesta fallita");
      }

      if (data.match) {
        setOpenReqModal(false);
        setReqCar(null);
        setPendingSuggestion(null);
        setShowRadiusSearch(false);

        let successMessage =
          "Un periziatore ha disponibilità. La tua richiesta è stata inviata correttamente.";

        if (data.step === "RADIUS_MATCH") {
          successMessage =
            "Abbiamo trovato un periziatore allargando il raggio di ricerca. La richiesta è stata inviata correttamente.";
        }

        openPopup({
          open: true,
          title: "Richiesta inviata",
          message: successMessage,
          variant: "success",
        });

        return;
      }

      if (data.step === "CITY_OTHER_TIME" && data.suggestion) {
        setPendingSuggestion(data.suggestion);

        const start = formatDateTimeLocal(data.suggestion.startAt);
        const end = formatTimeLocal(data.suggestion.endAt);

        openPopup({
          open: true,
          title: "Orario alternativo trovato",
          message:
            `Nessuno disponibile all’orario richiesto.\n` +
            `Abbiamo trovato ${data.suggestion.inspectorName}` +
            `${data.suggestion.inspectorCity ? ` a ${data.suggestion.inspectorCity}` : ""}` +
            ` in questo orario:\n${start} - ${end}\n\nAccetti questa alternativa?`,
          variant: "info",
          confirmText: "Accetta",
          cancelText: "Annulla",
          onConfirm: () => {
            closePopup();
            acceptSuggestedSlot(data.suggestion.slotId);
          },
        });

        return;
      }

      if (data.step === "ASK_EXPAND_RADIUS") {
        setShowRadiusSearch(true);

        openPopup({
          open: true,
          title: "Nessun match in città",
          message:
            data.message ||
            "Non abbiamo trovato nessuno nella tua città. Puoi allargare il raggio di ricerca qui sotto.",
          variant: "warning",
        });

        return;
      }

      openPopup({
        open: true,
        title: "Nessun match disponibile",
        message:
          data?.message ||
          "I nostri periziatori sono impegnati. Prova un altro giorno o un altro orario.",
        variant: "warning",
      });
    } catch (e: any) {
      setReqErr(e?.response?.data?.error ?? e?.message ?? "Errore");
    } finally {
      setReqLoading(false);
    }
  }

  if (loading) return <div>Caricamento garage...</div>;
  if (error) return <div style={{ color: "var(--danger)" }}>{error}</div>;

  const myCars = Array.isArray(data.myCars) ? data.myCars : [];
  const likedCars = Array.isArray(data.likedCars) ? data.likedCars : [];

  return (
    <div style={{ padding: "2rem 1rem" }}>
      {popup.open && (
        <AscariPopup
          title={popup.title}
          message={popup.message}
          variant={popup.variant}
          confirmText={popup.confirmText}
          cancelText={popup.cancelText}
          onConfirm={popup.onConfirm}
          onCancel={closePopup}
          onClose={closePopup}
        />
      )}

      <h1 style={{ marginBottom: "1.5rem" }}>Il mio garage</h1>

      <section>
        <h2>Le mie auto</h2>
        {myCars.length === 0 && <p>Non hai ancora caricato auto.</p>}

        <div className="grid">
          {myCars.map((car) => {
            const imgSrc =
              car.coverUrl ||
              (Array.isArray(car.photos) && car.photos[0]) ||
              "/cars/placeholder.jpg";

            const periziata = !!car.isPeriziata;

            return (
              <article key={car.id} className="card">
                <img src={imgSrc} className="card-image" alt="cover" />

                <div className="card-body">
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      gap: 10,
                      alignItems: "center",
                    }}
                  >
                    <h3 style={{ margin: 0 }}>{car.title}</h3>
                    <BadgePerizia ok={periziata} />
                  </div>

                  <p>
                    {car.make} {car.model} ({car.year})
                  </p>

                  {!periziata && (
                    <div style={{ marginTop: 10 }}>
                      <div
                        style={{
                          display: "flex",
                          gap: 10,
                          flexWrap: "wrap",
                          alignItems: "center",
                        }}
                      >
                        <label
                          className="btn secondary"
                          style={{
                            display: "inline-flex",
                            alignItems: "center",
                            gap: 8,
                            cursor: "pointer",
                          }}
                          title="Carica PDF perizia"
                        >
                          {uploadingCarId === car.id
                            ? "Caricamento..."
                            : "Carica perizia (PDF)"}
                          <input
                            type="file"
                            accept="application/pdf"
                            hidden
                            disabled={uploadingCarId === car.id}
                            onChange={(e) => {
                              const file = e.target.files?.[0];
                              if (!file) return;

                              if (file.type !== "application/pdf") {
                                openPopup({
                                  open: true,
                                  title: "File non valido",
                                  message: "Carica un file PDF.",
                                  variant: "warning",
                                });
                                e.currentTarget.value = "";
                                return;
                              }

                              uploadPerizia(car.id, file);
                              e.currentTarget.value = "";
                            }}
                          />
                        </label>

                        <button
                          className="btn"
                          type="button"
                          onClick={() => openContactInspector(car)}
                          title="Invia richiesta perizia"
                        >
                          Contatta periziatore
                        </button>
                      </div>

                      <p
                        className="muted"
                        style={{ marginTop: 8, marginBottom: 0 }}
                      >
                        Seleziona giorno e orario: il sistema cercherà un
                        periziatore disponibile nella tua area.
                      </p>
                    </div>
                  )}

                  <div className="card-actions" style={{ marginTop: 14 }}>
                    <Link className="btn" to={`/cars/${car.id}`}>
                      Dettaglio modello
                    </Link>

                    <LikeButton
                      carId={car.id}
                      initialLiked={car.likedByMe ?? false}
                      disabled={true}
                    />
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      </section>

      <section style={{ marginTop: "2.5rem" }}>
        <h2>Le auto che mi piacciono</h2>
        {likedCars.length === 0 && <p>Non hai ancora messo Mi piace.</p>}

        <div className="grid">
          {likedCars.map((car) => {
            const imgSrc =
              car.coverUrl ||
              (Array.isArray(car.photos) && car.photos[0]) ||
              "/cars/placeholder.jpg";

            return (
              <article key={car.id} className="card">
                <img src={imgSrc} className="card-image" alt="cover" />

                <div className="card-body">
                  <h3>{car.title}</h3>
                  <p>
                    {car.make} {car.model} ({car.year})
                  </p>

                  <div className="card-actions">
                    <LikeButton carId={car.id} initialLiked={true} />

                    <Link className="btn" to={`/cars/${car.id}`}>
                      Dettaglio modello
                    </Link>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      </section>

      {openReqModal && reqCar && (
        <div
          className="ascari-modal"
          onClick={() => !reqLoading && setOpenReqModal(false)}
        >
          <div
            className="ascari-modal-box"
            onClick={(e) => e.stopPropagation()}
          >
            <h3>Contatta periziatore</h3>
            <p className="muted">
              Auto: <b>{reqCar.title}</b>
            </p>

            <div style={{ display: "grid", gap: 12, marginTop: 14 }}>
              <label>
                Giorno
                <input
                  type="date"
                  value={reqDate}
                  onChange={(e) => setReqDate(e.target.value)}
                />
              </label>

              <div
                style={{
                  display: "grid",
                  gap: 12,
                  gridTemplateColumns: "1fr 1fr",
                }}
              >
                <label>
                  Ora inizio
                  <input
                    type="time"
                    value={reqStart}
                    onChange={(e) => setReqStart(e.target.value)}
                  />
                </label>

                <label>
                  Ora fine
                  <input
                    type="time"
                    value={reqEnd}
                    onChange={(e) => setReqEnd(e.target.value)}
                  />
                </label>
              </div>

              {pendingSuggestion && (
                <div
                  style={{
                    padding: 12,
                    borderRadius: 12,
                    border: "1px solid rgba(255,255,255,0.12)",
                    background: "rgba(255,255,255,0.04)",
                  }}
                >
                  <div style={{ fontWeight: 800, marginBottom: 6 }}>
                    Proposta trovata nella tua città
                  </div>
                  <div className="muted" style={{ lineHeight: 1.5 }}>
                    <div>
                      Periziatore: <b>{pendingSuggestion.inspectorName}</b>
                    </div>
                    {pendingSuggestion.inspectorCity && (
                      <div>
                        Città: <b>{pendingSuggestion.inspectorCity}</b>
                      </div>
                    )}
                    <div>
                      Orario:{" "}
                      <b>
                        {formatDateTimeLocal(pendingSuggestion.startAt)} -{" "}
                        {formatTimeLocal(pendingSuggestion.endAt)}
                      </b>
                    </div>
                  </div>
                </div>
              )}

              {showRadiusSearch && (
                <div
                  style={{
                    marginTop: 8,
                    padding: 12,
                    borderRadius: 12,
                    border: "1px solid rgba(255,255,255,0.12)",
                    background: "rgba(255,255,255,0.04)",
                  }}
                >
                  <div style={{ fontWeight: 700, marginBottom: 8 }}>
                    Allarga il raggio di ricerca
                  </div>

                  <label style={{ display: "block" }}>
                    Raggio: <b>{expandedRadiusKm} km</b>
                    <input
                      type="range"
                      min={20}
                      max={300}
                      step={10}
                      value={expandedRadiusKm}
                      onChange={(e) =>
                        setExpandedRadiusKm(Number(e.target.value))
                      }
                      style={{ width: "100%", marginTop: 8 }}
                    />
                  </label>

                  <button
                    className="btn"
                    type="button"
                    style={{ marginTop: 12, width: "100%" }}
                    onClick={() => submitInspectionRequest(true)}
                    disabled={reqLoading}
                  >
                    {reqLoading ? "Ricerca..." : "Cerca nel raggio"}
                  </button>
                </div>
              )}

              {reqErr && <div style={{ color: "var(--danger)" }}>{reqErr}</div>}
            </div>

            <button
              className="btn"
              style={{ marginTop: 18, width: "100%" }}
              onClick={() => submitInspectionRequest(false)}
              disabled={reqLoading}
            >
              {reqLoading ? "Invio..." : "Invia richiesta"}
            </button>

            <button
              className="btn ghost"
              style={{ marginTop: 10, width: "100%" }}
              onClick={() => setOpenReqModal(false)}
              disabled={reqLoading}
            >
              Chiudi
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default function MyGaragePage() {
  return (
    <>
      <SignedIn>
        <MyGarageContent />
      </SignedIn>
      <SignedOut>
        <RedirectToSignIn />
      </SignedOut>
    </>
  );
}