import { invocar } from './admin-api'

export type Rol = 'admin' | 'editor'
export type Usuario = {
  id: string
  email: string
  role: Rol
  permisos: string[]
  ultimo_acceso: string | null
}

const F = 'admin-usuarios'

export const listarUsuarios = () => invocar<Usuario[]>(F, { accion: 'listar' })

export const crearUsuario = (u: { email: string; password: string; role: Rol; permisos: string[] }) =>
  invocar<Usuario>(F, { accion: 'crear', ...u })

export const actualizarUsuario = (id: string, role: Rol, permisos: string[]) =>
  invocar<Usuario>(F, { accion: 'actualizar', id, role, permisos })

export const eliminarUsuario = (id: string) => invocar<{ ok: true }>(F, { accion: 'eliminar', id })
