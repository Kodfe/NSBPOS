'use client';
import { useState, useRef, useEffect } from 'react';
import { Search, ScanBarcode, Scale } from 'lucide-react';
import { Product, Category } from '@/types';
import WeightModal from './WeightModal';

interface Props {
  products: Product[];
  categories: Category[];
  onAddItem: (product: Product) => void;
  onAddLooseItem: (product: Product, weightKg: number) => void;
  onBarcodeSearch: (barcode: string) => void;
}

export default function ProductSearch({ products, categories, onAddItem, onAddLooseItem, onBarcodeSearch }: Props) {
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('All');
  const [weightProduct, setWeightProduct] = useState<Product | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    searchRef.current?.focus();
  }, []);

  const iconMap = Object.fromEntries(categories.map(c => [c.name, c.icon ?? '📦']));
  const allTabs = [{ name: 'All', icon: '🛒' }, ...categories];

  const handleSearchChange = (val: string) => {
    setSearch(val);
    if (/^\d{8,}$/.test(val.trim())) {
      onBarcodeSearch(val.trim());
      setSearch('');
    }
  };

  function handleProductClick(product: Product) {
    if (product.isLoose) {
      setWeightProduct(product);
    } else {
      onAddItem(product);
    }
  }

  const filtered = products.filter(p => {
    const matchCat = category === 'All' || p.category === category;
    const matchSearch = !search || p.name.toLowerCase().includes(search.toLowerCase()) ||
      p.barcode?.includes(search) || p.brand?.toLowerCase().includes(search.toLowerCase());
    return matchCat && matchSearch;
  });

  return (
    <div className="flex flex-col h-full">
      {/* Search bar */}
      <div className="p-3 bg-white border-b border-gray-200">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={16} />
          <input
            ref={searchRef}
            value={search}
            onChange={e => handleSearchChange(e.target.value)}
            placeholder="Search products or scan barcode (F2)"
            className="w-full pl-9 pr-10 py-2.5 border border-gray-300 rounded-xl text-sm focus:outline-none focus:border-saffron-400 focus:ring-2 focus:ring-saffron-100"
          />
          <ScanBarcode className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400" size={16} />
        </div>
      </div>

      {/* Category tabs */}
      <div className="flex gap-1.5 px-3 py-2 bg-white border-b border-gray-100 overflow-x-auto scrollbar-thin">
        {allTabs.map(cat => (
          <button
            key={cat.name}
            onClick={() => setCategory(cat.name)}
            className={`flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium whitespace-nowrap transition-all ${
              category === cat.name
                ? 'bg-saffron-400 text-white'
                : 'bg-gray-100 text-gray-600 hover:bg-saffron-50 hover:text-saffron-700'
            }`}
          >
            <span>{cat.icon}</span> {cat.name}
          </button>
        ))}
      </div>

      {/* Product grid */}
      <div className="flex-1 overflow-y-auto scrollbar-thin p-3">
        {filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-48 text-gray-400">
            <ScanBarcode size={40} className="mb-2 opacity-30" />
            <p className="text-sm">No products found</p>
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 gap-2">
            {filtered.map(product => (
              <ProductCard key={product.id} product={product} iconMap={iconMap} onClick={handleProductClick} />
            ))}
          </div>
        )}
      </div>

      {/* Weight modal */}
      {weightProduct && (
        <WeightModal
          product={weightProduct}
          onConfirm={w => { onAddLooseItem(weightProduct, w); setWeightProduct(null); }}
          onClose={() => setWeightProduct(null)}
        />
      )}
    </div>
  );
}

function ProductCard({ product, iconMap, onClick }: { product: Product; iconMap: Record<string, string>; onClick: (p: Product) => void }) {
  const isLowStock = product.stock <= (product.minStock || 5);
  const isOutOfStock = product.stock === 0;
  const isLoose = product.isLoose === true;

  return (
    <button
      onClick={() => !isOutOfStock && onClick(product)}
      disabled={isOutOfStock}
      className={`relative flex flex-col p-3 bg-white rounded-xl border-2 text-left transition-all hover:shadow-md active:scale-[0.97] ${
        isOutOfStock
          ? 'border-gray-100 opacity-50 cursor-not-allowed'
          : isLoose
          ? 'border-amber-100 hover:border-amber-300 cursor-pointer'
          : 'border-gray-100 hover:border-saffron-300 cursor-pointer'
      }`}
    >
      {/* Loose badge */}
      {isLoose && !isOutOfStock && (
        <span className="absolute top-1.5 left-1.5 flex items-center gap-0.5 text-[10px] bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded-full font-medium">
          <Scale size={9} /> Loose
        </span>
      )}

      {/* Stock badge */}
      {isLowStock && !isOutOfStock && (
        <span className="absolute top-1.5 right-1.5 text-[10px] bg-red-100 text-red-600 px-1.5 py-0.5 rounded-full">
          Low
        </span>
      )}
      {isOutOfStock && (
        <span className="absolute top-1.5 right-1.5 text-[10px] bg-gray-200 text-gray-500 px-1.5 py-0.5 rounded-full">
          Out
        </span>
      )}

      {/* Icon */}
      <div className={`text-2xl mb-1.5 ${isLoose ? 'mt-4' : ''}`}>
        {iconMap[product.category] || '📦'}
      </div>

      <p className="text-xs font-semibold text-gray-800 leading-tight line-clamp-2 mb-1">{product.name}</p>
      {product.brand && <p className="text-[10px] text-gray-400 mb-1">{product.brand}</p>}

      <div className="mt-auto flex items-baseline justify-between">
        <div>
          <span className={`text-sm font-bold ${isLoose ? 'text-amber-600' : 'text-saffron-600'}`}>
            ₹{product.price}
          </span>
          {isLoose && <span className="text-[10px] text-amber-500 ml-0.5">/kg</span>}
        </div>
        {product.mrp > product.price && (
          <span className="text-[10px] text-gray-400 line-through">₹{product.mrp}</span>
        )}
      </div>

      {/* Stock row */}
      <div className="flex items-center justify-between mt-1 pt-1 border-t border-gray-50">
        {isLoose ? (
          <span className={`text-[10px] font-medium ${
            isOutOfStock ? 'text-gray-400' : isLowStock ? 'text-red-500' : 'text-green-600'
          }`}>
            Stock: {product.stock} kg
          </span>
        ) : (
          <span className={`text-[10px] font-medium ${
            isOutOfStock ? 'text-gray-400' : isLowStock ? 'text-red-500' : 'text-green-600'
          }`}>
            Stock: {product.stock} {product.unit}
          </span>
        )}
        {product.gstRate > 0 && (
          <span className="text-[10px] text-gray-400">GST {product.gstRate}%</span>
        )}
      </div>
    </button>
  );
}
