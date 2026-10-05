import { useEffect, useMemo, useState } from "react";
import {
  enviarEmail,
  enviarSms,
  getParticipantes,
  mensajeDe,
  type Contacto,
  type ResultadoEnvio,
} from "../lib/admin-api";

// Lada con la que se completan números de 10 dígitos. Cámbiala si el evento no es en México.
const PAIS = "+52";

const esCorreo = (v: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);

/** Normaliza a formato E.164 (+5283...). Devuelve null si no parece un teléfono. */
function aTelefono(v: string): string | null {
  const limpio = v.replace(/[\s().-]/g, "");
  if (/^\+\d{10,15}$/.test(limpio)) return limpio;
  if (/^\d{10}$/.test(limpio)) return PAIS + limpio;
  if (/^52\d{10}$/.test(limpio)) return "+" + limpio;
  return null;
}

interface Envio {
  canal: "Correo" | "SMS";
  r?: ResultadoEnvio;
  error?: string;
}

export default function Mensajes() {
  const [contactos, setContactos] = useState<Contacto[]>([]);
  const [sel, setSel] = useState<Set<number>>(new Set());
  const [extra, setExtra] = useState("");
  const [busca, setBusca] = useState("");
  const [canales, setCanales] = useState({ correo: true, sms: false });
  const [asunto, setAsunto] = useState("");
  const [texto, setTexto] = useState("");
  const [estado, setEstado] = useState("Cargando contactos…");
  const [enviando, setEnviando] = useState(false);
  const [resultados, setResultados] = useState<Envio[]>([]);

  useEffect(() => {
    getParticipantes()
      .then((c) => {
        setContactos(c);
        setEstado(`${c.length} contactos`);
      })
      .catch((e) => setEstado(mensajeDe(e)));
  }, []);

  const visibles = useMemo(() => {
    const q = busca.trim().toLowerCase();
    if (!q) return contactos;
    return contactos.filter((c) => `${c.nombre} ${c.email ?? ""} ${c.telefono ?? ""}`.toLowerCase().includes(q));
  }, [contactos, busca]);

  // Destinatarios finales: contactos elegidos + campo libre, sin duplicados.
  const { correos, telefonos } = useMemo(() => {
    const cs = new Set<string>();
    const ts = new Set<string>();
    for (const c of contactos) {
      if (!sel.has(c.id)) continue;
      if (c.email && esCorreo(c.email.trim())) cs.add(c.email.trim().toLowerCase());
      const t = c.telefono ? aTelefono(c.telefono) : null;
      if (t) ts.add(t);
    }
    for (const tok of extra.split(/[\s,;]+/).filter(Boolean)) {
      if (tok.includes("@")) {
        if (esCorreo(tok)) cs.add(tok.toLowerCase());
      } else {
        const t = aTelefono(tok);
        if (t) ts.add(t);
      }
    }
    return { correos: [...cs], telefonos: [...ts] };
  }, [contactos, sel, extra]);

  const hayDestino = (canales.correo && correos.length > 0) || (canales.sms && telefonos.length > 0);
  const puedeEnviar =
    !enviando && texto.trim() !== "" && hayDestino && (!canales.correo || asunto.trim() !== "") && (canales.correo || canales.sms);

  const alternar = (id: number) =>
    setSel((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });

  const todosVisibles = visibles.length > 0 && visibles.every((c) => sel.has(c.id));
  const alternarVisibles = () =>
    setSel((s) => {
      const n = new Set(s);
      for (const c of visibles) {
        if (todosVisibles) n.delete(c.id);
        else n.add(c.id);
      }
      return n;
    });

  async function enviar() {
    const partes: string[] = [];
    if (canales.correo && correos.length) partes.push(`${correos.length} correos`);
    if (canales.sms && telefonos.length) partes.push(`${telefonos.length} SMS`);
    if (!window.confirm(`Se enviarán ${partes.join(" y ")}. ¿Continuar?`)) return;

    setEnviando(true);
    setResultados([]);
    const out: Envio[] = [];
    // Cada canal es independiente: si uno falla, el otro se envía y se informa por separado.
    if (canales.correo && correos.length) {
      try {
        out.push({ canal: "Correo", r: await enviarEmail(correos, asunto.trim(), texto.trim()) });
      } catch (e) {
        out.push({ canal: "Correo", error: mensajeDe(e) });
      }
    }
    if (canales.sms && telefonos.length) {
      try {
        out.push({ canal: "SMS", r: await enviarSms(telefonos, texto.trim()) });
      } catch (e) {
        out.push({ canal: "SMS", error: mensajeDe(e) });
      }
    }
    setResultados(out);
    if (out.every((o) => o.r && o.r.fallidos.length === 0)) setTexto("");
    setEnviando(false);
  }

  function reintentarFallidos() {
    const f = resultados.flatMap((o) => o.r?.fallidos.map((x) => x.to) ?? []);
    setSel(new Set());
    setExtra([...new Set(f)].join(", "));
    setResultados([]);
  }

  const hayFallidos = resultados.some((o) => (o.r?.fallidos.length ?? 0) > 0);

  return (
    <div className="pagina">
      <header className="barra">
        <h2>Mensajes</h2>
      </header>

      <div className="msg-layout">
        <section className="panel">
          <h3>Destinatarios</h3>
          <input
            className="buscar"
            type="search"
            placeholder="Buscar por nombre, correo o teléfono"
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            aria-label="Buscar contactos"
          />
          <label className="check">
            <input type="checkbox" checked={todosVisibles} onChange={alternarVisibles} disabled={visibles.length === 0} />
            Seleccionar los {visibles.length} visibles
          </label>
          <ul className="contactos">
            {visibles.map((c) => (
              <li key={c.id}>
                <label className="contacto">
                  <input type="checkbox" checked={sel.has(c.id)} onChange={() => alternar(c.id)} />
                  <span>
                    <strong>{c.nombre}</strong>
                    <small>{[c.email, c.telefono].filter(Boolean).join("  ") || "Sin datos de contacto"}</small>
                  </span>
                </label>
              </li>
            ))}
            {visibles.length === 0 && <li className="suave">{estado}</li>}
          </ul>
          <label className="campo">
            Otros destinatarios
            <textarea
              rows={2}
              value={extra}
              onChange={(e) => setExtra(e.target.value)}
              placeholder="Correos o teléfonos separados por espacio, coma o punto y coma"
            />
          </label>
        </section>

        <section className="panel">
          <h3>Mensaje</h3>
          <fieldset className="canales">
            <legend>Enviar por</legend>
            <label className="check">
              <input type="checkbox" checked={canales.correo} onChange={(e) => setCanales((c) => ({ ...c, correo: e.target.checked }))} />
              Correo ({correos.length})
            </label>
            <label className="check">
              <input type="checkbox" checked={canales.sms} onChange={(e) => setCanales((c) => ({ ...c, sms: e.target.checked }))} />
              SMS ({telefonos.length})
            </label>
          </fieldset>
          {canales.correo && (
            <label className="campo">
              Asunto
              <input value={asunto} onChange={(e) => setAsunto(e.target.value)} />
            </label>
          )}
          <label className="campo">
            Texto
            <textarea rows={8} value={texto} onChange={(e) => setTexto(e.target.value)} />
            <small className="suave">{texto.length} caracteres{canales.sms && texto.length > 160 ? ". Un SMS de más de 160 se cobra como varios." : ""}</small>
          </label>
          <button className="btn primario" disabled={!puedeEnviar} onClick={() => void enviar()}>
            {enviando ? "Enviando…" : "Enviar mensaje"}
          </button>

          {resultados.length > 0 && (
            <div className="resultados" role="status" aria-live="polite">
              {resultados.map((o) => (
                <div key={o.canal} className={`resultado ${o.error || o.r?.fallidos.length ? "mal" : "bien"}`}>
                  <strong>{o.canal}</strong>
                  {o.error ? (
                    <p>No se envió: {o.error}</p>
                  ) : (
                    o.r && (
                      <>
                        <p>
                          {o.r.enviados} de {o.r.total} enviados
                        </p>
                        {o.r.fallidos.length > 0 && (
                          <ul>
                            {o.r.fallidos.map((f) => (
                              <li key={f.to}>
                                {f.to}: {f.error}
                              </li>
                            ))}
                          </ul>
                        )}
                      </>
                    )
                  )}
                </div>
              ))}
              {hayFallidos && (
                <button className="btn chico" onClick={reintentarFallidos}>
                  Usar los fallidos como destinatarios
                </button>
              )}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

