import {
  collection, doc, getDocs, addDoc, updateDoc, deleteDoc,
  query, limit, serverTimestamp, Timestamp, increment,
} from 'firebase/firestore';
import { db } from './firebase';
import { Party, PurchaseBill, PurchaseOrder, PurchaseReturn, DebitNote } from '@/types';
import { stripUndefined } from './utils';

// ── Helpers ───────────────────────────────────────────────────────────────────

function toDate(v: any) { return v?.toDate ? v.toDate() : v; }

// ── Parties ───────────────────────────────────────────────────────────────────

export async function getParties(): Promise<Party[]> {
  // No orderBy — avoids Firestore index requirement; sort client-side
  try {
    const snap = await getDocs(query(collection(db, 'parties'), limit(500)));
    return snap.docs
      .map(d => ({
        id: d.id, ...d.data(),
        createdAt: toDate(d.data().createdAt),
        updatedAt: toDate(d.data().updatedAt),
      } as Party))
      .sort((a, b) => a.name.localeCompare(b.name));
  } catch {
    return [];
  }
}

export async function createParty(data: Omit<Party, 'id' | 'createdAt'>): Promise<string> {
  const ref = await addDoc(collection(db, 'parties'), stripUndefined({
    ...data,
    currentBalance: data.openingBalance ?? 0,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  }));
  return ref.id;
}

export async function updateParty(id: string, data: Partial<Party>): Promise<void> {
  await updateDoc(doc(db, 'parties', id), stripUndefined({ ...data, updatedAt: serverTimestamp() }));
}

export async function deleteParty(id: string): Promise<void> {
  await deleteDoc(doc(db, 'parties', id));
}

// ── Purchase Bills ────────────────────────────────────────────────────────────

function billFromDoc(d: any): PurchaseBill {
  const data = d.data();
  return {
    id: d.id, ...data,
    invoiceDate: toDate(data.invoiceDate),
    dueDate: toDate(data.dueDate),
    createdAt: toDate(data.createdAt),
    updatedAt: toDate(data.updatedAt),
  } as PurchaseBill;
}

export async function getPurchaseBills(): Promise<PurchaseBill[]> {
  // No orderBy — sort client-side by createdAt desc
  try {
    const snap = await getDocs(query(collection(db, 'purchaseBills'), limit(200)));
    return snap.docs
      .map(billFromDoc)
      .sort((a, b) => (b.createdAt?.getTime?.() ?? 0) - (a.createdAt?.getTime?.() ?? 0));
  } catch {
    return [];
  }
}

export async function createPurchaseBill(data: Omit<PurchaseBill, 'id' | 'createdAt'>): Promise<string> {
  const payload = stripUndefined({
    ...data,
    invoiceDate: data.invoiceDate ? Timestamp.fromDate(data.invoiceDate) : null,
    dueDate: data.dueDate ? Timestamp.fromDate(data.dueDate) : null,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  const ref = await addDoc(collection(db, 'purchaseBills'), payload);
  // Update party balance atomically — no read needed
  if (data.partyId && data.balance) {
    try {
      await updateDoc(doc(db, 'parties', data.partyId), {
        currentBalance: increment(data.balance),
        updatedAt: serverTimestamp(),
      });
    } catch {
      // Non-critical — bill was saved, balance update failed silently
    }
  }
  return ref.id;
}

export async function updatePurchaseBill(id: string, data: Partial<PurchaseBill>): Promise<void> {
  await updateDoc(doc(db, 'purchaseBills', id), stripUndefined({ ...data, updatedAt: serverTimestamp() }));
}

export async function deletePurchaseBill(bill: PurchaseBill): Promise<void> {
  await deleteDoc(doc(db, 'purchaseBills', bill.id));
  if (bill.partyId && bill.balance) {
    try {
      await updateDoc(doc(db, 'parties', bill.partyId), {
        currentBalance: increment(-bill.balance),
        updatedAt: serverTimestamp(),
      });
    } catch {
      // Non-critical - bill was deleted, balance correction failed silently
    }
  }
}

// ── Purchase Orders ───────────────────────────────────────────────────────────

export async function getPurchaseOrders(): Promise<PurchaseOrder[]> {
  try {
    const snap = await getDocs(query(collection(db, 'purchaseOrders'), limit(100)));
    return snap.docs
      .map(d => {
        const data = d.data();
        return {
          id: d.id, ...data,
          createdAt: toDate(data.createdAt),
          expectedDate: toDate(data.expectedDate),
          dueDate: toDate(data.dueDate),
          total: data.total ?? 0,
          amountPaid: data.amountPaid ?? 0,
          balance: data.balance ?? 0,
          paymentStatus: data.paymentStatus ?? 'unpaid',
        } as PurchaseOrder;
      })
      .sort((a, b) => (b.createdAt?.getTime?.() ?? 0) - (a.createdAt?.getTime?.() ?? 0));
  } catch {
    return [];
  }
}

export async function createPurchaseOrder(data: Omit<PurchaseOrder, 'id' | 'createdAt'>): Promise<string> {
  const ref = await addDoc(collection(db, 'purchaseOrders'), stripUndefined({ ...data, createdAt: serverTimestamp() }));
  return ref.id;
}

export async function updatePurchaseOrder(id: string, data: Partial<PurchaseOrder>): Promise<void> {
  await updateDoc(doc(db, 'purchaseOrders', id), stripUndefined(data));
}

// ── Purchase Returns ──────────────────────────────────────────────────────────

export async function getPurchaseReturns(): Promise<PurchaseReturn[]> {
  try {
    const snap = await getDocs(query(collection(db, 'purchaseReturns'), limit(100)));
    return snap.docs
      .map(d => ({ id: d.id, ...d.data(), createdAt: toDate(d.data().createdAt) } as PurchaseReturn))
      .sort((a, b) => (b.createdAt?.getTime?.() ?? 0) - (a.createdAt?.getTime?.() ?? 0));
  } catch {
    return [];
  }
}

export async function createPurchaseReturn(data: Omit<PurchaseReturn, 'id' | 'createdAt'>): Promise<string> {
  const ref = await addDoc(collection(db, 'purchaseReturns'), stripUndefined({ ...data, createdAt: serverTimestamp() }));
  return ref.id;
}

// ── Debit Notes ───────────────────────────────────────────────────────────────

export async function getDebitNotes(): Promise<DebitNote[]> {
  try {
    const snap = await getDocs(query(collection(db, 'debitNotes'), limit(100)));
    return snap.docs
      .map(d => ({ id: d.id, ...d.data(), createdAt: toDate(d.data().createdAt) } as DebitNote))
      .sort((a, b) => (b.createdAt?.getTime?.() ?? 0) - (a.createdAt?.getTime?.() ?? 0));
  } catch {
    return [];
  }
}

export async function createDebitNote(data: Omit<DebitNote, 'id' | 'createdAt'>): Promise<string> {
  const ref = await addDoc(collection(db, 'debitNotes'), stripUndefined({ ...data, createdAt: serverTimestamp() }));
  return ref.id;
}

// ── Purchase Number Generator ─────────────────────────────────────────────────

export async function generatePurchaseNumber(prefix = 'PUR'): Promise<string> {
  const now = new Date();
  const yy = String(now.getFullYear()).slice(2);
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const dd = String(now.getDate()).padStart(2, '0');
  // Use timestamp-based sequence to avoid needing a Firestore index
  const seq = now.getHours() * 10000 + now.getMinutes() * 100 + now.getSeconds();
  return `${prefix}${yy}${mm}${dd}-${String(seq).padStart(6, '0')}`;
}
