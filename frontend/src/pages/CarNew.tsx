import React, { useEffect, useRef, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { http } from '../api'
import { getDraft, upsertDraft, addDraft, removeDraft } from '../../../../ascari-auth-search/frontend/lib/drafts'

function uid() { return Math.random().toString(36).slice(2) + Date.now().toString(36) }

export default function CarNew() {
  const nav = useNavigate()
  const [params] = useSearchParams()
  const draftId = params.get('draft') || ''   // 👈 se presente, stiamo modificando una bozza

  const [make, setMake] = useState('')
  const [model, setModel] = useState('')
  const [year, setYear] = useState<number>(new Date().getFullYear())
  const [fuelType, setFuelType] = useState('')
  const [horsepower, setHorsepower] = useState<number|''>('')
  const [mileageKm, setMileageKm] = useState<number|''>('')
  const [description, setDescription] = useState('')
  const [coverUrl, setCoverUrl] = useState<string>('')
  const [photos, setPhotos] = useState<string[]>([])
  const [err, setErr] = useState<string|null>(null)
  const [ok, setOk] = useState<string|null>(null)
  const inputRef = useRef<HTMLInputElement|null>(null)

  // 👇 SE ARRIVA ?draft=<id> carica la BOZZA e popola i campi
  useEffect(() => {
    if (!draftId) return
    const d = getDraft(draftId)
    if (!d) return
    setMake(d.make || '')
    setModel(d.model || '')
    setYear(d.year || new Date().getFullYear())
    setFuelType(d.fuelType || '')
    setHorsepower((d.horsepower ?? '') as any)
    setMileageKm((d.mileageKm ?? '') as any)
    setDescription(d.description || '')
    setCoverUrl(d.coverUrl || '')
    setPhotos(Array.isArray(d.photos) ? d.photos : [])
  }, [draftId])

  async function onSelectFiles(files: FileList | null) {
    if (!files) return
    const arr: string[] = []
    for (const f of Array.from(files)) {
      const dataUrl = await fileToDataURL(f)
      arr.push(dataUrl)
    }
    setPhotos(prev => [...prev, ...arr])
    if (!coverUrl && arr[0]) setCoverUrl(arr[0])
  }

  function removePhoto(i: number){
    setPhotos(prev => prev.filter((_,idx)=> idx!==i))
  }

  async function onSave() {
    setErr(null); setOk(null)
    const payload = {
      make, model, year: Number(year),
      fuelType: fuelType || undefined,
      horsepower: horsepower === '' ? undefined : Number(horsepower),
      mileageKm: mileageKm === '' ? undefined : Number(mileageKm),
      description: description || undefined,
      coverUrl: coverUrl || undefined,
      photos
    }

    // 1) prova a salvare sul DB
    try {
      const { data } = await http.post('/cars', payload)
      // se stavo modificando una BOZZA, la elimino perché ora è sul DB
      if (draftId) removeDraft(draftId)
      setOk('Salvato nel DB (#'+data.id+')')
      setTimeout(() => nav(`/cars/${data.id}`), 400)
      return
    } catch (e:any) {
      console.error('POST /cars failed', e?.response?.status, e?.response?.data || e?.message)
      // 2) DB offline → salva/aggiorna la stessa BOZZA (NON crearne una nuova)
      const draft = {
        id: draftId || uid(),
        createdAt: Date.now(),
        ...payload
      }
      if (draftId) {
        upsertDraft(draft)     // aggiorna la bozza esistente
      } else {
        addDraft(draft)        // crea nuova bozza
      }
      setOk('DB non raggiungibile: salvata/aggiornata una BOZZA locale.')
      setTimeout(() => nav('/cars'), 500)
    }
  }

  return (
    <div>
      <button className="btn secondary" onClick={() => nav(-1)}>← Indietro</button>
      <h1 className="h1" style={{marginTop:10}}>
        {draftId ? 'Modifica bozza' : 'Nuovo veicolo'}
      </h1>
      <p className="muted">
        Compila i campi. Se il DB non è raggiungibile, salviamo una bozza locale.
      </p>

      {err && <p style={{color:'var(--danger)'}}>{err}</p>}
      {ok && <p style={{color:'var(--accent)'}}>{ok}</p>}

      <div className="grid" style={{marginTop:12}}>
        <section className="card"><div className="card-body">
          <div className="row" style={{gap:8, flexWrap:'wrap'}}>
            <input className="input" placeholder="Marca" value={make} onChange={e=>setMake(e.target.value)} />
            <input className="input" placeholder="Modello" value={model} onChange={e=>setModel(e.target.value)} />
            <input className="input" type="number" placeholder="Anno" value={year} onChange={e=>setYear(parseInt(e.target.value||'0'))} />
            <input className="input" placeholder="Carburante (es. Benzina)" value={fuelType} onChange={e=>setFuelType(e.target.value)} />
            <input className="input" type="number" placeholder="Potenza (CV)" value={horsepower} onChange={e=>setHorsepower(e.target.value===''?'':parseInt(e.target.value))} />
            <input className="input" type="number" placeholder="Chilometri" value={mileageKm} onChange={e=>setMileageKm(e.target.value===''?'':parseInt(e.target.value))} />
          </div>
          <textarea className="input" placeholder="Descrizione" value={description} onChange={e=>setDescription(e.target.value)} style={{width:'100%', height:100, marginTop:10, padding:10}} />
        </div></section>

        <section className="card"><div className="card-body">
          <h3 style={{marginTop:0}}>Immagini</h3>
          <div className="row" style={{gap:8, flexWrap:'wrap', marginBottom:8}}>
            <input ref={inputRef} type="file" accept="image/*" multiple onChange={e=>onSelectFiles(e.target.files)} />
            <input className="input" placeholder="Cover URL (facoltativo)" value={coverUrl} onChange={e=>setCoverUrl(e.target.value)} style={{minWidth:320}} />
          </div>
          <div className="grid">
            {photos.map((src,i)=>(
              <div key={i} className="card">
                <img src={src} style={{width:'100%', display:'block'}} />
                <div className="card-body">
                  <div className="row space">
                    <small className="muted">{i===0?'#1':'#'+(i+1)}</small>
                    <button className="btn secondary" onClick={()=>removePhoto(i)}>Rimuovi</button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div></section>
      </div>

      <div className="row" style={{marginTop:14, justifyContent:'flex-end'}}>
        <button className="btn" onClick={onSave}>Salva</button>
      </div>
    </div>
  )
}

function fileToDataURL(f: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader()
    r.onload = () => resolve(String(r.result))
    r.onerror = reject
    r.readAsDataURL(f)
  })
}
