'use client';
import { useCallback, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { FileText, Play, Square, Download, RefreshCw, Filter, Monitor, Users, Clock, LockKeyhole } from 'lucide-react';
import { format, formatDistanceToNow } from 'date-fns';
import toast, { Toaster } from 'react-hot-toast';
import { Bill, MachineLog, Operator, POSMachine } from '@/types';
import { getMachineLogs, getMachines, getOperators } from '@/lib/admin-firestore';
import { getAllBills } from '@/lib/firestore';

type ActionFilter = 'all' | 'start' | 'stop';

function money(value: number) {
  return `₹${value.toLocaleString('en-IN', { maximumFractionDigits: 0 })}`;
}

function sessionBills(bills: Bill[], machine: POSMachine) {
  const startedAt = machine.sessionStartedAt || new Date();
  return bills.filter(bill =>
    bill.status === 'paid' &&
    bill.machineId === machine.id &&
    bill.operatorId === machine.currentOperatorId &&
    !!bill.paidAt &&
    bill.paidAt >= startedAt
  );
}

export default function LogsPage() {
  const [logs, setLogs] = useState<MachineLog[]>([]);
  const [machines, setMachines] = useState<POSMachine[]>([]);
  const [operators, setOperators] = useState<Operator[]>([]);
  const [bills, setBills] = useState<Bill[]>([]);
  const [machineFilter, setMachineFilter] = useState('');
  const [operatorFilter, setOperatorFilter] = useState('');
  const [actionFilter, setActionFilter] = useState<ActionFilter>('all');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [logRows, machineRows, operatorRows, billRows] = await Promise.all([
        getMachineLogs(),
        getMachines(),
        getOperators(),
        getAllBills(),
      ]);
      setLogs(logRows);
      setMachines(machineRows);
      setOperators(operatorRows);
      setBills(billRows);
    } catch {
      toast.error('Failed to load machine logs');
      setLogs([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const activeSessions = useMemo(() => machines
    .filter(machine => machine.isActive && machine.currentOperatorId)
    .map(machine => {
      const startedAt = machine.sessionStartedAt || new Date();
      const currentBills = sessionBills(bills, machine);
      return {
        machine,
        startedAt,
        durationMinutes: Math.max(0, Math.round((Date.now() - startedAt.getTime()) / 60000)),
        billsCount: currentBills.length,
        totalSales: currentBills.reduce((sum, bill) => sum + bill.total, 0),
      };
    }), [bills, machines]);

  const filtered = logs.filter(log => {
    if (machineFilter && log.machineId !== machineFilter) return false;
    if (operatorFilter && log.operatorId !== operatorFilter) return false;
    if (actionFilter !== 'all' && log.action !== actionFilter) return false;
    if (dateFrom && log.timestamp < new Date(dateFrom)) return false;
    if (dateTo && log.timestamp > new Date(`${dateTo}T23:59:59`)) return false;
    return true;
  });

  const stoppedLogs = logs.filter(log => log.action === 'stop');
  const totalSessions = stoppedLogs.length;
  const totalBills = stoppedLogs.reduce((sum, log) => sum + (log.billsCount || 0), 0);
  const totalSales = stoppedLogs.reduce((sum, log) => sum + (log.totalSales || 0), 0);
  const totalMinutes = stoppedLogs.reduce((sum, log) => sum + (log.sessionDurationMinutes || 0), 0);
  const activeSales = activeSessions.reduce((sum, session) => sum + session.totalSales, 0);

  function exportCSV() {
    const rows = [
      ['Timestamp', 'Machine', 'Operator', 'Action', 'Duration (min)', 'Bills', 'Sales'],
      ...filtered.map(log => [
        format(log.timestamp, 'dd/MM/yyyy HH:mm:ss'),
        log.machineName,
        log.operatorName,
        log.action === 'start' ? 'MACHINE START' : 'MACHINE STOP',
        log.sessionDurationMinutes ?? '',
        log.billsCount ?? '',
        log.totalSales ?? '',
      ]),
    ];
    const csv = rows.map(row => row.map(value => `"${value}"`).join(',')).join('\n');
    const a = document.createElement('a');
    a.href = 'data:text/csv;charset=utf-8,' + encodeURIComponent(csv);
    a.download = `NSB_MachineLogs_${format(new Date(), 'yyyyMMdd')}.csv`;
    a.click();
  }

  return (
    <div className="flex-1 flex flex-col overflow-hidden bg-gray-50">
      <Toaster position="top-right" />

      <div className="bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between flex-shrink-0">
        <div>
          <h1 className="text-lg font-bold text-gray-900">Machine Logs</h1>
          <p className="text-xs text-gray-500">{logs.length} log entries · {activeSessions.length} running · {totalSessions} stopped sessions</p>
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

      <div className="bg-white border-b border-gray-100 px-6 py-3 grid grid-cols-5 gap-4 flex-shrink-0">
        <Summary label="Active Machines" value={activeSessions.length} icon={<LockKeyhole size={14} className="text-green-500" />} />
        <Summary label="Active Sales" value={money(activeSales)} icon={<Clock size={14} className="text-green-500" />} />
        <Summary label="Stopped Sessions" value={totalSessions} icon={<Monitor size={14} className="text-saffron-500" />} />
        <Summary label="Stopped Bills" value={totalBills} icon={<FileText size={14} className="text-blue-500" />} />
        <Summary label="Stopped Sales" value={money(totalSales)} icon={<Clock size={14} className="text-purple-500" />} sub={`${(totalMinutes / 60).toFixed(1)} hrs`} />
      </div>

      {activeSessions.length > 0 && (
        <div className="bg-white border-b border-gray-100 px-6 py-4 flex gap-3 overflow-x-auto flex-shrink-0">
          {activeSessions.map(session => (
            <div key={session.machine.id} className="min-w-[260px] rounded-xl border border-green-100 bg-green-50 p-3">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <Monitor size={15} className="text-green-600" />
                  <p className="font-bold text-green-900">{session.machine.name}</p>
                </div>
                <span className="inline-flex items-center gap-1 rounded-full bg-green-600 px-2 py-0.5 text-[10px] font-bold text-white">
                  <Play size={10} /> Machine Start
                </span>
              </div>
              <p className="mt-1 text-xs text-green-700">Current operator: <span className="font-semibold">{session.machine.currentOperatorName}</span></p>
              <div className="mt-3 grid grid-cols-3 gap-2 text-xs">
                <Metric label="Used" value={`${session.durationMinutes}m`} />
                <Metric label="Bills" value={session.billsCount} />
                <Metric label="Earned" value={money(session.totalSales)} />
              </div>
              <p className="mt-2 text-[10px] text-green-600">Started {formatDistanceToNow(session.startedAt, { addSuffix: true })}</p>
            </div>
          ))}
        </div>
      )}

      <div className="bg-white border-b border-gray-100 px-6 py-3 flex flex-wrap items-center gap-3 flex-shrink-0">
        <Filter size={14} className="text-gray-400" />
        <select value={machineFilter} onChange={e => setMachineFilter(e.target.value)} className="px-3 py-1.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-saffron-400">
          <option value="">All Machines</option>
          {machines.map(machine => <option key={machine.id} value={machine.id}>{machine.name}</option>)}
        </select>
        <select value={operatorFilter} onChange={e => setOperatorFilter(e.target.value)} className="px-3 py-1.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-saffron-400">
          <option value="">All Operators</option>
          {operators.map(operator => <option key={operator.id} value={operator.id}>{operator.name}</option>)}
        </select>
        <select value={actionFilter} onChange={e => setActionFilter(e.target.value as ActionFilter)} className="px-3 py-1.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-saffron-400">
          <option value="all">All Actions</option>
          <option value="start">Machine start</option>
          <option value="stop">Machine stop</option>
        </select>
        <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} className="px-3 py-1.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-saffron-400" />
        <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} className="px-3 py-1.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-saffron-400" />
        {(machineFilter || operatorFilter || actionFilter !== 'all' || dateFrom || dateTo) && (
          <button onClick={() => { setMachineFilter(''); setOperatorFilter(''); setActionFilter('all'); setDateFrom(''); setDateTo(''); }} className="px-3 py-1.5 text-xs text-red-500 hover:bg-red-50 rounded-lg transition-colors">
            Clear filters
          </button>
        )}
      </div>

      <div className="flex-1 overflow-y-auto">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 sticky top-0 text-xs text-gray-500 uppercase tracking-wide">
            <tr>
              <th className="text-left px-5 py-3">Time</th>
              <th className="text-left px-4 py-3">Machine</th>
              <th className="text-left px-4 py-3">Operator</th>
              <th className="text-center px-4 py-3">Status</th>
              <th className="text-right px-4 py-3">Used Time</th>
              <th className="text-right px-4 py-3">Bills</th>
              <th className="text-right px-5 py-3">Earned</th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-50">
            {filtered.map(log => (
              <tr key={log.id} className={`hover:bg-gray-50 transition-colors ${log.action === 'stop' ? 'bg-gray-50/30' : ''}`}>
                <td className="px-5 py-3">
                  <p className="font-medium text-gray-800">{format(log.timestamp, 'dd MMM yyyy')}</p>
                  <p className="text-xs text-gray-400">{format(log.timestamp, 'HH:mm:ss')} · {formatDistanceToNow(log.timestamp, { addSuffix: true })}</p>
                </td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2">
                    <Monitor size={14} className="text-gray-400" />
                    <span className="font-medium text-gray-800">{log.machineName || 'Machine'}</span>
                  </div>
                </td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2">
                    <Users size={14} className="text-gray-400" />
                    <span className="text-gray-700">{log.operatorName || 'Operator'}</span>
                  </div>
                </td>
                <td className="px-4 py-3 text-center">
                  <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold ${
                    log.action === 'start' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
                  }`}>
                    {log.action === 'start' ? <><Play size={10} /> Machine Start</> : <><Square size={10} /> Machine Stop</>}
                  </span>
                </td>
                <td className="px-4 py-3 text-right text-gray-600">{log.sessionDurationMinutes != null ? `${log.sessionDurationMinutes} min` : '-'}</td>
                <td className="px-4 py-3 text-right text-gray-600">{log.billsCount ?? '-'}</td>
                <td className="px-5 py-3 text-right font-semibold text-saffron-600">{log.totalSales ? money(log.totalSales) : '-'}</td>
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

function Summary({ label, value, icon, sub }: { label: string; value: string | number; icon: ReactNode; sub?: string }) {
  return (
    <div className="flex items-center gap-2">
      {icon}
      <div>
        <p className="text-[10px] text-gray-400 uppercase tracking-wide">{label}</p>
        <p className="text-sm font-bold text-gray-800">{value} {sub && <span className="text-xs font-normal text-gray-400">· {sub}</span>}</p>
      </div>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-lg bg-white/80 px-2 py-1">
      <p className="text-[10px] uppercase text-green-500">{label}</p>
      <p className="font-bold text-green-900">{value}</p>
    </div>
  );
}
