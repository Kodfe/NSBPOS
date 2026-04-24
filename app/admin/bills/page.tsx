'use client';
import { useState, useEffect, useMemo } from 'react';
import { Search, X, Receipt, Eye } from 'lucide-react';
import toast, { Toaster } from 'react-hot-toast';
import { format, startOfDay, endOfDay, subDays, isWithinInterval } from 'date-fns';
import { Bill, CartItem } from '@/types';
import { formatCurrency } from '@/lib/utils';
import { getAllBills, getAllSaleReturns } from '@/lib/firestore';

type DateRange = 'today' | 'yesterday' | '7d' | '30d' | 'custom';
type StatusFilter = 'all' | 'paid' | 'held' | 'cancelled' | 'open';
type SpecialFilter = 'all' | 'refunded' | 'adjusted';

const DEMO_BILLS: Bill[] = [
  {
    id: 'demo1', billNumber: 'NSB260424-0001',
    items: [
      { product: { id: 'p1', name: 'Amul Milk 1L', price: 68, mrp: 68, gstRate: 5, category: 'Dairy', unit: 'ltr', stock: 50, isActive: true }, quantity: 2, discount: 0, total: 136, gstAmount: 6.48, cgst: 3.24, sgst: 3.24 },
      { product: { id: 'p2', name: 'Parle-G Biscuits', price: 20, mrp: 20, gstRate: 12, category: 'Biscuits', unit: 'piece', stock: 100, isActive: true }, quantity: 3, discount: 0, total: 60, gstAmount: 6.43, cgst: 3.21, sgst: 3.21 },
    ],
    customer: { id: 'c1', name: 'Rajesh Kumar', phone: '9876543210' },
    subtotal: 196, totalGst: 12.91, totalDiscount: 0, roundOff: 0.09, total: 196, amountPaid: 200, change: 4,
    paymentMethod: 'cash', status: 'paid', createdAt: new Date(), paidAt: new Date(),
  },
  {
    id: 'demo2', billNumber: 'NSB260424-0002',
    items: [
      { product: { id: 'p3', name: 'Tata Salt 1kg', price: 24, mrp: 24, gstRate: 0, category: 'Essentials', unit: 'piece', stock: 200, isActive: true }, quantity: 2, discount: 0, total: 48, gstAmount: 0, cgst: 0, sgst: 0 },
    ],
    subtotal: 48, totalGst: 0, totalDiscount: 0, roundOff: 0, total: 48,
    paymentMethod: 'upi', status: 'paid', createdAt: subDays(new Date(), 1), paidAt: subDays(new Date(), 1),
  },
  {
    id: 'demo3', billNumber: 'NSB260424-0003',
    items: [
      { product: { id: 'p4', name: 'Fortune Sunflower Oil 1L', price: 132, mrp: 135, gstRate: 5, category: 'Oil', unit: 'ltr', stock: 30, isActive: true }, quantity: 1, discount: 0, total: 132, gstAmount: 6.29, cgst: 3.14, sgst: 3.14 },
    ],
    subtotal: 132, totalGst: 6.29, totalDiscount: 0, roundOff: 0, total: 132,
    status: 'held', createdAt: new Date(),
  },
];

function getStatusBadge(status: Bill['status']) {
  switch (status) {
    case 'paid': return 'bg-green-100 text-green-700';
    case 'held': return 'bg-amber-100 text-amber-700';
    case 'cancelled': return 'bg-red-100 text-red-700';
    case 'open': return 'bg-blue-100 text-blue-700';
    default: return 'bg-gray-100 text-gray-600';
  }
}

function getDateRange(range: DateRange, customFrom: string, customTo: string): { from: Date; to: Date } {
  const now = new Date();
  switch (range) {
    case 'today': return { from: startOfDay(now), to: endOfDay(now) };
    case 'yesterday': return { from: startOfDay(subDays(now, 1)), to: endOfDay(subDays(now, 1)) };
    case '7d': return { from: startOfDay(subDays(now, 6)), to: endOfDay(now) };
    case '30d': return { from: startOfDay(subDays(now, 29)), to: endOfDay(now) };
    case 'custom': return {
      from: customFrom ? startOfDay(new Date(customFrom)) : startOfDay(subDays(now, 7)),
      to: customTo ? endOfDay(new Date(customTo)) : endOfDay(now),
    };
  }
}

export default function BillsPage() {
  const [bills, setBills] = useState<Bill[]>([]);
  const [refundTotalsByBillId, setRefundTotalsByBillId] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [dateRange, setDateRange] = useState<DateRange>('today');
  const [customFrom, setCustomFrom] = useState('');
  const [customTo, setCustomTo] = useState('');
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [specialFilter, setSpecialFilter] = useState<SpecialFilter>('all');
  const [viewBill, setViewBill] = useState<Bill | null>(null);

  useEffect(() => {
    let active = true;

    async function loadBills() {
      try {
        const [data, saleReturns] = await Promise.all([getAllBills(), getAllSaleReturns()]);
        if (!active) return;
        setBills(data.length ? data : DEMO_BILLS);
        setRefundTotalsByBillId(
          saleReturns.reduce<Record<string, number>>((acc, saleReturn) => {
            acc[saleReturn.originalBillId] = (acc[saleReturn.originalBillId] ?? 0) + saleReturn.total;
            return acc;
          }, {})
        );
      } catch {
        if (!active) return;
        toast.error('Failed to load bills');
        setBills(DEMO_BILLS);
        setRefundTotalsByBillId({});
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    }

    void loadBills();
    return () => { active = false; };
  }, []);

  const filtered = useMemo(() => {
    const { from, to } = getDateRange(dateRange, customFrom, customTo);
    return bills.filter(b => {
      const inRange = isWithinInterval(b.createdAt, { start: from, end: to });
      const matchStatus = statusFilter === 'all' || b.status === statusFilter;
      const refundTotal = refundTotalsByBillId[b.id] ?? 0;
      const hasRefund = refundTotal > 0;
      const hasAdjustment =
        (b.adjustment ?? 0) !== 0 ||
        (b.storeCreditApplied ?? 0) > 0 ||
        (b.storeCreditEarned ?? 0) > 0;
      const matchSpecial =
        specialFilter === 'all' ||
        (specialFilter === 'refunded' && hasRefund) ||
        (specialFilter === 'adjusted' && hasAdjustment);
      const matchSearch = !search ||
        b.billNumber.toLowerCase().includes(search.toLowerCase()) ||
        (b.customer?.name ?? '').toLowerCase().includes(search.toLowerCase()) ||
        (b.customer?.phone ?? '').includes(search);
      return inRange && matchStatus && matchSpecial && matchSearch;
    });
  }, [bills, customFrom, customTo, dateRange, refundTotalsByBillId, search, specialFilter, statusFilter]);

  const totalValue = filtered.reduce((s, b) => s + b.total, 0);

  return (
    <div className="flex-1 flex flex-col overflow-hidden bg-gray-50">
      <Toaster position="top-right" />

      {/* Header */}
      <div className="bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between flex-shrink-0 sticky top-0 z-10">
        <div>
          <h1 className="text-lg font-bold text-gray-900">Bills</h1>
          <p className="text-xs text-gray-500">{filtered.length} bills &nbsp;·&nbsp; Total: <span className="font-semibold text-saffron-600">{formatCurrency(totalValue)}</span></p>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white border-b border-gray-100 px-6 py-3 flex flex-wrap items-center gap-3 flex-shrink-0">
        {/* Date range buttons */}
        <div className="flex gap-1.5">
          {(['today', 'yesterday', '7d', '30d', 'custom'] as DateRange[]).map(r => (
            <button key={r} onClick={() => setDateRange(r)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all whitespace-nowrap ${dateRange === r ? 'bg-saffron-400 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
              {r === 'today' ? 'Today' : r === 'yesterday' ? 'Yesterday' : r === '7d' ? '7 Days' : r === '30d' ? '30 Days' : 'Custom'}
            </button>
          ))}
        </div>
        {dateRange === 'custom' && (
          <div className="flex items-center gap-2">
            <input type="date" value={customFrom} onChange={e => setCustomFrom(e.target.value)}
              className="px-2 py-1.5 border border-gray-200 rounded-lg text-xs focus:outline-none focus:border-saffron-400" />
            <span className="text-gray-400 text-xs">to</span>
            <input type="date" value={customTo} onChange={e => setCustomTo(e.target.value)}
              className="px-2 py-1.5 border border-gray-200 rounded-lg text-xs focus:outline-none focus:border-saffron-400" />
          </div>
        )}
        {/* Status */}
        <div className="flex gap-1.5">
          {(['all', 'paid', 'held', 'cancelled', 'open'] as StatusFilter[]).map(s => (
            <button key={s} onClick={() => setStatusFilter(s)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium capitalize transition-all ${statusFilter === s ? 'bg-gray-800 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
              {s}
            </button>
          ))}
        </div>
        <div className="flex gap-1.5">
          {(['all', 'refunded', 'adjusted'] as SpecialFilter[]).map(s => (
            <button key={s} onClick={() => setSpecialFilter(s)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium capitalize transition-all ${specialFilter === s ? 'bg-red-500 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
              {s}
            </button>
          ))}
        </div>
        {/* Search */}
        <div className="relative ml-auto">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={13} />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Bill # or customer…"
            className="pl-8 pr-3 py-1.5 border border-gray-200 rounded-lg text-xs focus:outline-none focus:border-saffron-400 w-48" />
        </div>
      </div>

      {/* Table */}
      <div className="flex-1 overflow-y-auto">
        {loading ? (
          <div className="flex items-center justify-center h-48 text-gray-400 text-sm">Loading…</div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-48 gap-3">
            <Receipt size={40} className="text-gray-200" />
            <p className="text-gray-400 text-sm">No bills found for the selected filters</p>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-gray-50 sticky top-0 text-xs text-gray-500 uppercase tracking-wide">
              <tr>
                <th className="text-left px-5 py-3">Bill No</th>
                <th className="text-left px-4 py-3">Date & Time</th>
                <th className="text-left px-4 py-3">Customer</th>
                <th className="text-right px-4 py-3">Items</th>
                <th className="text-right px-4 py-3">Total</th>
                <th className="text-center px-4 py-3">Payment</th>
                <th className="text-center px-4 py-3">Status</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-50">
              {filtered.map(b => {
                const refundTotal = refundTotalsByBillId[b.id] ?? 0;
                const hasRefund = refundTotal > 0;
                const hasAdjustment =
                  (b.adjustment ?? 0) !== 0 ||
                  (b.storeCreditApplied ?? 0) > 0 ||
                  (b.storeCreditEarned ?? 0) > 0;
                return (
                <tr key={b.id} className="hover:bg-gray-50 transition-colors">
                  <td className="px-5 py-3">
                    <div className="font-mono text-xs font-semibold text-gray-700">{b.billNumber}</div>
                    <div className="flex flex-wrap gap-1 mt-1">
                      {hasRefund && (
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-medium bg-red-100 text-red-600">
                          Refunded {formatCurrency(refundTotal)}
                        </span>
                      )}
                      {hasAdjustment && (
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-medium bg-amber-100 text-amber-700">
                          Adjusted
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-gray-600 text-xs whitespace-nowrap">
                    <div>{format(b.createdAt, 'dd MMM yyyy')}</div>
                    <div className="text-gray-400">{format(b.createdAt, 'hh:mm a')}</div>
                  </td>
                  <td className="px-4 py-3 text-gray-700">
                    {b.customer ? (
                      <div>
                        <p className="font-medium">{b.customer.name}</p>
                        <p className="text-xs text-gray-400">{b.customer.phone}</p>
                      </div>
                    ) : <span className="text-gray-400 text-xs">Walk-in</span>}
                  </td>
                  <td className="px-4 py-3 text-right text-gray-600">{b.items.length}</td>
                  <td className="px-4 py-3 text-right font-semibold text-gray-900">{formatCurrency(b.total)}</td>
                  <td className="px-4 py-3 text-center">
                    <span className="px-2 py-0.5 bg-gray-100 text-gray-600 rounded-full text-xs capitalize">{b.paymentMethod ?? '—'}</span>
                  </td>
                  <td className="px-4 py-3 text-center">
                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium capitalize ${getStatusBadge(b.status)}`}>{b.status}</span>
                  </td>
                  <td className="px-4 py-3">
                    <button onClick={() => setViewBill(b)} className="flex items-center gap-1 px-2.5 py-1.5 text-xs text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50 hover:border-saffron-300 transition-colors">
                      <Eye size={12} /> View
                    </button>
                  </td>
                </tr>
              )})}
            </tbody>
          </table>
        )}
      </div>

      {/* Bill Detail Panel */}
      {viewBill && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-end sm:justify-center bg-black/40" onClick={e => e.target === e.currentTarget && setViewBill(null)}>
          <div className="bg-white w-full sm:max-w-xl sm:mx-4 sm:rounded-2xl shadow-2xl max-h-[90vh] flex flex-col rounded-t-2xl">
            <div className="flex items-center justify-between px-6 py-4 border-b">
              <div>
                <h2 className="font-bold text-gray-900 flex items-center gap-2"><Receipt size={16} className="text-saffron-500" /> {viewBill.billNumber}</h2>
                <p className="text-xs text-gray-500 mt-0.5">
                  {format(viewBill.createdAt, 'dd MMM yyyy, hh:mm a')}
                  {' · '}
                  <span className={`px-1.5 py-0.5 rounded-full text-xs font-medium capitalize ${getStatusBadge(viewBill.status)}`}>{viewBill.status}</span>
                </p>
              </div>
              <button onClick={() => setViewBill(null)}><X size={18} className="text-gray-400" /></button>
            </div>
            <div className="flex-1 overflow-y-auto p-6 space-y-5">
              {/* Customer */}
              {viewBill.customer && (
                <div className="bg-gray-50 rounded-xl p-3 text-sm">
                  <p className="text-xs text-gray-500 font-semibold uppercase tracking-wide mb-1">Customer</p>
                  <p className="font-semibold text-gray-800">{viewBill.customer.name}</p>
                  <p className="text-gray-500 text-xs">{viewBill.customer.phone} {viewBill.customer.email ? `· ${viewBill.customer.email}` : ''}</p>
                </div>
              )}

              {/* Items table */}
              <div>
                <p className="text-xs text-gray-500 font-semibold uppercase tracking-wide mb-2">Items</p>
                <table className="w-full text-xs">
                  <thead className="bg-gray-50 text-gray-500">
                    <tr>
                      <th className="text-left py-2 px-2 rounded-l-lg">#</th>
                      <th className="text-left py-2 px-2">Description</th>
                      <th className="text-right py-2 px-2">Qty</th>
                      <th className="text-right py-2 px-2">MRP</th>
                      <th className="text-right py-2 px-2">Rate</th>
                      <th className="text-right py-2 px-2 rounded-r-lg">Amount</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {viewBill.items.map((item: CartItem, i) => (
                      <tr key={i}>
                        <td className="py-2 px-2 text-gray-400">{i + 1}</td>
                        <td className="py-2 px-2 font-medium text-gray-800">
                          {item.product.name}
                          {item.discount > 0 && <span className="text-gray-400 ml-1">(-{item.discount}%)</span>}
                        </td>
                        <td className="py-2 px-2 text-right text-gray-600">
                          {item.product.isLoose ? `${item.quantity.toFixed(3)} kg` : `${item.quantity} ${item.product.unit}`}
                        </td>
                        <td className="py-2 px-2 text-right text-gray-400">₹{item.product.mrp}</td>
                        <td className="py-2 px-2 text-right text-gray-600">₹{item.product.price}</td>
                        <td className="py-2 px-2 text-right font-semibold text-gray-800">₹{item.total.toFixed(2)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Totals */}
              <div className="border-t pt-3 space-y-1 text-sm">
                <div className="flex justify-between text-gray-600"><span>Subtotal</span><span>{formatCurrency(viewBill.subtotal)}</span></div>
                {viewBill.totalDiscount > 0 && <div className="flex justify-between text-green-600"><span>Discount</span><span>-{formatCurrency(viewBill.totalDiscount)}</span></div>}
                {viewBill.totalGst > 0 && <div className="flex justify-between text-gray-500 text-xs"><span>GST</span><span>{formatCurrency(viewBill.totalGst)}</span></div>}
                {viewBill.roundOff !== 0 && <div className="flex justify-between text-gray-400 text-xs"><span>Round Off</span><span>{viewBill.roundOff > 0 ? '+' : ''}{viewBill.roundOff.toFixed(2)}</span></div>}
                {viewBill.adjustment !== undefined && viewBill.adjustment !== 0 && (
                  <div className="flex justify-between text-gray-500 text-xs"><span>{viewBill.adjustmentNote || 'Adjustment'}</span><span>{formatCurrency(viewBill.adjustment)}</span></div>
                )}
                <div className="flex justify-between font-bold text-gray-900 text-base border-t pt-2 mt-2">
                  <span>Total</span><span>{formatCurrency(viewBill.total)}</span>
                </div>
                {viewBill.amountPaid !== undefined && (
                  <>
                    <div className="flex justify-between text-gray-600 text-xs"><span>Amount Paid ({viewBill.paymentMethod ?? 'cash'})</span><span>{formatCurrency(viewBill.amountPaid)}</span></div>
                    {(viewBill.change ?? 0) > 0 && <div className="flex justify-between text-gray-500 text-xs"><span>Change</span><span>{formatCurrency(viewBill.change!)}</span></div>}
                  </>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
