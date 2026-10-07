import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type PointerEvent as RPointerEvent } from "react";
import {
  actualizarCharla,
  crearCharla,
  eliminarCharla,
  getPrograma,
  mensajeDe,
  SALONES,
  TIPOS,
  type Charla,
} from "../lib/admin-api";

// ---- Escala (la altura de cabecera se comparte con el CSS mediante la variable --head) ----
const PX_MIN = 1.4; // píxeles por minuto
const SNAP = 5; // ajuste en minutos
const COL_W = 200;
const HEAD = 36;
const GUTTER = 56;
const MIN_INI = 8 * 60; // rango mínimo visible; se amplía si hay charlas fuera de él
const MIN_FIN = 20 * 60;
const CLIC_PX = 4;
const SIN_SALON = "Sin salón";

// ---- Horas como texto "AAAA-MM-DDTHH:mm:00". SIN conversiones de zona horaria: ----
// ---- lo que se ve es lo que se guarda, tal cual, terminando en ":00".            ----
const pad = (n: number) => String(n).padStart(2, "0");
const fechaDe = (s: string) => s.slice(0, 10);
const minDelDia = (s: string) => Number(s.slice(11, 13)) * 60 + Number(s.slice(14, 16));
// Date.UTC solo se usa como calculadora de minutos absolutos (sin zona, sin corrimientos).
const absMin = (s: string) => Date.UTC(+s.slice(0, 4), +s.slice(5, 7) - 1, +s.slice(8, 10)) / 60000 + minDelDia(s);
const desdeAbs = (m: number) => new Date(m * 60000).toISOString().slice(0, 19);
const hhmm = (m: number) => `${pad(Math.floor(m / 60))}:${pad(m % 60)}`;
const clamp = (v: number, a: number, b: number) => Math.min(Math.max(v, a), b);

function etiquetaDia(f: string) {
  const d = new Date(+f.slice(0, 4), +f.slice(5, 7) - 1, +f.slice(8, 10));
  return d.toLocaleDateString("es-MX", { weekday: "short", day: "numeric", month: "short" });
}

interface Mov {
  id: number;
  x0: number;
  y0: number;
  ini0: number;
  dur: number;
  col0: number;
  col: number;
  ini: number;
  moved: boolean;
}

interface Borrador {
  id?: number;
  titulo: string;
  salon: string;
  tipo: string;
  inicio: string; // datetime-local: AAAA-MM-DDTHH:mm
  fin: string;
  ponentes: string;
  tenia: { salon: boolean; tipo: boolean };
}

export default function Cronograma() {
  const [charlas, setCharlas] = useState<Charla[]>([]);
  const [fecha, setFecha] = useState("");
  const [editando, setEditando] = useState<Borrador | null>(null);
  const [mov, setMov] = useState<Mov | null>(null);
  const [estado, setEstado] = useState("Cargando…");
  const movRef = useRef<Mov | null>(null);

  const cargar = useCallback(async () => {
    try {
      const p = await getPrograma();
      setCharlas(p);
      setEstado(p.length === 1 ? "1 charla" : `${p.length} charlas`);
    } catch (e) {
      setEstado(mensajeDe(e));
    }
  }, []);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  // ---- Derivados ----
  const dias = useMemo(() => [...new Set(charlas.map((c) => fechaDe(c.inicio)))].sort(), [charlas]);
  useEffect(() => {
    if (dias.length && !dias.includes(fecha)) setFecha(dias[0]);
  }, [dias, fecha]);

  // Los salones son un enum cerrado: se muestran todos (para poder mover una charla a uno vacío)
  // más cualquier valor inesperado que venga en los datos.
  const salones = useMemo(() => {
    const extra = [...new Set(charlas.map((c) => c.salon).filter((s): s is string => !!s && !SALONES.includes(s)))];
    const base = [...SALONES, ...extra];
    return charlas.some((c) => !c.salon) ? [...base, SIN_SALON] : base;
  }, [charlas]);

  const delDia = useMemo(() => charlas.filter((c) => fechaDe(c.inicio) === fecha), [charlas, fecha]);

  // El rango de horas se amplía si hay charlas antes o después del horario mínimo.
  const rango = useMemo(() => {
    let ini = MIN_INI;
    let fin = MIN_FIN;
    for (const c of delDia) {
      const i = minDelDia(c.inicio);
      const f = i + (absMin(c.fin) - absMin(c.inicio));
      ini = Math.min(ini, Math.floor(i / 60) * 60);
      fin = Math.max(fin, Math.ceil(f / 60) * 60);
    }
    return { ini, fin };
  }, [delDia]);

  // Reparte en carriles (lado a lado) las charlas que se cruzan dentro de un mismo salón.
  const carriles = useMemo(() => {
    const res = new Map<number, { carril: number; total: number }>();
    const porSalon = new Map<string, Charla[]>();
    for (const c of delDia) {
      const k = c.salon ?? SIN_SALON;
      porSalon.set(k, [...(porSalon.get(k) ?? []), c]);
    }
    for (const lista of porSalon.values()) {
      lista.sort((a, b) => absMin(a.inicio) - absMin(b.inicio) || absMin(a.fin) - absMin(b.fin));
      let grupo: number[] = [];
      let finCarril: number[] = [];
      let finGrupo = -Infinity;
      const cerrar = () => {
        for (const id of grupo) res.get(id)!.total = finCarril.length;
        grupo = [];
        finCarril = [];
      };
      for (const c of lista) {
        const i = absMin(c.inicio);
        const f = absMin(c.fin);
        if (i >= finGrupo) {
          cerrar();
          finGrupo = -Infinity;
        }
        let k = finCarril.findIndex((x) => x <= i);
        if (k < 0) k = finCarril.length;
        finCarril[k] = f;
        finGrupo = Math.max(finGrupo, f);
        grupo.push(c.id);
        res.set(c.id, { carril: k, total: 1 });
      }
      cerrar();
    }
    return res;
  }, [delDia]);

  const empalmadas = useMemo(() => {
    const s = new Set<number>();
    for (const a of delDia) {
      for (const b of delDia) {
        if (a.id >= b.id || (a.salon ?? SIN_SALON) !== (b.salon ?? SIN_SALON)) continue;
        if (absMin(a.inicio) < absMin(b.fin) && absMin(b.inicio) < absMin(a.fin)) {
          s.add(a.id);
          s.add(b.id);
        }
      }
    }
    return s;
  }, [delDia]);

  // ---- Arrastre ----
  function alPresionar(e: RPointerEvent<HTMLDivElement>, c: Charla) {
    if (e.button !== 0) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    const col0 = Math.max(0, salones.indexOf(c.salon ?? SIN_SALON));
    const m: Mov = {
      id: c.id,
      x0: e.clientX,
      y0: e.clientY,
      ini0: minDelDia(c.inicio),
      dur: absMin(c.fin) - absMin(c.inicio),
      col0,
      col: col0,
      ini: minDelDia(c.inicio),
      moved: false,
    };
    movRef.current = m;
  }

  function alMover(e: RPointerEvent<HTMLDivElement>, c: Charla) {
    const m = movRef.current;
    if (!m || m.id !== c.id) return;
    const dx = e.clientX - m.x0;
    const dy = e.clientY - m.y0;
    if (!m.moved && Math.hypot(dx, dy) < CLIC_PX) return; // menos de 4 px = clic
    let ini = Math.round((m.ini0 + dy / PX_MIN) / SNAP) * SNAP;
    ini = clamp(ini, rango.ini, Math.max(rango.ini, rango.fin - m.dur));
    let col = clamp(m.col0 + Math.round(dx / COL_W), 0, salones.length - 1);
    // La API no puede dejar un salón en blanco: no se permite soltar en «Sin salón».
    if (salones[col] === SIN_SALON && salones[m.col0] !== SIN_SALON) col = m.col0;
    const n = { ...m, moved: true, ini, col };
    movRef.current = n;
    setMov(n);
  }

  async function alSoltar(c: Charla) {
    const m = movRef.current;
    movRef.current = null;
    setMov(null);
    if (!m || m.id !== c.id) return;
    if (!m.moved) {
      abrir(c);
      return;
    }
    const salonNuevo = salones[m.col];
    const cambioSalon = salonNuevo !== SIN_SALON && salonNuevo !== c.salon;
    const cambioHora = m.ini !== m.ini0;
    if (!cambioSalon && !cambioHora) return;

    // Se guarda tal cual: "AAAA-MM-DDTHH:mm:00"
    const inicio = `${fechaDe(c.inicio)}T${hhmm(m.ini)}:00`;
    const fin = desdeAbs(absMin(inicio) + m.dur);
    const nuevo: Charla = {
      ...c,
      salon: cambioSalon ? salonNuevo : c.salon,
      inicio: cambioHora ? inicio : c.inicio,
      fin: cambioHora ? fin : c.fin,
    };
    setCharlas((cs) => cs.map((x) => (x.id === c.id ? nuevo : x))); // optimista
    setEstado("Guardando…");
    try {
      await actualizarCharla(c.id, {
        ...(cambioSalon ? { salon: salonNuevo } : {}),
        ...(cambioHora ? { inicio, fin } : {}),
      });
      setEstado("Charla movida");
    } catch (e) {
      setCharlas((cs) => cs.map((x) => (x.id === c.id ? c : x))); // restaura
      setEstado(mensajeDe(e));
    }
  }

  function cancelar() {
    movRef.current = null;
    setMov(null);
  }

  // ---- Modal ----
  function abrir(c: Charla) {
    setEditando({
      id: c.id,
      titulo: c.titulo,
      salon: c.salon ?? "",
      tipo: c.tipo ?? "",
      inicio: c.inicio.slice(0, 16),
      fin: c.fin.slice(0, 16),
      ponentes: (c.ponentes ?? []).join(", "),
      tenia: { salon: !!c.salon, tipo: !!c.tipo },
    });
  }

  function nueva() {
    const f = fecha || new Date().toISOString().slice(0, 10);
    setEditando({
      titulo: "",
      salon: "",
      tipo: "",
      inicio: `${f}T09:00`,
      fin: `${f}T10:00`,
      ponentes: "",
      tenia: { salon: false, tipo: false },
    });
  }

  async function guardar(b: Borrador): Promise<string | null> {
    if (!b.titulo.trim()) return "El título es obligatorio";
    if (!b.inicio || !b.fin) return "Indica la hora de inicio y de fin";
    if (b.fin <= b.inicio) return "La hora de fin debe ser posterior a la de inicio";
    try {
      // Se guarda tal cual: "AAAA-MM-DDTHH:mm:00"
      const datos = { titulo: b.titulo.trim(), inicio: `${b.inicio}:00`, fin: `${b.fin}:00` };
      if (b.id === undefined) {
        await crearCharla({ ...datos, ...(b.salon ? { salon: b.salon } : {}), ...(b.tipo ? { tipo: b.tipo } : {}) });
      } else {
        await actualizarCharla(b.id, { ...datos, ...(b.salon ? { salon: b.salon } : {}), ...(b.tipo ? { tipo: b.tipo } : {}) });
      }
      setEditando(null);
      setFecha(fechaDe(datos.inicio));
      await cargar();
      setEstado("Charla guardada");
      return null;
    } catch (e) {
      return mensajeDe(e);
    }
  }

  async function borrar(b: Borrador): Promise<string | null> {
    if (b.id === undefined) return null;
    if (!window.confirm(`¿Eliminar la charla «${b.titulo}»? Esta acción no se puede deshacer.`)) return null;
    try {
      await eliminarCharla(b.id);
      setEditando(null);
      await cargar();
      setEstado("Charla eliminada");
      return null;
    } catch (e) {
      return mensajeDe(e);
    }
  }

  // ---- Render ----
  const alto = (rango.fin - rango.ini) * PX_MIN;
  const horas = Array.from({ length: (rango.fin - rango.ini) / 60 + 1 }, (_, i) => rango.ini + i * 60);
  const estiloRejilla = { "--head": `${HEAD}px`, width: GUTTER + salones.length * COL_W } as CSSProperties;

  return (
    <div className="pagina">
      <header className="barra">
        <h2>Cronograma</h2>
        <div className="barra-acciones">
          <button className="btn primario" onClick={nueva}>
            Nueva charla
          </button>
        </div>
      </header>

      <div className="dias" role="tablist" aria-label="Día">
        {dias.map((d) => (
          <button key={d} role="tab" aria-selected={d === fecha} className={`dia ${d === fecha ? "activo" : ""}`} onClick={() => setFecha(d)}>
            {etiquetaDia(d)}
          </button>
        ))}
        <p className="estado" role="status" aria-live="polite">
          {estado}
          {empalmadas.size > 0 && `. ${empalmadas.size} charlas se empalman en el mismo salón`}
        </p>
      </div>

      {dias.length === 0 ? (
        <p className="vacio">Todavía no hay charlas. Crea la primera con «Nueva charla».</p>
      ) : (
        <div className="cron-scroll">
          <div className="cron-grid" style={estiloRejilla}>
            <div className="cron-head">
              <div style={{ width: GUTTER }} />
              {salones.map((s) => (
                <div key={s} className="cron-col-h" style={{ width: COL_W }}>
                  {s}
                </div>
              ))}
            </div>
            <div className="cron-body" style={{ height: alto }}>
              {horas.map((h) => (
                <div key={h} className="hora" style={{ top: (h - rango.ini) * PX_MIN }}>
                  <span style={{ width: GUTTER }}>{hhmm(h % 1440)}</span>
                </div>
              ))}
              {salones.map((s, i) => (
                <div key={s} className="col-sep" style={{ left: GUTTER + i * COL_W, width: COL_W }} />
              ))}
              {delDia.map((c) => {
                const enMov = mov?.id === c.id && mov.moved ? mov : null;
                const ini = enMov ? enMov.ini : minDelDia(c.inicio);
                const dur = absMin(c.fin) - absMin(c.inicio);
                const col = enMov ? enMov.col : Math.max(0, salones.indexOf(c.salon ?? SIN_SALON));
                const { carril, total } = enMov ? { carril: 0, total: 1 } : (carriles.get(c.id) ?? { carril: 0, total: 1 });
                const ancho = (COL_W - 8) / total;
                const estilo: CSSProperties = {
                  top: (ini - rango.ini) * PX_MIN,
                  height: Math.max(dur * PX_MIN, 18),
                  left: GUTTER + col * COL_W + 4 + carril * ancho,
                  width: ancho - (total > 1 ? 2 : 0),
                };
                return (
                  <div
                    key={c.id}
                    className={`tarjeta ${enMov ? "moviendo" : ""} ${empalmadas.has(c.id) ? "empalme" : ""}`}
                    style={estilo}
                    tabIndex={0}
                    role="button"
                    aria-label={`${c.titulo}, ${hhmm(minDelDia(c.inicio))} a ${hhmm(minDelDia(c.fin))}`}
                    onKeyDown={(e) => e.key === "Enter" && abrir(c)}
                    onPointerDown={(e) => alPresionar(e, c)}
                    onPointerMove={(e) => alMover(e, c)}
                    onPointerUp={() => void alSoltar(c)}
                    onPointerCancel={cancelar}
                  >
                    <strong>
                      {hhmm(enMov ? enMov.ini : minDelDia(c.inicio))}–{hhmm((enMov ? enMov.ini : minDelDia(c.inicio)) + dur)}
                    </strong>
                    <span className="t-titulo">{c.titulo}</span>
                    {c.ponentes && c.ponentes.length > 0 && <span className="t-sub">{c.ponentes.join(", ")}</span>}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {editando && <Modal inicial={editando} onCerrar={() => setEditando(null)} onGuardar={guardar} onBorrar={borrar} />}
    </div>
  );
}

function Modal({
  inicial,
  onCerrar,
  onGuardar,
  onBorrar,
}: {
  inicial: Borrador;
  onCerrar: () => void;
  onGuardar: (b: Borrador) => Promise<string | null>;
  onBorrar: (b: Borrador) => Promise<string | null>;
}) {
  const [b, setB] = useState(inicial);
  const [error, setError] = useState("");
  const [ocupado, setOcupado] = useState(false);
  const set = (p: Partial<Borrador>) => setB((x) => ({ ...x, ...p }));

  async function correr(fn: () => Promise<string | null>) {
    setOcupado(true);
    setError((await fn()) ?? "");
    setOcupado(false);
  }

  return (
    <div className="modal-fondo" onPointerDown={(e) => e.target === e.currentTarget && onCerrar()} onKeyDown={(e) => e.key === "Escape" && onCerrar()}>
      <div className="modal" role="dialog" aria-modal="true" aria-label={b.id === undefined ? "Nueva charla" : "Editar charla"}>
        <h3>{b.id === undefined ? "Nueva charla" : "Editar charla"}</h3>
        <label className="campo">
          Título
          <input value={b.titulo} onChange={(e) => set({ titulo: e.target.value })} autoFocus />
        </label>
        <div className="rejilla2">
          <label className="campo">
            Salón
            <select value={b.salon} onChange={(e) => set({ salon: e.target.value })}>
              {!b.tenia.salon && <option value="">Sin asignar</option>}
              {SALONES.map((s) => (
                <option key={s}>{s}</option>
              ))}
              {b.salon && !SALONES.includes(b.salon) && <option>{b.salon}</option>}
            </select>
          </label>
          <label className="campo">
            Tipo
            <select value={b.tipo} onChange={(e) => set({ tipo: e.target.value })}>
              {!b.tenia.tipo && <option value="">Sin tipo</option>}
              {TIPOS.map((t) => (
                <option key={t}>{t}</option>
              ))}
              {b.tipo && !TIPOS.includes(b.tipo) && <option>{b.tipo}</option>}
            </select>
          </label>
          <label className="campo">
            Inicio
            <input type="datetime-local" step={300} value={b.inicio} onChange={(e) => set({ inicio: e.target.value })} />
          </label>
          <label className="campo">
            Fin
            <input type="datetime-local" step={300} value={b.fin} onChange={(e) => set({ fin: e.target.value })} />
          </label>
        </div>
        {b.id !== undefined && (
          <label className="campo">
            Ponentes
            <input value={b.ponentes || "Sin ponentes asignados"} readOnly />
            <small className="suave">Solo lectura: los ponentes se asignan desde la base de datos.</small>
          </label>
        )}
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
        <div className="modal-pie">
          {b.id !== undefined && (
            <button className="btn peligro" disabled={ocupado} onClick={() => void correr(() => onBorrar(b))}>
              Eliminar
            </button>
          )}
          <span className="relleno" />
          <button className="btn" onClick={onCerrar} disabled={ocupado}>
            Cancelar
          </button>
          <button className="btn primario" disabled={ocupado} onClick={() => void correr(() => onGuardar(b))}>
            Guardar
          </button>
        </div>
      </div>
    </div>
  );
}
