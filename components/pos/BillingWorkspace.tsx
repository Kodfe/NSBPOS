'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Box, ChevronDown, ChevronUp, Plus, ScanBarcode, Search, Trash2, X } from 'lucide-react';
import { Bill, Category, Product } from '@/types';
import { normalizeBarcode } from '@/lib/utils';
import WeightModal from './WeightModal';

interface Props {
  bill: Bill;
  products: Product[];
  categories: Category[];
  modeLabel?: string;
  hiddenProductCount?: number;
  onAddItem: (product: Product) => void;
  onAddLooseItem: (product: Product, weightKg: number) => void;
  onBarcodeSearch: (barcode: string) => void;
  onCreateProduct?: (seed?: Partial<Product>) => void;
  onUpdateQuantity: (id: string, qty: number) => void;
  onUpdateDiscount: (id: string, discount: number, discountAmount?: number) => void;
  onRemoveItem: (id: string) => void;
  onClearBill: () => void;
}

export default function BillingWorkspace({
  bill,
  products,
  categories,
  modeLabel,
  hiddenProductCount = 0,
  onAddItem,
  onAddLooseItem,
  onBarcodeSearch,
  onCreateProduct,
  onUpdateQuantity,
  onUpdateDiscount,
  onRemoveItem,
  onClearBill,
}: Props) {
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('All');
  const [weightProduct, setWeightProduct] = useState<Product | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const barcodeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => { searchRef.current?.focus(); }, []);

  const submitBarcode = useCallback((value: string) => {
    const barcode = normalizeBarcode(value);
    if (!barcode) return;
    if (barcodeTimerRef.current) clearTimeout(barcodeTimerRef.current);
    barcodeTimerRef.current = null;
    setSearch('');
    onBarcodeSearch(barcode);
  }, [onBarcodeSearch]);

  function handleSearchChange(value: string) {
    setSearch(value);
    if (barcodeTimerRef.current) clearTimeout(barcodeTimerRef.current);
    const barcode = normalizeBarcode(value);
    if (/^\d{8,}$/.test(barcode)) {
      barcodeTimerRef.current = setTimeout(() => submitBarcode(barcode), 200);
    }
  }

  useEffect(() => () => {
    if (barcodeTimerRef.current) clearTimeout(barcodeTimerRef.current);
  }, []);

  function addProduct(product: Product) {
    if (product.isLoose) setWeightProduct(product);
    else onAddItem(product);
    setSearch('');
  }

  const filteredProducts = products
    .filter(product => {
      const term = search.trim().toLowerCase();
      const matchCategory = category === 'All' || product.category === category;
      const matchSearch = !term ||
        product.name.toLowerCase().includes(term) ||
        (product.brand ?? '').toLowerCase().includes(term) ||
        (product.barcode ?? '').includes(search.trim());
      return matchCategory && matchSearch;
    })
    .slice(0, search ? 8 : 0);

  const createSeed = () => {
    const barcode = normalizeBarcode(search);
    if (/^\d{4,}$/.test(barcode)) return { barcode };
    return search.trim() ? { name: search.trim() } : undefined;
  };

  return (
    <div className="flex h-full flex-col bg-white">
      <div className="border-b border-gray-200 bg-white px-4 py-3">
        <div className="mb-3 flex items-center gap-3">
          <button onClick={() => searchRef.current?.focus()} className="rounded border border-gray-200 px-3 py-2 text-xs font-semibold text-gray-700 hover:bg-gray-50">
            + New Item <span className="ml-4 text-gray-400">[CTRL + I]</span>
          </button>
          <button className="rounded border border-gray-200 px-3 py-2 text-xs font-semibold text-gray-500 hover:bg-gray-50">Change Price <span className="ml-10 text-gray-400">[P]</span></button>
          <button className="rounded border border-gray-200 px-3 py-2 text-xs font-semibold text-gray-500 hover:bg-gray-50">Change QTY <span className="ml-10 text-gray-400">[Q]</span></button>
          <button onClick={() => bill.items[0] && onRemoveItem(bill.items[bill.items.length - 1].product.id)} className="rounded border border-gray-200 px-3 py-2 text-xs font-semibold text-red-500 hover:bg-red-50">
            Delete Item <span className="ml-10 text-gray-400">[DEL]</span>
          </button>
        </div>

        {modeLabel && (
          <div className="mb-2 flex items-center justify-between rounded-lg border border-orange-100 bg-orange-50 px-3 py-2">
            <p className="text-xs font-bold text-orange-700">{modeLabel}</p>
            {hiddenProductCount > 0 && <span className="rounded-full bg-white px-2 py-0.5 text-[10px] font-semibold text-orange-600">{hiddenProductCount} in cart</span>}
          </div>
        )}

        <div className="relative">
          <div className="flex overflow-hidden rounded border border-gray-300 bg-white focus-within:border-blue-400 focus-within:ring-2 focus-within:ring-blue-100">
            <select value={category} onChange={e => setCategory(e.target.value)} className="w-32 border-r border-gray-200 bg-gray-50 px-3 text-sm text-gray-700 outline-none">
              <option value="All">Category</option>
              {categories.map(cat => <option key={cat.id} value={cat.name}>{cat.name}</option>)}
            </select>
            <input
              ref={searchRef}
              value={search}
              onChange={e => handleSearchChange(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  submitBarcode(search);
                }
              }}
              className="flex-1 border-0 px-4 py-2.5 text-sm outline-none"
              placeholder="Search item name, item code, or scan barcode"
            />
            <div className="flex items-center gap-2 px-3 text-gray-400">
              <span className="rounded border border-gray-200 px-1.5 py-0.5 text-[10px] text-gray-400">F1</span>
              {search && <button onClick={() => setSearch('')}><X size={15} /></button>}
            </div>
          </div>

          {search && (
            <div className="absolute z-30 mt-1 max-h-[330px] w-full overflow-y-auto rounded border border-gray-200 bg-white shadow-lg">
              <div className="grid grid-cols-[1fr_120px] bg-gray-50 px-3 py-2 text-[11px] font-semibold uppercase text-gray-500">
                <span>Item Name</span>
                <span className="text-right">Price</span>
              </div>
              {filteredProducts.map(product => (
                <button key={product.id} onClick={() => addProduct(product)} className="grid w-full grid-cols-[1fr_120px] border-t border-gray-100 px-3 py-2 text-left hover:bg-blue-50">
                  <span>
                    <span className="block text-sm text-gray-900">{product.name}</span>
                    <span className="text-[11px] text-gray-500">STOCK: {product.stock} {product.unit.toUpperCase()} &nbsp;&nbsp; PP: ₹{product.purchasePrice ?? 0}</span>
                  </span>
                  <span className="text-right text-sm font-semibold text-gray-900">₹{product.price}<span className="block text-[10px] font-normal text-gray-400">/{product.unit.toUpperCase()}</span></span>
                </button>
              ))}
              {onCreateProduct && (
                <button onClick={() => onCreateProduct(createSeed())} className="m-2 w-[calc(100%-16px)] rounded border border-dashed border-blue-300 px-3 py-2 text-center text-sm font-semibold text-blue-600 hover:bg-blue-50">
                  + Create Item
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      <div className="flex-1 overflow-auto bg-white">
        <div className="min-w-[820px]">
          <div className="grid grid-cols-[60px_minmax(260px,1fr)_180px_120px_120px_180px_180px_60px] border-b border-gray-300 bg-gray-50 text-[11px] font-bold uppercase tracking-wide text-gray-600">
            <div className="border-r border-gray-200 px-3 py-3">No</div>
            <div className="border-r border-gray-200 px-3 py-3">Items</div>
            <div className="border-r border-gray-200 px-3 py-3">Item Code</div>
            <div className="border-r border-gray-200 px-3 py-3 text-right">MRP</div>
            <div className="border-r border-gray-200 px-3 py-3 text-right">SP (₹)</div>
            <div className="border-r border-gray-200 px-3 py-3 text-right">Quantity</div>
            <div className="border-r border-gray-200 px-3 py-3 text-right">Amount (₹)</div>
            <div className="px-3 py-3" />
          </div>

          {bill.items.map((item, index) => (
            <div key={item.product.id} className="grid grid-cols-[60px_minmax(260px,1fr)_180px_120px_120px_180px_180px_60px] border-b border-gray-200 text-sm">
              <div className="border-r border-gray-100 px-3 py-3 text-gray-700">{index + 1}</div>
              <div className="min-w-0 border-r border-gray-100 px-3 py-3">
                <p className="truncate text-gray-900">{item.product.name}</p>
                {(item.discount > 0 || (item.discountAmount ?? 0) > 0) && (
                  <p className="mt-1 text-[11px] text-green-600">Discount: {item.discount > 0 ? `${item.discount}%` : ''}{item.discount > 0 && (item.discountAmount ?? 0) > 0 ? ' + ' : ''}{(item.discountAmount ?? 0) > 0 ? `₹${item.discountAmount}` : ''}</p>
                )}
              </div>
              <div className="border-r border-gray-100 px-3 py-3 font-mono text-xs text-gray-700">{item.product.barcode || '-'}</div>
              <div className="border-r border-gray-100 px-3 py-3 text-right">₹ {item.product.mrp || item.product.price}</div>
              <div className="border-r border-gray-100 px-3 py-3 text-right">₹ {item.product.price}</div>
              <div className="border-r border-gray-100 px-3 py-2 text-right">
                <div className="ml-auto flex w-28 items-center overflow-hidden rounded border border-gray-200 bg-gray-50">
                  <button onClick={() => onUpdateQuantity(item.product.id, item.quantity - 1)} className="px-2 py-1.5 hover:bg-gray-100"><ChevronDown size={13} /></button>
                  <input type="number" min={1} value={item.quantity} onChange={e => onUpdateQuantity(item.product.id, Math.max(1, parseFloat(e.target.value) || 1))} className="w-12 bg-white py-1.5 text-center text-sm outline-none" />
                  <button onClick={() => onUpdateQuantity(item.product.id, item.quantity + 1)} className="px-2 py-1.5 hover:bg-gray-100"><ChevronUp size={13} /></button>
                </div>
              </div>
              <div className="border-r border-gray-100 px-3 py-3 text-right font-semibold">₹ {item.total.toFixed(2)}</div>
              <div className="px-3 py-3 text-center">
                <button onClick={() => onRemoveItem(item.product.id)} className="text-red-300 hover:text-red-500"><Trash2 size={15} /></button>
              </div>
            </div>
          ))}

          {bill.items.length === 0 && (
            <div className="flex h-[520px] flex-col items-center justify-center text-slate-500">
              <Box size={54} className="mb-4 text-slate-400" />
              <p className="flex items-center gap-2 text-base"><Search size={18} /> Add items by searching item name or item code</p>
              <p className="my-3 text-base">Or</p>
              <p className="flex items-center gap-2 text-base"><ScanBarcode size={18} /> Simply scan barcode to add items</p>
            </div>
          )}
        </div>
      </div>

      <div className="flex items-center justify-between border-t border-gray-200 bg-white px-4 py-2 text-xs text-gray-500">
        <span>Total Items: {bill.items.length}</span>
        <button onClick={onClearBill} disabled={bill.items.length === 0} className="rounded border border-gray-200 px-3 py-1.5 text-red-500 disabled:opacity-40">
          Clear All Items <span className="ml-3 text-gray-400">[CTRL + C]</span>
        </button>
      </div>

      {weightProduct && (
        <WeightModal
          product={weightProduct}
          onConfirm={weight => { onAddLooseItem(weightProduct, weight); setWeightProduct(null); }}
          onClose={() => setWeightProduct(null)}
        />
      )}
    </div>
  );
}
