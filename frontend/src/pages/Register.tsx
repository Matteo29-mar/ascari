import React, { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { http } from '../api'
import AuthForm from '../components/AuthForm'

export default function Register() {
  const [err, setErr] = useState<string|null>(null)
  const nav = useNavigate()

  async function onSubmit(e: React.FormEvent, email: string, password: string, name?: string) {
    e.preventDefault()
    setErr(null)
    try {
      const { data } = await http.post('/auth/register', { email, password, name })
      localStorage.setItem('token', data.token)
      nav('/cars')
    } catch (e: any) {
      setErr(e?.response?.data?.error || 'Registrazione fallita')
    }
  }

  return (
    <div>
      <h2>Registrati</h2>
      {err && <p style={{ color:'red' }}>{err}</p>}
      <AuthForm onSubmit={onSubmit} submitLabel="Registrati" extra={(
        <p>Hai già un account? <Link to="/login">Accedi</Link></p>
      )} />
    </div>
  )
}
