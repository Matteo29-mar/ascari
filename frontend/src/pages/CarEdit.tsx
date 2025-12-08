// src/pages/CarEdit.tsx
import React, { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { http } from '../api';
import { useAuth } from '@clerk/clerk-react';
import AdditionalFields from '../components/AdditionalFields';
import AscariPopup from '../components/AscariPopup'; // ⭐ AGGIUNTO

type Car = {
  id: number;
  make: string;
  model: string;
  title: string;
  year: number;
  fuelType?: string | null;
  horsepower?: number | null;
  mileageKm?: number | null;
  description?: string | null;
  coverUrl?: string | null;
  photos?: string[] | null;
  color?: string | null;
  torqueNm?: number | null;
  drivetrain?: string | null;
  transmission?: string | null;
  seats?: number | null;
  doors?: number | null;
  priceEur?: number | null;
  engine?: string | null;
  trimLevel?: string | null;
};

export default function CarEdit() {
  const { id } = useParams();
  const nav = useNavigate();
  const { getToken } = useAuth();

  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [showPopup, setShowPopup] = useState(false); // ⭐ AGGIUNTO
  const [make, setMake] = useState('');
  const [model, setModel] = useState('');
  const [title, setTitle] = useState('');
  const [year, setYear] = useState<number>(new Date().getFullYear());
  const [fuelType, setFuelType] = useState('');
  const [horsepower, setHorsepower] = useState<number | ''>('');
  const [mileageKm, setMileageKm] = useState<number | ''>('');
  const [description, setDescription] = useState('');
  const [coverUrl, setCoverUrl] = useState<string>('');
  const [photos, setPhotos] = useState<string[]>([]);

  const [color, setColor] = useState('');
  const [torqueNm, setTorqueNm] = useState<number | ''>('');
  const [drivetrain, setDrivetrain] = useState('');
  const [transmission, setTransmission] = useState('');
  const [seats, setSeats] = useState<number | ''>('');
  const [doors, setDoors] = useState<number | ''>('');
  const [priceEur, setPriceEur] = useState<number | ''>('');
  const [engine, setEngine] = useState('');
  const [trimLevel, setTrimLevel] = useState('');

  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (!id) return;
    let mounted = true;

    async function run() {
      try {
        setLoading(true);
        const { data } = await http.get<Car>(`/cars/${id}`);

        if (!mounted) return;

        setMake(data.make);
        setModel(data.model);
        setTitle(data.title || '');
        setYear(data.year);
        setFuelType(data.fuelType || '');
        setHorsepower((data.horsepower ?? '') as any);
        setMileageKm((data.mileageKm ?? '') as any);
        setDescription(data.description || '');
        // ⭐ FIX COVER: se non c'è cover, prendo la prima foto
        setCoverUrl(data.coverUrl || (data.photos?.[0] ?? ''));
        setPhotos(Array.isArray(data.photos) ? data.photos : []);

        setColor(data.color || '');
        setTorqueNm((data.torqueNm ?? '') as any);
        setDrivetrain(data.drivetrain || '');
        setTransmission(data.transmission || '');
        setSeats((data.seats ?? '') as any);
        setDoors((data.doors ?? '') as any);
        setPriceEur((data.priceEur ?? '') as any);
        setEngine(data.engine || '');
        setTrimLevel(data.trimLevel || '');
      } catch (e: any) {
        setErr(
          e?.response?.data?.error ||
            e?.message ||
            'Errore caricamento veicolo'
        );
      } finally {
        if (mounted) setLoading(false);
      }
    }

    run();
    return () => {
      mounted = false;
    };
  }, [id]);

  async function onSelectFiles(files: FileList | null) {
    if (!files) return;
    const arr: string[] = [];

    for (const f of Array.from(files)) {
      const dataUrl = await fileToDataURL(f);
      arr.push(dataUrl);
    }

    setPhotos((prev) => [...prev, ...arr]);
// ⭐ FIX: se non c’è cover, prima nuova foto diventa cover
    if (!coverUrl && arr[0]) setCoverUrl(arr[0]);

    if (inputRef.current) {
      inputRef.current.value = '';
    }
  }

  function removePhoto(i: number) {
    const updated = photos.filter((_, idx) => idx !== i);
    setPhotos(updated);

    // ⭐ FIX COVER: se rimuovi la cover, aggiorno
    if (i === 0) {
      setCoverUrl(updated[0] || '');
    }
  }

  async function onSave() {
    if (!id) return;
    setErr(null);
    setOk(null);

    // ⭐ FIX: blocco salvataggio senza foto
    if (photos.length === 0) {
      setShowPopup(true);
      return;
    }

    const finalTitle =
      title.trim() ||
      [make, model, year].filter(Boolean).join(' ') ||
      'Nuova auto';

    const payload = {
      make,
      model,
      title: finalTitle,
      year: Number(year),
      horsepower: horsepower === '' ? undefined : Number(horsepower),
      mileageKm: mileageKm === '' ? undefined : Number(mileageKm),
      coverUrl: coverUrl || photos[0] || null, // ⭐ FIX COVER SEMPRE SINCRONIZZATA
      photos, // ⭐ FIX: sempre array aggiornato
      //NUMBER
      torqueNm: torqueNm === '' ? null : Number(torqueNm),
      seats: seats === '' ? null : Number(seats),
      doors: doors === '' ? null : Number(doors),
      priceEur: priceEur === '' ? null : Number(priceEur),
      //STRING
      fuelType: fuelType === '' ? null : fuelType,
      description: description === '' ? null : description,
      drivetrain: drivetrain === '' ? null : drivetrain,
      transmission: transmission === '' ? null : transmission,
      engine: engine === '' ? null : engine,
      trimLevel: trimLevel === '' ? null : trimLevel,
      color: color === '' ? null : color,
    };

    try {
      const token = await getToken();
      if (!token) {
        setErr('Non sei autenticato. Effettua il login prima di salvare.');
        return;
      }

      const { data } = await http.put(`/cars/${id}`, payload, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      setOk('Veicolo aggiornato (#' + data.id + ')');
      setTimeout(() => nav(`/cars/${data.id}`), 400);
    } catch (e: any) {
      console.error(
        'PUT /cars failed',
        e?.response?.status,
        e?.response?.data || e?.message
      );
      setErr(
        e?.response?.data?.error ||
          e?.message ||
          'Errore aggiornamento veicolo'
      );
    }
  }

  if (loading) return <p>Caricamento…</p>;

  return (
    <div>

            {/* ⭐ POPUP ASCARI */}
      {showPopup && (
        <AscariPopup
          message="Aggiungi almeno una foto per aggiornare il veicolo!"
          onClose={() => setShowPopup(false)}
        />
      )}

      <button
        className="btn secondary"
        onClick={() => nav(-1)}
      >
        ← Indietro
      </button>
      <h1 className="h1" style={{ marginTop: 10 }}>
        Modifica veicolo
      </h1>

      {err && <p style={{ color: 'var(--danger)' }}>{err}</p>}
      {ok && <p style={{ color: 'var(--accent)' }}>{ok}</p>}

      <div className="grid" style={{ marginTop: 12 }}>
        <section className="card">
          <div className="card-body">
            <div
              className="row"
              style={{ gap: 8, flexWrap: 'wrap' }}
            >
              <input
                className="input"
                placeholder="Marca"
                value={make}
                onChange={(e) => setMake(e.target.value)}
              />
              <input
                className="input"
                placeholder="Modello"
                value={model}
                onChange={(e) => setModel(e.target.value)}
              />
              <input
                className="input"
                placeholder="Titolo annuncio"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
              />
              <input
                className="input"
                type="number"
                placeholder="Anno"
                value={year}
                onChange={(e) =>
                  setYear(parseInt(e.target.value || '0'))
                }
              />
              <input
                className="input"
                placeholder="Carburante (es. Benzina)"
                value={fuelType}
                onChange={(e) => setFuelType(e.target.value)}
              />
              <input
                className="input"
                type="number"
                placeholder="Potenza (CV)"
                value={horsepower}
                onChange={(e) =>
                  setHorsepower(
                    e.target.value === ''
                      ? ''
                      : parseInt(e.target.value)
                  )
                }
              />
              <input
                className="input"
                type="number"
                placeholder="Chilometri"
                value={mileageKm}
                onChange={(e) =>
                  setMileageKm(
                    e.target.value === ''
                      ? ''
                      : parseInt(e.target.value)
                  )
                }
              />
            </div>
            <textarea
              className="input"
              placeholder="Descrizione"
              value={description}
              onChange={(e) =>
                setDescription(e.target.value)
              }
              style={{
                width: '100%',
                height: 100,
                marginTop: 10,
                padding: 10,
              }}
            />
          </div>
        </section>

        <section className="card">
          <div className="card-body">
            <h3 style={{ marginTop: 0 }}>Immagini</h3>
            <div
              className="row"
              style={{
                gap: 8,
                flexWrap: 'wrap',
                marginBottom: 8,
              }}
            >
              <input
                ref={inputRef}
                type="file"
                accept="image/*"
                multiple
                onChange={(e) =>
                  onSelectFiles(e.target.files)
                }
              />
              <input
                className="input"
                placeholder="Cover URL (facoltativo)"
                value={coverUrl}
                onChange={(e) =>
                  setCoverUrl(e.target.value)
                }
                style={{ minWidth: 320 }}
              />
            </div>
            <div className="grid">
              {photos.map((src, i) => (
                <div key={i} className="card">
                  <img
                    src={src}
                    style={{
                      width: '100%',
                      display: 'block',
                    }}
                  />
                  <div className="card-body">
                    <div className="row space">
                      <small className="muted">
                        {i === 0 ? '#1' : '#' + (i + 1)}
                      </small>
                      <button
                        className="btn secondary"
                        onClick={() => removePhoto(i)}
                      >
                        Rimuovi
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>
      </div>

      <AdditionalFields
        data={{
          color,
          torqueNm,
          drivetrain,
          transmission,
          seats,
          doors,
          priceEur,
          engine,
          trimLevel,
        }}
        setData={(obj) => {
          if ('color' in obj) setColor(obj.color ?? '');
          if ('torqueNm' in obj)
            setTorqueNm(obj.torqueNm ?? '');
          if ('drivetrain' in obj)
            setDrivetrain(obj.drivetrain ?? '');
          if ('transmission' in obj)
            setTransmission(obj.transmission ?? '');
          if ('seats' in obj) setSeats(obj.seats ?? '');
          if ('doors' in obj) setDoors(obj.doors ?? '');
          if ('priceEur' in obj)
            setPriceEur(obj.priceEur ?? '');
          if ('engine' in obj) setEngine(obj.engine ?? '');
          if ('trimLevel' in obj)
            setTrimLevel(obj.trimLevel ?? '');
        }}
      />

      <div
        className="row"
        style={{ marginTop: 14, justifyContent: 'flex-end' }}
      >
        <button className="btn" onClick={onSave}>
          Salva modifiche
        </button>
      </div>
    </div>
  );
}

function fileToDataURL(f: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();

    r.onload = () => {
      resolve(String(r.result));
    };

    r.onerror = () => {
      reject(r.error || new Error('Errore nella lettura del file'));
    };

    r.readAsDataURL(f);
  });
}
