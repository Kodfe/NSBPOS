'use client';
import { useState } from 'react';
import { Trash2, User, Pause, ShoppingCart, ChevronUp, ChevronDown, Scale, Pencil, FilePen } from 'lucide-react';
import { Bill, CartItem, Customer, StoreSettings } from '@/types';
import { formatCurrency } from '@/lib/utils';
import WeightModal from './WeightModal';
import AdjustmentPanel from './AdjustmentPanel';

interface Props {
  bill: Bill;
  customer: Customer | null;
  settings?: StoreSettings;
  adjustment: number;
  adjustmentNote: string;
  storeCreditApplied: number;
  originalBillTotal?: number;    // set when this is an edit of a paid bill
  onAdjustmentChange: (amount: number, note: string) => void;
  onStoreCreditChange: (amount: number) => void;
  onUpdateQuantity: (id: string, qty: number) => void;
  onUpdateWeight: (id: string, weightKg: number) => void;
  onUpdateDiscount: (id: string, discount: number) => void;
  onRemoveItem: (id: string) => void;
  onClearBill: () => void;
  onHoldBill: () => void;
  onOpenPayment: () => void;
  onOpenCustomer: () => void;
}

export default function CartPanel({
  bill, customer, settings,
  adjustment, adjustmentNote, storeCreditApplied, originalBillTotal,
  onAdjustmentChange, onStoreCreditChange,
  onUpdateQuantity, onUpdateWeight, onUpdateDiscount,
  onRemoveItem, onClearBill, onHoldBill, onOpenPayment, onOpenCustomer,
}: Props) {
  const hasItems = bill.items.length > 0;
  const itemCount = bill.items.reduce((s, i) => s + (i.product.isLoose ? 1 : i.quantity), 0);

  // Modified-bill delta calculations
  const isModified = originalBillTotal !== undefined;
  const delta = isModified ? bill.total - originalBillTotal! : null;
  const isRefund   = delta !== null && delta < 0;
  const isNoChange = delta !== null && Math.round(delta * 100) === 0;

  return (
    <div className="flex flex-col h-full bg-white">

      {/* MODIFIED BILL banner */}
      {isModified && (
        <div className="flex items-center gap-2 px-4 py-2 bg-orange-50 border-b border-orange-200">
          <FilePen size={13} className="text-orange-500 flex-shrink-0" />
          <span className="text-xs font-bold text-orange-600">MODIFIED BILL</span>
          <span className="text-xs text-orange-400 ml-1">·  Original paid: {formatCurrency(originalBillTotal!)}</span>
        </div>
      )}

      {/* Customer bar */}
      <button
        onClick={onOpenCustomer}
        className="flex items-center gap-2 px-4 py-2.5 border-b border-gray-100 hover:bg-gray-50 transition-colors"
      >
        <div className={`flex items-center justify-center w-7 h-7 rounded-full ${customer ? 'bg-saffron-100' : 'bg-gray-100'}`}>
          <User size={14} className={customer ? 'text-saffron-600' : 'text-gray-400'} />
        </div>
        <div className="text-left flex-1">
          {customer ? (
            <>
              <p className="text-sm font-semibold text-gray-800">{customer.name}</p>
              <p className="text-xs text-gray-400">
                {customer.phone}
                {(customer.storeCredit ?? 0) > 0 && (
                  <span className="ml-2 text-green-600 font-semibold">
                    &#8377;{customer.storeCredit!.toFixed(0)} credit
                  </span>
                )}
              </p>
            </>
          ) : (
            <p className="text-sm text-gray-500">Add Customer (optional)</p>
          )}
        </div>
        <span className="text-xs text-saffron-500">Edit</span>
      </button>

      {/* Cart items */}
      <div className="flex-1 overflow-y-auto scrollbar-thin">
        {!hasItems ? (
          <div className="flex flex-col items-center justify-center h-40 text-gray-300">
            <ShoppingCart size={40} className="mb-2" />
            <p className="text-sm">Cart is empty</p>
            <p className="text-xs mt-1">Search or scan items to add</p>
          </div>
        ) : (
          <div className="divide-y divide-gray-50">
            {bill.items.map(item => (
              item.product.isLoose ? (
                <LooseCartItemRow
                  key={item.product.id}
                  item={item}
                  onUpdateWeight={w => onUpdateWeight(item.product.id, w)}
                  onRemove={() => onRemoveItem(item.product.id)}
                />
              ) : (
                <CartItemRow
                  key={item.product.id}
                  item={item}
                  onUpdateQuantity={qty => onUpdateQuantity(item.product.id, qty)}
                  onUpdateDiscount={d => onUpdateDiscount(item.product.id, d)}
                  onRemove={() => onRemoveItem(item.product.id)}
                />
              )
            ))}
          </div>
        )}
      </div>

      {/* Totals */}
      {hasItems && (
        <div className="border-t border-gray-200 bg-gray-50 px-4 py-3 space-y-1.5">
          <div className="flex justify-between text-sm text-gray-600">
            <span>Subtotal ({itemCount} items)</span>
            <span>{formatCurrency(bill.subtotal)}</span>
          </div>
          {bill.totalDiscount > 0 && (
            <div className="flex justify-between text-sm text-green-600">
              <span>Discount</span>
              <span>-{formatCurrency(bill.totalDiscount)}</span>
            </div>
          )}
          <div className="flex justify-between text-sm text-gray-600">
            <span>GST</span>
            <span>{formatCurrency(bill.totalGst)}</span>
          </div>
          {bill.roundOff !== 0 && (
            <div className="flex justify-between text-xs text-gray-400">
              <span>Round off</span>
              <span>{bill.roundOff > 0 ? '+' : ''}{bill.roundOff.toFixed(2)}</span>
            </div>
          )}

          {/* Bill-level adjustment */}
          {adjustment !== 0 && (
            <div className={`flex justify-between text-sm font-medium ${adjustment < 0 ? 'text-green-600' : 'text-red-500'}`}>
              <span>{adjustmentNote || (adjustment < 0 ? 'Discount' : 'Due Recovery')}</span>
              <span>{adjustment < 0 ? '-' : '+'}{formatCurrency(Math.abs(adjustment))}</span>
            </div>
          )}

          {/* Store credit applied */}
          {storeCreditApplied > 0 && (
            <div className="flex justify-between text-sm font-medium text-green-600">
              <span>Store Credit</span>
              <span>-{formatCurrency(storeCreditApplied)}</span>
            </div>
          )}

          <div className="flex justify-between text-lg font-bold text-gray-900 pt-1 border-t border-gray-200">
            <span>Total</span>
            <span className="text-saffron-600">{formatCurrency(bill.total)}</span>
          </div>

          {/* Delta summary for modified bills */}
          {isModified && (
            <div className="mt-2 pt-2 border-t border-dashed border-gray-300 space-y-1">
              {isNoChange ? (
                <p className="text-xs text-green-600 font-semibold text-center">
                  ✓ Same as original — no payment change
                </p>
              ) : isRefund ? (
                <div className="flex justify-between text-sm font-bold text-green-700 bg-green-50 rounded-lg px-3 py-1.5">
                  <span>↩ Refund to customer</span>
                  <span>{formatCurrency(-delta!)}</span>
                </div>
              ) : (
                <div className="flex justify-between text-sm font-bold text-orange-600 bg-orange-50 rounded-lg px-3 py-1.5">
                  <span>↑ Collect extra</span>
                  <span>{formatCurrency(delta!)}</span>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Adjustment panel (collapsible) */}
      {hasItems && (
        <AdjustmentPanel
          total={bill.subtotal}
          customer={customer}
          adjustment={adjustment}
          adjustmentNote={adjustmentNote}
          storeCreditApplied={storeCreditApplied}
          onAdjustmentChange={onAdjustmentChange}
          onStoreCreditChange={onStoreCreditChange}
        />
      )}

      {/* Action buttons */}
      <div className="p-3 space-y-2 border-t border-gray-200">
        <button
          onClick={onOpenPayment}
          disabled={!hasItems}
          className={`w-full py-3 disabled:bg-gray-200 disabled:text-gray-400 text-white font-bold rounded-xl transition-colors text-base shadow-sm ${
            isModified && isRefund   ? 'bg-green-600 hover:bg-green-700' :
            isModified && isNoChange ? 'bg-gray-500 hover:bg-gray-600' :
                                       'bg-saffron-400 hover:bg-saffron-500'
          }`}
        >
          {!hasItems ? 'Pay'
            : isModified && isRefund   ? `Refund ${formatCurrency(-delta!)}`
            : isModified && isNoChange ? 'Confirm — No Charge'
            : isModified               ? `Collect ${formatCurrency(delta!)}`
            : `Pay ${formatCurrency(bill.total)}`}
        </button>
        <div className="flex gap-2">
          <button
            onClick={onHoldBill}
            disabled={!hasItems}
            className="flex-1 flex items-center justify-center gap-1.5 py-2 border border-gray-200 rounded-xl text-sm text-gray-600 hover:bg-gray-50 disabled:opacity-40 transition-colors"
          >
            <Pause size={14} /> Hold
          </button>
          <button
            onClick={onClearBill}
            disabled={!hasItems}
            className="flex-1 flex items-center justify-center gap-1.5 py-2 border border-red-100 rounded-xl text-sm text-red-500 hover:bg-red-50 disabled:opacity-40 transition-colors"
          >
            <Trash2 size={14} /> Clear
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Loose item row (weight-based) ─────────────────────────────────────────────

function LooseCartItemRow({
  item, onUpdateWeight, onRemove,
}: {
  item: CartItem;
  onUpdateWeight: (w: number) => void;
  onRemove: () => void;
}) {
  const [showModal, setShowModal] = useState(false);
  const weightKg = item.weightKg ?? item.quantity;

  return (
    <div className="px-3 py-2.5 bg-amber-50/40">
      <div className="flex items-start gap-2">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1 mb-0.5">
            <Scale size={11} className="text-amber-500 flex-shrink-0" />
            <p className="text-sm font-medium text-gray-800 truncate">{item.product.name}</p>
          </div>
          <p className="text-xs text-gray-500">
            <span className="font-semibold text-amber-700">{weightKg} kg</span>
            {' '}×{' '}
            <span>&#8377;{item.product.price}/kg</span>
            {' '}={' '}
            <span className="font-semibold text-gray-700">&#8377;{item.total.toFixed(2)}</span>
          </p>
        </div>

        {/* Edit weight button */}
        <button
          onClick={() => setShowModal(true)}
          className="flex items-center gap-1 px-2.5 py-1 bg-amber-100 hover:bg-amber-200 text-amber-700 rounded-lg text-xs font-semibold transition-colors"
        >
          <Pencil size={11} /> Edit
        </button>

        {/* Remove */}
        <button onClick={onRemove} className="text-gray-300 hover:text-red-500 transition-colors p-1">
          <Trash2 size={14} />
        </button>
      </div>

      {showModal && (
        <WeightModal
          product={item.product}
          currentWeight={weightKg}
          onConfirm={w => { onUpdateWeight(w); setShowModal(false); }}
          onClose={() => setShowModal(false)}
        />
      )}
    </div>
  );
}

// ── Packaged item row ─────────────────────────────────────────────────────────

function CartItemRow({
  item, onUpdateQuantity, onUpdateDiscount, onRemove,
}: {
  item: CartItem;
  onUpdateQuantity: (qty: number) => void;
  onUpdateDiscount: (d: number) => void;
  onRemove: () => void;
}) {
  const [showDiscount, setShowDiscount] = useState(false);

  return (
    <div className="px-3 py-2.5">
      <div className="flex items-start gap-2">
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-gray-800 truncate">{item.product.name}</p>
          <p className="text-xs text-gray-400">
            &#8377;{item.product.price} × {item.quantity} = <span className="font-semibold text-gray-700">&#8377;{item.total.toFixed(2)}</span>
          </p>
          {item.discount > 0 && (
            <p className="text-xs text-green-600">
              Disc: {item.discount}% (-&#8377;{(item.product.price * item.quantity * item.discount / 100).toFixed(2)})
            </p>
          )}
        </div>

        {/* Qty control */}
        <div className="flex items-center gap-1 bg-gray-100 rounded-lg">
          <button onClick={() => onUpdateQuantity(item.quantity - 1)} className="px-2 py-1 hover:text-red-500 transition-colors">
            <ChevronDown size={14} />
          </button>
          <span className="text-sm font-bold w-6 text-center">{item.quantity}</span>
          <button onClick={() => onUpdateQuantity(item.quantity + 1)} className="px-2 py-1 hover:text-saffron-500 transition-colors">
            <ChevronUp size={14} />
          </button>
        </div>

        {/* Remove */}
        <button onClick={onRemove} className="text-gray-300 hover:text-red-500 transition-colors p-1">
          <Trash2 size={14} />
        </button>
      </div>

      {/* Discount toggle */}
      <button
        onClick={() => setShowDiscount(s => !s)}
        className="text-[10px] text-saffron-500 hover:underline mt-0.5"
      >
        {showDiscount ? 'Hide' : 'Add'} discount
      </button>
      {showDiscount && (
        <div className="mt-1 flex items-center gap-2">
          <input
            type="number"
            min={0}
            max={100}
            value={item.discount}
            onChange={e => onUpdateDiscount(Number(e.target.value))}
            className="w-20 px-2 py-1 text-xs border border-gray-200 rounded-lg focus:outline-none focus:border-saffron-400"
            placeholder="0"
          />
          <span className="text-xs text-gray-500">%</span>
        </div>
      )}
    </div>
  );
}
