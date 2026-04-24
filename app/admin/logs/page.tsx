'use client';
import { useState, useEffect, useCallback } from 'react';
import { FileText, Play, Square, Download, RefreshCw, Filter, Monitor, Users, Clock } from 'lucide-react';
import { format, formatDistanceToNow } from 'date-fns';
import toast, { Toaster } from 'react-hot-toast';
import { MachineLog, POSMachine, Operator } from '@/types';
import { getMachineLogs, getMachines, getOperators } from '@/lib/admin-firestore';

// ── Demo logs for when Firestore is empty ────────────────────────────────────
function demoLogs(): MachineLog[] {
  const now = new Date();
  return [
    { id: '1', machineId: 'm1', machineName: 'Machine 1', operatorId: 'o1', operatorName: 'Rahul Kumar', action: 'start' as const, timestamp: new Date(now.getTime() - 3 * 3600000), billsCount: 0, totalSales: 0 },
    { id: '2', machineId: 'm2', machineName: 'Machine 2', operatorId: 'o2', operatorName: 'Priya Singh', action: 'start' as const, timestamp: new Date(now.getTime() - 3 * 3600000 - 600000), billsCount: 0, totalSales: 0 },
    { id: '3', machineId: 'm2', machineName: 'Machine 2', operatorId: 'o2', operatorName: 'Priya Singh', action: 'stop' as const, timestamp: new Date(now.getTime() - 1 * 3600000), sessionDurationMinutes: 120, billsCount: 34, totalSales: 8240 },
    { id: '4', machineId: 'm3', machineName: 'Machine 3', operatorId: 'o3', operatorName: 'Amit Patel', action: 'start' as const, timestamp: new Date(now.getTime() - 2 * 3600000), billsCount: 0, totalSales: 0 },
    { id: '5', machineId: 'm3', machineName: 'Machine 3', operatorId: 'o3', operatorName: 'Amit Patel', action: 'stop' as const, timestamp: new Date(now.getTime() - 30 * 60000), sessionDurationMinutes: 90, billsCount: 28, totalSales: 6740 },
    { id: '6', machineId: 'm1', machineName: 'Machine 1', operatorId: 'o1', operatorName: 'Rahul Kumar', action: 'stop' as const, timestamp: new Date(now.getTime() - 15 * 60000), sessionDurationMinutes: 165, billsCount: 52, totalSales: 12800 },
  ].sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
}

export default function LogsPage() {
  const [logs, setLogs] = useState<MachineLog[]>([]);
  const [machines, setMachines] = useState<POSMachine[]>([]);
  const [operators, setOperators] = useState<Operator[]>([]);
  const [machineFilter, setMachineFilter] = useState('');
  const [operatorFilter, setOperatorFilter] = useState('');
  const [actionFilter, setActionFilter] = useState<'all' | 'start' | 'stop'>('all');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [l, m, o] = await Promise.all([getMachineLogs(), getMachines(), getOperators()]);
      setLogs(l.length ? l : demoLogs());
      setMachines(m);
      setOperators(o);
    } catch {
      setLogs(demoLogs());
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  // Client-side filter
  const filtered = logs.filter(l => {
    if (machineFilter && l.machineId !== machineFilter) return false;
    if (operatorFilter && l.operatorId !== operatorFilter) return false;
    if (actionFilter !== 'all' && l.action !== actionFilter) return false;
    if (dateFrom && l.timestamp < new Date(dateFrom)) return false;
    if (dateTo && l.timestamp > new Date(dateTo + 'T23:59:59')) return false;
    return true;
  });

  function exportCSV() {
    const rows = [
      ['Timestamp', 'Machine', 'Operator', 'Action', 'Duration (min)', 'Bills', 'Sales (₹)'],
      ...filtered.map(l => [
        format(l.timestamp, 'dd/MM/yyyy HH:mm:ss'),
        l.machineName, l.operatorName,
        l.action.toUpperCase(),
        l.sessionDurationMinutes ?? '',
        l.billsCount ?? '',
        l.totalSales ?? '',
      ]),
    ];
    const csv = rows.map(r => r.map(v => `"${v}"`).join(',')).join('\n');
    const a = document.createElement('a');
    a.href = 'data:text/csv;charset=utf-8,' + encodeURIComponent(csv);
    a.download = `NSB_MachineLogs_${format(new Date(), 'yyyyMMdd')}.csv`;
    a.click();
  }

  // Summary stats
  const totalSessions = logs.filter(l => l.action === 'stop').length;
  const totalBills = logs.filter(l => l.action === 'stop').reduce((s, l) => s + (l.billsCount || 0), 0);
  const totalSales = logs.filter(l => l.action === 'stop').reduce((s, l) => s + (l.totalSales || 0), 0);
  const totalMinutes = logs.filter(l => l.action === 'stop').reduce((s, l) => s + (l.sessionDurationMinutes || 0), 0);

  return (
    <div className="flex-1 flex flex-col overflow-hidden bg-gray-50">
      <Toaster position="top-right" />

      {/* Header */}
      <div className="bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between flex-shrink-0">
        <div>
          <h1 className="text-lg font-bold text-gray-900">Machine Logs</h1>
          <p className="text-xs text-gray-500">{logs.length} log entries &nbsp;·&nbsp; {totalSessions} sessions completed</p>
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

      {/* Summary stats */}
      <div className="bg-white border-b border-gray-100 px-6 py-3 flex gap-6 flex-shrink-0">
        {[
          { label: 'Sessions', value: totalSessions, icon: <Monitor size={14} className="text-saffron-500" /> },
          { label: 'Total Bills', value: totalBills, icon: <FileText size={14} className="text-blue-500" /> },
          { label: 'Total Sales', value: `₹${totalSales.toLocaleString('en-IN')}`, icon: <Clock size={14} className="text-green-500" /> },
          { label: 'Total Hours', value: `${(totalMinutes / 60).toFixed(1)} hrs`, icon: <Clock size={14} className="text-purple-500" /> },
        ].map(s => (
          <div key={s.label} className="flex items-center gap-2">
            {s.icon}
            <div>
              <p className="text-[10px] text-gray-400 uppercase tracking-wide">{s.label}</p>
              <p className="text-sm font-bold text-gray-800">{s.value}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="bg-white border-b border-gray-100 px-6 py-3 flex flex-wrap items-center gap-3 flex-shrink-0">
        <Filter size={14} className="text-gray-400" />
        <select value={machineFilter} onChange={e => setMachineFilter(e.target.value)}
          className="px-3 py-1.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-saffron-400">
          <option value="">All Machines</option>
          {machines.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
        </select>
        <select value={operatorFilter} onChange={e => setOperatorFilter(e.target.value)}
          className="px-3 py-1.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-saffron-400">
          <option value="">All Operators</option>
          {operators.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}
        </select>
        <select value={actionFilter} onChange={e => setActionFilter(e.target.value as 'all' | 'start' | 'stop')}
          className="px-3 py-1.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-saffron-400">
          <option value="all">All Actions</option>
          <option value="start">Start only</option>
          <option value="stop">Stop only</option>
        </select>
        <div className="flex items-center gap-2">
          <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)}
            className="px-3 py-1.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-saffron-400" />
          <span className="text-gray-400 text-sm">—</span>
          <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)}
            className="px-3 py-1.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-saffron-400" />
        </div>
        {(machineFilter || operatorFilter || actionFilter !== 'all' || dateFrom || dateTo) && (
          <button onClick={() => { setMachineFilter(''); setOperatorFilter(''); setActionFilter('all'); setDateFrom(''); setDateTo(''); }}
            className="px-3 py-1.5 text-xs text-red-500 hover:bg-red-50 rounded-lg transition-colors">Clear filters</button>
        )}
      </div>

      {/* Logs table */}
      <div className="flex-1 overflow-y-auto">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 sticky top-0 text-xs text-gray-500 uppercase tracking-wide">
            <tr>
              <th className="text-left px-5 py-3">Time</th>
              <th className="text-left px-4 py-3">Machine</th>
              <th className="text-left px-4 py-3">Operator</th>
              <th className="text-center px-4 py-3">Action</th>
              <th className="text-right px-4 py-3">Duration</th>
              <th className="text-right px-4 py-3">Bills</th>
              <th className="text-right px-5 py-3">Sales</th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-50">
            {filtered.map(log => (
              <tr key={log.id} className={`hover:bg-gray-50 transition-colors ${log.action === 'start' ? '' : 'bg-gray-50/30'}`}>
                <td className="px-5 py-3">
                  <p className="text-gray-800 font-medium">{format(log.timestamp, 'dd MMM yyyy')}</p>
                  <p className="text-xs text-gray-400">{format(log.timestamp, 'HH:mm:ss')} &nbsp;·&nbsp; {formatDistanceToNow(log.timestamp, { addSuffix: true })}</p>
                </td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2">
                    <Monitor size={14} className="text-gray-400" />
                    <span className="font-medium text-gray-800">{log.machineName}</span>
                  </div>
                </td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2">
                    <div className="w-6 h-6 rounded-full bg-saffron-100 flex items-center justify-center text-[10px] font-bold text-saffron-700">
                      {log.operatorName[0]}
                    </div>
                    <span className="text-gray-700">{log.operatorName}</span>
                  </div>
                </td>
                <td className="px-4 py-3 text-center">
                  <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold ${
                    log.action === 'start' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
                  }`}>
                    {log.action === 'start' ? <><Play size={10} /> Start</> : <><Square size={10} /> Stop</>}
                  </span>
                </td>
                <td className="px-4 py-3 text-right text-gray-600">
                  {log.sessionDurationMinutes != null ? `${log.sessionDurationMinutes} min` : '—'}
                </td>
                <td className="px-4 py-3 text-right text-gray-600">
                  {log.billsCount != null ? log.billsCount : '—'}
                </td>
                <td className="px-5 py-3 text-right font-semibold text-saffron-600">
                  {log.totalSales != null && log.totalSales > 0 ? `₹${log.totalSales.toLocaleString('en-IN')}` : '—'}
                </td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr><td colSpan={7} className="px-5 py-12 text-center text-gray-300">No logs found</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
