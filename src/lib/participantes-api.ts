import { ok } from './admin-api'
import { reducirImagen } from './imagen'
import { supabase } from './supabase'

export type Participante = {
  id?: number
  nombre_completo: string
  contacto_email: string | null
  telefono: string | null
  lugar_residencia: string | null
  sector_perteneciente: string | null
  institucion: string | null
  cargo_puesto: string | null
  semblanza: string | null
  imagen: string | null // URL pública de la foto
  redes: string | null
  participacion_congreso: string | null
  area_experiencia: string[]
}

const BUCKET = 'participantes'
const COLS =
  'id,nombre_completo,contacto_email,telefono,lugar_residencia,sector_perteneciente,institucion,cargo_puesto,semblanza,imagen,redes,participacion_congreso,area_experiencia'

// '' => null: los enums de Postgres no aceptan cadenas vacías.
const limpiar = (p: Record<string, unknown>) =>
  Object.fromEntries(Object.entries(p).map(([k, v]) => [k, v === '' ? null : v]))

export async function listParticipantes(): Promise<Participante[]> {
  return ok(await supabase.from('participantes').select(COLS).order('nombre_completo')) as Participante[]
}

export async function guardarParticipante(p: Participante): Promise<Participante> {
  const { id, ...resto } = p
  const fila = limpiar(resto)
  const q = id
    ? supabase.from('participantes').update(fila).eq('id', id)
    : supabase.from('participantes').insert(fila)
  return ok(await q.select(COLS).single()) as Participante
}

// Quita también de cronograma (CASCADE) y deja stands.participante_id en NULL.
export async function borrarParticipante(id: number, imagen: string | null) {
  ok(await supabase.from('participantes').delete().eq('id', id))
  if (imagen) await borrarFoto(imagen).catch(() => {})
}

export async function importarParticipantes(filas: Record<string, unknown>[]) {
  ok(await supabase.from('participantes').insert(filas.map(limpiar)))
}

/* ───────────── Fotos ───────────── */

// Sube la foto al bucket y devuelve su URL pública (es lo que se guarda en participantes.imagen).
export async function subirFoto(file: File): Promise<string> {
  const blob = await reducirImagen(file)
  const ext = blob.type === 'image/webp' ? 'webp' : 'png'
  const ruta = `${crypto.randomUUID()}.${ext}`
  const { error } = await supabase.storage
    .from(BUCKET)
    .upload(ruta, blob, { contentType: blob.type, cacheControl: '31536000' }) // nombre único => caché larga
  if (error) throw new Error(error.message)
  return supabase.storage.from(BUCKET).getPublicUrl(ruta).data.publicUrl
}

// Solo borra archivos de nuestro bucket; una URL externa (Firebase, etc.) se ignora.
export async function borrarFoto(url: string) {
  const marca = `/object/public/${BUCKET}/`
  const i = url.indexOf(marca)
  if (i < 0) return
  const { error } = await supabase.storage.from(BUCKET).remove([decodeURIComponent(url.slice(i + marca.length))])
  if (error) throw new Error(error.message)
}
