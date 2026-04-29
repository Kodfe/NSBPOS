'use client';
import { useState, useEffect } from 'react';
import {
  Store, Phone, Mail, MapPin, Shield, Receipt, Save,
  CheckCircle2, ToggleLeft, ToggleRight, Tag, FileText, Sparkles, Upload, Image as ImageIcon, X,
} from 'lucide-react';
import toast, { Toaster } from 'react-hot-toast';
import { StoreSettings } from '@/types';
import { loadSettings, saveSettings, DEFAULT_SETTINGS } from '@/lib/settings';

const INVOICE_TITLES = ['GST INVOICE', 'TAX INVOICE', 'BILL', 'RETAIL INVOICE', 'CASH MEMO'];

export default function SettingsPage() {
  const [form, setForm] = useState<StoreSettings>(DEFAULT_SETTINGS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    loadSettings().then(s => { setForm(s); setLoading(false); });
  }, []);

  function set<K extends keyof StoreSettings>(key: K, val: StoreSettings[K]) {
    setForm(f => ({ ...f, [key]: val }));
    setSaved(false);
  }

  async function handleSave() {
    if (!form.storeName) { toast.error('Store name is required'); return; }
    setSaving(true);
    try {
      await saveSettings(form);
      setSaved(true);
      toast.success('Settings saved!');
    } catch (e) {
      toast.error('Save failed — check Firestore connection');
    } finally {
      setSaving(false);
    }
  }

  function handleSignatureUpload(file?: File) {
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      toast.error('Please upload an image file');
      return;
    }
    const reader = new FileReader();
    reader.onload = () => set('signatureImage', String(reader.result || ''));
    reader.onerror = () => toast.error('Could not read signature image');
    reader.readAsDataURL(file);
  }

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-saffron-400 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col overflow-hidden bg-gray-50">
      <Toaster position="top-right" />

      {/* Header */}
      <div className="bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between flex-shrink-0 sticky top-0 z-10">
        <div>
          <h1 className="text-lg font-bold text-gray-900">Store Settings</h1>
          <p className="text-xs text-gray-500">Business details · GST configuration · Bill preferences</p>
        </div>
        <button
          onClick={handleSave}
          disabled={saving}
          className="flex items-center gap-2 px-5 py-2.5 bg-saffron-400 hover:bg-saffron-500 disabled:bg-gray-200 text-white font-semibold rounded-xl transition-colors text-sm"
        >
          {saving
            ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
            : saved ? <CheckCircle2 size={16} /> : <Save size={16} />}
          {saved ? 'Saved!' : 'Save Settings'}
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-6 max-w-3xl mx-auto w-full space-y-6">

        {/* ── Store Information ──────────────────────────────────────────── */}
        <Section icon={<Store size={18} className="text-saffron-500" />} title="Store Information"
          desc="Printed on every bill and receipt">
          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2">
              <Label>Store / Business Name *</Label>
              <input value={form.storeName} onChange={e => set('storeName', e.target.value)}
                className="input text-base font-bold" placeholder="e.g. NS BAZAR" />
            </div>
            <div className="col-span-2">
              <Label>Tagline (optional)</Label>
              <input value={form.tagline || ''} onChange={e => set('tagline', e.target.value)}
                className="input" placeholder="e.g. Fresh Groceries at Best Prices" />
            </div>
            <div className="col-span-2">
              <Label>Address</Label>
              <input value={form.address} onChange={e => set('address', e.target.value)}
                className="input" placeholder="Street address" />
            </div>
            <div>
              <Label>City</Label>
              <input value={form.city} onChange={e => set('city', e.target.value)}
                className="input" placeholder="e.g. HAILAKANDI" />
            </div>
            <div>
              <Label>PIN Code</Label>
              <input value={form.pincode} onChange={e => set('pincode', e.target.value.replace(/\D/, '').slice(0, 6))}
                className="input font-mono" placeholder="788151" maxLength={6} />
            </div>
            <div>
              <Label>Phone 1 *</Label>
              <input value={form.phone1} onChange={e => set('phone1', e.target.value.replace(/\D/, '').slice(0, 10))}
                className="input font-mono" placeholder="7002445877" />
            </div>
            <div>
              <Label>Phone 2 (optional)</Label>
              <input value={form.phone2 || ''} onChange={e => set('phone2', e.target.value.replace(/\D/, '').slice(0, 10))}
                className="input font-mono" placeholder="9859030911" />
            </div>
            <div>
              <Label>Email</Label>
              <input type="email" value={form.email || ''} onChange={e => set('email', e.target.value)}
                className="input" placeholder="nsbazar@gmail.com" />
            </div>
            <div>
              <Label>Footer Message</Label>
              <input value={form.footerMessage} onChange={e => set('footerMessage', e.target.value)}
                className="input" placeholder="Thank you for shopping with us!" />
            </div>
          </div>
        </Section>

        {/* ── GST / Tax ─────────────────────────────────────────────────── */}
        <Section icon={<Shield size={18} className="text-blue-500" />} title="GST & Tax"
          desc="GSTIN and tax calculation method">
          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2">
              <Label>GSTIN</Label>
              <input value={form.gstin || ''} onChange={e => set('gstin', e.target.value.toUpperCase())}
                maxLength={15} className="input font-mono tracking-wider uppercase"
                placeholder="18BRZPD6102P1Z4" />
              <p className="text-[10px] text-gray-400 mt-1">15-character GST Identification Number</p>
            </div>

            {/* GST toggle */}
            <div className="col-span-2">
              <Toggle
                label="GST Applicable"
                desc="Enable if your store is GST registered and products have GST"
                value={form.gstEnabled}
                onChange={v => set('gstEnabled', v)}
              />
            </div>

            {form.gstEnabled && (
              <>
                <div className="col-span-2">
                  <Toggle
                    label="Prices inclusive of GST"
                    desc={
                      form.gstInclusive
                        ? 'Current: ₹100 price already includes GST (most common for retail)'
                        : 'Current: GST is added on top of the product price'
                    }
                    value={form.gstInclusive}
                    onChange={v => set('gstInclusive', v)}
                    accent="blue"
                  />
                </div>
                <div className="col-span-2">
                  <Toggle
                    label="Show GST breakdown on bill"
                    desc="Print CGST/SGST split and GST summary at bottom of receipt"
                    value={form.showGstOnBill}
                    onChange={v => set('showGstOnBill', v)}
                  />
                </div>
              </>
            )}
          </div>
        </Section>

        {/* ── Bill / Receipt ────────────────────────────────────────────── */}
        <Section icon={<Receipt size={18} className="text-purple-500" />} title="Bill & Receipt"
          desc="How bills are printed and labelled">
          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2">
              <Label>Invoice Title (printed at top of every bill)</Label>
              <div className="flex flex-wrap gap-2 mt-1">
                {INVOICE_TITLES.map(t => (
                  <button key={t} onClick={() => set('invoiceTitle', t)}
                    className={`px-3 py-1.5 rounded-xl text-sm font-semibold border-2 transition-all ${
                      form.invoiceTitle === t
                        ? 'border-saffron-400 bg-saffron-50 text-saffron-700'
                        : 'border-gray-100 text-gray-500 hover:border-gray-200'
                    }`}>
                    {t}
                  </button>
                ))}
              </div>
            </div>

            <div className="col-span-2">
              <Toggle
                label='Show "You Saved ₹X" on bill'
                desc="Prints how much the customer saved vs MRP — great for customer satisfaction"
                value={form.showSavings}
                onChange={v => set('showSavings', v)}
                accent="green"
              />
            </div>

            <div className="col-span-2">
              <Label>Authorized Signature</Label>
              <div className="border-2 border-dashed border-gray-200 rounded-xl p-4 flex items-center gap-4">
                <div className="w-36 h-20 bg-gray-50 rounded-lg border border-gray-100 flex items-center justify-center overflow-hidden">
                  {form.signatureImage ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={form.signatureImage} alt="Signature preview" className="max-w-full max-h-full object-contain" />
                  ) : (
                    <ImageIcon size={24} className="text-gray-300" />
                  )}
                </div>
                <div className="flex-1">
                  <input
                    id="signature-upload"
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={e => handleSignatureUpload(e.target.files?.[0])}
                  />
                  <div className="flex gap-2">
                    <label htmlFor="signature-upload" className="inline-flex items-center gap-2 px-3 py-2 bg-saffron-400 hover:bg-saffron-500 text-white rounded-lg text-sm font-semibold cursor-pointer">
                      <Upload size={14} /> Upload
                    </label>
                    {form.signatureImage && (
                      <button onClick={() => set('signatureImage', '')} className="inline-flex items-center gap-2 px-3 py-2 border border-gray-200 text-gray-600 rounded-lg text-sm hover:bg-gray-50">
                        <X size={14} /> Remove
                      </button>
                    )}
                  </div>
                  <p className="text-[11px] text-gray-400 mt-2">Used for authorized signatory on purchase documents.</p>
                </div>
              </div>
            </div>
          </div>
        </Section>

        {/* ── Live Preview ──────────────────────────────────────────────── */}
        <Section icon={<FileText size={18} className="text-gray-500" />} title="Receipt Preview"
          desc="How the top of your bill will look">
          <div className="bg-gray-50 rounded-xl p-4 font-mono text-[11px] text-gray-700 text-center leading-relaxed border border-gray-200">
            <div className="font-bold text-sm">{form.invoiceTitle}</div>
            <div className="font-bold text-base mt-0.5">{form.storeName || 'YOUR STORE NAME'}</div>
            {form.tagline && <div className="text-gray-500">{form.tagline}</div>}
            <div>{form.address}</div>
            <div>{[form.city, form.pincode].filter(Boolean).join('-')}</div>
            {(form.phone1 || form.phone2) && (
              <div>Phone: {[form.phone1, form.phone2].filter(Boolean).join(', ')}</div>
            )}
            {form.email && <div>E-Mail: {form.email}</div>}
            {form.gstin && form.gstEnabled && <div>GSTIN: {form.gstin}</div>}
            <div className="border-t border-dashed border-gray-400 mt-2 pt-1 text-gray-400 text-[10px]">
              Bill No: NSB260423-0001 &nbsp;&nbsp; 23/04/26 14:30
            </div>
            {form.signatureImage && (
              <div className="mt-3 flex justify-end">
                <div className="text-center">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={form.signatureImage} alt="Signature preview" className="h-10 max-w-28 object-contain mx-auto" />
                  <div className="border-t border-gray-400 mt-1 pt-1 text-[9px] text-gray-500">Authorized Signatory</div>
                </div>
              </div>
            )}
          </div>
        </Section>

        {/* Spacer */}
        <div className="h-4" />
      </div>
    </div>
  );
}

// ── Sub-components ────────────────────────────────────────────────────────────

function Section({ icon, title, desc, children }: {
  icon: React.ReactNode; title: string; desc: string; children: React.ReactNode;
}) {
  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
      <div className="flex items-center gap-3 px-6 py-4 border-b border-gray-50">
        <div className="w-8 h-8 rounded-lg bg-gray-50 flex items-center justify-center">{icon}</div>
        <div>
          <h2 className="text-sm font-bold text-gray-900">{title}</h2>
          <p className="text-[11px] text-gray-400">{desc}</p>
        </div>
      </div>
      <div className="p-6">{children}</div>
    </div>
  );
}

function Label({ children }: { children: React.ReactNode }) {
  return <label className="block text-[11px] font-semibold text-gray-500 uppercase tracking-wide mb-1">{children}</label>;
}

function Toggle({ label, desc, value, onChange, accent = 'saffron' }: {
  label: string; desc: string; value: boolean;
  onChange: (v: boolean) => void; accent?: 'saffron' | 'blue' | 'green';
}) {
  const colors = {
    saffron: 'bg-saffron-400',
    blue: 'bg-blue-500',
    green: 'bg-green-500',
  };
  return (
    <button
      type="button"
      onClick={() => onChange(!value)}
      className="w-full flex items-center justify-between p-4 rounded-xl border-2 border-gray-100 hover:border-gray-200 transition-all text-left"
    >
      <div>
        <p className="text-sm font-semibold text-gray-800">{label}</p>
        <p className="text-xs text-gray-400 mt-0.5">{desc}</p>
      </div>
      <div className={`relative w-12 h-6 rounded-full transition-colors flex-shrink-0 ml-4 ${value ? colors[accent] : 'bg-gray-200'}`}>
        <div className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${value ? 'translate-x-6' : 'translate-x-0.5'}`} />
      </div>
    </button>
  );
}
