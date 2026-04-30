'use client';

import { useMemo, useRef, useState } from 'react';
import { AlertTriangle, CheckCircle2, FileSpreadsheet, Upload, X } from 'lucide-react';
import * as XLSX from 'xlsx';
import toast, { Toaster } from 'react-hot-toast';
import { Product } from '@/types';
import { bulkUpsertProducts } from '@/lib/admin-firestore';

const BILLBOOK_HEADERS = ['Name', 'Batch No.', 'Item Code', 'Purchase Price', 'Selling Price', 'Stock Quantity', 'Stock Value', 'Item Category Name', 'MRP'];

type ImportRow = Omit<Product, 'id'> & {
  sourceRow: number;
};

function keyOf(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]/g, '');
}

function readColumn(row: Record<string, unknown>, names: string[]) {
  const entries = Object.entries(row);
  const wanted = names.map(keyOf);
  const match = entries.find(([key]) => wanted.includes(keyOf(key)));
  return match?.[1] ?? '';
}

function parseNumber(value: unknown) {
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
  const cleaned = String(value ?? '').replace(/,/g, '').match(/-?\d+(\.\d+)?/);
  return cleaned ? Number(cleaned[0]) || 0 : 0;
}

function parseCode(value: unknown) {
  if (typeof value === 'number' && Number.isFinite(value)) return Math.trunc(value).toString();
  const text = String(value ?? '').trim();
  if (!text) return '';
  const numeric = Number(text.replace(/,/g, ''));
  if (Number.isFinite(numeric)) return Math.trunc(numeric).toString();
  return text.replace(/[\s\x00-\x1F\x7F]/g, '');
}

function parseUnit(value: unknown) {
  const text = String(value ?? '').toLowerCase();
  if (text.includes('kg')) return 'kg';
  if (text.includes('gm') || text.includes('gram')) return 'gm';
  if (text.includes('ltr') || text.includes('liter') || text.includes('litre')) return 'ltr';
  if (text.includes('ml')) return 'ml';
  if (text.includes('box')) return 'box';
  if (text.includes('pack') || text.includes('pkt')) return 'pack';
  if (text.includes('bottle')) return 'bottle';
  if (text.includes('dozen')) return 'dozen';
  return 'piece';
}

function parseRows(rows: Record<string, unknown>[]) {
  return rows.map((row, index) => {
    const stockValue = readColumn(row, ['Stock Quantity', 'Stock Qty', 'Stock']);
    const unit = parseUnit(stockValue);
    const sellingPrice = parseNumber(readColumn(row, ['Selling Price', 'Sales Price', 'Sale Price']));
    const mrp = parseNumber(readColumn(row, ['MRP']));

    return {
      sourceRow: index + 2,
      name: String(readColumn(row, ['Name', 'Product Name', 'Item Name']) || '').trim(),
      barcode: parseCode(readColumn(row, ['Item Code', 'Barcode', 'Bar Code', 'Code'])) || parseCode(readColumn(row, ['Batch No.', 'Batch No', 'Batch'])),
      price: sellingPrice || mrp,
      mrp: mrp || sellingPrice,
      purchasePrice: parseNumber(readColumn(row, ['Purchase Price', 'Purchase Rate', 'Cost Price'])),
      gstRate: parseNumber(readColumn(row, ['GST', 'GST Rate', 'Tax'])),
      hsnCode: String(readColumn(row, ['HSN', 'HSN Code', 'HSN/SAC']) || '').trim(),
      category: String(readColumn(row, ['Item Category Name', 'Item Category', 'Category']) || 'Essentials').trim() || 'Essentials',
      unit,
      stock: parseNumber(stockValue),
      minStock: 5,
      brand: '',
      isLoose: unit === 'kg' || unit === 'gm',
      isActive: true,
    };
  });
}

function rowsFromSheet(sheet: XLSX.WorkSheet) {
  const table = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: '', raw: true });
  const headerIndex = table.findIndex(row => {
    const keys = row.map(cell => keyOf(String(cell || '')));
    return keys.includes('name') && keys.some(key => key === 'stockquantity' || key === 'stockqty' || key === 'stock');
  });

  if (headerIndex < 0) return [];

  const headers = table[headerIndex].map(cell => String(cell || '').trim());
  return table.slice(headerIndex + 1)
    .filter(row => row.some(cell => String(cell || '').trim()))
    .map(row => Object.fromEntries(headers.map((header, index) => [header || `Column ${index + 1}`, row[index] ?? ''])));
}

export default function BillBookMigratorPage() {
  const fileRef = useRef<HTMLInputElement>(null);
  const [fileName, setFileName] = useState('');
  const [rows, setRows] = useState<ImportRow[]>([]);
  const [uploading, setUploading] = useState(false);

  const validRows = useMemo(() => rows.filter(r => r.name && r.price > 0), [rows]);
  const invalidRows = rows.length - validRows.length;
  const negativeStock = validRows.filter(r => r.stock < 0).length;
  const stockTotal = validRows.reduce((sum, r) => sum + r.stock, 0);

  function downloadTemplate() {
    const data = [
      BILLBOOK_HEADERS,
      ['Amul Milk 1L', '', '8901063011083', '60', '68', '50 PCS', '3000', 'Dairy', '68'],
      ['1TIME GLASS 220 ML', '9.01719E+11', '', '38', '45', '6.0 PCS', '228', 'Plastic', '60'],
    ];
    const sheet = XLSX.utils.aoa_to_sheet(data);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, sheet, 'BillBook Products');
    XLSX.writeFile(workbook, 'BillBook_Product_Migration_Template.xlsx');
  }

  function handleFile(file?: File) {
    if (!file) return;
    if (!/\.(xlsx|xls|csv)$/i.test(file.name)) {
      toast.error('Upload an Excel or CSV sheet');
      return;
    }
    setFileName(file.name);
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const workbook = XLSX.read(reader.result, { type: 'array', cellDates: false });
        const sheet = workbook.Sheets[workbook.SheetNames[0]];
        const parsed = rowsFromSheet(sheet);
        if (parsed.length === 0) {
          toast.error('Could not find BillBook header row');
          return;
        }
        const mapped = parseRows(parsed);
        setRows(mapped);
        toast.success(`${mapped.filter(r => r.name && r.price > 0).length} products ready`);
      } catch {
        toast.error('Could not read BillBook sheet');
      }
    };
    reader.onerror = () => toast.error('Could not read file');
    reader.readAsArrayBuffer(file);
  }

  async function uploadRows() {
    if (validRows.length === 0) {
      toast.error('No valid products to import');
      return;
    }
    setUploading(true);
    try {
      const count = await bulkUpsertProducts(validRows.map(({ sourceRow, ...product }) => product));
      toast.success(`${count} products imported/updated`);
      setRows([]);
      setFileName('');
    } catch {
      toast.error('Migration failed');
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="flex-1 flex flex-col overflow-hidden bg-gray-50">
      <Toaster position="top-right" />
      <div className="bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between flex-shrink-0">
        <div>
          <h1 className="text-lg font-bold text-gray-900">BillBook Migrator</h1>
          <p className="text-xs text-gray-500">Upload your old BillBook stock Excel and migrate products into NSB POS</p>
        </div>
        <button onClick={downloadTemplate} className="flex items-center gap-1.5 px-3 py-2 border border-gray-200 rounded-lg text-sm text-gray-600 hover:bg-gray-50">
          <FileSpreadsheet size={14} /> Download Format
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-6 space-y-5">
        <div
          onClick={() => fileRef.current?.click()}
          onDragOver={e => e.preventDefault()}
          onDrop={e => {
            e.preventDefault();
            handleFile(e.dataTransfer.files[0]);
          }}
          className="bg-white border-2 border-dashed border-saffron-200 rounded-2xl p-8 text-center cursor-pointer hover:bg-saffron-50/40 transition-colors"
        >
          <Upload size={36} className="mx-auto text-saffron-500 mb-3" />
          <p className="font-bold text-gray-900">Upload BillBook Excel Sheet</p>
          <p className="text-sm text-gray-500 mt-1">Supports .xlsx, .xls, and .csv with Name, Item Code, Purchase Price, Selling Price, Stock Quantity, MRP</p>
          {fileName && <p className="text-xs text-saffron-600 font-semibold mt-3">{fileName}</p>}
          <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={e => handleFile(e.target.files?.[0])} />
        </div>

        {rows.length > 0 && (
          <>
            <div className="grid grid-cols-4 gap-3">
              <Stat label="Valid Products" value={validRows.length} />
              <Stat label="Skipped Rows" value={invalidRows} tone={invalidRows ? 'amber' : 'default'} />
              <Stat label="Negative Stock" value={negativeStock} tone={negativeStock ? 'red' : 'default'} />
              <Stat label="Net Stock Qty" value={stockTotal.toFixed(2)} />
            </div>

            {invalidRows > 0 && (
              <div className="flex items-center gap-2 bg-amber-50 border border-amber-100 rounded-xl px-4 py-3 text-sm text-amber-700">
                <AlertTriangle size={16} /> Rows without product name or selling/MRP price will be skipped.
              </div>
            )}

            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
              <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
                <div>
                  <h2 className="font-bold text-gray-900">Migration Preview</h2>
                  <p className="text-xs text-gray-500">Existing products with same barcode/item code will be updated.</p>
                </div>
                <div className="flex gap-2">
                  <button onClick={() => { setRows([]); setFileName(''); }} className="flex items-center gap-1.5 px-3 py-2 border border-gray-200 rounded-lg text-sm text-gray-600 hover:bg-gray-50">
                    <X size={14} /> Clear
                  </button>
                  <button onClick={uploadRows} disabled={uploading || validRows.length === 0} className="flex items-center gap-1.5 px-4 py-2 bg-saffron-400 hover:bg-saffron-500 disabled:bg-gray-200 text-white rounded-lg text-sm font-bold">
                    {uploading ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> : <CheckCircle2 size={15} />}
                    Import {validRows.length}
                  </button>
                </div>
              </div>
              <div className="overflow-x-auto max-h-[460px]">
                <table className="w-full text-xs">
                  <thead className="bg-gray-50 sticky top-0 text-gray-500 uppercase">
                    <tr>
                      {['Row', 'Name', 'Barcode', 'Purchase', 'Selling', 'MRP', 'Stock', 'Unit', 'Category', 'Status'].map(h => (
                        <th key={h} className="text-left px-4 py-2">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50 bg-white">
                    {rows.map(row => {
                      const valid = row.name && row.price > 0;
                      return (
                        <tr key={row.sourceRow} className={!valid ? 'bg-red-50' : row.stock < 0 ? 'bg-amber-50/60' : ''}>
                          <td className="px-4 py-2 font-mono text-gray-400">{row.sourceRow}</td>
                          <td className="px-4 py-2 font-semibold text-gray-800 max-w-xs truncate">{row.name || 'Missing'}</td>
                          <td className="px-4 py-2 font-mono text-gray-500">{row.barcode}</td>
                          <td className="px-4 py-2">{row.purchasePrice ?? 0}</td>
                          <td className="px-4 py-2 text-saffron-600 font-semibold">{row.price}</td>
                          <td className="px-4 py-2">{row.mrp}</td>
                          <td className={`px-4 py-2 font-semibold ${row.stock < 0 ? 'text-red-600' : 'text-green-600'}`}>{row.stock}</td>
                          <td className="px-4 py-2">{row.unit}</td>
                          <td className="px-4 py-2">{row.category}</td>
                          <td className="px-4 py-2">{valid ? 'Ready' : 'Skipped'}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function Stat({ label, value, tone = 'default' }: { label: string; value: number | string; tone?: 'default' | 'amber' | 'red' }) {
  const color = tone === 'red' ? 'text-red-600 bg-red-50' : tone === 'amber' ? 'text-amber-600 bg-amber-50' : 'text-gray-900 bg-white';
  return (
    <div className={`rounded-2xl border border-gray-100 p-4 shadow-sm ${color}`}>
      <p className="text-xs text-gray-500 uppercase font-semibold">{label}</p>
      <p className="text-2xl font-bold mt-1">{value}</p>
    </div>
  );
}
