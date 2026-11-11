const fs = require('fs');
let text = fs.readFileSync('quote-dump.json');
if (text[0] === 0xff && text[1] === 0xfe) {
  text = text.toString('utf16le');
} else {
  text = text.toString('utf8');
}
const parts = text.replace(/^\ufeff/, '').split(/\r?\nSettings:\s*/);
const qPart = parts[0].replace(/^Quotation:\s*/, '').trim();
const q = JSON.parse(qPart);
console.log('Customer:', q.customer.name, q.customer.phone, q.customer.address);
console.log('Bathrooms count:', q.versions[0].bathrooms.length);
q.versions[0].bathrooms.forEach((b, idx) => {
  let bd = b.breakdown;
  if (typeof bd === 'string') {
    try { bd = JSON.parse(bd); } catch {}
  }
  console.log(`Bathroom ${idx+1}: ${b.name} (${b.type}) - ${b.length}x${b.width}x${b.height} ft, floor: ${b.areaSqft} sqft, wall: ${b.wallAreaSqft} sqft`);
  if (bd) {
    console.log('  tiles:', bd.tiles?.map(t => `${t.name} (qty=${t.quantity}, unit=${t.unit}, rate=${t.rate}, amt=${t.amount})`));
    console.log('  fixtures count:', bd.fixtures?.length);
    console.log('  labour count:', bd.labour?.length);
    console.log('  additionalWork count:', bd.additionalWork?.length);
    console.log('  subtotal:', bd.bathroomSubtotal);
  }
});
