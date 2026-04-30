'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  LayoutDashboard, Package, Monitor, Users, FileText,
  Store, ShoppingCart, LogOut, ChevronRight, Settings,
  UserCircle, Tag, Receipt, ShoppingBag, BarChart2, UploadCloud,
} from 'lucide-react';

const NAV = [
  { href: '/admin/dashboard',  label: 'Dashboard',    icon: LayoutDashboard, desc: 'Sales & analytics',      group: '' },
  { href: '/admin/products',   label: 'Products',     icon: Package,         desc: 'Manage inventory',       group: '' },
  { href: '/admin/billbook-migrator', label: 'BillBook Migrator', icon: UploadCloud, desc: 'Import old Excel stock', group: '' },
  { href: '/admin/categories', label: 'Categories',   icon: Tag,             desc: 'Add / edit categories',  group: '' },
  { href: '/admin/customers',  label: 'Customers',    icon: UserCircle,      desc: 'Customer accounts',      group: '' },
  { href: '/admin/bills',      label: 'Bills',        icon: Receipt,         desc: 'View & search bills',    group: '' },
  { href: '/admin/purchases',  label: 'Purchases',    icon: ShoppingBag,     desc: 'Vendors & purchase bills', group: 'purchase' },
  { href: '/admin/reports',    label: 'Reports',      icon: BarChart2,       desc: 'P&L & GST compliance',    group: 'purchase' },
  { href: '/admin/machines',   label: 'POS Machines', icon: Monitor,         desc: 'Counters & sessions',    group: 'ops' },
  { href: '/admin/operators',  label: 'Operators',    icon: Users,           desc: 'Staff & PINs',           group: 'ops' },
  { href: '/admin/logs',       label: 'Machine Logs', icon: FileText,        desc: 'Start / stop history',   group: 'ops' },
  { href: '/admin/settings',   label: 'Settings',     icon: Settings,        desc: 'Store & GST config',     group: 'ops' },
];

interface Props { onLogout: () => void }

export default function AdminSidebar({ onLogout }: Props) {
  const path = usePathname();

  return (
    <aside className="w-60 flex-shrink-0 bg-gray-900 flex flex-col h-full">
      {/* Brand */}
      <div className="px-5 py-5 border-b border-gray-800">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-saffron-400 flex items-center justify-center">
            <Store size={16} className="text-white" />
          </div>
          <div>
            <p className="text-white font-bold text-sm leading-tight">NSB POS</p>
            <p className="text-gray-400 text-[11px]">Admin Panel</p>
          </div>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 py-4 px-3 space-y-1 overflow-y-auto">
        {NAV.map(({ href, label, icon: Icon, desc }) => {
          const active = path.startsWith(href);
          return (
            <Link
              key={href}
              href={href}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all group ${
                active ? 'bg-saffron-400 text-white' : 'text-gray-400 hover:bg-gray-800 hover:text-white'
              }`}
            >
              <Icon size={18} className={active ? 'text-white' : 'text-gray-500 group-hover:text-saffron-400'} />
              <div className="flex-1 min-w-0">
                <p className={`text-sm font-medium leading-tight ${active ? 'text-white' : ''}`}>{label}</p>
                <p className={`text-[10px] truncate ${active ? 'text-saffron-100' : 'text-gray-600'}`}>{desc}</p>
              </div>
              {active && <ChevronRight size={14} className="text-saffron-200" />}
            </Link>
          );
        })}
      </nav>

      {/* Bottom links */}
      <div className="px-3 pb-4 space-y-1 border-t border-gray-800 pt-4">
        <Link href="/pos" className="flex items-center gap-3 px-3 py-2 rounded-xl text-gray-400 hover:bg-gray-800 hover:text-white transition-all text-sm">
          <ShoppingCart size={16} />
          <span>Go to POS</span>
        </Link>
        <button
          onClick={onLogout}
          className="w-full flex items-center gap-3 px-3 py-2 rounded-xl text-gray-400 hover:bg-red-900/40 hover:text-red-400 transition-all text-sm"
        >
          <LogOut size={16} />
          <span>Logout</span>
        </button>
      </div>
    </aside>
  );
}
