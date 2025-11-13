import React, { useEffect, useRef, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { http } from '../api'
import { useAuth } from '@clerk/clerk-react';
import { getDraft, upsertDraft, addDraft, removeDraft } from '../../lib/drafts'

function uid() { return Math.random().toString(36).slice(2) + Date.now().toString(36) }

export default function CarNew() {
  const nav = useNavigate()
  const [params] = useSearchParams()
  const draftId = params.get('draft') || ''   // 👈 se presente, stiamo modificando una bozza

  const { getToken } = useAuth();

  const [make, setMake] = useState('')
  const [model, setModel] = useState('')
  const [title, setTitle] = useState('')      // 👈 nuovo
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
    setTitle(d.title || '')                       // 👈 recupera title dalla bozza se esiste
    setYear(d.year || new Date().getFullYear())
    setFuelType(d.fuelType || '')
    setHorsepower((d.horsepower ?? '') as any)
    setMileageKm((d.mileageKm ?? '') as any)
    setDescription(d.description || '')
    setCoverUrl(d.coverUrl || '')
    setPhotos(Array.isArray(d.photos) ? d.photos : [])
  }, [draftId])

  async function onSelectFiles(files: FileList | null) {
  if (!files) return;
  const arr: string[] = [];

  for (const f of Array.from(files)) {
    const dataUrl = await fileToDataURL(f);
    arr.push(dataUrl);
  }

  setPhotos(prev => [...prev, ...arr]);
  if (!coverUrl && arr[0]) setCoverUrl(arr[0]);

  // reset input per permettere di riselezionare lo stesso file
  if (inputRef.current) {
    inputRef.current.value = '';
  }
}


  function removePhoto(i: number){
    setPhotos(prev => prev.filter((_,idx)=> idx!==i))
  }

  async function onSave() {
    setErr(null); setOk(null)

    // se non compili il titolo, ne genero uno base
    const finalTitle =
      title.trim() ||
      [make, model, year].filter(Boolean).join(' ') ||
      'Nuova auto'

    const payload = {
      make,
      model,
      title: finalTitle,                    // 👈 ora viene inviato
      year: Number(year),
      fuelType: fuelType || undefined,
      horsepower: horsepower === '' ? undefined : Number(horsepower),
      mileageKm: mileageKm === '' ? undefined : Number(mileageKm),
      description: description || undefined,
      coverUrl: coverUrl || undefined,
      photos
    }

    try {
      const token = await getToken();

      if (!token) {
        setErr('Non sei autenticato. Effettua il login prima di salvare.');
        return;
      }

      // 1) prova a salvare sul DB
      const { data } = await http.post('/cars', payload, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (draftId) removeDraft(draftId)
      setOk('Salvato nel DB (#' + data.id + ')')
      setTimeout(() => nav(`/cars/${data.id}`), 400)
      return
    } catch (e:any) {
      console.error(
        'POST /cars failed',
        e?.response?.status,
        e?.response?.data || e?.message
      )

      if (e?.response?.status === 401) {
        setErr('Non autorizzato: assicurati di essere loggato con Clerk.')
        return
      }

      const draft = {
        id: draftId || uid(),
        createdAt: Date.now(),
        ...payload
      }

      if (draftId) {
        upsertDraft(draft)
      } else {
        addDraft(draft)
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
            <input className="input" placeholder="Titolo annuncio" value={title} onChange={e=>setTitle(e.target.value)} /> {/* 👈 nuovo campo */}
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
    const r = new FileReader();

    r.onload = () => {
      resolve(String(r.result));
    };

    r.onerror = () => {
      reject(r.error || new Error('Errore nella lettura del file'));
    };

    r.readAsDataURL(f);   // 👈 chiamata UNA sola volta
  });
}

