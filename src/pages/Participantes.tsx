import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Papa from 'papaparse'
import './extra.css'
import {
  type Participante,
  borrarFoto,
  borrarParticipante,
  guardarOrdenPublico,
  guardarParticipante,
  importarParticipantes,
  listParticipantes,
  subirFoto,
} from '../lib/participantes-api'
import { AREAS, PARTICIPACIONES, SECTORES } from '../lib/catalogos'

const NUEVO: Participante = {
  nombre_completo: '',
  contacto_email: null,
  telefono: null,
  lugar_residencia: null,
  sector_perteneciente: null,
  institucion: null,
  cargo_puesto: null,
  semblanza: null,
  imagen: null,
  redes: null,
  participacion_congreso: null,
  area_experiencia: [],
  orden_publico: null,
}

const msg = (e: unknown) => (e instanceof Error ? e.message : String(e))
const idDe = (p: Participante) => p.id as number

function Foto({ url, grande, alt = '' }: { url: string | null; grande?: boolean; alt?: string }) {
  const clase = grande ? 'ex-foto-grande' : 'ex-foto'
  return url ? <img className={clase} src={url} alt={alt} loading="lazy" draggable={false} /> : <div className={clase} />
}

type Origen = 'pool' | 'top'

export default function Participantes() {
  const [lista, setLista] = useState<Participante[]>([])
  const [base, setBase] = useState<number[]>([]) // orden guardado en el servidor
  const [publicos, setPublicos] = useState<number[]>([]) // orden en pantalla (ids)
  const [busca, setBusca] = useState('')
  const [hueco, setHueco] = useState<number | null>(null) // dónde se insertaría al soltar
  const [guardandoOrden, setGuardandoOrden] = useState(false)
  const arrastre = useRef<{ de: Origen; id: number } | null>(null)

  const [ed, setEd] = useState<Participante | null>(null) // participante en edición
  const [areasTxt, setAreasTxt] = useState('') // áreas como texto libre (si AREAS está vacío)
  const [original, setOriginal] = useState<string | null>(null) // foto que tenía al abrir
  const [subida, setSubida] = useState<string | null>(null) // foto subida en esta edición, sin guardar
  const [subiendo, setSubiendo] = useState(false)
  const [estado, setEstado] = useState('')

  const cargar = useCallback(async (reiniciarOrden = true) => {
    try {
      const l = await listParticipantes()
      const servidor = l
        .filter((p) => p.orden_publico != null)
        .sort((a, b) => (a.orden_publico as number) - (b.orden_publico as number))
        .map(idDe)
      setLista(l)
      setBase(servidor)
      // Si solo se editó un participante, se conserva el orden que el usuario aún no ha guardado.
      setPublicos((prev) => (reiniciarOrden ? servidor : prev.filter((id) => l.some((p) => p.id === id))))
    } catch (e) {
      setEstado(msg(e))
    }
  }, [])

  useEffect(() => {
    void cargar()
  }, [cargar])

  const porId = useMemo(() => new Map(lista.map((p) => [idDe(p), p])), [lista])
  const enPublico = useMemo(() => new Set(publicos), [publicos])
  const sucio = publicos.join() !== base.join()

  const visibles = useMemo(() => {
    const q = busca.trim().toLowerCase()
    if (!q) return lista
    return lista.filter((p) =>
      [p.nombre_completo, p.institucion, p.cargo_puesto, p.contacto_email].some((v) => v?.toLowerCase().includes(q)),
    )
  }, [lista, busca])

  useEffect(() => {
    if (!sucio) return
    const avisar = (e: BeforeUnloadEvent) => e.preventDefault()
    window.addEventListener('beforeunload', avisar)
    return () => window.removeEventListener('beforeunload', avisar)
  }, [sucio])

  /* ───────────── Página pública: agregar, quitar, mover, arrastrar ───────────── */

  const agregar = (id: number) => setPublicos((p) => (p.includes(id) ? p : [...p, id]))
  const quitar = (id: number) => setPublicos((p) => p.filter((x) => x !== id))
  const mover = (i: number, d: -1 | 1) =>
    setPublicos((p) => {
      const j = i + d
      if (j < 0 || j >= p.length) return p
      const n = [...p]
      const t = n[i]
      n[i] = n[j]
      n[j] = t
      return n
    })

  function empezar(e: React.DragEvent, de: Origen, id: number) {
    arrastre.current = { de, id }
    e.dataTransfer.effectAllowed = de === 'pool' ? 'copy' : 'move'
    e.dataTransfer.setData('text/plain', String(id)) // Firefox lo exige para iniciar el arrastre
  }
  function terminar() {
    arrastre.current = null
    setHueco(null)
  }

  function sobreLista(e: React.DragEvent<HTMLDivElement>) {
    const a = arrastre.current
    if (!a) return
    e.preventDefault()
    e.dataTransfer.dropEffect = a.de === 'pool' ? 'copy' : 'move'
    const item = (e.target as Element).closest<HTMLElement>('[data-idx]')
    if (!item) {
      setHueco(publicos.length)
      return
    }
    const i = Number(item.dataset.idx)
    const r = item.getBoundingClientRect()
    setHueco(e.clientX > r.left + r.width / 2 ? i + 1 : i)
  }

  function salirLista(e: React.DragEvent<HTMLDivElement>) {
    if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setHueco(null)
  }

  function soltarEnLista(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault()
    const a = arrastre.current
    const pos = hueco ?? publicos.length
    terminar()
    if (!a) return
    setPublicos((prev) => {
      if (a.de === 'pool') return prev.includes(a.id) ? prev : [...prev.slice(0, pos), a.id, ...prev.slice(pos)]
      const desde = prev.indexOf(a.id)
      if (desde < 0) return prev
      const sin = prev.filter((x) => x !== a.id)
      const destino = pos > desde ? pos - 1 : pos
      return [...sin.slice(0, destino), a.id, ...sin.slice(destino)]
    })
  }

  // Soltar una tarjeta de la página pública sobre la lista de abajo = quitarla de la página.
  function soltarEnPool(e: React.DragEvent) {
    const a = arrastre.current
    if (a?.de !== 'top') return
    e.preventDefault()
    terminar()
    quitar(a.id)
  }

  async function guardarOrden() {
    setGuardandoOrden(true)
    setEstado('Guardando…')
    try {
      await guardarOrdenPublico(publicos)
      await cargar()
      setEstado('Página pública actualizada')
    } catch (e) {
      setEstado(msg(e)) // se conserva el orden en pantalla
    } finally {
      setGuardandoOrden(false)
    }
  }

  /* ───────────── Edición de un participante ───────────── */

  // Si había una foto subida que no se guardó, se borra para no dejar archivos huérfanos.
  function soltarSubida() {
    if (subida) borrarFoto(subida).catch(() => {})
    setSubida(null)
  }

  function abrir(p: Participante) {
    soltarSubida()
    setEd({ ...p })
    setAreasTxt(p.area_experiencia.join(', '))
    setOriginal(p.imagen)
    setEstado('')
  }

  function cerrar() {
    soltarSubida()
    setEd(null)
  }

  async function cambiarFoto(file: File) {
    setSubiendo(true)
    setEstado('')
    try {
      const url = await subirFoto(file)
      if (subida) await borrarFoto(subida).catch(() => {})
      setSubida(url)
      setEd((e) => e && { ...e, imagen: url })
    } catch (e) {
      setEstado(msg(e))
    } finally {
      setSubiendo(false)
    }
  }

  async function guardar() {
    if (!ed) return
    if (!ed.nombre_completo.trim()) {
      setEstado('El nombre es obligatorio')
      return
    }
    const areas = AREAS.length ? ed.area_experiencia : areasTxt.split(',').map((s) => s.trim()).filter(Boolean)
    try {
      const g = await guardarParticipante({ ...ed, nombre_completo: ed.nombre_completo.trim(), area_experiencia: areas })
      if (original && original !== g.imagen) await borrarFoto(original).catch(() => {})
      if (subida && subida !== g.imagen) await borrarFoto(subida).catch(() => {})
      setSubida(null)
      setOriginal(g.imagen)
      setEd(g)
      setAreasTxt(g.area_experiencia.join(', '))
      setEstado('Participante guardado')
      await cargar(false)
    } catch (e) {
      setEstado(msg(e))
    }
  }

  async function eliminar() {
    if (!ed?.id) return
    if (!confirm(`¿Eliminar a ${ed.nombre_completo}? También se quitará de charlas y stands.`)) return
    try {
      await borrarParticipante(ed.id, original)
      soltarSubida()
      setEd(null)
      setEstado('Participante eliminado')
      await cargar(false)
    } catch (e) {
      setEstado(msg(e))
    }
  }

  // CSV con las mismas columnas que la tabla; area_experiencia separada por ";"
  function importar(file: File) {
    Papa.parse<Record<string, string>>(file, {
      header: true,
      skipEmptyLines: true,
      complete: async ({ data }) => {
        try {
          const filas = data.map((f) => ({
            ...f,
            area_experiencia: (f.area_experiencia ?? '').split(';').map((s) => s.trim()).filter(Boolean),
          }))
          await importarParticipantes(filas)
          setEstado(`${filas.length} participantes importados`)
          await cargar(false)
        } catch (e) {
          setEstado(`No se importó nada: ${msg(e)}`) // el insert es atómico
        }
      },
    })
  }

  const campo = (k: keyof Participante) => ({
    value: (ed?.[k] as string | null) ?? '',
    onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
      setEd((x) => x && { ...x, [k]: e.target.value }),
  })

  /* ───────────── Pantalla ───────────── */

  return (
    <div>
      <div className="ex-barra">
        <button onClick={() => abrir({ ...NUEVO })}>Nuevo participante</button>
        <label>
          <input
            type="file"
            accept=".csv,text/csv"
            hidden
            onChange={(e) => {
              const f = e.target.files?.[0]
              if (f) importar(f)
              e.target.value = ''
            }}
          />
          <span role="button" tabIndex={0} style={{ cursor: 'pointer', textDecoration: 'underline' }}>
            Importar CSV
          </span>
        </label>
      </div>
      <p className="ex-estado" role="status">
        {sucio && 'Cambios sin guardar en la página pública. '}
        {estado}
      </p>

      <div className={`ex-layout ${ed ? '' : 'solo'}`}>
        <div className="ex-col">
          {/* ── Arriba: lo que se muestra en la página pública ── */}
          <section className="ex-seccion">
            <div className="ex-seccion-cab">
              <h2>En la página pública ({publicos.length})</h2>
              <div className="ex-acciones">
                <button onClick={() => setPublicos(base)} disabled={!sucio || guardandoOrden}>
                  Descartar
                </button>
                <button onClick={() => void guardarOrden()} disabled={!sucio || guardandoOrden}>
                  Guardar orden
                </button>
              </div>
            </div>
            <p className="ex-suave">
              Arrastra aquí participantes de la lista de abajo. Arrastra las tarjetas para cambiar el orden; el primero es
              el que sale primero en el sitio. Para quitar a alguien, usa ✕ o suéltalo sobre la lista de abajo.
            </p>

            <div
              className={`ex-pub-lista ${publicos.length === 0 ? 'vacia' : ''}`}
              onDragOver={sobreLista}
              onDragLeave={salirLista}
              onDrop={soltarEnLista}
            >
              {publicos.length === 0 && <span className="ex-suave">Aún no hay nadie. Arrastra participantes aquí.</span>}
              {publicos.map((id, i) => {
                const p = porId.get(id)
                if (!p) return null
                const clases = [
                  'ex-pub-item',
                  hueco === i ? 'ins-antes' : '',
                  hueco === publicos.length && i === publicos.length - 1 ? 'ins-despues' : '',
                ].join(' ')
                return (
                  <div
                    key={id}
                    data-idx={i}
                    className={clases}
                    draggable
                    onDragStart={(e) => empezar(e, 'top', id)}
                    onDragEnd={terminar}
                    onClick={() => abrir(p)}
                  >
                    <span className="ex-pub-pos">{i + 1}</span>
                    <Foto url={p.imagen} />
                    <div className="ex-pub-texto">
                      <strong>{p.nombre_completo}</strong>
                      <small>{p.cargo_puesto ?? p.institucion ?? ''}</small>
                    </div>
                    <div className="ex-pub-acc">
                      <button
                        aria-label="Mover antes"
                        disabled={i === 0}
                        onClick={(e) => {
                          e.stopPropagation()
                          mover(i, -1)
                        }}
                      >
                        ←
                      </button>
                      <button
                        aria-label="Mover después"
                        disabled={i === publicos.length - 1}
                        onClick={(e) => {
                          e.stopPropagation()
                          mover(i, 1)
                        }}
                      >
                        →
                      </button>
                      <button
                        aria-label="Quitar de la página pública"
                        onClick={(e) => {
                          e.stopPropagation()
                          quitar(id)
                        }}
                      >
                        ✕
                      </button>
                    </div>
                  </div>
                )
              })}
            </div>
          </section>

          {/* ── Abajo: todos los participantes ── */}
          <section className="ex-seccion" onDragOver={(e) => arrastre.current?.de === 'top' && e.preventDefault()} onDrop={soltarEnPool}>
            <div className="ex-seccion-cab">
              <h2>Todos los participantes ({lista.length})</h2>
              <input
                type="search"
                placeholder="Buscar por nombre, cargo, institución o correo"
                value={busca}
                onChange={(e) => setBusca(e.target.value)}
              />
            </div>
            <ul className="ex-pool">
              {visibles.map((p) => {
                const id = idDe(p)
                const ya = enPublico.has(id)
                return (
                  <li
                    key={id}
                    className={`ex-pool-item ${ya ? 'ya' : ''} ${ed?.id === id ? 'sel' : ''}`}
                    draggable={!ya}
                    onDragStart={(e) => empezar(e, 'pool', id)}
                    onDragEnd={terminar}
                    onClick={() => abrir(p)}
                  >
                    <Foto url={p.imagen} />
                    <div className="ex-pub-texto">
                      <strong>{p.nombre_completo}</strong>
                      <small>{[p.cargo_puesto, p.institucion].filter(Boolean).join(' · ')}</small>
                    </div>
                    {ya ? (
                      <span className="ex-tag">En la página</span>
                    ) : (
                      <button
                        onClick={(e) => {
                          e.stopPropagation()
                          agregar(id)
                        }}
                      >
                        Agregar ↑
                      </button>
                    )}
                  </li>
                )
              })}
              {!visibles.length && (
                <li className="ex-suave">
                  {lista.length ? 'Sin resultados.' : 'Aún no hay participantes. Crea uno o importa un CSV.'}
                </li>
              )}
            </ul>
          </section>
        </div>

        {ed && (
          <div className="ex-panel">
            <div className="ex-foto-bloque">
              <Foto url={ed.imagen} grande alt="Foto del participante" />
              <div style={{ display: 'grid', gap: 6 }}>
                <input
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  disabled={subiendo}
                  onChange={(e) => {
                    const f = e.target.files?.[0]
                    if (f) void cambiarFoto(f)
                    e.target.value = ''
                  }}
                />
                {subiendo && <span>Subiendo…</span>}
                {ed.imagen && <button onClick={() => setEd({ ...ed, imagen: null })}>Quitar foto</button>}
              </div>
            </div>
            <label>
              URL de la foto (se llena sola al subir; también puedes pegar una externa)
              <input type="url" {...campo('imagen')} />
            </label>

            <label>Nombre completo *<input {...campo('nombre_completo')} /></label>
            <label>Correo<input type="email" {...campo('contacto_email')} /></label>
            <label>Teléfono (formato +528341234567)<input type="tel" {...campo('telefono')} /></label>
            <label>Lugar de residencia<input {...campo('lugar_residencia')} /></label>
            <label>
              Sector
              <select {...campo('sector_perteneciente')}>
                <option value="">—</option>
                {SECTORES.map((s) => <option key={s}>{s}</option>)}
              </select>
            </label>
            <label>Institución<input {...campo('institucion')} /></label>
            <label>Cargo o puesto<input {...campo('cargo_puesto')} /></label>
            <label>
              Participación en el congreso
              <select {...campo('participacion_congreso')}>
                <option value="">—</option>
                {PARTICIPACIONES.map((s) => <option key={s}>{s}</option>)}
              </select>
            </label>

            {AREAS.length ? (
              <fieldset>
                <legend>Áreas de experiencia</legend>
                <div className="ex-checks">
                  {AREAS.map((a) => (
                    <label key={a}>
                      <input
                        type="checkbox"
                        checked={ed.area_experiencia.includes(a)}
                        onChange={(e) =>
                          setEd({
                            ...ed,
                            area_experiencia: e.target.checked
                              ? [...ed.area_experiencia, a]
                              : ed.area_experiencia.filter((x) => x !== a),
                          })
                        }
                      />
                      {a}
                    </label>
                  ))}
                </div>
              </fieldset>
            ) : (
              <label>
                Áreas de experiencia (separadas por coma)
                <input value={areasTxt} onChange={(e) => setAreasTxt(e.target.value)} />
              </label>
            )}

            <label>Redes<input {...campo('redes')} /></label>
            <label>Semblanza<textarea rows={5} {...campo('semblanza')} /></label>

            <div className="ex-acciones">
              <button onClick={() => void guardar()} disabled={subiendo}>Guardar</button>
              <button onClick={cerrar}>Cerrar</button>
              {ed.id && <button onClick={() => void eliminar()}>Eliminar</button>}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
