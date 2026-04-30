'use client';
import { useState, useEffect, useCallback } from 'react';
import { Keyboard, Store, Clock, Wifi, WifiOff, Receipt, Monitor, LockKeyhole, LogOut } from 'lucide-react';
import toast, { Toaster } from 'react-hot-toast';
import { format } from 'date-fns';

import BillTabs from '@/components/pos/BillTabs';
import ProductSearch from '@/components/pos/ProductSearch';
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
import { getMachines, startMachineSession, stopMachineSession, verifyOperatorPin } from '@/lib/admin-firestore';
import { normalizeBarcode } from '@/lib/utils';
import { Bill, PaymentDetails, Product, Category, StoreSettings, POSMachine, Operator } from '@/types';

const POS_SESSION_KEY = 'nsb_pos_machine_session';

type PosSession = {
  machine: POSMachine;
  operator: Operator;
  startedAt: string;
};

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

  const pos = usePOS();
  const modifiedCartProductIds = new Set(pos.activeBill?.originalBillId ? pos.activeBill.items.map(item => item.product.id) : []);
  const productSearchProducts = pos.activeBill?.originalBillId
    ? products.filter(product => !modifiedCartProductIds.has(product.id))
    : products;

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

  // Keyboard shortcuts
  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      const tag = (e.target as HTMLElement).tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA') {
        if (e.key === 'Escape') (e.target as HTMLInputElement).blur();
        return;
      }
      switch (e.key) {
        case 'F2': e.preventDefault(); document.querySelector<HTMLInputElement>('[placeholder*="Search"]')?.focus(); break;
        case 'F3': e.preventDefault(); if (pos.activeBill?.items.length) setShowPayment(true); break;
        case 'F4': e.preventDefault(); pos.addTab(); break;
        case 'F5': e.preventDefault(); pos.holdBill(); break;
        case 'F6': e.preventDefault(); pos.clearBill(); break;
        case 'F7': e.preventDefault(); setShowCustomer(true); break;
        case 'F1': case '?': e.preventDefault(); setShowShortcuts(s => !s); break;
        case 'Escape': setShowPayment(false); setShowCustomer(false); setShowShortcuts(false); break;
        case '1': case '2': case '3': case '4': case '5':
          const idx = parseInt(e.key) - 1;
          if (pos.tabs[idx]) pos.setActiveTabId(pos.tabs[idx].id);
          break;
      }
    }
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [pos]);

  const handleBarcodeSearch = useCallback(async (barcode: string) => {
    const normalizedBarcode = normalizeBarcode(barcode);
    const local = products.find(p => normalizeBarcode(p.barcode) === normalizedBarcode);
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
  }, [products, pos]);

  const handlePaymentConfirm = useCallback(async (payment: PaymentDetails) => {
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

        setCompletedBill(finalBill);
        pos.openNewAfterSale();
        toast.success('Payment successful!');
      }
    } catch (err) {
      toast.error('Payment failed. Please try again.');
      console.error(err);
    }
  }, [pos, posSession]);

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
      const session: PosSession = {
        machine: { ...machine, isActive: true, currentOperatorId: operator.id, currentOperatorName: operator.name, sessionStartedAt: new Date() },
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

  const handleStopSession = useCallback(async () => {
    if (!posSession) return;
    if (!confirm(`Lock POS and stop ${posSession.machine.name}?`)) return;
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
      toast.success('POS session stopped');
    } catch {
      toast.error('Could not stop POS session');
    }
  }, [pos, posSession]);

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
          <ProductSearch
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
          />
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
    </div>
  );
}
