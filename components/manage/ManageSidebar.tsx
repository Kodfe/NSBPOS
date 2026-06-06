'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { BarChart2, LayoutDashboard, LogOut, Monitor, Package, Receipt, Settings, ShoppingBag, Store, Tag, UserCircle, Users } from 'lucide-react';

interface Props {
  managerName: string;
  onLogout: () => void;
}

const NAV = [
  { href: '/manage/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/manage/products', label: 'Products', icon: Package },
  { href: '/manage/categories', label: 'Categories', icon: Tag },
  { href: '/manage/customers', label: 'Customers', icon: UserCircle },
  { href: '/manage/bills', label: 'Bills', icon: Receipt },
  { href: '/manage/purchases', label: 'Purchases', icon: ShoppingBag },
  { href: '/manage/reports', label: 'Reports', icon: BarChart2 },
  { href: '/manage/operators', label: 'Operators', icon: Users },
  { href: '/manage/machines', label: 'Machines', icon: Monitor },
  { href: '/manage/settings', label: 'Settings', icon: Settings },
];

export default function ManageSidebar({ managerName, onLogout }: Props) {
  const path = usePathname();

  return (
    <aside className="flex h-full w-56 flex-shrink-0 flex-col bg-gray-900">
      <div className="border-b border-gray-800 px-5 py-5">
        <div className="flex items-center gap-2.5">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-500">
            <Store size={16} className="text-white" />
          </div>
          <div>
            <p className="text-sm font-bold leading-tight text-white">Manage</p>
            <p className="text-[11px] text-gray-400">{managerName}</p>
          </div>
        </div>
      </div>

      <nav className="flex-1 space-y-1 overflow-y-auto px-3 py-4">
        {NAV.map(({ href, label, icon: Icon }) => {
          const active = path.startsWith(href);
          return (
            <Link
              key={href}
              href={href}
              className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition-all ${
                active ? 'bg-blue-500 text-white' : 'text-gray-400 hover:bg-gray-800 hover:text-white'
              }`}
            >
              <Icon size={18} />
              <span className="font-medium">{label}</span>
            </Link>
          );
        })}
      </nav>

      <div className="space-y-1 border-t border-gray-800 px-3 pb-4 pt-4">
        <Link href="/pos" className="flex items-center gap-3 rounded-xl px-3 py-2 text-sm text-gray-400 transition-all hover:bg-gray-800 hover:text-white">
          <Store size={16} />
          <span>Back to POS</span>
        </Link>
        <button
          onClick={onLogout}
          className="flex w-full items-center gap-3 rounded-xl px-3 py-2 text-sm text-gray-400 transition-all hover:bg-red-900/40 hover:text-red-400"
        >
          <LogOut size={16} />
          <span>Logout Manage</span>
        </button>
      </div>
    </aside>
  );
}
