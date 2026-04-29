import {
  collection,
  doc,
  getDocs,
  getDoc,
  addDoc,
  updateDoc,
  query,
  where,
  orderBy,
  limit,
  Timestamp,
  serverTimestamp,
  onSnapshot,
} from 'firebase/firestore';
import { db } from './firebase';
import { Product, Bill, Customer, SaleReturn } from '@/types';
import { normalizeBarcode, stripUndefined } from './utils';
import { loadSettings } from './settings';
import { sendLowStockAlert } from './whatsapp-alerts';

function normalizeSearchText(value?: string | null): string {
  return value?.trim().toLowerCase() ?? '';
}

function parseStoredDate(value: unknown): Date | undefined {
  if (!value) return undefined;
  if (typeof (value as { toDate?: unknown }).toDate === 'function') {
    return (value as { toDate: () => Date }).toDate();
  }
  if (typeof value === 'object') {
    const raw = value as { seconds?: number | string; nanoseconds?: number | string };
    if (raw.seconds !== undefined) {
      const seconds = Number(raw.seconds);
      const nanoseconds = Number(raw.nanoseconds ?? 0);
      if (Number.isFinite(seconds) && Number.isFinite(nanoseconds)) {
        return new Date(seconds * 1000 + nanoseconds / 1_000_000);
      }
    }
  }
  return undefined;
}

function mapBillDoc(id: string, data: Record<string, unknown>): Bill {
  return {
    id,
    ...data,
    createdAt: parseStoredDate(data.createdAt) || new Date(),
    paidAt: parseStoredDate(data.paidAt),
  } as Bill;
}

// ── Products ──────────────────────────────────────────────────────────────────

export async function getProducts(): Promise<Product[]> {
  const q = query(collection(db, 'products'), where('isActive', '==', true));
  const snap = await getDocs(q);
  return snap.docs.map(d => ({ id: d.id, ...d.data() } as Product));
}

export function subscribeProducts(cb: (products: Product[]) => void) {
  const q = query(collection(db, 'products'), where('isActive', '==', true));
  return onSnapshot(q, snap => {
    cb(snap.docs.map(d => ({ id: d.id, ...d.data() } as Product)));
  });
}

export async function getProductByBarcode(barcode: string): Promise<Product | null> {
  const q = query(collection(db, 'products'), where('barcode', '==', normalizeBarcode(barcode)), limit(1));
  const snap = await getDocs(q);
  if (snap.empty) return null;
  const d = snap.docs[0];
  return { id: d.id, ...d.data() } as Product;
}

export async function addProduct(product: Omit<Product, 'id'>): Promise<string> {
  const ref = await addDoc(collection(db, 'products'), {
    ...product,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  return ref.id;
}

export async function updateProduct(id: string, data: Partial<Product>): Promise<void> {
  await updateDoc(doc(db, 'products', id), { ...data, updatedAt: serverTimestamp() });
}

export async function updateStock(id: string, quantitySold: number): Promise<void> {
  const ref = doc(db, 'products', id);
  const snap = await getDoc(ref);
  if (snap.exists()) {
    const current = snap.data().stock || 0;
    const newStock = current - quantitySold;
    await updateDoc(ref, { stock: newStock, updatedAt: serverTimestamp() });
    const product = { id: snap.id, ...snap.data() } as Product;
    const minStock = product.minStock ?? 5;
    if (current > minStock && newStock <= minStock) {
      const settings = await loadSettings();
      await sendLowStockAlert(product, newStock, settings);
    }
  }
}

// ── Bills ─────────────────────────────────────────────────────────────────────

export async function saveBill(bill: Omit<Bill, 'id'>): Promise<string> {
  const payload = stripUndefined({
    ...bill,
    billNumberLower: normalizeSearchText(bill.billNumber),
    customerNameLower: normalizeSearchText(bill.customer?.name),
    customerPhone: bill.customer?.phone?.trim(),
    createdAt: Timestamp.fromDate(bill.createdAt),
    paidAt: bill.paidAt ? Timestamp.fromDate(bill.paidAt) : null,
  });
  const ref = await addDoc(collection(db, 'bills'), payload);
  return ref.id;
}

export async function getBills(dateStr?: string): Promise<Bill[]> {
  const all = await getAllBills();

  if (!dateStr) return all.slice(0, 50);

  const start = new Date(dateStr);
  start.setHours(0, 0, 0, 0);
  const end = new Date(dateStr);
  end.setHours(23, 59, 59, 999);

  return all.filter(bill => bill.createdAt >= start && bill.createdAt <= end);
}

export async function getAllBills(): Promise<Bill[]> {
  const snap = await getDocs(collection(db, 'bills'));
  return snap.docs
    .map(d => mapBillDoc(d.id, d.data()))
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
}

export async function getAllSaleReturns(): Promise<SaleReturn[]> {
  const snap = await getDocs(collection(db, 'saleReturns'));
  return snap.docs
    .map(d => {
      const data = d.data();
      return {
        id: d.id,
        ...data,
        createdAt: parseStoredDate(data.createdAt) || new Date(),
        processedAt: parseStoredDate(data.processedAt) || new Date(),
      } as SaleReturn;
    })
    .sort((a, b) => b.processedAt.getTime() - a.processedAt.getTime());
}

// ── Customers ─────────────────────────────────────────────────────────────────

export async function findCustomerByPhone(phone: string): Promise<Customer | null> {
  const q = query(collection(db, 'customers'), where('phone', '==', phone), limit(1));
  const snap = await getDocs(q);
  if (snap.empty) return null;
  return { id: snap.docs[0].id, ...snap.docs[0].data() } as Customer;
}

export async function saveCustomer(customer: Omit<Customer, 'id'>): Promise<string> {
  const ref = await addDoc(collection(db, 'customers'), customer);
  return ref.id;
}

/** Search bills by bill number, customer name, or phone */
export async function searchBills(term: string): Promise<Bill[]> {
  const all = await getAllBills();
  const t = normalizeSearchText(term);
  if (!t) return all.slice(0, 30);
  return all.filter(b =>
    normalizeSearchText((b as Bill & { billNumberLower?: string }).billNumberLower ?? b.billNumber).includes(t) ||
    normalizeSearchText((b as Bill & { customerNameLower?: string }).customerNameLower ?? b.customer?.name).includes(t) ||
    ((b as Bill & { customerPhone?: string }).customerPhone ?? b.customer?.phone ?? '').includes(term.trim())
  );
}

/** Get a single bill by its Firestore document ID */
export async function getBillById(id: string): Promise<Bill | null> {
  const snap = await getDoc(doc(db, 'bills', id));
  if (!snap.exists()) return null;
  return mapBillDoc(snap.id, snap.data());
}

/** Mark a bill as cancelled (used when "edit" loads it back into cart) */
export async function cancelBill(billId: string, reason = 'Edited — replaced by new bill'): Promise<void> {
  await updateDoc(doc(db, 'bills', billId), {
    status: 'cancelled',
    cancelledAt: serverTimestamp(),
    cancelReason: reason,
  });
}

/** After the new edited bill is paid, stamp the original cancelled bill with which bill replaced it */
export async function markBillAsAdjusted(
  originalBillId: string,
  newBillId: string,
  newBillNumber: string,
): Promise<void> {
  await updateDoc(doc(db, 'bills', originalBillId), {
    adjustedToBillId: newBillId,
    adjustedToBillNumber: newBillNumber,
    cancelReason: `Adjusted — replaced by ${newBillNumber}`,
  });
}

/** Add stock back — used for returns and cancellations */
export async function returnStock(productId: string, qty: number): Promise<void> {
  const ref = doc(db, 'products', productId);
  const snap = await getDoc(ref);
  if (snap.exists()) {
    const current = snap.data().stock || 0;
    await updateDoc(ref, { stock: current + qty, updatedAt: serverTimestamp() });
  }
}

/** Save a sale return record and restore stock */
export async function processSaleReturn(saleReturn: Omit<SaleReturn, 'id'>): Promise<string> {
  // Restore stock for each returned item
  for (const item of saleReturn.items) {
    if (item.returnQty > 0) {
      await returnStock(item.product.id, item.returnQty);
    }
  }
  // Save return record
  const payload = stripUndefined({
    ...saleReturn,
    createdAt: Timestamp.fromDate(saleReturn.createdAt),
    processedAt: Timestamp.fromDate(saleReturn.processedAt),
  });
  const ref = await addDoc(collection(db, 'saleReturns'), payload);
  return ref.id;
}

/** Generate a return number like RET260424-001 */
export async function generateReturnNumber(): Promise<string> {
  const now = new Date();
  const prefix = `RET${String(now.getFullYear()).slice(2)}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}`;
  const start = new Date(now); start.setHours(0, 0, 0, 0);
  const end = new Date(now); end.setHours(23, 59, 59, 999);
  const q = query(collection(db, 'saleReturns'), where('createdAt', '>=', Timestamp.fromDate(start)), where('createdAt', '<=', Timestamp.fromDate(end)));
  const snap = await getDocs(q);
  return `${prefix}-${String(snap.size + 1).padStart(3, '0')}`;
}

// ── Bill Number ───────────────────────────────────────────────────────────────

export async function generateBillNumber(): Promise<string> {
  const today = new Date();
  const prefix = `NSB${today.getFullYear().toString().slice(2)}${String(today.getMonth() + 1).padStart(2, '0')}${String(today.getDate()).padStart(2, '0')}`;
  const q = query(collection(db, 'bills'), orderBy('createdAt', 'desc'));
  const snap = await getDocs(q);
  const nextSuffix = snap.docs.reduce((max, docSnap) => {
    const billNumber = String(docSnap.data().billNumber ?? '');
    if (!billNumber.startsWith(prefix)) return max;
    const suffix = Number.parseInt(billNumber.split('-').pop() ?? '', 10);
    return Number.isFinite(suffix) ? Math.max(max, suffix) : max;
  }, 0) + 1;
  return `${prefix}-${String(nextSuffix).padStart(4, '0')}`;
}
