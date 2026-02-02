// frontend/src/pages/MyGarage.tsx
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
};

type MyGarageResponse = {
  myCars: Car[];
  likedCars: Car[];
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
          background: ok
            ? "rgba(0,255,180,0.9)"
            : "rgba(239,68,68,0.9)",
          display: "inline-block",
        }}
      />
      Periziata: {ok ? "SI" : "NO"}
    </span>
  );
}

// ✅ normalizza qualsiasi risposta del backend in {myCars:[], likedCars:[]}
function normalizeGarage(payload: any): MyGarageResponse {
  // caso ideale
  if (
    payload &&
    Array.isArray(payload.myCars) &&
    Array.isArray(payload.likedCars)
  ) {
    return payload as MyGarageResponse;
  }

  // casi comuni: { data: {...} } / { garage: {...} }
  const candidate = payload?.data ?? payload?.garage ?? payload;

  const myCars = Array.isArray(candidate?.myCars) ? candidate.myCars : [];
  const likedCars = Array.isArray(candidate?.likedCars)
    ? candidate.likedCars
    : [];

  return { myCars, likedCars };
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
      setData({ myCars: [], likedCars: [] }); // ✅ evita crash
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
        alert("Devi essere loggato per caricare la perizia");
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

      alert("Perizia caricata con successo ✅");
      await loadGarage();
    } catch (e: any) {
      console.error(e);
      alert(e?.response?.data?.error || e?.message || "Errore upload perizia");
    } finally {
      setUploadingCarId(null);
    }
  }

  if (loading) return <div>Caricamento garage...</div>;
  if (error) return <div style={{ color: "var(--danger)" }}>{error}</div>;

  // ✅ sempre array
  const myCars = Array.isArray(data.myCars) ? data.myCars : [];
  const likedCars = Array.isArray(data.likedCars) ? data.likedCars : [];

  return (
    <div style={{ padding: "2rem 1rem" }}>
      <h1 style={{ marginBottom: "1.5rem" }}>Il mio garage</h1>

      {/* === LE MIE AUTO === */}
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
                              alert("Carica un file PDF.");
                              e.currentTarget.value = "";
                              return;
                            }

                            uploadPerizia(car.id, file);
                            e.currentTarget.value = "";
                          }}
                        />
                      </label>

                      <p
                        className="muted"
                        style={{ marginTop: 8, marginBottom: 0 }}
                      >
                        Dopo l’upload, la perizia risulterà verde e sarà
                        scaricabile dalla scheda auto.
                      </p>
                    </div>
                  )}

                  <div className="card-actions" style={{ marginTop: 14 }}>
                    <Link className="btn" to={`/cars/${car.id}`}>
                      Dettaglio modello
                    </Link>

                    {/* proprietario non mette like alla sua auto */}
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

      {/* === AUTO CHE MI PIACCIONO === */}
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
