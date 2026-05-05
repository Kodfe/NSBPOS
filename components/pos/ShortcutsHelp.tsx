'use client';
import { X } from 'lucide-react';

interface Props { onClose: () => void }

const SHORTCUTS = [
  { key: 'Enter', desc: 'Add selected item / confirm / print' },
  { key: 'Tab', desc: 'Move between fields' },
  { key: 'Esc', desc: 'Cancel action / close popup' },
  { key: 'Ctrl + S', desc: 'Save bill without printing' },
  { key: 'Ctrl + P', desc: 'Save & print bill' },
  { key: 'Ctrl + C', desc: 'Cancel invoice / clear bill' },
  { key: 'F2', desc: 'Open product search' },
  { key: 'Ctrl + F', desc: 'Search product / customer' },
  { key: 'Arrow keys', desc: 'Move up / down / left / right' },
  { key: 'Backspace / Del', desc: 'Remove selected or latest item' },
  { key: 'P', desc: 'Change sale price' },
  { key: 'Q', desc: 'Change quantity' },
  { key: 'Ctrl + Enter', desc: 'Quick checkout' },
  { key: 'F1 / ?', desc: 'Show shortcuts help' },
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
