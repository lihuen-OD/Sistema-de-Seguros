import html2canvas from 'html2canvas'
import jsPDF from 'jspdf'

/**
 * Captures a DOM element as a high-res canvas and downloads it as a PDF.
 * No print dialog — direct browser download.
 */
export async function downloadAsPdf(
  element: HTMLElement,
  filename: string,
  orientation: 'p' | 'l' = 'p',
): Promise<void> {
  const canvas = await html2canvas(element, {
    scale: 2,
    useCORS: true,
    logging: false,
    backgroundColor: '#ffffff',
    // Use a wide viewport so responsive md: breakpoints (grid-cols-2 etc.) activate
    windowWidth: 1400,
    windowHeight: element.scrollHeight + 200,
    // Skip cross-origin iframes (e.g. OpenStreetMap map embed)
    ignoreElements: (el) => el.tagName === 'IFRAME',
  })

  const pdf = new jsPDF({ orientation, unit: 'mm', format: 'a4' })

  const pageW = pdf.internal.pageSize.getWidth()
  const pageH = pdf.internal.pageSize.getHeight()

  // canvas dimensions are at scale:2, convert to mm keeping aspect ratio
  const canvasW = canvas.width
  const canvasH = canvas.height
  const mmPerPx = pageW / canvasW          // mm per canvas pixel
  const contentH = canvasH * mmPerPx       // total rendered height in mm

  const imgData = canvas.toDataURL('image/jpeg', 0.92)

  if (contentH <= pageH) {
    pdf.addImage(imgData, 'JPEG', 0, 0, pageW, contentH)
  } else {
    // Multi-page: slice the image across pages
    let yOffset = 0
    while (yOffset < contentH) {
      pdf.addImage(imgData, 'JPEG', 0, -yOffset, pageW, contentH)
      yOffset += pageH
      if (yOffset < contentH) pdf.addPage()
    }
  }

  pdf.save(filename)
}
