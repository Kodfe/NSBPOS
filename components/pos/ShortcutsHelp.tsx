'use client';
import { X } from 'lucide-react';

interface Props { onClose: () => void }

const SHORTCUTS = [
  { key: 'F2', desc: 'Focus search / barcode scanner' },
  { key: 'F3', desc: 'Open payment' },
  { key: 'F4', desc: 'Add new bill tab' },
  { key: 'F5', desc: 'Hold current bill' },
  { key: 'F6', desc: 'Clear current bill' },
  { key: 'F7', desc: 'Add / edit customer' },
  { key: 'Esc', desc: 'Close modals' },
  { key: '1–5', desc: 'Switch bill tabs' },
  { key: 'Del', desc: 'Remove selected item' },
];

export default function ShortcutsHelp({ onClose }: Props) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm mx-4">
        <div className="flex items-center justify-between px-6 py-4 border-b">
          <h2 className="font-bold text-gray-900">Keyboard Shortcuts</h2>
          <button onClick={onClose}><X size={18} /></button>
        </div>
        <div className="p-4 space-y-2">
          {SHORTCUTS.map(s => (
            <div key={s.key} className="flex items-center justify-between py-1">
              <kbd className="px-2.5 py-1 bg-gray-100 border border-gray-300 rounded-lg text-xs font-mono font-semibold">{s.key}</kbd>
              <span className="text-sm text-gray-600">{s.desc}</span>
            </div>
          ))}
        </div>
        <div className="px-6 pb-4">
          <p className="text-xs text-gray-400 text-center">Press ? or F1 to show this help</p>
        </div>
      </div>
    </div>
  );
}
