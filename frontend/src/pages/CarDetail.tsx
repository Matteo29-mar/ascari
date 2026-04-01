import React, { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { http } from '../api'
import Carousel from '../components/Carousel/Carousel'
import AscariPopup from '../components/AscariPopup'
import { useAuth, useClerk } from '@clerk/clerk-react'
import { useOffers } from "../context/OfferContext";

type Car = {
  id: number
  make: string
  model: string
  year: number
  trimLevel?: string | null
  offerPrice1: number
  offerPrice2: number
  offerPrice3: number
  priceEur?: number | null
  color?: string | null
  transmission?: string | null
  fuelType?: string | null
  engine?: string | null
  horsepower?: number | null
  mileageKm?: number
  torqueNm?: number | null
  drivetrain?: string | null
  seats?: number | null
  doors?: number | null
  description?: string | null
  photos?: string[] | null
  latitude?: number | null
  longitude?: number | null
  locationText?: string | null
  city?: string | null
  country?: string | null
  isPeriziata?: boolean
  periziaDocUrl?: string | null
  periziaUploadedAt?: string | null
  owner?: {
    clerkId: string
  }
}

type PopupState = {
  open: boolean
  title?: string
  message: string
  variant: "success" | "error" | "warning" | "info"
  confirmText?: string
  cancelText?: string
  loading?: boolean
  onConfirm?: (() => void | Promise<void>) | null
}

export default function CarDetail() {
  const { id } = useParams()
  const nav = useNavigate()
  const [car, setCar] = useState<Car | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [deleting, setDeleting] = useState(false)

  const [showOfferPopup, setShowOfferPopup] = useState(false)
  const [thanksPopup, setThanksPopup] = useState(false)

  const { userId: clerkUserId, isSignedIn, getToken } = useAuth()
  const { openSignIn } = useClerk()
  const { reloadOffers } = useOffers()
  const [openPerizia, setOpenPerizia] = useState(false)

  const [popup, setPopup] = useState<PopupState>({
    open: false,
    message: "",
    variant: "info",
    confirmText: "OK",
    cancelText: "Annulla",
    loading: false,
    onConfirm: null,
  })

  function closePopup() {
    setPopup((prev) => ({
      ...prev,
      open: false,
      loading: false,
      onConfirm: null,
    }))
  }

  function openInfoPopup(message: string, title = "Informazione") {
    setPopup({
      open: true,
      title,
      message,
      variant: "info",
      confirmText: "OK",
      cancelText: "Annulla",
      loading: false,
      onConfirm: null,
    })
  }

  function openSuccessPopup(message: string, title = "Operazione completata") {
    setPopup({
      open: true,
      title,
      message,
      variant: "success",
      confirmText: "OK",
      cancelText: "Annulla",
      loading: false,
      onConfirm: null,
    })
  }

  function openErrorPopup(message: string, title = "Errore") {
    setPopup({
      open: true,
      title,
      message,
      variant: "error",
      confirmText: "Chiudi",
      cancelText: "Annulla",
      loading: false,
      onConfirm: null,
    })
  }

  function openConfirmPopup(params: {
    title: string
    message: string
    variant?: "success" | "error" | "warning" | "info"
    confirmText?: string
    cancelText?: string
    onConfirm: () => void | Promise<void>
  }) {
    setPopup({
      open: true,
      title: params.title,
      message: params.message,
      variant: params.variant ?? "warning",
      confirmText: params.confirmText ?? "Conferma",
      cancelText: params.cancelText ?? "Annulla",
      loading: false,
      onConfirm: params.onConfirm,
    })
  }

  useEffect(() => {
    let mounted = true

    async function run() {
      try {
        const { data } = await http.get<Car>(`/cars/${id}`)
        if (mounted) setCar(data)
      } catch (e: any) {
        if (mounted) {
          setErr(e?.response?.data?.error || 'Errore caricamento')
        }
      } finally {
        if (mounted) setLoading(false)
      }
    }

    run()
    return () => {
      mounted = false
    }
  }, [id])

  const title = useMemo(() => {
    if (!car) return 'Modello'
    return `${car.make} ${car.model} ${car.year}`
  }, [car])

  const images = useMemo(() => {
    if (car?.photos && Array.isArray(car.photos) && car.photos.length) return car.photos
    if (!car) return ['/cars/placeholder.jpg']
    const slug = `${car.make}-${car.model}`.toLowerCase().replace(/\s+/g, '-')
    return [1, 2, 3].map(i => `/cars/${slug}-${i}.jpg`)
  }, [car])

  if (loading) return <p>Caricamento…</p>

  if (err) {
    return (
      <div>
        <p style={{ color: 'var(--danger)' }}>{err}</p>
        <button className="btn secondary" onClick={() => nav(-1)}>Torna indietro</button>
      </div>
    )
  }

  if (!car) return null

  const canEdit =
    isSignedIn && car.owner && car.owner.clerkId === clerkUserId

  const isOwner =
    isSignedIn && clerkUserId && car.owner?.clerkId === clerkUserId

  async function sendOffer(amount: number) {
    try {
      const token = await getToken()
      if (!token) {
        openErrorPopup("Non sei autenticato", "Accesso richiesto")
        return
      }

      await http.post(
        "/offers",
        { carId: car.id, amount },
        { headers: { Authorization: `Bearer ${token}` } }
      )

      setShowOfferPopup(false)
      setThanksPopup(true)
      reloadOffers()
    } catch (err: any) {
      console.error(err)
      openErrorPopup(
        err?.response?.data?.error || "Errore invio offerta",
        "Invio offerta non riuscito"
      )
    }
  }

  async function runDelete() {
    if (!id) return

    try {
      setPopup((prev) => ({ ...prev, loading: true }))
      setDeleting(true)

      const token = await getToken()
      if (!token) {
        setDeleting(false)
        setPopup({
          open: true,
          title: "Accesso richiesto",
          message: "Non sei autenticato. Riprova ad effettuare il login.",
          variant: "error",
          confirmText: "Chiudi",
          cancelText: "Annulla",
          loading: false,
          onConfirm: null,
        })
        return
      }

      await http.delete(`/cars/${id}`, {
        headers: { Authorization: `Bearer ${token}` },
      })

      setPopup({
        open: true,
        title: "Veicolo eliminato",
        message: "Il veicolo è stato eliminato correttamente.",
        variant: "success",
        confirmText: "Vai alle auto",
        cancelText: "Annulla",
        loading: false,
        onConfirm: () => nav('/cars'),
      })
    } catch (e: any) {
      const msg = e?.response?.data?.error || e?.message || 'Errore eliminazione'
      setPopup({
        open: true,
        title: "Errore eliminazione",
        message: msg,
        variant: "error",
        confirmText: "Chiudi",
        cancelText: "Annulla",
        loading: false,
        onConfirm: null,
      })
    } finally {
      setDeleting(false)
    }
  }

  async function onDelete() {
    if (!id) return

    openConfirmPopup({
      title: "Eliminare definitivamente questo veicolo?",
      message: "Questa azione non può essere annullata.",
      variant: "warning",
      confirmText: "Sì, elimina",
      cancelText: "Annulla",
      onConfirm: runDelete,
    })
  }

  async function downloadPerizia() {
    try {
      if (!isSignedIn) {
        openSignIn({
          redirectUrl: window.location.href,
        })
        return
      }

      const token = await getToken()
      if (!token) {
        openSignIn({ redirectUrl: window.location.href })
        return
      }

      const url = `${http.defaults.baseURL}/cars/${car.id}/perizia/download`

      const resp = await fetch(url, {
        headers: { Authorization: `Bearer ${token}` },
      })

      if (!resp.ok) {
        const data = await resp.json().catch(() => null)
        throw new Error(data?.error || "Errore download perizia")
      }

      const blob = await resp.blob()
      const blobUrl = window.URL.createObjectURL(blob)

      const a = document.createElement("a")
      a.href = blobUrl
      a.download = `perizia_car_${car.id}.pdf`
      document.body.appendChild(a)
      a.click()
      a.remove()

      window.URL.revokeObjectURL(blobUrl)
    } catch (e: any) {
      openErrorPopup(e?.message || "Errore download perizia", "Download non riuscito")
    }
  }

  return (
    <>
      <div>
        <button className="btn secondary" onClick={() => nav(-1)}>← Indietro</button>

        <h1 className="h1" style={{ marginTop: 10 }}>{title}</h1>
        <p className="muted">{car.trimLevel ? car.trimLevel : '—'}</p>

        <div className="row" style={{ justifyContent: 'flex-end', gap: 8, marginTop: 8 }}>
          {canEdit && (
            <>
              <Link
                className="btn secondary"
                to={`/cars/edit/${car.id}`}
                title="Modifica veicolo"
              >
                Modifica
              </Link>

              <button
                className="btn"
                onClick={onDelete}
                disabled={deleting}
                title="Elimina veicolo"
                style={{
                  border: '1px solid #ef4444',
                  color: '#ef4444',
                  background: 'transparent'
                }}
              >
                <svg
                  width="18"
                  height="18"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  style={{ verticalAlign: 'middle', marginRight: 6 }}
                >
                  <line x1="18" y1="6" x2="6" y2="18"></line>
                  <line x1="6" y1="6" x2="18" y2="18"></line>
                </svg>
                {deleting ? 'Elimino…' : 'Elimina'}
              </button>
            </>
          )}
        </div>

        <div className="card" style={{ marginTop: 12 }}>
          <Carousel images={images} alt={`${car.make} ${car.model}`} />
        </div>

        <div className="grid" style={{ marginTop: 16 }}>
          <section className="card">
            <div className="card-body">
              <h3 style={{ marginTop: 0 }}>Spec Tecniche</h3>
              <div className="row" style={{ gap: 18, flexWrap: 'wrap' }}>
                <Spec label="Motore" value={car.engine} />
                <Spec label="Potenza" value={car.horsepower ? `${car.horsepower} CV` : null} />
                <Spec label="Coppia" value={car.torqueNm ? `${car.torqueNm} Nm` : null} />
                <Spec label="kilometri" value={car.mileageKm ? `${car.mileageKm} KM` : null} />
                <Spec label="Trazione" value={car.drivetrain} />
                <Spec label="Cambio" value={car.transmission} />
                <Spec label="Alimentazione" value={car.fuelType} />
                <Spec label="Posti" value={car.seats} />
                <Spec label="Porte" value={car.doors} />
                <Spec label="Colore" value={car.color} />
              </div>
            </div>
          </section>

          <section className="card">
            <div className="card-body">
              <h3 style={{ marginTop: 0 }}>Descrizione</h3>
              <p className="muted" style={{ lineHeight: 1.6 }}>
                {car.description || 'Nessuna descrizione disponibile.'}
              </p>
            </div>
          </section>

          <section className="card">
            <div className="card-body">
              <h3 style={{ marginTop: 0 }}>Posizione</h3>
              <div className="row" style={{ gap: 18, flexWrap: 'wrap' }}>
                <Spec label="Indirizzo" value={car.locationText} />
                <Spec label="Città" value={car.city} />
              </div>
            </div>
          </section>
        </div>

        <div className="card" style={{ marginTop: 16 }}>
          <div className="card-body">
            <button
              className="btn secondary"
              style={{
                width: "100%",
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
              }}
              onClick={() => setOpenPerizia((v) => !v)}
            >
              <span>Perizia</span>
              <span style={{ opacity: 0.8 }}>{openPerizia ? "▲" : "▼"}</span>
            </button>

            {openPerizia && (
              <div style={{ marginTop: 12 }}>
                {!car.isPeriziata ? (
                  <p className="muted" style={{ lineHeight: 1.6 }}>
                    Auto non ancora periziata, fai un'offerta e raggiungi un accordo per la perizia!!!
                  </p>
                ) : (
                  <>
                    <p className="muted" style={{ lineHeight: 1.6 }}>
                      Auto periziata con successo, scarica il documento.
                    </p>

                    <button
                      className="btn"
                      style={{ marginTop: 10, minWidth: 220, height: 44 }}
                      onClick={downloadPerizia}
                    >
                      Scarica perizia (PDF)
                    </button>

                    {!isSignedIn && (
                      <p className="muted" style={{ marginTop: 10 }}>
                        Devi effettuare il login per scaricare la perizia.
                      </p>
                    )}
                  </>
                )}
              </div>
            )}
          </div>
        </div>

        {isSignedIn && clerkUserId && !isOwner && (
          <div style={{ display: "flex", justifyContent: "center", marginTop: 28 }}>
            <button
              className="btn"
              style={{ minWidth: 220, height: 48, fontSize: 16 }}
              onClick={() => setShowOfferPopup(true)}
            >
              Fai un’offerta
            </button>
          </div>
        )}

        {showOfferPopup && (
          <div className="ascari-modal" onClick={() => setShowOfferPopup(false)}>
            <div className="ascari-modal-box" onClick={(e) => e.stopPropagation()}>
              <h3>Fai un'offerta</h3>
              <p className="muted">Seleziona uno dei prezzi proposti dal proprietario:</p>

              <div className="ascari-offer-buttons">
                {[car.offerPrice1, car.offerPrice2, car.offerPrice3]
                  .filter((p) => p != null)
                  .map((p, i) => (
                    <button
                      key={i}
                      className="btn secondary"
                      onClick={() => sendOffer(p!)}
                      style={{ minWidth: 110 }}
                    >
                      {p} €
                    </button>
                  ))}
              </div>

              <button
                className="btn ghost"
                style={{ marginTop: 18, width: "100%" }}
                onClick={() => setShowOfferPopup(false)}
              >
                Chiudi
              </button>
            </div>
          </div>
        )}

        {thanksPopup && (
          <div className="ascari-modal" onClick={() => setThanksPopup(false)}>
            <div className="ascari-modal-box" onClick={(e) => e.stopPropagation()}>
              <h3>Offerta inviata!</h3>
              <p className="muted">Grazie per la tua offerta. Il proprietario ti risponderà al più presto.</p>

              <button
                className="btn"
                style={{ marginTop: 18, width: "100%" }}
                onClick={() => setThanksPopup(false)}
              >
                Chiudi
              </button>
            </div>
          </div>
        )}
      </div>

      {popup.open && (
        <AscariPopup
          title={popup.title}
          message={popup.message}
          variant={popup.variant}
          confirmText={popup.confirmText}
          cancelText={popup.cancelText}
          loading={popup.loading}
          onClose={closePopup}
          onCancel={closePopup}
          onConfirm={
            popup.onConfirm
              ? async () => {
                  await popup.onConfirm?.()
                }
              : undefined
          }
          closeOnBackdrop={!popup.loading}
        />
      )}
    </>
  )
}

function Spec({ label, value }: { label: string, value: any }) {
  return (
    <div className="kv">
      <span className="muted">{label}</span>
      <b>{value ?? '—'}</b>
    </div>
  )
}