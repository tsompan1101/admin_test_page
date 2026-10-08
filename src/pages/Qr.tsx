import { useEffect, useMemo, useState } from 'react'
import JSZip from 'jszip'
import './extra.css'
import { type Participante, listParticipantes } from '../lib/participantes-api'
import { mensajeDe } from '../lib/admin-api'
import {
  LOGO_MAX,
  LOGO_PREDETERMINADO,
  aDataUri,
  crearQrSvg,
  descargar,
  slug,
  svgAPng,
  validarLogoSvg,
} from '../lib/qr'

const RUTA_PONENTE = '/ponentes' // el sitio público abre la ficha en /ponentes/<id>
const idDe = (p: Participante) => p.id as number

// localStorage puede no estar disponible (modo privado): nunca debe romper la página.
const leer = (k: string) => {
  try {
    return localStorage.getItem(k)
  } catch {
    return null
  }
}
const guardar = (k: string, v: string) => {
  try {
    localStorage.setItem(k, v)
  } catch {
    /* sin almacenamiento: se usa solo en esta sesión */
  }
}

type Formato = 'svg' | 'png'
type Filtro = 'todos' | 'sin-pagina' | 'en-pagina'

export default function Qr() {
  const [lista, setLista] = useState<Participante[]>([])
  const [busca, setBusca] = useState('')
  const [filtro, setFiltro] = useState<Filtro>('todos')
  const [sel, setSel] = useState<Set<number>>(new Set())

  const [base, setBase] = useState(() => leer('qr_base') ?? import.meta.env.VITE_SITIO_URL ?? '')
  const [logo, setLogo] = useState(() => leer('qr_logo') ?? LOGO_PREDETERMINADO)
  const [conLogo, setConLogo] = useState(() => leer('qr_con_logo') !== '0')
  const [pct, setPct] = useState(() => Number(leer('qr_logo_pct')) || 20)
  const [formato, setFormato] = useState<Formato>('svg')

  const [estado, setEstado] = useState('Cargando…')
  const [trabajando, setTrabajando] = useState(false)

  useEffect(() => {
    listParticipantes()
      .then((l) => {
        setLista(l)
        setEstado('')
      })
      .catch((e) => setEstado(mensajeDe(e)))
  }, [])

  useEffect(() => guardar('qr_base', base), [base])
  useEffect(() => guardar('qr_logo', logo), [logo])
  useEffect(() => guardar('qr_con_logo', conLogo ? '1' : '0'), [conLogo])
  useEffect(() => guardar('qr_logo_pct', String(pct)), [pct])

  const baseLimpia = base.trim().replace(/\/+$/, '')
  const baseValida = /^https?:\/\/[^\s/]+/i.test(baseLimpia)

  const visibles = useMemo(() => {
    const q = busca.trim().toLowerCase()
    return lista.filter((p) => {
      if (filtro === 'sin-pagina' && p.orden_publico != null) return false
      if (filtro === 'en-pagina' && p.orden_publico == null) return false
      if (!q) return true
      return [p.nombre_completo, p.institucion, p.cargo_puesto].some((v) => v?.toLowerCase().includes(q))
    })
  }, [lista, busca, filtro])

  const todosVisibles = visibles.length > 0 && visibles.every((p) => sel.has(idDe(p)))
  const alternar = (id: number) =>
    setSel((s) => {
      const n = new Set(s)
      if (n.has(id)) n.delete(id)
      else n.add(id)
      return n
    })
  const alternarVisibles = () =>
    setSel((s) => {
      const n = new Set(s)
      for (const p of visibles) {
        if (todosVisibles) n.delete(idDe(p))
        else n.add(idDe(p))
      }
      return n
    })

  // Un QR por persona elegida: enlace + SVG
  const items = useMemo(() => {
    if (!baseValida) return []
    return lista
      .filter((p) => sel.has(idDe(p)))
      .map((p) => {
        const url = `${baseLimpia}${RUTA_PONENTE}/${idDe(p)}`
        return { p, url, svg: crearQrSvg(url, { logo: conLogo ? logo : null, logoPct: pct / 100 }) }
      })
  }, [lista, sel, baseLimpia, baseValida, conLogo, logo, pct])

  function cambiarLogo(file: File) {
    if (file.size > 300_000) {
      setEstado('El logo pesa demasiado (máximo 300 KB). Usa un SVG simple.')
      return
    }
    file
      .text()
      .then((t) => {
        setLogo(validarLogoSvg(t))
        setConLogo(true)
        setEstado('Logo actualizado')
      })
      .catch((e) => setEstado(mensajeDe(e)))
  }

  async function descargarUno(it: (typeof items)[number], f: Formato) {
    const nombre = `qr-${slug(it.p.nombre_completo)}-${idDe(it.p)}.${f}`
    try {
      descargar(f === 'svg' ? new Blob([it.svg], { type: 'image/svg+xml' }) : await svgAPng(it.svg, 1024), nombre)
    } catch (e) {
      setEstado(mensajeDe(e))
    }
  }

  async function descargarTodos() {
    setTrabajando(true)
    setEstado('Preparando archivos…')
    try {
      const zip = new JSZip()
      for (const it of items) {
        const nombre = `qr-${slug(it.p.nombre_completo)}-${idDe(it.p)}.${formato}`
        zip.file(nombre, formato === 'svg' ? it.svg : await svgAPng(it.svg, 1024))
      }
      descargar(await zip.generateAsync({ type: 'blob' }), 'qr-participantes.zip')
      setEstado(`${items.length} códigos descargados`)
    } catch (e) {
      setEstado(mensajeDe(e))
    } finally {
      setTrabajando(false)
    }
  }

  async function copiar(url: string) {
    try {
      await navigator.clipboard.writeText(url)
      setEstado('Enlace copiado')
    } catch {
      setEstado('No se pudo copiar; selecciónalo y cópialo a mano')
    }
  }

  return (
    <div className="qr-pagina">
      <section className="ex-seccion qr-no-print">
        <div className="ex-seccion-cab">
          <h2>Configuración</h2>
        </div>
        <div className="qr-config">
          <label className="qr-campo qr-campo-ancho">
            Dirección del sitio público
            <input
              type="url"
              placeholder="https://tu-sitio.mx"
              value={base}
              onChange={(e) => setBase(e.target.value)}
            />
            <small className="ex-suave">
              {baseValida
                ? `Ejemplo de enlace: ${baseLimpia}${RUTA_PONENTE}/12`
                : 'Escribe la dirección completa, con https://, para generar los códigos.'}
            </small>
          </label>

          <div className="qr-logo">
            <span>Logo en el centro</span>
            <div className="qr-logo-fila">
              <img className="qr-logo-vista" src={aDataUri(logo)} alt="Logo actual" />
              <div className="qr-logo-acciones">
                <label className="qr-check">
                  <input type="checkbox" checked={conLogo} onChange={(e) => setConLogo(e.target.checked)} />
                  Mostrar logo
                </label>
                <label className="qr-archivo">
                  <input
                    type="file"
                    accept=".svg,image/svg+xml"
                    hidden
                    onChange={(e) => {
                      const f = e.target.files?.[0]
                      if (f) cambiarLogo(f)
                      e.target.value = ''
                    }}
                  />
                  <span role="button" tabIndex={0}>Cambiar logo (SVG)</span>
                </label>
                <button onClick={() => setLogo(LOGO_PREDETERMINADO)}>Usar el de ejemplo</button>
              </div>
            </div>
          </div>

          <label className="qr-campo">
            Tamaño del logo: {pct} %
            <input
              type="range"
              min={10}
              max={Math.round(LOGO_MAX * 100)}
              value={Math.min(pct, Math.round(LOGO_MAX * 100))}
              disabled={!conLogo}
              onChange={(e) => setPct(Number(e.target.value))}
            />
            <small className="ex-suave">
              El máximo ({Math.round(LOGO_MAX * 100)} %) deja el código legible. Si agrandas el logo, prueba siempre con tu celular.
            </small>
          </label>
        </div>
      </section>

      <p className="ex-estado qr-no-print" role="status">{estado}</p>

      <div className="qr-layout">
        <section className="ex-seccion qr-no-print qr-lista">
          <div className="ex-seccion-cab">
            <h2>Participantes ({lista.length})</h2>
            <span className="ex-suave">{sel.size} elegidos</span>
          </div>
          <div className="qr-filtros">
            <input
              type="search"
              placeholder="Buscar por nombre, cargo o institución"
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
            />
            <select value={filtro} onChange={(e) => setFiltro(e.target.value as Filtro)} aria-label="Filtrar">
              <option value="todos">Todos</option>
              <option value="sin-pagina">Los que no salen en la página</option>
              <option value="en-pagina">Los que sí salen en la página</option>
            </select>
          </div>
          <div className="ex-acciones">
            <button onClick={alternarVisibles} disabled={visibles.length === 0}>
              {todosVisibles ? 'Quitar los visibles' : `Elegir los ${visibles.length} visibles`}
            </button>
            <button onClick={() => setSel(new Set())} disabled={sel.size === 0}>
              Limpiar selección
            </button>
          </div>
          <ul className="ex-pool">
            {visibles.map((p) => (
              <li key={idDe(p)} className="ex-pool-item" onClick={() => alternar(idDe(p))}>
                <input
                  type="checkbox"
                  checked={sel.has(idDe(p))}
                  onChange={() => alternar(idDe(p))}
                  onClick={(e) => e.stopPropagation()}
                  aria-label={`Elegir a ${p.nombre_completo}`}
                />
                {p.imagen ? <img className="ex-foto" src={p.imagen} alt="" loading="lazy" /> : <div className="ex-foto" />}
                <div className="ex-pub-texto">
                  <strong>{p.nombre_completo}</strong>
                  <small>{[p.cargo_puesto, p.institucion].filter(Boolean).join(' · ')}</small>
                </div>
                {p.orden_publico != null && <span className="ex-tag">En la página</span>}
              </li>
            ))}
            {!visibles.length && <li className="ex-suave">{lista.length ? 'Sin resultados.' : 'Aún no hay participantes.'}</li>}
          </ul>
        </section>

        <section className="ex-seccion qr-resultados">
          <div className="ex-seccion-cab qr-no-print">
            <h2>Códigos QR ({items.length})</h2>
            <div className="ex-acciones">
              <select value={formato} onChange={(e) => setFormato(e.target.value as Formato)} aria-label="Formato de descarga">
                <option value="svg">SVG (vectorial, para imprenta)</option>
                <option value="png">PNG (1024 px)</option>
              </select>
              <button onClick={() => void descargarTodos()} disabled={!items.length || trabajando}>
                Descargar todos (ZIP)
              </button>
              <button onClick={() => window.print()} disabled={!items.length}>
                Imprimir
              </button>
            </div>
          </div>

          {!items.length && (
            <p className="ex-suave qr-no-print">
              {baseValida
                ? 'Elige participantes en la lista de la izquierda para generar sus códigos.'
                : 'Primero escribe la dirección del sitio público.'}
            </p>
          )}

          <div className="qr-grid">
            {items.map((it) => (
              <figure key={idDe(it.p)} className="qr-card">
                <img src={aDataUri(it.svg)} alt={`Código QR de ${it.p.nombre_completo}`} />
                <figcaption>
                  <strong>{it.p.nombre_completo}</strong>
                  <small>{it.url}</small>
                </figcaption>
                <div className="qr-card-acc qr-no-print">
                  <button onClick={() => void descargarUno(it, 'svg')}>SVG</button>
                  <button onClick={() => void descargarUno(it, 'png')}>PNG</button>
                  <button onClick={() => void copiar(it.url)}>Copiar enlace</button>
                </div>
              </figure>
            ))}
          </div>
        </section>
      </div>
    </div>
  )
}
