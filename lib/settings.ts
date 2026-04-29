import { doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore';
import { db } from './firebase';
import { StoreSettings } from '@/types';

const SETTINGS_DOC = 'settings/store';
const LOCAL_KEY = 'nsb_store_settings';

export const DEFAULT_SETTINGS: StoreSettings = {
  storeName: 'NS BAZAR',
  tagline: '',
  address: 'SILCHAR ROAD, MATIJURI POINT, WORD NO-12',
  city: 'HAILAKANDI',
  pincode: '788151',
  phone1: '7002445877',
  phone2: '9859030911',
  email: 'nsbazar@gmail.com',
  gstin: '18BRZPD6102P1Z4',
  invoiceTitle: 'GST INVOICE',
  gstEnabled: true,
  gstInclusive: true,
  showGstOnBill: true,
  showSavings: true,
  footerMessage: 'Thank you for shopping with us!',
  receiptTerms: '',
  signatureImage: '',
  whatsappAlertEnabled: false,
  whatsappAlertApiUrl: '',
  whatsappAlertApiToken: '',
  whatsappAlertRecipient: '',
};

/** Load from Firestore, fall back to localStorage, then defaults */
export async function loadSettings(): Promise<StoreSettings> {
  try {
    const snap = await getDoc(doc(db, SETTINGS_DOC));
    if (snap.exists()) {
      const data = { ...DEFAULT_SETTINGS, ...snap.data() } as StoreSettings;
      // also cache locally for offline use
      localStorage.setItem(LOCAL_KEY, JSON.stringify(data));
      return data;
    }
  } catch {
    // Firestore offline — fall through to localStorage
  }
  const cached = typeof window !== 'undefined' ? localStorage.getItem(LOCAL_KEY) : null;
  if (cached) {
    try { return { ...DEFAULT_SETTINGS, ...JSON.parse(cached) }; } catch {}
  }
  return DEFAULT_SETTINGS;
}

/** Load synchronously from localStorage only (for POS first-render) */
export function loadSettingsSync(): StoreSettings {
  if (typeof window === 'undefined') return DEFAULT_SETTINGS;
  const cached = localStorage.getItem(LOCAL_KEY);
  if (cached) {
    try { return { ...DEFAULT_SETTINGS, ...JSON.parse(cached) }; } catch {}
  }
  return DEFAULT_SETTINGS;
}

/** Save to Firestore + localStorage */
export async function saveSettings(settings: StoreSettings): Promise<void> {
  const payload = { ...settings, updatedAt: serverTimestamp() };
  await setDoc(doc(db, SETTINGS_DOC), payload);
  localStorage.setItem(LOCAL_KEY, JSON.stringify(settings));
}
