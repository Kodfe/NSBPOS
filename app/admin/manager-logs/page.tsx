'use client';
import { useCallback, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { Download, Filter, FileText, Package, RefreshCw, ShoppingBag, UserCheck } from 'lucide-react';
import { format, formatDistanceToNow } from 'date-fns';
import toast, { Toaster } from 'react-hot-toast';
import type { ManagerLog, Operator } from '@/types';
import { getManagerLogs, getOperators } from '@/lib/admin-firestore';

type ModuleFilter = 'all' | ManagerLog['module'];

const MODULE_LABELS: Record<ManagerLog['module'], string> = {
  products: 'Products',
  purchases: 'Purchase Bills',
  parties: 'Parties',
  purchaseOrders: 'Purchase Orders',
  purchaseReturns: 'Purchase Returns',
  debitNotes: 'Debit Notes',
  operators: 'Operators',
  machines: 'Machines',
};

export default function ManagerLogsPage() {
  const [logs, setLogs] = useState<ManagerLog[]>([]);
  const [operators, setOperators] = useState<Operator[]>([]);
  const [operatorFilter, setOperatorFilter] = useState('');
  const [moduleFilter, setModuleFilter] = useState<ModuleFilter>('all');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [logRows, operatorRows] = await Promise.all([getManagerLogs(), getOperators()]);
      setLogs(logRows);
      setOperators(operatorRows.filter(operator => operator.isManager));
    } catch {
      toast.error('Failed to load manager logs');
      setLogs([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const filtered = useMemo(() => logs.filter(log => {
    if (operatorFilter && log.operatorId !== operatorFilter) return false;
    if (moduleFilter !== 'all' && log.module !== moduleFilter) return false;
    if (dateFrom && log.timestamp < new Date(dateFrom)) return false;
    if (dateTo && log.timestamp > new Date(`${dateTo}T23:59:59`)) return false;
    return true;
  }), [dateFrom, dateTo, logs, moduleFilter, operatorFilter]);

  function clearFilters() {
    setOperatorFilter('');
    setModuleFilter('all');
    setDateFrom('');
    setDateTo('');
  }

  function exportCSV() {
    const rows = [
      ['Timestamp', 'Manager', 'Module', 'Action', 'Target', 'Details'],
      ...filtered.map(log => [
        format(log.timestamp, 'dd/MM/yyyy HH:mm:ss'),
        log.operatorName,
        MODULE_LABELS[log.module],
        log.action.toUpperCase(),
        log.targetName || log.targetId || '',
        log.details || '',
      ]),
    ];
    const csv = rows.map(row => row.map(value => `"${String(value).replace(/"/g, '""')}"`).join(',')).join('\n');
    const a = document.createElement('a');
    a.href = 'data:text/csv;charset=utf-8,' + encodeURIComponent(csv);
    a.download = `NSB_ManagerLogs_${format(new Date(), 'yyyyMMdd')}.csv`;
    a.click();
  }

  const productLogs = logs.filter(log => log.module === 'products').length;
  const purchaseLogs = logs.length - productLogs;
  const managerCount = new Set(logs.map(log => log.operatorId)).size;

  return (
    <div className="flex-1 flex flex-col overflow-hidden bg-gray-50">
      <Toaster position="top-right" />

      <div className="bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between flex-shrink-0">
        <div>
          <h1 className="text-lg font-bold text-gray-900">Manager Logs</h1>
          <p className="text-xs text-gray-500">{logs.length} manager actions tracked</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={load} className="flex items-center gap-1.5 px-3 py-2 border border-gray-200 rounded-lg text-sm text-gray-600 hover:bg-gray-50">
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} /> Refresh
          </button>
          <button onClick={exportCSV} className="flex items-center gap-1.5 px-3 py-2 bg-saffron-400 hover:bg-saffron-500 text-white rounded-lg text-sm font-medium">
            <Download size={14} /> Export CSV
          </button>
        </div>
      </div>

      <div className="bg-white border-b border-gray-100 px-6 py-3 grid grid-cols-3 gap-4 flex-shrink-0">
        <Summary label="Managers Used" value={managerCount} icon={<UserCheck size={14} className="text-blue-500" />} />
        <Summary label="Products Added" value={productLogs} icon={<Package size={14} className="text-saffron-500" />} />
        <Summary label="Purchase Actions" value={purchaseLogs} icon={<ShoppingBag size={14} className="text-green-500" />} />
      </div>

      <div className="bg-white border-b border-gray-100 px-6 py-3 flex flex-wrap items-center gap-3 flex-shrink-0">
        <Filter size={14} className="text-gray-400" />
        <select value={operatorFilter} onChange={e => setOperatorFilter(e.target.value)} className="px-3 py-1.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-saffron-400">
          <option value="">All Managers</option>
          {operators.map(operator => <option key={operator.id} value={operator.id}>{operator.name}</option>)}
        </select>
        <select value={moduleFilter} onChange={e => setModuleFilter(e.target.value as ModuleFilter)} className="px-3 py-1.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-saffron-400">
          <option value="all">All Modules</option>
          {Object.entries(MODULE_LABELS).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
        </select>
        <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} className="px-3 py-1.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-saffron-400" />
        <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} className="px-3 py-1.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-saffron-400" />
        {(operatorFilter || moduleFilter !== 'all' || dateFrom || dateTo) && (
          <button onClick={clearFilters} className="px-3 py-1.5 text-xs text-red-500 hover:bg-red-50 rounded-lg transition-colors">
            Clear filters
          </button>
        )}
      </div>

      <div className="flex-1 overflow-y-auto">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 sticky top-0 text-xs text-gray-500 uppercase tracking-wide">
            <tr>
              <th className="text-left px-5 py-3">Time</th>
              <th className="text-left px-4 py-3">Manager</th>
              <th className="text-left px-4 py-3">Module</th>
              <th className="text-center px-4 py-3">Action</th>
              <th className="text-left px-4 py-3">Target</th>
              <th className="text-left px-5 py-3">Details</th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-50">
            {filtered.map(log => (
              <tr key={log.id} className="hover:bg-gray-50 transition-colors">
                <td className="px-5 py-3">
                  <p className="font-medium text-gray-800">{format(log.timestamp, 'dd MMM yyyy')}</p>
                  <p className="text-xs text-gray-400">{format(log.timestamp, 'HH:mm:ss')} - {formatDistanceToNow(log.timestamp, { addSuffix: true })}</p>
                </td>
                <td className="px-4 py-3 font-medium text-gray-800">{log.operatorName || 'Manager'}</td>
                <td className="px-4 py-3 text-gray-700">{MODULE_LABELS[log.module]}</td>
                <td className="px-4 py-3 text-center">
                  <span className="inline-flex rounded-full bg-green-50 px-2.5 py-1 text-xs font-bold text-green-700">
                    {log.action.toUpperCase()}
                  </span>
                </td>
                <td className="px-4 py-3 font-mono text-xs text-gray-700">{log.targetName || log.targetId || '-'}</td>
                <td className="px-5 py-3 text-xs text-gray-500">{log.details || '-'}</td>
              </tr>
            ))}
            {!loading && filtered.length === 0 && (
              <tr>
                <td colSpan={6} className="px-5 py-16 text-center text-gray-400">
                  <FileText size={38} className="mx-auto mb-3 text-gray-200" />
                  No manager logs found
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Summary({ label, value, icon }: { label: string; value: string | number; icon: ReactNode }) {
  return (
    <div className="flex items-center gap-3 rounded-xl border border-gray-100 bg-gray-50 px-4 py-3">
      <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-white shadow-sm">{icon}</div>
      <div>
        <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-400">{label}</p>
        <p className="text-base font-bold text-gray-900">{value}</p>
      </div>
    </div>
  );
}
