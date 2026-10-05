import type { ReactNode } from 'react'
import { Navigate, useOutletContext } from 'react-router-dom'

// Lo entrega <Outlet context={...} /> en Admin.tsx
export type CtxAdmin = { puede: (permiso: string) => boolean; primera: string }

export default function RequierePermiso({ permiso, children }: { permiso: string; children: ReactNode }) {
  const { puede } = useOutletContext<CtxAdmin>()
  return puede(permiso) ? <>{children}</> : <p>No tienes permiso para esta sección.</p>
}

// Ruta "/": lleva a la primera sección que el usuario puede ver.
export function Inicio() {
  const { primera } = useOutletContext<CtxAdmin>()
  return <Navigate to={primera} replace />
}
