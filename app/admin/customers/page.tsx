'use client';
import { useState, useEffect } from 'react';
import { Plus, Search, Pencil, Trash2, X, Check, Users, CreditCard } from 'lucide-react';
import toast, { Toaster } from 'react-hot-toast';
import { Customer } from '@/types';
import { getCustomers, createCustomer, updateCustomer, deleteCustomer, addStoreCredit, deductStoreCredit } from '@/lib/customers-firestore';
import { formatCurrency } from '@/lib/utils';

const EMPTY_FORM = { name: '', phone: '', email: '', address: '', gstin: '', storeCredit: 0 };

export default function CustomersPage() {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<Customer | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);

  // Store credit adjust modal
  const [creditCustomer, setCreditCustomer] = useState<Customer | null>(null);
  const [creditAmount, setCreditAmount] = useState('');
  const [creditMode, setCreditMode] = useState<'add' | 'remove'>('add');
  const [creditReason, setCreditReason] = useState('');
  const [creditSaving, setCreditSaving] = useState(false);

  useEffect(() => { load(); }, []);

  async function load() {
    setLoading(true);
    try {
      const data = await getCustomers();
      setCustomers(data);
    } catch {
      toast.error('Failed to load customers');
      setCustomers([]);
    } finally {
      setLoading(false);
    }
  }

  function openAdd() {
    setEditing(null);
    setForm(EMPTY_FORM);
    setShowModal(true);
  }

  function openEdit(c: Customer) {
    setEditing(c);
    setForm({
      name: c.name,
      phone: c.phone,
      email: c.email ?? '',
      address: c.address ?? '',
      gstin: c.gstin ?? '',
      storeCredit: c.storeCredit ?? 0,
    });
    setShowModal(true);
  }

  async function handleSave() {
    if (!form.name.trim()) { toast.error('Name is required'); return; }
    if (!form.phone.trim()) { toast.error('Phone is required'); return; }
    setSaving(true);
    try {
      if (editing) {
        await updateCustomer(editing.id!, { name: form.name, phone: form.phone, email: form.email || undefined, address: form.address || undefined, gstin: form.gstin || undefined });
        toast.success('Customer updated');
      } else {
        await createCustomer({ name: form.name, phone: form.phone, email: form.email || undefined, address: form.address || undefined, gstin: form.gstin || undefined, storeCredit: form.storeCredit || 0 });
        toast.success('Customer added');
      }
      setShowModal(false);
      load();
    } catch {
      toast.error('Save failed');
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(c: Customer) {
    if (!confirm(`Delete customer "${c.name}"? This cannot be undone.`)) return;
    try {
      await deleteCustomer(c.id!);
      toast.success('Customer deleted');
      load();
    } catch {
      toast.error('Delete failed');
    }
  }

  async function handleCreditAdjust() {
    if (!creditCustomer) return;
    const amt = parseFloat(creditAmount);
    if (!amt || amt <= 0) { toast.error('Enter a valid amount'); return; }
    setCreditSaving(true);
    try {
      if (creditMode === 'add') {
        await addStoreCredit(creditCustomer.id!, amt);
        toast.success(`Added ${formatCurrency(amt)} store credit`);
      } else {
        await deductStoreCredit(creditCustomer.id!, amt);
        toast.success(`Deducted ${formatCurrency(amt)} store credit`);
      }
      setCreditCustomer(null);
      setCreditAmount('');
      setCreditReason('');
      load();
    } catch {
      toast.error('Credit adjustment failed');
    } finally {
      setCreditSaving(false);
    }
  }

  const filtered = customers.filter(c => {
    if (!search) return true;
    const t = search.toLowerCase();
    return c.name.toLowerCase().includes(t) || c.phone.includes(search);
  });

  return (
    <div className="flex-1 flex flex-col overflow-hidden bg-gray-50">
      <Toaster position="top-right" />

      {/* Header */}
      <div className="bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between flex-shrink-0 sticky top-0 z-10">
        <div>
          <h1 className="text-lg font-bold text-gray-900">Customers</h1>
          <p className="text-xs text-gray-500">{customers.length} registered customers</p>
        </div>
        <button onClick={openAdd} className="flex items-center gap-1.5 px-4 py-2 bg-saffron-400 hover:bg-saffron-500 text-white font-semibold rounded-xl text-sm transition-colors">
          <Plus size={14} /> Add Customer
        </button>
      </div>

      {/* Search */}
      <div className="bg-white border-b border-gray-100 px-6 py-3 flex-shrink-0">
        <div className="relative max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={14} />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search by name or phone…"
            className="w-full pl-8 pr-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:border-saffron-400"
          />
        </div>
      </div>

      {/* Table */}
      <div className="flex-1 overflow-y-auto">
        {loading ? (
          <div className="flex items-center justify-center h-48 text-gray-400 text-sm">Loading…</div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-48 gap-3">
            <Users size={40} className="text-gray-200" />
            <p className="text-gray-400 text-sm">{search ? 'No customers match your search' : 'No customers yet. Add your first customer.'}</p>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-gray-50 sticky top-0 text-xs text-gray-500 uppercase tracking-wide">
              <tr>
                <th className="text-left px-5 py-3">Name</th>
                <th className="text-left px-4 py-3">Phone</th>
                <th className="text-left px-4 py-3">Email</th>
                <th className="text-right px-4 py-3">Store Credit</th>
                <th className="text-right px-4 py-3">Bills</th>
                <th className="text-right px-4 py-3">Total Spent</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-50">
              {filtered.map(c => {
                const credit = c.storeCredit ?? 0;
                return (
                  <tr key={c.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-5 py-3">
                      <p className="font-medium text-gray-900">{c.name}</p>
                      {c.gstin && <p className="text-xs text-gray-400">GSTIN: {c.gstin}</p>}
                    </td>
                    <td className="px-4 py-3 text-gray-600">{c.phone}</td>
                    <td className="px-4 py-3 text-gray-500 text-xs">{c.email || '—'}</td>
                    <td className="px-4 py-3 text-right">
                      <span className={`font-semibold ${credit > 0 ? 'text-green-600' : 'text-gray-400'}`}>
                        {formatCurrency(credit)}
                      </span>
                      {' '}
                      <button
                        onClick={() => { setCreditCustomer(c); setCreditMode('add'); setCreditAmount(''); setCreditReason(''); }}
                        className="text-xs text-saffron-500 hover:underline ml-1"
                      >
                        Adjust
                      </button>
                    </td>
                    <td className="px-4 py-3 text-right text-gray-600">{c.totalBills ?? 0}</td>
                    <td className="px-4 py-3 text-right font-medium text-gray-800">{formatCurrency(c.totalSpent ?? 0)}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1 justify-end">
                        <button onClick={() => openEdit(c)} className="p-1.5 text-gray-400 hover:text-saffron-500 hover:bg-saffron-50 rounded-lg transition-colors">
                          <Pencil size={14} />
                        </button>
                        <button onClick={() => handleDelete(c)} className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors">
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* Add/Edit Customer Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={e => e.target === e.currentTarget && setShowModal(false)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg mx-4 max-h-[90vh] flex flex-col">
            <div className="flex items-center justify-between px-6 py-4 border-b">
              <h2 className="font-bold text-gray-900">{editing ? 'Edit Customer' : 'Add Customer'}</h2>
              <button onClick={() => setShowModal(false)}><X size={18} className="text-gray-400" /></button>
            </div>
            <div className="flex-1 overflow-y-auto p-6 space-y-4">
              <div>
                <label className="label">Full Name *</label>
                <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                  className="input" placeholder="e.g. Rajesh Kumar" />
              </div>
              <div>
                <label className="label">Phone Number *</label>
                <input value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))}
                  className="input" placeholder="e.g. 9876543210" type="tel" />
              </div>
              <div>
                <label className="label">Email</label>
                <input value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
                  className="input" placeholder="Optional" type="email" />
              </div>
              <div>
                <label className="label">Address</label>
                <input value={form.address} onChange={e => setForm(f => ({ ...f, address: e.target.value }))}
                  className="input" placeholder="Optional" />
              </div>
              <div>
                <label className="label">GSTIN</label>
                <input value={form.gstin} onChange={e => setForm(f => ({ ...f, gstin: e.target.value }))}
                  className="input" placeholder="Optional — for B2B customers" />
              </div>
              {!editing && (
                <div>
                  <label className="label">Opening Store Credit (₹)</label>
                  <input type="number" value={form.storeCredit} onChange={e => setForm(f => ({ ...f, storeCredit: parseFloat(e.target.value) || 0 }))}
                    className="input" placeholder="0" min="0" />
                </div>
              )}
            </div>
            <div className="px-6 pb-6 flex gap-3 border-t pt-4">
              <button onClick={() => setShowModal(false)} className="flex-1 py-2.5 border border-gray-200 rounded-xl text-sm text-gray-600 hover:bg-gray-50">Cancel</button>
              <button onClick={handleSave} disabled={saving}
                className="flex-1 py-2.5 bg-saffron-400 hover:bg-saffron-500 disabled:bg-gray-200 text-white font-semibold rounded-xl text-sm flex items-center justify-center gap-2 transition-colors">
                {saving ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> : <Check size={16} />}
                {editing ? 'Update Customer' : 'Add Customer'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Store Credit Adjust Modal */}
      {creditCustomer && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={e => e.target === e.currentTarget && setCreditCustomer(null)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm mx-4">
            <div className="flex items-center justify-between px-6 py-4 border-b">
              <div>
                <h2 className="font-bold text-gray-900 flex items-center gap-2"><CreditCard size={16} className="text-saffron-500" /> Adjust Store Credit</h2>
                <p className="text-xs text-gray-500 mt-0.5">{creditCustomer.name} · Current: <span className="font-semibold text-green-600">{formatCurrency(creditCustomer.storeCredit ?? 0)}</span></p>
              </div>
              <button onClick={() => setCreditCustomer(null)}><X size={18} className="text-gray-400" /></button>
            </div>
            <div className="p-6 space-y-4">
              <div className="flex rounded-xl overflow-hidden border border-gray-200">
                <button onClick={() => setCreditMode('add')} className={`flex-1 py-2 text-sm font-medium transition-colors ${creditMode === 'add' ? 'bg-green-500 text-white' : 'text-gray-500 hover:bg-gray-50'}`}>
                  + Add Credit
                </button>
                <button onClick={() => setCreditMode('remove')} className={`flex-1 py-2 text-sm font-medium transition-colors ${creditMode === 'remove' ? 'bg-red-500 text-white' : 'text-gray-500 hover:bg-gray-50'}`}>
                  − Remove Credit
                </button>
              </div>
              <div>
                <label className="label">Amount (₹)</label>
                <input type="number" value={creditAmount} onChange={e => setCreditAmount(e.target.value)}
                  className="input" placeholder="0.00" min="0" step="0.01" />
              </div>
              <div>
                <label className="label">Reason / Note</label>
                <input value={creditReason} onChange={e => setCreditReason(e.target.value)}
                  className="input" placeholder="Optional note" />
              </div>
            </div>
            <div className="px-6 pb-6 flex gap-3">
              <button onClick={() => setCreditCustomer(null)} className="flex-1 py-2.5 border border-gray-200 rounded-xl text-sm text-gray-600 hover:bg-gray-50">Cancel</button>
              <button onClick={handleCreditAdjust} disabled={creditSaving}
                className={`flex-1 py-2.5 text-white font-semibold rounded-xl text-sm flex items-center justify-center gap-2 transition-colors ${creditMode === 'add' ? 'bg-green-500 hover:bg-green-600' : 'bg-red-500 hover:bg-red-600'} disabled:bg-gray-200`}>
                {creditSaving ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> : <Check size={16} />}
                {creditMode === 'add' ? 'Add Credit' : 'Remove Credit'}
              </button>
            </div>
          </div>
        </div>
      )}

      <style>{`.label{display:block;font-size:11px;font-weight:600;color:#6b7280;margin-bottom:4px;text-transform:uppercase;letter-spacing:.04em}.input{width:100%;padding:8px 12px;border:1.5px solid #e5e7eb;border-radius:10px;font-size:13px;outline:none;transition:border-color .15s}.input:focus{border-color:#ff9933}`}</style>
    </div>
  );
}
