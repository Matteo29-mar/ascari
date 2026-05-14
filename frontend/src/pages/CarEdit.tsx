import React, { useEffect, useRef, useState, useMemo } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { http } from '../api';
import { useAuth } from '@clerk/clerk-react';
import AdditionalFields from '../components/AdditionalFields';
import AscariPopup from '../components/AscariPopup';
import {
  CAR_BRANDS,
  FUEL_TYPES,
  TRANSMISSION_TYPES,
  CAR_MODELS_BY_BRAND_KEY,
} from '../../../backend/src/constants/carOptions';
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
  transmission: string;
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

type RequiredFieldKey =
  | 'make'
  | 'model'
  | 'year'
  | 'locationText'
  | 'city'
  | 'fuelType'
  | 'transmission'
  | 'photos'
  | 'offerPrice1'
  | 'offerPrice2'
  | 'offerPrice3';

const REQUIRED_FIELD_LABELS: Record<RequiredFieldKey, string> = {
  make: 'Marca',
  model: 'Modello',
  year: 'Anno',
  locationText: 'Indirizzo',
  city: 'Città',
  fuelType: 'Carburante',
  transmission: 'Cambio',
  photos: 'Foto',
  offerPrice1: 'Prezzo 1',
  offerPrice2: 'Prezzo 2',
  offerPrice3: 'Prezzo 3',
};

const ASCARI_FEE_RATE = 0.1;

type OfferPriceValue = number | '';

type OfferPriceInputBlockProps = {
  label: string;
  value: OfferPriceValue;
  setValue: (value: OfferPriceValue) => void;
  inputClassName: string;
  hasError: boolean;
  showBreakdown: boolean;
};

function parseOfferPrice(value: OfferPriceValue): number {
  if (value === '') return 0;

  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function formatAscariEuro(value: number): string {
  return new Intl.NumberFormat('it-IT', {
    style: 'currency',
    currency: 'EUR',
    maximumFractionDigits: 0,
  }).format(value);
}

function OfferPriceInputBlock({
  label,
  value,
  setValue,
  inputClassName,
  hasError,
  showBreakdown,
}: OfferPriceInputBlockProps) {
  const gross = parseOfferPrice(value);
  const hasValue = gross > 0;
  const ascariFee = hasValue ? gross * ASCARI_FEE_RATE : 0;
  const sellerNet = hasValue ? gross - ascariFee : 0;

  return (
    <div className={`ascari-offer-price-item ${hasError ? 'is-error' : ''}`}>
      <div className="ascari-offer-price-input-head">
        <span>{label}</span>
        <small>Offerta accettabile</small>
      </div>

      <input
        className={inputClassName}
        type="number"
        placeholder="Inserisci prezzo *"
        value={value}
        onChange={(e) =>
          setValue(e.target.value === '' ? '' : Number(e.target.value))
        }
      />

      {showBreakdown && (
        <div className="ascari-offer-breakdown">
          <div className="ascari-offer-breakdown-box">
            <span>Prezzo lordo</span>
            <strong>{hasValue ? formatAscariEuro(gross) : '—'}</strong>
          </div>

          <div className="ascari-offer-breakdown-box">
            <span>Commissione Ascari 10%</span>
            <strong>{hasValue ? formatAscariEuro(ascariFee) : '—'}</strong>
          </div>

          <div className="ascari-offer-breakdown-box net">
            <span>Netto venditore</span>
            <strong>{hasValue ? formatAscariEuro(sellerNet) : '—'}</strong>
          </div>
        </div>
      )}
    </div>
  );
}

export default function CarEdit() {
  const { id } = useParams();
  const nav = useNavigate();
  const { getToken } = useAuth();

  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [showPopup, setShowPopup] = useState(false);
  const [highlightMissing, setHighlightMissing] = useState(false);
  const [missingFields, setMissingFields] = useState<RequiredFieldKey[]>([]);

  const [make, setMake] = useState('');
  const [model, setModel] = useState('');
  const [title, setTitle] = useState('');
  const [year, setYear] = useState<number>(new Date().getFullYear());
  const [fuelType, setFuelType] = useState('');
  const [horsepower, setHorsepower] = useState<number | ''>('');
  const [mileageKm, setMileageKm] = useState<number | ''>('');
  const [description, setDescription] = useState('');
  const [coverUrl, setCoverUrl] = useState('');
  const [photos, setPhotos] = useState<string[]>([]);
  const [offerPrice1, setOfferPrice1] = useState<number | ''>('');
  const [offerPrice2, setOfferPrice2] = useState<number | ''>('');
  const [offerPrice3, setOfferPrice3] = useState<number | ''>('');
  const [acceptedPricesOpen, setAcceptedPricesOpen] = useState(true);
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
  }, [make, model]);

  useEffect(() => {
    if (!highlightMissing) return;
    setMissingFields(getMissingRequiredFields());
  }, [
    highlightMissing,
    make,
    model,
    year,
    locationText,
    city,
    fuelType,
    transmission,
    photos,
    offerPrice1,
    offerPrice2,
    offerPrice3,
  ]);

  useEffect(() => {
    if (!id) return;

    let mounted = true;

    async function run() {
      try {
        setLoading(true);
        setErr(null);

        const { data } = await http.get<Car>(`/cars/${id}`);

        if (!mounted) return;

        setMake(data.make || '');
        setModel(data.model || '');
        setTitle(data.title || '');
        setYear(data.year || new Date().getFullYear());
        setFuelType(data.fuelType || '');
        setHorsepower((data.horsepower ?? '') as number | '');
        setMileageKm((data.mileageKm ?? '') as number | '');
        setDescription(data.description || '');
        setLocationText(data.locationText || '');
        setCity(data.city || '');
        setLatitude(typeof data.latitude === 'number' ? data.latitude : null);
        setLongitude(typeof data.longitude === 'number' ? data.longitude : null);

        setCoverUrl(data.coverUrl || data.photos?.[0] || '');
        setPhotos(Array.isArray(data.photos) ? data.photos : []);

        setColor(data.color || '');
        setTorqueNm((data.torqueNm ?? '') as number | '');
        setDrivetrain(data.drivetrain || '');
        setTransmission(data.transmission || '');
        setSeats((data.seats ?? '') as number | '');
        setDoors((data.doors ?? '') as number | '');
        setPriceEur((data.priceEur ?? '') as number | '');
        setEngine(data.engine || '');
        setTrimLevel(data.trimLevel || '');

        setOfferPrice1(data.offerPrice1 ?? '');
        setOfferPrice2(data.offerPrice2 ?? '');
        setOfferPrice3(data.offerPrice3 ?? '');
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

  function getMissingRequiredFields(): RequiredFieldKey[] {
    const list: RequiredFieldKey[] = [];

    if (!make.trim()) list.push('make');
    if (!model.trim()) list.push('model');
    if (!Number.isFinite(Number(year)) || Number(year) <= 0) list.push('year');
    if (!locationText.trim()) list.push('locationText');
    if (!city.trim()) list.push('city');
    if (!fuelType.trim()) list.push('fuelType');
    if (!transmission.trim()) list.push('transmission');
    if (!Array.isArray(photos) || photos.length === 0) list.push('photos');
    if (offerPrice1 === '' || Number(offerPrice1) <= 0) list.push('offerPrice1');
    if (offerPrice2 === '' || Number(offerPrice2) <= 0) list.push('offerPrice2');
    if (offerPrice3 === '' || Number(offerPrice3) <= 0) list.push('offerPrice3');

    return list;
  }

  function hasFieldError(field: RequiredFieldKey) {
    return highlightMissing && missingFields.includes(field);
  }

  function getFieldClass(field: RequiredFieldKey, base = 'input') {
    return hasFieldError(field) ? `${base} ascari-input-error` : base;
  }

  async function onSelectFiles(files: FileList | null) {
    if (!files) return;

    const arr: string[] = [];

    for (const f of Array.from(files)) {
      const dataUrl = await fileToDataURL(f);
      arr.push(dataUrl);
    }

    setPhotos((prev) => [...prev, ...arr]);

    if (!coverUrl && arr[0]) {
      setCoverUrl(arr[0]);
    }

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

    const missing = getMissingRequiredFields();
    setMissingFields(missing);

    if (missing.length > 0) {
      setHighlightMissing(true);
      setShowPopup(true);
      return;
    }

    const finalTitle =
      title.trim() ||
      [make, model, year].filter(Boolean).join(' ') ||
      'Nuova auto';

    const payload = {
      make: make.trim(),
      model: model.trim(),
      title: finalTitle,
      year: Number(year),
      horsepower: horsepower === '' ? undefined : Number(horsepower),
      mileageKm: mileageKm === '' ? undefined : Number(mileageKm),
      coverUrl: coverUrl.trim() || photos[0],
      photos,
      torqueNm: torqueNm === '' ? null : Number(torqueNm),
      seats: seats === '' ? null : Number(seats),
      doors: doors === '' ? null : Number(doors),
      priceEur: priceEur === '' ? null : Number(priceEur),
      fuelType: fuelType.trim(),
      description: description.trim() || null,
      drivetrain: drivetrain.trim() || null,
      transmission: transmission.trim(),
      engine: engine.trim() || null,
      trimLevel: trimLevel.trim() || null,
      color: color.trim() || null,
      offerPrice1: Number(offerPrice1),
      offerPrice2: Number(offerPrice2),
      offerPrice3: Number(offerPrice3),
      locationText: locationText.trim(),
      city: city.trim(),
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

  const missingLabels = missingFields.map((field) => REQUIRED_FIELD_LABELS[field]);

  return (
    <div>
      {showPopup && (
        <AscariPopup
          title="Campi obbligatori mancanti"
          message={
            missingFields.length > 0
              ? `Completa i campi obbligatori evidenziati in rosso: ${missingLabels.join(', ')}.`
              : 'Completa i campi obbligatori.'
          }
          variant="warning"
          confirmText="Chiudi"
          onClose={() => setShowPopup(false)}
        />
      )}

      <button className="btn secondary" onClick={() => nav(-1)}>
        ← Indietro
      </button>

      <h1 className="h1" style={{ marginTop: 10 }}>
        Modifica veicolo
      </h1>

      {highlightMissing && missingFields.length > 0 && (
        <div className="ascari-warning-banner" style={{ marginTop: 12 }}>
          <strong>Campi obbligatori mancanti:</strong> {missingLabels.join(', ')}.
        </div>
      )}

      {err && <p style={{ color: 'var(--danger)' }}>{err}</p>}
      {ok && <p style={{ color: 'var(--accent)' }}>{ok}</p>}

      <div className="grid" style={{ marginTop: 12 }}>
        <section className="card">
          <div className="card-body">
            <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
              <div style={{ width: '100%' }}>
                <label className="muted">Marca *</label>
                <SelectableDropdown
                  label="Marca"
                  value={make}
                  options={CAR_BRANDS}
                  onChange={setMake}
                  hasError={hasFieldError('make')}
                />
              </div>

              <div style={{ width: '100%' }}>
                <label className="muted">Modello *</label>
                <SelectableDropdown
                  label={make ? 'Modello' : 'Seleziona prima la marca'}
                  value={model}
                  options={modelOptions}
                  onChange={setModel}
                  hasError={hasFieldError('model')}
                  disabled={!make}
                />
              </div>

              <input
                className="input"
                placeholder="Titolo annuncio"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
              />

              <input
                className={getFieldClass('year')}
                type="number"
                placeholder="Anno *"
                value={year}
                onChange={(e) => setYear(parseInt(e.target.value || '0', 10))}
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
                placeholder="Indirizzo (es. Via Roma 10) *"
                className={hasFieldError('locationText') ? 'ascari-input-error' : ''}
              />

              <input
                className={getFieldClass('city')}
                placeholder="Città *"
                value={city}
                onChange={(e) => setCity(e.target.value)}
              />

              <div style={{ width: '100%', marginTop: 10 }}>
                <label className="muted">Carburante *</label>
                <SelectableDropdown
                  label="Carburante"
                  value={fuelType}
                  options={FUEL_TYPES}
                  onChange={setFuelType}
                  hasError={hasFieldError('fuelType')}
                />
              </div>

              <div style={{ width: '100%', marginTop: 10 }}>
                <label className="muted">Cambio *</label>
                <SelectableDropdown
                  label="Cambio"
                  value={transmission}
                  options={TRANSMISSION_TYPES}
                  onChange={setTransmission}
                  hasError={hasFieldError('transmission')}
                />
              </div>

              <input
                className="input"
                type="number"
                placeholder="Potenza (CV)"
                value={horsepower}
                onChange={(e) =>
                  setHorsepower(e.target.value === '' ? '' : parseInt(e.target.value, 10))
                }
              />

              <input
                className="input"
                type="number"
                placeholder="Chilometri"
                value={mileageKm}
                onChange={(e) =>
                  setMileageKm(e.target.value === '' ? '' : parseInt(e.target.value, 10))
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

        <section className={`card ${hasFieldError('photos') ? 'ascari-section-error' : ''}`}>
          <div className="card-body">
            <h3 style={{ marginTop: 0 }}>Immagini *</h3>

            <div className="row" style={{ gap: 8, flexWrap: 'wrap', marginBottom: 8 }}>
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

            {hasFieldError('photos') && (
              <p className="ascari-field-help-error" style={{ marginTop: 0 }}>
                Devi aggiungere almeno una foto.
              </p>
            )}

            <div className="grid">
              {photos.map((src, i) => (
                <div key={i} className="card">
                  <img src={src} style={{ width: '100%', display: 'block' }} />
                  <div className="card-body">
                    <div className="row space">
                      <small className="muted">{i === 0 ? '#1' : '#' + (i + 1)}</small>
                      <button className="btn secondary" onClick={() => removePhoto(i)}>
                        Rimuovi
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section
          className={`card ascari-accepted-prices-card ${
            hasFieldError('offerPrice1') ||
            hasFieldError('offerPrice2') ||
            hasFieldError('offerPrice3')
              ? 'ascari-section-error'
              : ''
          }`}
          style={{ minHeight: 260 }}
        >
          <div className="card-body">
            <div className="ascari-accepted-prices-header">
              <div>
                <h3>Prezzi accettati *</h3>
                <p className="muted">
                  Inserisci i 3 prezzi che sei disposto ad accettare.
                </p>
              </div>

              <button
                type="button"
                className="ascari-offers-toggle"
                onClick={() => setAcceptedPricesOpen((prev) => !prev)}
              >
                <span>{acceptedPricesOpen ? 'Nascondi dettagli' : 'Mostra dettagli'}</span>
                <strong>{acceptedPricesOpen ? '−' : '+'}</strong>
              </button>
            </div>

            <div className="ascari-offer-price-list">
              <OfferPriceInputBlock
                label="Prezzo 1"
                value={offerPrice1}
                setValue={setOfferPrice1}
                inputClassName={getFieldClass('offerPrice1')}
                hasError={hasFieldError('offerPrice1')}
                showBreakdown={acceptedPricesOpen}
              />

              <OfferPriceInputBlock
                label="Prezzo 2"
                value={offerPrice2}
                setValue={setOfferPrice2}
                inputClassName={getFieldClass('offerPrice2')}
                hasError={hasFieldError('offerPrice2')}
                showBreakdown={acceptedPricesOpen}
              />

              <OfferPriceInputBlock
                label="Prezzo 3"
                value={offerPrice3}
                setValue={setOfferPrice3}
                inputClassName={getFieldClass('offerPrice3')}
                hasError={hasFieldError('offerPrice3')}
                showBreakdown={acceptedPricesOpen}
              />
            </div>

            {acceptedPricesOpen && (
              <div className="ascari-offer-note">
                Questi sono solo i prezzi delle offerte accettabili. Non modificano il
                prezzo finale di vendita configurato nel pagamento.
              </div>
            )}
          </div>
        </section>
      </div>

      <AdditionalFields
        data={{
          color,
          torqueNm,
          drivetrain,
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
          if ('seats' in obj) setSeats(obj.seats ?? '');
          if ('doors' in obj) setDoors(obj.doors ?? '');
          if ('priceEur' in obj) setPriceEur(obj.priceEur ?? '');
          if ('engine' in obj) setEngine(obj.engine ?? '');
          if ('trimLevel' in obj) setTrimLevel(obj.trimLevel ?? '');
        }}
      />

      <div className="row" style={{ marginTop: 14, justifyContent: 'flex-end' }}>
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

    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(r.error || new Error('Errore nella lettura del file'));

    r.readAsDataURL(f);
  });
}