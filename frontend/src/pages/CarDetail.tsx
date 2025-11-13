import React, { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { http } from '../api'
import Carousel from '../components/Carousel/Carousel'
import { useAuth } from '@clerk/clerk-react';

type Car = {
  id:number; make:string; model:string; year:number; trimLevel?:string|null;
  priceEur?:number|null; color?:string|null; transmission?:string|null; fuelType?:string|null;
  engine?:string|null; horsepower?:number|null; torqueNm?:number|null; drivetrain?:string|null;
  seats?:number|null; doors?:number|null; description?:string|null; photos?:string[]|null;
  latitude?:number|null; longitude?:number|null;

  // 👇 aggiunto: proprietario dal DB
  owner?: {
    clerkId: string;
  };
}



export default function CarDetail() {
  const { id } = useParams()
  const nav = useNavigate()
  const [car, setCar] = useState<Car|null>(null)
  const [err, setErr] = useState<string|null>(null)
  const [loading, setLoading] = useState(true)
  const [deleting, setDeleting] = useState(false);
  
  const { userId: clerkUserId, isSignedIn, getToken } = useAuth();  // 👈 QUI

  useEffect(() => {
    let mounted = true
    async function run() {
      try {
        const { data } = await http.get<Car>(`/cars/${id}`)
        if (mounted) setCar(data)
      } catch(e:any) {
        setErr(e?.response?.data?.error || 'Errore caricamento')
      } finally { if (mounted) setLoading(false) }
    }
    run()
    return () => { mounted = false }
  }, [id])

  const title = useMemo(() => {
    if (!car) return 'Modello'
    return `${car.make} ${car.model} ${car.year}`
  }, [car])

  const images = useMemo(() => {
    // Se in DB non ci sono foto, fallback a convenzione /cars/<slug>-N.jpg
    if (car?.photos && Array.isArray(car.photos) && car.photos.length) return car.photos
    if (!car) return ['/cars/placeholder.jpg']
    const slug = `${car.make}-${car.model}`.toLowerCase().replace(/\s+/g,'-')
    return [1,2,3].map(i => `/cars/${slug}-${i}.jpg`)
  }, [car])

  if (loading) return <p>Caricamento…</p>
  if (err) return (
    <div>
      <p style={{color:'var(--danger)'}}>{err}</p>
      <button className="btn secondary" onClick={() => nav(-1)}>Torna indietro</button>
    </div>
  )
  if (!car) return null

  const canEdit =
  isSignedIn && car.owner && car.owner.clerkId === clerkUserId;

  return (
    <div>
      <button className="btn secondary" onClick={() => nav(-1)}>← Indietro</button>
      <h1 className="h1" style={{marginTop:10}}>{title}</h1>
      <p className="muted">{car.trimLevel ? car.trimLevel : '—'} · ID #{car.id}</p>
      <div className="row" style={{justifyContent:'flex-end', gap:8, marginTop:8}}>
      
  {/* 👇 SOLO SE È LA MIA AUTO MOSTRO I BOTTONI */}
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
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
            strokeLinecap="round" strokeLinejoin="round" style={{verticalAlign:'middle', marginRight:6}}>
          <line x1="18" y1="6" x2="6" y2="18"></line>
          <line x1="6" y1="6" x2="18" y2="18"></line>
        </svg>
        {deleting ? 'Elimino…' : 'Elimina'}
      </button>
    </>
  )}

</div>

      {/* Carosello immagini */}
      <div className="card" style={{marginTop:12}}>
        <Carousel images={images} alt={`${car.make} ${car.model}`} />
      </div>

      {/* Specifiche */}
      <div className="grid" style={{marginTop:16}}>
        <section className="card">
          <div className="card-body">
            <h3 style={{marginTop:0}}>Spec Tecniche</h3>
            <div className="row" style={{gap:18, flexWrap:'wrap'}}>
              <Spec label="Motore" value={car.engine} />
              <Spec label="Potenza" value={car.horsepower ? `${car.horsepower} CV` : null} />
              <Spec label="Coppia" value={car.torqueNm ? `${car.torqueNm} Nm` : null} />
              <Spec label="Trazione" value={car.drivetrain} />
              <Spec label="Cambio" value={car.transmission} />
              <Spec label="Alimentazione" value={car.fuelType} />
              <Spec label="Posti" value={car.seats} />
              <Spec label="Porte" value={car.doors} />
              <Spec label="Colore" value={car.color} />
              <Spec label="Prezzo" value={car.priceEur ? `€ ${car.priceEur.toLocaleString()}` : null} />
            </div>
          </div>
        </section>

        <section className="card">
          <div className="card-body">
            <h3 style={{marginTop:0}}>Descrizione</h3>
            <p className="muted" style={{lineHeight:1.6}}>
              {car.description || 'Nessuna descrizione disponibile.'}
            </p>
          </div>
        </section>

        <section className="card">
          <div className="card-body">
            <h3 style={{marginTop:0}}>Posizione</h3>
            <div className="row" style={{gap:18, flexWrap:'wrap'}}>
              <Spec label="Latitudine" value={car.latitude != null ? car.latitude.toFixed(4) : null} />
              <Spec label="Longitudine" value={car.longitude != null ? car.longitude.toFixed(4) : null} />
            </div>
          </div>
        </section>
      </div>

      {/* CTA futura */}
      <div className="row" style={{marginTop:16, justifyContent:'flex-end'}}>
        <button className="btn" disabled title="In arrivo">Messaggia il proprietario</button>
      </div>
    </div>
  )

  async function onDelete() {
  if (!id) return;
  const ok = window.confirm('Eliminare definitivamente questo veicolo?');
  if (!ok) return;

  try {
    setDeleting(true);

        // 👇 prendiamo il token di Clerk
    const token = await getToken();
    if (!token) {
      alert('Non sei autenticato. Riprova ad effettuare il login.');
      return;
    }

      await http.delete(`/cars/${id}`, {
      headers: {
        Authorization: `Bearer ${token}`,  // 👈 fondamentale
      },
    });
    // feedback semplice; puoi sostituire con toast
    alert('Veicolo eliminato');
    nav('/cars'); // torna alla lista
  } catch (e:any) {
    const msg = e?.response?.data?.error || e?.message || 'Errore eliminazione';
    alert(msg);
  } finally {
    setDeleting(false);
  }
}

}

function Spec({label, value}:{label:string, value:any}) {
  return (
    <div className="kv">
      <span className="muted">{label}</span>
      <b>{value ?? '—'}</b>
    </div>
  )
}


