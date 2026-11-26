import React, { useState, useEffect } from 'react';
import { PhxGlassCard, TabularCounter } from '../ui/phivonex';
import { History, ShieldAlert, CheckCircle2, Loader2, GitFork, Users, Coins } from 'lucide-react';

interface LegacyMemberHubProps {
  user: any;
  onNavigateTab: (tab: string) => void;
}

export const LegacyMemberHub: React.FC<LegacyMemberHubProps> = ({ user }) => {
  const [portfolio, setPortfolio] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchLegacyPortfolio = async () => {
      try {
        const res = await fetch('/api/legacy/portfolio', { credentials: 'include' });
        const data = await res.json();
        if (data.success || data.portfolio) {
          setPortfolio(data.portfolio || data);
        }
      } catch (err) {
        console.warn('Failed to load legacy portfolio archive:', err);
      } finally {
        setLoading(false);
      }
    };
    fetchLegacyPortfolio();
  }, []);

  return (
    <div className="space-y-8 animate-fadeIn">
      {/* Hero Header */}
      <div className="rounded-[28px] bg-gradient-to-r from-[#1A0A0A] via-[#0D0505] to-[#050807] border border-amber-500/30 p-6 sm:p-8 shadow-2xl relative overflow-hidden">
        <div className="absolute right-0 top-0 w-96 h-96 bg-amber-500/5 rounded-full blur-3xl pointer-events-none" />

        <div className="relative z-10 flex flex-col lg:flex-row items-start lg:items-center justify-between gap-6">
          <div className="space-y-3 max-w-xl">
            <span className="px-3 py-1 rounded-full text-xs font-mono font-bold tracking-wider uppercase bg-amber-500/20 text-amber-300 border border-amber-500/40">
              HISTORICAL INVESTOR ARCHIVE
            </span>

            <h1 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight">
              LEGACY MEMBER HUB &amp; HISTORICAL SNAPSHOT
            </h1>

            <p className="text-xs sm:text-sm text-slate-300 leading-relaxed">
              Read-only historical archive of your legacy network placements, binary volume events, and pre-unilevel settlement records preserved for your account security.
            </p>
          </div>

          <div className="p-4 rounded-2xl bg-[#050807]/90 border border-amber-500/30 shrink-0 flex items-center gap-3">
            <ShieldAlert className="w-8 h-8 text-amber-400" />
            <div>
              <span className="text-[10px] font-mono text-slate-400 uppercase">Archive Status</span>
              <h3 className="text-sm font-bold text-amber-300">Preserved &amp; Secure</h3>
            </div>
          </div>
        </div>
      </div>

      {loading ? (
        <div className="py-20 flex items-center justify-center">
          <Loader2 className="w-8 h-8 animate-spin text-amber-400" />
        </div>
      ) : (
        <div className="space-y-6">
          {/* Placements */}
          <PhxGlassCard>
            <h3 className="text-sm font-bold text-white mb-4 flex items-center gap-2">
              <GitFork className="w-4 h-4 text-amber-400" />
              <span>Legacy Binary Placements</span>
            </h3>

            {(!portfolio?.placements || portfolio.placements.length === 0) ? (
              <p className="text-xs text-slate-400 py-6 text-center">No legacy binary placement records found.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs font-mono">
                  <thead>
                    <tr className="border-b border-white/10 text-slate-400">
                      <th className="pb-3">Placement ID</th>
                      <th className="pb-3">Parent ID</th>
                      <th className="pb-3">Side</th>
                      <th className="pb-3">Placed At</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/[0.06]">
                    {portfolio.placements.map((p: any, idx: number) => (
                      <tr key={idx} className="hover:bg-white/[0.02]">
                        <td className="py-3 text-amber-300">{p.id || p.public_id}</td>
                        <td className="py-3 text-white">{p.parent_id || 'Root'}</td>
                        <td className="py-3 text-[#00E5FF]">{p.side}</td>
                        <td className="py-3 text-slate-400">{new Date(p.placed_at || Date.now()).toLocaleDateString()}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </PhxGlassCard>

          {/* Matching Settlements */}
          <PhxGlassCard>
            <h3 className="text-sm font-bold text-white mb-4 flex items-center gap-2">
              <History className="w-4 h-4 text-amber-400" />
              <span>Legacy Binary Matching History</span>
            </h3>

            {(!portfolio?.matchingSettlements || portfolio.matchingSettlements.length === 0) ? (
              <p className="text-xs text-slate-400 py-6 text-center">No legacy matching settlements recorded.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs font-mono">
                  <thead>
                    <tr className="border-b border-white/10 text-slate-400">
                      <th className="pb-3">Business Date</th>
                      <th className="pb-3">Left Units</th>
                      <th className="pb-3">Right Units</th>
                      <th className="pb-3 text-right">Matched USD</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/[0.06]">
                    {portfolio.matchingSettlements.map((m: any, idx: number) => (
                      <tr key={idx} className="hover:bg-white/[0.02]">
                        <td className="py-3 text-white">{m.business_date}</td>
                        <td className="py-3 text-[#00E5FF]">{m.left_units}</td>
                        <td className="py-3 text-[#32D583]">{m.right_units}</td>
                        <td className="py-3 text-right text-amber-400 font-bold">+${Number(m.matched_usd || 0).toFixed(2)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </PhxGlassCard>
        </div>
      )}
    </div>
  );
};
