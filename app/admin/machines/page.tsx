'use client';
import { useState, useEffect } from 'react';
import { Monitor, Plus, Play, Square, Users, Clock, Pencil, Trash2, X, Check, Wifi, WifiOff } from 'lucide-react';
import toast, { Toaster } from 'react-hot-toast';
import { format, formatDistanceToNow } from 'date-fns';
import { POSMachine, Operator } from '@/types';
import { getMachines, createMachine, updateMachine, deleteMachine, startMachineSession, stopMachineSession, getOperators } from '@/lib/admin-firestore';

export default function MachinesPage() {
  const [machines, setMachines] = useState<POSMachine[]>([]);
  const [operators, setOperators] = useState<Operator[]>([]);
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<POSMachine | null>(null);
  const [form, setForm] = useState({ name: '', label: '', location: '' });
  const [saving, setSaving] = useState(false);
  const [showStartModal, setShowStartModal] = useState<POSMachine | null>(null);
  const [selectedOperator, setSelectedOperator] = useState('');
  const [starting, setStarting] = useState(false);

  useEffect(() => { load(); }, []);

  async function load() {
    try {
      const [m, o] = await Promise.all([getMachines(), getOperators()]);
      setMachines(m);
      const activeOperatorIds = new Set(m.filter(machine => machine.isActive && machine.currentOperatorId).map(machine => machine.currentOperatorId));
      setOperators(o.filter(op => op.isActive && !activeOperatorIds.has(op.id)));
    } catch {
      // offline — show empty
    }
  }

  function openAdd() { setEditing(null); setForm({ name: '', label: '', location: '' }); setShowModal(true); }
  function openEdit(m: POSMachine) { setEditing(m); setForm({ name: m.name, label: m.label, location: m.location || '' }); setShowModal(true); }

  async function handleSave() {
    if (!form.name) { toast.error('Machine name is required'); return; }
    setSaving(true);
    try {
      if (editing) {
        await updateMachine(editing.id, { name: form.name, label: form.label, location: form.location });
        toast.success('Machine updated');
      } else {
        const count = machines.length + 1;
        await createMachine({ name: form.name || `Machine ${count}`, label: form.label, location: form.location, isActive: false });
        toast.success('Machine created');
      }
      setShowModal(false);
      load();
    } catch { toast.error('Save failed'); }
    finally { setSaving(false); }
  }

  async function handleDelete(m: POSMachine) {
    if (m.isActive) { toast.error('Stop the session first'); return; }
    if (!confirm(`Delete "${m.name}"?`)) return;
    try { await deleteMachine(m.id); toast.success('Deleted'); load(); }
    catch { toast.error('Delete failed'); }
  }

  async function handleStart() {
    if (!showStartModal || !selectedOperator) { toast.error('Select an operator'); return; }
    const op = operators.find(o => o.id === selectedOperator);
    if (!op) return;
    setStarting(true);
    try {
      const activeOperatorMachine = machines.find(m => m.isActive && m.currentOperatorId === op.id && m.id !== showStartModal.id);
      if (activeOperatorMachine) {
        toast.error(`${op.name} is already active on ${activeOperatorMachine.name}`);
        return;
      }
      await startMachineSession(showStartModal, op);
      toast.success(`Session started — ${op.name} on ${showStartModal.name}`);
      setShowStartModal(null);
      setSelectedOperator('');
      load();
    } catch { toast.error('Failed to start session'); }
    finally { setStarting(false); }
  }

  async function handleStop(m: POSMachine) {
    if (!confirm(`Stop session on ${m.name}?`)) return;
    try {
      await stopMachineSession(m, 0, 0);
      toast.success('Session stopped');
      load();
    } catch { toast.error('Failed to stop session'); }
  }

  const activeMachines = machines.filter(m => m.isActive).length;

  return (
    <div className="flex-1 flex flex-col overflow-hidden bg-gray-50">
      <Toaster position="top-right" />

      {/* Header */}
      <div className="bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between flex-shrink-0">
        <div>
          <h1 className="text-lg font-bold text-gray-900">POS Machines</h1>
          <p className="text-xs text-gray-500">{machines.length} machines &nbsp;·&nbsp; <span className="text-green-600 font-medium">{activeMachines} active</span></p>
        </div>
        <button onClick={openAdd} className="flex items-center gap-1.5 px-4 py-2 bg-saffron-400 hover:bg-saffron-500 text-white rounded-lg text-sm font-semibold">
          <Plus size={14} /> Add Machine
        </button>
      </div>

      {/* Machine grid */}
      <div className="flex-1 overflow-y-auto p-6">
        {machines.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-64 text-gray-300">
            <Monitor size={48} className="mb-3" />
            <p className="text-base font-medium">No machines yet</p>
            <p className="text-sm mt-1">Add your first POS counter above</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {machines.map(m => (
              <MachineCard
                key={m.id}
                machine={m}
                onStart={() => { setShowStartModal(m); setSelectedOperator(''); }}
                onStop={() => handleStop(m)}
                onEdit={() => openEdit(m)}
                onDelete={() => handleDelete(m)}
              />
            ))}
          </div>
        )}
      </div>

      {/* Add/Edit Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={e => e.target === e.currentTarget && setShowModal(false)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm mx-4">
            <div className="flex items-center justify-between px-6 py-4 border-b">
              <h2 className="font-bold text-gray-900">{editing ? 'Edit Machine' : 'Add New Machine'}</h2>
              <button onClick={() => setShowModal(false)}><X size={18} /></button>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase mb-1">Machine Name *</label>
                <input autoFocus value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                  placeholder="e.g. Machine 1" className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:border-saffron-400" />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase mb-1">Label / Counter Name</label>
                <input value={form.label} onChange={e => setForm(f => ({ ...f, label: e.target.value }))}
                  placeholder="e.g. Counter 1 – Fruits & Veg" className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:border-saffron-400" />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase mb-1">Location</label>
                <input value={form.location} onChange={e => setForm(f => ({ ...f, location: e.target.value }))}
                  placeholder="e.g. Ground floor, Aisle 2" className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:border-saffron-400" />
              </div>
            </div>
            <div className="px-6 pb-6 flex gap-3">
              <button onClick={() => setShowModal(false)} className="flex-1 py-2.5 border border-gray-200 rounded-xl text-sm text-gray-600">Cancel</button>
              <button onClick={handleSave} disabled={saving}
                className="flex-1 py-2.5 bg-saffron-400 hover:bg-saffron-500 text-white font-semibold rounded-xl text-sm flex items-center justify-center gap-2">
                {saving ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> : <Check size={16} />}
                {editing ? 'Update' : 'Create Machine'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Start Session Modal */}
      {showStartModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={e => e.target === e.currentTarget && setShowStartModal(null)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm mx-4">
            <div className="bg-saffron-400 px-6 py-5 rounded-t-2xl">
              <div className="flex items-center gap-2 text-white mb-1">
                <Play size={18} />
                <h2 className="font-bold">Start Session</h2>
              </div>
              <p className="text-saffron-100 text-sm">{showStartModal.name} — {showStartModal.label}</p>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase mb-2">Assign Operator</label>
                {operators.length === 0 ? (
                  <p className="text-sm text-amber-600 bg-amber-50 px-3 py-2 rounded-xl">No active operators. Add operators first.</p>
                ) : (
                  <div className="space-y-2">
                    {operators.map(op => (
                      <button key={op.id} onClick={() => setSelectedOperator(op.id)}
                        className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl border-2 transition-all ${selectedOperator === op.id ? 'border-saffron-400 bg-saffron-50' : 'border-gray-100 hover:border-gray-200'}`}>
                        <div className="w-9 h-9 rounded-full bg-saffron-100 flex items-center justify-center text-saffron-700 font-bold text-sm">
                          {op.name[0]}
                        </div>
                        <div className="text-left">
                          <p className="text-sm font-semibold text-gray-800">{op.name}</p>
                          <p className="text-xs text-gray-400">PIN: {op.pin} {op.assignedMachineName ? `· ${op.assignedMachineName}` : ''}</p>
                        </div>
                        {selectedOperator === op.id && <Check size={16} className="ml-auto text-saffron-500" />}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
            <div className="px-6 pb-6 flex gap-3">
              <button onClick={() => setShowStartModal(null)} className="flex-1 py-2.5 border border-gray-200 rounded-xl text-sm text-gray-600">Cancel</button>
              <button onClick={handleStart} disabled={!selectedOperator || starting}
                className="flex-1 py-2.5 bg-green-500 hover:bg-green-600 disabled:bg-gray-200 text-white font-bold rounded-xl text-sm flex items-center justify-center gap-2">
                {starting ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> : <Play size={16} />}
                Start Session
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function MachineCard({ machine, onStart, onStop, onEdit, onDelete }: {
  machine: POSMachine;
  onStart: () => void; onStop: () => void;
  onEdit: () => void; onDelete: () => void;
}) {
  return (
    <div className={`bg-white rounded-2xl border-2 shadow-sm overflow-hidden transition-all ${machine.isActive ? 'border-green-200' : 'border-gray-100'}`}>
      {/* Status bar */}
      <div className={`px-4 py-2 flex items-center justify-between ${machine.isActive ? 'bg-green-50' : 'bg-gray-50'}`}>
        <div className="flex items-center gap-2">
          <div className={`w-2 h-2 rounded-full ${machine.isActive ? 'bg-green-500 animate-pulse' : 'bg-gray-300'}`} />
          <span className={`text-xs font-semibold ${machine.isActive ? 'text-green-700' : 'text-gray-500'}`}>
            {machine.isActive ? 'Session Active' : 'Idle'}
          </span>
        </div>
        <div className="flex gap-1">
          <button onClick={onEdit} className="p-1 text-gray-400 hover:text-saffron-500 rounded transition-colors"><Pencil size={12} /></button>
          <button onClick={onDelete} className="p-1 text-gray-400 hover:text-red-500 rounded transition-colors"><Trash2 size={12} /></button>
        </div>
      </div>

      <div className="p-5">
        <div className="flex items-start gap-3 mb-4">
          <div className={`w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0 ${machine.isActive ? 'bg-green-100' : 'bg-gray-100'}`}>
            <Monitor size={22} className={machine.isActive ? 'text-green-600' : 'text-gray-400'} />
          </div>
          <div>
            <h3 className="font-bold text-gray-900">{machine.name}</h3>
            {machine.label && <p className="text-xs text-gray-500 mt-0.5">{machine.label}</p>}
            {machine.location && <p className="text-xs text-gray-400">{machine.location}</p>}
          </div>
        </div>

        {machine.isActive ? (
          <div className="space-y-2 mb-4">
            <div className="flex items-center gap-2 bg-green-50 rounded-xl px-3 py-2">
              <Users size={14} className="text-green-600" />
              <div>
                <p className="text-xs font-semibold text-green-800">{machine.currentOperatorName}</p>
                <p className="text-[10px] text-green-600">
                  Started {machine.sessionStartedAt ? formatDistanceToNow(new Date(machine.sessionStartedAt), { addSuffix: true }) : ''}
                </p>
              </div>
            </div>
          </div>
        ) : (
          <p className="text-xs text-gray-400 mb-4">No active session</p>
        )}

        <div className="flex gap-2">
          {machine.isActive ? (
            <button onClick={onStop} className="flex-1 flex items-center justify-center gap-1.5 py-2.5 bg-red-50 hover:bg-red-100 text-red-600 rounded-xl text-sm font-semibold transition-colors">
              <Square size={14} /> Stop Session
            </button>
          ) : (
            <button onClick={onStart} className="flex-1 flex items-center justify-center gap-1.5 py-2.5 bg-green-50 hover:bg-green-100 text-green-700 rounded-xl text-sm font-semibold transition-colors">
              <Play size={14} /> Start Session
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
