import React, { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { http } from "../api";
import Carousel from "../components/Carousel/Carousel";
import AscariPopup from "../components/AscariPopup";
import { useAuth, useClerk } from "@clerk/clerk-react";
import { useOffers } from "../context/OfferContext";
import SoldCarPopup from "../components/SoldCarPopup";
import { getCarQrCode } from "../api";
import { downloadCarQrCode } from "../utils/qrCode";

type CarMarketStatus = "AVAILABLE" | "SOLD_PENDING_REMOVAL" | "REMOVED_AFTER_SALE";

type Car = {
  id: number;
  make: string;
  model: string;
  title: string;
  year: number;
  trimLevel?: string | null;
  offerPrice1?: number | null;
  offerPrice2?: number | null;
  offerPrice3?: number | null;
  priceEur?: number | null;
  color?: string | null;
  transmission?: string | null;
  fuelType?: string | null;
  engine?: string | null;
  horsepower?: number | null;
  mileageKm?: number | null;
  torqueNm?: number | null;
  drivetrain?: string | null;
  seats?: number | null;
  doors?: number | null;
  description?: string | null;
  photos?: string[] | null;
  coverUrl?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  locationText?: string | null;
  city?: string | null;
  country?: string | null;
  isPeriziata?: boolean;
  periziaDocUrl?: string | null;
  periziaUploadedAt?: string | null;
  paymentEnabled?: boolean;
  salePriceEur?: number | null;
  ascariFeeEur?: number | null;
  sellerNetEur?: number | null;
  paymentStatus?: string | null;
  marketStatus?: CarMarketStatus;
  soldAt?: string | null;
  removalScheduledAt?: string | null;
  visuallyRemovedAt?: string | null;
  owner?: {
    clerkId: string;
  };
};

type AlternativeCar = {
  id: number;
  make: string;
  model: string;
  title: string;
  year: number;
  coverUrl?: string | null;
  photos?: string[] | null;
  priceEur?: number | null;
  mileageKm?: number | null;
  fuelType?: string | null;
  transmission?: string | null;
  city?: string | null;
};

type PopupState = {
  open: boolean;
  title?: string;
  message?: string;
  variant: "success" | "error" | "warning" | "info";
  confirmText?: string;
  cancelText?: string;
  loading?: boolean;
  onConfirm?: (() => void | Promise<void>) | null;
};

function formatEuro(value?: number | null) {
  if (!value) return "";
  return new Intl.NumberFormat("it-IT", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 0,
  }).format(value);
}

function imageForAlternative(car: AlternativeCar) {
  return (
    car.coverUrl ||
    (Array.isArray(car.photos) && car.photos[0]) ||
    "/cars/placeholder.jpg"
  );
}

export default function CarDetail() {
  const { id } = useParams();
  const nav = useNavigate();

  const [car, setCar] = useState<Car | null>(null);
  const [alternatives, setAlternatives] = useState<AlternativeCar[]>([]);
  const [soldPopupOpen, setSoldPopupOpen] = useState(false);

  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [deleting, setDeleting] = useState(false);

  const [showOfferPopup, setShowOfferPopup] = useState(false);
  const [thanksPopup, setThanksPopup] = useState(false);

  const { userId: clerkUserId, isSignedIn, getToken } = useAuth();
  const { openSignIn } = useClerk();
  const { reloadOffers } = useOffers();

  const [openPerizia, setOpenPerizia] = useState(false);

  const [popup, setPopup] = useState<PopupState>({
    open: false,
    message: "",
    variant: "info",
    confirmText: "OK",
    cancelText: "Annulla",
    loading: false,
    onConfirm: null,
  });

  const isSold =
    car?.marketStatus === "SOLD_PENDING_REMOVAL" ||
    car?.marketStatus === "REMOVED_AFTER_SALE" ||
    car?.paymentStatus === "SOLD";

  const isOwner =
    isSignedIn && !!clerkUserId && car?.owner?.clerkId === clerkUserId;

  function closePopup() {
    setPopup((prev) => ({
      ...prev,
      open: false,
      loading: false,
      onConfirm: null,
    }));
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

  async function loadAlternatives(carId: number) {
    try {
      const { data } = await http.get(`/cars/${carId}/alternatives`);
      setAlternatives(Array.isArray(data?.alternatives) ? data.alternatives : []);
    } catch (e) {
      console.error("Errore caricamento alternative:", e);
      setAlternatives([]);
    }
  }

  async function checkCarAvailability() {
  const carId = car?.id ?? Number(id);

  if (!Number.isFinite(carId) || carId <= 0) {
    return false;
  }

  const { data } = await http.get(`/cars/${carId}/availability`);

  if (!data?.available) {
    setAlternatives(Array.isArray(data?.alternatives) ? data.alternatives : []);

    if (data?.car) {
      setCar((prev) => ({
        ...(prev ?? {}),
        ...data.car,
      }));
    }

    setSoldPopupOpen(true);
    return false;
  }

  return true;
}

  async function loadCar() {
    try {
      setLoading(true);
      setErr(null);

      const { data } = await http.get<Car>(`/cars/${id}`);
      setCar(data);

      const sold =
        data?.marketStatus === "SOLD_PENDING_REMOVAL" ||
        data?.marketStatus === "REMOVED_AFTER_SALE" ||
        data?.paymentStatus === "SOLD";

      const owner =
        isSignedIn && !!clerkUserId && data?.owner?.clerkId === clerkUserId;

      if (sold && !owner) {
        await loadAlternatives(data.id);
        setSoldPopupOpen(true);
      }
    } catch (e: any) {
      setErr(e?.response?.data?.error || "Errore caricamento");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadCar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, clerkUserId, isSignedIn]);

  const title = useMemo(() => {
    if (!car) return "Modello";
    return `${car.make} ${car.model} ${car.year}`;
  }, [car]);

  const images = useMemo(() => {
    if (car?.photos && Array.isArray(car.photos) && car.photos.length) {
      return car.photos;
    }

    if (car?.coverUrl) return [car.coverUrl];

    if (!car) return ["/cars/placeholder.jpg"];

    const slug = `${car.make}-${car.model}`.toLowerCase().replace(/\s+/g, "-");
    return [1, 2, 3].map((i) => `/cars/${slug}-${i}.jpg`);
  }, [car]);


  async function sendOffer(amount: number) {
    try {
      const available = await checkCarAvailability();
      if (!available) return;

      const token = await getToken();

      if (!token) {
        openErrorPopup("Non sei autenticato", "Accesso richiesto");
        return;
      }

      await http.post(
        "/offers",
        { carId: currentCar.id, amount },
        { headers: { Authorization: `Bearer ${token}` } }
      );

      setShowOfferPopup(false);
      setThanksPopup(true);
      reloadOffers();
    } catch (err: any) {
      console.error(err);
      openErrorPopup(
        err?.response?.data?.error || "Errore invio offerta",
        "Invio offerta non riuscito"
      );
    }
  }

  async function runDelete() {
    if (!id) return;

    try {
      setPopup((prev) => ({ ...prev, loading: true }));
      setDeleting(true);

      const token = await getToken();

      if (!token) {
        setDeleting(false);
        setPopup({
          open: true,
          title: "Accesso richiesto",
          message: "Non sei autenticato. Riprova ad effettuare il login.",
          variant: "error",
          confirmText: "Chiudi",
          cancelText: "Annulla",
          loading: false,
          onConfirm: null,
        });
        return;
      }

      await http.delete(`/cars/${id}`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      setPopup({
        open: true,
        title: "Veicolo rimosso",
        message:
          isSold
            ? "Il veicolo venduto è stato rimosso dal garage. Lo storico rimane disponibile."
            : "Il veicolo è stato eliminato correttamente.",
        variant: "success",
        confirmText: "Vai al garage",
        cancelText: "Annulla",
        loading: false,
        onConfirm: () => nav("/my-garage"),
      });
    } catch (e: any) {
      const msg = e?.response?.data?.error || e?.message || "Errore eliminazione";

      setPopup({
        open: true,
        title: "Errore eliminazione",
        message: msg,
        variant: "error",
        confirmText: "Chiudi",
        cancelText: "Annulla",
        loading: false,
        onConfirm: null,
      });
    } finally {
      setDeleting(false);
    }
  }

  async function onDelete() {
    if (!id) return;

    openConfirmPopup({
      title: isSold ? "Rimuovere questa auto dal garage?" : "Eliminare definitivamente questo veicolo?",
      message: isSold
        ? "La card verrà rimossa dal garage, ma lo storico della vendita resterà disponibile."
        : "Questa azione non può essere annullata.",
      variant: "warning",
      confirmText: isSold ? "Sì, rimuovi" : "Sì, elimina",
      cancelText: "Annulla",
      onConfirm: runDelete,
    });
  }

  async function downloadQrCode() {
    try {
      if (!isSignedIn) {
        openSignIn({
          redirectUrl: window.location.href,
        });
        return;
      }

      const token = await getToken();

      if (!token) {
        openSignIn({ redirectUrl: window.location.href });
        return;
      }

      const data = await getCarQrCode(currentCar.id, token);

      if (!data?.qrUrl) {
        throw new Error("URL QR non disponibile");
      }

      await downloadCarQrCode({
        qrUrl: data.qrUrl,
        carId: currentCar.id,
        make: currentCar.make,
        model: currentCar.model,
      });
    } catch (e: any) {
      openErrorPopup(e?.message || "Errore download QR", "Download QR non riuscito");
    }
  }

  async function downloadPerizia() {
    try {
      if (!isSignedIn) {
        openSignIn({
          redirectUrl: window.location.href,
        });
        return;
      }

      const token = await getToken();

      if (!token) {
        openSignIn({ redirectUrl: window.location.href });
        return;
      }

      const url = `${http.defaults.baseURL}/cars/${currentCar.id}/perizia/download`;

      const resp = await fetch(url, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!resp.ok) {
        const data = await resp.json().catch(() => null);
        throw new Error(data?.error || "Errore download perizia");
      }

      const blob = await resp.blob();
      const blobUrl = window.URL.createObjectURL(blob);

      const a = document.createElement("a");
      a.href = blobUrl;
      a.download = `perizia_car_${currentCar.id}.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();

      window.URL.revokeObjectURL(blobUrl);
    } catch (e: any) {
      openErrorPopup(e?.message || "Errore download perizia", "Download non riuscito");
    }
  }

  if (loading) return <p>Caricamento…</p>;

  if (err) {
    return (
      <div>
        <p style={{ color: "var(--danger)" }}>{err}</p>
        <button className="btn secondary" onClick={() => nav(-1)}>
          Torna indietro
        </button>
      </div>
    );
  }

  if (!car) return null;

  const currentCar = car;

  const canEdit =
    isSignedIn && !!currentCar.owner && currentCar.owner.clerkId === clerkUserId;

  return (
    <>
      <div>
        <button className="btn secondary" onClick={() => nav(-1)}>
          ← Indietro
        </button>

        <h1 className="h1" style={{ marginTop: 10 }}>
          {title}
        </h1>

        <p className="muted">
          {currentCar.trimLevel ? currentCar.trimLevel : "—"}
        </p>

        {isSold && (
          <div
            style={{
              marginTop: 12,
              padding: "12px 14px",
              borderRadius: 16,
              border: "1px solid rgba(251,191,36,0.35)",
              background: "rgba(251,191,36,0.12)",
              color: "#fde68a",
              fontWeight: 800,
            }}
          >
            Auto venduta. Non è più disponibile nel catalogo.
          </div>
        )}

        <div
          className="row"
          style={{ justifyContent: "flex-end", gap: 8, marginTop: 8 }}
        >
          {canEdit && (
              <>
                <button
                  className="btn secondary"
                  type="button"
                  onClick={downloadQrCode}
                  title="Scarica QR Code"
                >
                  Scarica QR
                </button>

                {!isSold && (
                  <Link
                    className="btn secondary"
                    to={`/cars/edit/${currentCar.id}`}
                    title="Modifica veicolo"
                  >
                    Modifica
                  </Link>
                )}

              <button
                className="btn"
                onClick={onDelete}
                disabled={deleting}
                title={isSold ? "Rimuovi dal garage" : "Elimina veicolo"}
                style={{
                  border: "1px solid #ef4444",
                  color: "#ef4444",
                  background: "transparent",
                }}
              >
                {deleting ? "Elimino…" : isSold ? "Rimuovi dal garage" : "Elimina"}
              </button>
            </>
          )}
        </div>

        <div className="card" style={{ marginTop: 12 }}>
          <Carousel images={images} alt={`${currentCar.make} ${currentCar.model}`} />
        </div>

        <div className="grid" style={{ marginTop: 16 }}>
          <section className="card">
            <div className="card-body">
              <h3 style={{ marginTop: 0 }}>Spec Tecniche</h3>
              <div className="row" style={{ gap: 18, flexWrap: "wrap" }}>
                <Spec label="Motore" value={currentCar.engine} />
                <Spec
                  label="Potenza"
                  value={currentCar.horsepower ? `${currentCar.horsepower} CV` : null}
                />
                <Spec
                  label="Coppia"
                  value={currentCar.torqueNm ? `${currentCar.torqueNm} Nm` : null}
                />
                <Spec
                  label="kilometri"
                  value={currentCar.mileageKm ? `${currentCar.mileageKm} KM` : null}
                />
                <Spec label="Trazione" value={currentCar.drivetrain} />
                <Spec label="Cambio" value={currentCar.transmission} />
                <Spec label="Alimentazione" value={currentCar.fuelType} />
                <Spec label="Posti" value={currentCar.seats} />
                <Spec label="Porte" value={currentCar.doors} />
                <Spec label="Colore" value={currentCar.color} />
              </div>
            </div>
          </section>

          <section className="card">
            <div className="card-body">
              <h3 style={{ marginTop: 0 }}>Descrizione</h3>
              <p className="muted" style={{ lineHeight: 1.6 }}>
                {currentCar.description || "Nessuna descrizione disponibile."}
              </p>
            </div>
          </section>

          <section className="card">
            <div className="card-body">
              <h3 style={{ marginTop: 0 }}>Posizione</h3>
              <div className="row" style={{ gap: 18, flexWrap: "wrap" }}>
                <Spec label="Indirizzo" value={currentCar.locationText} />
                <Spec label="Città" value={currentCar.city} />
              </div>
            </div>
          </section>
        </div>

        <div className="card" style={{ marginTop: 16 }}>
          <div className="card-body">
            <button
              className="btn secondary"
              style={{
                width: "100%",
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
              }}
              onClick={() => setOpenPerizia((v) => !v)}
            >
              <span>Perizia</span>
              <span style={{ opacity: 0.8 }}>{openPerizia ? "▲" : "▼"}</span>
            </button>

            {openPerizia && (
              <div style={{ marginTop: 12 }}>
                {!currentCar.isPeriziata ? (
                  <p className="muted" style={{ lineHeight: 1.6 }}>
                    Auto non ancora periziata, fai un'offerta e raggiungi un accordo
                    per la perizia!!!
                  </p>
                ) : (
                  <>
                    <p className="muted" style={{ lineHeight: 1.6 }}>
                      Auto periziata con successo, scarica il documento.
                    </p>

                    <button
                      className="btn"
                      style={{ marginTop: 10, minWidth: 220, height: 44 }}
                      onClick={downloadPerizia}
                    >
                      Scarica perizia (PDF)
                    </button>

                    {!isSignedIn && (
                      <p className="muted" style={{ marginTop: 10 }}>
                        Devi effettuare il login per scaricare la perizia.
                      </p>
                    )}
                  </>
                )}
              </div>
            )}
          </div>
        </div>

        {isSignedIn && clerkUserId && !isOwner && !isSold && (
          <div
            style={{
              display: "flex",
              justifyContent: "center",
              marginTop: 28,
              gap: 12,
              flexWrap: "wrap",
            }}
          >
            <button
              className="btn secondary"
              style={{ minWidth: 220, height: 48, fontSize: 16 }}
              onClick={async () => {
                const available = await checkCarAvailability();
                if (!available) return;

                setShowOfferPopup(true);
              }}
            >
              Fai un’offerta
            </button>
          </div>
        )}

        {showOfferPopup && (
          <AscariPopup
            title="Fai un'offerta"
            message="Seleziona uno dei prezzi proposti dal proprietario:"
            variant="info"
            confirmText="Chiudi"
            onClose={() => setShowOfferPopup(false)}
            maxWidth={560}
            showCloseButton={true}
          >
            <div
              style={{
                display: "flex",
                gap: 12,
                flexWrap: "wrap",
              }}
            >
              {[currentCar.offerPrice1, currentCar.offerPrice2, currentCar.offerPrice3]
                .filter((p) => p != null)
                .map((p, i) => (
                  <button
                    key={i}
                    className="btn secondary"
                    onClick={() => sendOffer(Number(p))}
                    style={{ minWidth: 120 }}
                  >
                    {p} €
                  </button>
                ))}
            </div>
          </AscariPopup>
        )}

        {thanksPopup && (
          <AscariPopup
            title="Offerta inviata!"
            message="Grazie per la tua offerta. Il proprietario ti risponderà al più presto."
            variant="success"
            confirmText="Chiudi"
            onClose={() => setThanksPopup(false)}
          />
        )}
      </div>

      {soldPopupOpen && (
        <AscariPopup
          title="Auto venduta"
          message="Ci dispiace, l’auto che stai guardando è stata venduta. Ecco delle alternative disponibili."
          variant="warning"
          confirmText="Torna alle auto disponibili"
          onClose={() => nav("/cars")}
          maxWidth={760}
          showCloseButton={false}
        >
          <div
            style={{
              display: "grid",
              gap: 14,
              gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
            }}
          >
            {alternatives.length > 0 ? (
              alternatives.map((alt) => (
                <button
                  key={alt.id}
                  type="button"
                  onClick={() => {
                    setSoldPopupOpen(false);
                    nav(`/cars/${alt.id}`);
                  }}
                  style={{
                    textAlign: "left",
                    border: "1px solid rgba(255,255,255,0.12)",
                    background: "rgba(255,255,255,0.04)",
                    borderRadius: 16,
                    overflow: "hidden",
                    padding: 0,
                    cursor: "pointer",
                    color: "white",
                  }}
                >
                  <img
                    src={imageForAlternative(alt)}
                    alt={`${alt.make} ${alt.model}`}
                    style={{
                      width: "100%",
                      height: 110,
                      objectFit: "cover",
                      display: "block",
                    }}
                  />

                  <div style={{ padding: 12 }}>
                    <div style={{ fontWeight: 900 }}>
                      {alt.title || `${alt.make} ${alt.model}`}
                    </div>

                    <div className="muted" style={{ marginTop: 4 }}>
                      {alt.make} {alt.model} · {alt.year}
                    </div>

                    {alt.priceEur ? (
                      <div style={{ color: "#34d399", fontWeight: 900, marginTop: 8 }}>
                        {formatEuro(alt.priceEur)}
                      </div>
                    ) : null}
                  </div>
                </button>
              ))
            ) : (
              <div
                style={{
                  padding: 16,
                  borderRadius: 16,
                  border: "1px solid rgba(255,255,255,0.12)",
                  background: "rgba(255,255,255,0.04)",
                }}
              >
                Al momento non ci sono alternative disponibili. Torna al catalogo per
                vedere tutte le auto.
              </div>
            )}
          </div>
        </AscariPopup>
      )}

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

function Spec({ label, value }: { label: string; value: any }) {
  return (
    <div className="kv">
      <span className="muted">{label}</span>
      <b>{value ?? "—"}</b>
    </div>
  );
}