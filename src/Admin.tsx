import { useEffect, useState, type FormEvent } from "react";
import { NavLink, Outlet } from "react-router-dom";
import { clearToken, getToken, mensajeDe, probarToken, setToken } from "./lib/admin-api";
import { getConfig } from "./lib/config";

function hostApi(): string {
  try {
    return new URL(getConfig().apiUrl).host;
  } catch {
    return "sin URL de API";
  }
}

function Login({ onLogin }: { onLogin: (t: string) => void }) {
  const [valor, setValor] = useState("");
  const [error, setError] = useState("");
  const [probando, setProbando] = useState(false);

  async function enviar(e: FormEvent) {
    e.preventDefault();
    setProbando(true);
    setError("");
    try {
      await probarToken(valor.trim());
      onLogin(valor.trim());
    } catch (err) {
      setError(mensajeDe(err));
    } finally {
      setProbando(false);
    }
  }

  return (
    <div className="login">
      <form onSubmit={enviar}>
        <h1>Administración CIET 2026</h1>
        <p className="suave">Servidor: {hostApi()}</p>
        <label className="campo">
          Token de administrador
          <input type="password" value={valor} onChange={(e) => setValor(e.target.value)} autoFocus autoComplete="off" />
        </label>
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
        <button className="btn primario" disabled={!valor.trim() || probando}>
          {probando ? "Comprobando…" : "Entrar"}
        </button>
      </form>
    </div>
  );
}

export default function Admin() {
  const [token, setTokenState] = useState(getToken());

  useEffect(() => {
    const fuera = () => setTokenState("");
    window.addEventListener("admin:unauthorized", fuera);
    return () => window.removeEventListener("admin:unauthorized", fuera);
  }, []);

  if (!token) {
    return (
      <Login
        onLogin={(t) => {
          setToken(t);
          setTokenState(t);
        }}
      />
    );
  }

  return (
    <div className="shell">
      <aside className="rail">
        <h1 className="marca">
          CIET <span>2026</span>
        </h1>
        <nav>
          <NavLink to="/mapa">Mapa</NavLink>
          <NavLink to="/cronograma">Cronograma</NavLink>
          <NavLink to="/mensajes">Mensajes</NavLink>
        </nav>
        <div className="rail-pie">
          <span className="suave" title="Servidor de la API">
            {hostApi()}
          </span>
          <button
            className="btn chico"
            onClick={() => {
              clearToken();
              setTokenState("");
            }}
          >
            Salir
          </button>
        </div>
      </aside>
      <main className="main">
        <Outlet />
      </main>
    </div>
  );
}

