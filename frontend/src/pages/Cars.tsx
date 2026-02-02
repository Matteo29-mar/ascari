// frontend/src/pages/Cars.tsx
import React, { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";

import { http, ping } from "../api";
import Carousel from "../components/Carousel/Carousel";
import { loadDrafts, removeDraft, DraftCar } from "../../lib/drafts";
import { useAuth, useClerk } from "@clerk/clerk-react";
import LikeButton from "../components/LikeButton";
import SearchBar from "../components/Search/SearchBar";

type Car = {
  id: number;
  make: string;
  model: string;
  year: number;
  latitude?: number | null;
  longitude?: number | null;
  distanceKm?: number | null;
  photos?: string[] | null;
  coverUrl?: string | null;
  likedByMe?: boolean;
  owner?: { clerkId: string };
};

// ✅ helper: qualunque forma ritorni il backend, estraiamo un array
function normalizeCars(payload: any): Car[] {
  if (Array.isArray(payload)) return payload;

  // casi comuni: { cars: [...] } / { items: [...] } / { data: [...] }
  if (payload && Array.isArray(payload.cars)) return payload.cars;
  if (payload && Array.isArray(payload.items)) return payload.items;
  if (payload && Array.isArray(payload.data)) return payload.data;

  return [];
}

// ✅ cast numerico safe (evita NaN)
function toNum(v: any): number | undefined {
  if (v === null || v === undefined || v === "") return undefined;
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
}

// ✅ rimuove chiavi undefined (Prisma/validator spesso le odia)
function stripUndefined<T extends Record<string, any>>(obj: T): T {
  Object.keys(obj).forEach((k) => obj[k] === undefined && delete obj[k]);
  return obj;
}

// ✅ costruisce payload bozza -> API
function draftToPayload(d: DraftCar) {
  const payload: any = {
    make: d.make,
    model: d.model,
    // molti backend richiedono title: se non esiste nella bozza lo generiamo
    title: (d as any).title ?? `${d.make} ${d.model}`,

    year: toNum((d as any).year),
    fuelType: (d as any).fuelType ?? undefined,
    horsepower: toNum((d as any).horsepower),
    mileageKm: toNum((d as any).mileageKm),

    photos: (d as any).photos ?? undefined,
    coverUrl: (d as any).coverUrl ?? undefined,
    description: (d as any).description ?? undefined,

    latitude: toNum((d as any).latitude),
    longitude: toNum((d as any).longitude),

    // se in futuro aggiungi campi obbligatori lato backend, aggiungili qui:
    // offerPrice1: toNum((d as any).offerPrice1),
    // offerPrice2: toNum((d as any).offerPrice2),
    // offerPrice3: toNum((d as any).offerPrice3),
  };

  return stripUndefined(payload);
}

export default function Cars() {
  const [list, setList] = useState<Car[]>([]);
  const [q, setQ] = useState("");
  const [radius, setRadius] = useState(5);
  const [pos, setPos] = useState<{ lat: number; lon: number } | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const nav = useNavigate();
  const [drafts, setDrafts] = useState<DraftCar[]>([]);

  const { userId: clerkUserId, isSignedIn, isLoaded, getToken } = useAuth();
  const { openSignIn } = useClerk();

  async function loadAll() {
    setErr(null);
    setLoading(true);
    try {
      const token = await getToken();
      const res = await http.get("/cars", {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });

      const cars = normalizeCars(res.data);
      setList(cars);
    } catch (e: any) {
      console.error("Errore loadAll", e);
      console.error("Backend response:", e?.response?.data);
      setErr(e?.response?.data?.error || e?.message || "Errore caricamento auto");
      setList([]); // ✅ evita crash UI
    } finally {
      setLoading(false);
    }
  }

  // 1) carica lista auto e bozze
  useEffect(() => {
    if (!isLoaded) return;
    loadAll();
    setDrafts(loadDrafts());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLoaded]);

  // 2) sincronizza bozze nel DB quando utente è pronto E loggato
  useEffect(() => {
    if (!isLoaded || !isSignedIn) return;

    (async () => {
      try {
        await ping();

        const local = loadDrafts();
        if (!local.length) return;

        const token = await getToken();
        if (!token) return;

        // tenta sync di tutte le bozze: se una fallisce non blocca le altre
        const failed: { id: string; reason: any }[] = [];

        for (const d of local) {
          try {
            const payload = draftToPayload(d);

            await http.post("/cars", payload, {
              headers: { Authorization: `Bearer ${token}` },
            });

            removeDraft(d.id);
          } catch (e: any) {
            console.error("Sync bozza fallita:", d.id, e);
            console.error("Backend response:", e?.response?.data);
            failed.push({ id: d.id, reason: e?.response?.data || e?.message || e });
          }
        }

        // aggiorna lista bozze rimaste + reload DB
        setDrafts(loadDrafts());
        await loadAll();

        // opzionale: mostra un errore soft se qualcosa non è andato
        if (failed.length) {
          setErr(
            `Alcune bozze non sono state sincronizzate (${failed.length}). Aprile e correggi i campi obbligatori.`
          );
        }
      } catch (e: any) {
        console.error("Errore sync bozze → DB", e);
        console.error("Backend response:", e?.response?.data);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLoaded, isSignedIn]);

  async function search() {
    setErr(null);
    setLoading(true);

    try {
      if (!q.trim()) {
        await loadAll();
        return;
      }

      const token = await getToken();
      const res = await http.get("/cars/search", {
        params: { query: q },
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });

      setList(normalizeCars(res.data));
    } catch (e: any) {
      console.error("Errore search", e);
      console.error("Backend response:", e?.response?.data);
      setErr(e?.response?.data?.error || e?.message || "Errore ricerca");
      setList([]);
    } finally {
      setLoading(false);
    }
  }

  async function searchAdvanced(filters: { brands: string[]; models: string[] }) {
    setLoading(true);
    setErr(null);

    try {
      const token = await getToken();

      const res = await http.get("/cars/filter", {
        params: {
          brands: filters.brands.join(","),
          models: filters.models.join(","),
        },
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });

      setList(normalizeCars(res.data));
    } catch (e: any) {
      console.error("Errore searchAdvanced", e);
      console.error("Backend response:", e?.response?.data);
      setErr(e?.response?.data?.error || e?.message || "Errore filtri");
      setList([]);
    } finally {
      setLoading(false);
    }
  }

  async function nearby() {
    setErr(null);
    if (!navigator.geolocation) {
      setErr("Geolocalizzazione non supportata");
      return;
    }

    setLoading(true);
    navigator.geolocation.getCurrentPosition(
      async (p) => {
        try {
          const lat = p.coords.latitude;
          const lon = p.coords.longitude;
          setPos({ lat, lon });

          const res = await http.get("/cars/nearby", {
            params: { lat, lon, radiusKm: radius },
          });

          setList(normalizeCars(res.data));
        } catch (e: any) {
          console.error("Errore nearby", e);
          console.error("Backend response:", e?.response?.data);
          setErr(e?.response?.data?.error || e?.message || "Errore geolocalizzazione");
          setList([]);
        } finally {
          setLoading(false);
        }
      },
      (e) => {
        setErr(e.message);
        setLoading(false);
      }
    );
  }

  function goToNew() {
    if (!isSignedIn) {
      openSignIn();
      return;
    }
    nav("/cars/new");
  }

  const resultsTitle = useMemo(() => {
    if (q.trim()) return `Risultati per “${q}”`;
    if (pos) return `A ${radius} km dalla tua posizione`;
    return "Tutti i modelli";
  }, [q, pos, radius]);

  function slug(car: Car) {
    return `${car.make}-${car.model}`.toLowerCase().replace(/\s+/g, "-");
  }

  function defaultBySlug(car: Car) {
    const s = slug(car);
    return [1, 2, 3].map((i) => `/cars/${s}-${i}.jpg`);
  }

  function imagesForCard(car: Car) {
    const fromDb = Array.isArray(car.photos) ? car.photos.filter(Boolean) : [];
    let imgs = fromDb.length ? fromDb : defaultBySlug(car);

    if (car.coverUrl) {
      imgs = [car.coverUrl, ...imgs.filter((u) => u !== car.coverUrl)];
    }

    const seen = new Set<string>();
    const dedup = imgs.filter((u) => !seen.has(u) && seen.add(u));
    return dedup.length ? dedup : ["/cars/placeholder.jpg"];
  }

  return (
    <div>
      <h1 className="h1">Auto disponibili</h1>
      <p className="muted">Cerca un modello oppure mostra i veicoli nelle vicinanze.</p>

      <SearchBar
        onSearch={(filters) => {
          searchAdvanced(filters);
        }}
      />

      <div className="toolbar">
        <input
          className="input"
          placeholder="Cerca per marca o modello (es. Ascari GT)"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          style={{ minWidth: 280 }}
        />

        <button className="btn" onClick={search} disabled={loading}>
          Cerca
        </button>

        <button
          className="btn ghost"
          onClick={() => {
            setQ("");
            setPos(null);
            loadAll();
          }}
          style={{ marginLeft: 8 }}
        >
          Reset
        </button>

        <span style={{ width: 16 }} />

        <label className="muted" htmlFor="radius">
          Raggio
        </label>
        <input
          id="radius"
          className="input"
          type="number"
          min={1}
          max={100}
          value={radius}
          onChange={(e) => setRadius(parseInt(e.target.value || "5", 10))}
          style={{ width: 90 }}
        />
        <span className="tag">km</span>

        <button className="btn secondary" onClick={nearby} disabled={loading}>
          Vicino a me
        </button>

        {pos && (
          <small className="muted">
            (lat: {pos.lat.toFixed(4)}, lon: {pos.lon.toFixed(4)})
          </small>
        )}

        <div style={{ flex: 1 }} />

        <button className="btn" onClick={goToNew}>
          + Nuovo
        </button>
      </div>

      {err && <p style={{ color: "var(--danger)", marginTop: 6 }}>{err}</p>}

      <p className="muted" style={{ margin: "6px 0 0" }}>
        {resultsTitle} — <b>{Array.isArray(list) ? list.length : 0}</b> veicolo/i
      </p>

      {/* ⚠️ BOZZE */}
      {drafts.length > 0 && (
        <>
          <p className="muted" style={{ margin: "12px 0 0" }}>
            Bozze non sincronizzate — <b>{drafts.length}</b>
          </p>

          <div className="grid">
            {drafts.map((d) => (
              <article key={d.id} className="card" title="Bozza locale">
                <div className="card-body">
                  <div className="row space">
                    <div className="flex">
                      <span className="tag">{d.make}</span>
                      <h3 style={{ margin: "0 0 0 2px" }}>{d.model}</h3>
                    </div>
                    <span className="tag">{(d as any).year}</span>
                  </div>

                  <div className="card" style={{ marginTop: 8 }}>
                    {d.photos?.[0] ? (
                      <img
                        src={(d as any).coverUrl || d.photos[0]}
                        alt="cover"
                        style={{ width: "100%", display: "block", borderRadius: 12 }}
                      />
                    ) : (
                      <div style={{ height: 180 }} />
                    )}
                  </div>

                  <div className="row" style={{ marginTop: 10 }}>
                    <span className="tag">Bozza</span>
                    <small className="muted">non salvata nel DB</small>
                  </div>

                  <div className="footer-actions">
                    <Link className="btn" to={`/cars/new?draft=${d.id}`}>
                      Apri / Modifica
                    </Link>

                    <button
                      className="btn secondary"
                      onClick={() => {
                        removeDraft(d.id);
                        setDrafts(loadDrafts());
                      }}
                    >
                      Elimina
                    </button>
                  </div>
                </div>
              </article>
            ))}
          </div>
        </>
      )}

      {/* 🔥 LISTA AUTO */}
      <div className="grid">
        {(Array.isArray(list) ? list : []).map((car) => {
          const isMine = isSignedIn && car.owner && car.owner.clerkId === clerkUserId;

          return (
            <article className="card" key={car.id}>
              <Carousel images={imagesForCard(car)} alt={`${car.make} ${car.model}`} />

              <div className="card-body">
                <div className="row space">
                  <div className="flex">
                    <span className="tag">{car.make}</span>
                    <h3 style={{ margin: "0 0 0 2px" }}>{car.model}</h3>
                  </div>
                  <span className="tag">{car.year}</span>
                </div>

                <div className="footer-actions">
                  <Link className="btn" to={`/cars/${car.id}`}>
                    Dettaglio modello
                  </Link>

                  {isSignedIn && (
                    <LikeButton
                      carId={car.id}
                      initialLiked={car.likedByMe ?? false}
                      onChange={(newLiked) => {
                        setList((prev) =>
                          (Array.isArray(prev) ? prev : []).map((c) =>
                            c.id === car.id ? { ...c, likedByMe: newLiked } : c
                          )
                        );
                      }}
                    />
                  )}

                  {isMine && (
                    <Link className="btn secondary" to={`/cars/edit/${car.id}`}>
                      Modifica
                    </Link>
                  )}
                </div>
              </div>
            </article>
          );
        })}
      </div>

      <p className="muted" style={{ marginTop: 18 }}>
        Suggerimento: aggiungi immagini in <code>/public/cars</code> (es.{" "}
        <code>ascari-gt-1.jpg</code>, <code>ascari-gt-2.jpg</code>, …). Se mancano,
        verrà mostrato <code>placeholder.jpg</code>.
      </p>
    </div>
  );
}
