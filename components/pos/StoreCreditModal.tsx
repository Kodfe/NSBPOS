'use client';
import { CreditCard } from 'lucide-react';
import { Customer } from '@/types';

interface Props {
  customer: Customer;
  changeAmount: number;
  onSaveCredit: () => void;
  onSkip: () => void;
}

export default function StoreCreditModal({ customer, changeAmount, onSaveCredit, onSkip }: Props) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 animate-fade-in">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm mx-4 animate-slide-up">

        {/* Icon header */}
        <div className="flex flex-col items-center pt-8 pb-4 px-6">
          <div className="w-14 h-14 rounded-full bg-green-100 flex items-center justify-center mb-3">
            <CreditCard size={28} className="text-green-600" />
          </div>
          <h2 className="text-lg font-bold text-gray-900 text-center">Save Change as Store Credit?</h2>
        </div>

        {/* Details */}
        <div className="px-6 pb-4 space-y-3">
          <div className="bg-gray-50 rounded-xl px-4 py-3 space-y-1.5">
            <div className="flex justify-between text-sm text-gray-600">
              <span>Customer</span>
              <span className="font-semibold text-gray-800">{customer.name}</span>
            </div>
            <div className="flex justify-between text-sm text-gray-600">
              <span>Change Amount</span>
              <span className="font-bold text-saffron-600">&#8377;{changeAmount.toFixed(2)}</span>
            </div>
            {(customer.storeCredit ?? 0) > 0 && (
              <div className="flex justify-between text-sm text-gray-500">
                <span>Existing Credit</span>
                <span className="text-green-600 font-medium">&#8377;{customer.storeCredit!.toFixed(2)}</span>
              </div>
            )}
          </div>

          <p className="text-sm text-gray-500 text-center leading-relaxed">
            Instead of giving &#8377;{changeAmount.toFixed(2)} change, save it to{' '}
            <span className="font-semibold text-gray-700">{customer.name}</span>'s account for next purchase.
          </p>
        </div>

        {/* Actions */}
        <div className="flex gap-3 px-6 pb-6">
          <button
            onClick={onSkip}
            className="flex-1 py-2.5 border border-gray-200 rounded-xl text-sm text-gray-600 hover:bg-gray-50 transition-colors"
          >
            Skip
          </button>
          <button
            onClick={onSaveCredit}
            className="flex-1 py-2.5 bg-saffron-400 hover:bg-saffron-500 text-white font-bold rounded-xl text-sm transition-colors"
          >
            Save &#8377;{changeAmount.toFixed(2)} as Credit
          </button>
        </div>
      </div>
    </div>
  );
}
