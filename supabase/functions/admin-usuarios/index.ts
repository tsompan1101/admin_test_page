// supabase functions deploy admin-usuarios
// Usa la service role (disponible automáticamente en Edge Functions); nunca llega al navegador.
import { createClient } from 'jsr:@supabase/supabase-js@2'

const PERMISOS = ['mapa', 'cronograma', 'participantes', 'mensajes']

const cors = {
  'Access-Control-Allow-Origin': Deno.env.get('ALLOWED_ORIGIN') ?? '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}
const json = (cuerpo: unknown, status = 200) =>
  new Response(JSON.stringify(cuerpo), { status, headers: { ...cors, 'Content-Type': 'application/json' } })

type U = { id: string; email?: string; app_metadata?: Record<string, unknown>; last_sign_in_at?: string | null }
const resumen = (u: U) => ({
  id: u.id,
  email: u.email ?? '',
  role: u.app_metadata?.role === 'admin' ? 'admin' : 'editor',
  permisos: (u.app_metadata?.permisos as string[] | undefined) ?? [],
  ultimo_acceso: u.last_sign_in_at ?? null,
})

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  if (req.method !== 'POST') return json('Método no permitido', 405)

  const url = Deno.env.get('SUPABASE_URL')!
  const quien = createClient(url, Deno.env.get('SUPABASE_ANON_KEY')!, {
    global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } },
  })
  const { data: { user } } = await quien.auth.getUser()
  if (!user) return json('No autenticado', 401)
  if (user.app_metadata?.role !== 'admin') return json('Solo los administradores gestionan usuarios', 403)

  const p = await req.json().catch(() => null)
  if (!p) return json('JSON inválido', 400)

  const admin = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  // Solo se aceptan permisos conocidos; cualquier otro valor se descarta.
  const role = p.role === 'admin' ? 'admin' : 'editor'
  const permisos = Array.isArray(p.permisos)
    ? [...new Set<string>(p.permisos)].filter((x) => PERMISOS.includes(x))
    : []

  switch (p.accion) {
    case 'listar': {
      const { data, error } = await admin.auth.admin.listUsers({ perPage: 200 })
      if (error) return json(error.message, 500)
      return json(data.users.map(resumen))
    }

    case 'crear': {
      const email = String(p.email ?? '').trim().toLowerCase()
      const password = String(p.password ?? '')
      if (!email.includes('@')) return json('Correo inválido', 400)
      if (password.length < 8) return json('La contraseña debe tener al menos 8 caracteres', 400)
      const { data, error } = await admin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        app_metadata: { role, permisos },
      })
      if (error) return json(error.message, 400)
      return json(resumen(data.user))
    }

    case 'actualizar': {
      if (p.id === user.id) return json('No puedes cambiar tus propios permisos', 400)
      const { data, error } = await admin.auth.admin.updateUserById(String(p.id), { app_metadata: { role, permisos } })
      if (error) return json(error.message, 400)
      return json(resumen(data.user)) // el cambio se aplica cuando el usuario renueva su sesión
    }

    case 'eliminar': {
      if (p.id === user.id) return json('No puedes eliminar tu propio usuario', 400)
      const { error } = await admin.auth.admin.deleteUser(String(p.id))
      if (error) return json(error.message, 400)
      return json({ ok: true })
    }

    default:
      return json('Acción desconocida', 400)
  }
})
