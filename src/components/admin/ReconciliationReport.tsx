import React, { useState, useEffect } from 'react';
import { ShieldCheck, AlertTriangle, RefreshCw, Loader2, Database } from 'lucide-react';

export const ReconciliationReport: React.FC = () => {
  const [report, setReport] = useState<any>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const fetchReport = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/diagnostics/ledger-sync');
      const data = await res.json();
      if (res.ok && data.success) {
        setReport(data.report);
      } else {
        setError(data.message || 'Failed to fetch diagnostic report');
      }
    } catch (err: any) {
      setError(err.message || 'Error fetching diagnostic report');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchReport();
  }, []);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-bold text-white">System Ledger Reconciliation</h2>
        <button
          onClick={fetchReport}
          disabled={loading}
          className="px-4 py-2 rounded-lg bg-white/[0.05] hover:bg-white/[0.1] text-xs font-bold text-white flex items-center gap-2"
        >
          {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
          Refresh Report
        </button>
      </div>

      {error && (
        <div className="p-4 rounded-xl bg-[#F04438]/10 border border-[#F04438]/30 text-xs text-[#F04438] flex items-center gap-2">
          <AlertTriangle className="w-4 h-4" />
          {error}
        </div>
      )}

      {report && (
        <div className="p-6 rounded-2xl bg-[#07101D] border border-white/[0.08] space-y-4">
          <div className="flex items-center gap-2 text-sm font-bold text-white">
            <Database className="w-4 h-4" />
            <span>Integrity Status: {report.status.toUpperCase()}</span>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="p-4 rounded-xl bg-[#05070B] border border-white/[0.05]">
              <div className="text-[10px] text-[#98A2B3] uppercase">Users</div>
              <div className="text-xl font-mono text-white">{report.metrics.totalUsers}</div>
            </div>
            <div className="p-4 rounded-xl bg-[#05070B] border border-white/[0.05]">
              <div className="text-[10px] text-[#98A2B3] uppercase">Ledger Entries</div>
              <div className="text-xl font-mono text-white">{report.metrics.totalLedgerEntries}</div>
            </div>
          </div>
          <pre className="text-[10px] text-[#98A2B3] font-mono p-4 rounded-xl bg-[#05070B] overflow-x-auto">
            {JSON.stringify(report, null, 2)}
          </pre>
        </div>
      )}
    </div>
  );
};
