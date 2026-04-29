'use client';
import { useState, useEffect } from 'react';
import { X, Scale, Delete } from 'lucide-react';
import { Product } from '@/types';

interface Props {
  product: Product;
  currentWeight?: number;
  onConfirm: (weightKg: number) => void;
  onClose: () => void;
}

const PRESETS = [
  { label: '100g', value: 0.1 },
  { label: '250g', value: 0.25 },
  { label: '500g', value: 0.5 },
  { label: '1 kg', value: 1 },
  { label: '2 kg', value: 2 },
  { label: '5 kg', value: 5 },
];

export default function WeightModal({ product, currentWeight, onConfirm, onClose }: Props) {
  const [input, setInput] = useState(currentWeight ? String(currentWeight) : '');

  // Focus trap — close on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      else if (e.key === 'Enter') {
        const w = parseFloat(input);
        if (w > 0) onConfirm(w);
      } else if (e.key === 'Backspace') {
        setInput(s => s.slice(0, -1));
      } else if (/^[0-9.]$/.test(e.key)) {
        handlePress(e.key);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [input]);

  function handlePress(key: string) {
    if (key === '.') {
      if (input.includes('.')) return;
      setInput(s => (s === '' ? '0.' : s + '.'));
      return;
    }
    // Max 3 decimal places
    if (input.includes('.') && input.split('.')[1]?.length >= 3) return;
    setInput(s => (s === '0' ? key : s + key));
  }

  function handleBackspace() {
    setInput(s => s.slice(0, -1));
  }

  function setPreset(val: number) {
    setInput(String(val));
  }

  const weight = parseFloat(input) || 0;
  const total = weight * product.price;
  const willGoNegativeBy = Math.max(0, weight - product.stock);
  const exceedsStock = false;
  const isValid = weight > 0;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 animate-fade-in"
      onClick={e => e.target === e.currentTarget && onClose()}
    >
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-xs mx-4 animate-slide-up overflow-hidden">

        {/* Header */}
        <div className="bg-saffron-400 px-5 py-4 flex items-start justify-between">
          <div>
            <div className="flex items-center gap-2 text-white">
              <Scale size={18} />
              <span className="font-bold text-base">Loose Item — Enter Weight</span>
            </div>
            <p className="text-white font-semibold mt-1 text-sm">{product.name}</p>
            <p className="text-saffron-100 text-xs mt-0.5">
              ₹{product.price}/kg &nbsp;·&nbsp; Stock: {product.stock} kg
            </p>
          </div>
          <button onClick={onClose} className="text-white/70 hover:text-white p-1">
            <X size={18} />
          </button>
        </div>

        {/* Weight display */}
        <div className="px-5 pt-4 pb-2">
          <div className={`flex items-center justify-between rounded-xl px-4 py-3 border-2 transition-colors ${
            willGoNegativeBy > 0 ? 'bg-red-50 border-red-300' :
            weight > 0 ? 'bg-saffron-50 border-saffron-300' : 'bg-gray-50 border-gray-200'
          }`}>
            <div className="flex items-baseline gap-1">
              <span className={`text-4xl font-bold font-mono tracking-tight ${willGoNegativeBy > 0 ? 'text-red-600' : 'text-gray-900'}`}>
                {input || '0'}
              </span>
              <span className="text-xl text-gray-400">kg</span>
            </div>
            <div className="text-right">
              <p className={`text-xl font-bold ${willGoNegativeBy > 0 ? 'text-red-500' : 'text-saffron-600'}`}>
                ₹{total.toFixed(2)}
              </p>
              {willGoNegativeBy > 0 && <p className="text-[11px] text-red-500 font-medium">Will be -{willGoNegativeBy.toFixed(3)} kg</p>}
            </div>
          </div>
        </div>

        {/* Preset buttons */}
        <div className="grid grid-cols-6 gap-1.5 px-5 pb-3">
          {PRESETS.map(p => (
            <button
              key={p.label}
              onClick={() => setPreset(p.value)}
              className={`py-1.5 rounded-lg text-xs font-semibold transition-all border ${
                weight === p.value
                  ? 'bg-saffron-400 text-white border-saffron-400'
                  : 'bg-gray-100 text-gray-600 border-transparent hover:bg-saffron-100 hover:text-saffron-700'
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>

        {/* Numpad */}
        <div className="grid grid-cols-3 gap-2 px-5 pb-4">
          {['1', '2', '3', '4', '5', '6', '7', '8', '9', '.', '0', 'back'].map(k => (
            <button
              key={k}
              onClick={() => k === 'back' ? handleBackspace() : handlePress(k)}
              className={`py-3.5 rounded-xl text-lg font-bold transition-all active:scale-95 select-none ${
                k === 'back'
                  ? 'bg-red-50 text-red-400 hover:bg-red-100'
                  : 'bg-gray-100 text-gray-800 hover:bg-saffron-100 hover:text-saffron-700'
              }`}
            >
              {k === 'back' ? <Delete size={20} className="mx-auto" /> : k}
            </button>
          ))}
        </div>

        {/* Confirm */}
        <div className="px-5 pb-5">
          <button
            onClick={() => isValid && onConfirm(weight)}
            disabled={!isValid}
            className="w-full py-3.5 bg-saffron-400 hover:bg-saffron-500 disabled:bg-gray-200 disabled:text-gray-400 text-white font-bold rounded-xl transition-colors text-sm"
          >
            {exceedsStock
              ? `Only ${product.stock} kg in stock`
              : weight > 0
              ? `Add ${weight} kg — ₹${total.toFixed(2)}`
              : 'Enter weight to continue'}
          </button>
        </div>
      </div>
    </div>
  );
}
