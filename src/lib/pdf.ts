'use client'

/**
 * AURAVIX BATH STUDIO — Quotation PDF export.
 *
 * Captures the quotation preview node with html2canvas-pro and lays it out on A4 pages with jsPDF.
 * If the preview contains explicit [data-pdf-page] elements, each page is captured individually
 * to ensure 100% precise pagination, zero slicing across content, and perfect footer alignment.
 */

/** Capture `el` and download it as an A4 PDF named `filename`. */
export async function downloadQuotationPdf(el: HTMLElement, filename: string): Promise<void> {
  const [{ default: html2canvas }, { jsPDF }] = await Promise.all([
    import('html2canvas-pro'),
    import('jspdf'),
  ])

  const pdf = new jsPDF('p', 'mm', 'a4')
  const pageWidth = pdf.internal.pageSize.getWidth() // 210mm
  const pageHeight = pdf.internal.pageSize.getHeight() // 297mm

  // Check for explicit page-based layout
  const pageElements = el.querySelectorAll<HTMLElement>('[data-pdf-page]')

  if (pageElements.length > 0) {
    for (let i = 0; i < pageElements.length; i++) {
      const pageEl = pageElements[i]
      const canvas = await html2canvas(pageEl, {
        scale: 2,
        backgroundColor: '#ffffff',
        useCORS: true,
        logging: false,
      })

      if (i > 0) pdf.addPage()
      pdf.addImage(
        canvas.toDataURL('image/jpeg', 0.95),
        'JPEG',
        0,
        0,
        pageWidth,
        pageHeight
      )
    }

    pdf.save(filename)
    return
  }

  // Fallback: Legacy continuous canvas with slice-based pagination
  const canvas = await html2canvas(el, {
    scale: 2,
    backgroundColor: '#ffffff',
    useCORS: true,
  })

  const { width: canvasWidth, height: canvasHeight } = canvas
  if (!canvasWidth || !canvasHeight) throw new Error('Empty quotation canvas')

  const renderedHeightMm = (canvasHeight * pageWidth) / canvasWidth
  if (renderedHeightMm <= pageHeight) {
    pdf.addImage(canvas.toDataURL('image/jpeg', 0.95), 'JPEG', 0, 0, pageWidth, renderedHeightMm)
    pdf.save(filename)
    return
  }

  const sliceHeightPx = Math.floor((canvasWidth * pageHeight) / pageWidth)
  const totalPages = Math.ceil(canvasHeight / sliceHeightPx)
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
      slice.toDataURL('image/jpeg', 0.95),
      'JPEG',
      0,
      0,
      pageWidth,
      (sliceHeight * pageWidth) / canvasWidth
    )

    // Add page number footer for fallback mode
    pdf.setFontSize(8)
    pdf.setTextColor(150, 150, 150)
    pdf.text(
      `Page ${pageIndex + 1} of ${totalPages}  •  Auravix Bath Studio Quotation`,
      pageWidth / 2,
      pageHeight - 6,
      { align: 'center' }
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
