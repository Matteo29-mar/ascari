import React, { useEffect, useRef, useState, useMemo } from 'react';
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
import AscariPopup from '../components/AscariPopup';
import {
  CAR_BRANDS,
  FUEL_TYPES,
  TRANSMISSION_TYPES,
  CAR_MODELS_BY_BRAND_KEY,
} from '../constants/carOptions';
import SelectableDropdown from '../components/SelectableDropdown';
import AddressAutocomplete from '../components/AddressAutocomplete';

function uid() {
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

type DraftCarLoose = {
  id?: string;
  createdAt?: number;
  make?: string;
  model?: string;
  title?: string;
  year?: number;
  fuelType?: string;
  horsepower?: number | '';
  mileageKm?: number | '';
  description?: string;
  coverUrl?: string;
  photos?: string[];
  offerPrice1?: number | '';
  offerPrice2?: number | '';
  offerPrice3?: number | '';
  locationText?: string;
  city?: string;
  latitude?: number | null;
  longitude?: number | null;
  color?: string;
  torqueNm?: number | '';
  drivetrain?: string;
  transmission?: string;
  seats?: number | '';
  doors?: number | '';
  priceEur?: number | '';
  engine?: string;
  trimLevel?: string;
  missingRequiredFields?: string[];
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
const INSPECTION_FEE_EUR = 120;

type OfferPriceValue = number | '';

type OfferPriceInputBlockProps = {
  label: string;
  value: OfferPriceValue;
  setValue: (value: OfferPriceValue) => void;
  inputClassName: string;
  hasError: boolean;
  showBreakdown: boolean;
  inspectionFeeEnabled: boolean;
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
  inspectionFeeEnabled,
}: OfferPriceInputBlockProps) {
  const gross = parseOfferPrice(value);
  const hasValue = gross > 0;
  const ascariFee = hasValue ? gross * ASCARI_FEE_RATE : 0;
  const inspectionFee = hasValue && inspectionFeeEnabled ? INSPECTION_FEE_EUR : 0;
  const sellerNet = hasValue ? Math.max(gross - ascariFee - inspectionFee, 0) : 0;

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
          <div className="ascari-offer-breakdown-box">
            <span>Commissione periziatore</span>
            <strong>{hasValue ? formatAscariEuro(inspectionFee) : '—'}</strong>
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

export default function CarNew() {
  const nav = useNavigate();
  const [params] = useSearchParams();
  const draftId = params.get('draft') || '';
  const { getToken } = useAuth();

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

  const [err, setErr] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [showPopup, setShowPopup] = useState(false);
  const [highlightMissing, setHighlightMissing] = useState(false);
  const [missingFields, setMissingFields] = useState<RequiredFieldKey[]>([]);

  

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
    if (!draftId) return;

    const rawDraft = getDraft(draftId);
    if (!rawDraft) return;

    const d = rawDraft as unknown as DraftCarLoose;

    setMake(d.make || '');
    setModel(d.model || '');
    setTitle(d.title || '');
    setYear(d.year || new Date().getFullYear());
    setFuelType(d.fuelType || '');
    setHorsepower((d.horsepower ?? '') as number | '');
    setMileageKm((d.mileageKm ?? '') as number | '');
    setDescription(d.description || '');
    setCoverUrl(d.coverUrl || '');
    setPhotos(Array.isArray(d.photos) ? d.photos : []);
    setLocationText(d.locationText || '');
    setCity(d.city || '');
    setLatitude(typeof d.latitude === 'number' ? d.latitude : null);
    setLongitude(typeof d.longitude === 'number' ? d.longitude : null);

    setColor(d.color || '');
    setTorqueNm((d.torqueNm ?? '') as number | '');
    setDrivetrain(d.drivetrain || '');
    setTransmission(d.transmission || '');
    setSeats((d.seats ?? '') as number | '');
    setDoors((d.doors ?? '') as number | '');
    setPriceEur((d.priceEur ?? '') as number | '');
    setEngine(d.engine || '');
    setTrimLevel(d.trimLevel || '');
    setOfferPrice1((d.offerPrice1 ?? '') as number | '');
    setOfferPrice2((d.offerPrice2 ?? '') as number | '');
    setOfferPrice3((d.offerPrice3 ?? '') as number | '');

    const draftMissing = sanitizeMissingFields(d.missingRequiredFields);
    if (draftMissing.length > 0) {
      setMissingFields(draftMissing);
      setHighlightMissing(true);
    }
  }, [draftId]);

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

  function sanitizeMissingFields(fields: unknown): RequiredFieldKey[] {
    if (!Array.isArray(fields)) return [];

    const allowed: RequiredFieldKey[] = [
      'make',
      'model',
      'year',
      'locationText',
      'city',
      'fuelType',
      'transmission',
      'photos',
      'offerPrice1',
      'offerPrice2',
      'offerPrice3',
    ];

    return fields.filter((f): f is RequiredFieldKey =>
      allowed.includes(f as RequiredFieldKey)
    );
  }

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

    if (i === 0 && updated.length > 0) {
      setCoverUrl(updated[0]);
    } else if (updated.length === 0) {
      setCoverUrl('');
    }
  }

  function buildPayload(missing: RequiredFieldKey[]) {
    const finalTitle =
      title.trim() ||
      [make, model, year].filter(Boolean).join(' ') ||
      'Nuova auto';

    return {
      make: make.trim(),
      model: model.trim(),
      title: finalTitle,
      year: Number(year),
      fuelType: fuelType.trim(),
      horsepower: horsepower === '' ? undefined : Number(horsepower),
      mileageKm: mileageKm === '' ? undefined : Number(mileageKm),
      description: description.trim() || undefined,
      coverUrl: coverUrl.trim() || photos[0] || undefined,
      photos,
      offerPrice1: offerPrice1 === '' ? undefined : Number(offerPrice1),
      offerPrice2: offerPrice2 === '' ? undefined : Number(offerPrice2),
      offerPrice3: offerPrice3 === '' ? undefined : Number(offerPrice3),
      locationText: locationText.trim(),
      city: city.trim(),
      latitude: latitude ?? undefined,
      longitude: longitude ?? undefined,
      color: color.trim() || undefined,
      torqueNm: torqueNm === '' ? undefined : Number(torqueNm),
      drivetrain: drivetrain.trim() || undefined,
      transmission: transmission.trim(),
      seats: seats === '' ? undefined : Number(seats),
      doors: doors === '' ? undefined : Number(doors),
      priceEur: priceEur === '' ? undefined : Number(priceEur),
      engine: engine.trim() || undefined,
      trimLevel: trimLevel.trim() || undefined,
      missingRequiredFields: missing,
    };
  }

  async function onSave() {
    setErr(null);
    setOk(null);

    const missing = getMissingRequiredFields();
    setMissingFields(missing);

    const payload = buildPayload(missing);

    if (missing.length > 0) {
      setHighlightMissing(true);
      setShowPopup(true);

      const draft = {
        id: draftId || uid(),
        createdAt: Date.now(),
        ...payload,
      };

      if (draftId) {
        upsertDraft(draft as any);
      } else {
        addDraft(draft as any);
      }

      setOk('Bozza salvata. Correggi i campi obbligatori evidenziati in rosso.');
      return;
    }

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

      if (draftId) {
        upsertDraft(draft as any);
      } else {
        addDraft(draft as any);
      }

      setOk('DB non raggiungibile, salvata bozza locale.');
      setTimeout(() => nav('/cars'), 500);
    }
  }

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
        {draftId ? 'Modifica bozza' : 'Nuovo veicolo'}
      </h1>

      <p className="muted">
        Compila i campi. Se il DB non è raggiungibile, salviamo una bozza locale.
      </p>

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

              <div style={{ width: '100%' }}>
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
              </div>

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
          style={{ minHeight: 380 }}
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
                inspectionFeeEnabled={true}
              />

              <OfferPriceInputBlock
                label="Prezzo 2"
                value={offerPrice2}
                setValue={setOfferPrice2}
                inputClassName={getFieldClass('offerPrice2')}
                hasError={hasFieldError('offerPrice2')}
                showBreakdown={acceptedPricesOpen}
                inspectionFeeEnabled={true}
              />

              <OfferPriceInputBlock
                label="Prezzo 3"
                value={offerPrice3}
                setValue={setOfferPrice3}
                inputClassName={getFieldClass('offerPrice3')}
                hasError={hasFieldError('offerPrice3')}
                showBreakdown={acceptedPricesOpen}
                inspectionFeeEnabled={true}
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
          Salva
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