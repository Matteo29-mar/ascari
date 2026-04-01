import React, { useEffect, useRef, useState, useMemo } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { http } from '../api';
import { useAuth } from '@clerk/clerk-react';
import AdditionalFields from '../components/AdditionalFields';
import AscariPopup from '../components/AscariPopup';
import { CAR_BRANDS, FUEL_TYPES, CAR_MODELS_BY_BRAND_KEY } from '../constants/carOptions';
import SelectableDropdown from '../components/SelectableDropdown';
import AddressAutocomplete from '../components/AddressAutocomplete';

type Car = {
  id: number;
  make: string;
  model: string;
  title: string;
  year: number;
  offerPrice1: number;
  offerPrice2: number;
  offerPrice3: number;
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
  locationText?: string | null;
  city?: string | null;
  latitude?: number | null;
  longitude?: number | null;
};

export default function CarEdit() {
  const { id } = useParams();
  const nav = useNavigate();
  const { getToken } = useAuth();

  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [showPopup, setShowPopup] = useState(false);

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
  const [offerPrice1, setOfferPrice1] = useState<number | ''>('');
  const [offerPrice2, setOfferPrice2] = useState<number | ''>('');
  const [offerPrice3, setOfferPrice3] = useState<number | ''>('');
  const [locationText, setLocationText] = useState('');
  const [city, setCity] = useState('');
  const [latitude, setLatitude] = useState<number | null>(null);
  const [longitude, setLongitude] = useState<number | null>(null);

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

  const modelOptions = useMemo(() => {
    const list = CAR_MODELS_BY_BRAND_KEY[make] || [];
    return list.map((m) => ({ key: m, label: m }));
  }, [make]);

  useEffect(() => {
    if (!make) {
      if (model) setModel('');
      return;
    }
    const list = CAR_MODELS_BY_BRAND_KEY[make] || [];
    if (model && !list.includes(model)) {
      setModel('');
    }
  }, [make]); // eslint-disable-line react-hooks/exhaustive-deps

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
        setLocationText(data.locationText || '');
        setCity(data.city || '');
        setLatitude(typeof data.latitude === 'number' ? data.latitude : null);
        setLongitude(typeof data.longitude === 'number' ? data.longitude : null);

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

        setOfferPrice1(data.offerPrice1 ? data.offerPrice1 : '');
        setOfferPrice2(data.offerPrice2 ? data.offerPrice2 : '');
        setOfferPrice3(data.offerPrice3 ? data.offerPrice3 : '');
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

    if (!coverUrl && arr[0]) setCoverUrl(arr[0]);

    if (inputRef.current) {
      inputRef.current.value = '';
    }
  }

  function removePhoto(i: number) {
    const updated = photos.filter((_, idx) => idx !== i);
    setPhotos(updated);

    if (i === 0) {
      setCoverUrl(updated[0] || '');
    } else if (updated.length === 0) {
      setCoverUrl('');
    }
  }

  async function onSave() {
    if (!id) return;

    setErr(null);
    setOk(null);

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
      coverUrl: coverUrl || photos[0] || null,
      photos,
      torqueNm: torqueNm === '' ? null : Number(torqueNm),
      seats: seats === '' ? null : Number(seats),
      doors: doors === '' ? null : Number(doors),
      priceEur: priceEur === '' ? null : Number(priceEur),
      fuelType: fuelType === '' ? null : fuelType,
      description: description === '' ? null : description,
      drivetrain: drivetrain === '' ? null : drivetrain,
      transmission: transmission === '' ? null : transmission,
      engine: engine === '' ? null : engine,
      trimLevel: trimLevel === '' ? null : trimLevel,
      color: color === '' ? null : color,
      offerPrice1: offerPrice1 === '' ? null : offerPrice1,
      offerPrice2: offerPrice2 === '' ? null : offerPrice2,
      offerPrice3: offerPrice3 === '' ? null : offerPrice3,
      locationText: locationText === '' ? null : locationText,
      city: city === '' ? null : city,
      latitude,
      longitude,
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
      {showPopup && (
        <AscariPopup
          message="Aggiungi almeno una foto per aggiornare il veicolo!"
          onClose={() => setShowPopup(false)}
        />
      )}

      <button className="btn secondary" onClick={() => nav(-1)}>
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
            <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
              <div style={{ width: '100%' }}>
                <label className="muted">Marca</label>
                <SelectableDropdown
                  label="Marca"
                  value={make}
                  options={CAR_BRANDS}
                  onChange={setMake}
                />
              </div>

              <div style={{ width: '100%' }}>
                <label className="muted">Modello</label>
                <SelectableDropdown
                  label={make ? 'Modello' : 'Seleziona prima la marca'}
                  value={model}
                  options={modelOptions}
                  onChange={setModel}
                />
              </div>

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
                onChange={(e) => setYear(parseInt(e.target.value || '0'))}
              />

              <AddressAutocomplete
                value={locationText}
                onChange={(value) => {
                  setLocationText(value);
                  setLatitude(null);
                  setLongitude(null);
                }}
                onSelect={({ locationText, city, latitude, longitude }) => {
                  setLocationText(locationText);
                  setCity(city || '');
                  setLatitude(typeof latitude === 'number' ? latitude : null);
                  setLongitude(typeof longitude === 'number' ? longitude : null);
                }}
                placeholder="Indirizzo (es. Via Roma 10)"
              />

              <input
                className="input"
                placeholder="Città"
                value={city}
                onChange={(e) => setCity(e.target.value)}
              />

              <div style={{ width: '100%', marginTop: 10 }}>
                <label className="muted">Carburante</label>
                <SelectableDropdown
                  label="Carburante"
                  value={fuelType}
                  options={FUEL_TYPES}
                  onChange={setFuelType}
                />
              </div>

              <input
                className="input"
                type="number"
                placeholder="Potenza (CV)"
                value={horsepower}
                onChange={(e) =>
                  setHorsepower(e.target.value === '' ? '' : parseInt(e.target.value))
                }
              />

              <input
                className="input"
                type="number"
                placeholder="Chilometri"
                value={mileageKm}
                onChange={(e) =>
                  setMileageKm(e.target.value === '' ? '' : parseInt(e.target.value))
                }
              />
            </div>

            <textarea
              className="input"
              placeholder="Descrizione"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
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
                onChange={(e) => onSelectFiles(e.target.files)}
              />

              <input
                className="input"
                placeholder="Cover URL (facoltativo)"
                value={coverUrl}
                onChange={(e) => setCoverUrl(e.target.value)}
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

        <section className="card" style={{ minHeight: 260 }}>
          <div className="card-body">
            <h3>Prezzi accettati</h3>
            <p className="muted">
              Inserisci i 3 prezzi che sei disposto ad accettare
            </p>

            <input
              className="input"
              type="number"
              placeholder="Inserisci prezzo"
              value={offerPrice1}
              onChange={(e) =>
                setOfferPrice1(e.target.value === '' ? '' : Number(e.target.value))
              }
            />

            <input
              className="input"
              type="number"
              placeholder="Inserisci prezzo"
              value={offerPrice2}
              onChange={(e) =>
                setOfferPrice2(e.target.value === '' ? '' : Number(e.target.value))
              }
            />

            <input
              className="input"
              type="number"
              placeholder="Inserisci prezzo"
              value={offerPrice3}
              onChange={(e) =>
                setOfferPrice3(e.target.value === '' ? '' : Number(e.target.value))
              }
            />
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
          if ('torqueNm' in obj) setTorqueNm(obj.torqueNm ?? '');
          if ('drivetrain' in obj) setDrivetrain(obj.drivetrain ?? '');
          if ('transmission' in obj) setTransmission(obj.transmission ?? '');
          if ('seats' in obj) setSeats(obj.seats ?? '');
          if ('doors' in obj) setDoors(obj.doors ?? '');
          if ('priceEur' in obj) setPriceEur(obj.priceEur ?? '');
          if ('engine' in obj) setEngine(obj.engine ?? '');
          if ('trimLevel' in obj) setTrimLevel(obj.trimLevel ?? '');
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