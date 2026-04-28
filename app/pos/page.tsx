'use client';
import { useState, useEffect, useCallback, useRef } from 'react';
import { Keyboard, Store, Clock, Wifi, WifiOff, Receipt } from 'lucide-react';
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
import { getProductByBarcode, generateBillNumber, subscribeProducts } from '@/lib/firestore';
import { loadSettings, DEFAULT_SETTINGS } from '@/lib/settings';
import { db } from '@/lib/firebase';
import { addStoreCredit, updateCustomerStats } from '@/lib/customers-firestore';
import { cancelBill, returnStock, markBillAsAdjusted } from '@/lib/firestore';
import { getCategories } from '@/lib/categories-firestore';
import { Bill, PaymentDetails, Product, Category, StoreSettings } from '@/types';

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

  const searchInputRef = useRef<HTMLInputElement>(null);
  const pos = usePOS();

  // Load store settings
  useEffect(() => {
    loadSettings().then(s => setStoreSettings(s));
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
    const local = products.find(p => p.barcode === barcode);
    if (local) {
      if (local.isLoose) { setBarcodeLooseProduct(local); return; }
      pos.addItem(local);
      toast.success(`Added: ${local.name}`, { duration: 1000 });
      return;
    }
    try {
      const remote = await getProductByBarcode(barcode);
      if (remote) {
        if (remote.isLoose) { setBarcodeLooseProduct(remote); return; }
        pos.addItem(remote);
        toast.success(`Added: ${remote.name}`, { duration: 1000 });
      } else {
        toast.error(`Barcode not found: ${barcode}`);
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

      const finalBill = await pos.processSale(payment, billNumber);
      if (finalBill) {
        setShowPayment(false);

        // Update customer stats & handle store credit silently
        if (finalBill.customer?.id) {
          try { await updateCustomerStats(finalBill.customer.id, finalBill.total); } catch {}
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
        toast.success('Payment successful!');
      }
    } catch (err) {
      toast.error('Payment failed. Please try again.');
      console.error(err);
    }
  }, [pos]);

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

      toast.success(`Bill ${bill.billNumber} loaded — modify items, then collect or refund the difference.`);
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

  return (
    <div className="h-screen flex flex-col bg-gray-50 overflow-hidden">
      <Toaster position="top-right" toastOptions={{ duration: 2000 }} />

      {/* Top bar */}
      <header className="bg-saffron-400 text-white px-4 py-2 flex items-center justify-between shadow-md flex-shrink-0">
        <div className="flex items-center gap-3">
          <Store size={22} />
          <div>
            <h1 className="text-base font-bold leading-tight">{storeSettings.storeName}</h1>
            <p className="text-[11px] text-saffron-100">{storeSettings.tagline || 'Supermarket Billing System'}</p>
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
            products={products}
            categories={categories}
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
