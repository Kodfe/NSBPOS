import { Product } from '@/types';

const EAN_LEFT_ODD: Record<string, string> = {
  '0': '0001101', '1': '0011001', '2': '0010011', '3': '0111101', '4': '0100011',
  '5': '0110001', '6': '0101111', '7': '0111011', '8': '0110111', '9': '0001011',
};
const EAN_LEFT_EVEN: Record<string, string> = {
  '0': '0100111', '1': '0110011', '2': '0011011', '3': '0100001', '4': '0011101',
  '5': '0111001', '6': '0000101', '7': '0010001', '8': '0001001', '9': '0010111',
};
const EAN_RIGHT: Record<string, string> = {
  '0': '1110010', '1': '1100110', '2': '1101100', '3': '1000010', '4': '1011100',
  '5': '1001110', '6': '1010000', '7': '1000100', '8': '1001000', '9': '1110100',
};
const EAN_PARITY: Record<string, string> = {
  '0': 'LLLLLL', '1': 'LLGLGG', '2': 'LLGGLG', '3': 'LLGGGL', '4': 'LGLLGG',
  '5': 'LGGLLG', '6': 'LGGGLL', '7': 'LGLGLG', '8': 'LGLGGL', '9': 'LGGLGL',
};

function ean13Checksum(first12Digits: string) {
  const sum = first12Digits.split('').reduce((total, digit, index) => {
    const value = Number(digit);
    return total + value * (index % 2 === 0 ? 1 : 3);
  }, 0);
  return String((10 - (sum % 10)) % 10);
}

function buildEan13Bits(code: string) {
  if (!/^\d{13}$/.test(code)) return '';
  const first = code[0];
  const parity = EAN_PARITY[first];
  const left = code.slice(1, 7).split('').map((digit, index) =>
    parity[index] === 'L' ? EAN_LEFT_ODD[digit] : EAN_LEFT_EVEN[digit]
  ).join('');
  const right = code.slice(7).split('').map(digit => EAN_RIGHT[digit]).join('');
  return `101${left}01010${right}101`;
}

export function createGeneratedBarcode(existingProducts: Pick<Product, 'barcode'>[]) {
  const existing = new Set(existingProducts.map(product => product.barcode).filter(Boolean));
  for (let i = 0; i < 20; i += 1) {
    const seed = `${Date.now().toString().slice(-8)}${Math.floor(Math.random() * 100).toString().padStart(2, '0')}`;
    const first12 = `29${seed}`.slice(0, 12);
    const barcode = `${first12}${ean13Checksum(first12)}`;
    if (!existing.has(barcode)) return barcode;
  }
  const fallback = `29${Math.floor(Math.random() * 10_000_000_000).toString().padStart(10, '0')}`;
  return `${fallback}${ean13Checksum(fallback)}`;
}

export function barcodeLabelSvg(barcode: string, productName: string) {
  const bits = buildEan13Bits(barcode);
  if (!bits) return '';
  const moduleWidth = 2;
  const xStart = 24;
  const barTop = 34;
  const barHeight = 82;
  const guardHeight = 94;
  const width = xStart * 2 + bits.length * moduleWidth;
  const height = 164;
  const label = (productName || 'NSB Product').replace(/[<>&"]/g, char => ({
    '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;',
  })[char] || char);

  const bars = bits.split('').map((bit, index) => {
    if (bit !== '1') return '';
    const isGuard = index < 3 || (index >= 45 && index < 50) || index >= 92;
    const x = xStart + index * moduleWidth;
    return `<rect x="${x}" y="${barTop}" width="${moduleWidth}" height="${isGuard ? guardHeight : barHeight}" fill="#111827" />`;
  }).join('');

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <rect width="100%" height="100%" fill="#ffffff"/>
  <text x="${width / 2}" y="20" text-anchor="middle" font-family="Arial, sans-serif" font-size="12" font-weight="700" fill="#111827">${label}</text>
  ${bars}
  <text x="${width / 2}" y="148" text-anchor="middle" font-family="Consolas, monospace" font-size="18" letter-spacing="2" fill="#111827">${barcode}</text>
</svg>`;
}

export function downloadBarcodeSvg(barcode: string, productName: string) {
  const svg = barcodeLabelSvg(barcode, productName);
  if (!svg) return false;
  const blob = new Blob([svg], { type: 'image/svg+xml;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const safeName = (productName || 'product').replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '').slice(0, 40) || 'product';
  const a = document.createElement('a');
  a.href = url;
  a.download = `${safeName}-${barcode}-barcode.svg`;
  a.click();
  URL.revokeObjectURL(url);
  return true;
}
