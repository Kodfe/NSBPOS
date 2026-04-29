'use client';
import { useState } from 'react';
import { ChevronDown, ChevronUp, Tag, AlertCircle, CreditCard, X } from 'lucide-react';
import { Customer } from '@/types';

interface Props {
  total: number;
  customer: Customer | null;
  adjustment: number;
  adjustmentNote: string;
  storeCreditApplied: number;
  onAdjustmentChange: (amount: number, note: string) => void;
  onStoreCreditChange: (amount: number) => void;
}

type DiscountMode = 'amount' | 'percent';

export default function AdjustmentPanel({
  total,
  customer,
  adjustment,
  adjustmentNote,
  storeCreditApplied,
  onAdjustmentChange,
  onStoreCreditChange,
}: Props) {
  const [open, setOpen] = useState(false);

  // Discount section state
  const [discountMode, setDiscountMode] = useState<DiscountMode>('amount');
  const [discountInput, setDiscountInput] = useState('');

  // Due / recovery section state
  const [dueInput, setDueInput] = useState('');
  const [dueNote, setDueNote] = useState('');

  // Store credit section state
  const [creditInput, setCreditInput] = useState('');

  const availableCredit = customer?.storeCredit ?? 0;
  const hasAdjustedDiscount = adjustment < 0;
  const hasAdjustedDue = adjustment > 0;

  function applyDiscount() {
    const val = parseFloat(discountInput) || 0;
    if (val <= 0) return;
    if (discountMode === 'amount') {
      onAdjustmentChange(-val, `Discount ₹${val.toFixed(2)}`);
    } else {
      const amt = (total * val) / 100;
      onAdjustmentChange(-amt, `Discount ${val}%`);
    }
    setDiscountInput('');
  }

  function applyDue() {
    const val = parseFloat(dueInput) || 0;
    if (val <= 0) return;
    onAdjustmentChange(val, dueNote.trim() || 'Old Due Recovery');
    setDueInput('');
    setDueNote('');
  }

  function useCredit() {
    const val = Math.min(parseFloat(creditInput) || 0, availableCredit);
    if (val <= 0) return;
    onStoreCreditChange(val);
    setCreditInput('');
  }

  const calculatedDiscount =
    discountMode === 'percent'
      ? ((parseFloat(discountInput) || 0) * total) / 100
      : parseFloat(discountInput) || 0;

  return (
    <div className="border-t border-gray-200">
      {/* Toggle button */}
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between px-4 py-2 text-xs text-gray-500 hover:bg-gray-50 transition-colors"
      >
        <span className="font-semibold uppercase tracking-wide">Adjustments</span>
        {open ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
      </button>

      {/* Applied summary (always visible if something is applied) */}
      {(adjustment !== 0 || storeCreditApplied > 0) && (
        <div className="px-4 pb-2 space-y-1">
          {adjustment !== 0 && (
            <div className={`flex items-center justify-between gap-2 text-xs font-medium ${adjustment < 0 ? 'text-green-700' : 'text-red-600'}`}>
              <span className="min-w-0 truncate">{adjustmentNote || (adjustment < 0 ? 'Discount' : 'Due')}</span>
              <span className="flex items-center gap-1">
                {adjustment < 0 ? '-' : '+'}&#8377;{Math.abs(adjustment).toFixed(2)}
                <button
                  onClick={() => onAdjustmentChange(0, '')}
                  className="p-0.5 rounded text-gray-400 hover:text-red-500 hover:bg-red-50"
                  title={adjustment < 0 ? 'Remove adjusted discount' : 'Remove adjusted due'}
                >
                  <X size={12} />
                </button>
              </span>
            </div>
          )}
          {storeCreditApplied > 0 && (
            <div className="flex justify-between text-xs font-medium text-green-700">
              <span>Store Credit</span>
              <span>-&#8377;{storeCreditApplied.toFixed(2)}</span>
            </div>
          )}
        </div>
      )}

      {open && (
        <div className="px-4 pb-4 space-y-4 bg-gray-50 border-t border-gray-100">

          {/* ── Section 1: Discount ── */}
          <div className="pt-3">
            <div className="flex items-center justify-between gap-2 mb-2">
              <div className="flex items-center gap-1.5 text-xs font-semibold text-gray-600 uppercase tracking-wide">
                <Tag size={12} />
                <span>Discount</span>
              </div>
              {hasAdjustedDiscount && (
                <button onClick={() => onAdjustmentChange(0, '')} className="text-[11px] text-red-500 hover:underline">
                  Remove
                </button>
              )}
            </div>
            <div className="flex gap-3 mb-2">
              <label className="flex items-center gap-1.5 text-xs text-gray-600 cursor-pointer">
                <input
                  type="radio"
                  name="discount-mode"
                  value="amount"
                  checked={discountMode === 'amount'}
                  onChange={() => setDiscountMode('amount')}
                  className="accent-saffron-400"
                />
                Amount (&#8377;)
              </label>
              <label className="flex items-center gap-1.5 text-xs text-gray-600 cursor-pointer">
                <input
                  type="radio"
                  name="discount-mode"
                  value="percent"
                  checked={discountMode === 'percent'}
                  onChange={() => setDiscountMode('percent')}
                  className="accent-saffron-400"
                />
                Percent (%)
              </label>
            </div>
            <div className="flex gap-2">
              <input
                type="number"
                min={0}
                value={discountInput}
                onChange={e => setDiscountInput(e.target.value)}
                placeholder={discountMode === 'amount' ? '0.00' : '0'}
                className="flex-1 px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-saffron-400 bg-white"
              />
              <button
                onClick={applyDiscount}
                disabled={!discountInput || parseFloat(discountInput) <= 0}
                className="px-3 py-2 bg-saffron-400 hover:bg-saffron-500 disabled:bg-gray-200 disabled:text-gray-400 text-white text-xs font-semibold rounded-lg transition-colors"
              >
                Apply
              </button>
            </div>
            {discountInput && parseFloat(discountInput) > 0 && discountMode === 'percent' && (
              <p className="text-xs text-gray-500 mt-1">
                = &#8377;{calculatedDiscount.toFixed(2)} off
              </p>
            )}
          </div>

          {/* ── Section 2: Old Due / Recovery ── */}
          <div className="border-t border-gray-200 pt-3">
            <div className="flex items-center justify-between gap-2 mb-1">
              <div className="flex items-center gap-1.5 text-xs font-semibold text-gray-600 uppercase tracking-wide">
                <AlertCircle size={12} />
                <span>Old Due / Recovery</span>
              </div>
              {hasAdjustedDue && (
                <button onClick={() => onAdjustmentChange(0, '')} className="text-[11px] text-red-500 hover:underline">
                  Remove
                </button>
              )}
            </div>
            <p className="text-[10px] text-gray-400 mb-2">(+) adds to total</p>
            <div className="space-y-2">
              <input
                type="number"
                min={0}
                value={dueInput}
                onChange={e => setDueInput(e.target.value)}
                placeholder="Amount ₹"
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-saffron-400 bg-white"
              />
              <div className="flex gap-2">
                <input
                  type="text"
                  value={dueNote}
                  onChange={e => setDueNote(e.target.value)}
                  placeholder="Note (e.g. Feb due)"
                  className="flex-1 px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-saffron-400 bg-white"
                />
                <button
                  onClick={applyDue}
                  disabled={!dueInput || parseFloat(dueInput) <= 0}
                  className="px-3 py-2 bg-red-500 hover:bg-red-600 disabled:bg-gray-200 disabled:text-gray-400 text-white text-xs font-semibold rounded-lg transition-colors"
                >
                  Apply
                </button>
              </div>
            </div>
          </div>

          {/* ── Section 3: Store Credit ── */}
          {customer && availableCredit > 0 && (
            <div className="border-t border-gray-200 pt-3">
              <div className="flex items-center gap-1.5 mb-1 text-xs font-semibold text-gray-600 uppercase tracking-wide">
                <CreditCard size={12} />
                <span>Store Credit</span>
              </div>
              <p className="text-xs text-green-700 font-semibold mb-2">
                Available: &#8377;{availableCredit.toFixed(2)}
              </p>
              <div className="flex gap-2">
                <input
                  type="number"
                  min={0}
                  max={availableCredit}
                  value={creditInput}
                  onChange={e => setCreditInput(e.target.value)}
                  placeholder={`Max ₹${availableCredit.toFixed(2)}`}
                  className="flex-1 px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-saffron-400 bg-white"
                />
                <button
                  onClick={useCredit}
                  disabled={!creditInput || parseFloat(creditInput) <= 0}
                  className="px-3 py-2 bg-green-600 hover:bg-green-700 disabled:bg-gray-200 disabled:text-gray-400 text-white text-xs font-semibold rounded-lg transition-colors"
                >
                  Use Credit
                </button>
              </div>
            </div>
          )}

          {/* Reset button */}
          {(adjustment !== 0 || storeCreditApplied > 0) && (
            <div className="border-t border-gray-200 pt-2">
              <button
                onClick={() => {
                  onAdjustmentChange(0, '');
                  onStoreCreditChange(0);
                }}
                className="text-xs text-red-500 hover:underline"
              >
                Clear all adjustments
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
