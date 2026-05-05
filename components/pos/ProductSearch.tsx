'use client';
import { useState, useRef, useEffect, useCallback } from 'react';
import { Search, ScanBarcode, X } from 'lucide-react';
import { Product, Category } from '@/types';
import { normalizeBarcode } from '@/lib/utils';
import WeightModal from './WeightModal';

interface Props {
  products: Product[];
  categories: Category[];
  modeLabel?: string;
  hiddenProductCount?: number;
  onAddItem: (product: Product) => void;
  onAddLooseItem: (product: Product, weightKg: number) => void;
  onBarcodeSearch: (barcode: string) => void;
  onCreateProduct?: (seed?: Partial<Product>) => void;
}

export default function ProductSearch({
  products,
  categories,
  modeLabel,
  hiddenProductCount = 0,
  onAddItem,
  onAddLooseItem,
  onBarcodeSearch,
  onCreateProduct,
}: Props) {
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('All');
  const [weightProduct, setWeightProduct] = useState<Product | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const barcodeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    searchRef.current?.focus();
  }, []);

  const submitBarcode = useCallback((value: string) => {
    const barcode = normalizeBarcode(value);
    if (!barcode) return;
    if (barcodeTimerRef.current) {
      clearTimeout(barcodeTimerRef.current);
      barcodeTimerRef.current = null;
    }
    setSearch('');
    onBarcodeSearch(barcode);
  }, [onBarcodeSearch]);

  const handleSearchChange = (val: string) => {
    setSearch(val);
    if (barcodeTimerRef.current) {
      clearTimeout(barcodeTimerRef.current);
      barcodeTimerRef.current = null;
    }

    const barcode = normalizeBarcode(val);
    if (/^\d{8,}$/.test(barcode)) {
      barcodeTimerRef.current = setTimeout(() => submitBarcode(barcode), 200);
    }
  };

  useEffect(() => {
    return () => {
      if (barcodeTimerRef.current) clearTimeout(barcodeTimerRef.current);
    };
  }, []);

  function handleProductClick(product: Product) {
    if (product.isLoose) {
      setWeightProduct(product);
    } else {
      onAddItem(product);
    }
  }

  const normalizedSearch = search.trim().toLowerCase().replace(/\s+/g, ' ');
  const categoryProducts = products.filter(product => category === 'All' || product.category === category);
  const exactProducts = normalizedSearch
    ? categoryProducts.filter(product =>
        product.name.trim().toLowerCase().replace(/\s+/g, ' ') === normalizedSearch ||
        normalizeBarcode(product.barcode) === normalizeBarcode(search)
      )
    : [];
  const filtered = exactProducts.length > 0 ? exactProducts : categoryProducts.filter(product => {
    const matchSearch = !normalizedSearch ||
      product.name.toLowerCase().includes(normalizedSearch) ||
      (product.brand ?? '').toLowerCase().includes(normalizedSearch) ||
      (product.barcode ?? '').includes(search.trim());
    return matchSearch;
  });

  const createSeed = () => {
    const barcode = normalizeBarcode(search);
    if (/^\d{4,}$/.test(barcode)) return { barcode };
    return search.trim() ? { name: search.trim() } : undefined;
  };

  return (
    <div className="flex h-full flex-col bg-white">
      <div className="border-b border-gray-200 bg-white p-3">
        {modeLabel && (
          <div className="mb-2 flex items-center justify-between rounded-lg border border-orange-100 bg-orange-50 px-3 py-2">
            <div>
              <p className="text-xs font-bold text-orange-700">{modeLabel}</p>
              <p className="text-[11px] text-orange-500">Loaded bill items are in cart. Product list shows rest items for exchange or add-on sale.</p>
            </div>
            {hiddenProductCount > 0 && (
              <span className="rounded-full bg-white px-2 py-0.5 text-[10px] font-semibold text-orange-600">
                {hiddenProductCount} in cart
              </span>
            )}
          </div>
        )}
        <div className="flex overflow-hidden rounded-lg border border-gray-300 bg-white focus-within:border-saffron-400 focus-within:ring-2 focus-within:ring-saffron-100">
          <select
            value={category}
            onChange={event => setCategory(event.target.value)}
            className="w-32 border-r border-gray-200 bg-gray-50 px-3 text-sm text-gray-700 outline-none"
          >
            <option value="All">Category</option>
            {categories.map(cat => <option key={cat.id} value={cat.name}>{cat.name}</option>)}
          </select>
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={15} />
            <input
              ref={searchRef}
              value={search}
              onChange={event => handleSearchChange(event.target.value)}
              onKeyDown={event => {
                if (event.key === 'Enter') {
                  event.preventDefault();
                  submitBarcode(search);
                }
              }}
              placeholder="Search item name, item code, or scan barcode"
              className="w-full border-0 py-2.5 pl-9 pr-16 text-sm outline-none"
            />
            <div className="absolute right-2 top-1/2 flex -translate-y-1/2 items-center gap-2 text-gray-400">
              <ScanBarcode size={15} />
              {search && (
                <button onClick={() => setSearch('')} className="rounded p-0.5 hover:bg-gray-100" title="Clear">
                  <X size={14} />
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto scrollbar-thin bg-white">
        <div className="min-w-[780px] overflow-hidden border-b border-gray-200">
          <div className="grid grid-cols-[48px_minmax(260px,1.8fr)_160px_90px_90px_120px] bg-gray-50 text-[11px] font-bold uppercase tracking-wide text-gray-500">
            <div className="border-r border-gray-200 px-3 py-3">No</div>
            <div className="border-r border-gray-200 px-3 py-3">Items</div>
            <div className="border-r border-gray-200 px-3 py-3">Item Code</div>
            <div className="border-r border-gray-200 px-3 py-3 text-right">MRP</div>
            <div className="border-r border-gray-200 px-3 py-3 text-right">SP</div>
            <div className="px-3 py-3 text-right">Stock</div>
          </div>

          {filtered.map((product, index) => (
            <ProductRow
              key={product.id}
              index={index + 1}
              product={product}
              onClick={handleProductClick}
            />
          ))}

          {onCreateProduct && (
            <div
              role="button"
              tabIndex={0}
              onClick={() => onCreateProduct(createSeed())}
              onKeyDown={event => { if (event.key === 'Enter') onCreateProduct(createSeed()); }}
              className="m-2 cursor-pointer rounded-lg border border-dashed border-blue-300 px-3 py-2 text-center text-sm font-semibold text-blue-600 hover:bg-blue-50"
            >
              + Create Item
            </div>
          )}
        </div>

        {filtered.length === 0 && (
          <div className="flex h-44 flex-col items-center justify-center text-gray-400">
            <ScanBarcode size={38} className="mb-2 opacity-30" />
            <p className="text-sm">No matching products</p>
          </div>
        )}

        <div className="flex h-40 items-center justify-center text-sm text-gray-400">
          Click an item row to add it to the bill.
        </div>
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

function ProductRow({ product, index, onClick }: { product: Product; index: number; onClick: (product: Product) => void }) {
  const isLowStock = product.stock <= (product.minStock || 5);
  const isNegativeStock = product.stock < 0;

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => onClick(product)}
      onKeyDown={event => { if (event.key === 'Enter') onClick(product); }}
      className="grid cursor-pointer grid-cols-[48px_minmax(260px,1.8fr)_160px_90px_90px_120px] border-t border-gray-100 text-sm hover:bg-saffron-50/60"
    >
      <div className="border-r border-gray-100 px-3 py-3 text-gray-600">{index}</div>
      <div className="min-w-0 border-r border-gray-100 px-3 py-3">
        <div className="flex min-w-0 items-center gap-2">
          <p className="truncate font-medium text-gray-900">{product.name}</p>
          {product.isLoose && (
            <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-amber-700">
              Loose
            </span>
          )}
        </div>
        <p className="mt-0.5 text-[11px] text-gray-500">
          {product.category || 'Uncategorized'}{product.brand ? ` - ${product.brand}` : ''}
        </p>
      </div>
      <div className="border-r border-gray-100 px-3 py-3 font-mono text-xs text-gray-700">{product.barcode || '-'}</div>
      <div className="border-r border-gray-100 px-3 py-3 text-right text-gray-700">&#8377;{product.mrp || product.price}</div>
      <div className="border-r border-gray-100 px-3 py-3 text-right font-semibold text-gray-900">&#8377;{product.price}</div>
      <div className={`px-3 py-3 text-right font-medium ${isNegativeStock ? 'text-red-600' : isLowStock ? 'text-amber-600' : 'text-green-600'}`}>
        {product.stock} {product.unit}
      </div>
    </div>
  );
}
