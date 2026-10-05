import { useCallback, useEffect, useMemo, useState } from 'react'
import Papa from 'papaparse'
import './extra.css'
import {
  type Participante,
  borrarFoto,
  borrarParticipante,
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
}

const msg = (e: unknown) => (e instanceof Error ? e.message : String(e))

export default function Participantes() {
  const [lista, setLista] = useState<Participante[]>([])
  const [busca, setBusca] = useState('')
  const [ed, setEd] = useState<Participante | null>(null) // participante en edición
  const [areasTxt, setAreasTxt] = useState('') // campo libre de áreas (si AREAS está vacío)
  const [original, setOriginal] = useState<string | null>(null) // foto que tenía al abrir
  const [subida, setSubida] = useState<string | null>(null) // foto subida en esta edición, aún sin guardar
  const [subiendo, setSubiendo] = useState(false)
  const [estado, setEstado] = useState('')

  const cargar = useCallback(async () => {
    try {
      setLista(await listParticipantes())
    } catch (e) {
      setEstado(msg(e))
    }
  }, [])
  useEffect(() => {
    cargar()
  }, [cargar])

  const visibles = useMemo(() => {
    const q = busca.trim().toLowerCase()
    if (!q) return lista
    return lista.filter((p) => [p.nombre_completo, p.institucion, p.contacto_email].some((v) => v?.toLowerCase().includes(q)))
  }, [lista, busca])

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
    if (!ed.nombre_completo.trim()) return setEstado('El nombre es obligatorio')
    const areas = AREAS.length
      ? ed.area_experiencia
      : areasTxt.split(',').map((s) => s.trim()).filter(Boolean)
    try {
      const g = await guardarParticipante({ ...ed, nombre_completo: ed.nombre_completo.trim(), area_experiencia: areas })
      // Limpieza de fotos que ya no se usan
      if (original && original !== g.imagen) await borrarFoto(original).catch(() => {})
      if (subida && subida !== g.imagen) await borrarFoto(subida).catch(() => {})
      setSubida(null)
      setOriginal(g.imagen)
      setEd(g)
      setAreasTxt(g.area_experiencia.join(', '))
      setEstado('Participante guardado')
      await cargar()
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
      await cargar()
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
          await cargar()
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

  return (
    <div>
      <div className="ex-barra">
        <input type="search" placeholder="Buscar por nombre, institución o correo" value={busca} onChange={(e) => setBusca(e.target.value)} />
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
      <p className="ex-estado" role="status">{estado}</p>

      <div className="ex-layout">
        <table className="ex-tabla">
          <thead>
            <tr><th></th><th>Nombre</th><th>Institución</th><th>Participación</th></tr>
          </thead>
          <tbody>
            {visibles.map((p) => (
              <tr key={p.id} data-sel={ed?.id === p.id} onClick={() => abrir(p)}>
                <td>{p.imagen ? <img className="ex-foto" src={p.imagen} alt="" loading="lazy" /> : <div className="ex-foto" />}</td>
                <td>{p.nombre_completo}</td>
                <td>{p.institucion}</td>
                <td>{p.participacion_congreso}</td>
              </tr>
            ))}
            {!visibles.length && (
              <tr><td colSpan={4}>{lista.length ? 'Sin resultados.' : 'Aún no hay participantes. Crea uno o importa un CSV.'}</td></tr>
            )}
          </tbody>
        </table>

        {ed && (
          <div className="ex-panel">
            <div className="ex-foto-bloque">
              {ed.imagen ? <img className="ex-foto-grande" src={ed.imagen} alt="Foto del participante" /> : <div className="ex-foto-grande" />}
              <div style={{ display: 'grid', gap: 6 }}>
                <input
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  disabled={subiendo}
                  onChange={(e) => {
                    const f = e.target.files?.[0]
                    if (f) cambiarFoto(f)
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
              <button onClick={guardar} disabled={subiendo}>Guardar</button>
              <button onClick={cerrar}>Cerrar</button>
              {ed.id && <button onClick={eliminar}>Eliminar</button>}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
