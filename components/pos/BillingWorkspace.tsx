'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Box, ChevronDown, ChevronUp, Percent, ScanBarcode, Search, Trash2, X } from 'lucide-react';
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
  onUpdateWeight: (id: string, weightKg: number) => void;
  onUpdatePrice: (id: string, price: number) => void;
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
  onUpdateWeight,
  onUpdatePrice,
  onUpdateDiscount,
  onRemoveItem,
  onClearBill,
}: Props) {
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('All');
  const [activeResultIndex, setActiveResultIndex] = useState(0);
  const [selectedProductId, setSelectedProductId] = useState<string | null>(null);
  const [weightProduct, setWeightProduct] = useState<Product | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const resultRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const discountPctRefs = useRef<Array<HTMLInputElement | null>>([]);
  const discountAmountRefs = useRef<Array<HTMLInputElement | null>>([]);
  const priceRefs = useRef<Array<HTMLInputElement | null>>([]);
  const qtyRefs = useRef<Array<HTMLInputElement | null>>([]);
  const barcodeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastBarcodeRef = useRef<{ value: string; at: number } | null>(null);

  useEffect(() => { searchRef.current?.focus(); }, []);

  useEffect(() => {
    if (!selectedProductId && bill.items.length > 0) {
      setSelectedProductId(bill.items[bill.items.length - 1].product.id);
      return;
    }
    if (selectedProductId && !bill.items.some(item => item.product.id === selectedProductId)) {
      setSelectedProductId(bill.items[bill.items.length - 1]?.product.id ?? null);
    }
  }, [bill.items, selectedProductId]);

  useEffect(() => {
    if (selectedProductId) document.body.dataset.posSelectedProductId = selectedProductId;
    else delete document.body.dataset.posSelectedProductId;
    return () => { delete document.body.dataset.posSelectedProductId; };
  }, [selectedProductId]);

  useEffect(() => {
    function handleWorkspaceKey(event: KeyboardEvent) {
      if (event.altKey && event.key.toLowerCase() === 'b') {
        event.preventDefault();
        searchRef.current?.focus();
        return;
      }
      const target = event.target as HTMLElement;
      const isTyping = target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT';
      if (isTyping) return;
      const lastIndex = Math.max(0, bill.items.length - 1);
      if (event.key.toLowerCase() === 'p') {
        event.preventDefault();
        priceRefs.current[lastIndex]?.focus();
      }
      if (event.key.toLowerCase() === 'q') {
        event.preventDefault();
        qtyRefs.current[lastIndex]?.focus();
      }
    }
    window.addEventListener('keydown', handleWorkspaceKey);
    return () => window.removeEventListener('keydown', handleWorkspaceKey);
  }, [bill.items.length]);

  const submitBarcode = useCallback((value: string) => {
    const barcode = normalizeBarcode(value);
    if (!barcode) return;
    if (barcodeTimerRef.current) clearTimeout(barcodeTimerRef.current);
    barcodeTimerRef.current = null;
    const now = Date.now();
    if (lastBarcodeRef.current?.value === barcode && now - lastBarcodeRef.current.at < 900) {
      setSearch('');
      return;
    }
    lastBarcodeRef.current = { value: barcode, at: now };
    setSearch('');
    onBarcodeSearch(barcode);
  }, [onBarcodeSearch]);

  function handleSearchChange(value: string) {
    setSearch(value);
    setActiveResultIndex(0);
    if (barcodeTimerRef.current) clearTimeout(barcodeTimerRef.current);
    const barcode = normalizeBarcode(value);
    if (/^\d{8,}$/.test(barcode)) {
      barcodeTimerRef.current = setTimeout(() => submitBarcode(barcode), 140);
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

  function updateLineQty(product: Product, value: number) {
    if (product.isLoose) onUpdateWeight(product.id, Math.max(0.01, value));
    else onUpdateQuantity(product.id, Math.max(1, value));
  }

  function focusCell(row: number, col: number) {
    const refs = [discountPctRefs, discountAmountRefs, priceRefs, qtyRefs];
    const safeRow = Math.max(0, Math.min(bill.items.length - 1, row));
    const safeCol = Math.max(0, Math.min(refs.length - 1, col));
    refs[safeCol].current[safeRow]?.focus();
    refs[safeCol].current[safeRow]?.select();
  }

  function handleCellKey(event: React.KeyboardEvent<HTMLInputElement>, row: number, col: number) {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      focusCell(row + 1, col);
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      if (row === 0) searchRef.current?.focus();
      else focusCell(row - 1, col);
    } else if (event.key === 'ArrowRight') {
      event.preventDefault();
      focusCell(row, col + 1);
    } else if (event.key === 'ArrowLeft') {
      event.preventDefault();
      focusCell(row, col - 1);
    } else if (event.key === 'Enter') {
      event.preventDefault();
      focusCell(Math.min(bill.items.length - 1, row + 1), col);
    } else if (event.key === 'Escape') {
      event.preventDefault();
      searchRef.current?.focus();
    } else if (event.key === 'Delete') {
      event.preventDefault();
      const item = bill.items[row];
      if (item) onRemoveItem(item.product.id);
    }
  }

  function stockStatus(product: Product, quantity = 0): 'negative' | 'low' | null {
    const remaining = (product.stock ?? 0) - quantity;
    if (remaining < 0) return 'negative';
    if (remaining <= (product.minStock ?? 5)) return 'low';
    return null;
  }

  function StockTag({ status }: { status: 'negative' | 'low' | null }) {
    if (!status) return null;
    return (
      <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${status === 'negative' ? 'bg-red-100 text-red-600' : 'bg-amber-100 text-amber-700'}`}>
        {status === 'negative' ? 'Neg stock' : 'Low stock'}
      </span>
    );
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

  useEffect(() => {
    resultRefs.current[activeResultIndex]?.scrollIntoView({ block: 'nearest' });
  }, [activeResultIndex, filteredProducts.length]);

  const createSeed = () => {
    const barcode = normalizeBarcode(search);
    if (/^\d{4,}$/.test(barcode)) return { barcode };
    return search.trim() ? { name: search.trim() } : undefined;
  };

  return (
    <div className="flex h-full flex-col bg-white">
      <div className="border-b border-gray-200 bg-white px-3 py-2">
        {modeLabel && (
          <div className="mb-2 flex items-center justify-between rounded border border-orange-100 bg-orange-50 px-3 py-1.5">
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
                  const barcode = normalizeBarcode(search);
                  if (/^\d{8,}$/.test(barcode)) submitBarcode(barcode);
                  else if (filteredProducts[activeResultIndex]) addProduct(filteredProducts[activeResultIndex]);
                  else submitBarcode(search);
                } else if (e.key === 'ArrowDown') {
                  e.preventDefault();
                  setActiveResultIndex(index => filteredProducts.length ? Math.min(filteredProducts.length - 1, index + 1) : 0);
                } else if (e.key === 'ArrowUp') {
                  e.preventDefault();
                  setActiveResultIndex(index => Math.max(0, index - 1));
                } else if (e.key === 'ArrowRight' && bill.items.length > 0) {
                  e.preventDefault();
                  focusCell(bill.items.length - 1, 3);
                } else if (e.key === 'Escape') {
                  e.preventDefault();
                  setSearch('');
                }
              }}
              className="flex-1 border-0 px-4 py-2 text-sm outline-none"
              placeholder="Search item name, item code, or scan barcode"
            />
            <div className="flex items-center gap-2 px-3 text-gray-400">
              <span title="F2 opens product search" className="rounded border border-gray-200 px-1.5 py-0.5 text-[10px] text-gray-400">F2</span>
              <button
                onClick={() => {
                  const targetId = selectedProductId ?? bill.items[bill.items.length - 1]?.product.id;
                  if (targetId) onRemoveItem(targetId);
                }}
                disabled={bill.items.length === 0}
                title="Delete selected item"
                className="rounded p-1 text-red-300 hover:bg-red-50 hover:text-red-500 disabled:opacity-30"
              >
                <Trash2 size={15} />
              </button>
              {search && <button onClick={() => setSearch('')}><X size={15} /></button>}
            </div>
          </div>

          {search && (
            <div className="absolute z-30 mt-1 max-h-[330px] w-full overflow-y-auto rounded border border-gray-200 bg-white shadow-lg">
              <div className="grid grid-cols-[1fr_120px] bg-gray-50 px-3 py-2 text-[11px] font-semibold uppercase text-gray-500">
                <span>Item Name</span>
                <span className="text-right">Price</span>
              </div>
              {filteredProducts.map((product, index) => (
                <button
                  key={product.id}
                  ref={el => { resultRefs.current[index] = el; }}
                  onMouseEnter={() => setActiveResultIndex(index)}
                  onClick={() => addProduct(product)}
                  className={`grid w-full grid-cols-[1fr_120px] border-t border-gray-100 px-3 py-2 text-left ${index === activeResultIndex ? 'bg-blue-50' : 'hover:bg-blue-50'}`}
                >
                  <span>
                    <span className="flex items-center gap-2 text-sm text-gray-900">
                      <span className="truncate">{product.name}</span>
                      {product.isLoose && (
                        <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-amber-700">
                          Loose
                        </span>
                      )}
                      <StockTag status={stockStatus(product)} />
                    </span>
                    <span className="text-[11px] text-gray-500">STOCK: {product.stock} {product.unit.toUpperCase()} &nbsp;&nbsp; PP: &#8377;{product.purchasePrice ?? 0}</span>
                  </span>
                  <span className="text-right text-sm font-semibold text-gray-900">&#8377;{product.price}<span className="block text-[10px] font-normal text-gray-400">/{product.unit.toUpperCase()}</span></span>
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
        <div className="min-w-[980px]">
          <div className="grid grid-cols-[54px_minmax(360px,1fr)_170px_105px_118px_180px_160px_48px] border-b border-gray-300 bg-gray-50 text-[11px] font-bold uppercase tracking-wide text-gray-600">
            <div className="border-r border-gray-200 px-3 py-3">No</div>
            <div className="border-r border-gray-200 px-3 py-3">Items</div>
            <div className="border-r border-gray-200 px-3 py-3">Item Code</div>
            <div className="border-r border-gray-200 px-3 py-3 text-right">MRP</div>
            <div className="border-r border-gray-200 px-3 py-3 text-right">SP (&#8377;)</div>
            <div className="border-r border-gray-200 px-3 py-3 text-right">Quantity</div>
            <div className="border-r border-gray-200 px-3 py-3 text-right">Amount (&#8377;)</div>
            <div className="px-3 py-3" />
          </div>

          {bill.items.map((item, index) => {
            const quantityValue = item.product.isLoose ? (item.weightKg ?? item.quantity) : item.quantity;
            const qtyStep = item.product.isLoose ? 0.05 : 1;
            const unitLabel = item.product.isLoose ? 'kg' : item.product.unit;
            const itemStockStatus = stockStatus(item.product, quantityValue);

            return (
              <div
                key={item.product.id}
                onClick={() => setSelectedProductId(item.product.id)}
                onFocusCapture={() => setSelectedProductId(item.product.id)}
                className={`grid grid-cols-[54px_minmax(360px,1fr)_170px_105px_118px_180px_160px_48px] border-b border-gray-200 text-sm ${selectedProductId === item.product.id ? 'bg-blue-50/70' : ''}`}
              >
                <div className="border-r border-gray-100 px-3 py-3 text-gray-700">{index + 1}</div>
                <div className="min-w-0 border-r border-gray-100 px-3 py-2">
                  <p className="truncate text-gray-900">{item.product.name}</p>
                  <div className="mt-1 flex flex-wrap items-center gap-2 text-[11px]">
                    {item.product.isLoose && <span className="rounded bg-amber-50 px-2 py-0.5 font-semibold text-amber-700">Loose item</span>}
                    <StockTag status={itemStockStatus} />
                    <label className="flex h-7 items-center gap-1 rounded border border-gray-200 bg-white px-2 focus-within:border-saffron-400">
                      <input
                        ref={el => { discountPctRefs.current[index] = el; }}
                        type="number"
                        min={0}
                        max={100}
                        value={item.discount}
                        onChange={e => onUpdateDiscount(item.product.id, Number(e.target.value), item.discountAmount ?? 0)}
                        onKeyDown={e => handleCellKey(e, index, 0)}
                        className="w-10 outline-none"
                      />
                      <Percent size={11} className="text-gray-400" />
                    </label>
                    <label className="flex h-7 items-center gap-1 rounded border border-gray-200 bg-white px-2 focus-within:border-saffron-400">
                      <span className="text-gray-400">&#8377;</span>
                      <input
                        ref={el => { discountAmountRefs.current[index] = el; }}
                        type="number"
                        min={0}
                        value={item.discountAmount ?? 0}
                        onChange={e => onUpdateDiscount(item.product.id, item.discount, Number(e.target.value))}
                        onKeyDown={e => handleCellKey(e, index, 1)}
                        className="w-14 outline-none"
                      />
                    </label>
                    {(item.discount > 0 || (item.discountAmount ?? 0) > 0) && <span className="font-semibold text-green-600">discount applied</span>}
                  </div>
                </div>
                <div className="border-r border-gray-100 px-3 py-3 font-mono text-xs text-gray-700">{item.product.barcode || '-'}</div>
                <div className="border-r border-gray-100 px-3 py-3 text-right">&#8377; {item.product.mrp || item.product.price}</div>
                <div className="border-r border-gray-100 px-3 py-2 text-right">
                  <input
                    ref={el => { priceRefs.current[index] = el; }}
                    type="number"
                    min={0}
                    value={item.product.price}
                    onChange={e => onUpdatePrice(item.product.id, parseFloat(e.target.value) || 0)}
                    onKeyDown={e => handleCellKey(e, index, 2)}
                    className="ml-auto w-24 rounded border border-transparent bg-transparent px-2 py-1 text-right outline-none focus:border-blue-300 focus:bg-white"
                  />
                </div>
                <div className="border-r border-gray-100 px-3 py-2 text-right">
                  <div className="ml-auto flex w-28 items-center overflow-hidden rounded border border-gray-200 bg-gray-50">
                    <button onClick={() => updateLineQty(item.product, quantityValue - qtyStep)} className="px-2 py-1.5 hover:bg-gray-100"><ChevronDown size={13} /></button>
                    <input
                      ref={el => { qtyRefs.current[index] = el; }}
                      type="number"
                      min={item.product.isLoose ? 0.01 : 1}
                      step={item.product.isLoose ? 0.01 : 1}
                      value={quantityValue}
                      onChange={e => updateLineQty(item.product, parseFloat(e.target.value) || (item.product.isLoose ? 0.01 : 1))}
                      onKeyDown={e => handleCellKey(e, index, 3)}
                      className="w-12 bg-white py-1.5 text-center text-sm outline-none"
                    />
                    <button onClick={() => updateLineQty(item.product, quantityValue + qtyStep)} className="px-2 py-1.5 hover:bg-gray-100"><ChevronUp size={13} /></button>
                  </div>
                  <div className="mt-0.5 text-[10px] uppercase text-gray-400">{unitLabel}</div>
                </div>
                <div className="border-r border-gray-100 px-3 py-3 text-right font-semibold">&#8377; {item.total.toFixed(2)}</div>
                <div className="px-3 py-3 text-center">
                  <button onClick={() => onRemoveItem(item.product.id)} className="text-red-300 hover:text-red-500" title="Delete item"><Trash2 size={15} /></button>
                </div>
              </div>
            );
          })}

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
        <span>Total Types: {bill.items.length}</span>
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
