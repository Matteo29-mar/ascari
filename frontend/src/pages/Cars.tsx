// frontend/src/pages/Cars.tsx
import React, { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";

import { http, ping } from "../api";
import Carousel from "../components/Carousel/Carousel";
import { loadDrafts, removeDraft, DraftCar } from "../../lib/drafts";
import { useAuth, useClerk } from "@clerk/clerk-react";
import LikeButton from "../components/LikeButton";
import SearchBar from "../components/Search/SearchBar";
import HomeHeroCarousel from "../components/HomeHeroCarousel";
import ShareButton from "../components/ShareButton/ShareButton";

type Car = {
  id: number;
  make: string;
  model: string;
  title?: string | null;
  year: number;
  priceEur?: number | null;
  offerPrice1?: number | null;
  offerPrice2?: number | null;
  offerPrice3?: number | null;
  latitude?: number | null;
  longitude?: number | null;
  distanceKm?: number | null;
  photos?: string[] | null;
  coverUrl?: string | null;
  likedByMe?: boolean;
  owner?: { clerkId: string };
  paymentStatus?: string | null;
  marketStatus?: "AVAILABLE" | "SOLD_PENDING_REMOVAL" | "REMOVED_AFTER_SALE";
  soldAt?: string | null;
  removalScheduledAt?: string | null;
  visuallyRemovedAt?: string | null;
};

type PaginatedCarsResponse = {
  items: Car[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
};

type SearchFilters = {
  brands: string[];
  models: string[];
  fuelTypes: string[];
  transmissions: string[];
  yearMin?: number;
  yearMax?: number;
  mileageMin?: number;
  mileageMax?: number;
  horsepowerMin?: number;
  horsepowerMax?: number;
};

type ViewMode = "all" | "search" | "filter" | "nearby";

function normalizeCarsResponse(payload: any): PaginatedCarsResponse {
  if (Array.isArray(payload)) {
    return {
      items: payload,
      total: payload.length,
      page: 1,
      pageSize: payload.length || 6,
      totalPages: 1,
    };
  }

  if (payload && Array.isArray(payload.items)) {
    return {
      items: payload.items,
      total: Number(payload.total ?? payload.items.length ?? 0),
      page: Number(payload.page ?? 1),
      pageSize: Number(payload.pageSize ?? 6),
      totalPages: Number(payload.totalPages ?? 1),
    };
  }

  if (payload && Array.isArray(payload.cars)) {
    return {
      items: payload.cars,
      total: Number(payload.total ?? payload.cars.length ?? 0),
      page: Number(payload.page ?? 1),
      pageSize: Number(payload.pageSize ?? 6),
      totalPages: Number(payload.totalPages ?? 1),
    };
  }

  if (payload && Array.isArray(payload.data)) {
    return {
      items: payload.data,
      total: Number(payload.total ?? payload.data.length ?? 0),
      page: Number(payload.page ?? 1),
      pageSize: Number(payload.pageSize ?? 6),
      totalPages: Number(payload.totalPages ?? 1),
    };
  }

  return {
    items: [],
    total: 0,
    page: 1,
    pageSize: 6,
    totalPages: 1,
  };
}

function toNum(v: any): number | undefined {
  if (v === null || v === undefined || v === "") return undefined;
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
}

function stripUndefined<T extends Record<string, any>>(obj: T): T {
  Object.keys(obj).forEach((k) => obj[k] === undefined && delete obj[k]);
  return obj;
}

function draftToPayload(d: DraftCar) {
  const payload: any = {
    make: d.make,
    model: d.model,
    title: (d as any).title ?? `${d.make} ${d.model}`,
    year: toNum((d as any).year),
    fuelType: (d as any).fuelType ?? undefined,
    transmission: (d as any).transmission ?? undefined,
    horsepower: toNum((d as any).horsepower),
    mileageKm: toNum((d as any).mileageKm),
    photos: (d as any).photos ?? undefined,
    coverUrl: (d as any).coverUrl ?? undefined,
    description: (d as any).description ?? undefined,
    latitude: toNum((d as any).latitude),
    longitude: toNum((d as any).longitude),
  };

  return stripUndefined(payload);
}

function isCatalogAvailable(car: any) {
  return (
    (!car.marketStatus || car.marketStatus === "AVAILABLE") &&
    car.paymentStatus !== "SOLD" &&
    !car.soldAt &&
    !car.visuallyRemovedAt
  );
}

export default function Cars() {
  const [list, setList] = useState<Car[]>([]);
  const [q, setQ] = useState("");
  const [radius, setRadius] = useState(5);
  const [pos, setPos] = useState<{ lat: number; lon: number } | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const latestRequestRef = useRef(0);
  const didInitialLoadRef = useRef(false);
  const didDraftSyncRef = useRef(false);
  const nav = useNavigate();
  const [drafts, setDrafts] = useState<DraftCar[]>([]);
  const [mobileAdvancedOpen, setMobileAdvancedOpen] = useState(false);

  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState<6 | 9 | 12>(6);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);

  const [viewMode, setViewMode] = useState<ViewMode>("all");
  const [activeFilters, setActiveFilters] = useState<SearchFilters>({
    brands: [],
    models: [],
    fuelTypes: [],
    transmissions: [],
  });

  const { userId: clerkUserId, isSignedIn, isLoaded, getToken } = useAuth();
  const { openSignIn } = useClerk();

  async function getAuthHeaders() {
    const token = await getToken();
    return token ? { Authorization: `Bearer ${token}` } : {};
  }

function applyCarsResponse(payload: any) {
  const normalized = normalizeCarsResponse(payload);
  const visibleItems = normalized.items.filter(isCatalogAvailable);

  setList(visibleItems);

  setTotal(normalized.total);
  setPage(normalized.page);
  setTotalPages(normalized.totalPages);
}

async function loadAll(nextPage = page, nextPageSize = pageSize) {
  const requestId = ++latestRequestRef.current;

  setErr(null);
  setLoading(true);

  try {
          const token = isSignedIn ? await getToken() : null;

      const res = await http.get("/cars", {
        params: { page: nextPage, pageSize: nextPageSize },
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });

    // Se nel frattempo è partita un'altra richiesta, ignoro questa risposta vecchia.
    if (requestId !== latestRequestRef.current) return;

    applyCarsResponse(res.data);
    setViewMode("all");
  } catch (e: any) {
    if (requestId !== latestRequestRef.current) return;

    console.error("Errore loadAll", e);
    console.error("Backend response:", e?.response?.data);

    setErr(e?.response?.data?.error || e?.message || "Errore caricamento auto");
    setList([]);
    setTotal(0);
    setTotalPages(1);
  } finally {
    if (requestId === latestRequestRef.current) {
      setLoading(false);
    }
  }
}

  async function runSearch(nextPage = page, nextPageSize = pageSize, nextQuery = q) {
    setErr(null);
    setLoading(true);

    try {
      if (!nextQuery.trim()) {
        await loadAll(nextPage, nextPageSize);
        return;
      }

      const headers = await getAuthHeaders();
      const res = await http.get("/cars/search", {
        params: {
          query: nextQuery,
          page: nextPage,
          pageSize: nextPageSize,
        },
        headers,
      });

      applyCarsResponse(res.data);
      setViewMode("search");
    } catch (e: any) {
      console.error("Errore search", e);
      console.error("Backend response:", e?.response?.data);
      setErr(e?.response?.data?.error || e?.message || "Errore ricerca");
      setList([]);
      setTotal(0);
      setTotalPages(1);
    } finally {
      setLoading(false);
    }
  }

  async function runAdvancedSearch(
    filters: SearchFilters,
    nextPage = page,
    nextPageSize = pageSize
  ) {
    setLoading(true);
    setErr(null);

    try {
      const headers = await getAuthHeaders();

      const params = stripUndefined({
        brands: filters.brands.length ? filters.brands.join(",") : undefined,
        models: filters.models.length ? filters.models.join(",") : undefined,
        fuelTypes: filters.fuelTypes.length ? filters.fuelTypes.join(",") : undefined,
        transmissions: filters.transmissions.length
          ? filters.transmissions.join(",")
          : undefined,
        yearMin: filters.yearMin,
        yearMax: filters.yearMax,
        mileageMin: filters.mileageMin,
        mileageMax: filters.mileageMax,
        horsepowerMin: filters.horsepowerMin,
        horsepowerMax: filters.horsepowerMax,
        page: nextPage,
        pageSize: nextPageSize,
      });

      const res = await http.get("/cars/filter", {
        params,
        headers,
      });

      applyCarsResponse(res.data);
      setActiveFilters(filters);
      setViewMode("filter");
    } catch (e: any) {
      console.error("Errore searchAdvanced", e);
      console.error("Backend response:", e?.response?.data);
      setErr(e?.response?.data?.error || e?.message || "Errore filtri");
      setList([]);
      setTotal(0);
      setTotalPages(1);
    } finally {
      setLoading(false);
    }
  }

  async function runNearby(
    nextPage = page,
    nextPageSize = pageSize,
    nextPos = pos,
    nextRadius = radius
  ) {
    setErr(null);

    if (!nextPos) {
      setErr("Posizione non disponibile");
      return;
    }

    setLoading(true);

    try {
      const headers = await getAuthHeaders();
      const res = await http.get("/cars/nearby", {
        params: {
          lat: nextPos.lat,
          lon: nextPos.lon,
          radius: nextRadius,
          page: nextPage,
          pageSize: nextPageSize,
        },
        headers,
      });

      applyCarsResponse(res.data);
      setViewMode("nearby");
    } catch (e: any) {
      console.error("Errore nearby", e);
      console.error("Backend response:", e?.response?.data);
      setErr(e?.response?.data?.error || e?.message || "Errore geolocalizzazione");
      setList([]);
      setTotal(0);
      setTotalPages(1);
    } finally {
      setLoading(false);
    }
  }

  async function reloadCurrentView(nextPage = page, nextPageSize = pageSize) {
    if (viewMode === "search") {
      await runSearch(nextPage, nextPageSize, q);
      return;
    }

    if (viewMode === "filter") {
      await runAdvancedSearch(activeFilters, nextPage, nextPageSize);
      return;
    }

    if (viewMode === "nearby") {
      await runNearby(nextPage, nextPageSize, pos, radius);
      return;
    }

    await loadAll(nextPage, nextPageSize);
  }

  useEffect(() => {
    if (!isLoaded) return;
    if (didInitialLoadRef.current) return;

    didInitialLoadRef.current = true;

    setDrafts(loadDrafts());
    loadAll(1, pageSize);

    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLoaded]);

  useEffect(() => {
    if (!isLoaded) return;

    let timer: number | null = null;

    const reloadSoftly = () => {
      if (timer) {
        window.clearTimeout(timer);
      }

      timer = window.setTimeout(() => {
        reloadCurrentView(page, pageSize);
      }, 600);
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        reloadSoftly();
      }
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      if (timer) {
        window.clearTimeout(timer);
      }

      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };

    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLoaded, page, pageSize]);

  useEffect(() => {
    if (!isLoaded || !isSignedIn) return;
    if (didDraftSyncRef.current) return;

    didDraftSyncRef.current = true;

    (async () => {
      try {
        const local = loadDrafts();

        if (!local.length) {
          setDrafts([]);
          return;
        }

        await ping();

        const token = await getToken();

        if (!token) {
          setDrafts(local);
          return;
        }

        const failed: { id: string; reason: any }[] = [];
        let syncedCount = 0;

        for (const d of local) {
          try {
            const payload = draftToPayload(d);

            await http.post("/cars", payload, {
              headers: { Authorization: `Bearer ${token}` },
            });

            removeDraft(d.id);
            syncedCount += 1;
          } catch (e: any) {
            console.error("Sync bozza fallita:", d.id, e);
            console.error("Backend response:", e?.response?.data);

            failed.push({
              id: d.id,
              reason: e?.response?.data || e?.message || e,
            });
          }
        }

        const remainingDrafts = loadDrafts();
        setDrafts(remainingDrafts);

        if (syncedCount > 0) {
          await loadAll(1, pageSize);
        }

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

  async function onSearchClick() {
    setMobileAdvancedOpen(false);
    setPos(null);
    setPage(1);
    await runSearch(1, pageSize, q);
  }

  async function onAdvancedSearch(filters: SearchFilters) {
    setMobileAdvancedOpen(false);
    setPos(null);
    setQ("");
    setPage(1);
    await runAdvancedSearch(filters, 1, pageSize);
  }

  async function nearby() {
    setMobileAdvancedOpen(false);
    setErr(null);

    if (!navigator.geolocation) {
      setErr("Geolocalizzazione non supportata");
      return;
    }

    setLoading(true);

    navigator.geolocation.getCurrentPosition(
      async (p) => {
        const nextPos = {
          lat: p.coords.latitude,
          lon: p.coords.longitude,
        };

        setPos(nextPos);
        setPage(1);

        await runNearby(1, pageSize, nextPos, radius);
      },
      (e) => {
        setErr(e.message);
        setLoading(false);
      }
    );
  }

  async function resetAll() {
    setMobileAdvancedOpen(false);
    setQ("");
    setPos(null);
    setActiveFilters({
      brands: [],
      models: [],
      fuelTypes: [],
      transmissions: [],
    });
    setViewMode("all");
    setPage(1);
    await loadAll(1, pageSize);
  }

  async function changePage(nextPage: number) {
    if (nextPage < 1 || nextPage > totalPages || nextPage === page) return;
    setPage(nextPage);
    await reloadCurrentView(nextPage, pageSize);
  }

  async function changePageSize(nextSize: 6 | 9 | 12) {
    setMobileAdvancedOpen(false);
    setPageSize(nextSize);
    setPage(1);
    await reloadCurrentView(1, nextSize);
  }

  function goToNew() {
    if (!isSignedIn) {
      openSignIn();
      return;
    }
    nav("/cars/new");
  }

  const resultsTitle = useMemo(() => {
    if (q.trim() && viewMode === "search") return `Risultati per “${q}”`;
    if (pos && viewMode === "nearby") return `A ${radius} km dalla tua posizione`;
    if (viewMode === "filter") return "Risultati filtrati";
    return "Tutti i modelli";
  }, [q, pos, radius, viewMode]);

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

  const pageNumbers = useMemo(() => {
    const pages: number[] = [];
    const start = Math.max(1, page - 2);
    const end = Math.min(totalPages, page + 2);

    for (let i = start; i <= end; i += 1) {
      pages.push(i);
    }

    return pages;
  }, [page, totalPages]);

  return (
    <div>
      <HomeHeroCarousel />
      <h1 className="h1">Auto disponibili</h1>

      <div className="cars-controls-stack">
        <div
          id="cars-search-intro"
          className={`cars-intro-search${mobileAdvancedOpen ? " is-mobile-open" : ""}`}
        >
          <p className="muted cars-search-description">
            Cerca un modello oppure mostra i veicoli nelle vicinanze.
          </p>

          <SearchBar
            onSearch={(filters) => {
              onAdvancedSearch(filters);
            }}
          />
        </div>

        <div className="cars-new-car-cta">
          <button className="btn cars-new-car-button" onClick={goToNew}>
            Carica la tua auto
          </button>
        </div>

        <div className="cars-mobile-advanced-toggle-wrap">
          <button
            type="button"
            className="btn ghost cars-mobile-advanced-toggle"
            aria-expanded={mobileAdvancedOpen}
            aria-controls="cars-search-intro cars-search-toolbar"
            onClick={() => setMobileAdvancedOpen((open) => !open)}
          >
            <span>Avanzate</span>
            <span
              className={`cars-mobile-advanced-arrow${mobileAdvancedOpen ? " is-open" : ""}`}
              aria-hidden="true"
            >
              ▾
            </span>
          </button>
        </div>

        <div
          id="cars-search-toolbar"
          className={`toolbar cars-search-toolbar${mobileAdvancedOpen ? " is-mobile-open" : ""}`}
          style={{ gap: 10, flexWrap: "wrap", alignItems: "center" }}
        >
          <input
            className="input cars-text-search-input"
            placeholder="Cerca per marca o modello (es. Ascari GT)"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />

          <button className="btn" onClick={onSearchClick} disabled={loading}>
            Cerca
          </button>

          <button className="btn ghost" onClick={resetAll}>
            Reset
          </button>

          <span className="cars-toolbar-divider" />

          <div className="cars-radius-group">
            <label className="muted" htmlFor="radius">
              Raggio
            </label>

            <input
              id="radius"
              className="input cars-radius-input"
              type="number"
              min={1}
              max={100}
              value={radius}
              onChange={(e) => setRadius(parseInt(e.target.value || "5", 10))}
            />

            <span className="tag">km</span>
          </div>

          <button className="btn secondary" onClick={nearby} disabled={loading}>
            Vicino a me
          </button>

          <div className="cars-toolbar-spacer" />

          <div className="cars-page-size-wrap">
            <label className="cars-page-size-label" htmlFor="pageSize">
              Visualizzazione
            </label>

            <select
              id="pageSize"
              className="input cars-page-size-select"
              value={pageSize}
              onChange={(e) => changePageSize(Number(e.target.value) as 6 | 9 | 12)}
            >
              <option value={6}>6 / pagina</option>
              <option value={9}>9 / pagina</option>
              <option value={12}>12 / pagina</option>
            </select>
          </div>
        </div>
      </div>

      {pos && viewMode === "nearby" && (
        <small className="muted" style={{ display: "block", marginTop: 8 }}>
          Posizione rilevata: lat {pos.lat.toFixed(4)}, lon {pos.lon.toFixed(4)}
        </small>
      )}

      {err && <p style={{ color: "var(--danger)", marginTop: 6 }}>{err}</p>}

      <p className="muted cars-results-meta">
        <span>
          {resultsTitle} —{" "}
          <b>{loading ? "caricamento..." : total}</b>{" "}
          {loading ? "" : "veicolo/i"}
        </span>

        {total > 0 && (
          <span>
            • pagina <b>{page}</b> di <b>{totalPages}</b>
          </span>
        )}
      </p>

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

      <div className="grid">
        {list.map((car) => {
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

                {typeof car.distanceKm === "number" && (
                  <p className="muted" style={{ margin: "8px 0 0" }}>
                    Distanza: {car.distanceKm.toFixed(1)} km
                  </p>
                )}

                <div className="footer-actions">
                  <Link className="btn" to={`/cars/${car.id}`}>
                    Dettaglio modello
                  </Link>

                  <div className="card-interaction-actions">
                    {!isMine && (
                      <ShareButton
                        carId={car.id}
                        title={car.title?.trim() || `${car.make} ${car.model}`}
                        year={car.year}
                        imageUrl={imagesForCard(car)[0]}
                        priceEur={
                          car.priceEur ??
                          car.offerPrice1 ??
                          car.offerPrice2 ??
                          car.offerPrice3
                        }
                      />
                    )}

                    {isSignedIn && (
                      <LikeButton
                        carId={car.id}
                        initialLiked={car.likedByMe ?? false}
                        onChange={(newLiked) => {
                          setList((prev) =>
                            prev.map((c) =>
                              c.id === car.id ? { ...c, likedByMe: newLiked } : c
                            )
                          );
                        }}
                      />
                    )}
                  </div>

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

      {!loading && totalPages > 1 && (
        <div className="cars-pagination">
          <button
            className="btn ghost"
            disabled={page <= 1}
            onClick={() => changePage(page - 1)}
          >
            ← Precedente
          </button>

          {page > 3 && (
            <>
              <button className="btn ghost" onClick={() => changePage(1)}>
                1
              </button>
              {page > 4 && <span className="cars-pagination-ellipsis">...</span>}
            </>
          )}

          {pageNumbers.map((p) => (
            <button
              key={p}
              className={p === page ? "btn" : "btn ghost"}
              onClick={() => changePage(p)}
            >
              {p}
            </button>
          ))}

          {page < totalPages - 2 && (
            <>
              {page < totalPages - 3 && <span className="muted">...</span>}
              <button className="btn ghost" onClick={() => changePage(totalPages)}>
                {totalPages}
              </button>
            </>
          )}

          <button
            className="btn ghost"
            disabled={page >= totalPages}
            onClick={() => changePage(page + 1)}
          >
            Successiva →
          </button>
          <div className="cars-pagination-summary">
            Stai visualizzando la pagina {page} di {totalPages}
          </div>
        </div>
      )}
    </div>
  );
}