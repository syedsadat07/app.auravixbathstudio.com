'use client'

/**
 * AURAVIX BATH STUDIO — Quotation PDF export.
 *
 * Captures the (inline-styled) quotation preview node with html2canvas-pro
 * and lays it out on A4 pages with jsPDF. Tall quotations are sliced across
 * multiple pages without cutting rows mid-pixel (page slices are taken at
 * whole-canvas-pixel boundaries).
 */

/** Capture `el` and download it as an A4 PDF named `filename`. */
export async function downloadQuotationPdf(el: HTMLElement, filename: string): Promise<void> {
  const [{ default: html2canvas }, { jsPDF }] = await Promise.all([
    import('html2canvas-pro'),
    import('jspdf'),
  ])

  const canvas = await html2canvas(el, {
    scale: 2,
    backgroundColor: '#ffffff',
    useCORS: true,
  })

  const pdf = new jsPDF('p', 'mm', 'a4')
  const pageWidth = pdf.internal.pageSize.getWidth() // 210mm
  const pageHeight = pdf.internal.pageSize.getHeight() // 297mm
  const { width: canvasWidth, height: canvasHeight } = canvas
  if (!canvasWidth || !canvasHeight) throw new Error('Empty quotation canvas')

  // Whole document fits on one page → single addImage.
  const renderedHeightMm = (canvasHeight * pageWidth) / canvasWidth
  if (renderedHeightMm <= pageHeight) {
    pdf.addImage(canvas.toDataURL('image/jpeg', 0.92), 'JPEG', 0, 0, pageWidth, renderedHeightMm)
    pdf.save(filename)
    return
  }

  // Slice the tall canvas across multiple A4 pages.
  const sliceHeightPx = Math.floor((canvasWidth * pageHeight) / pageWidth) // one page in canvas px
  let offsetPx = 0
  let pageIndex = 0

  while (offsetPx < canvasHeight) {
    const sliceHeight = Math.min(sliceHeightPx, canvasHeight - offsetPx)
    const slice = document.createElement('canvas')
    slice.width = canvasWidth
    slice.height = sliceHeight
    const ctx = slice.getContext('2d')
    if (!ctx) throw new Error('Could not create PDF slice canvas')
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, canvasWidth, sliceHeight)
    ctx.drawImage(canvas, 0, offsetPx, canvasWidth, sliceHeight, 0, 0, canvasWidth, sliceHeight)

    if (pageIndex > 0) pdf.addPage()
    pdf.addImage(
      slice.toDataURL('image/jpeg', 0.92),
      'JPEG',
      0,
      0,
      pageWidth,
      (sliceHeight * pageWidth) / canvasWidth
    )

    offsetPx += sliceHeight
    pageIndex += 1
  }

  pdf.save(filename)
}

/** Open the browser print dialog for the currently rendered page. */
export async function printQuotation(): Promise<void> {
  window.print()
}
