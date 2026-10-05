import { createClient } from '@supabase/supabase-js'

// La anon key es pública por diseño: la seguridad la dan las políticas RLS
// y el login, no el secreto de esta clave.
const url = import.meta.env.VITE_SUPABASE_URL
const key = import.meta.env.VITE_SUPABASE_ANON_KEY
if (!url || !key) {
  throw new Error('Faltan VITE_SUPABASE_URL o VITE_SUPABASE_ANON_KEY en .env (reinicia `npm run dev` tras editarlo)')
}

export const supabase = createClient(url, key)
