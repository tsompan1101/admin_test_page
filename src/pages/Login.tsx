import { useState } from 'react'
import { login } from '../lib/admin-api'

export default function Login() {
  const [email, setEmail] = useState('')
  const [clave, setClave] = useState('')
  const [estado, setEstado] = useState('')

  async function entrar(e: React.FormEvent) {
    e.preventDefault()
    setEstado('Entrando…')
    try {
      await login(email, clave)
      setEstado('')
    } catch (err) {
      setEstado(err instanceof Error ? err.message : 'No se pudo iniciar sesión')
    }
  }

  return (
    <form onSubmit={entrar} style={{ maxWidth: 320, margin: '20vh auto', display: 'grid', gap: 12 }}>
      <h1>Panel CIET</h1>
      <input type="email" placeholder="Correo" value={email} onChange={(e) => setEmail(e.target.value)} required />
      <input type="password" placeholder="Contraseña" value={clave} onChange={(e) => setClave(e.target.value)} required />
      <button type="submit">Entrar</button>
      {estado && <p role="status">{estado}</p>}
    </form>
  )
}
