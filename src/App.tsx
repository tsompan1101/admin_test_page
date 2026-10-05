import { NavLink, Outlet } from 'react-router-dom'
import './index.css'
import './admin.css'
import './App.css'
import { logout } from './lib/admin-api'
import { useSesion } from './lib/useSesion'
import Login from './pages/Login'

// "permiso: 'admin'" = solo administradores (ver useSesion.puede)
const SECCIONES = [
  { ruta: '/mapa', etiqueta: 'Mapa', permiso: 'mapa' },
  { ruta: '/cronograma', etiqueta: 'Cronograma', permiso: 'cronograma' },
  { ruta: '/participantes', etiqueta: 'Participantes', permiso: 'participantes' },
  { ruta: '/mensajes', etiqueta: 'Mensajes', permiso: 'mensajes' },
  { ruta: '/usuarios', etiqueta: 'Usuarios', permiso: 'admin' },
]

export default function Admin() {
  const { sesion, cargando, puede } = useSesion()

  if (cargando) return null
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
    <div className="admin">
      <nav className="admin-nav">
        {visibles.map((s) => (
          <NavLink key={s.ruta} to={s.ruta} className={({ isActive }) => (isActive ? 'activo' : undefined)}>
            {s.etiqueta}
          </NavLink>
        ))}
        <span style={{ flex: 1 }} />
        <small>{sesion.user.email}</small>
        <button onClick={() => logout()}>Cerrar sesión</button>
      </nav>
      <main className="admin-main">
        {/* RequierePermiso e Inicio leen este contexto */}
        <Outlet context={{ puede, primera: visibles[0].ruta }} />
      </main>
    </div>
  )
}
