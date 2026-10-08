import { create as crearQr } from 'qrcode'

// Logo de ejemplo (rayo sobre círculo). Cámbialo desde la página de QR subiendo tu propio SVG.
export const LOGO_PREDETERMINADO =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><circle cx="50" cy="50" r="48" fill="#0f172a"/><path d="M57 14 30 55h19l-6 31 28-42H53z" fill="#fbbf24"/></svg>'

// Máximo del lado del logo respecto al QR. Con corrección de errores H se puede tapar hasta ~30 %
// de los datos; aquí el logo (más su marco blanco) queda muy por debajo.
export const LOGO_MAX = 0.22

export type OpcionesQr = {
  logo?: string | null // texto de un SVG autocontenido
  logoPct?: number // lado del logo / lado del QR (0.12 a 0.22)
  margen?: number // zona blanca alrededor, en módulos (el estándar pide 4)
  tam?: number // tamaño en píxeles del SVG (solo es el tamaño por defecto: se escala sin perder calidad)
}

// SVG en base64 (data URI). Se hace por tramos para no pasar de golpe miles de argumentos.
export function aDataUri(svg: string): string {
  const bytes = new TextEncoder().encode(svg)
  let bin = ''
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  return `data:image/svg+xml;base64,${btoa(bin)}`
}

/**
 * Construye el QR como SVG propio (un solo <path>) en vez de usar el SVG de la librería, para poder:
 *  1. dejar libre una "placa" blanca al centro: los módulos que quedarían tapados por el logo no se
 *     dibujan, así el lector no ve módulos a medias;
 *  2. incrustar el logo como <image> (data URI). Dentro de un <image> el SVG del logo es solo una
 *     imagen: no ejecuta scripts ni altera el resto del QR.
 * Nivel de corrección H (el más alto) para que el logo no afecte la lectura.
 */
export function crearQrSvg(texto: string, o: OpcionesQr = {}): string {
  const { logo = null, logoPct = 0.2, margen = 4, tam = 512 } = o

  const qr = crearQr(texto, { errorCorrectionLevel: 'H' })
  const n = qr.modules.size
  const total = n + margen * 2

  // Placa central en unidades de módulo
  let placa: { lado: number; ini: number; fin: number } | null = null
  if (logo) {
    const pad = 1 // marco blanco alrededor del logo
    const maxLado = n - 18 // la placa no debe acercarse a los cuadros de las esquinas
    const lado = Math.min(Math.min(Math.max(logoPct, 0.08), LOGO_MAX) * n + pad * 2, maxLado)
    if (lado >= 5) placa = { lado, ini: (n - lado) / 2, fin: (n + lado) / 2 }
  }
  const tapado = (r: number, c: number) =>
    !!placa && r + 1 > placa.ini && r < placa.fin && c + 1 > placa.ini && c < placa.fin
  const oscuro = (r: number, c: number) => qr.modules.get(r, c) && !tapado(r, c)

  // Módulos oscuros en tramos horizontales: M x y h(largo) v1 h-(largo) z
  let d = ''
  for (let r = 0; r < n; r++) {
    let c = 0
    while (c < n) {
      if (!oscuro(r, c)) {
        c++
        continue
      }
      const ini = c
      while (c < n && oscuro(r, c)) c++
      d += `M${ini + margen} ${r + margen}h${c - ini}v1h-${c - ini}z`
    }
  }

  let centro = ''
  if (logo && placa) {
    const x = margen + placa.ini
    const lado = placa.lado
    const logoLado = lado - 2
    const xl = margen + (n - logoLado) / 2
    centro =
      `<rect x="${x}" y="${x}" width="${lado}" height="${lado}" rx="${Math.min(1.5, lado / 6)}" fill="#fff"/>` +
      `<image href="${aDataUri(logo)}" x="${xl}" y="${xl}" width="${logoLado}" height="${logoLado}" preserveAspectRatio="xMidYMid meet"/>`
  }

  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${total} ${total}" width="${tam}" height="${tam}">` +
    `<rect width="${total}" height="${total}" fill="#fff"/>` +
    `<path d="${d}" fill="#000" shape-rendering="crispEdges"/>` +
    centro +
    `</svg>`
  )
}

// Comprueba que el archivo sea un SVG válido y devuelve su texto (o lanza un error con el motivo).
export function validarLogoSvg(texto: string): string {
  const doc = new DOMParser().parseFromString(texto, 'image/svg+xml')
  if (doc.querySelector('parsererror') || doc.documentElement.nodeName.toLowerCase() !== 'svg') {
    throw new Error('El archivo no es un SVG válido')
  }
  const svg = doc.documentElement
  if (!svg.getAttribute('viewBox') && !(svg.getAttribute('width') && svg.getAttribute('height'))) {
    throw new Error('El SVG necesita un atributo viewBox (o width y height) para escalarse bien')
  }
  return texto
}

// SVG -> PNG cuadrado de px × px, con fondo blanco.
export function svgAPng(svg: string, px = 1024): Promise<Blob> {
  return new Promise((ok, fallo) => {
    const img = new Image()
    img.onload = () => {
      const canvas = document.createElement('canvas')
      canvas.width = canvas.height = px
      const g = canvas.getContext('2d')
      if (!g) return fallo(new Error('El navegador no permite crear el PNG'))
      g.fillStyle = '#fff'
      g.fillRect(0, 0, px, px)
      g.drawImage(img, 0, 0, px, px)
      canvas.toBlob((b) => (b ? ok(b) : fallo(new Error('No se pudo crear el PNG'))), 'image/png')
    }
    img.onerror = () => fallo(new Error('No se pudo leer el SVG'))
    img.src = aDataUri(svg)
  })
}

export function descargar(blob: Blob, nombre: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = nombre
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

// "Dra. María Pérez" -> "dra-maria-perez" (para nombres de archivo)
export const slug = (s: string) =>
  s
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
