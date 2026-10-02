import { getConfig } from "./config";

// ---------- Tipos ----------
export interface Zona {
  id: number; // negativo = aún no guardada
  nombre: string;
  x: number;
  y: number;
  w: number;
  h: number;
  stand_id?: number | null;
}
export interface Stand {
  id: number;
  numero_stand: string;
  nombre_stand?: string | null;
}
export interface Charla {
  id: number;
  titulo: string;
  salon: string | null;
  inicio: string; // AAAA-MM-DDTHH:mm:ss, hora local del evento, sin zona
  fin: string;
  tipo?: string | null;
  ponentes?: string[];
}
export interface Contacto {
  id: number;
  nombre: string;
  email?: string | null;
  telefono?: string | null;
}
export interface Fallido {
  to: string;
  error: string;
}
export interface ResultadoEnvio {
  total: number;
  enviados: number;
  fallidos: Fallido[];
}
export interface CharlaInput {
  titulo?: string;
  inicio?: string;
  fin?: string;
  salon?: string;
  tipo?: string;
}

// Valores de los enums de Postgres (deben coincidir exactamente).
export const SALONES: readonly string[] = ["Escenario", "Salón 1", "Salón 2", "Salón 3", "Salón 4"];
export const TIPOS: readonly string[] = ["Conferencia Magistral", "Panel", "Taller", "Conferencia", "Evento"];

// ---------- Token ----------
const TOKEN_KEY = "admin_token";
export const getToken = (): string => localStorage.getItem(TOKEN_KEY) ?? "";
export const setToken = (t: string): void => localStorage.setItem(TOKEN_KEY, t);
export const clearToken = (): void => localStorage.removeItem(TOKEN_KEY);

// ---------- Cliente HTTP ----------
export class ApiError extends Error {
  status: number;
  body: string;
  constructor(status: number, body: string) {
    super(status === 0 ? body : `${status} ${body}`.trim());
    this.status = status;
    this.body = body;
  }
}

export const mensajeDe = (e: unknown): string => (e instanceof Error ? e.message : String(e));

function headers(token: string, json: boolean): Record<string, string> {
  const h: Record<string, string> = {
    Authorization: `Bearer ${token}`,
    // Evita la página de advertencia intermedia del plan gratuito de ngrok.
    "ngrok-skip-browser-warning": "1",
  };
  if (json) h["Content-Type"] = "application/json";
  return h;
}

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  const { apiUrl } = getConfig();
  if (!apiUrl) throw new ApiError(0, "Falta la URL de la API (config.json o VITE_API_URL)");
  let res: Response;
  try {
    res = await fetch(apiUrl.replace(/\/$/, "") + path, {
      method,
      headers: headers(getToken(), body !== undefined),
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new ApiError(0, "No se pudo conectar con el servidor (¿está encendido y el túnel activo?)");
  }
  if (res.status === 401) {
    clearToken();
    window.dispatchEvent(new Event("admin:unauthorized"));
  }
  if (!res.ok) throw new ApiError(res.status, await res.text());
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

/** Comprueba un token contra el servidor sin guardarlo. */
export async function probarToken(token: string): Promise<void> {
  const { apiUrl } = getConfig();
  if (!apiUrl) throw new ApiError(0, "Falta la URL de la API (config.json o VITE_API_URL)");
  let res: Response;
  try {
    res = await fetch(apiUrl.replace(/\/$/, "") + "/api/admin/stands", { headers: headers(token, false) });
  } catch {
    throw new ApiError(0, "No se pudo conectar con el servidor");
  }
  if (res.status === 401) throw new ApiError(401, "Token incorrecto");
  if (!res.ok) throw new ApiError(res.status, await res.text());
}

// ---------- Endpoints ----------
export const getZonas = () => request<Zona[]>("GET", "/api/admin/zonas");
export const putZonas = (zonas: Zona[]) =>
  request<Zona[]>(
    "PUT",
    "/api/admin/zonas",
    zonas.map((z) => ({ ...z, id: z.id > 0 ? z.id : undefined })),
  );
export const getStands = () => request<Stand[]>("GET", "/api/admin/stands");

export const getPrograma = () => request<Charla[]>("GET", "/api/admin/programa");
export const crearCharla = (c: CharlaInput) => request<unknown>("POST", "/api/admin/charlas", c);
export const actualizarCharla = (id: number, c: CharlaInput) =>
  request<unknown>("PATCH", `/api/admin/charlas/${id}`, c);
export const eliminarCharla = (id: number) => request<void>("DELETE", `/api/admin/charlas/${id}`);

export const getParticipantes = () => request<Contacto[]>("GET", "/api/admin/participantes");

/** 200, 207 (parcial) y 502 (todos fallaron) traen el mismo JSON: se devuelve siempre el resultado. */
async function enviar(path: string, payload: unknown): Promise<ResultadoEnvio> {
  try {
    return await request<ResultadoEnvio>("POST", path, payload);
  } catch (e) {
    if (e instanceof ApiError && e.status === 502) {
      try {
        const j = JSON.parse(e.body) as ResultadoEnvio;
        if (typeof j.total === "number") return j;
      } catch {
        /* no era JSON */
      }
    }
    throw e;
  }
}
export const enviarEmail = (to: string[], subject: string, body: string) =>
  enviar("/api/admin/mensajes/email", { to, subject, body });
export const enviarSms = (to: string[], body: string) => enviar("/api/admin/mensajes/sms", { to, body });

