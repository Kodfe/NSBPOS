'use client';
import { useState, useEffect, useCallback } from 'react';
import { format, subDays, startOfDay, endOfDay, startOfMonth, endOfMonth } from 'date-fns';
import { Download, RefreshCw, TrendingUp, TrendingDown, Receipt, Package, CalendarDays } from 'lucide-react';
import toast, { Toaster } from 'react-hot-toast';
import { getAllBills } from '@/lib/firestore';
import { getAllProducts } from '@/lib/admin-firestore';
import { loadSettings, DEFAULT_SETTINGS } from '@/lib/settings';
import { formatCurrency } from '@/lib/utils';
import { Bill, Product, StoreSettings } from '@/types';

type Range = 'today' | 'yesterday' | '7days' | '30days' | 'month' | 'financialYear' | 'custom';
type ReportTab = 'summary' | 'pl' | 'gst';

const GST_SLABS = [0, 5, 12, 18, 28];

function getCurrentFinancialYear(settings: StoreSettings) {
  return settings.financialYears?.find(y => y.isCurrent) || settings.financialYears?.[0];
}

function getRange(r: Range, from: string, to: string, settings: StoreSettings = DEFAULT_SETTINGS) {
  const now = new Date();
  const fy = getCurrentFinancialYear(settings);
  switch (r) {
    case 'today':     return { from: startOfDay(now), to: endOfDay(now) };
    case 'yesterday': return { from: startOfDay(subDays(now, 1)), to: endOfDay(subDays(now, 1)) };
    case '7days':     return { from: startOfDay(subDays(now, 6)), to: endOfDay(now) };
    case '30days':    return { from: startOfDay(subDays(now, 29)), to: endOfDay(now) };
    case 'month':     return { from: startOfMonth(now), to: endOfMonth(now) };
    case 'financialYear': return {
      from: fy?.startDate ? startOfDay(new Date(fy.startDate)) : startOfDay(new Date(now.getFullYear(), 3, 1)),
      to: fy?.endDate ? endOfDay(new Date(fy.endDate)) : endOfDay(new Date(now.getFullYear() + 1, 2, 31)),
    };
    case 'custom':    return {
      from: from ? startOfDay(new Date(from)) : startOfDay(subDays(now, 30)),
      to:   to   ? endOfDay(new Date(to))     : endOfDay(now),
    };
  }
}

// ── GST report HTML generator ─────────────────────────────────────────────────

function downloadGSTReport(
  bills: Bill[],
  settings: StoreSettings,
  from: Date,
  to: Date,
) {
  type SlabRow = { gross: number; taxable: number; cgst: number; sgst: number };
  const slabs: Record<number, SlabRow> = {};
  GST_SLABS.forEach(s => { slabs[s] = { gross: 0, taxable: 0, cgst: 0, sgst: 0 }; });

  for (const bill of bills) {
    for (const item of bill.items) {
      const rate = item.product.gstRate ?? 0;
      const slab = slabs[rate] ?? (slabs[rate] = { gross: 0, taxable: 0, cgst: 0, sgst: 0 });
      slab.gross    += item.total;
      slab.taxable  += item.total - item.gstAmount;
      slab.cgst     += item.cgst ?? (item.gstAmount / 2);
      slab.sgst     += item.sgst ?? (item.gstAmount / 2);
    }
  }

  const totals = Object.values(slabs).reduce(
    (acc, r) => ({ gross: acc.gross + r.gross, taxable: acc.taxable + r.taxable, cgst: acc.cgst + r.cgst, sgst: acc.sgst + r.sgst }),
    { gross: 0, taxable: 0, cgst: 0, sgst: 0 },
  );

  const f = (n: number) => `₹${n.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  const fmt = (d: Date) => format(d, 'dd MMM yyyy');

  const rows = GST_SLABS.map(rate => {
    const r = slabs[rate];
    if (!r || r.gross === 0) return '';
    return `<tr>
      <td><strong>${rate}%</strong></td>
      <td align="right">${f(r.gross)}</td>
      <td align="right">${f(r.taxable)}</td>
      <td align="right">${f(r.cgst)}</td>
      <td align="right">${f(r.sgst)}</td>
      <td align="right">${f(r.cgst + r.sgst)}</td>
    </tr>`;
  }).join('');

  const win = window.open('', '_blank');
  if (!win) { toast.error('Allow popups to download the GST report'); return; }

  win.document.write(`<!DOCTYPE html><html><head>
<title>GST Report — ${settings.storeName}</title>
<style>
*{box-sizing:border-box}
body{font-family:Arial,sans-serif;padding:32px;max-width:800px;margin:0 auto;color:#1f2937;font-size:13px}
h2{color:#ff9933;margin:0 0 2px;font-size:20px}
h3{font-size:14px;color:#374151;margin:24px 0 8px;border-bottom:1px solid #e5e7eb;padding-bottom:4px}
p{margin:2px 0;color:#6b7280}
table{width:100%;border-collapse:collapse;margin-top:8px}
th{background:#f9fafb;font-size:11px;text-transform:uppercase;letter-spacing:.05em;padding:9px 12px;border:1px solid #e5e7eb;text-align:left}
td{padding:8px 12px;border:1px solid #f3f4f6}
tr:nth-child(even) td{background:#fafafa}
.total-row td{font-weight:700;background:#fff7ed;border-top:2px solid #ff9933}
.meta{display:flex;justify-content:space-between;margin-bottom:20px;padding-bottom:16px;border-bottom:2px solid #e5e7eb}
.stat-box{background:#f9fafb;border:1px solid #e5e7eb;padding:12px 16px;border-radius:8px;text-align:center}
.stat-label{font-size:11px;color:#6b7280;text-transform:uppercase;letter-spacing:.05em}
.stat-val{font-size:18px;font-weight:700;color:#111827;margin-top:2px}
.stats-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin-bottom:20px}
footer{margin-top:32px;font-size:11px;color:#9ca3af;border-top:1px solid #e5e7eb;padding-top:12px}
.btn{padding:9px 20px;background:#ff9933;color:#fff;border:none;border-radius:8px;cursor:pointer;font-size:13px;margin-right:8px}
@media print{.no-print{display:none}}
</style></head><body>

<div class="meta">
  <div>
    <h2>${settings.storeName}</h2>
    <p>${settings.address || ''}</p>
    <p>GSTIN: <strong>${settings.gstin || 'Not set'}</strong></p>
  </div>
  <div style="text-align:right">
    <p style="font-size:16px;font-weight:700;color:#374151">GST Compliance Report</p>
    <p>Period: <strong>${fmt(from)} — ${fmt(to)}</strong></p>
    <p>Generated: ${fmt(new Date())}</p>
  </div>
</div>

<div class="stats-grid">
  <div class="stat-box"><div class="stat-label">Total Bills</div><div class="stat-val">${bills.length}</div></div>
  <div class="stat-box"><div class="stat-label">Gross Sales</div><div class="stat-val">${f(totals.gross)}</div></div>
  <div class="stat-box"><div class="stat-label">Total CGST</div><div class="stat-val">${f(totals.cgst)}</div></div>
  <div class="stat-box"><div class="stat-label">Total SGST</div><div class="stat-val">${f(totals.sgst)}</div></div>
</div>

<h3>Rate-wise Outward Supply Summary (B2C)</h3>
<table>
  <thead><tr>
    <th>Tax Rate</th>
    <th align="right">Gross Value</th>
    <th align="right">Taxable Value</th>
    <th align="right">CGST</th>
    <th align="right">SGST</th>
    <th align="right">Total Tax</th>
  </tr></thead>
  <tbody>
    ${rows || '<tr><td colspan="6" align="center" style="color:#9ca3af">No taxable sales in this period</td></tr>'}
    <tr class="total-row">
      <td>TOTAL</td>
      <td align="right">${f(totals.gross)}</td>
      <td align="right">${f(totals.taxable)}</td>
      <td align="right">${f(totals.cgst)}</td>
      <td align="right">${f(totals.sgst)}</td>
      <td align="right">${f(totals.cgst + totals.sgst)}</td>
    </tr>
  </tbody>
</table>

<h3>HSN / SAC Summary</h3>
<table>
  <thead><tr>
    <th>HSN Code</th><th>Description</th><th align="right">Qty</th><th align="right">Taxable Value</th><th align="right">Tax Rate</th><th align="right">Tax Amount</th>
  </tr></thead>
  <tbody>
    ${(() => {
      const hsnMap: Record<string, { name: string; qty: number; taxable: number; rate: number; tax: number }> = {};
      for (const bill of bills) {
        for (const item of bill.items) {
          const hsn = item.product.hsnCode || 'N/A';
          if (!hsnMap[hsn]) hsnMap[hsn] = { name: item.product.name, qty: 0, taxable: 0, rate: item.product.gstRate ?? 0, tax: 0 };
          hsnMap[hsn].qty     += item.quantity;
          hsnMap[hsn].taxable += item.total - item.gstAmount;
          hsnMap[hsn].tax     += item.gstAmount;
        }
      }
      return Object.entries(hsnMap).map(([hsn, r]) =>
        `<tr><td><strong>${hsn}</strong></td><td>${r.name}</td><td align="right">${r.qty.toFixed(2)}</td><td align="right">${f(r.taxable)}</td><td align="right">${r.rate}%</td><td align="right">${f(r.tax)}</td></tr>`
      ).join('') || '<tr><td colspan="6" align="center" style="color:#9ca3af">No data</td></tr>';
    })()}
  </tbody>
</table>

<footer>
  This report is generated from NSB POS billing data. Verify figures with your accountant before filing GSTR-1.
  <br/>Generated on ${new Date().toLocaleString('en-IN')}
</footer>

<div class="no-print" style="margin-top:20px">
  <button class="btn" onclick="window.print()">Print / Save as PDF</button>
</div>

<script>setTimeout(function(){window.print()},400)</script>
</body></html>`);
  win.document.close();
}

function downloadEndOfYearReport(
  bills: Bill[],
  settings: StoreSettings,
  from: Date,
  to: Date,
  plRows: { name: string; category: string; qtySold: number; revenue: number; cogs: number; profit: number; margin: number }[],
) {
  const win = window.open('', '_blank');
  if (!win) { toast.error('Allow popups to download the year-end report'); return; }
  const f = (n: number) => `₹${n.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  const fmt = (d: Date) => format(d, 'dd MMM yyyy');
  const totalRevenue = bills.reduce((s, b) => s + b.total, 0);
  const totalGst = bills.reduce((s, b) => s + b.totalGst, 0);
  const totalDiscount = bills.reduce((s, b) => s + b.totalDiscount, 0);
  const totalCogs = plRows.reduce((s, r) => s + r.cogs, 0);
  const grossProfit = totalRevenue - totalCogs;
  const fy = getCurrentFinancialYear(settings);

  win.document.write(`<!doctype html><html><head><title>End of Year Report - ${settings.storeName}</title>
<style>
body{font-family:Arial,sans-serif;padding:32px;max-width:900px;margin:0 auto;color:#111827;font-size:13px}
h1{font-size:22px;margin:0;color:#ff9933}h2{font-size:15px;margin:22px 0 8px;border-bottom:1px solid #e5e7eb;padding-bottom:5px}
p{margin:3px 0;color:#4b5563}.meta{display:flex;justify-content:space-between;border-bottom:2px solid #e5e7eb;padding-bottom:16px;margin-bottom:18px}
table{width:100%;border-collapse:collapse;margin-top:8px}th{background:#f9fafb;text-align:left;font-size:11px;text-transform:uppercase;color:#6b7280;padding:8px;border:1px solid #e5e7eb}td{padding:8px;border:1px solid #f3f4f6}.right{text-align:right}.bold{font-weight:700}.grid{display:grid;grid-template-columns:repeat(4,1fr);gap:10px}.box{border:1px solid #e5e7eb;background:#f9fafb;border-radius:8px;padding:12px}.label{font-size:10px;text-transform:uppercase;color:#6b7280}.val{font-size:16px;font-weight:700;margin-top:3px}.profit{color:${grossProfit >= 0 ? '#16a34a' : '#dc2626'}}.btn{margin-top:20px;background:#ff9933;color:white;border:0;border-radius:8px;padding:9px 18px;font-weight:700}@media print{.no-print{display:none}}
</style></head><body>
<div class="meta"><div><h1>${settings.storeName}</h1><p>${settings.address || ''}</p><p>GSTIN: ${settings.gstin || 'Not set'}</p></div><div class="right"><p class="bold">End of Year Report for CA</p><p>${fy?.label || 'Financial Year'}</p><p>${fmt(from)} - ${fmt(to)}</p><p>Generated: ${new Date().toLocaleString('en-IN')}</p></div></div>
<div class="grid">
<div class="box"><div class="label">Bills</div><div class="val">${bills.length}</div></div>
<div class="box"><div class="label">Gross Sales</div><div class="val">${f(totalRevenue)}</div></div>
<div class="box"><div class="label">GST</div><div class="val">${f(totalGst)}</div></div>
<div class="box"><div class="label">Gross Profit</div><div class="val profit">${f(grossProfit)}</div></div>
</div>
<h2>Summary</h2>
<table><tbody>
<tr><td>Total Sales</td><td class="right bold">${f(totalRevenue)}</td></tr>
<tr><td>Total Discounts</td><td class="right">${f(totalDiscount)}</td></tr>
<tr><td>Total GST Collected</td><td class="right">${f(totalGst)}</td></tr>
<tr><td>Estimated Cost of Goods Sold</td><td class="right">${f(totalCogs)}</td></tr>
<tr><td class="bold">Estimated Gross Profit</td><td class="right bold profit">${f(grossProfit)}</td></tr>
</tbody></table>
<h2>Product P&L Summary</h2>
<table><thead><tr><th>Product</th><th>Category</th><th class="right">Qty</th><th class="right">Sales</th><th class="right">COGS</th><th class="right">Profit</th></tr></thead><tbody>
${plRows.map(r => `<tr><td>${r.name}</td><td>${r.category}</td><td class="right">${r.qtySold.toFixed(2)}</td><td class="right">${f(r.revenue)}</td><td class="right">${f(r.cogs)}</td><td class="right">${f(r.profit)}</td></tr>`).join('') || '<tr><td colspan="6" class="right">No sales data</td></tr>'}
</tbody></table>
<p style="margin-top:24px;font-size:11px;color:#6b7280">This report is generated from NSB POS data for accountant review. Please verify figures before statutory filing.</p>
<button class="btn no-print" onclick="window.print()">Print / Save as PDF</button>
<script>setTimeout(function(){window.print()},400)</script>
</body></html>`);
  win.document.close();
}

// ── Main Reports Page ─────────────────────────────────────────────────────────

export default function ReportsPage() {
  const [range, setRange]             = useState<Range>('month');
  const [customFrom, setCustomFrom]   = useState('');
  const [customTo, setCustomTo]       = useState('');
  const [tab, setTab]                 = useState<ReportTab>('summary');
  const [bills, setBills]             = useState<Bill[]>([]);
  const [products, setProducts]       = useState<Product[]>([]);
  const [settings, setSettings]       = useState<StoreSettings>(DEFAULT_SETTINGS);
  const [loading, setLoading]         = useState(false);

  useEffect(() => {
    loadSettings().then(setSettings);
    getAllProducts().then(setProducts).catch(() => {});
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { from, to } = getRange(range, customFrom, customTo, settings);
      const all = await getAllBills();
      setBills(all.filter(b => b.status === 'paid' && b.createdAt >= from && b.createdAt <= to));
    } catch { toast.error('Failed to load data'); }
    finally { setLoading(false); }
  }, [range, customFrom, customTo, settings]);

  useEffect(() => { load(); }, [load]);

  const { from, to } = getRange(range, customFrom, customTo, settings);
  const currentFinancialYear = getCurrentFinancialYear(settings);

  // ── Summary stats ─────────────────────────────────────────────────────────
  const totalRevenue  = bills.reduce((s, b) => s + b.total, 0);
  const totalGst      = bills.reduce((s, b) => s + b.totalGst, 0);
  const totalDiscount = bills.reduce((s, b) => s + b.totalDiscount, 0);
  const cashSales     = bills.filter(b => b.paymentMethod === 'cash').reduce((s, b) => s + b.total, 0);
  const upiSales      = bills.filter(b => b.paymentMethod === 'upi').reduce((s, b) => s + b.total, 0);
  const cardSales     = bills.filter(b => b.paymentMethod === 'card').reduce((s, b) => s + b.total, 0);
  const mixedSales    = bills.filter(b => b.paymentMethod === 'mixed').reduce((s, b) => s + b.total, 0);

  // ── P&L stats ─────────────────────────────────────────────────────────────
  type PLRow = { name: string; category: string; qtySold: number; revenue: number; cogs: number; profit: number; margin: number };
  const productMap = Object.fromEntries(products.map(p => [p.id, p]));
  const plMap: Record<string, PLRow> = {};

  for (const bill of bills) {
    for (const item of bill.items) {
      const pid = item.product.id;
      const prod = productMap[pid] ?? item.product;
      if (!plMap[pid]) {
        plMap[pid] = { name: prod.name, category: prod.category, qtySold: 0, revenue: 0, cogs: 0, profit: 0, margin: 0 };
      }
      const qty = item.weightKg ?? item.quantity;
      plMap[pid].qtySold  += qty;
      plMap[pid].revenue  += item.total;
      const cp = prod.purchasePrice ?? 0;
      plMap[pid].cogs     += cp > 0 ? cp * qty : 0;
    }
  }
  const plRows = Object.values(plMap).map(r => ({
    ...r,
    profit: r.revenue - r.cogs,
    margin: r.revenue > 0 ? ((r.revenue - r.cogs) / r.revenue) * 100 : 0,
  })).sort((a, b) => b.profit - a.profit);

  const totalCOGS   = plRows.reduce((s, r) => s + r.cogs, 0);
  const totalProfit = totalRevenue - totalCOGS;
  const hasCOGS     = plRows.some(r => r.cogs > 0);

  // ── GST breakdown ─────────────────────────────────────────────────────────
  const gstSlabs: Record<number, { gross: number; taxable: number; cgst: number; sgst: number }> = {};
  GST_SLABS.forEach(s => { gstSlabs[s] = { gross: 0, taxable: 0, cgst: 0, sgst: 0 }; });
  for (const bill of bills) {
    for (const item of bill.items) {
      const rate = item.product.gstRate ?? 0;
      const slab = gstSlabs[rate] ?? (gstSlabs[rate] = { gross: 0, taxable: 0, cgst: 0, sgst: 0 });
      slab.gross   += item.total;
      slab.taxable += item.total - item.gstAmount;
      slab.cgst    += item.cgst ?? (item.gstAmount / 2);
      slab.sgst    += item.sgst ?? (item.gstAmount / 2);
    }
  }
  const gstTotals = Object.values(gstSlabs).reduce(
    (acc, r) => ({ gross: acc.gross + r.gross, taxable: acc.taxable + r.taxable, cgst: acc.cgst + r.cgst, sgst: acc.sgst + r.sgst }),
    { gross: 0, taxable: 0, cgst: 0, sgst: 0 },
  );

  const RANGES: { key: Range; label: string }[] = [
    { key: 'today', label: 'Today' }, { key: 'yesterday', label: 'Yesterday' },
    { key: '7days', label: '7 Days' }, { key: '30days', label: '30 Days' },
    { key: 'month', label: 'This Month' }, { key: 'financialYear', label: currentFinancialYear?.label || 'Financial Year' }, { key: 'custom', label: 'Custom' },
  ];

  return (
    <div className="flex-1 flex flex-col overflow-hidden bg-gray-50">
      <Toaster position="top-right" />

      {/* Header */}
      <div className="bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between flex-shrink-0 sticky top-0 z-10">
        <div>
          <h1 className="text-lg font-bold text-gray-900">Reports</h1>
          <p className="text-xs text-gray-500">P&amp;L analysis · GST compliance · {bills.length} bills loaded</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => { setRange('financialYear'); setTab('pl'); }} className="flex items-center gap-1.5 px-3 py-2 border border-gray-200 rounded-lg text-sm text-gray-600 hover:bg-gray-50">
            <CalendarDays size={14} /> End of Year
          </button>
          <button onClick={() => downloadEndOfYearReport(bills, settings, from, to, plRows)} className="flex items-center gap-1.5 px-3 py-2 bg-saffron-400 hover:bg-saffron-500 text-white rounded-lg text-sm font-semibold">
            <Download size={14} /> CA PDF
          </button>
          <button onClick={load} className="flex items-center gap-1.5 px-3 py-2 border border-gray-200 rounded-lg text-sm text-gray-600 hover:bg-gray-50">
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} /> Refresh
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-6 space-y-5">

        {/* Date range */}
        <div className="flex flex-wrap items-center gap-2">
          {RANGES.map(r => (
            <button key={r.key} onClick={() => setRange(r.key)}
              className={`px-4 py-2 rounded-xl text-sm font-medium transition-all ${range === r.key ? 'bg-saffron-400 text-white shadow-sm' : 'bg-white border border-gray-200 text-gray-600 hover:border-saffron-300'}`}>
              {r.label}
            </button>
          ))}
          {range === 'custom' && (
            <div className="flex items-center gap-2 ml-1">
              <input type="date" value={customFrom} onChange={e => setCustomFrom(e.target.value)} className="px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:border-saffron-400" />
              <span className="text-gray-400 text-sm">to</span>
              <input type="date" value={customTo} onChange={e => setCustomTo(e.target.value)} className="px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:border-saffron-400" />
            </div>
          )}
        </div>

        {/* Report tabs */}
        <div className="flex gap-0 bg-white rounded-2xl border border-gray-100 overflow-hidden shadow-sm">
          {([['summary', 'Sales Summary'], ['pl', 'P&L Report'], ['gst', 'GST Report']] as [ReportTab, string][]).map(([key, label]) => (
            <button key={key} onClick={() => setTab(key)}
              className={`flex-1 py-3 text-sm font-medium transition-all border-b-2 ${tab === key ? 'border-saffron-400 text-saffron-600 bg-saffron-50' : 'border-transparent text-gray-500 hover:text-gray-700 hover:bg-gray-50'}`}>
              {label}
            </button>
          ))}
        </div>

        {/* ── Sales Summary Tab ── */}
        {tab === 'summary' && (
          <div className="space-y-5">
            <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
              <div className="bg-white rounded-2xl border border-gray-100 p-5 shadow-sm">
                <p className="text-xs text-gray-500 mb-1">Total Revenue</p>
                <p className="text-2xl font-bold text-gray-900">{formatCurrency(totalRevenue)}</p>
                <p className="text-xs text-gray-400 mt-1">{bills.length} bills</p>
              </div>
              <div className="bg-white rounded-2xl border border-gray-100 p-5 shadow-sm">
                <p className="text-xs text-gray-500 mb-1">Total GST Collected</p>
                <p className="text-2xl font-bold text-saffron-600">{formatCurrency(totalGst)}</p>
                <p className="text-xs text-gray-400 mt-1">CGST + SGST</p>
              </div>
              <div className="bg-white rounded-2xl border border-gray-100 p-5 shadow-sm">
                <p className="text-xs text-gray-500 mb-1">Total Discounts</p>
                <p className="text-2xl font-bold text-red-500">{formatCurrency(totalDiscount)}</p>
              </div>
              <div className="bg-white rounded-2xl border border-gray-100 p-5 shadow-sm">
                <p className="text-xs text-gray-500 mb-1">Avg Bill Value</p>
                <p className="text-2xl font-bold text-gray-900">{formatCurrency(bills.length > 0 ? totalRevenue / bills.length : 0)}</p>
              </div>
            </div>

            {/* Payment split */}
            <div className="bg-white rounded-2xl border border-gray-100 p-5 shadow-sm">
              <h3 className="text-sm font-bold text-gray-800 mb-4">Payment Method Breakdown</h3>
              <div className="grid grid-cols-4 gap-4">
                {[['Cash', cashSales, 'text-green-600'], ['UPI', upiSales, 'text-blue-600'], ['Card', cardSales, 'text-purple-600'], ['Mixed', mixedSales, 'text-amber-600']] .map(([label, val, cls]) => (
                  <div key={label as string} className="text-center">
                    <p className="text-xs text-gray-500 mb-1">{label as string}</p>
                    <p className={`text-lg font-bold ${cls as string}`}>{formatCurrency(val as number)}</p>
                    <p className="text-xs text-gray-400">{totalRevenue > 0 ? (((val as number) / totalRevenue) * 100).toFixed(1) : 0}%</p>
                  </div>
                ))}
              </div>
            </div>

            {/* Top products */}
            {plRows.length > 0 && (
              <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                <div className="px-5 py-4 border-b border-gray-100 flex items-center gap-2">
                  <Package size={16} className="text-saffron-500" />
                  <h3 className="text-sm font-bold text-gray-800">Top Products by Revenue</h3>
                </div>
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 text-xs text-gray-500 uppercase tracking-wide">
                    <tr>
                      <th className="text-left px-5 py-3">#</th>
                      <th className="text-left px-5 py-3">Product</th>
                      <th className="text-left px-5 py-3">Category</th>
                      <th className="text-right px-5 py-3">Qty Sold</th>
                      <th className="text-right px-5 py-3">Revenue</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {plRows.slice(0, 10).map((r, i) => (
                      <tr key={i} className="hover:bg-gray-50">
                        <td className="px-5 py-3 text-gray-400 font-mono text-xs">{i + 1}</td>
                        <td className="px-5 py-3 font-medium text-gray-800">{r.name}</td>
                        <td className="px-5 py-3 text-gray-500 text-xs">{r.category}</td>
                        <td className="px-5 py-3 text-right text-gray-600">{r.qtySold.toFixed(2)}</td>
                        <td className="px-5 py-3 text-right font-semibold text-saffron-600">{formatCurrency(r.revenue)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {bills.length === 0 && !loading && (
              <div className="text-center py-16 text-gray-400"><Receipt size={40} className="mx-auto mb-3 opacity-30" /><p>No paid bills found for this period</p></div>
            )}
          </div>
        )}

        {/* ── P&L Tab ── */}
        {tab === 'pl' && (
          <div className="space-y-5">
            {!hasCOGS && (
              <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 text-sm text-amber-800">
                <strong>Set purchase prices to see full P&amp;L.</strong> Go to Products → edit each product → fill in the &quot;Purchase / Cost Price&quot; field.
              </div>
            )}

            <div className="grid grid-cols-3 gap-4">
              <div className="bg-white rounded-2xl border border-gray-100 p-5 shadow-sm">
                <p className="text-xs text-gray-500 mb-1">Total Revenue</p>
                <p className="text-2xl font-bold text-gray-900">{formatCurrency(totalRevenue)}</p>
              </div>
              <div className="bg-white rounded-2xl border border-gray-100 p-5 shadow-sm">
                <p className="text-xs text-gray-500 mb-1">Est. Cost of Goods</p>
                <p className="text-2xl font-bold text-red-500">{hasCOGS ? formatCurrency(totalCOGS) : '—'}</p>
                {!hasCOGS && <p className="text-xs text-gray-400 mt-1">Add purchase prices</p>}
              </div>
              <div className={`rounded-2xl border p-5 shadow-sm ${totalProfit >= 0 ? 'bg-green-50 border-green-100' : 'bg-red-50 border-red-100'}`}>
                <p className="text-xs text-gray-500 mb-1">Gross Profit</p>
                <div className="flex items-center gap-2">
                  {totalProfit >= 0 ? <TrendingUp size={20} className="text-green-600" /> : <TrendingDown size={20} className="text-red-500" />}
                  <p className={`text-2xl font-bold ${totalProfit >= 0 ? 'text-green-700' : 'text-red-600'}`}>{hasCOGS ? formatCurrency(totalProfit) : '—'}</p>
                </div>
                {hasCOGS && totalRevenue > 0 && (
                  <p className="text-xs text-gray-500 mt-1">{((totalProfit / totalRevenue) * 100).toFixed(1)}% margin</p>
                )}
              </div>
            </div>

            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
              <div className="px-5 py-4 border-b border-gray-100">
                <h3 className="text-sm font-bold text-gray-800">Product-wise P&amp;L</h3>
                {!hasCOGS && <p className="text-xs text-gray-400 mt-0.5">Cost prices not set — showing revenue only</p>}
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 text-xs text-gray-500 uppercase tracking-wide">
                    <tr>
                      <th className="text-left px-5 py-3">Product</th>
                      <th className="text-left px-5 py-3">Category</th>
                      <th className="text-right px-5 py-3">Qty Sold</th>
                      <th className="text-right px-5 py-3">Revenue</th>
                      <th className="text-right px-5 py-3">COGS</th>
                      <th className="text-right px-5 py-3">Profit</th>
                      <th className="text-right px-5 py-3">Margin</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {plRows.map((r, i) => (
                      <tr key={i} className="hover:bg-gray-50">
                        <td className="px-5 py-3 font-medium text-gray-800">{r.name}</td>
                        <td className="px-5 py-3 text-gray-500 text-xs">{r.category}</td>
                        <td className="px-5 py-3 text-right text-gray-600">{r.qtySold.toFixed(2)}</td>
                        <td className="px-5 py-3 text-right font-semibold text-gray-900">{formatCurrency(r.revenue)}</td>
                        <td className="px-5 py-3 text-right text-red-500">{r.cogs > 0 ? formatCurrency(r.cogs) : <span className="text-gray-300">—</span>}</td>
                        <td className="px-5 py-3 text-right">
                          {r.cogs > 0
                            ? <span className={r.profit >= 0 ? 'text-green-600 font-semibold' : 'text-red-600 font-semibold'}>{formatCurrency(r.profit)}</span>
                            : <span className="text-gray-300">—</span>}
                        </td>
                        <td className="px-5 py-3 text-right text-xs">
                          {r.cogs > 0 ? <span className={r.margin >= 0 ? 'text-green-600' : 'text-red-500'}>{r.margin.toFixed(1)}%</span> : <span className="text-gray-300">—</span>}
                        </td>
                      </tr>
                    ))}
                    {plRows.length === 0 && (
                      <tr><td colSpan={7} className="px-5 py-12 text-center text-gray-300">No sales data for this period</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* ── GST Report Tab ── */}
        {tab === 'gst' && (
          <div className="space-y-5">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600">GSTIN: <strong>{settings.gstin || 'Not configured'}</strong></p>
                <p className="text-xs text-gray-400">Period: {format(from, 'dd MMM yyyy')} — {format(to, 'dd MMM yyyy')}</p>
              </div>
              <button
                onClick={() => downloadGSTReport(bills, settings, from, to)}
                className="flex items-center gap-2 px-4 py-2 bg-saffron-400 hover:bg-saffron-500 text-white rounded-xl text-sm font-semibold transition-colors"
              >
                <Download size={14} /> Download PDF
              </button>
            </div>

            {/* Summary cards */}
            <div className="grid grid-cols-4 gap-4">
              <div className="bg-white rounded-2xl border border-gray-100 p-4 shadow-sm">
                <p className="text-xs text-gray-500 mb-1">Gross Sales</p>
                <p className="text-xl font-bold text-gray-900">{formatCurrency(gstTotals.gross)}</p>
              </div>
              <div className="bg-white rounded-2xl border border-gray-100 p-4 shadow-sm">
                <p className="text-xs text-gray-500 mb-1">Taxable Value</p>
                <p className="text-xl font-bold text-gray-900">{formatCurrency(gstTotals.taxable)}</p>
              </div>
              <div className="bg-saffron-50 rounded-2xl border border-saffron-100 p-4 shadow-sm">
                <p className="text-xs text-saffron-700 mb-1">CGST Collected</p>
                <p className="text-xl font-bold text-saffron-700">{formatCurrency(gstTotals.cgst)}</p>
              </div>
              <div className="bg-saffron-50 rounded-2xl border border-saffron-100 p-4 shadow-sm">
                <p className="text-xs text-saffron-700 mb-1">SGST Collected</p>
                <p className="text-xl font-bold text-saffron-700">{formatCurrency(gstTotals.sgst)}</p>
              </div>
            </div>

            {/* Rate-wise breakdown */}
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
              <div className="px-5 py-4 border-b border-gray-100">
                <h3 className="text-sm font-bold text-gray-800">Rate-wise Outward Supply Summary</h3>
                <p className="text-xs text-gray-400 mt-0.5">B2C supplies — for GSTR-1 filing</p>
              </div>
              <table className="w-full text-sm">
                <thead className="bg-gray-50 text-xs text-gray-500 uppercase tracking-wide">
                  <tr>
                    <th className="text-left px-5 py-3">Tax Rate</th>
                    <th className="text-right px-5 py-3">Gross Value</th>
                    <th className="text-right px-5 py-3">Taxable Value</th>
                    <th className="text-right px-5 py-3">CGST</th>
                    <th className="text-right px-5 py-3">SGST</th>
                    <th className="text-right px-5 py-3">Total Tax</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {GST_SLABS.filter(rate => gstSlabs[rate]?.gross > 0).map(rate => {
                    const r = gstSlabs[rate];
                    return (
                      <tr key={rate} className="hover:bg-gray-50">
                        <td className="px-5 py-3 font-semibold text-gray-800">{rate}%</td>
                        <td className="px-5 py-3 text-right text-gray-900">{formatCurrency(r.gross)}</td>
                        <td className="px-5 py-3 text-right text-gray-600">{formatCurrency(r.taxable)}</td>
                        <td className="px-5 py-3 text-right text-saffron-600">{formatCurrency(r.cgst)}</td>
                        <td className="px-5 py-3 text-right text-saffron-600">{formatCurrency(r.sgst)}</td>
                        <td className="px-5 py-3 text-right font-semibold text-gray-900">{formatCurrency(r.cgst + r.sgst)}</td>
                      </tr>
                    );
                  })}
                  <tr className="bg-amber-50 font-bold">
                    <td className="px-5 py-3 text-gray-900">TOTAL</td>
                    <td className="px-5 py-3 text-right text-gray-900">{formatCurrency(gstTotals.gross)}</td>
                    <td className="px-5 py-3 text-right text-gray-900">{formatCurrency(gstTotals.taxable)}</td>
                    <td className="px-5 py-3 text-right text-saffron-700">{formatCurrency(gstTotals.cgst)}</td>
                    <td className="px-5 py-3 text-right text-saffron-700">{formatCurrency(gstTotals.sgst)}</td>
                    <td className="px-5 py-3 text-right text-gray-900">{formatCurrency(gstTotals.cgst + gstTotals.sgst)}</td>
                  </tr>
                  {GST_SLABS.every(r => !gstSlabs[r]?.gross) && (
                    <tr><td colSpan={6} className="px-5 py-12 text-center text-gray-300">No taxable sales for this period</td></tr>
                  )}
                </tbody>
              </table>
            </div>

            <p className="text-xs text-gray-400 text-center">
              This report is for reference only. Please verify with your chartered accountant before GSTR-1 filing.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
