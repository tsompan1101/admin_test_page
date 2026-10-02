// La URL de la API puede cambiar sin recompilar: se lee de /config.json al arrancar
// (útil si el dashboard pasa del servidor local a Netlify, o si cambia el dominio de ngrok).
// Si no existe, se usan las variables VITE_* del momento de compilar.
export interface AppConfig {
  apiUrl: string;
  mapaSvg: string;
}

const cfg: AppConfig = {
  apiUrl: import.meta.env.VITE_API_URL ?? "",
  mapaSvg: import.meta.env.VITE_MAPA_SVG ?? "/mapa.svg",
};

export async function loadConfig(): Promise<void> {
  try {
    const r = await fetch("/config.json", { cache: "no-store" });
    if (!r.ok) return;
    const j = (await r.json()) as Partial<AppConfig>;
    if (j.apiUrl && !j.apiUrl.includes("TU-DOMINIO")) cfg.apiUrl = j.apiUrl;
    if (j.mapaSvg) cfg.mapaSvg = j.mapaSvg;
  } catch {
    /* sin config.json (o el host devolvió index.html): se usan los valores de compilación */
  }
}

export const getConfig = (): AppConfig => cfg;

