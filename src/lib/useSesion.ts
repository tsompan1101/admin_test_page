import { useEffect, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from './supabase'

export function useSesion() {
  const [sesion, setSesion] = useState<Session | null>(null)
  const [cargando, setCargando] = useState(true)

  useEffect(() => {
    supabase.auth
      .getSession()
      .then(({ data }) => setSesion(data.session))
      .catch((e) => console.error('getSession falló:', e))
      .finally(() => setCargando(false))
    const { data } = supabase.auth.onAuthStateChange((_evento, s) => setSesion(s))
    return () => data.subscription.unsubscribe()
  }, [])

  // Rol y permisos viajan en app_metadata, que el usuario no puede modificar.
  const esAdmin = sesion?.user.app_metadata?.role === 'admin'
  const permisos: string[] = sesion?.user.app_metadata?.permisos ?? []
  // 'admin' es un permiso especial: solo lo tiene un administrador (p. ej. la sección Usuarios).
  const puede = (p: string) => (p === 'admin' ? esAdmin : esAdmin || permisos.includes(p))
  return { sesion, cargando, esAdmin, permisos, puede }
}
