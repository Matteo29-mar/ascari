import React, { useEffect, useRef, useState } from "react";
import { http } from "../api";
import { useAuth } from "@clerk/clerk-react";
import { useNavigate, useSearchParams } from "react-router-dom";
import AscariPopup from "../components/AscariPopup";

type Offer = {
  id: number;
  amount: number;
  status: string;
  createdAt: string;
  buyer: { name?: string; email: string };
  chatId?: number | null;
  chat?: { id: number } | null;
  car: {
    id: number;
    title?: string | null;
    make: string;
    model: string;
    photos?: string[] | null;
    coverUrl?: string | null;
    isPeriziata?: boolean;

    paymentStatus?: string | null;
    marketStatus?: "AVAILABLE" | "SOLD_PENDING_REMOVAL" | "REMOVED_AFTER_SALE";
    soldAt?: string | null;
    removalScheduledAt?: string | null;
    visuallyRemovedAt?: string | null;
  };
};

type PopupState = {
  open: boolean;
  title?: string;
  message?: string;
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

function normalizeOffers(payload: any): Offer[] {
  if (Array.isArray(payload)) return payload as Offer[];
  if (payload && Array.isArray(payload.offers)) return payload.offers as Offer[];
  if (payload && Array.isArray(payload.data)) return payload.data as Offer[];
  if (payload && Array.isArray(payload.items)) return payload.items as Offer[];
  if (payload && Array.isArray(payload.result)) return payload.result as Offer[];
  return [];
}

function todayISO() {
  return new Date().toISOString().slice(0, 10);
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

export default function OffersReceived() {
  const [list, setList] = useState<Offer[]>([]);
  const [confirmOfferId, setConfirmOfferId] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  const [openReqModal, setOpenReqModal] = useState(false);
  const [reqOffer, setReqOffer] = useState<Offer | null>(null);
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

  const { getToken } = useAuth();
  const nav = useNavigate();

  const [searchParams] = useSearchParams();

  const offerIdFromEmail = (() => {
    const raw = searchParams.get("offerId");

    if (!raw) return null;

    const parsed = Number(raw);

    if (!Number.isInteger(parsed) || parsed <= 0) {
      return null;
    }

    return parsed;
  })();

  const offerElementsRef = useRef<
    Record<number, HTMLDivElement | null>
  >({});
  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
  if (loading || !offerIdFromEmail) {
    return;
  }

  const selectedElement =
    offerElementsRef.current[offerIdFromEmail];

  if (!selectedElement) {
    return;
  }

  const timeout = window.setTimeout(() => {
    selectedElement.scrollIntoView({
      behavior: "smooth",
      block: "center",
    });
  }, 150);

  return () => {
    window.clearTimeout(timeout);
  };
}, [loading, list, offerIdFromEmail]);
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

  async function load() {
    setLoading(true);
    setErr(null);

    try {
      const token = await getToken();
      if (!token) {
        setErr("Utente non autenticato");
        setList([]);
        return;
      }

      const res = await http.get("/offers/received", {
        headers: { Authorization: `Bearer ${token}` },
      });

      const offers = normalizeOffers(res.data)
        .map((offer) => ({
          ...offer,
          chatId: offer.chatId ?? offer.chat?.id ?? null,
        }))
        .filter((offer) => {
          const car = offer.car;

          const removed =
            car?.marketStatus === "REMOVED_AFTER_SALE" ||
            !!car?.visuallyRemovedAt;

          if (removed) return false;

          if (offer.status === "CLOSED_SOLD") return false;

          if (car?.marketStatus === "SOLD_PENDING_REMOVAL") {
            return offer.status === "ACCEPTED";
          }

          return true;
        });

      setList(offers);
    } catch (e: any) {
      console.error("Errore caricamento offerte ricevute:", e);
      setErr(e?.response?.data?.error || e?.message || "Errore caricamento offerte");
      setList([]);
    } finally {
      setLoading(false);
    }
  }

  function openContactInspector(offer: Offer) {
    setReqErr(null);
    setReqOffer(offer);
    setReqDate(todayISO());
    setReqStart("09:00");
    setReqEnd("10:00");
    setExpandedRadiusKm(100);
    setShowRadiusSearch(false);
    setPendingSuggestion(null);
    setOpenReqModal(true);
  }

  async function respond(id: number, action: "accept" | "decline") {
    setErr(null);

    try {
      const token = await getToken();
      if (!token) {
        setErr("Utente non autenticato");
        return;
      }

      const currentOffer = list.find((o) => o.id === id);

      if (action === "accept" && currentOffer && !currentOffer.car?.isPeriziata) {
        openContactInspector(currentOffer);
        return;
      }

const res = await http.post(
  `/offers/${id}/${action}`,
  {},
  { headers: { Authorization: `Bearer ${token}` } }
);

      const chatIdFromServer = res?.data?.chatId ?? null;

      setList((prev) =>
        (Array.isArray(prev) ? prev : []).map((o) =>
          o.id === id
            ? {
                ...o,
                status: action === "accept" ? "ACCEPTED" : "DECLINED",
                chatId: chatIdFromServer ?? o.chatId ?? null,
              }
            : o
        )
      );

      if (action === "accept" && currentOffer) {
        if (currentOffer.car?.isPeriziata) {
          if (chatIdFromServer) {
            nav(`/chat/${chatIdFromServer}`);
          }
        } else {
          openContactInspector({
            ...currentOffer,
            status: "ACCEPTED",
            chatId: chatIdFromServer ?? currentOffer.chatId ?? null,
          });
        }
      }
    } catch (e: any) {
      console.error("Errore risposta offerta:", e);
      setErr(e?.response?.data?.error || e?.message || "Errore aggiornamento offerta");
    }
  }

  async function deleteOffer(id: number, force = false) {
    setErr(null);

    try {
      const token = await getToken();
      if (!token) {
        setErr("Utente non autenticato");
        return;
      }

      await http.delete(`/offers/${id}${force ? "?force=true" : ""}`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      setConfirmOfferId(null);
      setList((prev) => (Array.isArray(prev) ? prev : []).filter((o) => o.id !== id));
    } catch (e: any) {
      console.error("Errore eliminazione offerta:", e);
      setErr(e?.response?.data?.error || e?.message || "Errore eliminazione offerta");
    }
  }

  async function acceptSuggestedSlot(slotId: number) {
    if (!reqOffer) return;

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
          carId: reqOffer.car.id,
          requestedDate: reqDate,
          startTime: reqStart,
          endTime: reqEnd,
          suggestedSlotId: slotId,
        },
        { headers: { Authorization: `Bearer ${token}` } }
      );

      if (!data?.ok || !data?.match) {
        throw new Error(data?.error || "Impossibile confermare la proposta");
      }
      const acceptRes = await http.post(
          `/offers/${reqOffer.id}/accept`,
          {},
          { headers: { Authorization: `Bearer ${token}` } }
        );

        const chatIdFromServer = acceptRes?.data?.chatId ?? null;

        setList((prev) =>
          prev.map((o) =>
            o.id === reqOffer.id
              ? {
                  ...o,
                  status: "ACCEPTED",
                  chatId: chatIdFromServer ?? o.chatId ?? null,
                }
              : o
          )
        );

        setReqOffer((prev) =>
          prev
            ? {
                ...prev,
                status: "ACCEPTED",
                chatId: chatIdFromServer ?? prev.chatId ?? null,
              }
            : prev
        );

      setPendingSuggestion(null);
      setShowRadiusSearch(false);
      setOpenReqModal(false);

      openPopup({
        open: true,
        title: "Richiesta inviata",
        message:
          "Hai accettato l’orario alternativo. La richiesta al periziatore è stata inviata correttamente.",
        variant: "success",
        confirmText: "Apri chat offerta",
        cancelText: "Chiudi",
        onConfirm: () => {
          closePopup();
          if (reqOffer.chatId) nav(`/chat/${reqOffer.chatId}`);
        },
      });
    } catch (e: any) {
      setReqErr(e?.response?.data?.error ?? e?.message ?? "Errore");
    } finally {
      setReqLoading(false);
    }
  }

  async function submitInspectionRequest(useExpandedRadius = false) {
    if (!reqOffer) return;

    setReqErr(null);
    setReqLoading(true);

    try {
      const token = await getToken();
      if (!token) {
        setReqErr("Non sei autenticato");
        return;
      }

      const payload: any = {
        carId: reqOffer.car.id,
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
        const acceptRes = await http.post(
            `/offers/${reqOffer.id}/accept`,
            {},
            { headers: { Authorization: `Bearer ${token}` } }
          );

          const chatIdFromServer = acceptRes?.data?.chatId ?? null;

          setList((prev) =>
            prev.map((o) =>
              o.id === reqOffer.id
                ? {
                    ...o,
                    status: "ACCEPTED",
                    chatId: chatIdFromServer ?? o.chatId ?? null,
                  }
                : o
            )
          );

          setReqOffer((prev) =>
            prev
              ? {
                  ...prev,
                  status: "ACCEPTED",
                  chatId: chatIdFromServer ?? prev.chatId ?? null,
                }
              : prev
          );
        setOpenReqModal(false);
        setPendingSuggestion(null);
        setShowRadiusSearch(false);

        let successMessage =
          "Offerta accettata e richiesta perizia inviata correttamente.";

        if (data.step === "RADIUS_MATCH") {
          successMessage =
            "Offerta accettata. Abbiamo trovato un periziatore allargando il raggio di ricerca.";
        }

        openPopup({
          open: true,
          title: "Richiesta inviata",
          message: successMessage,
          variant: "success",
          confirmText: "Apri chat offerta",
          cancelText: "Chiudi",
          onConfirm: () => {
            closePopup();
            if (reqOffer.chatId) nav(`/chat/${reqOffer.chatId}`);
          },
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
            "Non abbiamo trovato nessuno nella tua città. Puoi allargare il raggio di ricerca.",
          variant: "warning",
        });

        return;
      }

      openPopup({
        open: true,
        title: "Nessun match disponibile",
        message:
          data?.message ||
          "Offerta accettata, ma al momento non ci sono periziatori disponibili. Puoi riprovare da questa finestra.",
        variant: "warning",
      });
    } catch (e: any) {
      setReqErr(e?.response?.data?.error ?? e?.message ?? "Errore");
    } finally {
      setReqLoading(false);
    }
  }

  const safeList = Array.isArray(list) ? list : [];

  return (
    <div>
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

      <h1 className="h1">Offerte ricevute</h1>

      {loading && <p className="muted">Caricamento offerte...</p>}
      {err && <p style={{ color: "var(--danger)" }}>{err}</p>}

      {!loading && safeList.length === 0 && (
        <p className="muted">Nessuna offerta ricevuta.</p>
      )}

      {safeList.map((offer) => {
        const cover =
          offer.car?.coverUrl ||
          (Array.isArray(offer.car?.photos) && offer.car.photos?.[0]) ||
          "/cars/placeholder.jpg";
        const carSold =
          offer.car?.marketStatus === "SOLD_PENDING_REMOVAL" ||
          offer.car?.marketStatus === "REMOVED_AFTER_SALE" ||
          offer.car?.paymentStatus === "SOLD";

        const carRemoved =
          offer.car?.marketStatus === "REMOVED_AFTER_SALE" ||
          !!offer.car?.visuallyRemovedAt;

        if (carRemoved) return null;
        return (
          <div
            key={offer.id}
            id={`offer-${offer.id}`}
            ref={(node) => {
              offerElementsRef.current[offer.id] = node;
            }}
            className="card"
            style={{
              marginBottom: 14,
              scrollMarginTop: 110,

              ...(offer.id === offerIdFromEmail
                ? {
                    border: "2px solid #00ffaa",
                    boxShadow:
                      "0 0 0 4px rgba(0,255,170,0.14), 0 14px 40px rgba(0,0,0,0.32)",
                  }
                : {}),
            }}
          >
            <div className="card-body row" style={{ alignItems: "center", gap: 20 }}>
              <img
                src={cover}
                alt="car"
                style={{ width: 120, height: 80, objectFit: "cover", borderRadius: 8 }}
              />

              <div style={{ flex: 1 }}>
                <b>
                  {offer.car?.make} {offer.car?.model}
                </b>
                <p className="muted">Da: {offer.buyer?.name || offer.buyer?.email}</p>
                <p>
                  Offerta: <b>{offer.amount} €</b>
                </p>
                <p className="muted">
                  Periziata: <b>{offer.car?.isPeriziata ? "SI" : "NO"}</b>
                </p>

                {carSold && (
                  <p
                    style={{
                      display: "inline-flex",
                      marginTop: 6,
                      padding: "4px 8px",
                      borderRadius: 999,
                      border: "1px solid rgba(251,191,36,0.35)",
                      background: "rgba(251,191,36,0.12)",
                      color: "#fde68a",
                      fontSize: 12,
                      fontWeight: 800,
                    }}
                  >
                    Auto venduta · gestione temporanea
                  </p>
                )}
              </div>
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: 10,
                  minWidth: 140,
                }}
              >
                <span
                  style={{
                    padding: "4px 10px",
                    borderRadius: 6,
                    background:
                      offer.status === "ACCEPTED"
                        ? "#00ffcc"
                        : offer.status === "PENDING"
                        ? "#ffaa00"
                        : "#ff4444",
                    color: "#000",
                    fontWeight: 600,
                    textAlign: "center",
                  }}
                >
                  {offer.status}
                </span>

                {offer.status === "ACCEPTED" && offer.chatId && (
                  <button
                    className="btn"
                    style={{ background: "#0066ff", color: "white" }}
                    onClick={() => nav(`/chat/${offer.chatId}`)}
                  >
                    💬 Apri chat
                  </button>
                )}

                {offer.status !== "PENDING" && (
                  <button
                    className="btn secondary"
                    style={{ background: "#ff4444", color: "white" }}
                    onClick={() => {
                      if (offer.status === "ACCEPTED") {
                        setConfirmOfferId(offer.id);
                      } else {
                        deleteOffer(offer.id);
                      }
                    }}
                  >
                    🗑 Elimina
                  </button>
                )}
              </div>

              {offer.status === "PENDING" && !carSold && (
                <div className="row" style={{ gap: 8, marginLeft: 10 }}>
                  <button
                    className="btn"
                    style={{ background: "#00ffaa", color: "#000" }}
                    onClick={() => respond(offer.id, "accept")}
                  >
                    Accetta
                  </button>

                  <button
                    className="btn secondary"
                    style={{ background: "#ff6666", color: "#fff" }}
                    onClick={() => respond(offer.id, "decline")}
                  >
                    Rifiuta
                  </button>
                </div>
              )}
            </div>
          </div>
        );
      })}

      {confirmOfferId && (
        <div className="modal-backdrop">
          <div className="modal">
            <h3>Eliminare la chat?</h3>
            <p>
              Eliminando l’offerta verrà cancellata <b>tutta la conversazione</b>.
            </p>

            <div className="modal-actions">
              <button className="btn secondary" onClick={() => setConfirmOfferId(null)}>
                No
              </button>

              <button className="btn danger" onClick={() => deleteOffer(confirmOfferId, true)}>
                Sì, elimina
              </button>
            </div>
          </div>
        </div>
      )}

      {openReqModal && reqOffer && (
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
              Auto:{" "}
              <b>
                {reqOffer.car?.title ||
                  `${reqOffer.car?.make ?? ""} ${reqOffer.car?.model ?? ""}`}
              </b>
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