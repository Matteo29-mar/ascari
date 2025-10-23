// frontend/src/components/AuthForm.tsx
import React, { useState } from 'react'

export default function AuthForm({
  onSubmit, submitLabel, extra
}:{ onSubmit:(e:React.FormEvent,email:string,password:string,name?:string)=>void, submitLabel:string, extra?:React.ReactNode }) {
  const [email, setEmail] = useState('demo@ascari.local')
  const [password, setPassword] = useState('password123')
  const [name, setName] = useState('Demo User')

  return (
    <form onSubmit={(e)=>onSubmit(e, email, password, name)} style={{ display:'grid', gap: 12, maxWidth: 420 }}>
      {submitLabel === 'Registrati' && <input className="input" placeholder="Nome" value={name} onChange={e=>setName(e.target.value)} />}
      <input className="input" placeholder="Email" value={email} onChange={e=>setEmail(e.target.value)} />
      <input className="input" placeholder="Password" type="password" value={password} onChange={e=>setPassword(e.target.value)} />
      <div className="row" style={{gap:10}}>
        <button className="btn" type="submit">{submitLabel}</button>
        {extra}
      </div>
    </form>
  )
}
