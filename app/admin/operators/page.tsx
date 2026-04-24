'use client';
import { useState, useEffect } from 'react';
import { Users, Plus, Pencil, Trash2, X, Check, Shield, Phone, Monitor } from 'lucide-react';
import toast, { Toaster } from 'react-hot-toast';
import { format } from 'date-fns';
import { Operator, POSMachine } from '@/types';
import { getOperators, createOperator, updateOperator, deleteOperator, getMachines } from '@/lib/admin-firestore';

const EMPTY = { name: '', pin: '', phone: '', assignedMachineId: '', assignedMachineName: '', isActive: true };

export default function OperatorsPage() {
  const [operators, setOperators] = useState<Operator[]>([]);
  const [machines, setMachines] = useState<POSMachine[]>([]);
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<Operator | null>(null);
  const [form, setForm] = useState(EMPTY);
  const [saving, setSaving] = useState(false);
  const [pinError, setPinError] = useState('');

  useEffect(() => { load(); }, []);

  async function load() {
    try {
      const [ops, macs] = await Promise.all([getOperators(), getMachines()]);
      setOperators(ops);
      setMachines(macs);
    } catch {}
  }

  function openAdd() { setEditing(null); setForm(EMPTY); setPinError(''); setShowModal(true); }
  function openEdit(op: Operator) {
    setEditing(op);
    setForm({ name: op.name, pin: op.pin, phone: op.phone || '', assignedMachineId: op.assignedMachineId || '', assignedMachineName: op.assignedMachineName || '', isActive: op.isActive });
    setPinError('');
    setShowModal(true);
  }

  function handlePinChange(val: string) {
    const digits = val.replace(/\D/g, '').slice(0, 2);
    setForm(f => ({ ...f, pin: digits }));
    if (digits.length === 2) {
      const conflict = operators.find(o => o.pin === digits && o.id !== editing?.id);
      setPinError(conflict ? `PIN ${digits} already used by ${conflict.name}` : '');
    } else {
      setPinError('');
    }
  }

  async function handleSave() {
    if (!form.name) { toast.error('Name is required'); return; }
    if (form.pin.length !== 2) { toast.error('PIN must be exactly 2 digits'); return; }
    if (pinError) { toast.error(pinError); return; }
    const machine = machines.find(m => m.id === form.assignedMachineId);
    setSaving(true);
    try {
      const data = {
        name: form.name,
        pin: form.pin,
        phone: form.phone,
        assignedMachineId: form.assignedMachineId || undefined,
        assignedMachineName: machine?.name || undefined,
        isActive: form.isActive,
      };
      if (editing) {
        await updateOperator(editing.id, data);
        toast.success('Operator updated');
      } else {
        await createOperator(data);
        toast.success('Operator created');
      }
      setShowModal(false);
      load();
    } catch { toast.error('Save failed'); }
    finally { setSaving(false); }
  }

  async function handleDelete(op: Operator) {
    if (!confirm(`Delete operator "${op.name}"?`)) return;
    try { await deleteOperator(op.id); toast.success('Deleted'); load(); }
    catch { toast.error('Delete failed'); }
  }

  async function toggleActive(op: Operator) {
    try {
      await updateOperator(op.id, { isActive: !op.isActive });
      load();
    } catch { toast.error('Failed'); }
  }

  return (
    <div className="flex-1 flex flex-col overflow-hidden bg-gray-50">
      <Toaster position="top-right" />

      {/* Header */}
      <div className="bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between flex-shrink-0">
        <div>
          <h1 className="text-lg font-bold text-gray-900">Operators</h1>
          <p className="text-xs text-gray-500">{operators.length} operators &nbsp;·&nbsp; <span className="text-green-600 font-medium">{operators.filter(o => o.isActive).length} active</span></p>
        </div>
        <button onClick={openAdd} className="flex items-center gap-1.5 px-4 py-2 bg-saffron-400 hover:bg-saffron-500 text-white rounded-lg text-sm font-semibold">
          <Plus size={14} /> Add Operator
        </button>
      </div>

      {/* Operator cards */}
      <div className="flex-1 overflow-y-auto p-6">
        {operators.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-64 text-gray-300">
            <Users size={48} className="mb-3" />
            <p className="text-base font-medium">No operators yet</p>
            <p className="text-sm mt-1">Add your first cashier / billing operator</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {operators.map(op => (
              <div key={op.id} className={`bg-white rounded-2xl border-2 shadow-sm overflow-hidden ${op.isActive ? 'border-gray-100' : 'border-gray-100 opacity-60'}`}>
                {/* Top strip */}
                <div className={`h-1.5 ${op.isActive ? 'bg-saffron-400' : 'bg-gray-200'}`} />
                <div className="p-5">
                  <div className="flex items-start gap-3 mb-4">
                    {/* Avatar */}
                    <div className="w-12 h-12 rounded-full bg-saffron-100 flex items-center justify-center flex-shrink-0">
                      <span className="text-saffron-700 font-bold text-lg">{op.name[0]?.toUpperCase()}</span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <h3 className="font-bold text-gray-900">{op.name}</h3>
                      {op.phone && <p className="text-xs text-gray-400 flex items-center gap-1 mt-0.5"><Phone size={10} /> {op.phone}</p>}
                    </div>
                    {/* PIN badge */}
                    <div className="flex flex-col items-center bg-gray-900 rounded-xl px-3 py-2 flex-shrink-0">
                      <span className="text-[9px] text-gray-400 uppercase tracking-widest">PIN</span>
                      <span className="text-white font-bold text-xl font-mono leading-tight">{op.pin}</span>
                    </div>
                  </div>

                  {/* Assigned machine */}
                  <div className={`flex items-center gap-2 rounded-xl px-3 py-2 mb-4 ${op.assignedMachineName ? 'bg-saffron-50' : 'bg-gray-50'}`}>
                    <Monitor size={14} className={op.assignedMachineName ? 'text-saffron-500' : 'text-gray-400'} />
                    <p className={`text-xs font-medium ${op.assignedMachineName ? 'text-saffron-700' : 'text-gray-400'}`}>
                      {op.assignedMachineName || 'No machine assigned'}
                    </p>
                  </div>

                  {/* Last login */}
                  {op.lastLoginAt && (
                    <p className="text-[11px] text-gray-400 mb-3">
                      Last login: {format(new Date(op.lastLoginAt), 'dd MMM yyyy, HH:mm')}
                    </p>
                  )}

                  {/* Actions */}
                  <div className="flex gap-2">
                    <button onClick={() => toggleActive(op)}
                      className={`flex-1 py-2 rounded-xl text-xs font-semibold transition-colors ${op.isActive ? 'bg-gray-100 text-gray-600 hover:bg-gray-200' : 'bg-green-100 text-green-700 hover:bg-green-200'}`}>
                      {op.isActive ? 'Deactivate' : 'Activate'}
                    </button>
                    <button onClick={() => openEdit(op)} className="p-2 text-gray-400 hover:text-saffron-500 hover:bg-saffron-50 rounded-xl transition-colors"><Pencil size={15} /></button>
                    <button onClick={() => handleDelete(op)} className="p-2 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-xl transition-colors"><Trash2 size={15} /></button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Add/Edit Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={e => e.target === e.currentTarget && setShowModal(false)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm mx-4">
            <div className="flex items-center justify-between px-6 py-4 border-b">
              <h2 className="font-bold text-gray-900">{editing ? 'Edit Operator' : 'Add Operator'}</h2>
              <button onClick={() => setShowModal(false)}><X size={18} /></button>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase mb-1">Full Name *</label>
                <input autoFocus value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                  placeholder="e.g. Rahul Kumar" className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:border-saffron-400" />
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase mb-1">2-Digit Login PIN *</label>
                <div className="relative">
                  <Shield className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={15} />
                  <input
                    type="text" inputMode="numeric" maxLength={2} value={form.pin}
                    onChange={e => handlePinChange(e.target.value)}
                    placeholder="00–99"
                    className={`w-full pl-9 pr-3 py-2.5 border rounded-xl text-sm focus:outline-none font-mono text-2xl tracking-[0.5em] text-center ${pinError ? 'border-red-300 focus:border-red-400' : 'border-gray-200 focus:border-saffron-400'}`}
                  />
                </div>
                {pinError ? (
                  <p className="text-xs text-red-500 mt-1">{pinError}</p>
                ) : (
                  <p className="text-xs text-gray-400 mt-1">Used by operator to login at POS machine</p>
                )}
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase mb-1">Phone (optional)</label>
                <input type="tel" value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value.replace(/\D/, '').slice(0, 10) }))}
                  placeholder="10-digit mobile" className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:border-saffron-400" />
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase mb-1">Assign Machine (optional)</label>
                <select value={form.assignedMachineId} onChange={e => setForm(f => ({ ...f, assignedMachineId: e.target.value }))}
                  className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:border-saffron-400">
                  <option value="">— No machine —</option>
                  {machines.map(m => <option key={m.id} value={m.id}>{m.name} {m.label ? `(${m.label})` : ''}</option>)}
                </select>
              </div>

              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={form.isActive} onChange={e => setForm(f => ({ ...f, isActive: e.target.checked }))}
                  className="w-4 h-4 accent-saffron-400" />
                <span className="text-sm text-gray-700">Active (can login)</span>
              </label>
            </div>
            <div className="px-6 pb-6 flex gap-3">
              <button onClick={() => setShowModal(false)} className="flex-1 py-2.5 border border-gray-200 rounded-xl text-sm text-gray-600">Cancel</button>
              <button onClick={handleSave} disabled={saving}
                className="flex-1 py-2.5 bg-saffron-400 hover:bg-saffron-500 text-white font-semibold rounded-xl text-sm flex items-center justify-center gap-2">
                {saving ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> : <Check size={16} />}
                {editing ? 'Update' : 'Create Operator'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
