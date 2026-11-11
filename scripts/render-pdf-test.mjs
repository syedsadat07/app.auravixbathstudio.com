import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

// Read quote dump
let text = fs.readFileSync('quote-dump.json');
if (text[0] === 0xff && text[1] === 0xfe) text = text.toString('utf16le');
else text = text.toString('utf8');

const parts = text.replace(/^\ufeff/, '').split(/\r?\nSettings:\s*/);
const qPart = parts[0].replace(/^Quotation:\s*/, '').trim();
const sPart = parts[1]?.trim() || '{}';

const q = JSON.parse(qPart);
const settings = JSON.parse(sPart);

// Import buildQuotationPreviewData & QuotationPreview
import QuotationPreview, { buildQuotationPreviewData } from '../src/components/quotation/quotation-preview.tsx';

const currentVersion = q.versions[0];
// Ensure bathrooms have breakdown parsed
currentVersion.bathrooms = currentVersion.bathrooms.map(b => {
  let bd = b.breakdown;
  if (typeof bd === 'string') {
    try { bd = JSON.parse(bd); } catch {}
  }
  return { ...b, breakdown: bd };
});

const previewData = buildQuotationPreviewData({
  quotation: {
    ...q,
    currentVersion
  },
  settings,
  preparedBy: q.createdBy?.name || 'Syed Sadat'
});

const htmlContent = renderToStaticMarkup(React.createElement(QuotationPreview, { data: previewData }));

const fullHtml = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Quotation ${previewData.quotationNumber}</title>
  <style>
    @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap');
    * {
      box-sizing: border-box;
      margin: 0;
      padding: 0;
    }
    body {
      background: #525659;
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 20px;
      padding: 20px 0;
      font-family: 'Inter', Arial, Helvetica, sans-serif;
      -webkit-font-smoothing: antialiased;
    }
    .pdf-page {
      background: #ffffff;
      box-shadow: 0 4px 12px rgba(0,0,0,0.25);
    }
    @media print {
      body {
        background: transparent;
        padding: 0;
        gap: 0;
      }
      .pdf-page {
        box-shadow: none;
        page-break-after: always;
        break-after: page;
      }
    }
  </style>
</head>
<body>
  ${htmlContent}
</body>
</html>`;

fs.writeFileSync('test-quote.html', fullHtml);
console.log('✅ Generated test-quote.html');

