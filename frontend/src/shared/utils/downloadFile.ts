// Dispara la descarga de un Blob ya obtenido (ej. desde un endpoint propio
// que devuelve el archivo) usando un <a download> temporal.
export function triggerBlobDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  link.remove()
  URL.revokeObjectURL(url)
}
