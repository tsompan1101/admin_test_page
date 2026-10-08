import { useEffect, useMemo, useRef, useState } from 'react'
import type { Persona } from '../lib/admin-api'

// Sin acentos y en minúsculas, para que "maria" encuentre "María"
const norm = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()

type Props = {
  titulo: string
  personas: Persona[] // todas las que se pueden asignar
  valor: number[] // ids elegidos
  onChange: (ids: number[]) => void
  excluir?: number[] // ids que no se ofrecen (por ejemplo, los ya elegidos en el otro rol)
}

export default function SelectorPersonas({ titulo, personas, valor, onChange, excluir = [] }: Props) {
  const [q, setQ] = useState('')
  const [abierto, setAbierto] = useState(false)
  const [act, setAct] = useState(0) // opción resaltada con el teclado
  const raiz = useRef<HTMLDivElement>(null)

  // La lista se cierra con un clic FUERA, no al perder el foco. Si se cerrara en el blur, al pulsar un
  // botón de otro selector la lista desaparecería entre pulsar y soltar, el contenido se movería y el clic se perdería.
  useEffect(() => {
    if (!abierto) return
    const fuera = (e: MouseEvent) => {
      if (!raiz.current?.contains(e.target as Node)) setAbierto(false)
    }
    document.addEventListener('click', fuera)
    return () => document.removeEventListener('click', fuera)
  }, [abierto])

  const porId = useMemo(() => new Map(personas.map((p) => [p.id, p])), [personas])

  const resultados = useMemo(() => {
    const nq = norm(q.trim())
    return personas
      .filter((p) => !valor.includes(p.id) && !excluir.includes(p.id))
      .filter((p) => !nq || norm(`${p.nombre} ${p.detalle ?? ''}`).includes(nq))
      .slice(0, 8)
  }, [personas, valor, excluir, q])

  const agregar = (id: number) => {
    onChange([...valor, id])
    setQ('')
    setAct(0)
    setAbierto(false)
  }
  const quitar = (id: number) => onChange(valor.filter((x) => x !== id))

  function teclas(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setAbierto(true)
      setAct((a) => Math.min(a + 1, resultados.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setAct((a) => Math.max(a - 1, 0))
    } else if (e.key === 'Enter') {
      e.preventDefault() // no debe guardar el formulario
      const r = resultados[act] ?? resultados[0]
      if (r) agregar(r.id)
    } else if (e.key === 'Tab') {
      setAbierto(false) // al salir con el teclado
    } else if (e.key === 'Escape' && (q || abierto)) {
      e.stopPropagation() // cierra la lista, no el modal
      setQ('')
      setAbierto(false)
    }
  }

  return (
    <div className="campo sp" ref={raiz}>
      <span>
        {titulo} {valor.length > 0 && <small className="suave">({valor.length})</small>}
      </span>

      <div className="sp-chips">
        {valor.length === 0 && <span className="sp-vacio">Nadie asignado</span>}
        {valor.map((id) => {
          const nombre = porId.get(id)?.nombre ?? `Persona #${id}`
          return (
            <span key={id} className="sp-chip">
              {nombre}
              <button type="button" aria-label={`Quitar a ${nombre}`} onClick={() => quitar(id)}>
                ✕
              </button>
            </span>
          )
        })}
      </div>

      <input
        className="sp-buscar"
        placeholder={`Buscar y agregar ${titulo.toLowerCase()}…`}
        aria-label={`Buscar ${titulo.toLowerCase()}`}
        value={q}
        onChange={(e) => {
          setQ(e.target.value)
          setAct(0)
          setAbierto(true)
        }}
        onFocus={() => setAbierto(true)}
        onKeyDown={teclas}
      />

      {abierto && (
        <ul className="sp-lista" role="listbox" aria-label={`Resultados de ${titulo.toLowerCase()}`}>
          {resultados.map((p, i) => (
            <li
              key={p.id}
              role="option"
              aria-selected={i === act}
              className={`sp-op ${i === act ? 'act' : ''}`}
              onMouseDown={(e) => e.preventDefault()} // evita que el input pierda el foco antes del clic
              onClick={() => agregar(p.id)}
            >
              <strong>{p.nombre}</strong>
              {p.detalle && <small>{p.detalle}</small>}
            </li>
          ))}
          {resultados.length === 0 && (
            <li className="sp-op sp-sin">
              {personas.length === 0 ? 'No se pudo cargar la lista de personas' : 'Sin resultados'}
            </li>
          )}
        </ul>
      )}
    </div>
  )
}
