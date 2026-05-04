'use client';
import { useState, useEffect, useRef } from 'react';
import { Plus, Search, Download, Upload, Pencil, Trash2, Scale, X, Check, AlertTriangle, FileText } from 'lucide-react';
import Papa from 'papaparse';
import * as XLSX from 'xlsx';
import toast, { Toaster } from 'react-hot-toast';
import { Product, Category, StoreSettings } from '@/types';
import { getAllProducts, adminAddProduct, adminUpdateProduct, adminDeleteProduct, bulkUpsertProducts } from '@/lib/admin-firestore';
import { getCategories } from '@/lib/categories-firestore';
import { createGeneratedBarcode, downloadBarcodeSvg } from '@/lib/barcodes';
import { loadSettings, DEFAULT_SETTINGS } from '@/lib/settings';

const UNITS = ['piece', 'kg', 'gm', 'ltr', 'ml', 'pack', 'dozen', 'box', 'bottle'];
const GST_RATES = [0, 5, 12, 18, 28];

function emptyProduct(categories: Category[]): Omit<Product, 'id'> {
  return {
    name: '', barcode: '', price: 0, mrp: 0, purchasePrice: 0, gstRate: 0, hsnCode: '',
    category: categories[0]?.name || '', unit: 'piece', stock: 0, minStock: 5,
    brand: '', isActive: true, isLoose: false,
  };
}

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

function normalizeBillBookRows(rows: Record<string, unknown>[]) {
  return rows.map(row => {
    const stockValue = readColumn(row, ['Stock Quantity', 'Stock Qty', 'Stock']);
    const unit = parseUnit(stockValue);
    const sellingPrice = parseNumber(readColumn(row, ['Selling Price', 'Sales Price', 'Sale Price']));
    const mrp = parseNumber(readColumn(row, ['MRP']));

    return {
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
  }).filter(r => r.name && r.price > 0);
}

export default function ProductsPage() {
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [search, setSearch] = useState('');
  const [catFilter, setCatFilter] = useState('All');
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<Product | null>(null);
  const [form, setForm] = useState<Omit<Product, 'id'>>(emptyProduct([]));
  const [saving, setSaving] = useState(false);
  const [showBulk, setShowBulk] = useState(false);
  const [bulkRows, setBulkRows] = useState<Omit<Product, 'id'>[]>([]);
  const [bulkSource, setBulkSource] = useState('CSV');
  const [uploading, setUploading] = useState(false);
  const [storeSettings, setStoreSettings] = useState<StoreSettings>(DEFAULT_SETTINGS);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    loadProducts();
    getCategories().then(setCategories);
    loadSettings().then(setStoreSettings).catch(() => {});
  }, []);

  async function loadProducts() {
    try {
      const data = await getAllProducts();
      setProducts(data);
    } catch {
      setProducts([]);
    }
  }

  function openAdd() { setEditing(null); setForm(emptyProduct(categories)); setShowModal(true); }
  function openEdit(p: Product) { setEditing(p); setForm({ ...p }); setShowModal(true); }

  function downloadBarcodeLabel() {
    const barcode = form.barcode?.trim() || createGeneratedBarcode(products);
    if (!/^\d{13}$/.test(barcode)) {
      toast.error('Download supports generated 13-digit barcodes');
      return;
    }
    if (!form.barcode) setForm(f => ({ ...f, barcode }));
    if (!downloadBarcodeSvg(barcode, form.name, storeSettings.storeName, { mrp: form.mrp, sellingPrice: form.price })) {
      toast.error('Could not create barcode');
      return;
    }
    toast.success('Barcode downloaded');
  }

  async function handleSave() {
    if (!form.name || form.price <= 0) { toast.error('Name and price are required'); return; }
    setSaving(true);
    try {
      if (editing) {
        await adminUpdateProduct(editing.id, form);
        toast.success('Product updated');
      } else {
        await adminAddProduct(form);
        toast.success('Product added');
      }
      setShowModal(false);
      loadProducts();
    } catch { toast.error('Save failed'); }
    finally { setSaving(false); }
  }

  async function handleDelete(p: Product) {
    if (!confirm(`Delete "${p.name}"?`)) return;
    try { await adminDeleteProduct(p.id); toast.success('Deleted'); loadProducts(); }
    catch { toast.error('Delete failed'); }
  }

  // ── CSV Export ────────────────────────────────────────────────────────────

  function exportCSV() {
    const rows = [
      ['name', 'barcode', 'price', 'mrp', 'purchasePrice', 'gstRate', 'hsnCode', 'category', 'unit', 'stock', 'minStock', 'brand', 'isLoose', 'isActive'],
      ...products.map(p => [
        p.name, p.barcode || '', p.price, p.mrp, p.purchasePrice ?? 0, p.gstRate, p.hsnCode || '',
        p.category, p.unit, p.stock, p.minStock || 5, p.brand || '',
        p.isLoose ? 'TRUE' : 'FALSE', p.isActive ? 'TRUE' : 'FALSE',
      ]),
    ];
    const csv = rows.map(r => r.map(v => `"${v}"`).join(',')).join('\n');
    const a = document.createElement('a');
    a.href = 'data:text/csv;charset=utf-8,' + encodeURIComponent(csv);
    a.download = 'NSB_Products.csv';
    a.click();
  }

  function downloadTemplate() {
    const rows = [
      ['name', 'barcode', 'price', 'mrp', 'purchasePrice', 'gstRate', 'hsnCode', 'category', 'unit', 'stock', 'minStock', 'brand', 'isLoose', 'isActive'],
      ['Amul Milk 1L', '8901063011083', '68', '68', '60', '5', '0401', 'Dairy', 'ltr', '50', '5', 'Amul', 'FALSE', 'TRUE'],
      ['Onion', 'L001', '35', '35', '28', '0', '0703', 'Loose', 'kg', '100', '10', '', 'TRUE', 'TRUE'],
    ];
    const csv = rows.map(r => r.map(v => `"${v}"`).join(',')).join('\n');
    const a = document.createElement('a');
    a.href = 'data:text/csv;charset=utf-8,' + encodeURIComponent(csv);
    a.download = 'NSB_Products_Template.csv';
    a.click();
  }

  // ── CSV Import / Bulk Upload ──────────────────────────────────────────────

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (/\.(xlsx|xls)$/i.test(file.name)) {
      const reader = new FileReader();
      reader.onload = () => {
        try {
          const workbook = XLSX.read(reader.result, { type: 'array', cellDates: false });
          const sheet = workbook.Sheets[workbook.SheetNames[0]];
          const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: '', raw: true });
          const products = normalizeBillBookRows(rows);
          setBulkRows(products);
          setBulkSource('Old BillBook Excel');
          setShowBulk(true);
          toast.success(`${products.length} products found in Excel`);
        } catch {
          toast.error('Excel parse error');
        }
      };
      reader.onerror = () => toast.error('Could not read Excel file');
      reader.readAsArrayBuffer(file);
      e.target.value = '';
      return;
    }

    Papa.parse(file, {
      header: true, skipEmptyLines: true,
      complete: (result) => {
        const rows = (result.data as Record<string, string>[]).map(row => ({
          name: row.name || '',
          barcode: row.barcode || '',
          price: parseFloat(row.price) || 0,
          mrp: parseFloat(row.mrp) || 0,
          purchasePrice: parseFloat(row.purchasePrice) || 0,
          gstRate: parseFloat(row.gstRate) || 0,
          hsnCode: row.hsnCode || '',
          category: row.category || 'Essentials',
          unit: row.unit || 'piece',
          stock: parseFloat(row.stock) || 0,
          minStock: parseFloat(row.minStock) || 5,
          brand: row.brand || '',
          isLoose: row.isLoose?.toUpperCase() === 'TRUE',
          isActive: row.isActive?.toUpperCase() !== 'FALSE',
        })).filter(r => r.name && r.price > 0);
        setBulkRows(rows);
        setBulkSource('CSV');
        setShowBulk(true);
      },
      error: () => toast.error('CSV parse error'),
    });
    e.target.value = '';
  }

  async function handleBulkUpload() {
    setUploading(true);
    try {
      const count = await bulkUpsertProducts(bulkRows);
      toast.success(`${count} products imported/updated`);
      setShowBulk(false);
      loadProducts();
    } catch { toast.error('Bulk upload failed'); }
    finally { setUploading(false); }
  }

  // ── Filter ────────────────────────────────────────────────────────────────

  const filtered = products.filter(p => {
    const matchCat = catFilter === 'All' || p.category === catFilter;
    const matchSearch = !search ||
      p.name.toLowerCase().includes(search.toLowerCase()) ||
      (p.barcode || '').includes(search) ||
      (p.brand || '').toLowerCase().includes(search.toLowerCase());
    return matchCat && matchSearch;
  });

  const lowStockCount = products.filter(p => p.stock <= (p.minStock || 5)).length;

  return (
    <div className="flex-1 flex flex-col overflow-hidden bg-gray-50">
      <Toaster position="top-right" />

      {/* Header */}
      <div className="bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between flex-shrink-0">
        <div>
          <h1 className="text-lg font-bold text-gray-900">Products</h1>
          <p className="text-xs text-gray-500">{products.length} products &nbsp;·&nbsp;
            {lowStockCount > 0 && <span className="text-amber-600 font-medium">{lowStockCount} low stock</span>}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={downloadTemplate} className="flex items-center gap-1.5 px-3 py-2 border border-gray-200 rounded-lg text-sm text-gray-600 hover:bg-gray-50">
            <FileText size={14} /> Template
          </button>
          <button onClick={exportCSV} className="flex items-center gap-1.5 px-3 py-2 border border-gray-200 rounded-lg text-sm text-gray-600 hover:bg-gray-50">
            <Download size={14} /> Export CSV
          </button>
          <button onClick={() => fileRef.current?.click()} className="flex items-center gap-1.5 px-3 py-2 border border-saffron-200 text-saffron-700 rounded-lg text-sm hover:bg-saffron-50">
            <Upload size={14} /> Import CSV/Excel
          </button>
          <button onClick={openAdd} className="flex items-center gap-1.5 px-4 py-2 bg-saffron-400 hover:bg-saffron-500 text-white rounded-lg text-sm font-semibold">
            <Plus size={14} /> Add Product
          </button>
          <input ref={fileRef} type="file" accept=".csv,.xlsx,.xls" className="hidden" onChange={handleFileChange} />
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white border-b border-gray-100 px-6 py-3 flex items-center gap-3 flex-shrink-0">
        <div className="relative flex-1 max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={14} />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search products…"
            className="w-full pl-8 pr-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:border-saffron-400" />
        </div>
        <div className="flex gap-1.5 overflow-x-auto">
          {['All', ...categories.map(c => c.name)].map(c => (
            <button key={c} onClick={() => setCatFilter(c)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-all ${catFilter === c ? 'bg-saffron-400 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
              {c}
            </button>
          ))}
        </div>
      </div>

      {/* Table */}
      <div className="flex-1 overflow-y-auto">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 sticky top-0 text-xs text-gray-500 uppercase tracking-wide">
            <tr>
              <th className="text-left px-5 py-3">Product</th>
              <th className="text-left px-4 py-3">Category</th>
              <th className="text-right px-4 py-3">Price</th>
              <th className="text-right px-4 py-3">MRP</th>
              <th className="text-right px-4 py-3">GST</th>
              <th className="text-right px-4 py-3">Stock</th>
              <th className="text-center px-4 py-3">Status</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-50">
            {filtered.map(p => {
              const lowStock = p.stock <= (p.minStock || 5);
              const negativeStock = p.stock < 0;
              return (
                <tr key={p.id} className="hover:bg-gray-50 transition-colors">
                  <td className="px-5 py-3">
                    <div className="flex items-center gap-2">
                      {p.isLoose && <Scale size={12} className="text-amber-500 flex-shrink-0" />}
                      <div>
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="font-medium text-gray-900">{p.name}</p>
                          {p.isLoose && (
                            <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-amber-700">
                              Loose
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-gray-400">{p.barcode || 'No barcode'} · {p.brand}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-gray-600">{p.category}</td>
                  <td className="px-4 py-3 text-right font-semibold text-saffron-600">₹{p.price}{p.isLoose ? '/kg' : ''}</td>
                  <td className="px-4 py-3 text-right text-gray-400">₹{p.mrp}</td>
                  <td className="px-4 py-3 text-right text-gray-500">{p.gstRate}%</td>
                  <td className="px-4 py-3 text-right">
                    <span className={`font-medium ${negativeStock ? 'text-red-600' : lowStock ? 'text-red-500' : 'text-green-600'}`}>
                      {p.stock} {p.unit}
                    </span>
                    {negativeStock && <span className="ml-1 text-[10px] font-semibold text-red-600">NEG</span>}
                    {lowStock && <AlertTriangle size={12} className="inline ml-1 text-amber-500" />}
                  </td>
                  <td className="px-4 py-3 text-center">
                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${p.isActive ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                      {p.isActive ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1 justify-end">
                      <button onClick={() => openEdit(p)} className="p-1.5 text-gray-400 hover:text-saffron-500 hover:bg-saffron-50 rounded-lg transition-colors">
                        <Pencil size={14} />
                      </button>
                      <button onClick={() => handleDelete(p)} className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors">
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
            {filtered.length === 0 && (
              <tr><td colSpan={8} className="px-5 py-12 text-center text-gray-300">No products found</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Add/Edit Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={e => e.target === e.currentTarget && setShowModal(false)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg mx-4 max-h-[90vh] flex flex-col">
            <div className="flex items-center justify-between px-6 py-4 border-b">
              <h2 className="font-bold text-gray-900">{editing ? 'Edit Product' : 'Add Product'}</h2>
              <button onClick={() => setShowModal(false)}><X size={18} /></button>
            </div>
            <div className="flex-1 overflow-y-auto p-6 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="col-span-2">
                  <label className="label">Product Name *</label>
                  <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                    className="input" placeholder="e.g. Amul Full Cream Milk 1L" />
                </div>
                <div className="col-span-2">
                  <label className="label">Barcode</label>
                  <div className="flex gap-2">
                    <input value={form.barcode || ''} onChange={e => setForm(f => ({ ...f, barcode: e.target.value }))}
                      className="input flex-1" placeholder="Scan, type, or generate barcode" />
                    <button
                      type="button"
                      onClick={downloadBarcodeLabel}
                      title="Generate and download barcode label"
                      className="h-10 w-10 flex items-center justify-center rounded-xl border border-saffron-200 text-saffron-600 hover:bg-saffron-50 transition-colors"
                    >
                      <Download size={17} />
                    </button>
                  </div>
                  <p className="mt-1 text-[11px] text-gray-400">Use generated barcode for custom products, then print and stick it on the item.</p>
                </div>
                <div>
                  <label className="label">Brand</label>
                  <input value={form.brand || ''} onChange={e => setForm(f => ({ ...f, brand: e.target.value }))}
                    className="input" placeholder="e.g. Amul" />
                </div>
                <div>
                  <label className="label">Selling Price (₹) *</label>
                  <input type="number" value={form.price} onChange={e => setForm(f => ({ ...f, price: parseFloat(e.target.value) || 0 }))}
                    className="input" />
                </div>
                <div>
                  <label className="label">MRP (₹)</label>
                  <input type="number" value={form.mrp} onChange={e => setForm(f => ({ ...f, mrp: parseFloat(e.target.value) || 0 }))}
                    className="input" />
                </div>
                <div>
                  <label className="label" style={{ color: '#9ca3af' }}>Purchase / Cost Price (₹) <span style={{ fontWeight: 400, textTransform: 'none', letterSpacing: 0 }}>— internal only</span></label>
                  <input type="number" value={form.purchasePrice ?? 0} onChange={e => setForm(f => ({ ...f, purchasePrice: parseFloat(e.target.value) || 0 }))}
                    className="input" placeholder="0" style={{ borderColor: '#f3f4f6', background: '#fafafa' }} />
                </div>
                <div>
                  <label className="label">GST Rate</label>
                  <select value={form.gstRate} onChange={e => setForm(f => ({ ...f, gstRate: parseInt(e.target.value) }))} className="input">
                    {GST_RATES.map(r => <option key={r} value={r}>{r}%</option>)}
                  </select>
                </div>
                <div>
                  <label className="label">HSN Code</label>
                  <input value={form.hsnCode || ''} onChange={e => setForm(f => ({ ...f, hsnCode: e.target.value }))}
                    className="input" placeholder="e.g. 0401" />
                </div>
                <div>
                  <label className="label">Category</label>
                  <select value={form.category} onChange={e => setForm(f => ({ ...f, category: e.target.value }))} className="input">
                    {categories.map(c => <option key={c.id} value={c.name}>{c.icon} {c.name}</option>)}
                  </select>
                </div>
                <div>
                  <label className="label">Unit</label>
                  <select value={form.unit} onChange={e => setForm(f => ({ ...f, unit: e.target.value }))} className="input">
                    {UNITS.map(u => <option key={u} value={u}>{u}</option>)}
                  </select>
                </div>
                <div>
                  <label className="label">Current Stock</label>
                  <input type="number" value={form.stock} onChange={e => setForm(f => ({ ...f, stock: parseFloat(e.target.value) || 0 }))}
                    className="input" />
                </div>
                <div>
                  <label className="label">Min Stock Alert</label>
                  <input type="number" value={form.minStock || 5} onChange={e => setForm(f => ({ ...f, minStock: parseInt(e.target.value) || 5 }))}
                    className="input" />
                </div>
              </div>
              <div className="flex gap-6">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" checked={!!form.isLoose} onChange={e => setForm(f => ({ ...f, isLoose: e.target.checked, unit: e.target.checked ? 'kg' : f.unit }))}
                    className="w-4 h-4 accent-saffron-400" />
                  <span className="text-sm text-gray-700 flex items-center gap-1"><Scale size={14} className="text-amber-500" /> Sold by weight (loose)</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" checked={form.isActive} onChange={e => setForm(f => ({ ...f, isActive: e.target.checked }))}
                    className="w-4 h-4 accent-saffron-400" />
                  <span className="text-sm text-gray-700">Active</span>
                </label>
              </div>
            </div>
            <div className="px-6 pb-6 flex gap-3 border-t pt-4">
              <button onClick={() => setShowModal(false)} className="flex-1 py-2.5 border border-gray-200 rounded-xl text-sm text-gray-600 hover:bg-gray-50">Cancel</button>
              <button onClick={handleSave} disabled={saving}
                className="flex-1 py-2.5 bg-saffron-400 hover:bg-saffron-500 disabled:bg-gray-200 text-white font-semibold rounded-xl text-sm flex items-center justify-center gap-2">
                {saving ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> : <Check size={16} />}
                {editing ? 'Update' : 'Add Product'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Bulk Upload Preview */}
      {showBulk && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl mx-4 max-h-[80vh] flex flex-col">
            <div className="flex items-center justify-between px-6 py-4 border-b">
              <div>
                <h2 className="font-bold text-gray-900">Bulk Upload Preview</h2>
                <p className="text-xs text-gray-500">{bulkRows.length} products ready to import from {bulkSource}</p>
              </div>
              <button onClick={() => setShowBulk(false)}><X size={18} /></button>
            </div>
            <div className="flex-1 overflow-y-auto">
              <table className="w-full text-xs">
                <thead className="bg-gray-50 sticky top-0">
                  <tr>
                    {['Name', 'Barcode', 'Purchase', 'Selling', 'MRP', 'GST', 'Category', 'Stock'].map(h => (
                      <th key={h} className="text-left px-4 py-2 text-gray-500 uppercase font-semibold">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {bulkRows.map((r, i) => (
                    <tr key={i} className={r.name && r.price > 0 ? '' : 'bg-red-50'}>
                      <td className="px-4 py-2 font-medium">{r.name || <span className="text-red-500">Missing</span>}</td>
                      <td className="px-4 py-2 text-gray-500 font-mono">{r.barcode}</td>
                      <td className="px-4 py-2 text-gray-500">₹{r.purchasePrice ?? 0}</td>
                      <td className="px-4 py-2 text-saffron-600">₹{r.price}</td>
                      <td className="px-4 py-2 text-gray-500">₹{r.mrp}</td>
                      <td className="px-4 py-2">{r.gstRate}%</td>
                      <td className="px-4 py-2">{r.category}</td>
                      <td className="px-4 py-2">{r.stock} {r.unit}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="px-6 py-4 border-t flex gap-3">
              <button onClick={() => setShowBulk(false)} className="flex-1 py-2.5 border border-gray-200 rounded-xl text-sm text-gray-600">Cancel</button>
              <button onClick={handleBulkUpload} disabled={uploading}
                className="flex-1 py-2.5 bg-saffron-400 hover:bg-saffron-500 text-white font-bold rounded-xl text-sm flex items-center justify-center gap-2">
                {uploading ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> : <Upload size={16} />}
                Upload {bulkRows.length} Products
              </button>
            </div>
          </div>
        </div>
      )}

      <style>{`.label{display:block;font-size:11px;font-weight:600;color:#6b7280;margin-bottom:4px;text-transform:uppercase;letter-spacing:.04em}.input{width:100%;padding:8px 12px;border:1.5px solid #e5e7eb;border-radius:10px;font-size:13px;outline:none;transition:border-color .15s}.input:focus{border-color:#ff9933}`}</style>
    </div>
  );
}
