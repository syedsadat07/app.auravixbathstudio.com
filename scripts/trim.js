const fs = require('fs');
const filePath = 'e:/APP AURAVIX/app.auravixbathstudio.com/src/components/quotation/quotation-preview.tsx';
const content = fs.readFileSync(filePath, 'utf8');
const lines = content.split(/\r?\n/);
console.log('Total lines:', lines.length);
for (let i = 1; i < lines.length; i++) {
  if (lines[i].includes("'use client'")) {
    console.log('Found second use client at line:', i + 1);
    fs.writeFileSync(filePath, lines.slice(0, i).join('\n'));
    console.log('Trimmed to line:', i);
    break;
  }
}

