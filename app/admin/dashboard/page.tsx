'use client';
import { useState, useEffect, useCallback } from 'react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  LineChart, Line, PieChart, Pie, Cell, Legend,
} from 'recharts';
import {
  IndianRupee, ShoppingCart, Receipt, TrendingUp, Calendar,
  Download, RefreshCw, Banknote, Smartphone, CreditCard, Package,
} from 'lucide-react';
import { format, subDays, startOfDay, endOfDay, startOfMonth, subMonths } from 'date-fns';
import StatsCard from '@/components/admin/StatsCard';
import { getSalesSummary } from '@/lib/admin-firestore';
import { SalesSummary } from '@/types';
import { DEMO_PRODUCTS } from '@/lib/demo-data';

type Range = 'today' | 'yesterday' | '7days' | '30days' | 'custom';

const PIE_COLORS = ['#ff9933', '#22c55e', '#3b82f6'];

function getRange(range: Range, customFrom: string, customTo: string): { from: Date; to: Date } {
  const now = new Date();
  switch (range) {
    case 'today': return { from: startOfDay(now), to: endOfDay(now) };
    case 'yesterday': return { from: startOfDay(subDays(now, 1)), to: endOfDay(subDays(now, 1)) };
    case '7days': return { from: startOfDay(subDays(now, 6)), to: endOfDay(now) };
    case '30days': return { from: startOfDay(subDays(now, 29)), to: endOfDay(now) };
    case 'custom':
      return {
        from: customFrom ? startOfDay(new Date(customFrom)) : startOfDay(subDays(now, 7)),
        to: customTo ? endOfDay(new Date(customTo)) : endOfDay(now),
      };
  }
}

// ── Demo fallback data ────────────────────────────────────────────────────────
function demoSummary(range: Range): SalesSummary {
  const days = range === 'today' || range === 'yesterday' ? 1 : range === '7days' ? 7 : 30;
  const mult = days;
  const dailyBreakdown = Array.from({ length: days }, (_, i) => ({
    date: format(subDays(new Date(), days - 1 - i), 'yyyy-MM-dd'),
    sales: Math.round(4000 + Math.random() * 6000),
    bills: Math.round(20 + Math.random() * 40),
  }));
  const totalSales = dailyBreakdown.reduce((s, d) => s + d.sales, 0);
  const totalBills = dailyBreakdown.reduce((s, d) => s + d.bills, 0);
  return {
    totalSales, totalBills,
    totalItems: totalBills * 4,
    cashSales: totalSales * 0.5,
    upiSales: totalSales * 0.35,
    cardSales: totalSales * 0.15,
    totalGst: totalSales * 0.05,
    totalDiscount: totalSales * 0.02,
    avgBillValue: totalBills > 0 ? totalSales / totalBills : 0,
    topProducts: DEMO_PRODUCTS.slice(0, 8).map(p => ({
      name: p.name.length > 20 ? p.name.slice(0, 20) + '…' : p.name,
      qty: Math.round(5 + Math.random() * 50 * mult),
      revenue: Math.round(p.price * (5 + Math.random() * 50) * mult),
    })).sort((a, b) => b.revenue - a.revenue),
    dailyBreakdown,
  };
}

export default function DashboardPage() {
  const [range, setRange] = useState<Range>('today');
  const [customFrom, setCustomFrom] = useState('');
  const [customTo, setCustomTo] = useState('');
  const [summary, setSummary] = useState<SalesSummary | null>(null);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { from, to } = getRange(range, customFrom, customTo);
      const data = await getSalesSummary(from, to);
      // If no real bills yet, show demo data
      setSummary(data.totalBills === 0 ? demoSummary(range) : data);
    } catch {
      setSummary(demoSummary(range));
    } finally {
      setLoading(false);
    }
  }, [range, customFrom, customTo]);

  useEffect(() => { load(); }, [load]);

  function exportCSV() {
    if (!summary) return;
    const rows = [
      ['Date', 'Sales (₹)', 'Bills'],
      ...summary.dailyBreakdown.map(d => [d.date, d.sales.toFixed(2), d.bills]),
    ];
    const csv = rows.map(r => r.join(',')).join('\n');
    const a = document.createElement('a');
    a.href = 'data:text/csv;charset=utf-8,' + encodeURIComponent(csv);
    a.download = `NSB_Sales_${range}_${format(new Date(), 'yyyyMMdd')}.csv`;
    a.click();
  }

  const paymentData = summary ? [
    { name: 'Cash', value: Math.round(summary.cashSales) },
    { name: 'UPI', value: Math.round(summary.upiSales) },
    { name: 'Card', value: Math.round(summary.cardSales) },
  ] : [];

  const rangeLabel = range === 'today' ? "Today's" : range === 'yesterday' ? "Yesterday's"
    : range === '7days' ? 'Last 7 Days' : range === '30days' ? 'Last 30 Days' : 'Custom Range';

  return (
    <div className="flex-1 overflow-y-auto bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between sticky top-0 z-10">
        <div>
          <h1 className="text-lg font-bold text-gray-900">Sales Dashboard</h1>
          <p className="text-xs text-gray-500">{rangeLabel} overview — NSB Supermarket</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={load} className="flex items-center gap-1.5 px-3 py-2 border border-gray-200 rounded-lg text-sm text-gray-600 hover:bg-gray-50">
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} /> Refresh
          </button>
          <button onClick={exportCSV} className="flex items-center gap-1.5 px-3 py-2 bg-saffron-400 hover:bg-saffron-500 text-white rounded-lg text-sm font-medium">
            <Download size={14} /> Export CSV
          </button>
        </div>
      </div>

      <div className="p-6 space-y-6">
        {/* Date range selector */}
        <div className="flex flex-wrap items-center gap-2">
          {(['today', 'yesterday', '7days', '30days', 'custom'] as Range[]).map(r => (
            <button
              key={r}
              onClick={() => setRange(r)}
              className={`px-4 py-2 rounded-xl text-sm font-medium transition-all ${
                range === r ? 'bg-saffron-400 text-white shadow-sm' : 'bg-white border border-gray-200 text-gray-600 hover:border-saffron-300'
              }`}
            >
              {r === 'today' ? 'Today' : r === 'yesterday' ? 'Yesterday' : r === '7days' ? '7 Days' : r === '30days' ? '30 Days' : 'Custom'}
            </button>
          ))}
          {range === 'custom' && (
            <div className="flex items-center gap-2 ml-2">
              <input type="date" value={customFrom} onChange={e => setCustomFrom(e.target.value)}
                className="px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:border-saffron-400" />
              <span className="text-gray-400 text-sm">to</span>
              <input type="date" value={customTo} onChange={e => setCustomTo(e.target.value)}
                className="px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:border-saffron-400" />
            </div>
          )}
        </div>

        {/* Stats cards */}
        <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
          <StatsCard title="Total Sales" value={`₹${summary ? summary.totalSales.toLocaleString('en-IN', { maximumFractionDigits: 0 }) : '—'}`}
            icon={<IndianRupee size={20} />} color="saffron" sub="incl. GST" />
          <StatsCard title="Total Bills" value={summary ? String(summary.totalBills) : '—'}
            icon={<Receipt size={20} />} color="blue" sub={`Avg ₹${summary ? summary.avgBillValue.toFixed(0) : '—'}/bill`} />
          <StatsCard title="Items Sold" value={summary ? String(summary.totalItems) : '—'}
            icon={<ShoppingCart size={20} />} color="green" />
          <StatsCard title="GST Collected" value={`₹${summary ? summary.totalGst.toLocaleString('en-IN', { maximumFractionDigits: 0 }) : '—'}`}
            icon={<TrendingUp size={20} />} color="purple" sub={`Discount ₹${summary ? summary.totalDiscount.toFixed(0) : '—'}`} />
        </div>

        {/* Payment breakdown cards */}
        <div className="grid grid-cols-3 gap-4">
          <div className="bg-white rounded-2xl border border-gray-100 p-4 flex items-center gap-3 shadow-sm">
            <div className="w-10 h-10 rounded-xl bg-green-50 flex items-center justify-center"><Banknote size={20} className="text-green-600" /></div>
            <div><p className="text-xs text-gray-500">Cash</p><p className="text-lg font-bold text-gray-900">₹{summary ? summary.cashSales.toLocaleString('en-IN', { maximumFractionDigits: 0 }) : '—'}</p></div>
          </div>
          <div className="bg-white rounded-2xl border border-gray-100 p-4 flex items-center gap-3 shadow-sm">
            <div className="w-10 h-10 rounded-xl bg-blue-50 flex items-center justify-center"><Smartphone size={20} className="text-blue-600" /></div>
            <div><p className="text-xs text-gray-500">UPI</p><p className="text-lg font-bold text-gray-900">₹{summary ? summary.upiSales.toLocaleString('en-IN', { maximumFractionDigits: 0 }) : '—'}</p></div>
          </div>
          <div className="bg-white rounded-2xl border border-gray-100 p-4 flex items-center gap-3 shadow-sm">
            <div className="w-10 h-10 rounded-xl bg-purple-50 flex items-center justify-center"><CreditCard size={20} className="text-purple-600" /></div>
            <div><p className="text-xs text-gray-500">Card</p><p className="text-lg font-bold text-gray-900">₹{summary ? summary.cardSales.toLocaleString('en-IN', { maximumFractionDigits: 0 }) : '—'}</p></div>
          </div>
        </div>

        {/* Charts row */}
        <div className="grid grid-cols-3 gap-4">
          {/* Sales bar chart */}
          <div className="col-span-2 bg-white rounded-2xl border border-gray-100 p-5 shadow-sm">
            <h3 className="text-sm font-bold text-gray-800 mb-4">Sales Trend</h3>
            {summary && summary.dailyBreakdown.length > 0 ? (
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={summary.dailyBreakdown} margin={{ top: 0, right: 10, left: -10, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                  <XAxis dataKey="date" tick={{ fontSize: 11 }} tickFormatter={d => format(new Date(d), 'dd MMM')} />
                  <YAxis tick={{ fontSize: 11 }} tickFormatter={v => `₹${((v as number) / 1000).toFixed(0)}k`} />
                  <Tooltip formatter={(v) => [`₹${Number(v).toLocaleString('en-IN')}`, 'Sales']} labelFormatter={l => format(new Date(l as string), 'dd MMM yyyy')} />
                  <Bar dataKey="sales" fill="#ff9933" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-[220px] flex items-center justify-center text-gray-300 text-sm">No data</div>
            )}
          </div>

          {/* Payment pie */}
          <div className="bg-white rounded-2xl border border-gray-100 p-5 shadow-sm">
            <h3 className="text-sm font-bold text-gray-800 mb-4">Payment Split</h3>
            {summary && summary.totalBills > 0 ? (
              <ResponsiveContainer width="100%" height={220}>
                <PieChart>
                  <Pie data={paymentData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={75} label={({ name, percent }) => `${name} ${((percent ?? 0) * 100).toFixed(0)}%`} labelLine={false} fontSize={11}>
                    {paymentData.map((_, i) => <Cell key={i} fill={PIE_COLORS[i]} />)}
                  </Pie>
                  <Tooltip formatter={(v) => `₹${Number(v).toLocaleString('en-IN')}`} />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-[220px] flex items-center justify-center text-gray-300 text-sm">No data</div>
            )}
          </div>
        </div>

        {/* Top products table */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-100 flex items-center gap-2">
            <Package size={16} className="text-saffron-500" />
            <h3 className="text-sm font-bold text-gray-800">Top Products by Revenue</h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-xs text-gray-500 uppercase tracking-wide">
                <tr>
                  <th className="text-left px-5 py-3">#</th>
                  <th className="text-left px-5 py-3">Product</th>
                  <th className="text-right px-5 py-3">Qty Sold</th>
                  <th className="text-right px-5 py-3">Revenue</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {(summary?.topProducts || []).map((p, i) => (
                  <tr key={i} className="hover:bg-gray-50 transition-colors">
                    <td className="px-5 py-3 text-gray-400 font-mono text-xs">{i + 1}</td>
                    <td className="px-5 py-3 font-medium text-gray-800">{p.name}</td>
                    <td className="px-5 py-3 text-right text-gray-600">{p.qty.toFixed(2)}</td>
                    <td className="px-5 py-3 text-right font-semibold text-saffron-600">₹{p.revenue.toLocaleString('en-IN')}</td>
                  </tr>
                ))}
                {!summary && (
                  <tr><td colSpan={4} className="px-5 py-8 text-center text-gray-300 text-sm">Loading…</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
