'use client';
import { X } from 'lucide-react';

interface Props { onClose: () => void }

const SHORTCUTS = [
  { key: 'Alt + B', desc: 'POS billing search' },
  { key: 'F6', desc: 'Save & print bill' },
  { key: 'F7', desc: 'Save bill without printing' },
  { key: 'Arrow keys', desc: 'Move cursor up / down / right / left' },
  { key: 'Delete', desc: 'Delete selected or latest item' },
  { key: 'Esc', desc: 'Undo / return to previous page' },
  { key: 'P', desc: 'Change sale price of item' },
  { key: 'Q', desc: 'Change quantity of item' },
  { key: 'F2', desc: 'Focus search / barcode scanner' },
  { key: 'F3', desc: 'Open payment' },
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
            <div key={s.key} className="flex items-center justify-between gap-4 py-1">
              <kbd className="px-2.5 py-1 bg-gray-100 border border-gray-300 rounded-lg text-xs font-mono font-semibold whitespace-nowrap">{s.key}</kbd>
              <span className="text-sm text-gray-600 text-right">{s.desc}</span>
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
