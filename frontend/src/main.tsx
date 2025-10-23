// frontend/src/main.tsx
import React from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter, Routes, Route, Navigate, Link } from 'react-router-dom'
import Login from './pages/Login'
import Register from './pages/Register'
import Cars from './pages/Cars'
import './styles.css'
import CarDetail from './pages/CarDetail'
import CarNew from './pages/CarNew'
import CarEdit from './pages/CarEdit'

function Layout({ children }:{ children: React.ReactNode }) {
  return (
    <>
      <nav className="nav">
        <div className="nav-inner container">
          <div className="brand">
            <span style={{width:12,height:12,borderRadius:999,background:'linear-gradient(135deg,var(--brand),var(--accent))',display:'inline-block'}} />
            ASCARI <span className="badge">DEV</span>
          </div>
          <div className="row" style={{gap:16}}>
            <Link to="/cars">Auto</Link>
            <Link to="/login">Login</Link>
          </div>
        </div>
      </nav>
      <div className="container">{children}</div>
    </>
  )
}

function RequireAuth({ children }:{ children: React.ReactNode }) {
  const token = localStorage.getItem('token')
  if (!token) return <Navigate to="/login" replace />
  return <>{children}</>
}

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Navigate to="/cars" replace />} />
        <Route path="/login" element={<Layout><Login /></Layout>} />
        <Route path="/register" element={<Layout><Register /></Layout>} />
        <Route path="/cars" element={<Layout><RequireAuth><Cars /></RequireAuth></Layout>} />
        <Route path="/cars/:id" element={<Layout><RequireAuth><CarDetail /></RequireAuth></Layout>} />
        <Route path="/cars/new" element={<Layout><RequireAuth><CarNew /></RequireAuth></Layout>} />
        <Route path="/cars/edit/:id" element={<Layout><RequireAuth><CarEdit /></RequireAuth></Layout>} />
      </Routes>
    </BrowserRouter>
  )
}

createRoot(document.getElementById('root')!).render(<App />)
