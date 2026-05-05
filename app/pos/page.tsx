'use client';
import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { Check, Keyboard, Store, Clock, Wifi, WifiOff, Receipt, Monitor, LockKeyhole, LogOut, Package, X } from 'lucide-react';
import toast, { Toaster } from 'react-hot-toast';
import { format } from 'date-fns';

import BillTabs from '@/components/pos/BillTabs';
import BillingWorkspace from '@/components/pos/BillingWorkspace';
import CartPanel from '@/components/pos/CartPanel';
import PaymentModal from '@/components/pos/PaymentModal';
import CustomerModal from '@/components/pos/CustomerModal';
import ReceiptModal from '@/components/pos/ReceiptModal';
import ShortcutsHelp from '@/components/pos/ShortcutsHelp';
import WeightModal from '@/components/pos/WeightModal';
import BillSearchModal from '@/components/pos/BillSearchModal';
import ReturnModal from '@/components/pos/ReturnModal';

import { usePOS } from '@/hooks/usePOS';
import { getAllBills, getProductByBarcode, generateBillNumber, subscribeProducts } from '@/lib/firestore';
import { loadSettings, DEFAULT_SETTINGS } from '@/lib/settings';
import { db } from '@/lib/firebase';
import { addStoreCredit, deductStoreCredit, updateCustomerStats } from '@/lib/customers-firestore';
import { cancelBill, returnStock, markBillAsAdjusted } from '@/lib/firestore';
import { getCategories } from '@/lib/categories-firestore';
import { adminAddProduct, getMachines, startMachineSession, stopMachineSession, updateMachineSessionHeartbeat, verifyOperatorPin } from '@/lib/admin-firestore';
import { normalizeBarcode } from '@/lib/utils';
import { Bill, PaymentDetails, Product, Category, StoreSettings, POSMachine, Operator } from '@/types';

const POS_SESSION_KEY = 'nsb_pos_machine_session';
const OPERATOR_INACTIVITY_LOGOUT_MS = 10 * 60 * 1000;
const OPERATOR_HEARTBEAT_MS = 30 * 1000;
const OPERATOR_ACTIVITY_EVENTS = ['keydown', 'mousedown', 'mousemove', 'touchstart', 'scroll', 'wheel', 'click'];
const POS_UNITS = ['piece', 'kg', 'gm', 'ltr', 'ml', 'pack', 'dozen', 'box', 'bottle'];
const POS_GST_RATES = [0, 5, 12, 18, 28];

type PosSession = {
  machine: POSMachine;
  operator: Operator;
  startedAt: string;
};

function emptyPosProduct(categories: Category[], seed?: Partial<Product>): Omit<Product, 'id'> {
  return {
    name: seed?.name ?? '',
    barcode: seed?.barcode ?? '',
    price: seed?.price ?? 0,
    mrp: seed?.mrp ?? 0,
    purchasePrice: seed?.purchasePrice ?? 0,
    gstRate: seed?.gstRate ?? 0,
    hsnCode: seed?.hsnCode ?? '',
    category: seed?.category ?? categories[0]?.name ?? 'Essentials',
    unit: seed?.unit ?? 'piece',
    stock: seed?.stock ?? 0,
    minStock: seed?.minStock ?? 5,
    brand: seed?.brand ?? '',
    isActive: true,
    isLoose: seed?.isLoose ?? false,
  };
}

function uniqueProducts(products: Product[]): Product[] {
  const seen = new Set<string>();
  const unique: Product[] = [];

  for (const product of products) {
    const barcode = normalizeBarcode(product.barcode);
    const key = barcode || `${product.name.trim().toLowerCase()}|${product.category.trim().toLowerCase()}|${product.price}|${product.mrp}`;
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(product);
  }

  return unique;
}

export default function POSPage() {
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [online, setOnline] = useState(true);
  const [time, setTime] = useState<Date>(() => new Date());
  const [showPayment, setShowPayment] = useState(false);
  const [showCustomer, setShowCustomer] = useState(false);
  const [showShortcuts, setShowShortcuts] = useState(false);
  const [completedBill, setCompletedBill] = useState<Bill | null>(null);
  const [barcodeLooseProduct, setBarcodeLooseProduct] = useState<Product | null>(null);
  const [storeSettings, setStoreSettings] = useState<StoreSettings>(DEFAULT_SETTINGS);
  const [showBillSearch, setShowBillSearch] = useState(false);
  const [returnBill, setReturnBill] = useState<Bill | null>(null);
  const [machines, setMachines] = useState<POSMachine[]>([]);
  const [selectedMachineId, setSelectedMachineId] = useState('');
  const [operatorPin, setOperatorPin] = useState('');
  const [posSession, setPosSession] = useState<PosSession | null>(null);
  const [sessionLoading, setSessionLoading] = useState(true);
  const [loginLoading, setLoginLoading] = useState(false);
  const [showProductModal, setShowProductModal] = useState(false);
  const [productForm, setProductForm] = useState<Omit<Product, 'id'>>(emptyPosProduct([]));
  const [addingProduct, setAddingProduct] = useState(false);
  const [receiptAutoPrint, setReceiptAutoPrint] = useState(false);
  const [paymentProcessing, setPaymentProcessing] = useState(false);
  const paymentProcessingRef = useRef(false);

  const pos = usePOS();
  const uniqueProductList = useMemo(() => uniqueProducts(products), [products]);
  const productsByBarcode = useMemo(() => {
    const map = new Map<string, Product>();
    for (const product of uniqueProductList) {
      const barcode = normalizeBarcode(product.barcode);
      if (barcode && !map.has(barcode)) map.set(barcode, product);
    }
    return map;
  }, [uniqueProductList]);
  const modifiedCartProductIds = new Set(pos.activeBill?.originalBillId ? pos.activeBill.items.map(item => item.product.id) : []);
  const productSearchProducts = pos.activeBill?.originalBillId
    ? uniqueProductList.filter(product => !modifiedCartProductIds.has(product.id))
    : uniqueProductList;

  // Load store settings
  useEffect(() => {
    loadSettings().then(s => setStoreSettings(s));
  }, []);

  useEffect(() => {
    let active = true;
    async function loadMachineLock() {
      try {
        const [machineData] = await Promise.all([getMachines()]);
        if (!active) return;
        setMachines(machineData);
        setSelectedMachineId(machineData.find(m => !m.isActive)?.id || machineData[0]?.id || '');
        const saved = localStorage.getItem(POS_SESSION_KEY);
        if (saved) {
          const parsed = JSON.parse(saved) as PosSession;
          const liveMachine = machineData.find(m => m.id === parsed.machine.id);
          if (liveMachine?.isActive && liveMachine.currentOperatorId === parsed.operator.id) {
            setPosSession({ ...parsed, machine: liveMachine });
          } else {
            localStorage.removeItem(POS_SESSION_KEY);
          }
        }
      } catch {
        toast.error('Could not load POS machines');
      } finally {
        if (active) setSessionLoading(false);
      }
    }
    void loadMachineLock();
    return () => { active = false; };
  }, []);

  // Subscribe to live products from Firestore
  useEffect(() => {
    const unsub = subscribeProducts(setProducts);
    return unsub;
  }, []);

  // Load categories from Firestore
  useEffect(() => {
    getCategories().then(setCategories);
  }, []);

  // Clock
  useEffect(() => {
    const t = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  // Online status
  useEffect(() => {
    const onOnline = () => setOnline(true);
    const onOffline = () => setOnline(false);
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    return () => { window.removeEventListener('online', onOnline); window.removeEventListener('offline', onOffline); };
  }, []);

  const handleBarcodeSearch = useCallback(async (barcode: string) => {
    const normalizedBarcode = normalizeBarcode(barcode);
    const local = productsByBarcode.get(normalizedBarcode);
    if (local) {
      if (local.isLoose) { setBarcodeLooseProduct(local); return; }
      pos.addItem(local);
      toast.success(`Added: ${local.name}`, { duration: 1000 });
      return;
    }
    try {
      const remote = await getProductByBarcode(normalizedBarcode);
      if (remote) {
        if (remote.isLoose) { setBarcodeLooseProduct(remote); return; }
        pos.addItem(remote);
        toast.success(`Added: ${remote.name}`, { duration: 1000 });
      } else {
        toast.error(`Barcode not found: ${normalizedBarcode}`);
      }
    } catch {
      toast.error('Barcode lookup failed');
    }
  }, [productsByBarcode, pos]);

  const openProductModal = useCallback((seed?: Partial<Product>) => {
    setProductForm(emptyPosProduct(categories, seed));
    setShowProductModal(true);
  }, [categories]);

  const handleCreateProduct = useCallback(async () => {
    if (!productForm.name.trim()) { toast.error('Product name is required'); return; }
    if (productForm.price <= 0) { toast.error('Selling price is required'); return; }
    setAddingProduct(true);
    try {
      const payload = {
        ...productForm,
        barcode: normalizeBarcode(productForm.barcode),
        mrp: productForm.mrp || productForm.price,
        purchasePrice: productForm.purchasePrice || 0,
      };
      const id = await adminAddProduct(payload);
      const product: Product = { id, ...payload };
      setProducts(prev => [...prev, product].sort((a, b) => a.name.localeCompare(b.name)));
      if (product.isLoose) setBarcodeLooseProduct(product);
      else pos.addItem(product);
      setShowProductModal(false);
      toast.success('Product added to POS');
    } catch {
      toast.error('Product save failed');
    } finally {
      setAddingProduct(false);
    }
  }, [pos, productForm]);

  const handlePaymentConfirm = useCallback(async (payment: PaymentDetails) => {
    if (paymentProcessingRef.current) return;
    paymentProcessingRef.current = true;
    setPaymentProcessing(true);
    try {
      let billNumber: string;
      try { billNumber = await generateBillNumber(); }
      catch { billNumber = `NSB${Date.now()}`; }

      const finalBill = await pos.processSale(payment, billNumber, posSession ? {
        machineId: posSession.machine.id,
        machineName: posSession.machine.name,
        operatorId: posSession.operator.id,
        operatorName: posSession.operator.name,
      } : undefined);
      if (finalBill) {
        setShowPayment(false);

        // Update customer stats & handle store credit silently
        if (finalBill.customer?.id) {
          try { await updateCustomerStats(finalBill.customer.id, finalBill.total); } catch {}
          if ((finalBill.storeCreditApplied ?? 0) > 0) {
            try { await deductStoreCredit(finalBill.customer.id, finalBill.storeCreditApplied!); } catch {}
          }
          // If cashier chose to save change as credit, do it now
          if (payment.saveCreditAmount && payment.saveCreditAmount > 0) {
            try {
              await addStoreCredit(finalBill.customer.id, payment.saveCreditAmount);
              toast.success(`₹${payment.saveCreditAmount.toFixed(2)} saved as store credit for ${finalBill.customer.name}`);
            } catch {}
          }
        }

        // If this was an edited bill, stamp the original cancelled bill with the new bill number
        if (finalBill.originalBillId) {
          try { await markBillAsAdjusted(finalBill.originalBillId, finalBill.id, finalBill.billNumber); } catch {}
        }

        setReceiptAutoPrint(false);
        setCompletedBill(finalBill);
        pos.openNewAfterSale();
        toast.success('Payment successful!');
      }
    } catch (err) {
      toast.error('Payment failed. Please try again.');
      console.error(err);
    } finally {
      paymentProcessingRef.current = false;
      setPaymentProcessing(false);
    }
  }, [pos, posSession]);

  const quickSaveBill = useCallback(async (print: boolean) => {
    if (!pos.activeBill?.items.length) return;
    try {
      let billNumber: string;
      try { billNumber = await generateBillNumber(); }
      catch { billNumber = `NSB${Date.now()}`; }
      const payment: PaymentDetails = {
        method: 'cash',
        amountPaid: pos.activeBill.total,
        cashAmount: pos.activeBill.total,
        change: 0,
      };
      const finalBill = await pos.processSale(payment, billNumber, posSession ? {
        machineId: posSession.machine.id,
        machineName: posSession.machine.name,
        operatorId: posSession.operator.id,
        operatorName: posSession.operator.name,
      } : undefined);
      if (!finalBill) return;

      if (finalBill.customer?.id) {
        try { await updateCustomerStats(finalBill.customer.id, finalBill.total); } catch {}
        if ((finalBill.storeCreditApplied ?? 0) > 0) {
          try { await deductStoreCredit(finalBill.customer.id, finalBill.storeCreditApplied!); } catch {}
        }
      }
      if (finalBill.originalBillId) {
        try { await markBillAsAdjusted(finalBill.originalBillId, finalBill.id, finalBill.billNumber); } catch {}
      }

      setReceiptAutoPrint(print);
      if (print) setCompletedBill(finalBill);
      pos.openNewAfterSale();
      toast.success(print ? 'Bill saved and ready to print' : 'Bill saved without printing');
    } catch {
      toast.error('Could not save bill');
    }
  }, [pos, posSession]);

  // Keyboard shortcuts
  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (document.querySelector('[data-pos-modal="true"]')) return;
      const key = e.key.toLowerCase();
      if (e.altKey && e.key.toLowerCase() === 'b') {
        e.preventDefault();
        document.querySelector<HTMLInputElement>('[placeholder*="Search item"]')?.focus();
        return;
      }
      const tag = (e.target as HTMLElement).tagName;
      if ((e.ctrlKey || e.metaKey) && key === 'p') {
        e.preventDefault();
        void quickSaveBill(true);
        return;
      }
      if ((e.ctrlKey || e.metaKey) && key === 's') {
        e.preventDefault();
        void quickSaveBill(false);
        return;
      }
      if ((e.ctrlKey || e.metaKey) && key === 'c') {
        e.preventDefault();
        if (pos.activeBill?.items.length && confirm('Cancel this invoice and clear all items?')) pos.clearBill();
        return;
      }
      if ((e.ctrlKey || e.metaKey) && key === 'f') {
        e.preventDefault();
        document.querySelector<HTMLInputElement>('[placeholder*="Search item"]')?.focus();
        return;
      }
      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
        e.preventDefault();
        if (pos.activeBill?.items.length) setShowPayment(true);
        return;
      }
      if (tag === 'INPUT' || tag === 'TEXTAREA') {
        if (e.key === 'Escape') (e.target as HTMLInputElement).blur();
        return;
      }
      switch (e.key) {
        case 'F2': e.preventDefault(); document.querySelector<HTMLInputElement>('[placeholder*="Search item"]')?.focus(); break;
        case 'F3': e.preventDefault(); if (pos.activeBill?.items.length) setShowPayment(true); break;
        case 'F4': e.preventDefault(); pos.addTab(); break;
        case 'F5': break;
        case 'F6': e.preventDefault(); void quickSaveBill(true); break;
        case 'F7': e.preventDefault(); void quickSaveBill(false); break;
        case 'F1': case '?': e.preventDefault(); setShowShortcuts(s => !s); break;
        case 'Escape': setShowPayment(false); setShowCustomer(false); setShowShortcuts(false); break;
        case 'Enter': e.preventDefault(); void quickSaveBill(true); break;
        case 'Backspace':
        case 'Delete':
          e.preventDefault();
          if (pos.activeBill?.items.length) pos.removeItem(pos.activeBill.items[pos.activeBill.items.length - 1].product.id);
          break;
        case '1': case '2': case '3': case '4': case '5':
          const idx = parseInt(e.key) - 1;
          if (pos.tabs[idx]) pos.setActiveTabId(pos.tabs[idx].id);
          break;
      }
    }
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [pos, quickSaveBill]);

  const handleStartSession = useCallback(async () => {
    const machine = machines.find(m => m.id === selectedMachineId);
    if (!machine) { toast.error('Select a POS machine'); return; }
    if (operatorPin.length !== 2) { toast.error('Enter operator 2-digit PIN'); return; }
    setLoginLoading(true);
    try {
      const operator = await verifyOperatorPin(operatorPin);
      if (!operator) { toast.error('Invalid or inactive operator PIN'); return; }
      const activeOperatorMachine = machines.find(m => m.isActive && m.currentOperatorId === operator.id && m.id !== machine.id);
      if (activeOperatorMachine) {
        toast.error(`${operator.name} is already active on ${activeOperatorMachine.name}`);
        return;
      }
      if (operator.assignedMachineId && operator.assignedMachineId !== machine.id) {
        toast.error(`${operator.name} is assigned to ${operator.assignedMachineName || 'another machine'}`);
        return;
      }
      if (machine.isActive && machine.currentOperatorId !== operator.id) {
        toast.error(`${machine.name} is already active for ${machine.currentOperatorName || 'another operator'}`);
        return;
      }
      if (!machine.isActive) await startMachineSession(machine, operator);
      await updateMachineSessionHeartbeat(machine.id, operator.id);
      const session: PosSession = {
        machine: { ...machine, isActive: true, currentOperatorId: operator.id, currentOperatorName: operator.name, sessionStartedAt: new Date(), lastHeartbeatAt: new Date() },
        operator,
        startedAt: new Date().toISOString(),
      };
      localStorage.setItem(POS_SESSION_KEY, JSON.stringify(session));
      setPosSession(session);
      setOperatorPin('');
      toast.success(`POS unlocked: ${machine.name} - ${operator.name}`);
    } catch {
      toast.error('Could not start POS session');
    } finally {
      setLoginLoading(false);
    }
  }, [machines, operatorPin, selectedMachineId]);

  const endSession = useCallback(async ({ confirmStop = true, inactive = false }: { confirmStop?: boolean; inactive?: boolean } = {}) => {
    if (!posSession) return;
    if (confirmStop && !confirm(`Lock POS and stop ${posSession.machine.name}?`)) return;
    try {
      const bills = await getAllBills();
      const startedAt = new Date(posSession.startedAt);
      const sessionBills = bills.filter(b =>
        b.status === 'paid' &&
        b.machineId === posSession.machine.id &&
        b.operatorId === posSession.operator.id &&
        !!b.paidAt &&
        b.paidAt >= startedAt
      );
      await stopMachineSession(posSession.machine, sessionBills.length, sessionBills.reduce((sum, b) => sum + b.total, 0));
      localStorage.removeItem(POS_SESSION_KEY);
      setPosSession(null);
      pos.clearBill();
      setMachines(await getMachines());
      toast.success(inactive ? 'Operator logged out due to inactivity' : 'POS session stopped');
    } catch {
      toast.error(inactive ? 'Could not auto logout operator' : 'Could not stop POS session');
    }
  }, [pos, posSession]);

  const handleStopSession = useCallback(async () => {
    await endSession();
  }, [endSession]);

  useEffect(() => {
    if (!posSession) return;

    const heartbeat = () => {
      void updateMachineSessionHeartbeat(posSession.machine.id, posSession.operator.id);
    };
    heartbeat();
    const heartbeatId = setInterval(heartbeat, OPERATOR_HEARTBEAT_MS);

    return () => clearInterval(heartbeatId);
  }, [posSession]);

  useEffect(() => {
    if (!posSession) return;

    const closeSession = () => {
      void endSession({ confirmStop: false, inactive: true });
    };

    window.addEventListener('pagehide', closeSession);
    window.addEventListener('beforeunload', closeSession);
    return () => {
      window.removeEventListener('pagehide', closeSession);
      window.removeEventListener('beforeunload', closeSession);
    };
  }, [endSession, posSession]);

  useEffect(() => {
    if (!posSession) return;

    let timeoutId: ReturnType<typeof setTimeout>;
    const resetTimer = () => {
      clearTimeout(timeoutId);
      timeoutId = setTimeout(() => {
        void endSession({ confirmStop: false, inactive: true });
      }, OPERATOR_INACTIVITY_LOGOUT_MS);
    };

    resetTimer();
    OPERATOR_ACTIVITY_EVENTS.forEach(eventName => {
      window.addEventListener(eventName, resetTimer, { passive: true });
    });

    return () => {
      clearTimeout(timeoutId);
      OPERATOR_ACTIVITY_EVENTS.forEach(eventName => {
        window.removeEventListener(eventName, resetTimer);
      });
    };
  }, [endSession, posSession]);

  const handleNewBill = useCallback(() => {
    setCompletedBill(null);
    pos.openNewAfterSale();
  }, [pos]);

  /**
   * Load a past bill back into a new cart tab (for editing/re-billing).
   * The original bill is marked cancelled and its stock is restored.
   */
  const handleEditBill = useCallback(async (bill: Bill) => {
    try {
      // Pass bill.total as originalBillTotal so CartPanel shows delta (collect/refund)
      pos.loadBillToNewTab(bill, bill.total);

      // Cancel the original bill and restore its stock
      await cancelBill(bill.id, `Edited via POS — reloaded to new bill`);
      for (const item of bill.items) {
        try { await returnStock(item.product.id, item.weightKg ?? item.quantity); } catch {}
      }

      toast.success(`Bill ${bill.billNumber} loaded for modify / exchange. Add new products or adjust existing items.`);
    } catch (err) {
      toast.error('Could not load bill to cart');
      console.error(err);
    }
  }, [pos]);

  // Check if Firebase is configured
  if (typeof window !== 'undefined' && !db) {
    return (
      <div className="h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-gray-800 mb-4">Configuration Error</h1>
          <p className="text-gray-600 mb-4">Firebase is not configured. Please set the environment variables.</p>
          <p className="text-sm text-gray-500">Check the .env.example file for required variables.</p>
        </div>
      </div>
    );
  }

  if (sessionLoading || !posSession) {
    return (
      <div className="h-screen flex items-center justify-center bg-gray-50">
        <Toaster position="top-right" toastOptions={{ duration: 2000 }} />
        <div className="w-full max-w-md bg-white rounded-2xl shadow-xl border border-gray-100 overflow-hidden">
          <div className="bg-saffron-400 px-6 py-5 text-white">
            <div className="flex items-center gap-2">
              <LockKeyhole size={20} />
              <h1 className="text-lg font-bold">POS Locked</h1>
            </div>
            <p className="text-sm text-saffron-100 mt-1">Select machine and login with operator PIN to start billing.</p>
          </div>
          <div className="p-6 space-y-4">
            {sessionLoading ? (
              <div className="py-8 text-center text-sm text-gray-400">Loading machines...</div>
            ) : (
              <>
                <div>
                  <label className="block text-xs font-semibold text-gray-500 uppercase mb-1">POS Machine</label>
                  <select
                    value={selectedMachineId}
                    onChange={e => setSelectedMachineId(e.target.value)}
                    className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:border-saffron-400"
                  >
                    <option value="">Select machine</option>
                    {machines.map(machine => (
                      <option key={machine.id} value={machine.id}>
                        {machine.name}{machine.label ? ` - ${machine.label}` : ''}{machine.isActive ? ` (active: ${machine.currentOperatorName || 'operator'})` : ''}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-500 uppercase mb-1">Operator PIN</label>
                  <input
                    autoFocus
                    inputMode="numeric"
                    maxLength={2}
                    value={operatorPin}
                    onChange={e => setOperatorPin(e.target.value.replace(/\D/g, '').slice(0, 2))}
                    onKeyDown={e => { if (e.key === 'Enter') void handleStartSession(); }}
                    className="w-full px-3 py-3 border-2 border-gray-200 rounded-xl text-center text-3xl font-mono tracking-[0.5em] focus:outline-none focus:border-saffron-400"
                    placeholder="00"
                  />
                </div>
                {machines.length === 0 && (
                  <p className="text-sm text-amber-600 bg-amber-50 px-3 py-2 rounded-xl">
                    No POS machines found. Add one from Admin - POS Machines first.
                  </p>
                )}
                <button
                  onClick={handleStartSession}
                  disabled={!selectedMachineId || operatorPin.length !== 2 || loginLoading}
                  className="w-full flex items-center justify-center gap-2 py-3 bg-saffron-400 hover:bg-saffron-500 disabled:bg-gray-200 disabled:text-gray-400 text-white font-bold rounded-xl"
                >
                  {loginLoading ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> : <Monitor size={16} />}
                  Start POS
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="h-screen flex flex-col bg-gray-50 overflow-hidden">
      <Toaster position="top-right" toastOptions={{ duration: 2000 }} />

      {/* Top bar */}
      <header className="bg-saffron-400 text-white px-4 py-2 flex items-center justify-between shadow-md flex-shrink-0">
        <div className="flex items-center gap-3">
          <Store size={22} />
          <div>
            <h1 className="text-base font-bold leading-tight">{storeSettings.storeName}</h1>
            <p className="text-[11px] text-saffron-100">
              {posSession.machine.name} - {posSession.operator.name}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-4">
          {online ? <Wifi size={16} className="text-green-200" /> : <WifiOff size={16} className="text-red-200" />}
          <div className="text-right">
            <div className="flex items-center gap-1.5 text-sm font-mono">
              <Clock size={14} />
              {time ? format(time, 'HH:mm:ss') : '--:--:--'}
            </div>
            <div className="text-[11px] text-saffron-100">{time ? format(time, 'dd MMM yyyy, EEEE') : ''}</div>
          </div>
          <button
            onClick={() => setShowBillSearch(true)}
            className="flex items-center gap-1.5 px-2.5 py-1.5 bg-white/20 hover:bg-white/30 rounded-lg text-xs transition-colors"
          >
            <Receipt size={14} /> Bills
          </button>
          <button
            onClick={handleStopSession}
            className="flex items-center gap-1.5 px-2.5 py-1.5 bg-white/20 hover:bg-white/30 rounded-lg text-xs transition-colors"
          >
            <LogOut size={14} /> Lock
          </button>
          <button
            onClick={() => setShowShortcuts(true)}
            className="flex items-center gap-1.5 px-2.5 py-1.5 bg-white/20 hover:bg-white/30 rounded-lg text-xs transition-colors"
          >
            <Keyboard size={14} /> F1
          </button>
        </div>
      </header>

      {/* Bill tabs */}
      <BillTabs
        tabs={pos.tabs}
        activeTabId={pos.activeTabId}
        onSelect={pos.setActiveTabId}
        onAdd={pos.addTab}
        onClose={pos.closeTab}
      />

      {/* Main POS area */}
      <div className="flex flex-1 overflow-hidden gap-0">
        {/* Left: Product search */}
        <div className="flex-1 flex flex-col overflow-hidden border-r border-gray-200">
          {pos.activeBill && (
            <BillingWorkspace
              bill={pos.activeBill}
              products={productSearchProducts}
              categories={categories}
              modeLabel={pos.activeBill?.originalBillId ? 'Modify / Exchange Mode' : undefined}
              hiddenProductCount={modifiedCartProductIds.size}
              onAddItem={item => { pos.addItem(item); toast.success(`Added: ${item.name}`, { duration: 1000 }); }}
              onAddLooseItem={(product, weight) => {
                pos.addLooseItem(product, weight);
                toast.success(`Added: ${product.name} — ${weight} kg`, { duration: 1500 });
              }}
              onBarcodeSearch={handleBarcodeSearch}
              onCreateProduct={openProductModal}
              onUpdateQuantity={pos.updateQuantity}
              onUpdateWeight={pos.updateWeight}
              onUpdatePrice={pos.updateItemPrice}
              onUpdateDiscount={pos.updateDiscount}
              onRemoveItem={pos.removeItem}
              onClearBill={pos.clearBill}
            />
          )}
        </div>

        {/* Right: Cart */}
        <div className="w-[360px] flex-shrink-0 flex flex-col overflow-hidden bg-white shadow-lg">
          {pos.activeBill && (
            <CartPanel
              bill={pos.activeBill}
              customer={pos.customer}
              settings={storeSettings}
              adjustment={pos.activeBill.adjustment ?? 0}
              adjustmentNote={pos.activeBill.adjustmentNote ?? ''}
              storeCreditApplied={pos.activeBill.storeCreditApplied ?? 0}
              originalBillTotal={pos.activeBill.originalBillTotal}
              showCartItems={false}
              onAdjustmentChange={pos.setAdjustment}
              onStoreCreditChange={pos.setStoreCreditApplied}
              onUpdateQuantity={pos.updateQuantity}
              onUpdateWeight={pos.updateWeight}
              onUpdateDiscount={pos.updateDiscount}
              onRemoveItem={pos.removeItem}
              onClearBill={pos.clearBill}
              onHoldBill={pos.holdBill}
              onOpenPayment={() => setShowPayment(true)}
              onOpenCustomer={() => setShowCustomer(true)}
              onOpenBillSearch={() => setShowBillSearch(true)}
              onCreateProduct={() => openProductModal()}
            />
          )}
        </div>
      </div>

      {/* Bottom status bar */}
      <div className="bg-white border-t border-gray-200 px-4 py-1.5 flex items-center justify-between text-xs text-gray-400 flex-shrink-0">
        <span>{storeSettings.storeName} &nbsp;|&nbsp; {products.length} products loaded</span>
        <span className="flex items-center gap-1">
          {online ? <span className="text-green-500">● Online</span> : <span className="text-red-400">● Offline</span>}
          &nbsp;|&nbsp; Press F1 for shortcuts
        </span>
      </div>

      {/* Modals */}
      {showPayment && pos.activeBill && (
        <PaymentModal
          total={pos.activeBill.total}
          hasCustomer={!!pos.customer}
          customerName={pos.customer?.name}
          originalBillTotal={pos.activeBill.originalBillTotal}
          onConfirm={handlePaymentConfirm}
          onClose={() => setShowPayment(false)}
        />
      )}

      {showCustomer && (
        <CustomerModal
          customer={pos.customer}
          onSave={c => { pos.setCustomer(c); setShowCustomer(false); }}
          onClose={() => setShowCustomer(false)}
        />
      )}

      {showShortcuts && <ShortcutsHelp onClose={() => setShowShortcuts(false)} />}

      {showBillSearch && (
        <BillSearchModal
          onClose={() => setShowBillSearch(false)}
          onEditBill={handleEditBill}
          onReturnBill={bill => { setReturnBill(bill); setShowBillSearch(false); }}
        />
      )}

      {returnBill && (
        <ReturnModal
          bill={returnBill}
          onClose={() => setReturnBill(null)}
          onDone={(total, method) => {
            toast.success(`Return complete · ₹${total.toFixed(2)} ${method === 'cash' ? 'cash refund' : 'added to store credit'}`);
            setReturnBill(null);
          }}
        />
      )}

      {completedBill && (
        <ReceiptModal
          bill={completedBill}
          settings={storeSettings}
          autoPrint={receiptAutoPrint}
          onClose={() => setCompletedBill(null)}
          onNewBill={handleNewBill}
        />
      )}

      {/* Barcode-scanned loose product — ask for weight */}
      {barcodeLooseProduct && (
        <WeightModal
          product={barcodeLooseProduct}
          onConfirm={w => {
            pos.addLooseItem(barcodeLooseProduct, w);
            toast.success(`Added: ${barcodeLooseProduct.name} — ${w} kg`, { duration: 1500 });
            setBarcodeLooseProduct(null);
          }}
          onClose={() => setBarcodeLooseProduct(null)}
        />
      )}

      {showProductModal && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40" onClick={e => e.target === e.currentTarget && setShowProductModal(false)}>
          <div className="mx-4 flex max-h-[90vh] w-full max-w-xl flex-col rounded-2xl bg-white shadow-2xl">
            <div className="flex items-center justify-between border-b px-6 py-4">
              <div className="flex items-center gap-2">
                <Package size={18} className="text-saffron-500" />
                <h2 className="font-bold text-gray-900">Add Product</h2>
              </div>
              <button onClick={() => setShowProductModal(false)}><X size={18} className="text-gray-400" /></button>
            </div>
            <div className="grid flex-1 grid-cols-2 gap-4 overflow-y-auto p-6">
              <div className="col-span-2">
                <label className="label">Product Name *</label>
                <input value={productForm.name} onChange={e => setProductForm(f => ({ ...f, name: e.target.value }))} className="input" autoFocus />
              </div>
              <div>
                <label className="label">Barcode</label>
                <input value={productForm.barcode || ''} onChange={e => setProductForm(f => ({ ...f, barcode: normalizeBarcode(e.target.value) }))} className="input" placeholder="Scan or type" />
              </div>
              <div>
                <label className="label">Brand</label>
                <input value={productForm.brand || ''} onChange={e => setProductForm(f => ({ ...f, brand: e.target.value }))} className="input" />
              </div>
              <div>
                <label className="label">Selling Price *</label>
                <input type="number" value={productForm.price} onChange={e => setProductForm(f => ({ ...f, price: parseFloat(e.target.value) || 0 }))} className="input" min="0" step="0.01" />
              </div>
              <div>
                <label className="label">MRP</label>
                <input type="number" value={productForm.mrp} onChange={e => setProductForm(f => ({ ...f, mrp: parseFloat(e.target.value) || 0 }))} className="input" min="0" step="0.01" />
              </div>
              <div>
                <label className="label">Opening Stock</label>
                <input type="number" value={productForm.stock} onChange={e => setProductForm(f => ({ ...f, stock: parseFloat(e.target.value) || 0 }))} className="input" step="0.01" />
              </div>
              <div>
                <label className="label">GST Rate</label>
                <select value={productForm.gstRate} onChange={e => setProductForm(f => ({ ...f, gstRate: parseInt(e.target.value) }))} className="input">
                  {POS_GST_RATES.map(rate => <option key={rate} value={rate}>{rate}%</option>)}
                </select>
              </div>
              <div>
                <label className="label">Category</label>
                <select value={productForm.category} onChange={e => setProductForm(f => ({ ...f, category: e.target.value }))} className="input">
                  {categories.map(category => <option key={category.id} value={category.name}>{category.name}</option>)}
                </select>
              </div>
              <div>
                <label className="label">Unit</label>
                <select value={productForm.unit} onChange={e => setProductForm(f => ({ ...f, unit: e.target.value, isLoose: e.target.value === 'kg' }))} className="input">
                  {POS_UNITS.map(unit => <option key={unit} value={unit}>{unit}</option>)}
                </select>
              </div>
            </div>
            <div className="flex gap-3 border-t px-6 pb-6 pt-4">
              <button onClick={() => setShowProductModal(false)} className="flex-1 rounded-xl border border-gray-200 py-2.5 text-sm text-gray-600 hover:bg-gray-50">Cancel</button>
              <button onClick={handleCreateProduct} disabled={addingProduct} className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-saffron-400 py-2.5 text-sm font-semibold text-white hover:bg-saffron-500 disabled:bg-gray-200">
                {addingProduct ? <div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" /> : <Check size={16} />}
                Add Product
              </button>
            </div>
          </div>
        </div>
      )}
      <style>{`.label{display:block;font-size:11px;font-weight:600;color:#6b7280;margin-bottom:4px;text-transform:uppercase;letter-spacing:.04em}.input{width:100%;padding:8px 12px;border:1.5px solid #e5e7eb;border-radius:10px;font-size:13px;outline:none;transition:border-color .15s}.input:focus{border-color:#ff9933}`}</style>
    </div>
  );
}
