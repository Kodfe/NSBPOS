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
import { DEMO_PRODUCTS } from '@/lib/demo-data';
import { getProductByBarcode, generateBillNumber } from '@/lib/firestore';
import { loadSettings, DEFAULT_SETTINGS } from '@/lib/settings';
import { addStoreCredit, updateCustomerStats } from '@/lib/customers-firestore';
import { cancelBill, returnStock, markBillAsAdjusted } from '@/lib/firestore';
import { db } from '@/lib/firebase';
import { Bill, PaymentDetails, Product, StoreSettings } from '@/types';

export default function POSScreen() {
  const products: Product[] = DEMO_PRODUCTS;
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

  useEffect(() => {
    loadSettings().then(s => setStoreSettings(s));
  }, []);

  useEffect(() => {
    const t = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    const onOnline = () => setOnline(true);
    const onOffline = () => setOnline(false);
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    return () => {
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
    };
  }, []);

  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      const tag = (e.target as HTMLElement).tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA') {
        if (e.key === 'Escape') (e.target as HTMLInputElement).blur();
        return;
      }
      switch (e.key) {
        case 'F2':
          e.preventDefault();
          if (searchInputRef.current) {
            searchInputRef.current.focus();
          } else {
            document.querySelector<HTMLInputElement>('[placeholder*="Search"]')?.focus();
          }
          break;
        case 'F3':
          e.preventDefault();
          if (pos.activeBill?.items.length) setShowPayment(true);
          break;
        case 'F4':
          e.preventDefault();
          pos.addTab();
          break;
        case 'F5':
          e.preventDefault();
          pos.holdBill();
          break;
        case 'F6':
          e.preventDefault();
          pos.clearBill();
          break;
        case 'F7':
          e.preventDefault();
          setShowCustomer(true);
          break;
        case 'F1':
        case '?':
          e.preventDefault();
          setShowShortcuts(s => !s);
          break;
        case 'Escape':
          setShowPayment(false);
          setShowCustomer(false);
          setShowShortcuts(false);
          break;
        case '1':
        case '2':
        case '3':
        case '4':
        case '5': {
          const idx = parseInt(e.key) - 1;
          if (pos.tabs[idx]) pos.setActiveTabId(pos.tabs[idx].id);
          break;
        }
      }
    }
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [pos]);

  const handleBarcodeSearch = useCallback(
    async (barcode: string) => {
      const local = products.find(p => p.barcode === barcode);
      if (local) {
        if (local.isLoose) {
          setBarcodeLooseProduct(local);
          return;
        }
        pos.addItem(local);
        toast.success(`Added: ${local.name}`, { duration: 1000 });
        return;
      }
      try {
        const remote = await getProductByBarcode(barcode);
        if (remote) {
          if (remote.isLoose) {
            setBarcodeLooseProduct(remote);
            return;
          }
          pos.addItem(remote);
          toast.success(`Added: ${remote.name}`, { duration: 1000 });
        } else {
          toast.error(`Barcode not found: ${barcode}`);
        }
      } catch {
        toast.error('Barcode lookup failed');
      }
    },
    [products, pos]
  );

  const handlePaymentConfirm = useCallback(
    async (payment: PaymentDetails) => {
      try {
        let billNumber: string;
        try {
          billNumber = await generateBillNumber();
        } catch {
          billNumber = `NSB${Date.now()}`;
        }

        const finalBill = await pos.processSale(payment, billNumber);
        if (finalBill) {
          setShowPayment(false);

          if (finalBill.customer?.id) {
            try {
              await updateCustomerStats(finalBill.customer.id, finalBill.total);
            } catch {}
            if (payment.saveCreditAmount && payment.saveCreditAmount > 0) {
              try {
                await addStoreCredit(finalBill.customer.id, payment.saveCreditAmount);
                toast.success(
                  `Rs. ${payment.saveCreditAmount.toFixed(2)} saved as store credit for ${finalBill.customer.name}`
                );
              } catch {}
            }
          }

          if (finalBill.originalBillId) {
            try {
              await markBillAsAdjusted(finalBill.originalBillId, finalBill.id, finalBill.billNumber);
            } catch {}
          }

          setCompletedBill(finalBill);
          toast.success('Payment successful!');
        }
      } catch (err) {
        toast.error('Payment failed. Please try again.');
        console.error(err);
      }
    },
    [pos]
  );

  const handleNewBill = useCallback(() => {
    setCompletedBill(null);
    pos.openNewAfterSale();
  }, [pos]);

  const handleEditBill = useCallback(
    async (bill: Bill) => {
      try {
        pos.loadBillToNewTab(bill, bill.total);

        await cancelBill(bill.id, 'Edited via POS - reloaded to new bill');
        for (const item of bill.items) {
          try {
            await returnStock(item.product.id, item.weightKg ?? item.quantity);
          } catch {}
        }

        toast.success(`Bill ${bill.billNumber} loaded - modify items, then collect or refund the difference.`);
      } catch (err) {
        toast.error('Could not load bill to cart');
        console.error(err);
      }
    },
    [pos]
  );

  if (typeof window !== 'undefined' && !db) {
    return (
      <div className="flex h-screen items-center justify-center bg-gray-50">
        <div className="text-center">
          <h1 className="mb-4 text-2xl font-bold text-gray-800">Configuration Error</h1>
          <p className="mb-4 text-gray-600">Firebase is not configured. Please set the environment variables.</p>
          <p className="text-sm text-gray-500">Check the environment setup for the required variables.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-gray-50">
      <Toaster position="top-right" toastOptions={{ duration: 2000 }} />

      <header className="bg-saffron-400 flex flex-shrink-0 items-center justify-between px-4 py-2 text-white shadow-md">
        <div className="flex items-center gap-3">
          <Store size={22} />
          <div>
            <h1 className="text-base font-bold leading-tight">{storeSettings.storeName}</h1>
            <p className="text-saffron-100 text-[11px]">{storeSettings.tagline || 'Supermarket Billing System'}</p>
          </div>
        </div>
        <div className="flex items-center gap-4">
          {online ? <Wifi size={16} className="text-green-200" /> : <WifiOff size={16} className="text-red-200" />}
          <div className="text-right">
            <div className="flex items-center gap-1.5 text-sm font-mono">
              <Clock size={14} />
              {time ? format(time, 'HH:mm:ss') : '--:--:--'}
            </div>
            <div className="text-saffron-100 text-[11px]">{time ? format(time, 'dd MMM yyyy, EEEE') : ''}</div>
          </div>
          <button
            onClick={() => setShowBillSearch(true)}
            className="rounded-lg bg-white/20 px-2.5 py-1.5 text-xs transition-colors hover:bg-white/30"
          >
            <span className="flex items-center gap-1.5">
              <Receipt size={14} />
              Bills
            </span>
          </button>
          <button
            onClick={() => setShowShortcuts(true)}
            className="rounded-lg bg-white/20 px-2.5 py-1.5 text-xs transition-colors hover:bg-white/30"
          >
            <span className="flex items-center gap-1.5">
              <Keyboard size={14} />
              F1
            </span>
          </button>
        </div>
      </header>

      <BillTabs
        tabs={pos.tabs}
        activeTabId={pos.activeTabId}
        onSelect={pos.setActiveTabId}
        onAdd={pos.addTab}
        onClose={pos.closeTab}
      />

      <div className="flex flex-1 gap-0 overflow-hidden">
        <div className="flex flex-1 flex-col overflow-hidden border-r border-gray-200">
          <ProductSearch
            searchInputRef={searchInputRef}
            products={products}
            onAddItem={item => {
              pos.addItem(item);
              toast.success(`Added: ${item.name}`, { duration: 1000 });
            }}
            onAddLooseItem={(product, weight) => {
              pos.addLooseItem(product, weight);
              toast.success(`Added: ${product.name} - ${weight} kg`, { duration: 1500 });
            }}
            onBarcodeSearch={handleBarcodeSearch}
          />
        </div>

        <div className="flex w-[360px] flex-shrink-0 flex-col overflow-hidden bg-white shadow-lg">
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

      <div className="flex flex-shrink-0 items-center justify-between border-t border-gray-200 bg-white px-4 py-1.5 text-xs text-gray-400">
        <span>Cashier: Admin | {products.length} products loaded</span>
        <span className="flex items-center gap-1">
          {online ? <span className="text-green-500">Online</span> : <span className="text-red-400">Offline</span>}
          | Press F1 for shortcuts
        </span>
      </div>

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
          onSave={c => {
            pos.setCustomer(c);
            setShowCustomer(false);
          }}
          onClose={() => setShowCustomer(false)}
        />
      )}

      {showShortcuts && <ShortcutsHelp onClose={() => setShowShortcuts(false)} />}

      {showBillSearch && (
        <BillSearchModal
          onClose={() => setShowBillSearch(false)}
          onEditBill={handleEditBill}
          onReturnBill={bill => {
            setReturnBill(bill);
            setShowBillSearch(false);
          }}
        />
      )}

      {returnBill && (
        <ReturnModal
          bill={returnBill}
          onClose={() => setReturnBill(null)}
          onDone={(total, method) => {
            toast.success(
              `Return complete · Rs. ${total.toFixed(2)} ${
                method === 'cash' ? 'cash refund' : 'added to store credit'
              }`
            );
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

      {barcodeLooseProduct && (
        <WeightModal
          product={barcodeLooseProduct}
          onConfirm={w => {
            pos.addLooseItem(barcodeLooseProduct, w);
            toast.success(`Added: ${barcodeLooseProduct.name} - ${w} kg`, { duration: 1500 });
            setBarcodeLooseProduct(null);
          }}
          onClose={() => setBarcodeLooseProduct(null)}
        />
      )}
    </div>
  );
}
