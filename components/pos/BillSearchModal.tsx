'use client';
import { useState, useEffect, useRef, useMemo } from 'react';
import { X, Search, Receipt, RotateCcw, Edit, ChevronDown, ChevronUp, User, Clock } from 'lucide-react';
import { Bill } from '@/types';
import { getAllBills } from '@/lib/firestore';
import { format } from 'date-fns';
import { formatCurrency } from '@/lib/utils';

interface Props {
  onClose: () => void;
  /** Load bill items back into a new cart for edit/re-bill */
  onEditBill: (bill: Bill) => void;
  /** Open the return flow for this bill */
  onReturnBill: (bill: Bill) => void;
}

export default function BillSearchModal({ onClose, onEditBill, onReturnBill }: Props) {
  const [term, setTerm] = useState('');
  const [allBills, setAllBills] = useState<Bill[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let active = true;

    async function loadBills() {
      try {
        const results = await getAllBills();
        if (!active) return;
        setAllBills(results);
      } catch (error) {
        if (!active) return;
        console.error('Bill search load error:', error);
        setAllBills([]);
      } finally {
        if (active) setLoading(false);
      }
    }

    inputRef.current?.focus();
    void loadBills();
    return () => { active = false; };
  }, []);

  const bills = useMemo(() => {
    const t = term.trim().toLowerCase();
    if (!t) return allBills.slice(0, 30);

    return allBills.filter(bill =>
      bill.billNumber.toLowerCase().includes(t) ||
      bill.customer?.name?.toLowerCase().includes(t) ||
      bill.customer?.phone?.includes(term.trim())
    );
  }, [allBills, term]);

  const statusColor: Record<string, string> = {
    paid:      'bg-green-100 text-green-700',
    held:      'bg-amber-100 text-amber-700',
    cancelled: 'bg-red-100 text-red-600',
    open:      'bg-blue-100 text-blue-700',
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl flex flex-col max-h-[85vh]">

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <div className="flex items-center gap-2">
            <Receipt size={18} className="text-saffron-500" />
            <h2 className="text-base font-bold text-gray-900">Search Bills</h2>
          </div>
          <button onClick={onClose} className="p-1.5 hover:bg-gray-100 rounded-lg">
            <X size={18} />
          </button>
        </div>

        {/* Search bar */}
        <div className="px-5 py-3 border-b border-gray-100">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={16} />
            <input
              ref={inputRef}
              value={term}
              onChange={e => setTerm(e.target.value)}
              placeholder="Search by bill number, customer name or phone…"
              className="w-full pl-9 pr-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:border-saffron-400"
            />
          </div>
          <p className="text-[10px] text-gray-400 mt-1.5">
            💡 Tip: type a bill number (e.g. NSB260424) or customer name/phone
          </p>
        </div>

        {/* Bill list */}
        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <div className="flex justify-center py-12">
              <div className="w-6 h-6 border-2 border-saffron-400 border-t-transparent rounded-full animate-spin" />
            </div>
          ) : bills.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-gray-300">
              <Receipt size={40} className="mb-2" />
              <p className="text-sm">No bills found</p>
            </div>
          ) : (
            <div className="divide-y divide-gray-50">
              {bills.map(bill => {
                const isExpanded = expanded === bill.id;
                const hasAdjustment =
                  (bill.adjustment ?? 0) !== 0 ||
                  (bill.storeCreditApplied ?? 0) > 0 ||
                  (bill.storeCreditEarned ?? 0) > 0;
                return (
                  <div key={bill.id} className="px-5 py-3">
                    {/* Summary row */}
                    <div className="flex items-center gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          {/* Bill number — new bills show original in parens */}
                          <span className="text-sm font-bold text-gray-900 font-mono">
                            {bill.billNumber}
                            {bill.originalBillNumber && (
                              <span className="text-xs font-normal text-gray-400 ml-1">
                                ({bill.originalBillNumber})
                              </span>
                            )}
                          </span>

                          {/* Status badge — "ADJUSTED" replaces CANCELLED when bill was edited */}
                          {bill.status === 'cancelled' && bill.adjustedToBillNumber ? (
                            <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-orange-100 text-orange-700">
                              ADJUSTED → {bill.adjustedToBillNumber}
                            </span>
                          ) : (
                            <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${statusColor[bill.status] ?? 'bg-gray-100 text-gray-500'}`}>
                              {bill.status.toUpperCase()}
                            </span>
                          )}

                          {/* Discount/credit adjustment badge */}
                          {hasAdjustment && (
                            <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-amber-100 text-amber-700">
                              Adj
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-3 mt-0.5 text-xs text-gray-400">
                          {bill.customer && (
                            <span className="flex items-center gap-1">
                              <User size={10} /> {bill.customer.name} · {bill.customer.phone}
                            </span>
                          )}
                          <span className="flex items-center gap-1">
                            <Clock size={10} />
                            {bill.paidAt
                              ? format(bill.paidAt, 'dd MMM yy, HH:mm')
                              : format(bill.createdAt, 'dd MMM yy, HH:mm')}
                          </span>
                        </div>
                      </div>

                      <div className="text-right flex-shrink-0">
                        <p className="text-sm font-bold text-gray-900">{formatCurrency(bill.total)}</p>
                        <p className="text-[10px] text-gray-400">{bill.items.length} items</p>
                      </div>

                      <button
                        onClick={() => setExpanded(isExpanded ? null : bill.id)}
                        className="p-1.5 hover:bg-gray-100 rounded-lg text-gray-400 flex-shrink-0"
                      >
                        {isExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                      </button>
                    </div>

                    {/* Expanded detail */}
                    {isExpanded && (
                      <div className="mt-3 bg-gray-50 rounded-xl p-3">
                        {/* Items mini-table */}
                        <table className="w-full text-xs mb-3">
                          <thead>
                            <tr className="text-gray-400 border-b border-gray-200">
                              <th className="text-left pb-1">#</th>
                              <th className="text-left pb-1">Item</th>
                              <th className="text-right pb-1">Qty</th>
                              <th className="text-right pb-1">MRP</th>
                              <th className="text-right pb-1">Rate</th>
                              <th className="text-right pb-1">Amt</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-gray-100">
                            {bill.items.map((item, i) => {
                              const isLoose = item.product.isLoose;
                              const qty = item.weightKg ?? item.quantity;
                              return (
                                <tr key={i} className="text-gray-700">
                                  <td className="py-1 text-gray-400">{i + 1}.</td>
                                  <td className="py-1 pr-2">{item.product.name}</td>
                                  <td className="py-1 text-right">
                                    {isLoose ? `${qty.toFixed(3)} kg` : qty}
                                  </td>
                                  <td className="py-1 text-right">₹{item.product.mrp}</td>
                                  <td className="py-1 text-right">₹{item.product.price}</td>
                                  <td className="py-1 text-right font-semibold">₹{item.total.toFixed(2)}</td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>

                        {/* Totals mini */}
                        <div className="border-t border-gray-200 pt-2 space-y-0.5 text-xs text-gray-600">
                          <div className="flex justify-between"><span>Subtotal</span><span>₹{bill.subtotal.toFixed(2)}</span></div>
                          {bill.totalDiscount > 0 && <div className="flex justify-between text-green-600"><span>Discount</span><span>-₹{bill.totalDiscount.toFixed(2)}</span></div>}
                          {(bill.adjustment ?? 0) !== 0 && (
                            <div className={`flex justify-between ${(bill.adjustment ?? 0) < 0 ? 'text-green-600' : 'text-red-600'}`}>
                              <span>{bill.adjustmentNote || 'Adjustment'}</span>
                              <span>{(bill.adjustment ?? 0) < 0 ? '-' : '+'}₹{Math.abs(bill.adjustment ?? 0).toFixed(2)}</span>
                            </div>
                          )}
                          {(bill.storeCreditApplied ?? 0) > 0 && (
                            <div className="flex justify-between text-green-600"><span>Store Credit Used</span><span>-₹{bill.storeCreditApplied!.toFixed(2)}</span></div>
                          )}
                          {(bill.storeCreditEarned ?? 0) > 0 && (
                            <div className="flex justify-between text-green-600"><span>Store Credit Saved</span><span>₹{bill.storeCreditEarned!.toFixed(2)}</span></div>
                          )}
                          <div className="flex justify-between font-bold text-sm text-gray-900 pt-1"><span>Total</span><span>₹{bill.total.toFixed(2)}</span></div>
                          <div className="flex justify-between text-gray-400"><span>Payment</span><span>{bill.paymentMethod?.toUpperCase()}</span></div>
                        </div>

                        {/* Actions */}
                        {bill.status === 'paid' && (
                          <div className="flex gap-2 mt-3">
                            <button
                              onClick={() => { onReturnBill(bill); onClose(); }}
                              className="flex-1 flex items-center justify-center gap-1.5 py-2 border-2 border-red-200 text-red-600 rounded-xl text-xs font-semibold hover:bg-red-50 transition-colors"
                            >
                              <RotateCcw size={13} /> Return Items
                            </button>
                            <button
                              onClick={() => { onEditBill(bill); onClose(); }}
                              className="flex-1 flex items-center justify-center gap-1.5 py-2 bg-saffron-400 hover:bg-saffron-500 text-white rounded-xl text-xs font-semibold transition-colors"
                            >
                              <Edit size={13} /> Load to Cart
                            </button>
                          </div>
                        )}
                        {bill.status === 'held' && (
                          <button
                            onClick={() => { onEditBill(bill); onClose(); }}
                            className="w-full mt-3 flex items-center justify-center gap-1.5 py-2 bg-saffron-400 hover:bg-saffron-500 text-white rounded-xl text-xs font-semibold transition-colors"
                          >
                            <Edit size={13} /> Load Held Bill to Cart
                          </button>
                        )}
                        {(bill.status === 'cancelled' || bill.status === 'open') && (
                          <p className="text-center text-xs text-gray-400 mt-3 italic">
                            {bill.status === 'cancelled'
                              ? bill.adjustedToBillNumber
                                ? `Adjusted — replaced by bill ${bill.adjustedToBillNumber}`
                                : 'This bill was cancelled'
                              : 'Bill still open on a POS tab'}
                          </p>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div className="px-5 py-3 border-t border-gray-100 text-center text-xs text-gray-400">
          Showing {bills.length} bills · Only paid bills can be returned or reloaded
        </div>
      </div>
    </div>
  );
}
