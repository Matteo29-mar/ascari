// frontend/src/pages/Cars.tsx
import React, { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';

import { http, ping } from '../api';
import Carousel from '../components/Carousel/Carousel';
import { loadDrafts, removeDraft, DraftCar } from '../../lib/drafts';
import { useAuth, useClerk } from '@clerk/clerk-react';
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
  likedByMe?: boolean;        // 👈 AGGIUNTO
  owner?: {
    clerkId: string;
  };
};

export default function Cars() {
  const [list, setList] = useState<Car[]>([]);
  const [q, setQ] = useState('');
  const [radius, setRadius] = useState(5);
  const [pos, setPos] = useState<{ lat: number; lon: number } | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const nav = useNavigate();
  const [drafts, setDrafts] = useState<DraftCar[]>([]);

  const {
    userId: clerkUserId,
    isSignedIn,
    isLoaded,
    getToken,
  } = useAuth();
  const { openSignIn } = useClerk();


  // 🔥 LOAD ALL CON TOKEN
  async function loadAll() {
    const token = await getToken();
    const { data } = await http.get<Car[]>('/cars', {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
    setList(data);
  }

  // 1) carica lista auto e bozze
  useEffect(() => {
    loadAll();
    setDrafts(loadDrafts());
  }, [getToken]);

  // 2) sincronizza bozze nel DB quando utente è pronto
  useEffect(() => {
    if (!isLoaded) return;

    (async () => {
      try {
        await ping();
        const local = loadDrafts();
        if (!local.length) return;

        const token = await getToken();
        if (!token) return;

        for (const d of local) {
          await http.post(
            '/cars',
            {
              make: d.make,
              model: d.model,
              year: d.year,
              fuelType: d.fuelType,
              horsepower: d.horsepower,
              mileageKm: d.mileageKm,
              photos: d.photos,
              coverUrl: d.coverUrl,
              description: d.description,
              latitude: d.latitude,
              longitude: d.longitude,
            },
            { headers: { Authorization: `Bearer ${token}` } }
          );
          removeDraft(d.id);
        }

        setDrafts(loadDrafts());
        await loadAll();
      } catch (e) {
        console.error('Errore sync bozze → DB', e);
      }
    })();
  }, [isLoaded, getToken]);

  // 🔍 ricerca
  async function search() {
    setErr(null);
    setLoading(true);

    try {
      if (!q.trim()) {
        await loadAll();
        return;
      }

      const token = await getToken();
      const { data } = await http.get<Car[]>('/cars/search', {
        params: { query: q },
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      setList(data);
    } catch (e: any) {
      setErr(e?.message || 'Errore ricerca');
    } finally {
      setLoading(false);
    }
  }

  // ricerca avanzata
  async function searchAdvanced(filters: { brands: string[]; models: string[] }) {
  setLoading(true);
  setErr(null);

  try {
    const token = await getToken();

    const { data } = await http.get<Car[]>("/cars/filter", {
      params: {
        brands: filters.brands.join(","),   // Es: "Ferrari,Bugatti"
        models: filters.models.join(","),   // Es: "458,Chiron"
      },
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });

    setList(data);
  } catch (e: any) {
    setErr(e?.message || "Errore filtri");
  } finally {
    setLoading(false);
  }
}


  // 📍 geolocalizzazione
  async function nearby() {
    setErr(null);
    if (!navigator.geolocation) {
      setErr('Geolocalizzazione non supportata');
      return;
    }

    setLoading(true);
    navigator.geolocation.getCurrentPosition(
      async (p) => {
        try {
          const lat = p.coords.latitude;
          const lon = p.coords.longitude;
          setPos({ lat, lon });

          const { data } = await http.get<Car[]>('/cars/nearby', {
            params: { lat, lon, radiusKm: radius },
          });

          setList(data);
        } catch (e: any) {
          setErr(e?.message || 'Errore geolocalizzazione');
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
      openSignIn();   // 👈 apre il popup Clerk
      return;
    }
    nav('/cars/new');
  }


  // titolo della sezione risultati
  const resultsTitle = useMemo(() => {
    if (q.trim()) return `Risultati per “${q}”`;
    if (pos) return `A ${radius} km dalla tua posizione`;
    return 'Tutti i modelli';
  }, [q, pos, radius]);

  function slug(car: Car) {
    return `${car.make}-${car.model}`.toLowerCase().replace(/\s+/g, '-');
  }

  function defaultBySlug(car: Car) {
    const s = slug(car);
    return [1, 2, 3].map((i) => `/cars/${s}-${i}.jpg`);
  }

  function imagesForCard(car: Car) {
    const fromDb = Array.isArray(car.photos)
      ? car.photos.filter(Boolean)
      : [];

    let imgs = fromDb.length ? fromDb : defaultBySlug(car);

    if (car.coverUrl) {
      imgs = [car.coverUrl, ...imgs.filter((u) => u !== car.coverUrl)];
    }

    const seen = new Set<string>();
    const dedup = imgs.filter((u) => !seen.has(u) && seen.add(u));
    return dedup.length ? dedup : ['/cars/placeholder.jpg'];
  }

  return (
    <div>
      <h1 className="h1">Auto disponibili</h1>
      <p className="muted">Cerca un modello oppure mostra i veicoli nelle vicinanze.</p>
      <SearchBar
        onSearch={(filters) => {
          // filters = { brands: [...], models: [...] }
          searchAdvanced(filters);
        }}
      />
      {/* 🔍 toolbar */}
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

        {/* 👉 RESET spostato qui */}
        <button
          className="btn ghost"
          onClick={() => {
            setQ('');
            setPos(null);
            loadAll();
          }}
          style={{ marginLeft: 8 }}
        >
          Reset
        </button>

        <span style={{ width: 16 }} />

        <label className="muted" htmlFor="radius">Raggio</label>
        <input
          id="radius"
          className="input"
          type="number"
          min={1}
          max={100}
          value={radius}
          onChange={(e) => setRadius(parseInt(e.target.value))}
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


      {err && (
        <p style={{ color: 'var(--danger)', marginTop: 6 }}>{err}</p>
      )}

      <p className="muted" style={{ margin: '6px 0 0' }}>
        {resultsTitle} — <b>{list.length}</b> veicolo/i
      </p>

      {/* ⚠️ BOZZE */}
      {drafts.length > 0 && (
        <>
          <p className="muted" style={{ margin: '12px 0 0' }}>
            Bozze non sincronizzate — <b>{drafts.length}</b>
          </p>

          <div className="grid">
            {drafts.map((d) => (
              <article key={d.id} className="card" title="Bozza locale">
                <div className="card-body">
                  <div className="row space">
                    <div className="flex">
                      <span className="tag">{d.make}</span>
                      <h3 style={{ margin: '0 0 0 2px' }}>{d.model}</h3>
                    </div>
                    <span className="tag">{d.year}</span>
                  </div>

                  <div className="card" style={{ marginTop: 8 }}>
                    {d.photos?.[0] ? (
                      <img
                        src={d.coverUrl || d.photos[0]}
                        alt="cover"
                        style={{ width: '100%', display: 'block', borderRadius: 12 }}
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
        {list.map((car) => {
          const isMine =
            isSignedIn && car.owner && car.owner.clerkId === clerkUserId;

          return (
            <article className="card" key={car.id}>
              <Carousel
                images={imagesForCard(car)}
                alt={`${car.make} ${car.model}`}
              />

              <div className="card-body">
                <div className="row space">
                  <div className="flex">
                    <span className="tag">{car.make}</span>
                    <h3 style={{ margin: '0 0 0 2px' }}>{car.model}</h3>
                  </div>
                  <span className="tag">{car.year}</span>
                </div>

                <div className="row" style={{ marginTop: 10, flexWrap: 'wrap' }}>
                  {/* per id ma oscurato nel frontend */}
                  {/* <div className="kv">
                    <span className="muted">ID</span> <b>#{car.id}</b>
                  </div> */}
                  <div className="kv">
                    <span className="muted">Posizione</span>
                    <b>
                      {car.latitude != null && car.longitude != null
                        ? `${car.latitude.toFixed(4)}, ${car.longitude.toFixed(4)}`
                        : '-'}
                    </b>
                  </div>
                  <div className="kv">
                    <span className="muted">Distanza</span>
                    <b>{car.distanceKm != null ? `${car.distanceKm} km` : '—'}</b>
                  </div>
                </div>

                <div className="footer-actions">
                  <Link className="btn" to={`/cars/${car.id}`}>
                    Dettaglio modello
                  </Link>
                  {/* ❤️ LIKE BUTTON */}
                  {isSignedIn && (
                    <LikeButton
                      carId={car.id}
                      initialLiked={car.likedByMe ?? false}
                      onChange={(newLiked) => {
                        setList((prev) =>
                          prev.map((c) =>
                            c.id === car.id
                              ? { ...c, likedByMe: newLiked }
                              : c
                          )
                        );
                      }}
                    />
                  )}

                  {/* ✏️ Modifica (solo sulle mie auto) */}
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
        Suggerimento: aggiungi immagini in <code>/public/cars</code> (es.{' '}
        <code>ascari-gt-1.jpg</code>, <code>ascari-gt-2.jpg</code>, …). Se mancano,
        verrà mostrato <code>placeholder.jpg</code>.
      </p>
    </div>
  );
}
