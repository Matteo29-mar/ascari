import React, { useEffect, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { http } from '../api';
import { useAuth } from '@clerk/clerk-react';
import {
  getDraft,
  upsertDraft,
  addDraft,
  removeDraft,
} from '../../lib/drafts';
import AdditionalFields from '../components/AdditionalFields';
import AscariPopup from '../components/AscariPopup'; // ⭐ FIX
import SelectableGrid from '../components/SelectableGrid';
import { CAR_BRANDS, FUEL_TYPES } from '../../../backend/src/constants/carOptions';
import SelectableDropdown from '../components/SelectableDropdown';


function uid() {
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

export default function CarNew() {
  const nav = useNavigate();
  const [params] = useSearchParams();
  const draftId = params.get('draft') || '';

  const { getToken } = useAuth();

  // 🔽 Form state
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



  // Campi extra
  const [color, setColor] = useState('');
  const [torqueNm, setTorqueNm] = useState<number | ''>('');
  const [drivetrain, setDrivetrain] = useState('');
  const [transmission, setTransmission] = useState('');
  const [seats, setSeats] = useState<number | ''>('');
  const [doors, setDoors] = useState<number | ''>('');
  const [priceEur, setPriceEur] = useState<number | ''>('');
  const [engine, setEngine] = useState('');
  const [trimLevel, setTrimLevel] = useState('');

  const [err, setErr] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [showPopup, setShowPopup] = useState(false); // ⭐ FIX

  const inputRef = useRef<HTMLInputElement | null>(null);

  // Carica bozza
  useEffect(() => {
    if (!draftId) return;
    const d = getDraft(draftId);
    if (!d) return;

    setMake(d.make || '');
    setModel(d.model || '');
    setTitle(d.title || '');
    setYear(d.year || new Date().getFullYear());
    setFuelType(d.fuelType || '');
    setHorsepower((d.horsepower ?? '') as any);
    setMileageKm((d.mileageKm ?? '') as any);
    setDescription(d.description || '');
    setCoverUrl(d.coverUrl || '');
    setPhotos(Array.isArray(d.photos) ? d.photos : []);


    setColor(d.color || '');
    setTorqueNm((d.torqueNm ?? '') as any);
    setDrivetrain(d.drivetrain || '');
    setTransmission(d.transmission || '');
    setSeats((d.seats ?? '') as any);
    setDoors((d.doors ?? '') as any);
    setPriceEur((d.priceEur ?? '') as any);
    setEngine(d.engine || '');
    setTrimLevel(d.trimLevel || '');
  }, [draftId]);

  // Gestione immagini
  async function onSelectFiles(files: FileList | null) {
    if (!files) return;
    const arr: string[] = [];

    for (const f of Array.from(files)) {
      const dataUrl = await fileToDataURL(f);
      arr.push(dataUrl);
    }

    setPhotos(prev => [...prev, ...arr]);

    // ⭐ FIX: se non c'è cover, setto la nuova
    if (!coverUrl && arr[0]) {
      setCoverUrl(arr[0]);
    }

    if (inputRef.current) inputRef.current.value = '';
  }

  function removePhoto(i: number) {
    const updated = photos.filter((_, idx) => idx !== i);
    setPhotos(updated);

    // ⭐ FIX: se rimuovi la cover, riassegna cover correttamente
    if (i === 0 && updated.length > 0) {
      setCoverUrl(updated[0]);
    }
  }

  async function onSave() {
    setErr(null);
    setOk(null);

    // ⭐ FIX — blocco salvataggio senza foto
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
      fuelType: fuelType || undefined,
      horsepower: horsepower === '' ? undefined : Number(horsepower),
      mileageKm: mileageKm === '' ? undefined : Number(mileageKm),
      description: description || undefined,
      coverUrl: coverUrl || photos[0] || undefined, // ⭐ FIX
      photos, // ⭐ sempre array corretto
      locationText: locationText || undefined,
      city: city || undefined,
      color: color || undefined,
      torqueNm: torqueNm === '' ? undefined : Number(torqueNm),
      drivetrain: drivetrain || undefined,
      transmission: transmission || undefined,
      seats: seats === '' ? undefined : Number(seats),
      doors: doors === '' ? undefined : Number(doors),
      priceEur: priceEur === '' ? undefined : Number(priceEur),
      engine: engine || undefined,
      trimLevel: trimLevel || undefined,
      offerPrice1: offerPrice1 === '' ? undefined : offerPrice1,
      offerPrice2: offerPrice2 === '' ? undefined : offerPrice2,
      offerPrice3: offerPrice3 === '' ? undefined : offerPrice3,


    };

    try {
      const token = await getToken();
      if (!token) {
        setErr('Non sei autenticato.');
        return;
      }

      const { data } = await http.post('/cars', payload, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (draftId) removeDraft(draftId);

      setOk('Salvato (#' + data.id + ')');
      setTimeout(() => nav(`/cars/${data.id}`), 400);
    } catch (e: any) {
      console.error(e);

      const draft = {
        id: draftId || uid(),
        createdAt: Date.now(),
        ...payload,
      };

      if (draftId) upsertDraft(draft);
      else addDraft(draft);

      setOk('DB non raggiungibile, salvata bozza');
      setTimeout(() => nav('/cars'), 500);
    }
  }

  return (
    <div>
      {showPopup && (
        <AscariPopup
          message="Aggiungi almeno una foto e potrai venderla!"
          onClose={() => setShowPopup(false)}
        />
      )}

      <button className="btn secondary" onClick={() => nav(-1)}>
        ← Indietro
      </button>

      <h1 className="h1" style={{ marginTop: 10 }}>
        {draftId ? 'Modifica bozza' : 'Nuovo veicolo'}
      </h1>
      <p className="muted">
        Compila i campi. Se il DB non è raggiungibile, salviamo una
        bozza locale.
      </p>

      {err && <p style={{ color: 'var(--danger)' }}>{err}</p>}
      {ok && <p style={{ color: 'var(--accent)' }}>{ok}</p>}

      <div className="grid" style={{ marginTop: 12 }}>
        <section className="card">
          <div className="card-body">
            <div
              className="row"
              style={{ gap: 8, flexWrap: 'wrap' }}
            >
              <div style={{ width: '100%' }}>
                <label className="muted">Marca</label>
                <SelectableDropdown
                  label="Marca"
                  value={make}
                  options={CAR_BRANDS}
                  onChange={setMake}
                />
              </div>
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
                placeholder="Indirizzo (es. Via Roma 10)"
                value={locationText}
                onChange={(e) => setLocationText(e.target.value)}
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

        <section className="card" style={{ minHeight: 380 }}>
        <div className="card-body">
          <h3>Prezzi accettati</h3>
          <p className="muted">Inserisci i 3 prezzi che sei disposto ad accettare</p>

          <input
            className="input"
            type="number"
            placeholder="Inserisci prezzo"
            value={offerPrice1}
            onChange={(e) =>
              setOfferPrice1(
                e.target.value === '' ? '' : Number(e.target.value)
              )
            }
          />

          <input
            className="input"
            type="number"
            placeholder="Inserisci prezzo"
            value={offerPrice2}
            onChange={(e) =>
              setOfferPrice2(
                e.target.value === '' ? '' : Number(e.target.value)
              )
            }
          />

          <input
            className="input"
            type="number"
            placeholder="Inserisci prezzo"
            value={offerPrice3}
            onChange={(e) =>
              setOfferPrice3(
                e.target.value === '' ? '' : Number(e.target.value)
              )
            }
          />

        </div>
        </section>

      </div>

      {/* 🔽 sezione facoltativa */}
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
          Salva
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
