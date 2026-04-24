'use client';
import { useState } from 'react';
import { X, RotateCcw, ChevronUp, ChevronDown, CreditCard, Banknote, CheckCircle2 } from 'lucide-react';
import { Bill, ReturnLineItem } from '@/types';
import { formatCurrency } from '@/lib/utils';
import { processSaleReturn, generateReturnNumber } from '@/lib/firestore';
import { addStoreCredit } from '@/lib/customers-firestore';
import toast from 'react-hot-toast';

interface Props {
  bill: Bill;
  onClose: () => void;
  onDone: (returnTotal: number, refundMethod: 'cash' | 'credit') => void;
}

export default function ReturnModal({ bill, onClose, onDone }: Props) {
  // Build return line items from bill — returnQty defaults to 0 (nothing selected)
  const [lines, setLines] = useState<ReturnLineItem[]>(
    bill.items.map(item => ({
      product: item.product,
      originalQty: item.weightKg ?? item.quantity,
      weightKg: item.weightKg,
      returnQty: 0,
      pricePerUnit: item.product.price,
      total: 0,
    }))
  );
  const [refundMethod, setRefundMethod] = useState<'cash' | 'credit'>('cash');
  const [notes, setNotes] = useState('');
  const [processing, setProcessing] = useState(false);
  const [done, setDone] = useState(false);
  const [returnTotal, setReturnTotal] = useState(0);

  function setReturnQty(idx: number, qty: number) {
    setLines(prev => prev.map((line, i) => {
      if (i !== idx) return line;
      const clamped = Math.max(0, Math.min(qty, line.originalQty));
      return { ...line, returnQty: clamped, total: clamped * line.pricePerUnit };
    }));
  }

  const total = lines.reduce((s, l) => s + l.total, 0);
  const hasItems = lines.some(l => l.returnQty > 0);

  async function handleProcess() {
    if (!hasItems) { toast.error('Select at least one item to return'); return; }
    setProcessing(true);
    try {
      let returnNumber: string;
      try { returnNumber = await generateReturnNumber(); }
      catch { returnNumber = `RET${Date.now()}`; }

      const activeLines = lines.filter(l => l.returnQty > 0);

      await processSaleReturn({
        returnNumber,
        originalBillId: bill.id,
        originalBillNumber: bill.billNumber,
        items: activeLines,
        total,
        refundMethod,
        customer: bill.customer,
        notes: notes.trim() || undefined,
        createdAt: new Date(),
        processedAt: new Date(),
      });

      // Save as store credit if chosen
      if (refundMethod === 'credit' && bill.customer?.id) {
        await addStoreCredit(bill.customer.id, total);
      }

      setReturnTotal(total);
      setDone(true);
    } catch (err) {
      console.error(err);
      toast.error('Return processing failed');
    } finally {
      setProcessing(false);
    }
  }

  // ── Done screen ────────────────────────────────────────────────────────────
  if (done) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
        <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-8 text-center space-y-4">
          <CheckCircle2 size={48} className="text-green-500 mx-auto" />
          <h2 className="text-xl font-bold text-gray-900">Return Processed!</h2>
          <p className="text-sm text-gray-500">
            Return amount: <span className="font-bold text-gray-900">{formatCurrency(returnTotal)}</span>
          </p>
          {refundMethod === 'cash' ? (
            <p className="text-sm text-blue-600 font-semibold">Give ₹{returnTotal.toFixed(2)} cash to customer</p>
          ) : (
            <p className="text-sm text-green-600 font-semibold">₹{returnTotal.toFixed(2)} added to {bill.customer?.name || 'customer'}'s store credit</p>
          )}
          <p className="text-xs text-gray-400">Stock has been updated automatically</p>
          <button
            onClick={() => { onDone(returnTotal, refundMethod); onClose(); }}
            className="w-full py-3 bg-saffron-400 hover:bg-saffron-500 text-white font-bold rounded-xl transition-colors"
          >
            Done
          </button>
        </div>
      </div>
    );
  }

  // ── Main return form ───────────────────────────────────────────────────────
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg flex flex-col max-h-[90vh]">

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <div>
            <div className="flex items-center gap-2">
              <RotateCcw size={18} className="text-red-500" />
              <h2 className="text-base font-bold text-gray-900">Process Return</h2>
            </div>
            <p className="text-xs text-gray-400 mt-0.5">Bill: {bill.billNumber}</p>
          </div>
          <button onClick={onClose} className="p-1.5 hover:bg-gray-100 rounded-lg">
            <X size={18} />
          </button>
        </div>

        {/* Instructions */}
        <div className="px-5 py-2 bg-amber-50 border-b border-amber-100">
          <p className="text-xs text-amber-700">
            Set the quantity being returned for each item (0 = not returned). Stock will be added back automatically.
          </p>
        </div>

        {/* Items */}
        <div className="flex-1 overflow-y-auto px-5 py-3 space-y-3">
          {lines.map((line, idx) => {
            const isLoose = line.product.isLoose;
            return (
              <div key={idx} className={`flex items-center gap-3 p-3 rounded-xl border-2 transition-all ${line.returnQty > 0 ? 'border-red-200 bg-red-50' : 'border-gray-100 bg-gray-50'}`}>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-gray-900 truncate">{line.product.name}</p>
                  <p className="text-xs text-gray-400 mt-0.5">
                    Sold: {isLoose ? `${line.originalQty.toFixed(3)} kg` : `${line.originalQty} pcs`}
                    {' '}· ₹{line.pricePerUnit}/{isLoose ? 'kg' : 'pc'}
                  </p>
                  {line.returnQty > 0 && (
                    <p className="text-xs text-red-600 font-semibold mt-0.5">
                      Return: {isLoose ? `${line.returnQty.toFixed(3)} kg` : `${line.returnQty} pcs`}
                      {' '}= {formatCurrency(line.total)}
                    </p>
                  )}
                </div>

                {/* Qty stepper */}
                <div className="flex items-center gap-1 bg-white border border-gray-200 rounded-lg overflow-hidden">
                  <button
                    onClick={() => setReturnQty(idx, Number((line.returnQty - (isLoose ? 0.25 : 1)).toFixed(3)))}
                    className="px-2.5 py-2 hover:bg-gray-100 transition-colors text-gray-600 disabled:opacity-30"
                    disabled={line.returnQty <= 0}
                  >
                    <ChevronDown size={14} />
                  </button>
                  <input
                    type="number"
                    min={0}
                    max={line.originalQty}
                    step={isLoose ? 0.001 : 1}
                    value={line.returnQty}
                    onChange={e => setReturnQty(idx, parseFloat(e.target.value) || 0)}
                    className="w-16 text-center text-sm font-semibold focus:outline-none py-1.5"
                  />
                  <button
                    onClick={() => setReturnQty(idx, Number((line.returnQty + (isLoose ? 0.25 : 1)).toFixed(3)))}
                    className="px-2.5 py-2 hover:bg-gray-100 transition-colors text-gray-600 disabled:opacity-30"
                    disabled={line.returnQty >= line.originalQty}
                  >
                    <ChevronUp size={14} />
                  </button>
                </div>

                {/* Max / Clear button */}
                <button
                  onClick={() => setReturnQty(idx, line.returnQty >= line.originalQty ? 0 : line.originalQty)}
                  className={`text-xs font-semibold px-2.5 py-1.5 rounded-lg transition-colors ${
                    line.returnQty >= line.originalQty
                      ? 'bg-red-100 text-red-600 hover:bg-red-200'
                      : 'bg-gray-200 text-gray-600 hover:bg-gray-300'
                  }`}
                >
                  {line.returnQty >= line.originalQty ? 'Clear' : 'All'}
                </button>
              </div>
            );
          })}
        </div>

        {/* Footer — refund method + summary + confirm */}
        <div className="border-t border-gray-100 px-5 py-4 space-y-3">

          {/* Return total */}
          <div className="flex justify-between items-center">
            <span className="text-sm text-gray-600">Return Total</span>
            <span className={`text-lg font-bold ${hasItems ? 'text-red-600' : 'text-gray-300'}`}>
              {formatCurrency(total)}
            </span>
          </div>

          {/* Refund method */}
          <div className="space-y-1.5">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Refund Method</p>
            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={() => setRefundMethod('cash')}
                className={`flex items-center justify-center gap-2 py-2.5 rounded-xl border-2 text-sm font-semibold transition-all ${
                  refundMethod === 'cash'
                    ? 'border-saffron-400 bg-saffron-50 text-saffron-700'
                    : 'border-gray-200 text-gray-500 hover:border-gray-300'
                }`}
              >
                <Banknote size={15} /> Cash Refund
              </button>
              <button
                onClick={() => setRefundMethod('credit')}
                disabled={!bill.customer?.id}
                className={`flex items-center justify-center gap-2 py-2.5 rounded-xl border-2 text-sm font-semibold transition-all disabled:opacity-40 disabled:cursor-not-allowed ${
                  refundMethod === 'credit'
                    ? 'border-green-500 bg-green-50 text-green-700'
                    : 'border-gray-200 text-gray-500 hover:border-gray-300'
                }`}
              >
                <CreditCard size={15} /> Store Credit
              </button>
            </div>
            {refundMethod === 'credit' && !bill.customer?.id && (
              <p className="text-[10px] text-gray-400">Store credit requires a linked customer on the original bill</p>
            )}
          </div>

          {/* Notes */}
          <input
            value={notes}
            onChange={e => setNotes(e.target.value)}
            placeholder="Return reason (optional)"
            className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:border-saffron-400"
          />

          {/* Confirm */}
          <button
            onClick={handleProcess}
            disabled={!hasItems || processing}
            className="w-full py-3 bg-red-500 hover:bg-red-600 disabled:bg-gray-200 disabled:text-gray-400 text-white font-bold rounded-xl transition-colors flex items-center justify-center gap-2"
          >
            {processing
              ? <><div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> Processing…</>
              : <><RotateCcw size={16} /> Process Return {hasItems ? `· ${formatCurrency(total)}` : ''}</>
            }
          </button>
        </div>
      </div>
    </div>
  );
}
