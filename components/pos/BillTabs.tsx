'use client';
import { Plus, X, Pause } from 'lucide-react';
import { BillTab } from '@/types';

interface Props {
  tabs: BillTab[];
  activeTabId: string;
  onSelect: (id: string) => void;
  onAdd: () => void;
  onClose: (id: string) => void;
}

export default function BillTabs({ tabs, activeTabId, onSelect, onAdd, onClose }: Props) {
  return (
    <div className="flex items-center gap-1 px-3 py-2 bg-white border-b border-gray-200 overflow-x-auto">
      {tabs.map(tab => (
        <button
          key={tab.id}
          onClick={() => onSelect(tab.id)}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium whitespace-nowrap transition-all ${
            tab.id === activeTabId
              ? 'bg-saffron-400 text-white shadow-sm'
              : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
          }`}
        >
          {tab.bill.status === 'held' && <Pause size={12} />}
          {tab.label}
          {tab.bill.items.length > 0 && (
            <span className={`text-xs px-1 rounded-full ${tab.id === activeTabId ? 'bg-white/30' : 'bg-saffron-100 text-saffron-700'}`}>
              {tab.bill.items.length}
            </span>
          )}
          {tabs.length > 1 && (
            <span
              role="button"
              onClick={e => { e.stopPropagation(); onClose(tab.id); }}
              className="ml-0.5 hover:text-red-500 transition-colors"
            >
              <X size={12} />
            </span>
          )}
        </button>
      ))}
      {tabs.length < 5 && (
        <button
          onClick={onAdd}
          className="flex items-center gap-1 px-2 py-1.5 rounded-lg text-sm text-gray-500 hover:bg-gray-100 hover:text-saffron-600 transition-colors"
        >
          <Plus size={14} /> New
        </button>
      )}
    </div>
  );
}
