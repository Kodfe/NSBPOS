'use client';
import { useRef } from 'react';
import { X, Printer } from 'lucide-react';
import { useReactToPrint } from 'react-to-print';
import { Bill, StoreSettings } from '@/types';
import { format } from 'date-fns';
import { DEFAULT_SETTINGS } from '@/lib/settings';

interface Props {
  bill: Bill;
  settings?: StoreSettings;
  onClose: () => void;
  onNewBill: () => void;
}

export default function ReceiptModal({ bill, settings = DEFAULT_SETTINGS, onClose, onNewBill }: Props) {
  const receiptRef = useRef<HTMLDivElement>(null);
  const handlePrint = useReactToPrint({ contentRef: receiptRef });

  // "You Saved" calculation: MRP − actual paid, per line
  const totalSavings = bill.items.reduce((sum, item) => {
    const qty = item.weightKg ?? item.quantity;
    const mrpTotal = item.product.mrp * qty;
    return sum + Math.max(0, mrpTotal - item.total);
  }, 0);

  const showSavings = settings.showSavings && totalSavings > 0;
  const showGst = settings.showGstOnBill && bill.totalGst > 0;

  // column widths (characters) for mono layout
  // S.No | Description | Qty | MRP | Rate | Amt
  const colSno    = 3;
  const colDesc   = 14;
  const colQty    = 8;
  const colMrp    = 6;
  const colRate   = 6;
  const colAmt    = 7;

  function pad(s: string, len: number, right = false): string {
    const str = s.slice(0, len);
    return right ? str.padStart(len) : str.padEnd(len);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 animate-fade-in">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm mx-4 animate-slide-up flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b">
          <h2 className="font-bold text-gray-900">Receipt</h2>
          <button onClick={onClose}><X size={18} /></button>
        </div>

        {/* Receipt Preview */}
        <div className="flex-1 overflow-y-auto p-4">
          <div ref={receiptRef} className="font-mono text-xs text-gray-800 bg-white p-4">

            {/* ── Store header ── */}
            <div className="text-center mb-3">
              <div className="text-[10px] text-gray-500 uppercase tracking-widest">{settings.invoiceTitle}</div>
              <div className="text-base font-bold mt-0.5">{settings.storeName}</div>
              {settings.tagline && <div className="text-[10px] text-gray-500">{settings.tagline}</div>}
              {settings.address && <div className="text-[10px]">{settings.address}</div>}
              {(settings.city || settings.pincode) && (
                <div className="text-[10px]">{[settings.city, settings.pincode].filter(Boolean).join(' - ')}</div>
              )}
              {(settings.phone1 || settings.phone2) && (
                <div className="text-[10px]">Ph: {[settings.phone1, settings.phone2].filter(Boolean).join(', ')}</div>
              )}
              {settings.email && <div className="text-[10px]">{settings.email}</div>}
              {settings.gstin && settings.gstEnabled && (
                <div className="text-[10px] font-semibold">GSTIN: {settings.gstin}</div>
              )}
              <div className="border-b border-dashed border-gray-400 my-2" />
              <div className="flex justify-between">
                <span>Bill No: {bill.billNumber}</span>
                <span>{bill.paidAt ? format(bill.paidAt, 'dd/MM/yy HH:mm') : ''}</span>
              </div>
              {bill.customer && (
                <div className="flex justify-between text-left">
                  <span>Customer: {bill.customer.name}</span>
                  <span>{bill.customer.phone}</span>
                </div>
              )}
              {bill.customer?.gstin && (
                <div className="text-left text-[10px]">GSTIN: {bill.customer.gstin}</div>
              )}
              <div className="border-b border-dashed border-gray-400 my-2" />
            </div>

            {/* ── Items table ── */}
            <div className="mb-2 overflow-x-auto">
              {/* Header row */}
              <div className="flex font-bold border-b border-gray-400 pb-0.5 mb-1 text-[10px]">
                <span style={{ width: `${colSno}ch`, flexShrink: 0 }}>#</span>
                <span style={{ flex: 1 }}>Description</span>
                <span style={{ width: `${colQty}ch`, flexShrink: 0, textAlign: 'right' }}>Qty</span>
                <span style={{ width: `${colMrp}ch`, flexShrink: 0, textAlign: 'right' }}>MRP</span>
                <span style={{ width: `${colRate}ch`, flexShrink: 0, textAlign: 'right' }}>Rate</span>
                <span style={{ width: `${colAmt}ch`, flexShrink: 0, textAlign: 'right' }}>Amt</span>
              </div>

              {bill.items.map((item, i) => {
                const isLoose = item.product.isLoose;
                const weightKg = item.weightKg ?? item.quantity;
                const qtyDisplay = isLoose
                  ? `${weightKg.toFixed(3)} kg`
                  : `${item.quantity}`;
                const mrpDisplay = `${item.product.mrp.toFixed(0)}`;
                const rateDisplay = `${item.product.price.toFixed(0)}`;
                const amtDisplay = `${item.total.toFixed(2)}`;

                return (
                  <div key={i} className="mb-1 text-[10px]">
                    <div className="flex items-baseline">
                      <span style={{ width: `${colSno}ch`, flexShrink: 0 }}>{i + 1}.</span>
                      <span style={{ flex: 1, overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis' }}>
                        {item.product.name}
                      </span>
                      <span style={{ width: `${colQty}ch`, flexShrink: 0, textAlign: 'right' }}>{qtyDisplay}</span>
                      <span style={{ width: `${colMrp}ch`, flexShrink: 0, textAlign: 'right' }}>{mrpDisplay}</span>
                      <span style={{ width: `${colRate}ch`, flexShrink: 0, textAlign: 'right' }}>{rateDisplay}</span>
                      <span style={{ width: `${colAmt}ch`, flexShrink: 0, textAlign: 'right' }}>{amtDisplay}</span>
                    </div>
                    {/* sub-line for discount / GST */}
                    {(item.discount > 0 || (settings.gstEnabled && item.product.gstRate > 0)) && (
                      <div className="text-gray-400 pl-4 text-[9px]">
                        {item.discount > 0 ? `Disc: ${item.discount}%` : ''}
                        {item.discount > 0 && settings.gstEnabled && item.product.gstRate > 0 ? ' | ' : ''}
                        {settings.gstEnabled && item.product.gstRate > 0 ? `GST@${item.product.gstRate}%` : ''}
                      </div>
                    )}
                  </div>
                );
              })}

              <div className="border-b border-dashed border-gray-400 my-2" />
            </div>

            {/* ── Totals ── */}
            <div className="space-y-0.5 text-[11px]">
              <div className="flex justify-between">
                <span>Subtotal</span>
                <span>&#8377;{bill.subtotal.toFixed(2)}</span>
              </div>
              {bill.totalDiscount > 0 && (
                <div className="flex justify-between text-green-700">
                  <span>Discount</span>
                  <span>-&#8377;{bill.totalDiscount.toFixed(2)}</span>
                </div>
              )}
              {settings.gstEnabled && (
                <div className="flex justify-between">
                  <span>GST{settings.gstInclusive ? ' (incl.)' : ''}</span>
                  <span>&#8377;{bill.totalGst.toFixed(2)}</span>
                </div>
              )}
              {bill.roundOff !== 0 && (
                <div className="flex justify-between text-gray-400">
                  <span>Round off</span>
                  <span>{bill.roundOff > 0 ? '+' : ''}{bill.roundOff.toFixed(2)}</span>
                </div>
              )}

              {/* Adjustment line */}
              {bill.adjustment !== undefined && bill.adjustment !== 0 && (
                <div className={`flex justify-between ${bill.adjustment < 0 ? 'text-green-700' : 'text-red-600'}`}>
                  <span>{bill.adjustmentNote || (bill.adjustment < 0 ? 'Extra Discount' : 'Due Recovery')}</span>
                  <span>{bill.adjustment < 0 ? '-' : '+'}&#8377;{Math.abs(bill.adjustment).toFixed(2)}</span>
                </div>
              )}

              {/* Store credit applied */}
              {(bill.storeCreditApplied ?? 0) > 0 && (
                <div className="flex justify-between text-green-700">
                  <span>Store Credit Used</span>
                  <span>-&#8377;{bill.storeCreditApplied!.toFixed(2)}</span>
                </div>
              )}

              <div className="border-t border-gray-400 mt-1 pt-1 flex justify-between font-bold text-sm">
                <span>TOTAL</span>
                <span>&#8377;{bill.total.toFixed(2)}</span>
              </div>
              <div className="flex justify-between">
                <span>Payment: {bill.paymentMethod?.toUpperCase()}</span>
                <span>&#8377;{(bill.amountPaid || 0).toFixed(2)}</span>
              </div>
              {(bill.change || 0) > 0 && (
                <div className="flex justify-between">
                  <span>Change</span>
                  <span>&#8377;{bill.change!.toFixed(2)}</span>
                </div>
              )}

              {/* Store credit earned */}
              {(bill.storeCreditEarned ?? 0) > 0 && (
                <div className="flex justify-between text-green-700 font-semibold mt-1">
                  <span>Credit saved for next purchase</span>
                  <span>&#8377;{bill.storeCreditEarned!.toFixed(2)}</span>
                </div>
              )}
            </div>

            {/* ── GST Summary (only if showGstOnBill) ── */}
            {showGst && (
              <>
                <div className="border-b border-dashed border-gray-400 my-2" />
                <div className="text-center text-gray-500 text-[10px]">
                  <div className="font-semibold mb-0.5">GST Summary</div>
                  {Array.from(new Set(bill.items.filter(i => i.product.gstRate > 0).map(i => i.product.gstRate))).map(rate => {
                    const rateItems = bill.items.filter(i => i.product.gstRate === rate);
                    const gst = rateItems.reduce((s, i) => s + i.gstAmount, 0);
                    const cgst = gst / 2;
                    return (
                      <div key={rate}>
                        <div className="flex justify-between">
                          <span>CGST @{rate / 2}%</span><span>&#8377;{cgst.toFixed(2)}</span>
                        </div>
                        <div className="flex justify-between">
                          <span>SGST @{rate / 2}%</span><span>&#8377;{cgst.toFixed(2)}</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </>
            )}

            {/* ── You Saved (only if showSavings and savings > 0) ── */}
            {showSavings && (
              <>
                <div className="border-b border-dashed border-gray-400 my-2" />
                <div className="text-center font-bold text-sm">
                  You Saved &#8377;{totalSavings.toFixed(2)}!
                </div>
              </>
            )}

            {/* ── Store credit earned banner ── */}
            {(bill.storeCreditEarned ?? 0) > 0 && (
              <>
                <div className="border-b border-dashed border-gray-400 my-2" />
                <div className="text-center text-green-700 font-semibold text-[11px]">
                  Credit saved: &#8377;{bill.storeCreditEarned!.toFixed(2)} for next purchase
                </div>
              </>
            )}

            {/* ── Footer ── */}
            <div className="text-center mt-3 text-gray-400 text-[10px]">
              <div>{settings.footerMessage || 'Thank you for shopping!'}</div>
              {settings.receiptTerms && (
                <div className="mt-1 whitespace-pre-line text-gray-500">{settings.receiptTerms}</div>
              )}
              <div className="mt-0.5">Powered by NSB POS</div>
            </div>
          </div>
        </div>

        {/* Actions */}
        <div className="p-4 border-t flex gap-2">
          <button
            onClick={() => handlePrint()}
            className="flex-1 flex items-center justify-center gap-2 py-2.5 border-2 border-saffron-400 text-saffron-600 rounded-xl font-semibold hover:bg-saffron-50 transition-colors"
          >
            <Printer size={16} /> Print
          </button>
          <button
            onClick={onNewBill}
            className="flex-1 py-2.5 bg-saffron-400 hover:bg-saffron-500 text-white font-bold rounded-xl transition-colors"
          >
            New Bill
          </button>
        </div>
      </div>
    </div>
  );
}
