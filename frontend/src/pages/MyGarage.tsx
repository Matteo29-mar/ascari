// frontend/src/pages/MyGarage.tsx
import { useEffect, useState } from 'react';
import { useAuth, SignedIn, SignedOut, RedirectToSignIn } from '@clerk/clerk-react';
import { getMyGarage } from '../api';
import { Link } from 'react-router-dom';
import LikeButton from "../components/LikeButton";

type Car = {
  id: number;
  title: string;
  make: string;
  model: string;
  year: number;
  coverUrl?: string | null;
  photos?: string[] | null;
  likedByMe?: boolean;
  likes?: { id: string }[];        // 👈 per conteggio like
};

type MyGarageResponse = {
  myCars: Car[];
  likedCars: Car[];
};

function MyGarageContent() {
  const { getToken, userId } = useAuth();
  const [data, setData] = useState<MyGarageResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const token = await getToken();
        if (!token) {
          setError("Utente non autenticato");
          return;
        }
        const res = await getMyGarage(token);
        setData(res);
      } catch (e: any) {
        setError(e?.message || "Errore caricamento garage");
      } finally {
        setLoading(false);
      }
    })();
  }, [getToken]);

  if (loading) return <div>Caricamento garage...</div>;
  if (error) return <div style={{ color: 'var(--danger)' }}>{error}</div>;
  if (!data) return <div>Nessun dato garage disponibile.</div>;

  return (
    <div style={{ padding: '2rem 1rem' }}>
      <h1 style={{ marginBottom: '1.5rem' }}>Il mio garage</h1>

      {/* === LE MIE AUTO === */}
      <section>
        <h2>Le mie auto</h2>
        {data.myCars.length === 0 && <p>Non hai ancora caricato auto.</p>}

        <div className="grid">
          {data.myCars.map(car => {
            const imgSrc =
              car.coverUrl ||
              (car.photos && car.photos[0]) ||
              "/cars/placeholder.jpg";

            return (
              <article key={car.id} className="card">
                <img src={imgSrc} className="card-image" />

                <div className="card-body">
                  <h3>{car.title}</h3>
                  <p>{car.make} {car.model} ({car.year})</p>

                  <div className="card-actions">
                    <Link className="btn" to={`/cars/${car.id}`}>
                      Dettaglio modello
                    </Link>

                    {/* ❤️ il proprietario NON può mettere like alla propria auto */}
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
        {data.likedCars.length === 0 && <p>Non hai ancora messo Mi piace.</p>}

        <div className="grid">
          {data.likedCars.map(car => {
            const imgSrc =
              car.coverUrl ||
              (car.photos && car.photos[0]) ||
              "/cars/placeholder.jpg";

            return (
              <article key={car.id} className="card">
                <img src={imgSrc} className="card-image" />

                <div className="card-body">
                  <h3>{car.title}</h3>
                  <p>{car.make} {car.model} ({car.year})</p>

                  <div className="card-actions">

                    {/* ❤️ qui l'utente può rimuovere il like */}
                    <LikeButton
                      carId={car.id}
                      initialLiked={true}
                    />

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
