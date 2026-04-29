'use client';
import { useState, useEffect, useRef } from 'react';
import { Plus, Pencil, Trash2, X, Check, Eye, Building2, FileText, ShoppingCart, RotateCcw, FileMinus, Download, IndianRupee, Search, ScanBarcode, Package, Keyboard } from 'lucide-react';
import toast, { Toaster } from 'react-hot-toast';
import { format } from 'date-fns';
import { Party, PurchaseBill, PurchaseItem, PurchaseOrder, PurchaseReturn, DebitNote, Product, Category, StoreSettings } from '@/types';
import { formatCurrency, normalizeBarcode } from '@/lib/utils';
import { getAllProducts, adminAddProduct, adminUpdateProduct } from '@/lib/admin-firestore';
import { getCategories } from '@/lib/categories-firestore';
import { loadSettings, DEFAULT_SETTINGS } from '@/lib/settings';
import {
  getParties, createParty, updateParty, deleteParty,
  getPurchaseBills, createPurchaseBill, updatePurchaseBill, deletePurchaseBill,
  getPurchaseOrders, createPurchaseOrder, updatePurchaseOrder,
  getPurchaseReturns, createPurchaseReturn,
  getDebitNotes, createDebitNote,
  generatePurchaseNumber,
} from '@/lib/purchases-firestore';

type Tab = 'parties' | 'bills' | 'orders' | 'returns' | 'debit';
type BillDateFilter = 'all' | 'today' | 'yesterday' | '7days' | '30days' | 'custom';

const TABS: { key: Tab; label: string; icon: React.ReactNode }[] = [
  { key: 'parties', label: 'Parties', icon: <Building2 size={14} /> },
  { key: 'bills', label: 'Purchase Bills', icon: <FileText size={14} /> },
  { key: 'orders', label: 'Purchase Orders', icon: <ShoppingCart size={14} /> },
  { key: 'returns', label: 'Purchase Returns', icon: <RotateCcw size={14} /> },
  { key: 'debit', label: 'Debit Notes', icon: <FileMinus size={14} /> },
];

const GST_RATES = [0, 5, 12, 18, 28];
const UNITS = ['piece', 'kg', 'gm', 'ltr', 'ml', 'pack', 'dozen', 'box', 'bottle'];

function emptyItem(): PurchaseItem {
  return { productId: '', productName: '', quantity: 1, unit: 'piece', purchaseRate: 0, sellingPrice: 0, mrp: 0, discountAmount: 0, gstRate: 5, gstAmount: 0, total: 0 };
}

function calcItem(item: PurchaseItem): PurchaseItem {
  const base = item.purchaseRate * item.quantity;
  const flatDiscount = item.discountAmount ?? 0;
  const taxable = Math.max(0, base - flatDiscount);
  const gstAmt = taxable * item.gstRate / 100;
  return { ...item, gstAmount: gstAmt, total: taxable + gstAmt };
}

function productToPurchaseItem(product: Product, quantity = 1): PurchaseItem {
  return calcItem({
    productId: product.id,
    productName: product.name,
    hsnCode: product.hsnCode,
    quantity,
    unit: product.unit || 'piece',
    purchaseRate: product.purchasePrice ?? product.price ?? 0,
    sellingPrice: product.price ?? product.mrp ?? 0,
    mrp: product.mrp ?? product.price ?? 0,
    discountAmount: 0,
    gstRate: product.gstRate ?? 0,
    gstAmount: 0,
    total: 0,
  });
}

function emptyProductForm(categories: Category[], seed?: Partial<Product>): Omit<Product, 'id'> {
  return {
    name: seed?.name ?? '',
    barcode: seed?.barcode ?? '',
    price: seed?.price ?? 0,
    mrp: seed?.mrp ?? 0,
    purchasePrice: seed?.purchasePrice ?? 0,
    gstRate: seed?.gstRate ?? 0,
    hsnCode: seed?.hsnCode ?? '',
    category: seed?.category ?? categories[0]?.name ?? '',
    unit: seed?.unit ?? 'piece',
    stock: seed?.stock ?? 0,
    minStock: seed?.minStock ?? 5,
    brand: seed?.brand ?? '',
    isActive: true,
    isLoose: seed?.isLoose ?? false,
  };
}

function billStatus(total: number, paid: number): PurchaseBill['status'] {
  if (paid <= 0) return 'draft';
  if (paid >= total) return 'paid';
  return 'partial';
}

function StatusBadge({ status }: { status: string }) {
  const cls: Record<string, string> = {
    draft: 'bg-gray-100 text-gray-600',
    received: 'bg-blue-100 text-blue-700',
    partial: 'bg-amber-100 text-amber-700',
    paid: 'bg-green-100 text-green-700',
    pending: 'bg-amber-100 text-amber-700',
    cancelled: 'bg-red-100 text-red-700',
    sent: 'bg-blue-100 text-blue-700',
    confirmed: 'bg-green-100 text-green-700',
  };
  return <span className={`px-2 py-0.5 rounded-full text-xs font-medium capitalize ${cls[status] ?? 'bg-gray-100 text-gray-600'}`}>{status}</span>;
}

function Label({ children }: { children: React.ReactNode }) {
  return <label className="block text-[11px] font-semibold text-gray-500 uppercase tracking-wide mb-1">{children}</label>;
}

// ── Parties Tab ───────────────────────────────────────────────────────────────

const EMPTY_PARTY = { name: '', phone: '', email: '', address: '', gstin: '', contactPerson: '', openingBalance: 0 };

function PartiesTab() {
  const [parties, setParties] = useState<Party[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<Party | null>(null);
  const [form, setForm] = useState(EMPTY_PARTY);
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState('');

  useEffect(() => { load(); }, []);

  async function load() {
    setLoading(true);
    try { setParties(await getParties()); }
    catch { toast.error('Failed to load parties'); setParties([]); }
    finally { setLoading(false); }
  }

  function openAdd() { setEditing(null); setForm(EMPTY_PARTY); setShowModal(true); }
  function openEdit(p: Party) { setEditing(p); setForm({ name: p.name, phone: p.phone ?? '', email: p.email ?? '', address: p.address ?? '', gstin: p.gstin ?? '', contactPerson: p.contactPerson ?? '', openingBalance: p.openingBalance ?? 0 }); setShowModal(true); }

  async function handleSave() {
    if (!form.name.trim()) { toast.error('Party name is required'); return; }
    setSaving(true);
    try {
      const data = { name: form.name, phone: form.phone || undefined, email: form.email || undefined, address: form.address || undefined, gstin: form.gstin || undefined, contactPerson: form.contactPerson || undefined, openingBalance: form.openingBalance };
      if (editing) { await updateParty(editing.id, data); toast.success('Party updated'); }
      else { await createParty({ ...data, currentBalance: form.openingBalance }); toast.success('Party added'); }
      setShowModal(false); load();
    } catch (err: any) { toast.error(`Save failed: ${err?.message ?? 'Check connection'}`); }
    finally { setSaving(false); }
  }

  async function handleDelete(p: Party) {
    if (!confirm(`Delete party "${p.name}"?`)) return;
    try { await deleteParty(p.id); toast.success('Deleted'); load(); }
    catch (err: any) { toast.error(`Delete failed: ${err?.message ?? ''}`); }
  }

  const filteredParties = parties.filter(p => {
    const term = search.trim().toLowerCase();
    if (!term) return true;
    return p.name.toLowerCase().includes(term) ||
      (p.phone ?? '').includes(search.trim()) ||
      (p.gstin ?? '').toLowerCase().includes(term) ||
      (p.contactPerson ?? '').toLowerCase().includes(term);
  });

  return (
    <>
      <div className="flex items-center justify-between mb-4 gap-3">
        <p className="text-sm text-gray-500">{parties.length} parties / vendors</p>
        <div className="relative flex-1 max-w-sm">
          <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={14} />
          <input value={search} onChange={e => setSearch(e.target.value)} className="input" style={{ paddingLeft: 34 }} placeholder="Search party, phone or GSTIN" />
        </div>
        <button onClick={openAdd} className="flex items-center gap-1.5 px-4 py-2 bg-saffron-400 hover:bg-saffron-500 text-white font-semibold rounded-xl text-sm transition-colors">
          <Plus size={14} /> Add Party
        </button>
      </div>
      {loading ? (
        <div className="text-center py-12 text-gray-400 text-sm">Loading…</div>
      ) : parties.length === 0 ? (
        <div className="flex flex-col items-center py-16 gap-3"><Building2 size={40} className="text-gray-200" /><p className="text-gray-400 text-sm">No parties yet</p></div>
      ) : filteredParties.length === 0 ? (
        <div className="flex flex-col items-center py-16 gap-3"><Search size={36} className="text-gray-200" /><p className="text-gray-400 text-sm">No parties match your search</p></div>
      ) : (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-xs text-gray-500 uppercase tracking-wide">
              <tr>
                <th className="text-left px-5 py-3">Name</th>
                <th className="text-left px-4 py-3">Phone</th>
                <th className="text-left px-4 py-3">GSTIN</th>
                <th className="text-right px-4 py-3">Balance</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {filteredParties.map(p => (
                <tr key={p.id} className="hover:bg-gray-50">
                  <td className="px-5 py-3">
                    <p className="font-medium text-gray-900">{p.name}</p>
                    {p.contactPerson && <p className="text-xs text-gray-400">Contact: {p.contactPerson}</p>}
                  </td>
                  <td className="px-4 py-3 text-gray-600">{p.phone ?? '—'}</td>
                  <td className="px-4 py-3 text-gray-500 font-mono text-xs">{p.gstin ?? '—'}</td>
                  <td className="px-4 py-3 text-right">
                    <span className={`font-semibold ${(p.currentBalance ?? 0) > 0 ? 'text-red-600' : 'text-gray-500'}`}>
                      {formatCurrency(p.currentBalance ?? 0)}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1 justify-end">
                      <button onClick={() => openEdit(p)} className="p-1.5 text-gray-400 hover:text-saffron-500 hover:bg-saffron-50 rounded-lg transition-colors"><Pencil size={13} /></button>
                      <button onClick={() => handleDelete(p)} className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"><Trash2 size={13} /></button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={e => e.target === e.currentTarget && setShowModal(false)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg mx-4 max-h-[90vh] flex flex-col">
            <div className="flex items-center justify-between px-6 py-4 border-b">
              <h2 className="font-bold text-gray-900">{editing ? 'Edit Party' : 'Add Party'}</h2>
              <button onClick={() => setShowModal(false)}><X size={18} className="text-gray-400" /></button>
            </div>
            <div className="flex-1 overflow-y-auto p-6 space-y-4">
              <div><label className="label">Party / Company Name *</label><input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} className="input" placeholder="e.g. Gopal Traders" /></div>
              <div className="grid grid-cols-2 gap-4">
                <div><label className="label">Phone</label><input value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} className="input" placeholder="Optional" /></div>
                <div><label className="label">Email</label><input value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} className="input" placeholder="Optional" /></div>
              </div>
              <div><label className="label">Address</label><input value={form.address} onChange={e => setForm(f => ({ ...f, address: e.target.value }))} className="input" placeholder="Optional" /></div>
              <div className="grid grid-cols-2 gap-4">
                <div><label className="label">GSTIN</label><input value={form.gstin} onChange={e => setForm(f => ({ ...f, gstin: e.target.value }))} className="input" placeholder="Optional" /></div>
                <div><label className="label">Contact Person</label><input value={form.contactPerson} onChange={e => setForm(f => ({ ...f, contactPerson: e.target.value }))} className="input" placeholder="Optional" /></div>
              </div>
              {!editing && <div><label className="label">Opening Balance (₹)</label><input type="number" value={form.openingBalance} onChange={e => setForm(f => ({ ...f, openingBalance: parseFloat(e.target.value) || 0 }))} className="input" placeholder="0" min="0" /></div>}
            </div>
            <div className="px-6 pb-6 flex gap-3 border-t pt-4">
              <button onClick={() => setShowModal(false)} className="flex-1 py-2.5 border border-gray-200 rounded-xl text-sm text-gray-600 hover:bg-gray-50">Cancel</button>
              <button onClick={handleSave} disabled={saving} className="flex-1 py-2.5 bg-saffron-400 hover:bg-saffron-500 disabled:bg-gray-200 text-white font-semibold rounded-xl text-sm flex items-center justify-center gap-2 transition-colors">
                {saving ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> : <Check size={16} />}
                {editing ? 'Update' : 'Add Party'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

// ── Purchase Bills Tab ────────────────────────────────────────────────────────

function printPurchaseBill(bill: PurchaseBill, party?: Party, settings: StoreSettings = DEFAULT_SETTINGS) {
  const win = window.open('', '_blank');
  if (!win) { toast.error('Allow popups to download / print'); return; }
  const buyerAddress = [settings.address, [settings.city, settings.pincode].filter(Boolean).join(' - ')].filter(Boolean).join('<br/>');
  const sellerAddress = [party?.address, party?.phone ? `Phone: ${party.phone}` : '', party?.gstin ? `GSTIN: ${party.gstin}` : ''].filter(Boolean).join('<br/>');
  const rows = bill.items.map((it, i) => `
    <tr>
      <td>${i + 1}</td><td>${it.productName}</td>
      <td align="right">${it.quantity} ${it.unit}</td>
      <td align="right">₹${(it.mrp ?? 0).toFixed(2)}</td>
      <td align="right">₹${it.purchaseRate.toFixed(2)}</td>
      <td align="right">₹${(it.gstAmount / 2).toFixed(2)}</td>
      <td align="right">₹${(it.gstAmount / 2).toFixed(2)}</td>
      <td align="right">₹${it.total.toFixed(2)}</td>
    </tr>`).join('');
  const fmt = (d: Date | string | undefined) => d ? new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';
  win.document.write(`<!DOCTYPE html><html><head><title>Bill — ${bill.purchaseNumber}</title>
<style>
body{font-family:Arial,sans-serif;padding:32px;max-width:700px;margin:0 auto;color:#1f2937}
h2{color:#ff9933;margin:0 0 2px;font-size:22px}
hr{border:none;border-top:1px solid #e5e7eb;margin:14px 0}
table{width:100%;border-collapse:collapse;margin:12px 0}
th{background:#f9fafb;font-size:11px;text-transform:uppercase;letter-spacing:.05em;padding:8px 10px;border-bottom:2px solid #e5e7eb;text-align:left}
td{padding:8px 10px;border-bottom:1px solid #f3f4f6;font-size:13px}
.tot td{border:none;padding:3px 10px;font-size:13px}
.grand td{font-weight:700;font-size:14px;border-top:2px solid #374151;padding-top:8px}
.btn{padding:9px 22px;background:#ff9933;color:#fff;border:none;border-radius:8px;cursor:pointer;font-size:14px;margin-top:20px}
@media print{.no-print{display:none}}
</style></head><body>
<div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:4px">
  <div><h2>PURCHASE BILL</h2><p style="margin:0;font-size:13px;color:#6b7280">${bill.purchaseNumber}</p></div>
  <div style="text-align:right;font-size:12px;color:#6b7280;line-height:2">
    <div>Date: <strong>${fmt(bill.createdAt)}</strong></div>
    ${bill.invoiceNumber ? `<div>Vendor Invoice: <strong>${bill.invoiceNumber}</strong></div>` : ''}
    ${bill.invoiceDate ? `<div>Invoice Date: <strong>${fmt(bill.invoiceDate)}</strong></div>` : ''}
  </div>
</div>
<hr/>
<div style="display:grid;grid-template-columns:1fr 1fr;gap:14px;margin:0 0 14px;font-size:13px">
  <div style="border:1px solid #e5e7eb;border-radius:8px;padding:10px">
    <div style="font-size:10px;text-transform:uppercase;color:#6b7280;font-weight:700;margin-bottom:4px">Purchased From</div>
    <strong>${bill.partyName}</strong>
    ${sellerAddress ? `<div style="margin-top:4px;color:#4b5563;line-height:1.55">${sellerAddress}</div>` : ''}
  </div>
  <div style="border:1px solid #e5e7eb;border-radius:8px;padding:10px">
    <div style="font-size:10px;text-transform:uppercase;color:#6b7280;font-weight:700;margin-bottom:4px">Purchased By</div>
    <strong>${settings.storeName}</strong>
    ${buyerAddress ? `<div style="margin-top:4px;color:#4b5563;line-height:1.55">${buyerAddress}</div>` : ''}
    ${(settings.phone1 || settings.phone2) ? `<div style="color:#4b5563">Phone: ${[settings.phone1, settings.phone2].filter(Boolean).join(', ')}</div>` : ''}
    ${settings.gstin ? `<div style="color:#4b5563">GSTIN: ${settings.gstin}</div>` : ''}
  </div>
</div>
<table>
  <thead><tr><th>#</th><th>Product</th><th align="right">Qty</th><th align="right">MRP</th><th align="right">Purchase Price</th><th align="right">CGST</th><th align="right">SGST</th><th align="right">Amount</th></tr></thead>
  <tbody>${rows}</tbody>
</table>
<table style="margin-left:auto;width:260px" class="tot">
  <tr><td>Subtotal</td><td align="right">₹${bill.subtotal.toFixed(2)}</td></tr>
  <tr><td>Total Discount</td><td align="right">- ₹${(bill.totalDiscount ?? 0).toFixed(2)}</td></tr>
  <tr><td>Total GST</td><td align="right">₹${bill.totalGst.toFixed(2)}</td></tr>
  <tr><td>CGST</td><td align="right">₹${(bill.totalGst / 2).toFixed(2)}</td></tr>
  <tr><td>SGST</td><td align="right">₹${(bill.totalGst / 2).toFixed(2)}</td></tr>
  <tr class="grand"><td>Grand Total</td><td align="right">₹${bill.total.toFixed(2)}</td></tr>
  ${bill.amountPaid > 0 ? `<tr><td style="color:#16a34a">Paid</td><td align="right" style="color:#16a34a">₹${bill.amountPaid.toFixed(2)}</td></tr>` : ''}
  ${bill.balance > 0 ? `<tr><td style="color:#dc2626">Balance Due</td><td align="right" style="color:#dc2626">₹${bill.balance.toFixed(2)}</td></tr>` : ''}
</table>
${bill.notes ? `<p style="margin-top:14px;font-size:12px;color:#6b7280;border-top:1px solid #e5e7eb;padding-top:12px"><strong>Notes:</strong> ${bill.notes}</p>` : ''}
<p style="margin-top:28px;font-size:11px;color:#9ca3af">Generated by NSB POS · ${new Date().toLocaleDateString('en-IN')}</p>
<div class="no-print"><button class="btn" onclick="window.print()">Print / Save as PDF</button></div>
<script>setTimeout(function(){window.print()},350)</script>
</body></html>`);
  win.document.close();
}

function PurchaseBillsTab({ parties }: { parties: Party[] }) {
  const [bills, setBills] = useState<PurchaseBill[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [viewBill, setViewBill] = useState<PurchaseBill | null>(null);
  const [showAdminHelp, setShowAdminHelp] = useState(false);
  const [saving, setSaving] = useState(false);
  const [payBill, setPayBill] = useState<PurchaseBill | null>(null);
  const [payAmount, setPayAmount] = useState('');
  const [payMethod, setPayMethod] = useState<'cash' | 'upi' | 'card' | 'credit'>('cash');
  const [paying, setPaying] = useState(false);
  const [billSearch, setBillSearch] = useState('');
  const [billDateFilter, setBillDateFilter] = useState<BillDateFilter>('all');
  const [customFrom, setCustomFrom] = useState('');
  const [customTo, setCustomTo] = useState('');
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [storeSettings, setStoreSettings] = useState<StoreSettings>(DEFAULT_SETTINGS);
  const [productSearch, setProductSearch] = useState('');
  const [showProductModal, setShowProductModal] = useState(false);
  const [productForm, setProductForm] = useState<Omit<Product, 'id'>>(emptyProductForm([]));
  const [addingProduct, setAddingProduct] = useState(false);

  const [partyId, setPartyId] = useState('');
  const [invoiceNumber, setInvoiceNumber] = useState('');
  const [invoiceDate, setInvoiceDate] = useState('');
  const [paymentTermsDays, setPaymentTermsDays] = useState('30');
  const [dueDate, setDueDate] = useState('');
  const [totalDiscountExclTax, setTotalDiscountExclTax] = useState('');
  const [billDiscount, setBillDiscount] = useState('');
  const [amountPaid, setAmountPaid] = useState('');
  const [paymentMethod, setPaymentMethod] = useState<PurchaseBill['paymentMethod']>('cash');
  const [notes, setNotes] = useState('');
  const [items, setItems] = useState<PurchaseItem[]>([emptyItem()]);
  const itemProductRefs = useRef<Array<HTMLInputElement | null>>([]);

  useEffect(() => { load(); }, []);

  useEffect(() => {
    getAllProducts().then(setProducts).catch(() => setProducts([]));
    getCategories().then(setCategories).catch(() => setCategories([]));
    loadSettings().then(setStoreSettings).catch(() => {});
  }, []);

  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (!showModal) return;
      if (e.key === 'F1' || (e.key === '?' && !(e.target instanceof HTMLInputElement) && !(e.target instanceof HTMLTextAreaElement))) {
        e.preventDefault();
        setShowAdminHelp(true);
      }
      if (e.key === 'Escape') setShowAdminHelp(false);
    }
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [showModal]);

  async function load() {
    setLoading(true);
    try { setBills(await getPurchaseBills()); }
    catch { toast.error('Failed to load purchase bills'); setBills([]); }
    finally { setLoading(false); }
  }

  function openAdd() {
    setPartyId(parties[0]?.id ?? '');
    const today = new Date();
    const due = new Date(today);
    due.setDate(due.getDate() + 30);
    setInvoiceNumber('');
    setInvoiceDate(today.toISOString().split('T')[0]);
    setPaymentTermsDays('30');
    setDueDate(due.toISOString().split('T')[0]);
    setTotalDiscountExclTax('');
    setBillDiscount('');
    setAmountPaid('');
    setNotes('');
    setPaymentMethod('cash');
    setItems([]);
    setProductSearch('');
    setShowModal(true);
  }

  function updateItem(idx: number, patch: Partial<PurchaseItem>) {
    setItems(prev => prev.map((it, i) => i === idx ? calcItem({ ...it, ...patch }) : it));
  }
  function addItem(product?: Product) {
    setItems(prev => [...prev, product ? productToPurchaseItem(product) : emptyItem()]);
    setProductSearch('');
  }
  function addBlankItemAndFocus() {
    const nextIndex = items.length;
    addItem();
    setTimeout(() => itemProductRefs.current[nextIndex]?.focus(), 0);
  }
  function handleItemTab(e: React.KeyboardEvent<HTMLInputElement>, idx: number) {
    if (e.key !== 'Tab' || e.shiftKey || idx !== items.length - 1) return;
    e.preventDefault();
    addBlankItemAndFocus();
  }
  function removeItem(idx: number) {
    setItems(prev => prev.filter((_, i) => i !== idx));
  }

  function findProductByBarcode(value: string) {
    const barcode = normalizeBarcode(value);
    return products.find(p => normalizeBarcode(p.barcode) === barcode);
  }

  function handleProductEntry(value = productSearch) {
    const term = value.trim();
    const barcode = normalizeBarcode(term);
    if (!term) return;
    const product = findProductByBarcode(barcode) ??
      products.find(p => p.name.toLowerCase() === term.toLowerCase());
    if (!product) {
      const looksLikeBarcode = /^\d{4,}$/.test(barcode);
      setProductForm(emptyProductForm(categories, looksLikeBarcode ? { barcode } : { name: term }));
      setShowProductModal(true);
      toast.error(`${term} not found. Add it as a product.`);
      return;
    }
    addItem(product);
    toast.success(`Added ${product.name}`);
  }

  function openProductModal(seed?: Partial<Product>) {
    setProductForm(emptyProductForm(categories, seed));
    setShowProductModal(true);
  }

  async function handleCreateProduct() {
    if (!productForm.name.trim()) { toast.error('Product name is required'); return; }
    if (productForm.price <= 0 && (productForm.purchasePrice ?? 0) <= 0) { toast.error('Enter selling or purchase price'); return; }
    setAddingProduct(true);
    try {
      const id = await adminAddProduct({
        ...productForm,
        barcode: normalizeBarcode(productForm.barcode),
        price: productForm.price || productForm.mrp || productForm.purchasePrice || 0,
        mrp: productForm.mrp || productForm.price || productForm.purchasePrice || 0,
        purchasePrice: productForm.purchasePrice || productForm.price || 0,
        stock: 0,
      });
      const product: Product = {
        id,
        ...productForm,
        barcode: normalizeBarcode(productForm.barcode),
        price: productForm.price || productForm.mrp || productForm.purchasePrice || 0,
        mrp: productForm.mrp || productForm.price || productForm.purchasePrice || 0,
        purchasePrice: productForm.purchasePrice || productForm.price || 0,
        stock: 0,
      };
      setProducts(prev => [...prev, product].sort((a, b) => a.name.localeCompare(b.name)));
      addItem(product);
      if (productForm.stock > 1) {
        setItems(prev => prev.map((item, index) => index === prev.length - 1 ? calcItem({ ...item, quantity: productForm.stock }) : item));
      }
      setShowProductModal(false);
      toast.success('Product added to purchase bill');
    } catch (err: any) { toast.error(`Product save failed: ${err?.message ?? 'Check connection'}`); }
    finally { setAddingProduct(false); }
  }

  async function applyPurchaseToProducts(validItems: PurchaseItem[]) {
    for (const item of validItems) {
      const existing = item.productId ? products.find(p => p.id === item.productId) : undefined;
      const byName = products.find(p => p.name.toLowerCase() === item.productName.toLowerCase());
      const product = existing ?? byName;
      if (product) {
        await adminUpdateProduct(product.id, {
          stock: (product.stock ?? 0) + item.quantity,
          purchasePrice: item.purchaseRate,
          mrp: item.mrp || product.mrp,
          price: item.sellingPrice || product.price || item.mrp || item.purchaseRate,
          gstRate: item.gstRate,
          hsnCode: item.hsnCode || product.hsnCode,
          unit: item.unit || product.unit,
        });
      } else {
        await adminAddProduct({
          name: item.productName,
          barcode: '',
          price: item.sellingPrice || item.mrp || item.purchaseRate,
          mrp: item.mrp || item.purchaseRate,
          purchasePrice: item.purchaseRate,
          gstRate: item.gstRate,
          hsnCode: item.hsnCode || '',
          category: categories[0]?.name || 'Essentials',
          unit: item.unit || 'piece',
          stock: item.quantity,
          minStock: 5,
          brand: '',
          isActive: true,
          isLoose: item.unit === 'kg',
        });
      }
    }
  }

  const subtotal = items.reduce((s, it) => s + it.purchaseRate * it.quantity, 0);
  const itemDiscount = items.reduce((s, it) => {
    return s + (it.discountAmount ?? 0);
  }, 0);
  const totalDiscountExclTaxAmount = Math.max(0, parseFloat(totalDiscountExclTax) || 0);
  const totalGst = items.reduce((s, it) => s + it.gstAmount, 0);
  const totalBeforeBillDiscount = Math.max(0, items.reduce((s, it) => s + it.total, 0) - totalDiscountExclTaxAmount);
  const getBillDiscountAmount = (value: string, baseAmount: number) => {
    const trimmed = value.trim();
    if (!trimmed) return 0;
    if (trimmed.endsWith('%')) {
      return Math.max(0, baseAmount * ((parseFloat(trimmed.slice(0, -1)) || 0) / 100));
    }
    return Math.max(0, parseFloat(trimmed) || 0);
  };
  const billDiscountAmount = getBillDiscountAmount(billDiscount, totalBeforeBillDiscount);
  const totalDiscount = itemDiscount + totalDiscountExclTaxAmount + billDiscountAmount;
  const total = Math.max(0, totalBeforeBillDiscount - billDiscountAmount);
  const paid = parseFloat(amountPaid) || 0;
  const balance = total - paid;

  async function handleSave() {
    if (!partyId) { toast.error('Select a party'); return; }
    if (items.every(it => !it.productName)) { toast.error('Add at least one item'); return; }
    const validItems = items.filter(it => it.productName);
    if (validItems.length === 0) { toast.error('Enter product name for items'); return; }
    const billSubtotal = validItems.reduce((s, it) => s + it.purchaseRate * it.quantity, 0);
    const itemBillDiscount = validItems.reduce((s, it) => {
      return s + (it.discountAmount ?? 0);
    }, 0);
    const billGst = validItems.reduce((s, it) => s + it.gstAmount, 0);
    const totalBillDiscountExclTax = Math.max(0, parseFloat(totalDiscountExclTax) || 0);
    const beforeBillDiscount = Math.max(0, validItems.reduce((s, it) => s + it.total, 0) - totalBillDiscountExclTax);
    const billLevelDiscount = getBillDiscountAmount(billDiscount, beforeBillDiscount);
    const billTotal = Math.max(0, beforeBillDiscount - billLevelDiscount);
    const billBalance = Math.max(0, billTotal - paid);
    setSaving(true);
    try {
      const party = parties.find(p => p.id === partyId)!;
      const purchaseNumber = await generatePurchaseNumber();
      await createPurchaseBill({
        purchaseNumber, partyId, partyName: party.name,
        items: validItems, invoiceNumber: invoiceNumber || undefined,
        invoiceDate: invoiceDate ? new Date(invoiceDate) : undefined,
        paymentTermsDays: parseInt(paymentTermsDays) || undefined,
        dueDate: dueDate ? new Date(dueDate) : undefined,
        subtotal: billSubtotal, totalGst: billGst, totalDiscount: itemBillDiscount + totalBillDiscountExclTax + billLevelDiscount, roundOff: 0,
        total: billTotal, amountPaid: paid, balance: billBalance,
        paymentMethod: paid > 0 ? paymentMethod : undefined,
        status: paid >= billTotal ? 'paid' : paid > 0 ? 'partial' : 'received',
        notes: notes || undefined,
      });
      await applyPurchaseToProducts(validItems);
      setProducts(await getAllProducts());
      toast.success('Purchase bill created');
      setShowModal(false); load();
    } catch (err: any) { toast.error(`Save failed: ${err?.message ?? 'Check Firestore connection'}`); }
    finally { setSaving(false); }
  }

  async function handleBillPaymentStatus(bill: PurchaseBill, status: PurchaseBill['status']) {
    let paid = bill.amountPaid ?? 0;
    if (status === 'paid') paid = bill.total ?? 0;
    else if (status === 'received' || status === 'draft') paid = 0;
    try {
      await updatePurchaseBill(bill.id, {
        status,
        amountPaid: paid,
        balance: Math.max(0, (bill.total ?? 0) - paid),
      });
      toast.success('Payment status updated'); load();
    } catch { toast.error('Update failed'); }
  }

  async function handleMarkDraft(bill: PurchaseBill) {
    try {
      await updatePurchaseBill(bill.id, {
        status: 'draft',
        amountPaid: 0,
        balance: bill.total ?? 0,
      });
      toast.success('Bill marked as draft');
      load();
    } catch { toast.error('Could not mark bill as draft'); }
  }

  async function handleDeletePurchaseBill(bill: PurchaseBill) {
    if (!confirm(`Delete purchase bill "${bill.purchaseNumber}"?`)) return;
    try {
      await deletePurchaseBill(bill);
      toast.success('Purchase bill deleted');
      load();
    } catch { toast.error('Delete failed'); }
  }

  async function handleRecordBillPayment() {
    if (!payBill) return;
    const amt = parseFloat(payAmount);
    if (!amt || amt <= 0) { toast.error('Enter a valid amount'); return; }
    setPaying(true);
    try {
      const newPaid    = (payBill.amountPaid ?? 0) + amt;
      const newBalance = Math.max(0, (payBill.total ?? 0) - newPaid);
      await updatePurchaseBill(payBill.id, {
        amountPaid: newPaid,
        balance: newBalance,
        status: newBalance <= 0 ? 'paid' : 'partial',
        paymentMethod: payMethod,
      });
      toast.success(`₹${amt.toFixed(2)} recorded`);
      setPayBill(null); setPayAmount(''); load();
    } catch { toast.error('Failed to record payment'); }
    finally { setPaying(false); }
  }

  const totalBillValue = bills.reduce((s, b) => s + b.total, 0);
  const totalBillPaid  = bills.reduce((s, b) => s + b.amountPaid, 0);
  const totalBillDue   = bills.reduce((s, b) => s + b.balance, 0);
  const matchesDateFilter = (bill: PurchaseBill) => {
    if (billDateFilter === 'all') return true;
    const created = bill.createdAt ? new Date(bill.createdAt) : null;
    if (!created) return false;
    const startOfDay = (date: Date) => {
      const d = new Date(date);
      d.setHours(0, 0, 0, 0);
      return d;
    };
    const endOfDay = (date: Date) => {
      const d = new Date(date);
      d.setHours(23, 59, 59, 999);
      return d;
    };
    const today = new Date();
    if (billDateFilter === 'today') return created >= startOfDay(today) && created <= endOfDay(today);
    if (billDateFilter === 'yesterday') {
      const yesterday = new Date(today);
      yesterday.setDate(yesterday.getDate() - 1);
      return created >= startOfDay(yesterday) && created <= endOfDay(yesterday);
    }
    if (billDateFilter === '7days' || billDateFilter === '30days') {
      const from = startOfDay(today);
      from.setDate(from.getDate() - (billDateFilter === '7days' ? 6 : 29));
      return created >= from && created <= endOfDay(today);
    }
    if (billDateFilter === 'custom') {
      const from = customFrom ? startOfDay(new Date(customFrom)) : null;
      const to = customTo ? endOfDay(new Date(customTo)) : null;
      return (!from || created >= from) && (!to || created <= to);
    }
    return true;
  };
  const filteredBills = (() => {
    const term = billSearch.trim().toLowerCase();
    const dateFiltered = bills.filter(matchesDateFilter);
    if (!term) return dateFiltered;
    const exact = dateFiltered.filter(b =>
      b.purchaseNumber.toLowerCase() === term ||
      (b.invoiceNumber ?? '').toLowerCase() === term
    );
    if (exact.length > 0) return exact;
    return dateFiltered.filter(b =>
      b.purchaseNumber.toLowerCase().includes(term) ||
      (b.invoiceNumber ?? '').toLowerCase().includes(term) ||
      b.partyName.toLowerCase().includes(term) ||
      (b.createdAt ? format(b.createdAt, 'dd MMM yyyy').toLowerCase().includes(term) : false)
    );
  })();
  const productMatches = products
    .filter(p => {
      const term = productSearch.trim().toLowerCase();
      if (!term) return true;
      return p.name.toLowerCase().includes(term) ||
        (p.brand ?? '').toLowerCase().includes(term) ||
        (p.barcode ?? '').includes(productSearch.trim());
    })
    .slice(0, 8);
  const getBillParty = (bill: PurchaseBill) => parties.find(p => p.id === bill.partyId);

  return (
    <>
      {bills.length > 0 && (
        <div className="grid grid-cols-3 gap-3 mb-4">
          <div className="bg-white rounded-xl border border-gray-100 p-4 shadow-sm">
            <p className="text-xs text-gray-500 mb-1">Total Purchase Value</p>
            <p className="text-lg font-bold text-gray-900">{formatCurrency(totalBillValue)}</p>
          </div>
          <div className="bg-green-50 rounded-xl border border-green-100 p-4 shadow-sm">
            <p className="text-xs text-green-700 mb-1">Total Paid</p>
            <p className="text-lg font-bold text-green-700">{formatCurrency(totalBillPaid)}</p>
          </div>
          <div className="bg-red-50 rounded-xl border border-red-100 p-4 shadow-sm">
            <p className="text-xs text-red-700 mb-1">Total Outstanding</p>
            <p className="text-lg font-bold text-red-700">{formatCurrency(totalBillDue)}</p>
          </div>
        </div>
      )}
      <div className="flex items-center justify-between mb-4 gap-3">
        <p className="text-sm text-gray-500">{bills.length} purchase bills</p>
        <div className="relative flex-1 max-w-md">
          <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={14} />
          <input value={billSearch} onChange={e => setBillSearch(e.target.value)} className="input" style={{ paddingLeft: 34 }} placeholder="Search exact purchase bill or invoice number" />
        </div>
        <select value={billDateFilter} onChange={e => setBillDateFilter(e.target.value as BillDateFilter)} className="input max-w-36">
          <option value="all">All dates</option>
          <option value="today">Today</option>
          <option value="yesterday">Yesterday</option>
          <option value="7days">Last 7 days</option>
          <option value="30days">Last 30 days</option>
          <option value="custom">Custom</option>
        </select>
        {billDateFilter === 'custom' && (
          <div className="flex items-center gap-2">
            <input type="date" value={customFrom} onChange={e => setCustomFrom(e.target.value)} className="input max-w-36" />
            <span className="text-xs text-gray-400">to</span>
            <input type="date" value={customTo} onChange={e => setCustomTo(e.target.value)} className="input max-w-36" />
          </div>
        )}
        <button onClick={openAdd} className="flex items-center gap-1.5 px-4 py-2 bg-saffron-400 hover:bg-saffron-500 text-white font-semibold rounded-xl text-sm transition-colors">
          <Plus size={14} /> New Purchase Bill
        </button>
      </div>
      {loading ? (
        <div className="text-center py-12 text-gray-400 text-sm">Loading…</div>
      ) : bills.length === 0 ? (
        <div className="flex flex-col items-center py-16 gap-3"><FileText size={40} className="text-gray-200" /><p className="text-gray-400 text-sm">No purchase bills yet</p></div>
      ) : filteredBills.length === 0 ? (
        <div className="flex flex-col items-center py-16 gap-3"><Search size={36} className="text-gray-200" /><p className="text-gray-400 text-sm">No purchase bills match your search</p></div>
      ) : (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-x-auto">
          <table className="w-full text-sm min-w-[950px]">
            <thead className="bg-gray-50 text-xs text-gray-500 uppercase tracking-wide">
              <tr>
                <th className="text-left px-5 py-3">Purchase #</th>
                <th className="text-left px-4 py-3">Date</th>
                <th className="text-left px-4 py-3">Party</th>
                <th className="text-left px-4 py-3">Invoice #</th>
                <th className="text-right px-4 py-3">Total</th>
                <th className="text-right px-4 py-3">Paid</th>
                <th className="text-right px-4 py-3">Balance</th>
                <th className="text-center px-4 py-3">Payment</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {filteredBills.map(b => (
                <tr key={b.id} className="hover:bg-gray-50">
                  <td className="px-5 py-3">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-xs font-semibold text-gray-700">{b.purchaseNumber}</span>
                      {b.status === 'draft' && <StatusBadge status="draft" />}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-gray-600 text-xs">{b.createdAt ? format(b.createdAt, 'dd MMM yyyy') : '—'}</td>
                  <td className="px-4 py-3 font-medium text-gray-800">{b.partyName}</td>
                  <td className="px-4 py-3 text-gray-500 text-xs">{b.invoiceNumber ?? '—'}</td>
                  <td className="px-4 py-3 text-right font-semibold text-gray-900">{formatCurrency(b.total)}</td>
                  <td className="px-4 py-3 text-right text-green-600">{formatCurrency(b.amountPaid)}</td>
                  <td className="px-4 py-3 text-right text-red-600 font-medium">{formatCurrency(b.balance)}</td>
                  <td className="px-4 py-3 text-center">
                    <select
                      value={b.status}
                      onChange={e => handleBillPaymentStatus(b, e.target.value as PurchaseBill['status'])}
                      className={`text-xs font-medium rounded-lg px-2 py-1 border-0 outline-none cursor-pointer ${
                        b.status === 'paid'     ? 'bg-green-100 text-green-700' :
                        b.status === 'partial'  ? 'bg-amber-100 text-amber-700' :
                        b.status === 'draft'    ? 'bg-gray-100 text-gray-600' :
                                                  'bg-red-50 text-red-600'
                      }`}
                    >
                      <option value="draft">Draft</option>
                      <option value="received">Unpaid</option>
                      <option value="partial">Partial Paid</option>
                      <option value="paid">Paid</option>
                    </select>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1 justify-end">
                      <button onClick={() => printPurchaseBill(b, getBillParty(b), storeSettings)} title="Download / Print" className="p-1.5 text-gray-400 hover:text-saffron-500 hover:bg-saffron-50 rounded-lg transition-colors">
                        <Download size={13} />
                      </button>
                      <button onClick={() => { setPayBill(b); setPayAmount(''); setPayMethod('cash'); }} title="Record Payment" className="p-1.5 text-gray-400 hover:text-green-600 hover:bg-green-50 rounded-lg transition-colors">
                        <IndianRupee size={13} />
                      </button>
                      <button onClick={() => handleMarkDraft(b)} title="Mark as Draft" className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors">
                        <FileText size={13} />
                      </button>
                      <button onClick={() => handleDeletePurchaseBill(b)} title="Delete Bill" className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors">
                        <Trash2 size={13} />
                      </button>
                      <button onClick={() => setViewBill(b)} className="flex items-center gap-1 px-2.5 py-1.5 text-xs text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors">
                        <Eye size={12} /> View
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* New Purchase Bill Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={e => e.target === e.currentTarget && setShowModal(false)}>
          <div className="bg-white rounded-2xl shadow-2xl w-[96vw] max-w-7xl mx-4 h-[92vh] flex flex-col">
            <div className="flex items-center justify-between px-6 py-4 border-b">
              <h2 className="font-bold text-gray-900">New Purchase Bill</h2>
              <div className="flex items-center gap-2">
                <button onClick={() => setShowAdminHelp(true)} className="px-2.5 py-1.5 text-xs text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50 flex items-center gap-1">
                  <Keyboard size={13} /> Help
                </button>
                <button onClick={() => setShowModal(false)}><X size={18} className="text-gray-400" /></button>
              </div>
            </div>
            <div className="flex-1 overflow-y-auto p-6 space-y-5">
              {/* Party + Invoice */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="label">Party / Vendor *</label>
                  <select value={partyId} onChange={e => setPartyId(e.target.value)} className="input">
                    {parties.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                    {parties.length === 0 && <option value="">No parties — add one first</option>}
                  </select>
                </div>
                <div>
                  <label className="label">Vendor Invoice #</label>
                  <input value={invoiceNumber} onChange={e => setInvoiceNumber(e.target.value)} className="input" placeholder="e.g. INV-2024-001" />
                </div>
                <div>
                  <label className="label">Invoice Date</label>
                  <input type="date" value={invoiceDate} onChange={e => {
                    setInvoiceDate(e.target.value);
                    const base = e.target.value ? new Date(e.target.value) : new Date();
                    base.setDate(base.getDate() + (parseInt(paymentTermsDays) || 0));
                    setDueDate(base.toISOString().split('T')[0]);
                  }} className="input" />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="label">Payment Terms</label>
                    <div className="flex">
                      <input type="number" value={paymentTermsDays} onChange={e => {
                        const days = e.target.value;
                        setPaymentTermsDays(days);
                        const base = invoiceDate ? new Date(invoiceDate) : new Date();
                        base.setDate(base.getDate() + (parseInt(days) || 0));
                        setDueDate(base.toISOString().split('T')[0]);
                      }} className="input rounded-r-none" min="0" />
                      <span className="px-3 py-2 border-y border-r border-gray-200 bg-gray-50 text-xs text-gray-600 rounded-r-lg">days</span>
                    </div>
                  </div>
                  <div>
                    <label className="label">Due Date</label>
                    <input type="date" value={dueDate} onChange={e => setDueDate(e.target.value)} className="input" />
                  </div>
                </div>
                <div>
                  <label className="label">Payment Method</label>
                  <select value={paymentMethod} onChange={e => setPaymentMethod(e.target.value as PurchaseBill['paymentMethod'])} className="input">
                    <option value="cash">Cash</option>
                    <option value="upi">UPI</option>
                    <option value="card">Card</option>
                    <option value="credit">Credit</option>
                  </select>
                </div>
              </div>

              {/* Product picker */}
              <div className="grid grid-cols-12 gap-3 border-y border-gray-100 py-4">
                <div className="col-span-10 relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={15} />
                  <input
                    value={productSearch}
                    onChange={e => setProductSearch(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); handleProductEntry(); } }}
                    className="input pl-9"
                    placeholder="Search previous products or scan barcode"
                  />
                  {productSearch && (
                    <div className="absolute z-20 mt-1 w-full bg-white border border-gray-200 rounded-xl shadow-lg overflow-hidden">
                      {productMatches.map(p => (
                        <button key={p.id} onClick={() => addItem(p)} className="w-full px-3 py-2 text-left hover:bg-gray-50 flex items-center justify-between">
                          <span>
                            <span className="text-sm font-medium text-gray-800">{p.name}</span>
                            <span className="block text-[11px] text-gray-400">{p.barcode || 'No barcode'} - Stock {p.stock} {p.unit}</span>
                          </span>
                          <span className="text-xs font-semibold text-saffron-600">{formatCurrency(p.purchasePrice ?? p.price)}</span>
                        </button>
                      ))}
                      <button onClick={() => openProductModal({ name: productSearch })} className="w-full px-3 py-2 text-left text-saffron-700 bg-saffron-50 hover:bg-saffron-100 text-sm font-semibold">
                        + Add new product
                      </button>
                    </div>
                  )}
                </div>
                <button onClick={() => handleProductEntry()} className="col-span-1 border border-gray-200 rounded-xl text-gray-600 hover:bg-gray-50 flex items-center justify-center" title="Add scanned barcode">
                  <ScanBarcode size={18} />
                </button>
                <button onClick={() => openProductModal()} className="col-span-1 bg-saffron-400 hover:bg-saffron-500 text-white rounded-xl flex items-center justify-center" title="Add new product">
                  <Plus size={18} />
                </button>
              </div>

              {/* Items */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="label" style={{ marginBottom: 0 }}>Items</label>
                  <button onClick={addBlankItemAndFocus} className="text-xs text-saffron-600 font-medium hover:underline flex items-center gap-1"><Plus size={12} /> Add Item</button>
                </div>
                <div className="space-y-2">
                  {items.map((it, idx) => (
                    <div
                      key={idx}
                      className="grid gap-2 items-end bg-gray-50 rounded-xl p-3 overflow-x-auto"
                      style={{ gridTemplateColumns: 'minmax(280px, 2.6fr) 72px 86px 90px 90px 84px 76px 82px minmax(88px, .7fr) 34px' }}
                    >
                      <div className="min-w-0">
                        {idx === 0 && <label className="label">Product Name</label>}
                        <input ref={el => { itemProductRefs.current[idx] = el; }} value={it.productName} onChange={e => updateItem(idx, { productName: e.target.value, productId: e.target.value.toLowerCase().replace(/\s+/g, '-') })} className="input" placeholder="Product name" />
                      </div>
                      <div className="min-w-0">
                        {idx === 0 && <label className="label">Qty</label>}
                        <input type="number" value={it.quantity} onChange={e => updateItem(idx, { quantity: parseFloat(e.target.value) || 0 })} className="input" placeholder="1" min="0" step="0.01" />
                      </div>
                      <div className="min-w-0">
                        {idx === 0 && <label className="label">Unit</label>}
                        <select value={it.unit} onChange={e => updateItem(idx, { unit: e.target.value })} className="input">
                          {UNITS.map(u => <option key={u} value={u}>{u}</option>)}
                        </select>
                      </div>
                      <div className="min-w-0">
                        {idx === 0 && <label className="label">Rate (₹)</label>}
                        <input type="number" value={it.purchaseRate} onChange={e => updateItem(idx, { purchaseRate: parseFloat(e.target.value) || 0 })} className="input" placeholder="0" min="0" step="0.01" />
                      </div>
                      <div className="min-w-0">
                        {idx === 0 && <label className="label">Selling</label>}
                        <input type="number" value={it.sellingPrice ?? 0} onChange={e => updateItem(idx, { sellingPrice: parseFloat(e.target.value) || 0 })} className="input" placeholder="0" min="0" step="0.01" title="Updates product selling price, not printed on purchase bill" />
                      </div>
                      <div className="min-w-0">
                        {idx === 0 && <label className="label">MRP</label>}
                        <input type="number" value={it.mrp} onChange={e => updateItem(idx, { mrp: parseFloat(e.target.value) || 0 })} className="input" placeholder="0" min="0" step="0.01" />
                      </div>
                      <div className="min-w-0">
                        {idx === 0 && <label className="label">GST%</label>}
                        <select value={it.gstRate} onChange={e => updateItem(idx, { gstRate: parseInt(e.target.value) })} className="input">
                          {GST_RATES.map(r => <option key={r} value={r}>{r}%</option>)}
                        </select>
                      </div>
                      <div className="min-w-0">
                        {idx === 0 && <label className="label">Disc</label>}
                        <input type="number" value={it.discountAmount ?? 0} onChange={e => updateItem(idx, { discountAmount: parseFloat(e.target.value) || 0 })} onKeyDown={e => handleItemTab(e, idx)} className="input text-right" placeholder="0" min="0" step="0.01" title="Press Tab here to add the next item row" />
                      </div>
                      <div className="flex items-end gap-2 min-w-0">
                        <div className="min-w-0">
                          {idx === 0 && <label className="label">Total</label>}
                          <p className="text-sm font-semibold text-gray-800 py-2 truncate">{formatCurrency(it.total)}</p>
                        </div>
                      </div>
                      <div className="flex items-end justify-center">
                        <button onClick={() => removeItem(idx)} className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors mb-1" title="Remove item">
                          <X size={14} />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Totals + Payment */}
              <div className="grid grid-cols-2 gap-4 border-t pt-4">
                <div className="space-y-1 text-sm">
                  <div className="flex justify-between text-gray-600"><span>Subtotal</span><span>{formatCurrency(subtotal)}</span></div>
                  <div className="flex items-center justify-between gap-3 text-gray-600">
                    <span>Total Disc (Excl Tax)</span>
                    <input
                      type="number"
                      value={totalDiscountExclTax}
                      onChange={e => setTotalDiscountExclTax(e.target.value)}
                      className="input max-w-32 text-right"
                      placeholder="0"
                      min="0"
                      step="0.01"
                    />
                  </div>
                  <div className="flex items-center justify-between gap-3 text-gray-600">
                    <span>Discount</span>
                    <input
                      type="text"
                      inputMode="decimal"
                      value={billDiscount}
                      onChange={e => setBillDiscount(e.target.value)}
                      className="input max-w-32 text-right"
                      placeholder="0 or 10%"
                    />
                  </div>
                  {billDiscount.trim().endsWith('%') && (
                    <div className="flex justify-between text-gray-500 text-xs"><span>Discount Amount</span><span>- {formatCurrency(billDiscountAmount)}</span></div>
                  )}
                  <div className="flex justify-between text-gray-500 text-xs"><span>Total GST</span><span>{formatCurrency(totalGst)}</span></div>
                  <div className="flex justify-between font-bold text-gray-900 border-t pt-1 mt-1"><span>Grand Total</span><span>{formatCurrency(total)}</span></div>
                  <div className="flex justify-between text-red-600"><span>Balance Due</span><span>{formatCurrency(Math.max(0, balance))}</span></div>
                </div>
                <div className="space-y-3">
                  <div>
                    <label className="label">Amount Paid (₹)</label>
                    <input type="number" value={amountPaid} onChange={e => setAmountPaid(e.target.value)} className="input" placeholder="0" min="0" step="0.01" />
                  </div>
                  <div>
                    <label className="label">Notes</label>
                    <input value={notes} onChange={e => setNotes(e.target.value)} className="input" placeholder="Optional" />
                  </div>
                </div>
              </div>
            </div>
            <div className="px-6 pb-6 flex gap-3 border-t pt-4">
              <button onClick={() => setShowModal(false)} className="flex-1 py-2.5 border border-gray-200 rounded-xl text-sm text-gray-600 hover:bg-gray-50">Cancel</button>
              <button onClick={handleSave} disabled={saving} className="flex-1 py-2.5 bg-saffron-400 hover:bg-saffron-500 disabled:bg-gray-200 text-white font-semibold rounded-xl text-sm flex items-center justify-center gap-2 transition-colors">
                {saving ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> : <Check size={16} />}
                Create Purchase Bill
              </button>
            </div>
          </div>
        </div>
      )}

      {showAdminHelp && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/40" onClick={e => e.target === e.currentTarget && setShowAdminHelp(false)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md mx-4 overflow-hidden">
            <div className="flex items-center justify-between px-5 py-4 border-b">
              <div className="flex items-center gap-2">
                <Keyboard size={18} className="text-saffron-500" />
                <h3 className="font-bold text-gray-900">Admin Shortcuts</h3>
              </div>
              <button onClick={() => setShowAdminHelp(false)} className="p-1.5 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-lg">
                <X size={16} />
              </button>
            </div>
            <div className="p-5 space-y-3 text-sm">
              <div className="flex items-center justify-between gap-4">
                <span className="text-gray-600">Open this help</span>
                <kbd className="px-2 py-1 bg-gray-100 border border-gray-200 rounded text-xs font-semibold text-gray-700">F1</kbd>
              </div>
              <div className="flex items-center justify-between gap-4">
                <span className="text-gray-600">Add next item row from Disc field</span>
                <kbd className="px-2 py-1 bg-gray-100 border border-gray-200 rounded text-xs font-semibold text-gray-700">Tab</kbd>
              </div>
              <div className="flex items-center justify-between gap-4">
                <span className="text-gray-600">Add product from search or barcode</span>
                <kbd className="px-2 py-1 bg-gray-100 border border-gray-200 rounded text-xs font-semibold text-gray-700">Enter</kbd>
              </div>
              <div className="flex items-center justify-between gap-4">
                <span className="text-gray-600">Close help</span>
                <kbd className="px-2 py-1 bg-gray-100 border border-gray-200 rounded text-xs font-semibold text-gray-700">Esc</kbd>
              </div>
            </div>
          </div>
        </div>
      )}

      {showProductModal && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40" onClick={e => e.target === e.currentTarget && setShowProductModal(false)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-xl mx-4 max-h-[90vh] flex flex-col">
            <div className="flex items-center justify-between px-6 py-4 border-b">
              <div className="flex items-center gap-2">
                <Package size={18} className="text-saffron-500" />
                <h2 className="font-bold text-gray-900">Add New Product</h2>
              </div>
              <button onClick={() => setShowProductModal(false)}><X size={18} className="text-gray-400" /></button>
            </div>
            <div className="flex-1 overflow-y-auto p-6 grid grid-cols-2 gap-4">
              <div className="col-span-2"><Label>Product Name *</Label><input value={productForm.name} onChange={e => setProductForm(f => ({ ...f, name: e.target.value }))} className="input" autoFocus /></div>
              <div><Label>Barcode</Label><input value={productForm.barcode || ''} onChange={e => setProductForm(f => ({ ...f, barcode: normalizeBarcode(e.target.value) }))} className="input" /></div>
              <div><Label>Brand</Label><input value={productForm.brand || ''} onChange={e => setProductForm(f => ({ ...f, brand: e.target.value }))} className="input" /></div>
              <div><Label>Purchase Price</Label><input type="number" value={productForm.purchasePrice ?? 0} onChange={e => setProductForm(f => ({ ...f, purchasePrice: parseFloat(e.target.value) || 0 }))} className="input" min="0" step="0.01" /></div>
              <div><Label>Selling Price</Label><input type="number" value={productForm.price} onChange={e => setProductForm(f => ({ ...f, price: parseFloat(e.target.value) || 0 }))} className="input" min="0" step="0.01" /></div>
              <div><Label>MRP</Label><input type="number" value={productForm.mrp} onChange={e => setProductForm(f => ({ ...f, mrp: parseFloat(e.target.value) || 0 }))} className="input" min="0" step="0.01" /></div>
              <div><Label>Opening Stock</Label><input type="number" value={productForm.stock} onChange={e => setProductForm(f => ({ ...f, stock: parseFloat(e.target.value) || 0 }))} className="input" min="0" step="0.01" /></div>
              <div><Label>GST Rate</Label><select value={productForm.gstRate} onChange={e => setProductForm(f => ({ ...f, gstRate: parseInt(e.target.value) }))} className="input">{GST_RATES.map(r => <option key={r} value={r}>{r}%</option>)}</select></div>
              <div><Label>HSN Code</Label><input value={productForm.hsnCode || ''} onChange={e => setProductForm(f => ({ ...f, hsnCode: e.target.value }))} className="input" /></div>
              <div><Label>Category</Label><select value={productForm.category} onChange={e => setProductForm(f => ({ ...f, category: e.target.value }))} className="input">{categories.map(c => <option key={c.id} value={c.name}>{c.name}</option>)}</select></div>
              <div><Label>Unit</Label><select value={productForm.unit} onChange={e => setProductForm(f => ({ ...f, unit: e.target.value }))} className="input">{UNITS.map(u => <option key={u} value={u}>{u}</option>)}</select></div>
            </div>
            <div className="px-6 pb-6 flex gap-3 border-t pt-4">
              <button onClick={() => setShowProductModal(false)} className="flex-1 py-2.5 border border-gray-200 rounded-xl text-sm text-gray-600 hover:bg-gray-50">Cancel</button>
              <button onClick={handleCreateProduct} disabled={addingProduct} className="flex-1 py-2.5 bg-saffron-400 hover:bg-saffron-500 disabled:bg-gray-200 text-white font-semibold rounded-xl text-sm flex items-center justify-center gap-2">
                {addingProduct ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> : <Check size={16} />}
                Add Product
              </button>
            </div>
          </div>
        </div>
      )}

      {/* View Bill Modal */}
      {viewBill && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={e => e.target === e.currentTarget && setViewBill(null)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg mx-4 max-h-[85vh] flex flex-col">
            <div className="flex items-center justify-between px-6 py-4 border-b">
              <div>
                <h2 className="font-bold text-gray-900">{viewBill.purchaseNumber}</h2>
                <p className="text-xs text-gray-500">{viewBill.partyName} · {viewBill.createdAt ? format(viewBill.createdAt, 'dd MMM yyyy') : '—'}</p>
              </div>
              <div className="flex items-center gap-2">
                <button onClick={() => printPurchaseBill(viewBill, getBillParty(viewBill), storeSettings)} className="flex items-center gap-1 px-2.5 py-1.5 text-xs text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50">
                  <Download size={12} /> Download
                </button>
                <button onClick={() => setViewBill(null)}><X size={18} className="text-gray-400" /></button>
              </div>
            </div>
            <div className="flex-1 overflow-y-auto p-6 space-y-4">
              <div className="flex gap-2 flex-wrap">
                <StatusBadge status={viewBill.status} />
                {viewBill.invoiceNumber && <span className="px-2 py-0.5 bg-gray-100 text-gray-600 rounded-full text-xs">Inv: {viewBill.invoiceNumber}</span>}
              </div>
              <table className="w-full text-xs">
                <thead className="bg-gray-50 text-gray-500">
                  <tr>
                    <th className="text-left py-2 px-2">#</th>
                    <th className="text-left py-2 px-2">Product</th>
                    <th className="text-right py-2 px-2">Qty</th>
                    <th className="text-right py-2 px-2">MRP</th>
                    <th className="text-right py-2 px-2">Purchase Price</th>
                    <th className="text-right py-2 px-2">CGST</th>
                    <th className="text-right py-2 px-2">SGST</th>
                    <th className="text-right py-2 px-2">GST</th>
                    <th className="text-right py-2 px-2">Total</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {viewBill.items.map((it, i) => (
                    <tr key={i}>
                      <td className="py-2 px-2 text-gray-400">{i + 1}</td>
                      <td className="py-2 px-2 font-medium">{it.productName}</td>
                      <td className="py-2 px-2 text-right">{it.quantity} {it.unit}</td>
                      <td className="py-2 px-2 text-right">₹{it.mrp ?? 0}</td>
                      <td className="py-2 px-2 text-right">₹{it.purchaseRate}</td>
                      <td className="py-2 px-2 text-right">₹{(it.gstAmount / 2).toFixed(2)}</td>
                      <td className="py-2 px-2 text-right">₹{(it.gstAmount / 2).toFixed(2)}</td>
                      <td className="py-2 px-2 text-right">{it.gstRate}%</td>
                      <td className="py-2 px-2 text-right font-semibold">₹{it.total.toFixed(2)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div className="border-t pt-3 space-y-1 text-sm">
                <div className="flex justify-between text-gray-600"><span>Subtotal</span><span>{formatCurrency(viewBill.subtotal)}</span></div>
                <div className="flex justify-between text-gray-500 text-xs"><span>GST</span><span>{formatCurrency(viewBill.totalGst)}</span></div>
                <div className="flex justify-between text-gray-500 text-xs"><span>CGST</span><span>{formatCurrency(viewBill.totalGst / 2)}</span></div>
                <div className="flex justify-between text-gray-500 text-xs"><span>SGST</span><span>{formatCurrency(viewBill.totalGst / 2)}</span></div>
                <div className="flex justify-between font-bold text-gray-900 border-t pt-2"><span>Total</span><span>{formatCurrency(viewBill.total)}</span></div>
                <div className="flex justify-between text-green-600 text-sm"><span>Paid</span><span>{formatCurrency(viewBill.amountPaid)}</span></div>
                <div className="flex justify-between text-red-600 text-sm"><span>Balance</span><span>{formatCurrency(viewBill.balance)}</span></div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Record Payment Modal for Bills */}
      {payBill && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={e => e.target === e.currentTarget && setPayBill(null)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm mx-4">
            <div className="flex items-center justify-between px-6 py-4 border-b">
              <div>
                <h2 className="font-bold text-gray-900">Record Payment</h2>
                <p className="text-xs text-gray-500">{payBill.purchaseNumber} · {payBill.partyName}</p>
              </div>
              <button onClick={() => setPayBill(null)}><X size={18} className="text-gray-400" /></button>
            </div>
            <div className="p-6 space-y-4">
              <div className="bg-gray-50 rounded-xl p-4 text-sm space-y-1.5">
                <div className="flex justify-between text-gray-700"><span>Bill Total</span><span className="font-semibold">{formatCurrency(payBill.total ?? 0)}</span></div>
                <div className="flex justify-between text-green-600"><span>Already Paid</span><span>{formatCurrency(payBill.amountPaid ?? 0)}</span></div>
                <div className="flex justify-between text-red-600 font-bold border-t pt-1.5"><span>Outstanding</span><span>{formatCurrency(payBill.balance ?? 0)}</span></div>
              </div>
              <div>
                <label className="label">Amount to Pay (₹) *</label>
                <input type="number" value={payAmount} onChange={e => setPayAmount(e.target.value)} className="input" placeholder="0.00" min="0" step="0.01" autoFocus />
              </div>
              <div>
                <label className="label">Payment Method</label>
                <select value={payMethod} onChange={e => setPayMethod(e.target.value as typeof payMethod)} className="input">
                  <option value="cash">Cash</option>
                  <option value="upi">UPI</option>
                  <option value="card">Card</option>
                  <option value="credit">Credit</option>
                </select>
              </div>
            </div>
            <div className="px-6 pb-6 flex gap-3">
              <button onClick={() => setPayBill(null)} className="flex-1 py-2.5 border border-gray-200 rounded-xl text-sm text-gray-600 hover:bg-gray-50">Cancel</button>
              <button onClick={handleRecordBillPayment} disabled={paying} className="flex-1 py-2.5 bg-green-500 hover:bg-green-600 disabled:bg-gray-200 text-white font-semibold rounded-xl text-sm flex items-center justify-center gap-2 transition-colors">
                {paying ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> : <Check size={16} />}
                Record Payment
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

// ── Purchase Orders Tab ───────────────────────────────────────────────────────

function printPurchaseOrder(order: PurchaseOrder) {
  const win = window.open('', '_blank');
  if (!win) { toast.error('Allow popups to download / print'); return; }
  const rows = order.items.map((it, i) => `
    <tr>
      <td>${i + 1}</td><td>${it.productName}</td>
      <td align="right">${it.quantity} ${it.unit}</td>
      <td align="right">₹${it.purchaseRate.toFixed(2)}</td>
      <td align="right">${it.gstRate}%</td>
      <td align="right">₹${it.total.toFixed(2)}</td>
    </tr>`).join('');
  const subtotal = order.items.reduce((s, it) => s + it.purchaseRate * it.quantity, 0);
  const gstTotal = order.items.reduce((s, it) => s + it.gstAmount, 0);
  const fmt = (d: Date | string) => new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
  win.document.write(`<!DOCTYPE html><html><head><title>PO — ${order.orderNumber}</title>
<style>
body{font-family:Arial,sans-serif;padding:32px;max-width:700px;margin:0 auto;color:#1f2937}
h2{color:#ff9933;margin:0 0 2px;font-size:22px}
hr{border:none;border-top:1px solid #e5e7eb;margin:14px 0}
table{width:100%;border-collapse:collapse;margin:12px 0}
th{background:#f9fafb;font-size:11px;text-transform:uppercase;letter-spacing:.05em;padding:8px 10px;border-bottom:2px solid #e5e7eb;text-align:left}
td{padding:8px 10px;border-bottom:1px solid #f3f4f6;font-size:13px}
.tot td{border:none;padding:3px 10px;font-size:13px}
.grand td{font-weight:700;font-size:14px;border-top:2px solid #374151;padding-top:8px}
.btn{padding:9px 22px;background:#ff9933;color:#fff;border:none;border-radius:8px;cursor:pointer;font-size:14px;margin-top:20px}
@media print{.no-print{display:none}}
</style></head><body>
<div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:4px">
  <div><h2>PURCHASE ORDER</h2><p style="margin:0;font-size:13px;color:#6b7280">${order.orderNumber}</p></div>
  <div style="text-align:right;font-size:12px;color:#6b7280;line-height:2">
    <div>Date: <strong>${fmt(order.createdAt)}</strong></div>
    ${order.expectedDate ? `<div>Expected Delivery: <strong>${fmt(order.expectedDate)}</strong></div>` : ''}
    ${order.dueDate ? `<div>Payment Due: <strong>${fmt(order.dueDate)}</strong></div>` : ''}
  </div>
</div>
<hr/>
<p style="margin:0 0 14px;font-size:13px"><strong>To:</strong> ${order.partyName}</p>
<table>
  <thead><tr><th>#</th><th>Product</th><th align="right">Qty</th><th align="right">Rate</th><th align="right">GST%</th><th align="right">Amount</th></tr></thead>
  <tbody>${rows}</tbody>
</table>
<table style="margin-left:auto;width:260px" class="tot">
  <tr><td>Subtotal</td><td align="right">₹${subtotal.toFixed(2)}</td></tr>
  <tr><td>Total GST</td><td align="right">₹${gstTotal.toFixed(2)}</td></tr>
  <tr class="grand"><td>Grand Total</td><td align="right">₹${(order.total || 0).toFixed(2)}</td></tr>
  ${(order.amountPaid || 0) > 0 ? `<tr><td style="color:#16a34a">Paid</td><td align="right" style="color:#16a34a">₹${(order.amountPaid || 0).toFixed(2)}</td></tr>` : ''}
  ${(order.balance || 0) > 0 ? `<tr><td style="color:#dc2626">Balance Due</td><td align="right" style="color:#dc2626">₹${(order.balance || 0).toFixed(2)}</td></tr>` : ''}
</table>
${order.notes ? `<p style="margin-top:14px;font-size:12px;color:#6b7280;border-top:1px solid #e5e7eb;padding-top:12px"><strong>Notes:</strong> ${order.notes}</p>` : ''}
<p style="margin-top:28px;font-size:11px;color:#9ca3af">Generated by NSB POS · ${new Date().toLocaleDateString('en-IN')}</p>
<div class="no-print"><button class="btn" onclick="window.print()">Print / Save as PDF</button></div>
<script>setTimeout(function(){window.print()},350)</script>
</body></html>`);
  win.document.close();
}

function PurchaseOrdersTab({ parties }: { parties: Party[] }) {
  const [orders, setOrders] = useState<PurchaseOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [saving, setSaving] = useState(false);

  const [partyId, setPartyId] = useState('');
  const [expectedDate, setExpectedDate] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [notes, setNotes] = useState('');
  const [items, setItems] = useState<PurchaseItem[]>([emptyItem()]);

  useEffect(() => { load(); }, []);

  async function load() {
    setLoading(true);
    try { setOrders(await getPurchaseOrders()); }
    catch { toast.error('Failed to load orders'); setOrders([]); }
    finally { setLoading(false); }
  }

  function openAdd() {
    setPartyId(parties[0]?.id ?? '');
    setExpectedDate(''); setDueDate(''); setNotes('');
    setItems([emptyItem()]); setShowModal(true);
  }

  function updateItem(idx: number, patch: Partial<PurchaseItem>) {
    setItems(prev => prev.map((it, i) => i === idx ? calcItem({ ...it, ...patch }) : it));
  }

  const orderSubtotal = items.reduce((s, it) => s + it.purchaseRate * it.quantity, 0);
  const orderGst      = items.reduce((s, it) => s + it.gstAmount, 0);
  const orderTotal    = items.reduce((s, it) => s + it.total, 0);

  async function handleDeliveryStatus(order: PurchaseOrder, status: PurchaseOrder['status']) {
    try { await updatePurchaseOrder(order.id, { status }); toast.success(`Marked ${status}`); load(); }
    catch { toast.error('Update failed'); }
  }

  async function handleSave() {
    if (!partyId) { toast.error('Select a party'); return; }
    const validItems = items.filter(it => it.productName);
    if (validItems.length === 0) { toast.error('Add at least one item'); return; }
    setSaving(true);
    try {
      const party    = parties.find(p => p.id === partyId)!;
      const existing = await getPurchaseOrders();
      const orderNumber = `ORD${String(existing.length + 1).padStart(4, '0')}`;
      const orderData: Omit<PurchaseOrder, 'id' | 'createdAt'> = {
        orderNumber, partyId, partyName: party.name,
        items: validItems, total: orderTotal, amountPaid: 0, balance: orderTotal,
        paymentStatus: 'unpaid',
        expectedDate: expectedDate ? new Date(expectedDate) : undefined,
        dueDate: dueDate ? new Date(dueDate) : undefined,
        status: 'pending',
        notes: notes || undefined,
      };
      await createPurchaseOrder(orderData);
      toast.success('Purchase order created');
      setShowModal(false);
      printPurchaseOrder({ ...orderData, id: '', createdAt: new Date() } as PurchaseOrder);
      load();
    } catch (err: any) { toast.error(`Save failed: ${err?.message ?? 'Check Firestore connection'}`); }
    finally { setSaving(false); }
  }

  const totalValue = orders.reduce((s, o) => s + (o.total ?? 0), 0);

  return (
    <>
      {/* Summary strip */}
      {orders.length > 0 && (
        <div className="grid grid-cols-3 gap-3 mb-4">
          <div className="bg-white rounded-xl border border-gray-100 p-4 shadow-sm">
            <p className="text-xs text-gray-500 mb-1">Total Orders</p>
            <p className="text-lg font-bold text-gray-900">{orders.length}</p>
          </div>
          <div className="bg-amber-50 rounded-xl border border-amber-100 p-4 shadow-sm">
            <p className="text-xs text-amber-700 mb-1">Pending</p>
            <p className="text-lg font-bold text-amber-700">{orders.filter(o => o.status === 'pending').length}</p>
          </div>
          <div className="bg-blue-50 rounded-xl border border-blue-100 p-4 shadow-sm">
            <p className="text-xs text-blue-700 mb-1">Total Order Value</p>
            <p className="text-lg font-bold text-blue-700">{formatCurrency(totalValue)}</p>
          </div>
        </div>
      )}

      <div className="flex items-center justify-between mb-4">
        <p className="text-sm text-gray-500">{orders.length} orders</p>
        <button onClick={openAdd} className="flex items-center gap-1.5 px-4 py-2 bg-saffron-400 hover:bg-saffron-500 text-white font-semibold rounded-xl text-sm transition-colors">
          <Plus size={14} /> New Order
        </button>
      </div>

      {loading ? (
        <div className="text-center py-12 text-gray-400 text-sm">Loading…</div>
      ) : orders.length === 0 ? (
        <div className="flex flex-col items-center py-16 gap-3"><ShoppingCart size={40} className="text-gray-200" /><p className="text-gray-400 text-sm">No purchase orders yet</p></div>
      ) : (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-x-auto">
          <table className="w-full text-sm min-w-[700px]">
            <thead className="bg-gray-50 text-xs text-gray-500 uppercase tracking-wide">
              <tr>
                <th className="text-left px-4 py-3">Order #</th>
                <th className="text-left px-4 py-3">Date</th>
                <th className="text-left px-4 py-3">Party</th>
                <th className="text-right px-4 py-3">Total</th>
                <th className="text-left px-4 py-3">Exp. Delivery</th>
                <th className="text-center px-4 py-3">Status</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {orders.map(o => (
                <tr key={o.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 font-mono text-xs font-semibold text-gray-700">{o.orderNumber}</td>
                  <td className="px-4 py-3 text-gray-500 text-xs">{o.createdAt ? format(o.createdAt, 'dd MMM yyyy') : '—'}</td>
                  <td className="px-4 py-3 font-medium text-gray-800">{o.partyName}</td>
                  <td className="px-4 py-3 text-right font-semibold text-gray-900">{formatCurrency(o.total ?? 0)}</td>
                  <td className="px-4 py-3 text-gray-500 text-xs">{o.expectedDate ? format(new Date(o.expectedDate), 'dd MMM yyyy') : '—'}</td>
                  <td className="px-4 py-3 text-center"><StatusBadge status={o.status} /></td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1 justify-end">
                      <button onClick={() => printPurchaseOrder(o)} title="Download / Print" className="p-1.5 text-gray-400 hover:text-saffron-500 hover:bg-saffron-50 rounded-lg transition-colors">
                        <Download size={13} />
                      </button>
                      {o.status === 'pending' && (
                        <>
                          <button onClick={() => handleDeliveryStatus(o, 'received')} className="text-xs px-2 py-1 bg-blue-100 text-blue-700 rounded-lg hover:bg-blue-200 transition-colors">Rcvd</button>
                          <button onClick={() => handleDeliveryStatus(o, 'cancelled')} className="text-xs px-1.5 py-1 bg-red-100 text-red-600 rounded-lg hover:bg-red-200 transition-colors">✕</button>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* ── Create Order Modal ── */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={e => e.target === e.currentTarget && setShowModal(false)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl mx-4 max-h-[90vh] flex flex-col">
            <div className="flex items-center justify-between px-6 py-4 border-b">
              <h2 className="font-bold text-gray-900">New Purchase Order</h2>
              <button onClick={() => setShowModal(false)}><X size={18} className="text-gray-400" /></button>
            </div>
            <div className="flex-1 overflow-y-auto p-6 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="label">Party *</label>
                  <select value={partyId} onChange={e => setPartyId(e.target.value)} className="input">
                    {parties.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                  </select>
                </div>
                <div>
                  <label className="label">Expected Delivery Date</label>
                  <input type="date" value={expectedDate} onChange={e => setExpectedDate(e.target.value)} className="input" />
                </div>
                <div>
                  <label className="label">Payment Due Date</label>
                  <input type="date" value={dueDate} onChange={e => setDueDate(e.target.value)} className="input" />
                </div>
                <div>
                  <label className="label">Notes</label>
                  <input value={notes} onChange={e => setNotes(e.target.value)} className="input" placeholder="Optional" />
                </div>
              </div>

              {/* Items */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="label" style={{ marginBottom: 0 }}>Items</label>
                  <button onClick={() => setItems(p => [...p, emptyItem()])} className="text-xs text-saffron-600 font-medium hover:underline flex items-center gap-1"><Plus size={12} /> Add Item</button>
                </div>
                <div className="space-y-2">
                  {items.map((it, idx) => (
                    <div key={idx} className="grid grid-cols-12 gap-2 items-end bg-gray-50 rounded-xl p-3">
                      <div className="col-span-4">
                        {idx === 0 && <label className="label">Product</label>}
                        <input value={it.productName} onChange={e => updateItem(idx, { productName: e.target.value })} className="input" placeholder="Product name" />
                      </div>
                      <div className="col-span-2">
                        {idx === 0 && <label className="label">Qty</label>}
                        <input type="number" value={it.quantity} onChange={e => updateItem(idx, { quantity: parseFloat(e.target.value) || 0 })} className="input" min="0" step="0.01" />
                      </div>
                      <div className="col-span-1">
                        {idx === 0 && <label className="label">Unit</label>}
                        <select value={it.unit} onChange={e => updateItem(idx, { unit: e.target.value })} className="input">
                          {UNITS.map(u => <option key={u} value={u}>{u}</option>)}
                        </select>
                      </div>
                      <div className="col-span-2">
                        {idx === 0 && <label className="label">Rate (₹)</label>}
                        <input type="number" value={it.purchaseRate} onChange={e => updateItem(idx, { purchaseRate: parseFloat(e.target.value) || 0 })} className="input" min="0" step="0.01" />
                      </div>
                      <div className="col-span-1">
                        {idx === 0 && <label className="label">GST%</label>}
                        <select value={it.gstRate} onChange={e => updateItem(idx, { gstRate: parseInt(e.target.value) })} className="input">
                          {GST_RATES.map(r => <option key={r} value={r}>{r}%</option>)}
                        </select>
                      </div>
                      <div className="col-span-2 flex items-end gap-1">
                        <div className="flex-1">
                          {idx === 0 && <label className="label">Total</label>}
                          <p className="text-sm font-semibold text-gray-800 py-2">{formatCurrency(it.total)}</p>
                        </div>
                        {items.length > 1 && (
                          <button onClick={() => setItems(p => p.filter((_, i) => i !== idx))} className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg mb-1"><X size={14} /></button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Order totals */}
              <div className="border-t pt-4">
                <div className="bg-gray-50 rounded-xl p-4 space-y-1.5 text-sm">
                  <div className="flex justify-between text-gray-600"><span>Subtotal</span><span>{formatCurrency(orderSubtotal)}</span></div>
                  <div className="flex justify-between text-gray-500 text-xs"><span>Total GST</span><span>{formatCurrency(orderGst)}</span></div>
                  <div className="flex justify-between font-bold text-gray-900 border-t pt-1.5"><span>Grand Total</span><span>{formatCurrency(orderTotal)}</span></div>
                </div>
              </div>
            </div>
            <div className="px-6 pb-6 flex gap-3 border-t pt-4">
              <button onClick={() => setShowModal(false)} className="flex-1 py-2.5 border border-gray-200 rounded-xl text-sm text-gray-600 hover:bg-gray-50">Cancel</button>
              <button onClick={handleSave} disabled={saving} className="flex-1 py-2.5 bg-saffron-400 hover:bg-saffron-500 disabled:bg-gray-200 text-white font-semibold rounded-xl text-sm flex items-center justify-center gap-2 transition-colors">
                {saving ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> : <Download size={15} />}
                Create &amp; Download
              </button>
            </div>
          </div>
        </div>
      )}

    </>
  );
}

// ── Purchase Returns Tab ──────────────────────────────────────────────────────

function PurchaseReturnsTab({ parties }: { parties: Party[] }) {
  const [returns, setReturns] = useState<PurchaseReturn[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [saving, setSaving] = useState(false);
  const [partyId, setPartyId] = useState('');
  const [reason, setReason] = useState('');
  const [items, setItems] = useState<PurchaseItem[]>([emptyItem()]);

  useEffect(() => { load(); }, []);

  async function load() {
    setLoading(true);
    try { setReturns(await getPurchaseReturns()); }
    catch { toast.error('Failed to load returns'); setReturns([]); }
    finally { setLoading(false); }
  }

  function updateItem(idx: number, patch: Partial<PurchaseItem>) {
    setItems(prev => prev.map((it, i) => i === idx ? calcItem({ ...it, ...patch }) : it));
  }

  const total = items.reduce((s, it) => s + it.total, 0);

  async function handleSave() {
    if (!partyId) { toast.error('Select a party'); return; }
    const validItems = items.filter(it => it.productName);
    if (validItems.length === 0) { toast.error('Add at least one item'); return; }
    setSaving(true);
    try {
      const party = parties.find(p => p.id === partyId)!;
      const existing = await getPurchaseReturns();
      const returnNumber = `RET${String(existing.length + 1).padStart(4, '0')}`;
      await createPurchaseReturn({ returnNumber, partyId, partyName: party.name, items: validItems, reason: reason || undefined, total, status: 'draft' });
      toast.success('Purchase return created'); setShowModal(false); load();
    } catch (err: any) { toast.error(`Save failed: ${err?.message ?? 'Check Firestore connection'}`); }
    finally { setSaving(false); }
  }

  return (
    <>
      <div className="flex items-center justify-between mb-4">
        <p className="text-sm text-gray-500">{returns.length} returns</p>
        <button onClick={() => { setPartyId(parties[0]?.id ?? ''); setReason(''); setItems([emptyItem()]); setShowModal(true); }}
          className="flex items-center gap-1.5 px-4 py-2 bg-saffron-400 hover:bg-saffron-500 text-white font-semibold rounded-xl text-sm transition-colors">
          <Plus size={14} /> New Return
        </button>
      </div>
      {loading ? (
        <div className="text-center py-12 text-gray-400 text-sm">Loading…</div>
      ) : returns.length === 0 ? (
        <div className="flex flex-col items-center py-16 gap-3"><RotateCcw size={40} className="text-gray-200" /><p className="text-gray-400 text-sm">No purchase returns yet</p></div>
      ) : (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-xs text-gray-500 uppercase tracking-wide">
              <tr>
                <th className="text-left px-5 py-3">Return #</th>
                <th className="text-left px-4 py-3">Date</th>
                <th className="text-left px-4 py-3">Party</th>
                <th className="text-right px-4 py-3">Items</th>
                <th className="text-right px-4 py-3">Total</th>
                <th className="text-center px-4 py-3">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {returns.map(r => (
                <tr key={r.id} className="hover:bg-gray-50">
                  <td className="px-5 py-3 font-mono text-xs font-semibold text-gray-700">{r.returnNumber}</td>
                  <td className="px-4 py-3 text-gray-600 text-xs">{r.createdAt ? format(r.createdAt, 'dd MMM yyyy') : '—'}</td>
                  <td className="px-4 py-3 font-medium text-gray-800">{r.partyName}</td>
                  <td className="px-4 py-3 text-right text-gray-600">{r.items.length}</td>
                  <td className="px-4 py-3 text-right font-semibold text-gray-900">{formatCurrency(r.total)}</td>
                  <td className="px-4 py-3 text-center"><StatusBadge status={r.status} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={e => e.target === e.currentTarget && setShowModal(false)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-xl mx-4 max-h-[90vh] flex flex-col">
            <div className="flex items-center justify-between px-6 py-4 border-b">
              <h2 className="font-bold text-gray-900">New Purchase Return</h2>
              <button onClick={() => setShowModal(false)}><X size={18} className="text-gray-400" /></button>
            </div>
            <div className="flex-1 overflow-y-auto p-6 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="label">Party *</label>
                  <select value={partyId} onChange={e => setPartyId(e.target.value)} className="input">
                    {parties.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                  </select>
                </div>
                <div>
                  <label className="label">Reason</label>
                  <input value={reason} onChange={e => setReason(e.target.value)} className="input" placeholder="e.g. Damaged goods" />
                </div>
              </div>
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="label" style={{ marginBottom: 0 }}>Return Items</label>
                  <button onClick={() => setItems(p => [...p, emptyItem()])} className="text-xs text-saffron-600 font-medium hover:underline flex items-center gap-1"><Plus size={12} /> Add</button>
                </div>
                <div className="space-y-2">
                  {items.map((it, idx) => (
                    <div key={idx} className="grid grid-cols-12 gap-2 items-end bg-gray-50 rounded-xl p-3">
                      <div className="col-span-5">
                        {idx === 0 && <label className="label">Product</label>}
                        <input value={it.productName} onChange={e => updateItem(idx, { productName: e.target.value })} className="input" placeholder="Product name" />
                      </div>
                      <div className="col-span-2">
                        {idx === 0 && <label className="label">Qty</label>}
                        <input type="number" value={it.quantity} onChange={e => updateItem(idx, { quantity: parseFloat(e.target.value) || 0 })} className="input" min="0" />
                      </div>
                      <div className="col-span-2">
                        {idx === 0 && <label className="label">Rate (₹)</label>}
                        <input type="number" value={it.purchaseRate} onChange={e => updateItem(idx, { purchaseRate: parseFloat(e.target.value) || 0 })} className="input" min="0" step="0.01" />
                      </div>
                      <div className="col-span-2">
                        {idx === 0 && <label className="label">Amount</label>}
                        <p className="text-sm font-semibold text-gray-800 py-2">{formatCurrency(it.total)}</p>
                      </div>
                      <div className="col-span-1 flex items-end">
                        {items.length > 1 && (
                          <button onClick={() => setItems(p => p.filter((_, i) => i !== idx))} className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg">
                            <X size={14} />
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
              <div className="flex justify-end">
                <p className="text-sm font-bold text-gray-900">Return Total: {formatCurrency(total)}</p>
              </div>
            </div>
            <div className="px-6 pb-6 flex gap-3 border-t pt-4">
              <button onClick={() => setShowModal(false)} className="flex-1 py-2.5 border border-gray-200 rounded-xl text-sm text-gray-600 hover:bg-gray-50">Cancel</button>
              <button onClick={handleSave} disabled={saving} className="flex-1 py-2.5 bg-saffron-400 hover:bg-saffron-500 disabled:bg-gray-200 text-white font-semibold rounded-xl text-sm flex items-center justify-center gap-2 transition-colors">
                {saving ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> : <Check size={16} />}
                Create Return
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

// ── Debit Notes Tab ───────────────────────────────────────────────────────────

function DebitNotesTab({ parties }: { parties: Party[] }) {
  const [notes, setNotes] = useState<DebitNote[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [saving, setSaving] = useState(false);
  const [partyId, setPartyId] = useState('');
  const [amount, setAmount] = useState('');
  const [reason, setReason] = useState('');
  const [linkedBill, setLinkedBill] = useState('');

  useEffect(() => { load(); }, []);

  async function load() {
    setLoading(true);
    try { setNotes(await getDebitNotes()); }
    catch { toast.error('Failed to load debit notes'); setNotes([]); }
    finally { setLoading(false); }
  }

  async function handleSave() {
    if (!partyId) { toast.error('Select a party'); return; }
    if (!amount || parseFloat(amount) <= 0) { toast.error('Enter a valid amount'); return; }
    if (!reason.trim()) { toast.error('Reason is required'); return; }
    setSaving(true);
    try {
      const party = parties.find(p => p.id === partyId)!;
      const existing = await getDebitNotes();
      const noteNumber = `DN${String(existing.length + 1).padStart(4, '0')}`;
      await createDebitNote({ noteNumber, partyId, partyName: party.name, purchaseBillId: linkedBill || undefined, amount: parseFloat(amount), reason, status: 'draft' });
      toast.success('Debit note created'); setShowModal(false); load();
    } catch (err: any) { toast.error(`Save failed: ${err?.message ?? 'Check Firestore connection'}`); }
    finally { setSaving(false); }
  }

  return (
    <>
      <div className="flex items-center justify-between mb-4">
        <p className="text-sm text-gray-500">{notes.length} debit notes</p>
        <button onClick={() => { setPartyId(parties[0]?.id ?? ''); setAmount(''); setReason(''); setLinkedBill(''); setShowModal(true); }}
          className="flex items-center gap-1.5 px-4 py-2 bg-saffron-400 hover:bg-saffron-500 text-white font-semibold rounded-xl text-sm transition-colors">
          <Plus size={14} /> New Debit Note
        </button>
      </div>
      {loading ? (
        <div className="text-center py-12 text-gray-400 text-sm">Loading…</div>
      ) : notes.length === 0 ? (
        <div className="flex flex-col items-center py-16 gap-3"><FileMinus size={40} className="text-gray-200" /><p className="text-gray-400 text-sm">No debit notes yet</p></div>
      ) : (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-xs text-gray-500 uppercase tracking-wide">
              <tr>
                <th className="text-left px-5 py-3">Note #</th>
                <th className="text-left px-4 py-3">Date</th>
                <th className="text-left px-4 py-3">Party</th>
                <th className="text-right px-4 py-3">Amount</th>
                <th className="text-left px-4 py-3">Reason</th>
                <th className="text-center px-4 py-3">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {notes.map(n => (
                <tr key={n.id} className="hover:bg-gray-50">
                  <td className="px-5 py-3 font-mono text-xs font-semibold text-gray-700">{n.noteNumber}</td>
                  <td className="px-4 py-3 text-gray-600 text-xs">{n.createdAt ? format(n.createdAt, 'dd MMM yyyy') : '—'}</td>
                  <td className="px-4 py-3 font-medium text-gray-800">{n.partyName}</td>
                  <td className="px-4 py-3 text-right font-semibold text-red-600">{formatCurrency(n.amount)}</td>
                  <td className="px-4 py-3 text-gray-600 text-xs max-w-[200px] truncate">{n.reason}</td>
                  <td className="px-4 py-3 text-center"><StatusBadge status={n.status} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={e => e.target === e.currentTarget && setShowModal(false)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md mx-4">
            <div className="flex items-center justify-between px-6 py-4 border-b">
              <h2 className="font-bold text-gray-900">New Debit Note</h2>
              <button onClick={() => setShowModal(false)}><X size={18} className="text-gray-400" /></button>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="label">Party *</label>
                <select value={partyId} onChange={e => setPartyId(e.target.value)} className="input">
                  {parties.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
              </div>
              <div>
                <label className="label">Amount (₹) *</label>
                <input type="number" value={amount} onChange={e => setAmount(e.target.value)} className="input" placeholder="0.00" min="0" step="0.01" />
              </div>
              <div>
                <label className="label">Reason *</label>
                <input value={reason} onChange={e => setReason(e.target.value)} className="input" placeholder="e.g. Short supply, Quality issue" />
              </div>
              <div>
                <label className="label">Linked Purchase Bill # (Optional)</label>
                <input value={linkedBill} onChange={e => setLinkedBill(e.target.value)} className="input" placeholder="e.g. PUR260424-001" />
              </div>
            </div>
            <div className="px-6 pb-6 flex gap-3">
              <button onClick={() => setShowModal(false)} className="flex-1 py-2.5 border border-gray-200 rounded-xl text-sm text-gray-600 hover:bg-gray-50">Cancel</button>
              <button onClick={handleSave} disabled={saving} className="flex-1 py-2.5 bg-saffron-400 hover:bg-saffron-500 disabled:bg-gray-200 text-white font-semibold rounded-xl text-sm flex items-center justify-center gap-2 transition-colors">
                {saving ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> : <Check size={16} />}
                Create Debit Note
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

// ── Main Purchases Page ───────────────────────────────────────────────────────

export default function PurchasesPage() {
  const [tab, setTab] = useState<Tab>('parties');
  const [parties, setParties] = useState<Party[]>([]);

  // Load parties once for all child tabs that need them
  useEffect(() => {
    getParties().then(setParties).catch(() => setParties([]));
  }, []);

  // Reload parties when switching to parties tab (so other tabs see fresh list)
  useEffect(() => {
    if (tab !== 'parties') {
      getParties().then(setParties).catch(() => {});
    }
  }, [tab]);

  return (
    <div className="flex-1 flex flex-col overflow-hidden bg-gray-50">
      <Toaster position="top-right" />

      {/* Header */}
      <div className="bg-white border-b border-gray-200 px-6 py-4 flex-shrink-0 sticky top-0 z-10">
        <h1 className="text-lg font-bold text-gray-900">Purchases</h1>
        <p className="text-xs text-gray-500">Vendor management, purchase bills, orders & returns</p>
      </div>

      {/* Tab Bar */}
      <div className="bg-white border-b border-gray-100 px-6 flex-shrink-0">
        <div className="flex gap-0">
          {TABS.map(t => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`flex items-center gap-1.5 px-4 py-3 text-sm font-medium border-b-2 transition-all whitespace-nowrap ${
                tab === t.key
                  ? 'border-saffron-400 text-saffron-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-200'
              }`}
            >
              {t.icon}
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {/* Tab Content */}
      <div className="flex-1 overflow-y-auto p-6">
        {tab === 'parties' && <PartiesTab />}
        {tab === 'bills' && <PurchaseBillsTab parties={parties} />}
        {tab === 'orders' && <PurchaseOrdersTab parties={parties} />}
        {tab === 'returns' && <PurchaseReturnsTab parties={parties} />}
        {tab === 'debit' && <DebitNotesTab parties={parties} />}
      </div>

      <style>{`.label{display:block;font-size:11px;font-weight:600;color:#6b7280;margin-bottom:4px;text-transform:uppercase;letter-spacing:.04em}.input{width:100%;padding:8px 12px;border:1.5px solid #e5e7eb;border-radius:10px;font-size:13px;outline:none;transition:border-color .15s}.input:focus{border-color:#ff9933}`}</style>
    </div>
  );
}
