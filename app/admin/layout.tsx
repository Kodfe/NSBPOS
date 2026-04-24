'use client';
import { useState, useEffect } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import AdminSidebar from '@/components/admin/AdminSidebar';
import AdminLogin from '@/components/admin/AdminLogin';

const ADMIN_KEY = 'nsb_admin_auth';

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const [authed, setAuthed] = useState(false);
  const [checking, setChecking] = useState(true);
  const router = useRouter();

  useEffect(() => {
    const ok = sessionStorage.getItem(ADMIN_KEY) === 'true';
    setAuthed(ok);
    setChecking(false);
  }, []);

  function handleLogin() {
    sessionStorage.setItem(ADMIN_KEY, 'true');
    setAuthed(true);
  }

  function handleLogout() {
    sessionStorage.removeItem(ADMIN_KEY);
    setAuthed(false);
  }

  if (checking) {
    return (
      <div className="h-screen flex items-center justify-center bg-gray-950">
        <div className="w-8 h-8 border-4 border-saffron-400 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!authed) {
    return <AdminLogin onLogin={handleLogin} />;
  }

  return (
    <div className="h-screen flex overflow-hidden bg-gray-100">
      <AdminSidebar onLogout={handleLogout} />
      <main className="flex-1 flex flex-col overflow-hidden">
        {children}
      </main>
    </div>
  );
}
