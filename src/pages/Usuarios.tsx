import { useCallback, useEffect, useState } from 'react'
import './extra.css'
import { PERMISOS } from '../lib/catalogos'
import { useSesion } from '../lib/useSesion'
import {
  type Rol,
  type Usuario,
  actualizarUsuario,
  crearUsuario,
  eliminarUsuario,
  listarUsuarios,
} from '../lib/usuario-api'

const msg = (e: unknown) => (e instanceof Error ? e.message : String(e))
const igual = (a: string[], b: string[]) => [...a].sort().join() === [...b].sort().join()

function Permisos({ valor, onChange, deshabilitado }: { valor: string[]; onChange: (v: string[]) => void; deshabilitado?: boolean }) {
  return (
    <div className="ex-checks">
      {PERMISOS.map((p) => (
        <label key={p.id}>
          <input
            type="checkbox"
            disabled={deshabilitado}
            checked={valor.includes(p.id)}
            onChange={(e) => onChange(e.target.checked ? [...valor, p.id] : valor.filter((x) => x !== p.id))}
          />
          {p.etiqueta}
        </label>
      ))}
    </div>
  )
}

function Fila({ u, esYo, onGuardar, onEliminar }: {
  u: Usuario
  esYo: boolean
  onGuardar: (id: string, role: Rol, permisos: string[]) => void
  onEliminar: (u: Usuario) => void
}) {
  const [role, setRole] = useState<Rol>(u.role)
  const [permisos, setPermisos] = useState<string[]>(u.permisos)
  const sucio = role !== u.role || !igual(permisos, u.permisos)

  return (
    <tr style={{ cursor: 'default' }}>
      <td>
        {u.email}
        {esYo && ' (tú)'}
        <br />
        <small>{u.ultimo_acceso ? `Último acceso: ${new Date(u.ultimo_acceso).toLocaleString()}` : 'Nunca ha entrado'}</small>
      </td>
      <td>
        <label className="ex-checks">
          <input type="checkbox" disabled={esYo} checked={role === 'admin'} onChange={(e) => setRole(e.target.checked ? 'admin' : 'editor')} />
          Administrador
        </label>
      </td>
      <td>
        <Permisos valor={permisos} onChange={setPermisos} deshabilitado={esYo || role === 'admin'} />
      </td>
      <td>
        <div className="ex-acciones">
          <button disabled={!sucio || esYo} onClick={() => onGuardar(u.id, role, permisos)}>Guardar</button>
          <button disabled={esYo} onClick={() => onEliminar(u)}>Eliminar</button>
        </div>
      </td>
    </tr>
  )
}

export default function Usuarios() {
  const { sesion } = useSesion()
  const [usuarios, setUsuarios] = useState<Usuario[]>([])
  const [estado, setEstado] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [role, setRole] = useState<Rol>('editor')
  const [permisos, setPermisos] = useState<string[]>([])

  const cargar = useCallback(async () => {
    try {
      setUsuarios(await listarUsuarios())
    } catch (e) {
      setEstado(msg(e))
    }
  }, [])
  useEffect(() => {
    cargar()
  }, [cargar])

  async function crear(e: React.FormEvent) {
    e.preventDefault()
    try {
      await crearUsuario({ email, password, role, permisos })
      setEmail('')
      setPassword('')
      setRole('editor')
      setPermisos([])
      setEstado('Usuario creado. Comparte la contraseña temporal por un canal seguro.')
      await cargar()
    } catch (err) {
      setEstado(msg(err))
    }
  }

  async function guardar(id: string, r: Rol, p: string[]) {
    try {
      await actualizarUsuario(id, r, p)
      setEstado('Permisos actualizados. Se aplican cuando el usuario vuelve a iniciar sesión.')
      await cargar()
    } catch (e) {
      setEstado(msg(e))
    }
  }

  async function eliminar(u: Usuario) {
    if (!confirm(`¿Eliminar a ${u.email}?`)) return
    try {
      await eliminarUsuario(u.id)
      setEstado('Usuario eliminado')
      await cargar()
    } catch (e) {
      setEstado(msg(e))
    }
  }

  return (
    <div style={{ display: 'grid', gap: 20 }}>
      <form className="ex-panel" onSubmit={crear} style={{ maxWidth: 520 }}>
        <h2>Nuevo usuario</h2>
        <label>Correo<input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required /></label>
        <label>
          Contraseña temporal (mínimo 8 caracteres)
          <input type="password" minLength={8} value={password} onChange={(e) => setPassword(e.target.value)} required />
        </label>
        <label className="ex-checks">
          <input type="checkbox" checked={role === 'admin'} onChange={(e) => setRole(e.target.checked ? 'admin' : 'editor')} />
          Administrador (acceso total y gestión de usuarios)
        </label>
        <fieldset>
          <legend>Secciones que puede usar</legend>
          <Permisos valor={permisos} onChange={setPermisos} deshabilitado={role === 'admin'} />
        </fieldset>
        <div className="ex-acciones"><button type="submit">Crear usuario</button></div>
      </form>

      <p className="ex-estado" role="status">{estado}</p>

      <table className="ex-tabla">
        <thead>
          <tr><th>Usuario</th><th>Rol</th><th>Secciones</th><th></th></tr>
        </thead>
        <tbody>
          {usuarios.map((u) => (
            <Fila key={`${u.id}-${u.role}-${u.permisos.join()}`} u={u} esYo={u.id === sesion?.user.id} onGuardar={guardar} onEliminar={eliminar} />
          ))}
        </tbody>
      </table>
    </div>
  )
}
