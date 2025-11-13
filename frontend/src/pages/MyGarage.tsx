// frontend/src/pages/MyGarage.tsx
import { useEffect, useState } from 'react';
import { useAuth, SignedIn, SignedOut, RedirectToSignIn } from '@clerk/clerk-react';
import { getMyGarage } from '../api';
import { Link } from 'react-router-dom';

type Car = {
  id: number;
  title: string;
  make: string;
  model: string;
  year: number;

  // 👇 aggiunti per immagini
  coverUrl?: string | null;
  photos?: string[] | null;
};

type MyGarageResponse = {
  myCars: Car[];
  likedCars: Car[];
};

function MyGarageContent() {
  const { getToken } = useAuth();
  const [data, setData] = useState<MyGarageResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        setError(null);
        const token = await getToken();
        if (!token) {
          setError('Nessun token di autenticazione trovato.');
          return;
        }
        const res = await getMyGarage(token);
        setData(res);
      } catch (e: any) {
        const msg = e?.response?.data?.error || e?.message || 'Errore caricamento garage';
        setError(msg);
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

      {/* --- LE MIE AUTO --- */}
      <section>
        <h2>Le mie auto</h2>
        {data.myCars.length === 0 && <p>Non hai ancora caricato auto.</p>}

        <div className="grid">
          {data.myCars.map((car) => {
            const imgSrc =
              car.coverUrl ||
              (car.photos && car.photos[0]) ||
              '/cars/placeholder.jpg'; // 👈 come nella lista principale

            return (
              <article key={car.id} className="card">
                <div className="card-image-wrapper">
                  <img
                    src={imgSrc}
                    alt={car.title}
                    className="card-image"
                  />
                </div>

                <div className="card-body">
                  <h3>{car.title}</h3>
                  <p>
                    {car.make} {car.model} ({car.year})
                  </p>

                  <div className="card-actions">
                    {/* Dettaglio modello */}
                    <Link to={`/cars/${car.id}`} className="btn btn-outline">
                      Dettaglio modello
                    </Link>

                  </div>
                </div>
              </article>
            );
          })}
        </div>
      </section>

      {/* --- AUTO CHE MI PIACCIONO --- */}
      <section style={{ marginTop: '2.5rem' }}>
        <h2>Le auto che mi piacciono</h2>
        {data.likedCars.length === 0 && <p>Non hai ancora messo Mi piace.</p>}

        <div className="grid">
          {data.likedCars.map((car) => {
            const imgSrc =
              car.coverUrl ||
              (car.photos && car.photos[0]) ||
              '/cars/placeholder.jpg';

            return (
              <article key={car.id} className="card">
                <div className="card-image-wrapper">
                  <img
                    src={imgSrc}
                    alt={car.title}
                    className="card-image"
                  />
                </div>

                <div className="card-body">
                  <h3>{car.title}</h3>
                  <p>
                    {car.make} {car.model} ({car.year})
                  </p>

                  <div className="card-actions">
                    <Link to={`/cars/${car.id}`} className="btn btn-outline">
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
