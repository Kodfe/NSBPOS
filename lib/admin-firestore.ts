import {
  collection, doc, getDocs, getDoc, addDoc, updateDoc, deleteDoc,
  query, where, orderBy, limit, Timestamp, serverTimestamp, onSnapshot,
} from 'firebase/firestore';
import { db } from './firebase';
import { Bill, MachineLog, Operator, POSMachine, Product, SalesSummary } from '@/types';
import { stripUndefined } from './utils';

// ── Machines ──────────────────────────────────────────────────────────────────

export async function getMachines(): Promise<POSMachine[]> {
  const snap = await getDocs(query(collection(db, 'machines'), orderBy('createdAt', 'asc')));
  return snap.docs.map(d => ({ id: d.id, ...d.data(), createdAt: d.data().createdAt?.toDate() } as POSMachine));
}

export function subscribeMachines(cb: (m: POSMachine[]) => void) {
  return onSnapshot(query(collection(db, 'machines'), orderBy('createdAt', 'asc')), snap => {
    cb(snap.docs.map(d => ({ id: d.id, ...d.data(), createdAt: d.data().createdAt?.toDate() } as POSMachine)));
  });
}

export async function createMachine(data: Omit<POSMachine, 'id' | 'createdAt'>): Promise<string> {
  const ref = await addDoc(collection(db, 'machines'), stripUndefined({ ...data, createdAt: serverTimestamp() }));
  return ref.id;
}

export async function updateMachine(id: string, data: Partial<POSMachine>): Promise<void> {
  await updateDoc(doc(db, 'machines', id), data);
}

export async function deleteMachine(id: string): Promise<void> {
  await deleteDoc(doc(db, 'machines', id));
}

export async function startMachineSession(machineId: string, operator: Operator): Promise<void> {
  const now = new Date();
  await updateDoc(doc(db, 'machines', machineId), {
    isActive: true,
    currentOperatorId: operator.id,
    currentOperatorName: operator.name,
    sessionStartedAt: Timestamp.fromDate(now),
  });
  await addDoc(collection(db, 'machineLogs'), {
    machineId,
    machineName: '', // filled by caller
    operatorId: operator.id,
    operatorName: operator.name,
    action: 'start',
    timestamp: Timestamp.fromDate(now),
  });
  await updateDoc(doc(db, 'operators', operator.id), { lastLoginAt: Timestamp.fromDate(now) });
}

export async function stopMachineSession(machine: POSMachine, billsCount: number, totalSales: number): Promise<void> {
  const now = new Date();
  const started = machine.sessionStartedAt;
  const durationMinutes = started
    ? Math.round((now.getTime() - new Date(started).getTime()) / 60000)
    : 0;

  await updateDoc(doc(db, 'machines', machine.id), {
    isActive: false,
    currentOperatorId: null,
    currentOperatorName: null,
    sessionStartedAt: null,
  });
  await addDoc(collection(db, 'machineLogs'), {
    machineId: machine.id,
    machineName: machine.name,
    operatorId: machine.currentOperatorId || '',
    operatorName: machine.currentOperatorName || '',
    action: 'stop',
    timestamp: Timestamp.fromDate(now),
    sessionDurationMinutes: durationMinutes,
    billsCount,
    totalSales,
  });
}

// ── Operators ─────────────────────────────────────────────────────────────────

export async function getOperators(): Promise<Operator[]> {
  const snap = await getDocs(query(collection(db, 'operators'), orderBy('createdAt', 'asc')));
  return snap.docs.map(d => ({ id: d.id, ...d.data(), createdAt: d.data().createdAt?.toDate() } as Operator));
}

export function subscribeOperators(cb: (o: Operator[]) => void) {
  return onSnapshot(query(collection(db, 'operators'), orderBy('createdAt', 'asc')), snap => {
    cb(snap.docs.map(d => ({ id: d.id, ...d.data(), createdAt: d.data().createdAt?.toDate() } as Operator)));
  });
}

export async function createOperator(data: Omit<Operator, 'id' | 'createdAt'>): Promise<string> {
  const ref = await addDoc(collection(db, 'operators'), stripUndefined({ ...data, createdAt: serverTimestamp() }));
  return ref.id;
}

export async function updateOperator(id: string, data: Partial<Operator>): Promise<void> {
  await updateDoc(doc(db, 'operators', id), data);
}

export async function deleteOperator(id: string): Promise<void> {
  await deleteDoc(doc(db, 'operators', id));
}

export async function verifyOperatorPin(pin: string): Promise<Operator | null> {
  const q = query(collection(db, 'operators'), where('pin', '==', pin), where('isActive', '==', true), limit(1));
  const snap = await getDocs(q);
  if (snap.empty) return null;
  return { id: snap.docs[0].id, ...snap.docs[0].data(), createdAt: snap.docs[0].data().createdAt?.toDate() } as Operator;
}

// ── Machine Logs ──────────────────────────────────────────────────────────────

export async function getMachineLogs(filters?: {
  machineId?: string; operatorId?: string; from?: Date; to?: Date;
}): Promise<MachineLog[]> {
  let q = query(collection(db, 'machineLogs'), orderBy('timestamp', 'desc'), limit(200));
  const snap = await getDocs(q);
  let logs = snap.docs.map(d => ({
    id: d.id, ...d.data(), timestamp: d.data().timestamp?.toDate(),
  } as MachineLog));
  if (filters?.machineId) logs = logs.filter(l => l.machineId === filters.machineId);
  if (filters?.operatorId) logs = logs.filter(l => l.operatorId === filters.operatorId);
  if (filters?.from) logs = logs.filter(l => l.timestamp >= filters.from!);
  if (filters?.to) logs = logs.filter(l => l.timestamp <= filters.to!);
  return logs;
}

// ── Sales Analytics ───────────────────────────────────────────────────────────

export async function getSalesSummary(from: Date, to: Date): Promise<SalesSummary> {
  const fromTs = Timestamp.fromDate(from);
  const toTs = Timestamp.fromDate(to);
  const q = query(
    collection(db, 'bills'),
    where('status', '==', 'paid'),
    where('paidAt', '>=', fromTs),
    where('paidAt', '<=', toTs),
    orderBy('paidAt', 'asc'),
  );
  const snap = await getDocs(q);
  const bills = snap.docs.map(d => ({
    ...d.data(),
    id: d.id,
    paidAt: d.data().paidAt?.toDate(),
    createdAt: d.data().createdAt?.toDate(),
  } as Bill));

  const totalSales = bills.reduce((s, b) => s + b.total, 0);
  const totalBills = bills.length;
  const totalItems = bills.reduce((s, b) => s + b.items.reduce((si, i) => si + i.quantity, 0), 0);
  const cashSales = bills.filter(b => b.paymentMethod === 'cash').reduce((s, b) => s + b.total, 0);
  const upiSales = bills.filter(b => b.paymentMethod === 'upi').reduce((s, b) => s + b.total, 0);
  const cardSales = bills.filter(b => b.paymentMethod === 'card').reduce((s, b) => s + b.total, 0);
  const totalGst = bills.reduce((s, b) => s + b.totalGst, 0);
  const totalDiscount = bills.reduce((s, b) => s + b.totalDiscount, 0);
  const avgBillValue = totalBills > 0 ? totalSales / totalBills : 0;

  // Top products
  const productMap = new Map<string, { name: string; qty: number; revenue: number }>();
  for (const bill of bills) {
    for (const item of bill.items) {
      const key = item.product.id;
      const existing = productMap.get(key) || { name: item.product.name, qty: 0, revenue: 0 };
      productMap.set(key, { name: item.product.name, qty: existing.qty + item.quantity, revenue: existing.revenue + item.total });
    }
  }
  const topProducts = Array.from(productMap.values()).sort((a, b) => b.revenue - a.revenue).slice(0, 10);

  // Daily breakdown
  const dayMap = new Map<string, { sales: number; bills: number }>();
  for (const bill of bills) {
    if (!bill.paidAt) continue;
    const day = bill.paidAt.toISOString().split('T')[0];
    const ex = dayMap.get(day) || { sales: 0, bills: 0 };
    dayMap.set(day, { sales: ex.sales + bill.total, bills: ex.bills + 1 });
  }
  const dailyBreakdown = Array.from(dayMap.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, v]) => ({ date, ...v }));

  return { totalSales, totalBills, totalItems, cashSales, upiSales, cardSales, totalGst, totalDiscount, avgBillValue, topProducts, dailyBreakdown };
}

// ── Products CRUD (admin) ─────────────────────────────────────────────────────

export async function getAllProducts(): Promise<Product[]> {
  const snap = await getDocs(query(collection(db, 'products'), orderBy('name', 'asc')));
  return snap.docs.map(d => ({ id: d.id, ...d.data() } as Product));
}

export async function adminAddProduct(product: Omit<Product, 'id'>): Promise<string> {
  const ref = await addDoc(collection(db, 'products'), { ...product, createdAt: serverTimestamp(), updatedAt: serverTimestamp() });
  return ref.id;
}

export async function adminUpdateProduct(id: string, data: Partial<Product>): Promise<void> {
  await updateDoc(doc(db, 'products', id), { ...data, updatedAt: serverTimestamp() });
}

export async function adminDeleteProduct(id: string): Promise<void> {
  await deleteDoc(doc(db, 'products', id));
}

export async function bulkUpsertProducts(products: Omit<Product, 'id'>[]): Promise<number> {
  let count = 0;
  for (const p of products) {
    // Check if barcode exists
    if (p.barcode) {
      const q = query(collection(db, 'products'), where('barcode', '==', p.barcode), limit(1));
      const snap = await getDocs(q);
      if (!snap.empty) {
        await updateDoc(doc(db, 'products', snap.docs[0].id), { ...p, updatedAt: serverTimestamp() });
        count++;
        continue;
      }
    }
    await addDoc(collection(db, 'products'), { ...p, createdAt: serverTimestamp(), updatedAt: serverTimestamp() });
    count++;
  }
  return count;
}
