'use client';
import { useState } from 'react';
import { Store, Eye, EyeOff, ShieldCheck } from 'lucide-react';

// Change this password from the admin dashboard later
const ADMIN_PASSWORD = 'nsb@admin123';

interface Props { onLogin: () => void }

export default function AdminLogin({ onLogin }: Props) {
  const [password, setPassword] = useState('');
  const [show, setShow] = useState(false);
  const [error, setError] = useState('');
  const [shake, setShake] = useState(false);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (password === ADMIN_PASSWORD) {
      onLogin();
    } else {
      setError('Incorrect password');
      setShake(true);
      setTimeout(() => setShake(false), 600);
    }
  }

  return (
    <div className="h-screen flex items-center justify-center bg-gray-950">
      <div className={`bg-white rounded-2xl shadow-2xl w-full max-w-sm mx-4 overflow-hidden ${shake ? 'animate-[shake_0.5s_ease]' : ''}`}>
        {/* Header */}
        <div className="bg-saffron-400 px-8 py-8 text-center">
          <div className="w-14 h-14 rounded-2xl bg-white/20 flex items-center justify-center mx-auto mb-3">
            <Store size={28} className="text-white" />
          </div>
          <h1 className="text-xl font-bold text-white">NSB POS Admin</h1>
          <p className="text-saffron-100 text-sm mt-1">Enter your password to continue</p>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="px-8 py-7 space-y-4">
          <div>
            <label className="block text-xs font-semibold text-gray-500 mb-1.5 uppercase tracking-wide">
              Admin Password
            </label>
            <div className="relative">
              <ShieldCheck className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={16} />
              <input
                autoFocus
                type={show ? 'text' : 'password'}
                value={password}
                onChange={e => { setPassword(e.target.value); setError(''); }}
                placeholder="Enter password"
                className="w-full pl-9 pr-10 py-3 border-2 border-gray-200 rounded-xl text-sm focus:outline-none focus:border-saffron-400 transition-colors"
              />
              <button type="button" onClick={() => setShow(s => !s)} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                {show ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
            {error && <p className="text-red-500 text-xs mt-1.5">{error}</p>}
          </div>

          <button
            type="submit"
            className="w-full py-3 bg-saffron-400 hover:bg-saffron-500 text-white font-bold rounded-xl transition-colors text-sm"
          >
            Login to Admin Panel
          </button>

          <p className="text-center text-xs text-gray-400">
            Default: <code className="bg-gray-100 px-1.5 py-0.5 rounded text-gray-600">nsb@admin123</code>
          </p>
        </form>
      </div>

      <style>{`
        @keyframes shake {
          0%,100%{transform:translateX(0)}
          20%,60%{transform:translateX(-8px)}
          40%,80%{transform:translateX(8px)}
        }
      `}</style>
    </div>
  );
}
