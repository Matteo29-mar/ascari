import React, { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { http } from '../api'
import AuthForm from '../components/AuthForm'

export default function Login() {
  const [err, setErr] = useState<string|null>(null)
  const nav = useNavigate()

  async function onSubmit(e: React.FormEvent, email: string, password: string) {
    e.preventDefault()
    setErr(null)
    try {
      const { data } = await http.post('/auth/login', { email, password })
      localStorage.setItem('token', data.token)
      nav('/cars')
    } catch (e: any) {
      setErr(e?.response?.data?.error || 'Login failed')
    }
  }

  return (
    <div>
      <h2>Accedi</h2>
      {err && <p style={{ color:'red' }}>{err}</p>}
      <AuthForm onSubmit={onSubmit} submitLabel="Accedi" extra={(
  <>
    <p style={{ margin: '8px 0' }}><small className="muted">Oppure</small></p>
    <div className="row" style={{gap:8}}>
      <button className="btn secondary" disabled title="Configura Google nel backend per attivare">Accedi con Google</button>
      <button className="btn secondary" disabled title="Configura Apple nel backend per attivare">Accedi con Apple</button>
    </div>
    <p className="muted">Non hai un account? <Link to="/register">Registrati</Link></p>
  </>
)}
 />
    </div>
  )
}
