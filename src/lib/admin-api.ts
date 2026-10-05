import { FunctionsHttpError } from '@supabase/supabase-js'
import { supabase } from './supabase'

// Las páginas importan estas listas desde aquí.
export { SALONES, TIPOS } from './catalogos'

/* ───────────── Tipos ───────────── */

export type Zona = {
  id: number // negativo = zona nueva sin guardar
  nombre: string
  x: number
  y: number
  w: number
  h: number
  stand_id: number | null
}
export type Stand = {
  id: number
  numero_stand: string
  nombre_stand: string | null
  zona_id: number | null
  participante_id: number | null
}
export type Charla = {
  id: number
  titulo: string
  salon?: string | null
  inicio: string // 'AAAA-MM-DDTHH:mm:00' hora local del evento, sin zona
  fin: string
  tipo?: string | null
  ponentes?: string[]
}
export type Contacto = { id: number; nombre: string; email?: string | null; telefono?: string | null }
export type Fallido = { to: string; error: string }
export type ResultadoEnvio = { total: number; enviados: number; fallidos: Fallido[] }

/* ───────────── Utilidades ───────────── */

// Supabase devuelve { data, error } en vez de lanzar. Aquí se vuelve a lanzar
// un Error con código y texto, como hacía el cliente HTTP anterior.
export function ok<T>(res: { data: T | null; error: { code?: string; message: string } | null }): T {
  if (res.error) throw new Error(`${res.error.code ?? ''} ${res.error.message}`.trim())
  return res.data as T
}

// Texto de un error para la línea de estado de cada página.
export const mensajeDe = (e: unknown): string => (e instanceof Error ? e.message : String(e))

// charlas.fecha_* es timestamptz: la API lo entrega en UTC. El dashboard trabaja
// con hora local como texto, así que se convierte con el offset fijo del evento.
const OFFSET = import.meta.env.VITE_TZ_OFFSET ?? '-06:00'
const offMin = (() => {
  const m = /^([+-])(\d\d):(\d\d)$/.exec(OFFSET)!
  return (m[1] === '-' ? -1 : 1) * (Number(m[2]) * 60 + Number(m[3]))
})()

const aLocal = (iso: string) => new Date(new Date(iso).getTime() + offMin * 60000).toISOString().slice(0, 19)
const aIso = (local: string) => `${local.length === 16 ? local + ':00' : local.slice(0, 19)}${OFFSET}`

/* ───────────── Sesión ───────────── */

export async function login(email: string, password: string) {
  const { error } = await supabase.auth.signInWithPassword({ email, password })
  if (error) throw new Error(error.message)
}
export const logout = () => supabase.auth.signOut()

/* ───────────── Zonas (tabla zonas; geometría en data JSONB; stand en stands.zona_id) ───────────── */

type ZonaRow = {
  id: number
  data: Partial<Pick<Zona, 'nombre' | 'x' | 'y' | 'w' | 'h'>> | null
  stands: { id: number }[] | null
}
let conocidas = new Set<number>() // ids que ya existen en la BD

export async function getZonas(): Promise<Zona[]> {
  const rows = ok(await supabase.from('zonas').select('id,data,stands(id)').order('id')) as unknown as ZonaRow[]
  conocidas = new Set(rows.map((r) => r.id))
  return rows.map((r) => ({
    id: r.id,
    nombre: r.data?.nombre ?? '',
    x: r.data?.x ?? 0,
    y: r.data?.y ?? 0,
    w: r.data?.w ?? 10,
    h: r.data?.h ?? 10,
    stand_id: r.stands?.[0]?.id ?? null,
  }))
}

// Reemplaza el conjunto completo en una sola transacción (función SQL replace_zonas),
// incluida la asociación zona <-> stand. Los ids temporales (negativos) no se envían:
// la BD asigna el definitivo, por eso al final se vuelve a leer todo.
export async function putZonas(zonas: Zona[]): Promise<Zona[]> {
  const p = zonas.map((z) => ({
    id: conocidas.has(z.id) ? z.id : null,
    stand_id: z.stand_id,
    data: { nombre: z.nombre, x: z.x, y: z.y, w: z.w, h: z.h },
  }))
  ok(await supabase.rpc('replace_zonas', { p }))
  return getZonas()
}

export async function getStands(): Promise<Stand[]> {
  return ok(
    await supabase
      .from('stands')
      .select('id,numero_stand,nombre_stand,zona_id,participante_id')
      .order('numero_stand'),
  ) as Stand[]
}

/* ───────────── Cronograma ───────────── */

type CharlaRow = {
  id: number
  tipo: string | null
  titulo: string
  fecha_inicio: string
  fecha_fin: string
  salon: string | null
  cronograma: { rol: string; participantes: { nombre_completo: string } | null }[]
}

// Se lee de la tabla charlas (no de la vista programa_cronograma) para tener el id.
export async function getPrograma(): Promise<Charla[]> {
  const rows = ok(
    await supabase
      .from('charlas')
      .select('id,tipo,titulo,fecha_inicio,fecha_fin,salon,cronograma(rol,participantes(nombre_completo))')
      .order('fecha_inicio'),
  ) as unknown as CharlaRow[]

  return rows.map((r) => ({
    id: r.id,
    titulo: r.titulo,
    salon: r.salon,
    tipo: r.tipo,
    inicio: aLocal(r.fecha_inicio),
    fin: aLocal(r.fecha_fin),
    ponentes: r.cronograma
      .filter((c) => c.rol === 'ponente')
      .map((c) => c.participantes?.nombre_completo)
      .filter((n): n is string => !!n),
  }))
}

// '' => null (limpia el campo); undefined => no se toca.
const vacioANull = (v: string | null | undefined) => (v === undefined ? undefined : v || null)

// Los ponentes viven en la tabla cronograma y el dashboard no los escribe (solo lectura).
const aFila = (c: Partial<Charla>) => ({
  titulo: c.titulo,
  salon: vacioANull(c.salon),
  tipo: vacioANull(c.tipo),
  fecha_inicio: c.inicio === undefined ? undefined : aIso(c.inicio),
  fecha_fin: c.fin === undefined ? undefined : aIso(c.fin),
})

export async function crearCharla(c: Partial<Charla>) {
  ok(await supabase.from('charlas').insert(aFila(c)))
}
export async function actualizarCharla(id: number, c: Partial<Charla>) {
  ok(await supabase.from('charlas').update(aFila(c)).eq('id', id).select('id').single())
}
export async function eliminarCharla(id: number) {
  ok(await supabase.from('charlas').delete().eq('id', id))
}

/* ───────────── Contactos para mensajes ───────────── */

// Vista contactos_mensajes: quien solo tiene el permiso "mensajes" no ve el resto de columnas.
export async function getParticipantes(): Promise<Contacto[]> {
  return ok(await supabase.from('contactos_mensajes').select('id,nombre,email,telefono').order('id')) as Contacto[]
}

/* ───────────── Edge Functions ───────────── */

export async function invocar<T>(funcion: string, body: object): Promise<T> {
  const { data, error } = await supabase.functions.invoke(funcion, { body })
  if (error) {
    if (error instanceof FunctionsHttpError) {
      throw new Error(`${error.context.status} ${await error.context.text()}`)
    }
    throw error
  }
  return data as T
}

// La respuesta siempre trae `fallidos`.
export const enviarEmail = (to: string[], subject: string, body: string) =>
  invocar<ResultadoEnvio>('enviar-mensaje', { canal: 'email', to, subject, body })
export const enviarSms = (to: string[], body: string) =>
  invocar<ResultadoEnvio>('enviar-mensaje', { canal: 'sms', to, body })
