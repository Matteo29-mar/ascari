import React, { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useAuth } from "@clerk/clerk-react";
import { http } from "../api";
import { useRole } from "../hooks/useRole";

export type DealerProfileData = {
  id: string;
  dealerName: string;
  businessName?: string | null;
  vatNumber?: string | null;
  description?: string | null;
  logoUrl?: string | null;
  address: string;
  city: string;
  province?: string | null;
  country?: string | null;
  email: string;
  phone: string;
  website?: string | null;
  latitude?: number | null;
  longitude?: number | null;
};

type DealerReview = {
  id: number;
  rating: number;
  comment?: string | null;
  createdAt: string;
  updatedAt: string;
  authorName: string;
  isMine?: boolean;
};

type ReviewSummary = {
  average: number;
  count: number;
};

type DealerCar = {
  id: number;
  make: string;
  model: string;
  title: string;
  year: number;
  priceEur?: number | null;
  offerPrice1?: number | null;
  offerPrice2?: number | null;
  offerPrice3?: number | null;
  mileageKm?: number | null;
  fuelType?: string | null;
  transmission?: string | null;
  city?: string | null;
  coverUrl?: string | null;
  photos?: string[] | null;
  isPeriziata?: boolean;
};

function carImage(car: DealerCar) {
  return car.coverUrl || car.photos?.[0] || "/cars/placeholder.jpg";
}

function formatEuro(value?: number | null) {
  if (!value) return null;
  return new Intl.NumberFormat("it-IT", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 0,
  }).format(value);
}

function websiteHref(value?: string | null) {
  if (!value) return null;
  return /^https?:\/\//i.test(value) ? value : `https://${value}`;
}

export default function DealerProfile({ mine = false }: { mine?: boolean }) {
  const { id } = useParams();
  const nav = useNavigate();
  const { getToken, isSignedIn } = useAuth();
  const { role } = useRole();

  const [dealer, setDealer] = useState<DealerProfileData | null>(null);
  const [cars, setCars] = useState<DealerCar[]>([]);
  const [carCount, setCarCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [reviews, setReviews] = useState<DealerReview[]>([]);
  const [reviewSummary, setReviewSummary] = useState<ReviewSummary>({ average: 0, count: 0 });
  const [reviewRating, setReviewRating] = useState(5);
  const [reviewComment, setReviewComment] = useState("");
  const [reviewSaving, setReviewSaving] = useState(false);
  const [reviewMessage, setReviewMessage] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      setLoading(true);
      setErr(null);
      try {
        let response;
        if (mine) {
          const token = await getToken();
          if (!token) throw new Error("Autenticazione richiesta");
          response = await http.get("/dealers/me", {
            headers: { Authorization: `Bearer ${token}` },
          });
        } else {
          if (!id) throw new Error("Concessionaria non valida");
          const token = await getToken();
          response = await http.get(`/dealers/${id}`, {
            headers: token ? { Authorization: `Bearer ${token}` } : undefined,
          });
        }

        if (cancelled) return;
        setDealer(response.data?.dealer ?? null);
        setCars(Array.isArray(response.data?.cars) ? response.data.cars : []);
        setCarCount(Number(response.data?.carCount ?? response.data?.cars?.length ?? 0));
        setReviews(Array.isArray(response.data?.reviews) ? response.data.reviews : []);
        setReviewSummary(response.data?.reviewSummary ?? { average: 0, count: 0 });
        const mineReview = Array.isArray(response.data?.reviews)
          ? response.data.reviews.find((review: DealerReview) => review.isMine)
          : null;
        if (mineReview) {
          setReviewRating(mineReview.rating);
          setReviewComment(mineReview.comment || "");
        }
      } catch (e: any) {
        if (!cancelled) {
          setErr(e?.response?.data?.error || e?.message || "Errore caricamento concessionaria");
          setDealer(null);
          setCars([]);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [mine, id, getToken]);

  const addressText = useMemo(() => {
    if (!dealer) return "";
    return [dealer.address, dealer.city, dealer.province, dealer.country]
      .filter(Boolean)
      .join(", ");
  }, [dealer]);

  async function copyAddress() {
    if (!addressText) return;
    try {
      await navigator.clipboard.writeText(addressText);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      setCopied(false);
    }
  }

  async function submitReview(e: React.FormEvent) {
    e.preventDefault();
    if (!id || mine) return;
    setReviewSaving(true);
    setReviewMessage(null);
    try {
      const token = await getToken();
      if (!token) throw new Error("Accedi per lasciare una recensione");
      const { data } = await http.post(
        `/dealers/${id}/reviews`,
        { rating: reviewRating, comment: reviewComment.trim() || null },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      setReviews(Array.isArray(data?.reviews) ? data.reviews : []);
      setReviewSummary(data?.reviewSummary ?? { average: 0, count: 0 });
      setReviewMessage("Recensione salvata correttamente.");
    } catch (e: any) {
      setReviewMessage(e?.response?.data?.error || e?.message || "Errore salvataggio recensione");
    } finally {
      setReviewSaving(false);
    }
  }

  const canReview = !mine && isSignedIn && role !== "CONCESSIONARIO" && role !== "PERIZIATORE";

  if (loading) return <div className="container">Caricamento concessionaria…</div>;

  if (err) {
    return (
      <div className="container">
        <div className="card">
          <div className="card-body">
            <h1 className="h1">Concessionaria</h1>
            <p style={{ color: "var(--danger)" }}>{err}</p>
            <button className="btn secondary" onClick={() => nav("/cars")}>Torna alle auto</button>
          </div>
        </div>
      </div>
    );
  }

  if (!dealer) {
    return (
      <div className="container dealer-empty-profile">
        <h1 className="h1">Profilo concessionario non configurato</h1>
        <p className="muted">Completa i dati dell'attività per creare la tua vetrina pubblica.</p>
        {mine && (
          <Link className="btn" to="/dealer/register">
            Crea profilo concessionario
          </Link>
        )}
      </div>
    );
  }

  const mapsHref = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(addressText)}`;
  const siteHref = websiteHref(dealer.website);

  return (
    <div className="dealer-profile-page">
      <section className="dealer-profile-hero card">
        <div className="dealer-profile-hero-main">
          <div className="dealer-profile-logo">
            {dealer.logoUrl ? (
              <img src={dealer.logoUrl} alt={`Logo ${dealer.dealerName}`} />
            ) : (
              <span>{dealer.dealerName.slice(0, 2).toUpperCase()}</span>
            )}
          </div>

          <div className="dealer-profile-heading">
            <span className="dealer-profile-kicker">CONCESSIONARIO ASCARI</span>
            <h1>{dealer.dealerName}</h1>
            {dealer.businessName && <p className="dealer-business-name">{dealer.businessName}</p>}
            {dealer.description && <p className="muted dealer-profile-description">{dealer.description}</p>}
          </div>

          {mine && (
            <Link className="btn secondary dealer-edit-profile" to="/dealer/register">
              Modifica profilo
            </Link>
          )}
        </div>

        <div className="dealer-profile-stats">
          <div>
            <strong>{carCount}</strong>
            <span>Auto in vendita</span>
          </div>
          <div>
            <strong>{dealer.city}</strong>
            <span>Sede</span>
          </div>
          <div>
            <strong>{reviewSummary.count > 0 ? `${reviewSummary.average.toFixed(1)} ★` : "—"}</strong>
            <span>{reviewSummary.count} recensioni</span>
          </div>
        </div>
      </section>

      <section className="dealer-profile-info-grid">
        <div className="card dealer-info-card">
          <div className="card-body">
            <h2>Indirizzo</h2>
            <p>{addressText}</p>
            <div className="dealer-info-actions">
              <button type="button" className="btn secondary" onClick={copyAddress}>
                {copied ? "Copiato ✓" : "Copia indirizzo"}
              </button>
              <a className="btn ghost" href={mapsHref} target="_blank" rel="noreferrer">
                Apri in Maps
              </a>
            </div>
          </div>
        </div>

        <div className="card dealer-info-card">
          <div className="card-body">
            <h2>Contatti</h2>
            <div className="dealer-contact-list">
              <a href={`tel:${dealer.phone}`}>{dealer.phone}</a>
              <a href={`mailto:${dealer.email}`}>{dealer.email}</a>
              {siteHref && (
                <a href={siteHref} target="_blank" rel="noreferrer">
                  {dealer.website}
                </a>
              )}
            </div>
            {dealer.vatNumber && <small className="muted">P. IVA: {dealer.vatNumber}</small>}
          </div>
        </div>
      </section>

      <section className="dealer-reviews-section card">
        <div className="card-body">
          <div className="dealer-reviews-heading">
            <div>
              <span className="dealer-profile-kicker">RECENSIONI</span>
              <h2>Esperienze con la concessionaria</h2>
            </div>
            <div className="dealer-rating-summary">
              <strong>{reviewSummary.count > 0 ? reviewSummary.average.toFixed(1) : "—"} ★</strong>
              <span>{reviewSummary.count} recensioni</span>
            </div>
          </div>

          {canReview && (
            <form className="dealer-review-form" onSubmit={submitReview}>
              <div className="dealer-review-stars" aria-label="Valutazione da 1 a 5">
                {[1, 2, 3, 4, 5].map((star) => (
                  <button
                    key={star}
                    type="button"
                    className={star <= reviewRating ? "selected" : ""}
                    onClick={() => setReviewRating(star)}
                    aria-label={`${star} stelle`}
                  >
                    ★
                  </button>
                ))}
              </div>
              <textarea
                className="input"
                rows={4}
                maxLength={1500}
                value={reviewComment}
                onChange={(e) => setReviewComment(e.target.value)}
                placeholder="Racconta la tua esperienza con questa concessionaria..."
              />
              <button className="btn" type="submit" disabled={reviewSaving}>
                {reviewSaving ? "Salvataggio…" : "Salva recensione"}
              </button>
              {reviewMessage && <span className="muted">{reviewMessage}</span>}
            </form>
          )}

          {!isSignedIn && !mine && (
            <p className="muted">Accedi con un profilo privato per lasciare una recensione.</p>
          )}
          {isSignedIn && !canReview && !mine && (
            <p className="muted">Solo gli utenti privati possono pubblicare recensioni.</p>
          )}

          <div className="dealer-review-list">
            {reviews.map((review) => (
              <article className="dealer-review-item" key={review.id}>
                <div>
                  <strong>{review.authorName}</strong>
                  <span>{"★".repeat(review.rating)}{"☆".repeat(5 - review.rating)}</span>
                </div>
                {review.comment && <p>{review.comment}</p>}
                <small>{new Date(review.updatedAt || review.createdAt).toLocaleDateString("it-IT")}</small>
              </article>
            ))}
            {reviews.length === 0 && <p className="muted">Nessuna recensione ancora.</p>}
          </div>
        </div>
      </section>

      <section className="dealer-cars-section">
        <div className="dealer-cars-heading">
          <div>
            <span className="dealer-profile-kicker">GARAGE PUBBLICO</span>
            <h2>Auto disponibili</h2>
          </div>
          <span className="tag">{carCount} veicoli</span>
        </div>

        {cars.length === 0 ? (
          <div className="card">
            <div className="card-body muted">Al momento questa concessionaria non ha auto disponibili.</div>
          </div>
        ) : (
          <div className="grid dealer-cars-grid">
            {cars.map((car) => {
              const offers = [car.offerPrice1, car.offerPrice2, car.offerPrice3]
                .filter((v): v is number => typeof v === "number" && v > 0)
                .sort((a, b) => a - b);
              const displayPrice = formatEuro(car.priceEur) || (offers[0] ? `Offerte da ${formatEuro(offers[0])}` : null);

              return (
                <article className="card dealer-car-card" key={car.id}>
                  <Link to={`/cars/${car.id}`} className="dealer-car-image-link">
                    <img src={carImage(car)} alt={car.title || `${car.make} ${car.model}`} />
                    <span className="dealer-car-badge">Concessionario</span>
                  </Link>

                  <div className="card-body">
                    <div className="row space">
                      <div>
                        <span className="tag">{car.make}</span>
                        <h3>{car.model}</h3>
                      </div>
                      <span className="tag">{car.year}</span>
                    </div>

                    <p className="muted dealer-car-title">{car.title}</p>

                    <div className="dealer-car-meta">
                      {car.mileageKm != null && <span>{car.mileageKm.toLocaleString("it-IT")} km</span>}
                      {car.fuelType && <span>{car.fuelType}</span>}
                      {car.city && <span>{car.city}</span>}
                    </div>

                    {displayPrice && <div className="dealer-car-price">{displayPrice}</div>}

                    <Link className="btn" to={`/cars/${car.id}`}>
                      Vedi auto
                    </Link>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
