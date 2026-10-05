// Mapa.tsx lee el viewBox directamente del SVG, así que aquí solo hace falta la ruta del plano.
export function getConfig() {
  return {
    mapaSvg: (import.meta.env.VITE_MAPA_SVG as string | undefined) ?? '/mapa.svg',
  }
}
