import { CartItem, Product } from '@/types';

export function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    minimumFractionDigits: 2,
  }).format(amount);
}

export function calcCartItem(product: Product, quantity: number, discount = 0, discountAmount = 0): CartItem {
  const qty = Math.max(0, quantity);
  const baseTotal = product.price * qty;
  const percentDiscount = baseTotal * (Math.min(100, Math.max(0, discount)) / 100);
  const flatDiscount = Math.min(Math.max(0, discountAmount), Math.max(0, baseTotal - percentDiscount));
  const discountedTotal = Math.max(0, baseTotal - percentDiscount - flatDiscount);
  const gstRate = product.gstRate / 100;
  const priceExGst = discountedTotal / (1 + gstRate);
  const gstAmount = discountedTotal - priceExGst;
  const cgst = gstAmount / 2;
  const sgst = gstAmount / 2;

  return {
    product,
    quantity: qty,
    discount: Math.min(100, Math.max(0, discount)),
    discountAmount: flatDiscount,
    total: discountedTotal,
    gstAmount,
    cgst,
    sgst,
  };
}

export function calcBillTotals(
  items: CartItem[],
  adjustment = 0,          // negative = deducts (discount), positive = adds (due)
  storeCreditApplied = 0,  // always deducts
) {
  const subtotal = items.reduce((s, i) => s + i.total, 0);
  const totalGst = items.reduce((s, i) => s + i.gstAmount, 0);
  const totalDiscount = items.reduce((s, i) => s + Math.max(0, (i.product.price * (i.weightKg ?? i.quantity)) - i.total), 0);
  const raw = subtotal + adjustment - storeCreditApplied;
  const roundOff = Math.round(raw) - raw;
  const total = Math.max(0, Math.round(raw));
  return { subtotal, totalGst, totalDiscount, roundOff, total };
}

export function generateTabLabel(index: number): string {
  return `Bill ${index + 1}`;
}

export function shortId(): string {
  return Math.random().toString(36).slice(2, 8).toUpperCase();
}

export function todayString(): string {
  return new Date().toISOString().split('T')[0];
}

export function normalizeBarcode(value?: string | null): string {
  return value?.replace(/[\s\x00-\x1F\x7F]/g, '').trim() ?? '';
}

/**
 * Recursively removes every key whose value is `undefined`.
 * Firestore throws if you try to write `undefined` anywhere in a document.
 */
export function stripUndefined<T>(obj: T): T {
  if (Array.isArray(obj)) {
    return obj.map(stripUndefined) as unknown as T;
  }
  if (
    obj !== null &&
    typeof obj === 'object' &&
    (
      typeof (obj as { toDate?: unknown }).toDate === 'function' ||
      typeof (obj as { isEqual?: unknown }).isEqual === 'function' ||
      typeof (obj as { _methodName?: unknown })._methodName === 'string'
    )
  ) {
    return obj;
  }
  if (
    obj !== null &&
    typeof obj === 'object' &&
    !(obj instanceof Date)
  ) {
    return Object.fromEntries(
      Object.entries(obj)
        .filter(([, v]) => v !== undefined)
        .map(([k, v]) => [k, stripUndefined(v)])
    ) as T;
  }
  return obj;
}
