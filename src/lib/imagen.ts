// Reduce la foto antes de subirla (lado mayor 800 px, WebP): ahorra almacenamiento y ancho de banda.
export async function reducirImagen(file: File, max = 800, calidad = 0.85): Promise<Blob> {
  const bmp = await createImageBitmap(file)
  const k = Math.min(1, max / Math.max(bmp.width, bmp.height))
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(bmp.width * k)
  canvas.height = Math.round(bmp.height * k)
  canvas.getContext('2d')!.drawImage(bmp, 0, 0, canvas.width, canvas.height)
  bmp.close()
  return new Promise((ok, fail) =>
    canvas.toBlob((b) => (b ? ok(b) : fail(new Error('No se pudo procesar la imagen'))), 'image/webp', calidad),
  )
}
