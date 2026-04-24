'use client';
import { useState, useRef, useEffect } from 'react';
import { X, Search, UserPlus, Phone, User, ChevronLeft, CreditCard, Loader2, AlertCircle } from 'lucide-react';
import { Customer } from '@/types';
import { getCustomers, createCustomer } from '@/lib/customers-firestore';
import toast from 'react-hot-toast';

interface Props {
  customer: Customer | null;
  onSave: (customer: Customer | null) => void;
  onClose: () => void;
}

type Mode = 'search' | 'add';

export default function CustomerModal({ customer, onSave, onClose }: Props) {
  const [mode, setMode] = useState<Mode>('search');

  // All customers loaded once on mount
  const [allCustomers, setAllCustomers] = useState<Customer[]>([]);
  const [loadError, setLoadError] = useState(false);
  const [loadingList, setLoadingList] = useState(true);

  // Search
  const [term, setTerm] = useState('');

  // Add new
  const [newName, setNewName] = useState('');
  const [newPhone, setNewPhone] = useState('');
  const [saving, setSaving] = useState(false);

  const inputRef = useRef<HTMLInputElement>(null);

  // Load all customers once when modal opens
  useEffect(() => {
    let active = true;

    async function loadCustomers() {
      try {
        const list = await getCustomers();
        if (!active) return;
        setAllCustomers(list);
      } catch (err) {
        if (!active) return;
        console.error('Customer load error:', err);
        setLoadError(true);
      } finally {
        if (active) setLoadingList(false);
      }
    }

    void loadCustomers();
    return () => { active = false; };
  }, []);

  // Focus input when mode changes
  useEffect(() => {
    setTimeout(() => inputRef.current?.focus(), 80);
  }, [mode]);

  // Client-side filter — instant, no extra Firestore calls
  const t = term.trim().toLowerCase();
  const results = t.length === 0
    ? allCustomers.slice(0, 10)   // show first 10 when no search term
    : allCustomers.filter(c =>
        c.name.toLowerCase().includes(t) ||
        c.phone.includes(term.trim())
      );

  async function handleAddNew() {
    if (!newName.trim()) { toast.error('Name is required'); return; }
    if (newPhone.length < 10) { toast.error('Enter a valid 10-digit phone number'); return; }
    setSaving(true);
    try {
      const id = await createCustomer({ name: newName.trim(), phone: newPhone });
      const c: Customer = { id, name: newName.trim(), phone: newPhone };
      // Add to local list immediately so search works without re-fetching
      setAllCustomers(prev => [...prev, c].sort((a, b) => a.name.localeCompare(b.name)));
      toast.success(`${c.name} saved!`);
      onSave(c);
    } catch (err: unknown) {
      console.error('createCustomer error:', err);
      const message = err instanceof Error ? err.message : 'Check Firestore connection';
      toast.error(`Save failed: ${message}`);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
      onClick={e => e.target === e.currentTarget && onClose()}
    >
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm mx-4 overflow-hidden">

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <div className="flex items-center gap-2">
            {mode === 'add' && (
              <button onClick={() => setMode('search')} className="p-1 hover:bg-gray-100 rounded-lg mr-1">
                <ChevronLeft size={18} className="text-gray-500" />
              </button>
            )}
            <h2 className="text-base font-bold text-gray-900">
              {mode === 'search' ? 'Select Customer' : 'Add New Customer'}
            </h2>
          </div>
          <button onClick={onClose} className="p-1.5 hover:bg-gray-100 rounded-lg">
            <X size={18} />
          </button>
        </div>

        {/* ── SEARCH MODE ─────────────────────────────────────────────────── */}
        {mode === 'search' && (
          <div>
            {/* Currently linked customer */}
            {customer && (
              <div className="mx-5 mt-4 flex items-center justify-between bg-saffron-50 border border-saffron-200 rounded-xl px-3 py-2.5">
                <div>
                  <p className="text-sm font-semibold text-gray-800">{customer.name}</p>
                  <p className="text-xs text-gray-400">{customer.phone}</p>
                </div>
                <button
                  onClick={() => onSave(null)}
                  className="text-xs text-red-500 hover:text-red-700 font-semibold"
                >
                  Remove
                </button>
              </div>
            )}

            {/* Search input */}
            <div className="px-5 pt-4 pb-2">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={15} />
                <input
                  ref={inputRef}
                  value={term}
                  onChange={e => setTerm(e.target.value)}
                  placeholder="Name or phone number…"
                  className="w-full pl-9 pr-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:border-saffron-400"
                />
              </div>
              {/* Status line */}
              <p className="text-[10px] mt-1.5 text-gray-400">
                {loadingList
                  ? 'Loading customers…'
                  : loadError
                  ? <span className="text-red-500 flex items-center gap-1"><AlertCircle size={10} /> Could not load customers — check connection</span>
                  : `${allCustomers.length} customer${allCustomers.length !== 1 ? 's' : ''} · type to filter`}
              </p>
            </div>

            {/* Results */}
            <div className="max-h-56 overflow-y-auto px-5">
              {loadingList ? (
                <div className="flex justify-center py-6">
                  <Loader2 size={20} className="animate-spin text-saffron-400" />
                </div>
              ) : results.length > 0 ? (
                <div className="border border-gray-100 rounded-xl overflow-hidden">
                  {results.map(c => (
                    <button
                      key={c.id}
                      onClick={() => { onSave(c); toast.success(`Selected: ${c.name}`); }}
                      className="w-full flex items-center justify-between px-3 py-2.5 hover:bg-saffron-50 text-left transition-colors border-b border-gray-50 last:border-0"
                    >
                      <div>
                        <p className="text-sm font-semibold text-gray-800">{c.name}</p>
                        <p className="text-xs text-gray-400">{c.phone}</p>
                      </div>
                      {(c.storeCredit ?? 0) > 0 && (
                        <span className="flex items-center gap-1 text-xs bg-green-100 text-green-700 font-semibold px-2 py-0.5 rounded-full flex-shrink-0 ml-2">
                          <CreditCard size={10} /> ₹{c.storeCredit!.toFixed(0)}
                        </span>
                      )}
                    </button>
                  ))}
                </div>
              ) : !loadError && allCustomers.length > 0 ? (
                <p className="text-xs text-gray-400 text-center py-4">No match for &quot;{term}&quot;</p>
              ) : !loadError && allCustomers.length === 0 ? (
                <p className="text-xs text-gray-400 text-center py-4">No customers yet — add one below</p>
              ) : null}
            </div>

            {/* Add new */}
            <div className="px-5 py-4 border-t border-gray-100 mt-2">
              <button
                onClick={() => setMode('add')}
                className="w-full flex items-center justify-center gap-2 py-2.5 border-2 border-dashed border-saffron-300 text-saffron-600 rounded-xl text-sm font-semibold hover:bg-saffron-50 transition-colors"
              >
                <UserPlus size={15} /> Add New Customer
              </button>
            </div>
          </div>
        )}

        {/* ── ADD NEW MODE ─────────────────────────────────────────────────── */}
        {mode === 'add' && (
          <div className="p-5 space-y-4">
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1.5">Full Name *</label>
              <div className="relative">
                <User className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={14} />
                <input
                  ref={inputRef}
                  value={newName}
                  onChange={e => setNewName(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleAddNew()}
                  placeholder="Customer name"
                  className="w-full pl-9 pr-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:border-saffron-400"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1.5">Phone Number *</label>
              <div className="relative">
                <Phone className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={14} />
                <input
                  type="tel"
                  maxLength={10}
                  value={newPhone}
                  onChange={e => setNewPhone(e.target.value.replace(/\D/g, '').slice(0, 10))}
                  onKeyDown={e => e.key === 'Enter' && handleAddNew()}
                  placeholder="10-digit mobile"
                  className="w-full pl-9 pr-3 py-2.5 border border-gray-200 rounded-xl text-sm font-mono focus:outline-none focus:border-saffron-400"
                />
              </div>
              {newPhone.length > 0 && newPhone.length < 10 && (
                <p className="text-[10px] text-red-400 mt-1">{10 - newPhone.length} more digits needed</p>
              )}
            </div>

            <button
              onClick={handleAddNew}
              disabled={saving || !newName.trim() || newPhone.length < 10}
              className="w-full py-3 bg-saffron-400 hover:bg-saffron-500 disabled:bg-gray-200 disabled:text-gray-400 text-white font-bold rounded-xl transition-colors flex items-center justify-center gap-2 text-sm"
            >
              {saving
                ? <><Loader2 size={15} className="animate-spin" /> Saving…</>
                : <><UserPlus size={15} /> Save & Select</>}
            </button>

            <p className="text-[10px] text-center text-gray-400">
              Customer will be saved to your Firestore database
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
