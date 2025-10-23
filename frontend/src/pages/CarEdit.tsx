import React, { useEffect, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { http } from '../api'

export default function CarEdit() {
  const { id } = useParams()
  const nav = useNavigate()
  const inputRef = useRef<HTMLInputElement|null>(null)
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState<string|null>(null)
  const [ok, setOk] = useState<string|null>(null)

  const [make, setMake] = useState('')
  const [model, setModel] = useState('')
  const [year, setYear] = useState<number>(new Date().getFullYear())
  const [fuelType, setFuelType] = useState('')
  const [horsepower, setHorsepower] = useState<number|undefined>(undefined)
  const [mileageKm, setMileageKm] = useState<number|undefined>(undefined)
  const [description, setDescription] = useState('')
  const [coverUrl, setCoverUrl] = useState<string>('')
  const [photos, setPhotos] = useState<string[]>([])

  useEffect(() => {
    (async () => {
      try {
        const { data } = await http.get(`/cars/${id}`, { params: { t: Date.now() } })
        setMake(data.make || '')
        setModel(data.model || '')
        setYear(data.year || new Date().getFullYear())
        setFuelType(data.fuelType || '')
        setHorsepower(data.horsepower ?? undefined)
        setMileageKm(data.mileageKm ?? undefined)
        setDescription(data.description || '')
        setCoverUrl(data.coverUrl || '')
        setPhotos(Array.isArray(data.photos) ? data.photos : [])
      } catch(e:any) {
        setErr(e?.response?.data?.error || 'Errore caricamento')
      } finally { setLoading(false) }
    })()
  }, [id])

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
  function removePhoto(i:number){ setPhotos(prev => prev.filter((_,idx)=>idx!==i)) }

  async function onSave() {
    setErr(null); setOk(null)
    try {
      const payload = {
        make, model, year,
        fuelType: fuelType || undefined,
        horsepower, mileageKm,
        description: description || undefined,
        coverUrl: coverUrl || undefined,
        photos
      }
      await http.put(`/cars/${id}`, payload)
      setOk('Salvato nel DB')
      setTimeout(() => nav(`/cars/${id}`), 400)
    } catch(e:any) {
      setErr(e?.response?.data?.error || 'Errore salvataggio')
    }
  }

  if (loading) return <p>Caricamento…</p>
  if (err) return <p style={{color:'var(--danger)'}}>{err}</p>

  return (
    <div>
      <button className="btn secondary" onClick={() => nav(-1)}>← Indietro</button>
      <h1 className="h1" style={{marginTop:10}}>Modifica veicolo #{id}</h1>
      {ok && <p style={{color:'var(--accent)'}}>{ok}</p>}

      <div className="grid" style={{marginTop:12}}>
        <section className="card"><div className="card-body">
          <div className="row" style={{gap:8, flexWrap:'wrap'}}>
            <input className="input" placeholder="Marca" value={make} onChange={e=>setMake(e.target.value)} />
            <input className="input" placeholder="Modello" value={model} onChange={e=>setModel(e.target.value)} />
            <input className="input" type="number" placeholder="Anno" value={year} onChange={e=>setYear(parseInt(e.target.value||'0'))} />
            <input className="input" placeholder="Carburante" value={fuelType} onChange={e=>setFuelType(e.target.value)} />
            <input className="input" type="number" placeholder="Potenza (CV)" value={horsepower ?? ''} onChange={e=>setHorsepower(e.target.value===''?undefined:Number(e.target.value))} />
            <input className="input" type="number" placeholder="Chilometri" value={mileageKm ?? ''} onChange={e=>setMileageKm(e.target.value===''?undefined:Number(e.target.value))} />
          </div>
          <textarea className="input" placeholder="Descrizione" value={description} onChange={e=>setDescription(e.target.value)} style={{width:'100%', height:100, marginTop:10, padding:10}} />
        </div></section>

        <section className="card"><div className="card-body">
          <h3 style={{marginTop:0}}>Immagini</h3>
          <div className="row" style={{gap:8, flexWrap:'wrap', marginBottom:8}}>
            <input ref={inputRef} type="file" accept="image/*" multiple onChange={e=>onSelectFiles(e.target.files)} />
            <input className="input" placeholder="Cover URL" value={coverUrl} onChange={e=>setCoverUrl(e.target.value)} style={{minWidth:320}} />
          </div>
          <div className="grid">
            {photos.map((src,i)=>(
              <div key={i} className="card">
                <img src={src} style={{width:'100%', display:'block'}} />
                <div className="card-body">
                  <div className="row space">
                    <small className="muted">#{i+1}</small>
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
