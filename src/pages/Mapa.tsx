import { useCallback, useEffect, useRef, useState, type PointerEvent as RPointerEvent } from "react";
import { getStands, getZonas, mensajeDe, putZonas, type Stand, type Zona } from "../lib/admin-api";
import { getConfig } from "../lib/config";

type VBox = [number, number, number, number];
type Modo = "seleccionar" | "dibujar";
type Gesto = "mover" | "resize" | "dibujar";
interface Drag {
  kind: Gesto;
  id: number;
  start: { x: number; y: number };
  orig: Zona;
  cur: Zona; // última geometría calculada (evita depender del render al soltar)
}

const VB_INICIAL: VBox = [0, 0, 1000, 700];
const MIN = 10;
const clamp = (v: number, a: number, b: number) => Math.min(Math.max(v, a), b);

export default function Mapa() {
  const [zonas, setZonas] = useState<Zona[]>([]);
  const [stands, setStands] = useState<Stand[]>([]);
  const [sel, setSel] = useState<number | null>(null);
  const [modo, setModo] = useState<Modo>("seleccionar");
  const [sucio, setSucio] = useState(false);
  const [estado, setEstado] = useState("Cargando…");
  const [guardando, setGuardando] = useState(false);
  const [vb, setVb] = useState<VBox>(VB_INICIAL);

  const svgRef = useRef<SVGSVGElement>(null);
  const drag = useRef<Drag | null>(null);
  const tmpId = useRef(-1);
  const total = useRef(0);
  total.current = zonas.length;
  const { mapaSvg } = getConfig();

  const cargar = useCallback(async () => {
    setEstado("Cargando…");
    try {
      const z = await getZonas();
      setZonas(z);
      setSel(null);
      setSucio(false);
      setEstado(z.length === 1 ? "1 zona cargada" : `${z.length} zonas cargadas`);
      getStands().then(setStands).catch(() => setStands([]));
    } catch (e) {
      setEstado(mensajeDe(e));
    }
  }, []);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  // Toma el viewBox real del plano para que las coordenadas coincidan con él.
  useEffect(() => {
    let vivo = true;
    fetch(mapaSvg)
      .then((r) => (r.ok ? r.text() : Promise.reject(new Error("sin plano"))))
      .then((txt) => {
        const m = /viewBox\s*=\s*["']\s*([-\d.eE+]+)[\s,]+([-\d.eE+]+)[\s,]+([-\d.eE+]+)[\s,]+([-\d.eE+]+)/i.exec(txt);
        if (!m || !vivo) return;
        const v = m.slice(1, 5).map(Number) as VBox;
        if (v.every(Number.isFinite) && v[2] > 0 && v[3] > 0) setVb(v);
      })
      .catch(() => undefined);
    return () => {
      vivo = false;
    };
  }, [mapaSvg]);

  useEffect(() => {
    if (!sucio) return;
    const avisar = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", avisar);
    return () => window.removeEventListener("beforeunload", avisar);
  }, [sucio]);

  const reemplazar = (z: Zona) => setZonas((zs) => zs.map((o) => (o.id === z.id ? z : o)));
  const editar = (id: number, p: Partial<Zona>) => {
    setZonas((zs) => zs.map((o) => (o.id === id ? { ...o, ...p } : o)));
    setSucio(true);
  };

  // Pantalla -> coordenadas del SVG (funciona con cualquier zoom o tamaño).
  function aSvg(e: RPointerEvent) {
    const ctm = svgRef.current?.getScreenCTM();
    if (!ctm) return { x: 0, y: 0 };
    const p = new DOMPoint(e.clientX, e.clientY).matrixTransform(ctm.inverse());
    return { x: p.x, y: p.y };
  }
  const captura = (e: RPointerEvent) => svgRef.current?.setPointerCapture(e.pointerId);

  function alFondo(e: RPointerEvent) {
    if (e.button !== 0) return;
    if (modo !== "dibujar") {
      setSel(null);
      return;
    }
    const p = aSvg(e);
    const x = clamp(p.x, vb[0], vb[0] + vb[2]);
    const y = clamp(p.y, vb[1], vb[1] + vb[3]);
    const id = tmpId.current--;
    const z: Zona = { id, nombre: `Zona ${total.current + 1}`, x, y, w: 0, h: 0, stand_id: null };
    setZonas((zs) => [...zs, z]);
    setSel(id);
    drag.current = { kind: "dibujar", id, start: { x, y }, orig: z, cur: z };
    captura(e);
  }

  function alZona(e: RPointerEvent, z: Zona) {
    if (modo === "dibujar" || e.button !== 0) return; // en modo dibujar el evento sigue al fondo
    e.stopPropagation();
    setSel(z.id);
    drag.current = { kind: "mover", id: z.id, start: aSvg(e), orig: { ...z }, cur: z };
    captura(e);
  }

  function alAsa(e: RPointerEvent, z: Zona) {
    e.stopPropagation();
    drag.current = { kind: "resize", id: z.id, start: aSvg(e), orig: { ...z }, cur: z };
    captura(e);
  }

  function alMover(e: RPointerEvent) {
    const d = drag.current;
    if (!d) return;
    const p = aSvg(e);
    const [bx, by, bw, bh] = vb;
    const der = bx + bw;
    const aba = by + bh;
    let n: Zona = d.orig;
    if (d.kind === "mover") {
      n = {
        ...d.orig,
        x: clamp(d.orig.x + (p.x - d.start.x), bx, Math.max(bx, der - d.orig.w)),
        y: clamp(d.orig.y + (p.y - d.start.y), by, Math.max(by, aba - d.orig.h)),
      };
    } else if (d.kind === "resize") {
      n = {
        ...d.orig,
        w: clamp(d.orig.w + (p.x - d.start.x), MIN, Math.max(MIN, der - d.orig.x)),
        h: clamp(d.orig.h + (p.y - d.start.y), MIN, Math.max(MIN, aba - d.orig.y)),
      };
    } else {
      const px = clamp(p.x, bx, der);
      const py = clamp(p.y, by, aba);
      n = {
        ...d.orig,
        x: Math.min(d.start.x, px),
        y: Math.min(d.start.y, py),
        w: Math.abs(px - d.start.x),
        h: Math.abs(py - d.start.y),
      };
    }
    d.cur = n;
    reemplazar(n);
  }

  function alSoltar(e: RPointerEvent) {
    const d = drag.current;
    drag.current = null;
    if (!d) return;
    if (svgRef.current?.hasPointerCapture(e.pointerId)) svgRef.current.releasePointerCapture(e.pointerId);
    if (d.kind === "dibujar") {
      if (d.cur.w < MIN || d.cur.h < MIN) {
        setZonas((zs) => zs.filter((z) => z.id !== d.id));
        setSel(null);
      } else {
        setSucio(true);
      }
      setModo("seleccionar");
    } else if (d.cur.x !== d.orig.x || d.cur.y !== d.orig.y || d.cur.w !== d.orig.w || d.cur.h !== d.orig.h) {
      setSucio(true);
    }
  }

  async function guardar() {
    setGuardando(true);
    setEstado("Guardando…");
    try {
      const r = await putZonas(zonas);
      setZonas(r);
      setSel(null);
      setSucio(false);
      setEstado("Zonas guardadas");
    } catch (e) {
      setEstado(mensajeDe(e)); // se conservan los cambios
    } finally {
      setGuardando(false);
    }
  }

  function eliminar(id: number) {
    setZonas((zs) => zs.filter((z) => z.id !== id));
    setSel(null);
    setSucio(true);
  }

  const zona = zonas.find((z) => z.id === sel) ?? null;
  const fs = vb[2] / 70;
  const hs = vb[2] / 55;
  const standsUsados = new Set(zonas.filter((o) => o.id !== sel && o.stand_id).map((o) => o.stand_id));
  const num = (v: number) => Math.round(v * 100) / 100;

  return (
    <div className="pagina">
      <header className="barra">
        <h2>Mapa</h2>
        <div className="barra-acciones">
          <button
            className={`btn ${modo === "dibujar" ? "activo" : ""}`}
            aria-pressed={modo === "dibujar"}
            onClick={() => setModo(modo === "dibujar" ? "seleccionar" : "dibujar")}
          >
            {modo === "dibujar" ? "Cancelar dibujo" : "Dibujar zona"}
          </button>
          <button className="btn" onClick={() => void cargar()} disabled={guardando}>
            {sucio ? "Descartar cambios" : "Recargar"}
          </button>
          <button className="btn primario" onClick={() => void guardar()} disabled={!sucio || guardando}>
            Guardar cambios
          </button>
        </div>
      </header>
      <p className={`estado ${sucio ? "pendiente" : ""}`} role="status" aria-live="polite">
        {sucio && "Cambios sin guardar. "}
        {estado}
      </p>

      <div className="mapa-layout">
        <svg
          ref={svgRef}
          className={`lienzo ${modo === "dibujar" ? "dibujando" : ""}`}
          viewBox={vb.join(" ")}
          onPointerDown={alFondo}
          onPointerMove={alMover}
          onPointerUp={alSoltar}
          onPointerCancel={alSoltar}
        >
          <image href={mapaSvg} x={vb[0]} y={vb[1]} width={vb[2]} height={vb[3]} preserveAspectRatio="none" />
          {zonas.map((z) => (
            <g key={z.id} className={`zona ${sel === z.id ? "sel" : ""}`} onPointerDown={(e) => alZona(e, z)}>
              <rect x={z.x} y={z.y} width={z.w} height={z.h} vectorEffect="non-scaling-stroke" />
              <text x={z.x + fs * 0.4} y={z.y + fs * 1.4} fontSize={fs}>
                {z.nombre}
              </text>
            </g>
          ))}
          {zona && modo === "seleccionar" && (
            <rect
              className="asa"
              x={zona.x + zona.w - hs / 2}
              y={zona.y + zona.h - hs / 2}
              width={hs}
              height={hs}
              vectorEffect="non-scaling-stroke"
              onPointerDown={(e) => alAsa(e, zona)}
            />
          )}
        </svg>

        <aside className="panel">
          <h3>Zonas ({zonas.length})</h3>
          {zonas.length === 0 && <p className="suave">Aún no hay zonas. Usa «Dibujar zona» y arrastra sobre el plano.</p>}
          <ul className="lista">
            {zonas.map((z) => (
              <li key={z.id}>
                <button className={`item ${sel === z.id ? "activo" : ""}`} onClick={() => setSel(z.id)}>
                  {z.nombre || "(sin nombre)"}
                  {z.id < 0 && <em> nueva</em>}
                </button>
              </li>
            ))}
          </ul>

          {zona && (
            <div className="detalle">
              <h3>Zona seleccionada</h3>
              <label className="campo">
                Nombre
                <input value={zona.nombre} onChange={(e) => editar(zona.id, { nombre: e.target.value })} />
              </label>
              <div className="rejilla2">
                {(["x", "y", "w", "h"] as const).map((k) => (
                  <label className="campo" key={k}>
                    {{ x: "Izquierda (x)", y: "Arriba (y)", w: "Ancho", h: "Alto" }[k]}
                    <input
                      type="number"
                      step={1}
                      value={num(zona[k])}
                      onChange={(e) => {
                        const n = e.target.valueAsNumber;
                        if (Number.isFinite(n)) editar(zona.id, { [k]: k === "w" || k === "h" ? Math.max(MIN, n) : n });
                      }}
                    />
                  </label>
                ))}
              </div>
              <label className="campo">
                Stand asociado
                <select
                  value={zona.stand_id ?? ""}
                  onChange={(e) => editar(zona.id, { stand_id: e.target.value ? Number(e.target.value) : null })}
                >
                  <option value="">Ninguno</option>
                  {stands.map((s) => (
                    <option key={s.id} value={s.id} disabled={standsUsados.has(s.id)}>
                      {s.numero_stand}
                      {s.nombre_stand ? ` — ${s.nombre_stand}` : ""}
                      {standsUsados.has(s.id) ? " (en otra zona)" : ""}
                    </option>
                  ))}
                </select>
              </label>
              <button className="btn peligro" onClick={() => eliminar(zona.id)}>
                Eliminar zona
              </button>
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}

