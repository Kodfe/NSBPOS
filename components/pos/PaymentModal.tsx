'use client';
import { useEffect, useRef, useState } from 'react';
import { X, Banknote, Smartphone, CreditCard, CheckCircle2 } from 'lucide-react';
import { PaymentDetails } from '@/types';
import { formatCurrency } from '@/lib/utils';

interface Props {
  total: number;
  hasCustomer?: boolean;
  customerName?: string;
  originalBillTotal?: number;   // set when editing a paid bill — triggers delta UI
  onConfirm: (payment: PaymentDetails) => void | Promise<void>;
  onClose: () => void;
}

const QUICK_CASH = [20, 50, 100, 200, 500, 2000];

export default function PaymentModal({
  total,
  hasCustomer = false,
  customerName,
  originalBillTotal,
  onConfirm,
  onClose,
}: Props) {
  // ── Modified-bill delta math ─────────────────────────────────────────────────
  const isModified     = originalBillTotal !== undefined;
  const delta          = isModified ? total - originalBillTotal! : null;   // + = collect, - = refund
  const isRefund       = delta !== null && delta < 0;
  const isNoChange     = delta !== null && Math.round(delta * 100) === 0;
  const collectAmount  = isModified ? Math.max(0, delta!) : total;
  const refundAmount   = isRefund ? Math.abs(delta!) : 0;

  // ── Payment state ────────────────────────────────────────────────────────────
  const [method, setMethod] = useState<'cash' | 'upi' | 'card'>('cash');
  const [cashInput, setCashInput] = useState(collectAmount.toFixed(0));
  const [upiRef, setUpiRef] = useState('');
  const [cardRef, setCardRef] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const submittingRef = useRef(false);
  const [saveCredit, setSaveCredit] = useState(false);          // save change → store credit (normal collect)
  const [refundAsCredit, setRefundAsCredit] = useState(false);  // give refund → store credit

  const cashAmount = parseFloat(cashInput) || 0;
  const change = method === 'cash' ? Math.max(0, cashAmount - collectAmount) : 0;
  const isValid =
    isRefund || isNoChange ||
    (method === 'upi' ? true : method === 'card' ? true : cashAmount >= collectAmount);
  const hasCashChange = method === 'cash' && change > 0;
  const canSaveCredit = hasCashChange && hasCustomer;

  // ── Confirm ──────────────────────────────────────────────────────────────────
  async function handleConfirm() {
    if (submittingRef.current) return;
    submittingRef.current = true;
    setSubmitting(true);
    try {
    // Case 1: Refund due (items removed, new total < original paid)
    if (isRefund) {
      await onConfirm({
        method: 'cash',
        amountPaid: 0,
        change: refundAsCredit ? 0 : refundAmount,
        saveCreditAmount: refundAsCredit ? refundAmount : undefined,
      });
      return;
    }
    // Case 2: No change (same total)
    if (isNoChange) {
      await onConfirm({ method: 'cash', amountPaid: 0, change: 0 });
      return;
    }
    // Case 3: Normal payment or collect delta
    await onConfirm({
      method,
      amountPaid: method === 'cash' ? cashAmount : collectAmount,
      change,
      upiRef: method === 'upi' ? upiRef : undefined,
      cardRef: method === 'card' ? cardRef : undefined,
      cashAmount: method === 'cash' ? cashAmount : undefined,
      saveCreditAmount: canSaveCredit && saveCredit ? change : undefined,
    });
    } finally {
      submittingRef.current = false;
      setSubmitting(false);
    }
  }

  function setExact() { setCashInput(collectAmount.toFixed(0)); }
  function setQuick(amount: number) {
    setCashInput((Math.ceil(collectAmount / amount) * amount).toString());
  }

  useEffect(() => {
    function handleKey(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        event.preventDefault();
        onClose();
      }
      if (event.key === 'Enter' && isValid) {
        event.preventDefault();
        void handleConfirm();
      }
    }
    window.addEventListener('keydown', handleKey, true);
    return () => window.removeEventListener('keydown', handleKey, true);
  });

  return (
    <div
      data-pos-modal="true"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 animate-fade-in"
      onClick={e => e.target === e.currentTarget && onClose()}
    >
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md mx-4 animate-slide-up">

        {/* ── Header ─────────────────────────────────────────────────────────── */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-lg font-bold text-gray-900">Payment</h2>
              {isModified && (
                <span className="text-[11px] font-bold text-orange-600 bg-orange-100 px-2 py-0.5 rounded-full">
                  MODIFIED BILL
                </span>
              )}
            </div>
            {isModified ? (
              <p className="text-xs text-gray-500 mt-0.5">
                Original paid:{' '}
                <span className="font-semibold text-gray-700">{formatCurrency(originalBillTotal!)}</span>
                {'  →  '}
                New total:{' '}
                <span className="font-semibold text-gray-700">{formatCurrency(total)}</span>
              </p>
            ) : (
              <p className="text-sm text-gray-500">
                Amount Due:{' '}
                <span className="font-bold text-saffron-600">{formatCurrency(total)}</span>
              </p>
            )}
          </div>
          <button onClick={onClose} className="p-1.5 hover:bg-gray-100 rounded-lg transition-colors">
            <X size={18} />
          </button>
        </div>

        {/* ── Modified bill delta banner ──────────────────────────────────────── */}
        {isModified && (
          <div className={`mx-4 mt-4 rounded-xl px-4 py-3 flex items-center justify-between ${
            isRefund  ? 'bg-green-50 border border-green-200' :
            isNoChange ? 'bg-gray-50 border border-gray-200' :
                        'bg-orange-50 border border-orange-200'
          }`}>
            <span className={`text-sm font-semibold ${
              isRefund ? 'text-green-700' : isNoChange ? 'text-gray-600' : 'text-orange-700'
            }`}>
              {isRefund ? '↩ Refund customer' : isNoChange ? '✓ No payment change' : '↑ Collect more'}
            </span>
            {!isNoChange && (
              <span className={`text-xl font-bold ${isRefund ? 'text-green-600' : 'text-orange-600'}`}>
                {formatCurrency(isRefund ? refundAmount : collectAmount)}
              </span>
            )}
          </div>
        )}

        {/* ── REFUND body ─────────────────────────────────────────────────────── */}
        {isRefund && (
          <div className="p-4 space-y-3">
            <p className="text-xs text-gray-400 text-center">
              Customer paid more than the new total — choose how to return the difference
            </p>
            <div className={`grid gap-3 ${hasCustomer ? 'grid-cols-2' : 'grid-cols-1'}`}>
              {/* Cash back */}
              <button
                onClick={() => setRefundAsCredit(false)}
                className={`flex flex-col items-center gap-2 py-4 rounded-xl border-2 transition-all ${
                  !refundAsCredit
                    ? 'border-saffron-400 bg-saffron-50 text-saffron-700'
                    : 'border-gray-100 text-gray-500 hover:border-gray-200'
                }`}
              >
                <Banknote size={22} />
                <span className="text-sm font-semibold">Cash Back</span>
                <span className="text-xs text-gray-400">Give {formatCurrency(refundAmount)} cash</span>
              </button>
              {/* Store credit (only if customer linked) */}
              {hasCustomer && (
                <button
                  onClick={() => setRefundAsCredit(true)}
                  className={`flex flex-col items-center gap-2 py-4 rounded-xl border-2 transition-all ${
                    refundAsCredit
                      ? 'border-green-400 bg-green-50 text-green-700'
                      : 'border-gray-100 text-gray-500 hover:border-gray-200'
                  }`}
                >
                  <CreditCard size={22} />
                  <span className="text-sm font-semibold">Store Credit</span>
                  <span className="text-xs text-gray-400">Add to credit balance</span>
                </button>
              )}
            </div>
            {refundAsCredit && (
              <p className="text-xs text-center text-green-600 font-medium bg-green-50 rounded-lg py-2">
                ✓ {formatCurrency(refundAmount)} will be added to{' '}
                {customerName ? `${customerName}'s` : "customer's"} store credit
              </p>
            )}
          </div>
        )}

        {/* ── NO CHANGE body ─────────────────────────────────────────────────── */}
        {isNoChange && (
          <div className="p-4">
            <div className="bg-gray-50 rounded-xl p-5 text-center">
              <CheckCircle2 size={36} className="text-green-500 mx-auto mb-2" />
              <p className="text-sm font-semibold text-gray-700">No payment needed</p>
              <p className="text-xs text-gray-400 mt-1">
                New bill total matches what was already paid
              </p>
            </div>
          </div>
        )}

        {/* ── COLLECT body (normal + collect-delta) ──────────────────────────── */}
        {!isRefund && !isNoChange && (
          <>
            {/* Payment method selector */}
            <div className="flex gap-2 p-4 border-b border-gray-100">
              {(['cash', 'upi', 'card'] as const).map(m => {
                const icons  = { cash: <Banknote size={18} />, upi: <Smartphone size={18} />, card: <CreditCard size={18} /> };
                const labels = { cash: 'Cash', upi: 'UPI', card: 'Card' };
                return (
                  <button
                    key={m}
                    onClick={() => setMethod(m)}
                    className={`flex-1 flex flex-col items-center gap-1 py-3 rounded-xl border-2 transition-all ${
                      method === m
                        ? 'border-saffron-400 bg-saffron-50 text-saffron-700'
                        : 'border-gray-100 text-gray-500 hover:border-gray-200'
                    }`}
                  >
                    {icons[m]}
                    <span className="text-xs font-semibold">{labels[m]}</span>
                  </button>
                );
              })}
            </div>

            {/* Cash */}
            {method === 'cash' && (
              <div className="p-4 space-y-3">
                {isModified && (
                  <p className="text-xs text-center text-orange-600 font-medium">
                    Extra to collect: {formatCurrency(collectAmount)}
                  </p>
                )}
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Amount Received (₹)</label>
                  <input
                    autoFocus
                    type="number"
                    value={cashInput}
                    onChange={e => setCashInput(e.target.value)}
                    className="w-full text-2xl font-bold px-4 py-3 border-2 border-saffron-200 rounded-xl focus:outline-none focus:border-saffron-400 text-center"
                  />
                </div>
                <div className="flex gap-1.5 flex-wrap">
                  <button onClick={setExact} className="px-3 py-1.5 bg-gray-100 rounded-lg text-xs font-medium hover:bg-saffron-100 hover:text-saffron-700">
                    Exact
                  </button>
                  {QUICK_CASH.map(a => (
                    <button key={a} onClick={() => setQuick(a)} className="px-3 py-1.5 bg-gray-100 rounded-lg text-xs font-medium hover:bg-saffron-100 hover:text-saffron-700">
                      ₹{a}
                    </button>
                  ))}
                </div>
                {cashAmount >= collectAmount && (
                  <div className="bg-green-50 rounded-xl px-4 py-3 space-y-2">
                    <div className="flex justify-between items-center">
                      <span className="text-sm text-gray-700">Change to Return</span>
                      <span className="text-xl font-bold text-green-600">{formatCurrency(change)}</span>
                    </div>
                    {canSaveCredit && (
                      <button
                        onClick={() => setSaveCredit(s => !s)}
                        className={`w-full flex items-center justify-center gap-1.5 py-1.5 rounded-lg border text-xs font-semibold transition-all ${
                          saveCredit
                            ? 'bg-green-600 border-green-600 text-white'
                            : 'bg-white border-green-300 text-green-700 hover:bg-green-100'
                        }`}
                      >
                        <CreditCard size={12} />
                        {saveCredit
                          ? `✓ Saving ₹${change.toFixed(2)} as store credit`
                          : `Save ₹${change.toFixed(2)} as store credit`}
                      </button>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* UPI */}
            {method === 'upi' && (
              <div className="p-4 space-y-4">
                <div className="flex items-center justify-center gap-4 bg-saffron-50 rounded-xl p-4">
                  {['phonepay', 'gpay', 'paytm', 'bhim'].map(app => (
                    <div key={app} className="flex flex-col items-center gap-1">
                      <div className="w-12 h-12 rounded-xl bg-white shadow-sm flex items-center justify-center text-2xl">
                        {app === 'phonepay' ? '📱' : app === 'gpay' ? '💳' : app === 'paytm' ? '🏦' : '🇮🇳'}
                      </div>
                      <span className="text-[10px] text-gray-500 capitalize">{app}</span>
                    </div>
                  ))}
                </div>
                <div className="text-center">
                  <p className="text-2xl font-bold text-saffron-600">{formatCurrency(collectAmount)}</p>
                  <p className="text-xs text-gray-400 mt-1">Ask customer to scan or enter UPI ID</p>
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">UPI Reference No. (optional)</label>
                  <input
                    type="text"
                    value={upiRef}
                    onChange={e => setUpiRef(e.target.value)}
                    placeholder="e.g. 402345678901"
                    className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:border-saffron-400"
                  />
                </div>
              </div>
            )}

            {/* Card */}
            {method === 'card' && (
              <div className="p-4 space-y-4">
                <div className="text-center bg-saffron-50 rounded-xl p-4">
                  <p className="text-2xl font-bold text-saffron-600">{formatCurrency(collectAmount)}</p>
                  <p className="text-xs text-gray-400 mt-1">Insert / Tap / Swipe card on POS terminal</p>
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Card Reference / Approval Code</label>
                  <input
                    type="text"
                    value={cardRef}
                    onChange={e => setCardRef(e.target.value)}
                    placeholder="e.g. AUTH123456"
                    className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:border-saffron-400"
                  />
                </div>
              </div>
            )}
          </>
        )}

        {/* ── Confirm button ─────────────────────────────────────────────────── */}
        <div className="px-4 pb-4">
          <button
            onClick={() => void handleConfirm()}
            disabled={!isValid || submitting}
            className="w-full py-3.5 bg-saffron-400 hover:bg-saffron-500 disabled:bg-gray-200 disabled:text-gray-400 text-white font-bold rounded-xl transition-colors flex items-center justify-center gap-2 text-base"
          >
            {submitting ? <div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" /> : <CheckCircle2 size={18} />}
            {submitting ? 'Processing...' : isRefund
              ? refundAsCredit
                ? `Add ${formatCurrency(refundAmount)} to Store Credit`
                : `Confirm — Give Back ${formatCurrency(refundAmount)}`
              : isNoChange
              ? 'Confirm Bill Update'
              : `Confirm Payment ${formatCurrency(collectAmount)}`}
          </button>
        </div>
      </div>
    </div>
  );
}
