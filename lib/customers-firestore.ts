import {
  collection, doc, getDocs, getDoc, addDoc, updateDoc, deleteDoc,
  query, where, limit, serverTimestamp, increment, QueryDocumentSnapshot, DocumentData,
} from 'firebase/firestore';
import { db } from './firebase';
import { Customer } from '@/types';
import { stripUndefined } from './utils';

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

function docToCustomer(d: QueryDocumentSnapshot<DocumentData>): Customer {
  const data = d.data();
  return {
    id: d.id,
    ...data,
    createdAt: parseStoredDate(data.createdAt),
    updatedAt: parseStoredDate(data.updatedAt),
  } as Customer;
}

export async function getCustomers(): Promise<Customer[]> {
  // No orderBy — avoids needing a Firestore index and works even on empty collections
  try {
    const snap = await getDocs(collection(db, 'customers'));
    return snap.docs.map(docToCustomer).sort((a, b) => a.name.localeCompare(b.name));
  } catch {
    return [];
  }
}

export async function searchCustomers(term: string): Promise<Customer[]> {
  const t = term.trim().toLowerCase();
  if (!t) return [];
  try {
    const all = await getCustomers();
    return all.filter(c =>
      c.name.toLowerCase().includes(t) || c.phone.includes(term.trim())
    );
  } catch {
    return [];
  }
}

export async function findCustomerByPhone(phone: string): Promise<Customer | null> {
  const q = query(collection(db, 'customers'), where('phone', '==', phone), limit(1));
  const snap = await getDocs(q);
  if (snap.empty) return null;
  return docToCustomer(snap.docs[0]);
}

export async function createCustomer(data: Omit<Customer, 'id' | 'createdAt' | 'updatedAt'>): Promise<string> {
  const ref = await addDoc(collection(db, 'customers'), stripUndefined({
    ...data,
    storeCredit: data.storeCredit ?? 0,
    totalBills: 0,
    totalSpent: 0,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  }));
  return ref.id;
}

export async function updateCustomer(id: string, data: Partial<Customer>): Promise<void> {
  await updateDoc(doc(db, 'customers', id), stripUndefined({ ...data, updatedAt: serverTimestamp() }));
}

export async function deleteCustomer(id: string): Promise<void> {
  await deleteDoc(doc(db, 'customers', id));
}

/** Add store credit — uses Firestore increment, no read needed */
export async function addStoreCredit(customerId: string, amount: number): Promise<void> {
  await updateDoc(doc(db, 'customers', customerId), {
    storeCredit: increment(amount),
    updatedAt: serverTimestamp(),
  });
}

/** Deduct store credit — reads first to clamp at zero */
export async function deductStoreCredit(customerId: string, amount: number): Promise<void> {
  const snap = await getDoc(doc(db, 'customers', customerId));
  const current = (snap.data()?.storeCredit as number) ?? 0;
  await updateDoc(doc(db, 'customers', customerId), {
    storeCredit: Math.max(0, current - amount),
    updatedAt: serverTimestamp(),
  });
}

/** Update customer stats after a bill is paid */
export async function updateCustomerStats(customerId: string, billTotal: number): Promise<void> {
  await updateDoc(doc(db, 'customers', customerId), {
    totalBills: increment(1),
    totalSpent: increment(billTotal),
    updatedAt: serverTimestamp(),
  });
}
