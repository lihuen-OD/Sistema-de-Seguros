import { useState } from 'react'
import { Eye, Download, Loader2 } from 'lucide-react'
import { apiClient } from '../../api/client'
import { triggerBlobDownload } from '../../utils/downloadFile'
import { FileViewerModal } from './FileViewerModal'

export interface FileViewDownloadButtonsProps {
  // Path relativo pasado a apiClient.get(..., {responseType:'blob'}) — nunca
  // la URL pública de Cloudinary (fileUrl), que fuerza descarga en PDFs.
  fetchUrl: string
  name: string
  className?: string
}

// Dos acciones separadas y explícitas: Ver (abre en un modal dentro de la
// app, nunca descarga) y Descargar (guarda el archivo). Ambas piden el
// mismo blob al backend — lo que se hace con ese blob después decide si se
// muestra o se guarda, nunca el navegador por su cuenta.
export function FileViewDownloadButtons({ fetchUrl, name, className }: FileViewDownloadButtonsProps) {
  const [viewerBlob, setViewerBlob] = useState<Blob | null>(null)
  const [viewerOpen, setViewerOpen] = useState(false)
  const [loadingAction, setLoadingAction] = useState<'view' | 'download' | null>(null)

  async function fetchBlob(): Promise<Blob> {
    const res = await apiClient.get<Blob>(fetchUrl, { responseType: 'blob' })
    return res.data
  }

  async function handleView() {
    if (loadingAction) return
    setLoadingAction('view')
    try {
      const blob = await fetchBlob()
      setViewerBlob(blob)
      setViewerOpen(true)
    } catch {
      // El toast de error ya lo muestra el interceptor global de apiClient.
    } finally {
      setLoadingAction(null)
    }
  }

  async function handleDownload() {
    if (loadingAction) return
    setLoadingAction('download')
    try {
      const blob = await fetchBlob()
      triggerBlobDownload(blob, name)
    } catch {
      // El toast de error ya lo muestra el interceptor global de apiClient.
    } finally {
      setLoadingAction(null)
    }
  }

  return (
    <>
      <div className={className ?? 'flex items-center gap-1'}>
        <button
          type="button"
          onClick={handleView}
          disabled={loadingAction !== null}
          title="Ver"
          aria-label="Ver archivo"
          className="p-1.5 rounded-lg text-brand-600 hover:bg-brand-50 transition-colors disabled:opacity-50"
        >
          {loadingAction === 'view' ? <Loader2 size={14} className="animate-spin" /> : <Eye size={14} />}
        </button>
        <button
          type="button"
          onClick={handleDownload}
          disabled={loadingAction !== null}
          title="Descargar"
          aria-label="Descargar archivo"
          className="p-1.5 rounded-lg text-slate-500 hover:bg-slate-100 transition-colors disabled:opacity-50"
        >
          {loadingAction === 'download' ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />}
        </button>
      </div>

      <FileViewerModal open={viewerOpen} onClose={() => setViewerOpen(false)} blob={viewerBlob} name={name} />
    </>
  )
}
