// frontend/src/pages/Cars.tsx
import React, { useEffect, useMemo, useState } from 'react'
import { http } from '../api'
import Carousel from '../components/Carousel/Carousel'
import { Link } from 'react-router-dom'
import { loadDrafts, removeDraft, DraftCar } from '../../../../ascari-auth-search/frontend/lib/drafts'
import { useNavigate } from 'react-router-dom'
import { ping } from '../api'

type Car = {
  id:number; make:string; model:string; year:number;
  latitude?:number; longitude?:number; distanceKm?:number;
  photos?: string[];            // 👈 prendiamo le foto dal DB
  coverUrl?: string;            // 👈 copertina opzionale dal DB
}

export default function Cars() {
  const [list, setList] = useState<Car[]>([])
  const [q, setQ] = useState('')
  const [radius, setRadius] = useState(5)
  const [pos, setPos] = useState<{lat:number,lon:number}|null>(null)
  const [loading, setLoading] = useState(false)
  const [err, setErr] = useState<string|null>(null)
  const nav = useNavigate()
  const [drafts, setDrafts] = useState<DraftCar[]>([])


  async function loadAll() {
    const { data } = await http.get<Car[]>('/cars')
    setList(data)
  }
useEffect(() => {
  loadAll();
  setDrafts(loadDrafts());

  (async () => {
    try {
      await ping(); // DB online
      // prova a caricare ogni bozza nel DB e poi rimuoverla
      const local = loadDrafts();
      for (const d of local) {
        await http.post('/cars', {
          make: d.make, model: d.model, year: d.year,
          fuelType: d.fuelType, horsepower: d.horsepower, mileageKm: d.mileageKm,
          photos: d.photos, coverUrl: d.coverUrl, description: d.description,
          latitude: d.latitude, longitude: d.longitude
        });
        removeDraft(d.id);
      }
      setDrafts(loadDrafts());
      await loadAll();
    } catch {
      // DB offline: lascia le bozze in vista
    }
  })();
}, []);



  async function search() {
    setErr(null); setLoading(true)
    try{
      if (!q.trim()) { await loadAll(); return }
      const { data } = await http.get<Car[]>('/cars/search', { params: { q } })
      setList(data)
    } catch(e:any){ setErr(e?.message || 'Errore ricerca') }
    finally{ setLoading(false) }
  }

  async function nearby() {
    setErr(null)
    if (!navigator.geolocation) { setErr('Geolocalizzazione non supportata'); return }
    setLoading(true)
    navigator.geolocation.getCurrentPosition(async (p) => {
      try{
        const lat = p.coords.latitude
        const lon = p.coords.longitude
        setPos({ lat, lon })
        const { data } = await http.get<Car[]>('/cars/nearby', { params: { lat, lon, radiusKm: radius } })
        setList(data)
      } catch(e:any){ setErr(e?.message || 'Errore geolocalizzazione') }
      finally{ setLoading(false) }
    }, (e) => { setErr(e.message); setLoading(false) })
  }

 /*  async function createInDbOrDraft(){
  try{
    await ping(); // se non lancia eccezione, DB è online
    const { data } = await http.post('/cars', {
      make:'', model:'', year:new Date().getFullYear(),
      photos: []
    });
    nav(`/cars/edit/${data.id}`); // vai a MODIFICA DB
  } catch {
    nav('/cars/new'); // offline: usa editor di bozza locale
  }
} */

function goToNew() {
  nav('/cars/new');   // GUI → Salva → scrive sul DB (se online) o bozza (se offline)
}

  const resultsTitle = useMemo(() => {
    if (q.trim()) return `Risultati per “${q}”`
    if (pos) return `A ${radius} km dalla tua posizione`
    return 'Tutti i modelli'
  }, [q, pos, radius])

function slug(car: Car){
  return `${car.make}-${car.model}`.toLowerCase().replace(/\s+/g,'-')
}

function defaultBySlug(car: Car){
  const s = slug(car)
  return [1,2,3].map(i => `/cars/${s}-${i}.jpg`)
}

function imagesForCard(car: Car){
  // 1) prendi prima dal DB (se presenti)
  const fromDb = Array.isArray(car.photos) ? car.photos.filter(Boolean) : []
  let imgs = fromDb.length ? fromDb : defaultBySlug(car)

  // 2) porta la cover in prima posizione se esiste
  if (car.coverUrl) {
    imgs = [car.coverUrl, ...imgs.filter(u => u !== car.coverUrl)]
  }

  // 3) dedup finale + fallback placeholder
  const seen = new Set<string>()
  const dedup = imgs.filter(u => !seen.has(u) && seen.add(u))
  return dedup.length ? dedup : ['/cars/placeholder.jpg']
}


  return (
    <div>
      <h1 className="h1">Auto disponibili</h1>
      <p className="muted">Cerca un modello oppure mostra i veicoli nelle vicinanze.</p>

      <div className="toolbar">
        <input className="input" placeholder="Cerca per marca o modello (es. Ascari GT)" value={q} onChange={e=>setQ(e.target.value)} style={{minWidth:280}} />
        <button className="btn" onClick={search} disabled={loading}>Cerca</button>

        <span style={{width:16}}/>
        <label className="muted" htmlFor="radius">Raggio</label>
        <input id="radius" className="input" type="number" min={1} max={100} value={radius} onChange={e=>setRadius(parseInt(e.target.value))} style={{width:90}} />
        <span className="tag">km</span>
        <button className="btn secondary" onClick={nearby} disabled={loading}>Vicino a me</button>
        {pos && <small className="muted"> (lat: {pos.lat.toFixed(4)}, lon: {pos.lon.toFixed(4)})</small>}
        <div style={{flex:1}} />
        <button className="btn" onClick={goToNew}>+ Nuovo</button>
        <button className="btn ghost" onClick={() => { setQ(''); setPos(null); loadAll() }}>Reset</button>
      </div>

      {err && <p style={{ color:'var(--danger)', marginTop:6 }}>{err}</p>}
      <p className="muted" style={{margin:'6px 0 0'}}>{resultsTitle} — <b>{list.length}</b> veicolo/i</p>

      {drafts.length > 0 && (
  <>
    <p className="muted" style={{margin:'12px 0 0'}}>
      Bozze non sincronizzate — <b>{drafts.length}</b>
    </p>
    <div className="grid">
      {drafts.map(d => (
        <article key={d.id} className="card" title="Bozza locale">
          <div className="card-body">
            <div className="row space">
              <div className="flex">
                <span className="tag">{d.make}</span>
                <h3 style={{margin:'0 0 0 2px'}}>{d.model}</h3>
              </div>
              <span className="tag">{d.year}</span>
            </div>
            {/* piccolo carosello “poor-man”: prima foto */}
            <div className="card" style={{marginTop:8}}>
              {d.photos?.[0]
                ? <img src={d.coverUrl || d.photos[0]} alt="cover" style={{width:'100%', display:'block', borderRadius:12}} />
                : <div style={{height:180}}/>
              }
            </div>
            <div className="row" style={{marginTop:10}}>
              <span className="tag">Bozza</span>
              <small className="muted">non salvata nel DB</small>
            </div>
            <div className="footer-actions">
              <Link className="btn" to={`/cars/new?draft=${d.id}`}>Apri / Modifica</Link>
              <button
                className="btn secondary"
                onClick={() => { removeDraft(d.id); setDrafts(loadDrafts()); }}
              >Elimina</button>
            </div>

          </div>
        </article>
      ))}
    </div>
  </>
)}


      <div className="grid">
        {list.map(car => (
          <article className="card" key={car.id}>
            {/* Carosello immagini */}
            <Carousel images={imagesForCard(car)} alt={`${car.make} ${car.model}`} />

            {/* Body */}
            <div className="card-body">
              <div className="row space">
                <div className="flex">
                  <span className="tag">{car.make}</span>
                  <h3 style={{margin:'0 0 0 2px'}}>{car.model}</h3>
                </div>
                <span className="tag"> {car.year} </span>
              </div>

              <div className="row" style={{marginTop:10, flexWrap:'wrap'}}>
                <div className="kv"><span className="muted">ID</span> <b>#{car.id}</b></div>
                <div className="kv"><span className="muted">Posizione</span> <b>{(car.latitude!=null&&car.longitude!=null) ? `${car.latitude.toFixed(4)}, ${car.longitude.toFixed(4)}` : '-'}</b></div>
                <div className="kv"><span className="muted">Distanza</span> <b>{car.distanceKm != null ? `${car.distanceKm} km` : '—'}</b></div>
              </div>

              <div className="footer-actions">
                <Link className="btn" to={`/cars/${car.id}`}>Dettaglio modello</Link>
                <Link className="btn secondary" to={`/cars/edit/${car.id}`}>Modifica</Link>
              </div>


            </div>
          </article>
        ))}
      </div>

      <p className="muted" style={{marginTop:18}}>
        Suggerimento: aggiungi immagini in <code>/public/cars</code> (es. <code>ascari-gt-1.jpg</code>, <code>ascari-gt-2.jpg</code>, …).
        Se mancano, verrà mostrato <code>placeholder.jpg</code>.
      </p>
    </div>
  )
}
