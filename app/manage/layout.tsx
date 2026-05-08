'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import ManageSidebar from '@/components/manage/ManageSidebar';

const MANAGER_KEY = 'nsb_manager_auth';

type ManagerSession = {
  operatorId: string;
  operatorName: string;
};

export default function ManageLayout({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<ManagerSession | null>(null);
  const [checking, setChecking] = useState(true);
  const router = useRouter();

  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(MANAGER_KEY);
      setSession(raw ? JSON.parse(raw) : null);
    } catch {
      setSession(null);
    } finally {
      setChecking(false);
    }
  }, []);

  function logout() {
    sessionStorage.removeItem(MANAGER_KEY);
    router.replace('/pos');
  }

  if (checking) {
    return (
      <div className="flex h-screen items-center justify-center bg-gray-950">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-blue-500 border-t-transparent" />
      </div>
    );
  }

  if (!session) {
    return (
      <div className="flex h-screen flex-col items-center justify-center bg-gray-950 text-white">
        <p className="text-lg font-bold">Manager access required</p>
        <button onClick={() => router.replace('/pos')} className="mt-4 rounded-lg bg-blue-500 px-4 py-2 text-sm font-semibold">
          Back to POS
        </button>
      </div>
    );
  }

  return (
    <div className="flex h-screen overflow-hidden bg-gray-100">
      <ManageSidebar managerName={session.operatorName} onLogout={logout} />
      <main className="flex flex-1 flex-col overflow-hidden">{children}</main>
    </div>
  );
}
