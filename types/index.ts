export interface Product {
  id: string;
  name: string;
  barcode?: string;
  price: number;
  mrp: number;
  purchasePrice?: number; // cost price — hidden from POS, used for P&L reports
  gstRate: number; // 0, 5, 12, 18, 28
  hsnCode?: string;
  category: string;
  unit: string; // kg, piece, ltr, pack, etc.
  stock: number;
  minStock?: number;
  image?: string;
  brand?: string;
  isActive: boolean;
  isLoose?: boolean; // sold by weight — price is per kg
  createdAt?: Date;
  updatedAt?: Date;
}

export interface CartItem {
  product: Product;
  quantity: number;   // for loose items this holds the weight in kg (e.g. 1.25)
  weightKg?: number;  // explicit weight copy for loose items display
  discount: number;   // percentage
  priceOverride?: number;
  total: number;
  gstAmount: number;
  cgst: number;
  sgst: number;
}

export interface Customer {
  id?: string;
  name: string;
  phone: string;
  email?: string;
  address?: string;
  gstin?: string;
  loyaltyPoints?: number;
  storeCredit?: number;    // balance saved for next purchase (change-return credits)
  totalBills?: number;
  totalSpent?: number;
  createdAt?: Date;
  updatedAt?: Date;
}

export interface Bill {
  id: string;
  billNumber: string;
  items: CartItem[];
  customer?: Customer;
  subtotal: number;
  totalGst: number;
  totalDiscount: number;
  roundOff: number;
  adjustment?: number;       // manual +/- amount (extra discount, due recovery, etc.)
  adjustmentNote?: string;   // label for the adjustment line
  storeCreditApplied?: number; // store credit used this bill
  total: number;
  amountPaid?: number;
  change?: number;
  storeCreditEarned?: number; // credit saved for customer when no exact change
  originalBillTotal?: number;    // set when this bill is a modified/edited version of a paid bill
  originalBillId?: string;       // ID of the paid bill this was loaded from
  originalBillNumber?: string;   // bill number of the original (shown in parens on new bill)
  adjustedToBillNumber?: string; // set on the old cancelled bill — which new bill replaced it
  paymentMethod?: 'cash' | 'upi' | 'card' | 'mixed';
  upiRef?: string;
  cardRef?: string;
  status: 'open' | 'held' | 'paid' | 'cancelled';
  createdAt: Date;
  paidAt?: Date;
  cashierId?: string;
  machineId?: string;
  operatorId?: string;
  notes?: string;
}

export interface BillTab {
  id: string;
  label: string;
  bill: Bill;
}

export interface PaymentDetails {
  method: 'cash' | 'upi' | 'card' | 'mixed';
  cashAmount?: number;
  upiAmount?: number;
  cardAmount?: number;
  upiRef?: string;
  cardRef?: string;
  amountPaid: number;
  change: number;
  saveCreditAmount?: number;   // if > 0, save this much change as store credit
}

export interface Category {
  id: string;
  name: string;
  icon?: string;
}

export interface DailySummary {
  date: string;
  totalSales: number;
  totalBills: number;
  totalItems: number;
  cashSales: number;
  upiSales: number;
  cardSales: number;
  totalGst: number;
  totalDiscount: number;
}

// ── Store settings ────────────────────────────────────────────────────────────

export interface StoreSettings {
  storeName: string;
  tagline?: string;
  address: string;
  city: string;
  pincode: string;
  phone1: string;
  phone2?: string;
  email?: string;
  gstin?: string;
  invoiceTitle: string;        // "GST INVOICE" | "TAX INVOICE" | "BILL"
  gstEnabled: boolean;         // GST is applicable at all
  gstInclusive: boolean;       // true = price already includes GST, false = add on top
  showGstOnBill: boolean;      // print the GST breakdown section
  showSavings: boolean;        // print "You Saved ₹X" line
  footerMessage: string;
  signatureImage?: string;      // data URL used on purchase/receipt signatures
  updatedAt?: Date;
}

// ── Admin types ───────────────────────────────────────────────────────────────

export interface POSMachine {
  id: string;
  name: string;         // e.g. "Machine 1"
  label: string;        // e.g. "Counter 1 – Fruits & Veg"
  isActive: boolean;    // currently running a session
  currentOperatorId?: string;
  currentOperatorName?: string;
  sessionStartedAt?: Date;
  location?: string;
  createdAt: Date;
}

export interface Operator {
  id: string;
  name: string;
  pin: string;          // 2-digit PIN
  phone?: string;
  assignedMachineId?: string;
  assignedMachineName?: string;
  isActive: boolean;
  createdAt: Date;
  lastLoginAt?: Date;
}

export interface MachineLog {
  id: string;
  machineId: string;
  machineName: string;
  operatorId: string;
  operatorName: string;
  action: 'start' | 'stop';
  timestamp: Date;
  sessionDurationMinutes?: number; // filled on stop
  billsCount?: number;             // filled on stop
  totalSales?: number;             // filled on stop
  notes?: string;
}

export interface SalesSummary {
  totalSales: number;
  totalBills: number;
  totalItems: number;
  cashSales: number;
  upiSales: number;
  cardSales: number;
  totalGst: number;
  totalDiscount: number;
  avgBillValue: number;
  topProducts: { name: string; qty: number; revenue: number }[];
  dailyBreakdown: { date: string; sales: number; bills: number }[];
}

// ── Purchase / Vendor types ───────────────────────────────────────────────────

export interface Party {
  id: string;
  name: string;
  phone?: string;
  email?: string;
  address?: string;
  gstin?: string;
  contactPerson?: string;
  openingBalance?: number;  // positive = we owe them, negative = they owe us
  currentBalance?: number;
  createdAt: Date;
  updatedAt?: Date;
}

export interface PurchaseItem {
  productId: string;
  productName: string;
  hsnCode?: string;
  quantity: number;
  unit: string;
  purchaseRate: number;    // price we paid
  mrp: number;
  gstRate: number;
  gstAmount: number;
  total: number;
}

export interface PurchaseBill {
  id: string;
  purchaseNumber: string;  // e.g. PUR260424-001
  partyId: string;
  partyName: string;
  items: PurchaseItem[];
  invoiceNumber?: string;  // vendor's invoice number
  invoiceDate?: Date;
  subtotal: number;
  totalGst: number;
  totalDiscount: number;
  roundOff: number;
  total: number;
  amountPaid: number;
  balance: number;         // total - amountPaid
  paymentMethod?: 'cash' | 'upi' | 'card' | 'credit';
  status: 'draft' | 'received' | 'partial' | 'paid';
  notes?: string;
  createdAt: Date;
  updatedAt?: Date;
}

export interface PurchaseOrder {
  id: string;
  orderNumber: string;
  partyId: string;
  partyName: string;
  items: PurchaseItem[];
  total: number;
  amountPaid: number;
  balance: number;
  paymentStatus: 'unpaid' | 'partial' | 'paid';
  paymentMethod?: 'cash' | 'upi' | 'card' | 'credit';
  expectedDate?: Date;
  dueDate?: Date;
  status: 'pending' | 'received' | 'cancelled';
  notes?: string;
  createdAt: Date;
}

export interface PurchaseReturn {
  id: string;
  returnNumber: string;
  purchaseBillId?: string;
  partyId: string;
  partyName: string;
  items: PurchaseItem[];
  reason?: string;
  total: number;
  status: 'draft' | 'sent';
  createdAt: Date;
}

export interface DebitNote {
  id: string;
  noteNumber: string;
  partyId: string;
  partyName: string;
  purchaseBillId?: string;
  amount: number;
  reason: string;
  status: 'draft' | 'confirmed';
  createdAt: Date;
}

// ── Bill adjustment ───────────────────────────────────────────────────────────

export interface BillAdjustment {
  type: 'discount' | 'due' | 'credit' | 'other';
  amount: number;       // positive = reduces total, negative = adds to total
  note: string;
}

// ── Sale Return ───────────────────────────────────────────────────────────────

export interface ReturnLineItem {
  product: Product;
  originalQty: number;   // what was on original bill
  weightKg?: number;     // for loose items
  returnQty: number;     // how many the customer is returning
  pricePerUnit: number;
  total: number;
}

export interface SaleReturn {
  id: string;
  returnNumber: string;
  originalBillId: string;
  originalBillNumber: string;
  items: ReturnLineItem[];
  total: number;
  refundMethod: 'cash' | 'credit';
  customer?: Customer;
  notes?: string;
  createdAt: Date;
  processedAt: Date;
}
