import { NavLink, Outlet } from 'react-router-dom'
import './admin.css'
import { logout } from './lib/admin-api'
import { useSesion } from './lib/useSesion'
import Login from './pages/Login'

// permiso: 'admin' = solo administradores (ver useSesion.puede)
const SECCIONES = [
  { ruta: '/mapa', etiqueta: 'Mapa', permiso: 'mapa', icono: 'mapa' },
  { ruta: '/cronograma', etiqueta: 'Cronograma', permiso: 'cronograma', icono: 'cronograma' },
  { ruta: '/participantes', etiqueta: 'Participantes', permiso: 'participantes', icono: 'participantes' },
  { ruta: '/qr', etiqueta: 'Códigos QR', permiso: 'participantes', icono: 'qr' },
  { ruta: '/mensajes', etiqueta: 'Mensajes', permiso: 'mensajes', icono: 'mensajes' },
  { ruta: '/usuarios', etiqueta: 'Usuarios', permiso: 'admin', icono: 'usuarios' },
]

// Íconos de trazo simple; heredan el color del texto (tema claro u oscuro).
const ICONOS: Record<string, string> = {
  mapa: 'M12 21s-7-6.2-7-11a7 7 0 0 1 14 0c0 4.8-7 11-7 11ZM12 7.5a2.5 2.5 0 1 0 0 5 2.5 2.5 0 0 0 0-5Z',
  cronograma: 'M4 6h16v14H4zM4 10h16M8 3v4M16 3v4',
  participantes: 'M9 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7ZM2.5 20c0-3.3 2.9-5.5 6.5-5.5s6.5 2.2 6.5 5.5M16 4.5a3.2 3.2 0 0 1 0 6.2M18 14.8c2 .6 3.5 2.3 3.5 5.2',
  qr: 'M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM14 14h2.5v2.5H14zM18 14h2v2h-2zM14 18h2v2h-2zM18 18h2v2h-2z',
  mensajes: 'M3 6h18v12H3zM3 7l9 6.5L21 7',
  usuarios: 'M12 3l7 3v5c0 4.5-3 8-7 10-4-2-7-5.5-7-10V6l7-3ZM9.5 12l2 2 3.5-4',
}

function Icono({ nombre }: { nombre: string }) {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={ICONOS[nombre]} />
    </svg>
  )
}

export default function Admin() {
  const { sesion, cargando, puede } = useSesion()

  if (cargando) return <p style={{ padding: 20 }}>Cargando…</p>
  if (!sesion) return <Login />

  const visibles = SECCIONES.filter((s) => puede(s.permiso))

  if (!visibles.length) {
    return (
      <div style={{ maxWidth: 420, margin: '20vh auto', display: 'grid', gap: 12 }}>
        <p>Tu usuario aún no tiene secciones asignadas. Pide a un administrador que te dé acceso.</p>
        <button onClick={() => logout()}>Cerrar sesión</button>
      </div>
    )
  }

  return (
    <div className="sb-shell">
      <aside className="sb-side">
        <div className="sb-brand">
          <strong>CIET 2026</strong>
          <small>Panel de administración</small>
        </div>

        <nav className="sb-nav" aria-label="Secciones">
          {visibles.map((s) => (
            <NavLink key={s.ruta} to={s.ruta} className={({ isActive }) => `sb-link${isActive ? ' activo' : ''}`}>
              <Icono nombre={s.icono} />
              <span>{s.etiqueta}</span>
            </NavLink>
          ))}
        </nav>

        <div className="sb-user">
          <small title={sesion.user.email}>{sesion.user.email}</small>
          <button onClick={() => logout()}>Cerrar sesión</button>
        </div>
      </aside>

      <main className="sb-main">
        {/* RequierePermiso e Inicio leen este contexto */}
        <Outlet context={{ puede, primera: visibles[0].ruta }} />
      </main>
    </div>
  )
}
