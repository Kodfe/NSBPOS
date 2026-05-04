'use client';
import { useState, useCallback } from 'react';
import { Bill, BillTab, Customer, PaymentDetails, Product } from '@/types';
import { calcCartItem, calcBillTotals, shortId } from '@/lib/utils';
import { saveBill, updateStock } from '@/lib/firestore';

type SaleSessionMeta = {
  machineId?: string;
  machineName?: string;
  operatorId?: string;
  operatorName?: string;
};

function createEmptyBill(index: number): BillTab {
  const id = shortId();
  return {
    id,
    label: `Bill ${index + 1}`,
    bill: {
      id,
      billNumber: '',
      items: [],
      subtotal: 0,
      totalGst: 0,
      totalDiscount: 0,
      roundOff: 0,
      adjustment: 0,
      adjustmentNote: '',
      storeCreditApplied: 0,
      total: 0,
      status: 'open',
      createdAt: new Date(),
    },
  };
}

export function usePOS() {
  const [initialTab] = useState<BillTab>(() => createEmptyBill(0));
  const [tabs, setTabs] = useState<BillTab[]>([initialTab]);
  const [activeTabId, setActiveTabId] = useState<string>(initialTab.id);
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);

  const activeTab = tabs.find(t => t.id === activeTabId) || tabs[0];
  const activeBill = activeTab?.bill;

  /** Re-compute totals preserving adjustment and store credit */
  const updateActiveBill = useCallback((updater: (bill: Bill) => Bill) => {
    setTabs(prev => prev.map(t => {
      if (t.id !== activeTabId) return t;
      const updated = updater(t.bill);
      const totals = calcBillTotals(
        updated.items,
        updated.adjustment ?? 0,
        updated.storeCreditApplied ?? 0,
      );
      return { ...t, bill: { ...updated, ...totals } };
    }));
  }, [activeTabId]);

  // ── Items ──────────────────────────────────────────────────────────────────

  const addItem = useCallback((product: Product) => {
    updateActiveBill(bill => {
      const existing = bill.items.findIndex(i => i.product.id === product.id);
      if (existing >= 0) {
        const items = [...bill.items];
        const item = items[existing];
        items[existing] = calcCartItem(product, item.quantity + 1, item.discount, item.discountAmount ?? 0);
        return { ...bill, items };
      }
      return { ...bill, items: [...bill.items, calcCartItem(product, 1, 0)] };
    });
  }, [updateActiveBill]);

  const addLooseItem = useCallback((product: Product, weightKg: number) => {
    updateActiveBill(bill => {
      const existing = bill.items.findIndex(i => i.product.id === product.id);
      const newItem = { ...calcCartItem(product, weightKg, 0), weightKg };
      if (existing >= 0) {
        const items = [...bill.items];
        items[existing] = newItem;
        return { ...bill, items };
      }
      return { ...bill, items: [...bill.items, newItem] };
    });
  }, [updateActiveBill]);

  const removeItem = useCallback((productId: string) => {
    updateActiveBill(bill => ({
      ...bill,
      items: bill.items.filter(i => i.product.id !== productId),
    }));
  }, [updateActiveBill]);

  const updateWeight = useCallback((productId: string, weightKg: number) => {
    if (weightKg <= 0) { removeItem(productId); return; }
    updateActiveBill(bill => ({
      ...bill,
      items: bill.items.map(i =>
        i.product.id === productId
          ? { ...calcCartItem(i.product, weightKg, i.discount, i.discountAmount ?? 0), weightKg }
          : i
      ),
    }));
  }, [updateActiveBill, removeItem]);

  const updateQuantity = useCallback((productId: string, quantity: number) => {
    if (quantity <= 0) { removeItem(productId); return; }
    updateActiveBill(bill => ({
      ...bill,
      items: bill.items.map(i =>
        i.product.id === productId ? calcCartItem(i.product, quantity, i.discount, i.discountAmount ?? 0) : i
      ),
    }));
  }, [updateActiveBill, removeItem]);

  const updateDiscount = useCallback((productId: string, discount: number, discountAmount?: number) => {
    updateActiveBill(bill => ({
      ...bill,
      items: bill.items.map(i =>
        i.product.id === productId
          ? calcCartItem(
              i.product,
              i.quantity,
              Math.min(100, Math.max(0, discount)),
              discountAmount ?? i.discountAmount ?? 0,
            )
          : i
      ),
    }));
  }, [updateActiveBill]);

  // ── Adjustment & Store Credit ──────────────────────────────────────────────

  const setAdjustment = useCallback((amount: number, note: string) => {
    updateActiveBill(bill => ({ ...bill, adjustment: amount, adjustmentNote: note }));
  }, [updateActiveBill]);

  const setStoreCreditApplied = useCallback((amount: number) => {
    updateActiveBill(bill => ({ ...bill, storeCreditApplied: amount }));
  }, [updateActiveBill]);

  // ── Bill control ───────────────────────────────────────────────────────────

  const clearBill = useCallback(() => {
    updateActiveBill(() => ({
      ...createEmptyBill(0).bill,
    }));
    setCustomer(null);
  }, [updateActiveBill]);

  const addTab = useCallback(() => {
    if (tabs.length >= 5) return;
    const newTab = createEmptyBill(tabs.length);
    setTabs(prev => [...prev, newTab]);
    setActiveTabId(newTab.id);
    setCustomer(null);
  }, [tabs.length]);

  const closeTab = useCallback((tabId: string) => {
    if (tabs.length === 1) { clearBill(); return; }
    setTabs(prev => {
      const filtered = prev.filter(t => t.id !== tabId);
      if (activeTabId === tabId) setActiveTabId(filtered[filtered.length - 1].id);
      return filtered;
    });
  }, [tabs.length, activeTabId, clearBill]);

  const holdBill = useCallback(() => {
    updateActiveBill(bill => ({ ...bill, status: 'held' }));
    addTab();
  }, [updateActiveBill, addTab]);

  const loadBillToNewTab = useCallback((sourceBill: Bill, originalTotal?: number) => {
    const nextTab = createEmptyBill(tabs.length);
    const nextBill: Bill = {
      ...nextTab.bill,
      items: sourceBill.items.map(item => ({
        ...item,
        product: { ...item.product },
      })),
      adjustment: sourceBill.adjustment ?? 0,
      adjustmentNote: sourceBill.adjustmentNote ?? '',
      storeCreditApplied: 0,
      createdAt: new Date(),
      // Mark as a modified bill so CartPanel / PaymentModal can show delta UI
      ...(originalTotal !== undefined ? {
        originalBillTotal:  originalTotal,
        originalBillId:     sourceBill.id,
        originalBillNumber: sourceBill.billNumber,
      } : {}),
    };
    const totals = calcBillTotals(
      nextBill.items,
      nextBill.adjustment ?? 0,
      nextBill.storeCreditApplied ?? 0,
    );

    setTabs(prev => [...prev, { ...nextTab, bill: { ...nextBill, ...totals } }]);
    setActiveTabId(nextTab.id);
    setCustomer(sourceBill.customer ?? null);
  }, [tabs.length]);

  // ── Sale processing ────────────────────────────────────────────────────────

  const processSale = useCallback(async (payment: PaymentDetails, billNumber: string, session?: SaleSessionMeta) => {
    if (!activeBill || activeBill.items.length === 0) return null;
    setIsProcessing(true);
    try {
      const saleTime = new Date();
      const finalBill: Bill = {
        ...activeBill,
        billNumber,
        createdAt: saleTime,
        ...(customer ? { customer } : {}),
        paymentMethod: payment.method,
        amountPaid: payment.amountPaid,
        change: payment.saveCreditAmount ? 0 : payment.change,
        ...(payment.saveCreditAmount ? { storeCreditEarned: payment.saveCreditAmount } : {}),
        ...(payment.upiRef ? { upiRef: payment.upiRef } : {}),
        ...(payment.cardRef ? { cardRef: payment.cardRef } : {}),
        ...(session?.machineId ? { machineId: session.machineId } : {}),
        ...(session?.operatorId ? { operatorId: session.operatorId, cashierId: session.operatorId } : {}),
        ...(session?.operatorName ? { notes: [activeBill.notes, `Operator: ${session.operatorName}`].filter(Boolean).join(' | ') } : {}),
        status: 'paid',
        paidAt: saleTime,
      };
      const id = await saveBill(finalBill);
      for (const item of activeBill.items) {
        await updateStock(item.product.id, item.weightKg ?? item.quantity);
      }
      updateActiveBill(() => ({ ...finalBill, id }));
      return { ...finalBill, id };
    } finally {
      setIsProcessing(false);
    }
  }, [activeBill, customer, updateActiveBill]);

  const openNewAfterSale = useCallback(() => {
    if (tabs.length === 1) {
      const newTab = createEmptyBill(0);
      setTabs([newTab]);
      setActiveTabId(newTab.id);
    } else {
      closeTab(activeTabId);
    }
    setCustomer(null);
  }, [tabs.length, activeTabId, closeTab]);

  return {
    tabs,
    activeTabId,
    activeBill,
    customer,
    isProcessing,
    setActiveTabId,
    setCustomer,
    addItem,
    addLooseItem,
    removeItem,
    updateQuantity,
    updateWeight,
    updateDiscount,
    setAdjustment,
    setStoreCreditApplied,
    clearBill,
    addTab,
    closeTab,
    holdBill,
    loadBillToNewTab,
    processSale,
    openNewAfterSale,
  };
}
