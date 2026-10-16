import React, { useState, useEffect, useCallback } from 'react';
import {
  User,
  Shield,
  Lock,
  Unlock,
  Key,
  Wallet,
  Coins,
  ArrowUpRight,
  ArrowDownLeft,
  ArrowLeftRight,
  RefreshCw,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Clock,
  Edit3,
  Search,
  Filter,
  FileText,
  Activity,
  History,
  Check,
  X,
  AlertCircle,
  DollarSign,
  Box,
  Layers,
  LogOut
} from 'lucide-react';

interface User360ViewProps {
  userId: string;
  onClose: () => void;
  onUserUpdated?: () => void;
}

export const User360View: React.FC<User360ViewProps> = ({ userId, onClose, onUserUpdated }) => {
  const [activeTab, setActiveTab] = useState<'profile' | 'wallet' | 'transactions' | 'nodes' | 'security' | 'audit'>('profile');
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  // Adjustment Modal state
  const [isAdjustModalOpen, setIsAdjustModalOpen] = useState<boolean>(false);
  const [adjustAsset, setAdjustAsset] = useState<'USDT' | 'PHIVO'>('USDT');
  const [adjustDirection, setAdjustDirection] = useState<'CREDIT' | 'DEBIT'>('CREDIT');
  const [adjustAmount, setAdjustAmount] = useState<string>('');
  const [adjustReason, setAdjustReason] = useState<string>('');
  const [adjustConfirmStep, setAdjustConfirmStep] = useState<boolean>(false);
  const [adjustSubmitting, setAdjustSubmitting] = useState<boolean>(false);
  const [adjustError, setAdjustReasonError] = useState<string | null>(null);
  const [adjustSuccessResult, setAdjustSuccessResult] = useState<any>(null);

  // Status Action Modal state
  const [statusAction, setStatusAction] = useState<'LOCK' | 'UNLOCK' | 'REVOKE_SESSIONS' | null>(null);
  const [actionReason, setActionReason] = useState<string>('');
  const [actionSubmitting, setActionSubmitting] = useState<boolean>(false);
  const [actionError, setActionError] = useState<string | null>(null);

  // Fetch User 360 data
  const fetchUser360 = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await fetch(`/api/admin/users/${encodeURIComponent(userId)}/360`, {
        headers: { 'Content-Type': 'application/json' },
      });
      const json = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(json.message || 'Failed to load User 360 details.');
      }
      setData(json);
    } catch (err: any) {
      console.error('[User 360] Fetch error:', err);
      setError(err.message || 'An error occurred while loading User 360 details.');
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    fetchUser360();
  }, [fetchUser360]);

  // Handle Wallet Adjustment Submission
  const handleExecuteAdjustment = async () => {
    if (!adjustAmount || isNaN(Number(adjustAmount)) || Number(adjustAmount) <= 0) {
      setAdjustReasonError('Please enter a valid positive amount strictly greater than 0.');
      return;
    }
    if (!adjustReason || adjustReason.trim().length < 5) {
      setAdjustReasonError('Administrative reason is mandatory (minimum 5 characters).');
      return;
    }

    try {
      setAdjustSubmitting(true);
      setAdjustReasonError(null);

      const idempotencyKey = `adm-adj-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;

      const res = await fetch(`/api/admin/users/${encodeURIComponent(userId)}/wallet/adjustments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          asset: adjustAsset,
          direction: adjustDirection,
          amount: Number(adjustAmount),
          reason: adjustReason.trim(),
          idempotencyKey,
        }),
      });

      const json = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(json.message || 'Failed to execute wallet adjustment.');
      }

      setAdjustSuccessResult(json.transaction);
      setIsAdjustModalOpen(false);
      setAdjustConfirmStep(false);
      setAdjustAmount('');
      setAdjustReason('');
      fetchUser360();
      if (onUserUpdated) onUserUpdated();
    } catch (err: any) {
      console.error('[User 360] Adjustment error:', err);
      setAdjustReasonError(err.message || 'Failed to execute wallet adjustment.');
    } finally {
      setAdjustSubmitting(false);
    }
  };

  // Handle Account Status & Session Revocation
  const handleExecuteAccountAction = async () => {
    if (!actionReason || actionReason.trim().length < 5) {
      setActionError('Administrative reason is mandatory (minimum 5 characters).');
      return;
    }

    try {
      setActionSubmitting(true);
      setActionError(null);

      let endpoint = '';
      if (statusAction === 'LOCK') endpoint = `/api/admin/users/${encodeURIComponent(userId)}/lock`;
      else if (statusAction === 'UNLOCK') endpoint = `/api/admin/users/${encodeURIComponent(userId)}/unlock`;
      else if (statusAction === 'REVOKE_SESSIONS') endpoint = `/api/admin/users/${encodeURIComponent(userId)}/sessions/revoke`;

      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason: actionReason.trim() }),
      });

      const json = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(json.message || 'Failed to execute action.');
      }

      setStatusAction(null);
      setActionReason('');
      fetchUser360();
      if (onUserUpdated) onUserUpdated();
    } catch (err: any) {
      setActionError(err.message || 'Failed to execute action.');
    } finally {
      setActionSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-4">
        <div className="bg-[#070B14] border border-white/10 rounded-2xl p-8 max-w-md w-full text-center space-y-4 shadow-2xl">
          <RefreshCw className="w-10 h-10 text-[#00CFFF] animate-spin mx-auto" />
          <p className="text-sm font-mono text-white">Loading User 360° Comprehensive Records...</p>
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-4">
        <div className="bg-[#070B14] border border-[#F04438]/30 rounded-2xl p-8 max-w-md w-full text-center space-y-4 shadow-2xl">
          <AlertCircle className="w-12 h-10 text-[#F04438] mx-auto" />
          <h3 className="text-lg font-bold text-white">Failed to Load User 360°</h3>
          <p className="text-xs text-slate-400">{error || 'User details unavailable.'}</p>
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-xl bg-white/10 hover:bg-white/20 text-white text-xs font-mono cursor-pointer"
          >
            Close Window
          </button>
        </div>
      </div>
    );
  }

  const { profile, walletOverview, addresses, recentWithdrawals, nodes, orders, transactions, sessions, securityEvents, auditLogs } = data;

  return (
    <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-md flex items-center justify-center p-2 sm:p-6 overflow-y-auto">
      <div className="bg-[#07101D] border border-white/10 rounded-2xl w-full max-w-6xl max-h-[92vh] flex flex-col shadow-2xl overflow-hidden my-auto">
        
        {/* HEADER */}
        <div className="p-4 sm:p-6 bg-gradient-to-r from-[#0B1528] to-[#070B14] border-b border-white/10 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-xl bg-[#00CFFF]/10 border border-[#00CFFF]/30 flex items-center justify-center text-[#00CFFF] font-mono font-bold text-lg">
              {profile.fullName.slice(0, 2).toUpperCase()}
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="text-lg font-bold text-white tracking-tight">{profile.fullName}</h2>
                <span className="font-mono text-xs px-2 py-0.5 rounded bg-white/10 text-slate-300 font-bold">
                  {profile.publicId}
                </span>
                <span className={`text-[10px] font-mono font-bold px-2 py-0.5 rounded uppercase ${profile.status === 'ACTIVE' ? 'bg-[#32D583]/10 text-[#32D583]' : 'bg-[#F04438]/10 text-[#F04438]'}`}>
                  {profile.status}
                </span>
                <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded bg-[#00CFFF]/10 text-[#00CFFF] uppercase">
                  {profile.role}
                </span>
              </div>
              <p className="text-xs text-slate-400 font-mono mt-0.5">{profile.email} • Joined {new Date(profile.createdAt).toLocaleDateString()}</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {profile.status === 'ACTIVE' ? (
              <button
                onClick={() => { setStatusAction('LOCK'); setActionError(null); setActionReason(''); }}
                className="px-3 py-1.5 rounded-lg bg-[#F04438]/10 hover:bg-[#F04438]/20 border border-[#F04438]/30 text-[#F04438] text-xs font-mono font-bold flex items-center gap-1.5 cursor-pointer"
              >
                <Lock className="w-3.5 h-3.5" /> Lock Account
              </button>
            ) : (
              <button
                onClick={() => { setStatusAction('UNLOCK'); setActionError(null); setActionReason(''); }}
                className="px-3 py-1.5 rounded-lg bg-[#32D583]/10 hover:bg-[#32D583]/20 border border-[#32D583]/30 text-[#32D583] text-xs font-mono font-bold flex items-center gap-1.5 cursor-pointer"
              >
                <Unlock className="w-3.5 h-3.5" /> Unlock Account
              </button>
            )}

            <button
              onClick={() => { setStatusAction('REVOKE_SESSIONS'); setActionError(null); setActionReason(''); }}
              className="px-3 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 text-slate-300 text-xs font-mono font-bold flex items-center gap-1.5 cursor-pointer"
            >
              <LogOut className="w-3.5 h-3.5 text-amber-400" /> Revoke Sessions
            </button>

            <button
              onClick={onClose}
              className="p-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-slate-300 hover:text-white cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* TAB NAVIGATION */}
        <div className="bg-[#05070B] border-b border-white/10 px-4 sm:px-6 flex items-center gap-2 overflow-x-auto no-scrollbar">
          {[
            { id: 'profile', label: 'Profile & Identity', icon: User },
            { id: 'wallet', label: 'Wallet & Balances', icon: Wallet },
            { id: 'transactions', label: 'Ledger Entries', icon: FileText },
            { id: 'nodes', label: 'Nodes & Orders', icon: Box },
            { id: 'security', label: 'Security & Sessions', icon: Shield },
            { id: 'audit', label: 'Admin Audit History', icon: History },
          ].map((tab) => {
            const Icon = tab.icon;
            const active = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as any)}
                className={`py-3 px-3 text-xs font-mono font-bold flex items-center gap-2 border-b-2 whitespace-nowrap cursor-pointer transition-all ${
                  active
                    ? 'border-[#00CFFF] text-[#00CFFF] bg-[#00CFFF]/5'
                    : 'border-transparent text-slate-400 hover:text-white hover:bg-white/5'
                }`}
              >
                <Icon className="w-4 h-4" />
                {tab.label}
              </button>
            );
          })}
        </div>

        {/* TAB CONTENT AREA */}
        <div className="p-4 sm:p-6 overflow-y-auto flex-1 space-y-6">

          {/* SUCCESS BANNER FOR ADJUSTMENT */}
          {adjustSuccessResult && (
            <div className="p-4 rounded-xl bg-[#32D583]/10 border border-[#32D583]/30 text-[#32D583] flex items-start justify-between gap-3 font-mono text-xs">
              <div>
                <span className="font-bold block text-sm">Wallet Adjustment Successfully Settled</span>
                <p className="mt-1">
                  Posted {adjustSuccessResult.direction} of {adjustSuccessResult.amount} {adjustSuccessResult.asset} to ledger (Txn ID: {adjustSuccessResult.publicTxnId}). New balance: {adjustSuccessResult.newBalance} {adjustSuccessResult.asset}.
                </p>
              </div>
              <button onClick={() => setAdjustSuccessResult(null)} className="text-[#32D583] hover:text-white cursor-pointer">
                <X className="w-4 h-4" />
              </button>
            </div>
          )}

          {/* TAB 1: PROFILE */}
          {activeTab === 'profile' && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="bg-[#0B1528]/60 border border-white/10 rounded-xl p-5 space-y-4">
                <h3 className="text-xs font-bold text-white font-mono uppercase tracking-wider text-[#00CFFF] flex items-center gap-2">
                  <User className="w-4 h-4" /> Account Identity
                </h3>
                <div className="space-y-3 text-xs font-mono divide-y divide-white/5">
                  <div className="pt-2 flex justify-between">
                    <span className="text-slate-400">Public User ID</span>
                    <span className="text-white font-bold">{profile.publicId}</span>
                  </div>
                  <div className="pt-2 flex justify-between">
                    <span className="text-slate-400">Full Name</span>
                    <span className="text-white font-bold">{profile.fullName}</span>
                  </div>
                  <div className="pt-2 flex justify-between">
                    <span className="text-slate-400">Email Address</span>
                    <span className="text-white font-bold">{profile.email}</span>
                  </div>
                  <div className="pt-2 flex justify-between">
                    <span className="text-slate-400">Email Verification</span>
                    <span className={profile.emailVerified ? 'text-[#32D583] font-bold' : 'text-amber-400 font-bold'}>
                      {profile.emailVerified ? 'Verified' : 'Unverified'}
                    </span>
                  </div>
                  <div className="pt-2 flex justify-between">
                    <span className="text-slate-400">Phone Number</span>
                    <span className="text-white">{profile.phone || 'Not provided'}</span>
                  </div>
                  <div className="pt-2 flex justify-between">
                    <span className="text-slate-400">Country</span>
                    <span className="text-white">{profile.country}</span>
                  </div>
                  <div className="pt-2 flex justify-between">
                    <span className="text-slate-400">Account Creation</span>
                    <span className="text-white">{new Date(profile.createdAt).toLocaleString()}</span>
                  </div>
                  <div className="pt-2 flex justify-between">
                    <span className="text-slate-400">Last Login / Activity</span>
                    <span className="text-white">{profile.lastLoginAt ? new Date(profile.lastLoginAt).toLocaleString() : 'N/A'}</span>
                  </div>
                </div>
              </div>

              <div className="space-y-6">
                <div className="bg-[#0B1528]/60 border border-white/10 rounded-xl p-5 space-y-4">
                  <h3 className="text-xs font-bold text-white font-mono uppercase tracking-wider text-[#00CFFF] flex items-center gap-2">
                    <Layers className="w-4 h-4" /> Sponsor & Referral Genealogy
                  </h3>
                  {profile.sponsor ? (
                    <div className="space-y-3 text-xs font-mono">
                      <div className="flex justify-between">
                        <span className="text-slate-400">Referral Code</span>
                        <span className="text-[#00CFFF] font-bold">{profile.sponsor.referralCode}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-400">Sponsor ID</span>
                        <span className="text-white font-bold">{profile.sponsor.sponsorPublicId || 'None'}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-400">Sponsor Name</span>
                        <span className="text-white">{profile.sponsor.sponsorFullName || 'None'}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-400">Sponsor Email</span>
                        <span className="text-slate-300">{profile.sponsor.sponsorEmail || 'None'}</span>
                      </div>
                    </div>
                  ) : (
                    <p className="text-xs font-mono text-slate-400">No direct sponsor registered for this account.</p>
                  )}
                </div>

                <div className="bg-[#0B1528]/60 border border-white/10 rounded-xl p-5 space-y-4">
                  <h3 className="text-xs font-bold text-white font-mono uppercase tracking-wider text-[#00CFFF] flex items-center gap-2">
                    <Shield className="w-4 h-4" /> Account Role & Security
                  </h3>
                  <div className="space-y-3 text-xs font-mono">
                    <div className="flex justify-between items-center">
                      <span className="text-slate-400">System Role</span>
                      <span className="px-2 py-0.5 rounded bg-[#00CFFF]/10 text-[#00CFFF] font-bold uppercase">{profile.role}</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-slate-400">Account Status</span>
                      <span className={`px-2 py-0.5 rounded font-bold uppercase ${profile.status === 'ACTIVE' ? 'bg-[#32D583]/10 text-[#32D583]' : 'bg-[#F04438]/10 text-[#F04438]'}`}>
                        {profile.status}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* TAB 2: WALLET OVERVIEW & ADJUSTMENTS */}
          {activeTab === 'wallet' && (
            <div className="space-y-6">
              
              {/* BALANCE CARDS + ADJUSTMENT BUTTON */}
              <div className="flex flex-col sm:flex-row items-stretch justify-between gap-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 flex-1">
                  <div className="p-5 rounded-2xl bg-gradient-to-br from-[#0B1528] to-[#070B14] border border-[#00CFFF]/30 space-y-2">
                    <span className="text-xs font-mono text-slate-400 uppercase tracking-wider font-semibold block">USDT Available Balance</span>
                    <div className="text-2xl font-extrabold text-white font-mono tracking-tight tabular-nums">
                      ${walletOverview.usdtAvailableBalance.toFixed(2)} USDT
                    </div>
                    <p className="text-[10px] font-mono text-slate-400">Authoritative server-calculated ledger balance</p>
                  </div>

                  <div className="p-5 rounded-2xl bg-gradient-to-br from-[#0B1528] to-[#070B14] border border-[#4364F7]/30 space-y-2">
                    <span className="text-xs font-mono text-slate-400 uppercase tracking-wider font-semibold block">PHIVO Reward Coin Balance</span>
                    <div className="text-2xl font-extrabold text-[#00CFFF] font-mono tracking-tight tabular-nums">
                      {walletOverview.phivoAvailableBalance.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 6 })} PHIVO
                    </div>
                    <p className="text-[10px] font-mono text-slate-400">Node mining rewards minus completed swaps</p>
                  </div>
                </div>

                <div className="flex flex-col justify-center">
                  <button
                    onClick={() => {
                      setIsAdjustModalOpen(true);
                      setAdjustConfirmStep(false);
                      setAdjustReasonError(null);
                    }}
                    className="h-full px-6 py-4 rounded-2xl bg-gradient-to-r from-[#00CFFF] to-[#4364F7] hover:from-[#00b8e6] hover:to-[#3653d9] text-slate-950 font-mono font-bold text-xs flex items-center justify-center gap-2 shadow-lg cursor-pointer"
                  >
                    <DollarSign className="w-5 h-5" />
                    <span>Adjust Wallet Balance</span>
                  </button>
                </div>
              </div>

              {/* FINANCIAL BREAKDOWN METRICS */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                <div className="p-4 rounded-xl bg-[#0B1528]/60 border border-white/5 space-y-1">
                  <span className="text-[10px] font-mono text-slate-400 uppercase">Total Deposits</span>
                  <div className="text-base font-bold text-white font-mono">${walletOverview.totalDepositsUsdt.toFixed(2)}</div>
                  <span className="text-[10px] font-mono text-slate-500">{walletOverview.depositCount} deposits</span>
                </div>

                <div className="p-4 rounded-xl bg-[#0B1528]/60 border border-white/5 space-y-1">
                  <span className="text-[10px] font-mono text-slate-400 uppercase">Total Withdrawals</span>
                  <div className="text-base font-bold text-white font-mono">${walletOverview.completedWithdrawalsUsdt.toFixed(2)}</div>
                  <span className="text-[10px] font-mono text-slate-500">${walletOverview.pendingWithdrawalsUsdt.toFixed(2)} pending</span>
                </div>

                <div className="p-4 rounded-xl bg-[#0B1528]/60 border border-white/5 space-y-1">
                  <span className="text-[10px] font-mono text-slate-400 uppercase">Total Swaps</span>
                  <div className="text-base font-bold text-[#00CFFF] font-mono">${walletOverview.totalSwapsUsdt.toFixed(2)}</div>
                  <span className="text-[10px] font-mono text-slate-500">{walletOverview.totalSwapsPhivo.toFixed(2)} PHIVO</span>
                </div>

                <div className="p-4 rounded-xl bg-[#0B1528]/60 border border-white/5 space-y-1">
                  <span className="text-[10px] font-mono text-slate-400 uppercase">Node Purchases</span>
                  <div className="text-base font-bold text-white font-mono">${walletOverview.nodePurchasesUsdt.toFixed(2)}</div>
                  <span className="text-[10px] font-mono text-slate-500">{walletOverview.orderCount} orders</span>
                </div>

                <div className="p-4 rounded-xl bg-[#0B1528]/60 border border-white/5 space-y-1">
                  <span className="text-[10px] font-mono text-slate-400 uppercase">Referral Commissions</span>
                  <div className="text-base font-bold text-[#32D583] font-mono">${walletOverview.referralCommissionsUsdt.toFixed(2)}</div>
                  <span className="text-[10px] font-mono text-slate-500">Direct $50 rewards</span>
                </div>

                <div className="p-4 rounded-xl bg-[#0B1528]/60 border border-white/5 space-y-1">
                  <span className="text-[10px] font-mono text-slate-400 uppercase">Binary / Matching</span>
                  <div className="text-base font-bold text-[#32D583] font-mono">${walletOverview.matchingRewardsUsdt.toFixed(2)}</div>
                  <span className="text-[10px] font-mono text-slate-500">Binary tree settlements</span>
                </div>

                <div className="p-4 rounded-xl bg-[#0B1528]/60 border border-white/5 space-y-1">
                  <span className="text-[10px] font-mono text-slate-400 uppercase">Promotion Bonuses</span>
                  <div className="text-base font-bold text-[#32D583] font-mono">${walletOverview.promotionBonusesUsdt.toFixed(2)}</div>
                  <span className="text-[10px] font-mono text-slate-500">Milestone bonuses</span>
                </div>

                <div className="p-4 rounded-xl bg-[#0B1528]/60 border border-white/5 space-y-1">
                  <span className="text-[10px] font-mono text-slate-400 uppercase">Admin Adjustments</span>
                  <div className="text-base font-bold text-amber-400 font-mono">${walletOverview.adminAdjustments.netUsdt.toFixed(2)}</div>
                  <span className="text-[10px] font-mono text-slate-500">+{walletOverview.adminAdjustments.totalCreditsUsdt} / -{walletOverview.adminAdjustments.totalDebitsUsdt}</span>
                </div>
              </div>

              {/* DEPOSIT ADDRESSES */}
              <div className="bg-[#0B1528]/60 border border-white/10 rounded-xl p-5 space-y-4">
                <h3 className="text-xs font-bold text-white font-mono uppercase tracking-wider text-[#00CFFF] flex items-center gap-2">
                  <Coins className="w-4 h-4" /> Assigned On-Chain Deposit Addresses
                </h3>
                {addresses.length > 0 ? (
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs font-mono">
                      <thead>
                        <tr className="text-slate-400 border-b border-white/10 text-[10px] uppercase">
                          <th className="py-2">Asset / Chain</th>
                          <th className="py-2">Deposit Address</th>
                          <th className="py-2">Derivation Index</th>
                          <th className="py-2">Generated At</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-white/5">
                        {addresses.map((a: any) => (
                          <tr key={a.id}>
                            <td className="py-2 text-[#00CFFF] font-bold">{a.asset} (BSC Chain #{a.chainId})</td>
                            <td className="py-2 text-white font-bold">{a.address}</td>
                            <td className="py-2 text-slate-400">Index #{a.derivationIndex}</td>
                            <td className="py-2 text-slate-400">{new Date(a.createdAt).toLocaleDateString()}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <p className="text-xs font-mono text-slate-400">No deposit addresses assigned yet.</p>
                )}
              </div>

            </div>
          )}

          {/* TAB 3: LEDGER TRANSACTIONS */}
          {activeTab === 'transactions' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-xs font-bold text-white font-mono uppercase tracking-wider text-[#00CFFF]">
                  Financial Ledger Entries ({transactions.length})
                </h3>
              </div>

              <div className="overflow-x-auto bg-[#0B1528]/60 border border-white/10 rounded-xl">
                <table className="w-full text-left text-xs font-mono">
                  <thead>
                    <tr className="text-slate-400 border-b border-white/10 text-[10px] uppercase">
                      <th className="py-3 px-3">Date</th>
                      <th className="py-3 px-3">Txn ID</th>
                      <th className="py-3 px-3">Entry</th>
                      <th className="py-3 px-3">Source Type</th>
                      <th className="py-3 px-3">Description</th>
                      <th className="py-3 px-3 text-right">Amount</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/5">
                    {transactions.map((tx: any) => (
                      <tr key={tx.id} className="hover:bg-white/5">
                        <td className="py-2.5 px-3 text-slate-400 whitespace-nowrap">{new Date(tx.createdAt).toLocaleString()}</td>
                        <td className="py-2.5 px-3 font-bold text-white whitespace-nowrap">{tx.publicTxnId}</td>
                        <td className="py-2.5 px-3">
                          <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                            tx.entryType === 'CREDIT' ? 'bg-[#32D583]/10 text-[#32D583]' :
                            tx.entryType === 'DEBIT' ? 'bg-[#F04438]/10 text-[#F04438]' : 'bg-amber-400/10 text-amber-400'
                          }`}>
                            {tx.entryType}
                          </span>
                        </td>
                        <td className="py-2.5 px-3 text-[#00CFFF]">{tx.sourceType}</td>
                        <td className="py-2.5 px-3 text-slate-300 max-w-xs truncate">{tx.description}</td>
                        <td className={`py-2.5 px-3 text-right font-bold tabular-nums ${
                          tx.entryType === 'CREDIT' ? 'text-[#32D583]' : 'text-[#F04438]'
                        }`}>
                          {tx.entryType === 'CREDIT' ? '+' : '-'}{tx.amount} {tx.currency}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* TAB 4: NODES & ORDERS */}
          {activeTab === 'nodes' && (
            <div className="space-y-6">
              <div className="bg-[#0B1528]/60 border border-white/10 rounded-xl p-5 space-y-4">
                <h3 className="text-xs font-bold text-white font-mono uppercase tracking-wider text-[#00CFFF] flex items-center gap-2">
                  <Box className="w-4 h-4" /> Owned Genesis Nodes ({nodes.length})
                </h3>
                {nodes.length > 0 ? (
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 font-mono text-xs">
                    {nodes.map((n: any) => (
                      <div key={n.id} className="p-3 rounded-lg bg-[#05070B] border border-white/10 space-y-1">
                        <div className="flex justify-between items-center">
                          <span className="font-bold text-white">{n.publicNodeId}</span>
                          <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${n.status === 'ACTIVE' ? 'bg-[#32D583]/10 text-[#32D583]' : 'bg-amber-400/10 text-amber-400'}`}>
                            {n.status}
                          </span>
                        </div>
                        <p className="text-[10px] text-slate-400">Node #{n.nodeNumber}</p>
                        <p className="text-[10px] text-slate-500">Activated: {n.activatedAt ? new Date(n.activatedAt).toLocaleDateString() : 'Pending'}</p>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs font-mono text-slate-400">This user does not own any Genesis Nodes.</p>
                )}
              </div>

              <div className="bg-[#0B1528]/60 border border-white/10 rounded-xl p-5 space-y-4">
                <h3 className="text-xs font-bold text-white font-mono uppercase tracking-wider text-[#00CFFF] flex items-center gap-2">
                  <FileText className="w-4 h-4" /> Node Orders History ({orders.length})
                </h3>
                {orders.length > 0 ? (
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs font-mono">
                      <thead>
                        <tr className="text-slate-400 border-b border-white/10 text-[10px] uppercase">
                          <th className="py-2">Order ID</th>
                          <th className="py-2">Node #</th>
                          <th className="py-2">Amount</th>
                          <th className="py-2">Status</th>
                          <th className="py-2">Created</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-white/5">
                        {orders.map((o: any) => (
                          <tr key={o.id}>
                            <td className="py-2 font-bold text-white">{o.publicOrderId}</td>
                            <td className="py-2 text-slate-300">Node #{o.nodeNumber}</td>
                            <td className="py-2 text-[#00CFFF] font-bold">${o.amountUsd.toFixed(2)} USD</td>
                            <td className="py-2">
                              <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${o.status === 'COMPLETED' ? 'bg-[#32D583]/10 text-[#32D583]' : 'bg-amber-400/10 text-amber-400'}`}>
                                {o.status}
                              </span>
                            </td>
                            <td className="py-2 text-slate-400">{new Date(o.createdAt).toLocaleString()}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <p className="text-xs font-mono text-slate-400">No node orders recorded.</p>
                )}
              </div>
            </div>
          )}

          {/* TAB 5: SECURITY & SESSIONS */}
          {activeTab === 'security' && (
            <div className="space-y-6">
              <div className="bg-[#0B1528]/60 border border-white/10 rounded-xl p-5 space-y-4">
                <div className="flex justify-between items-center">
                  <h3 className="text-xs font-bold text-white font-mono uppercase tracking-wider text-[#00CFFF] flex items-center gap-2">
                    <Key className="w-4 h-4" /> User Active Sessions ({sessions.length})
                  </h3>
                  <button
                    onClick={() => { setStatusAction('REVOKE_SESSIONS'); setActionError(null); setActionReason(''); }}
                    className="px-3 py-1.5 rounded-lg bg-[#F04438]/10 hover:bg-[#F04438]/20 border border-[#F04438]/30 text-[#F04438] text-xs font-mono font-bold flex items-center gap-1.5 cursor-pointer"
                  >
                    <LogOut className="w-3.5 h-3.5" /> Revoke All Active Sessions
                  </button>
                </div>

                {sessions.length > 0 ? (
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs font-mono">
                      <thead>
                        <tr className="text-slate-400 border-b border-white/10 text-[10px] uppercase">
                          <th className="py-2">IP Address</th>
                          <th className="py-2">User Agent</th>
                          <th className="py-2">Created</th>
                          <th className="py-2">Expires</th>
                          <th className="py-2">State</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-white/5">
                        {sessions.map((s: any) => (
                          <tr key={s.id}>
                            <td className="py-2 font-bold text-white">{s.ipAddress || 'Unknown'}</td>
                            <td className="py-2 text-slate-300 max-w-xs truncate">{s.userAgent || 'Browser'}</td>
                            <td className="py-2 text-slate-400">{new Date(s.createdAt).toLocaleString()}</td>
                            <td className="py-2 text-slate-400">{new Date(s.expiresAt).toLocaleString()}</td>
                            <td className="py-2">
                              <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${s.isActive ? 'bg-[#32D583]/10 text-[#32D583]' : 'bg-slate-800 text-slate-400'}`}>
                                {s.isActive ? 'ACTIVE' : 'REVOKED/EXPIRED'}
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <p className="text-xs font-mono text-slate-400">No active session records found.</p>
                )}
              </div>

              <div className="bg-[#0B1528]/60 border border-white/10 rounded-xl p-5 space-y-4">
                <h3 className="text-xs font-bold text-white font-mono uppercase tracking-wider text-[#00CFFF] flex items-center gap-2">
                  <Shield className="w-4 h-4" /> Security Activity Events ({securityEvents.length})
                </h3>
                {securityEvents.length > 0 ? (
                  <div className="space-y-2 font-mono text-xs">
                    {securityEvents.map((se: any) => (
                      <div key={se.id} className="p-3 rounded-lg bg-[#05070B] border border-white/5 flex items-center justify-between gap-3">
                        <div>
                          <span className="font-bold text-[#00CFFF] block">{se.eventType}</span>
                          <span className="text-slate-300">{se.description}</span>
                        </div>
                        <span className="text-[10px] text-slate-400 whitespace-nowrap">{new Date(se.createdAt).toLocaleString()}</span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs font-mono text-slate-400">No security events logged.</p>
                )}
              </div>
            </div>
          )}

          {/* TAB 6: AUDIT HISTORY */}
          {activeTab === 'audit' && (
            <div className="space-y-4">
              <h3 className="text-xs font-bold text-white font-mono uppercase tracking-wider text-[#00CFFF] flex items-center gap-2">
                <History className="w-4 h-4" /> Administrative Audit Records ({auditLogs.length})
              </h3>
              {auditLogs.length > 0 ? (
                <div className="space-y-3 font-mono text-xs">
                  {auditLogs.map((al: any) => (
                    <div key={al.id} className="p-4 rounded-xl bg-[#0B1528]/60 border border-white/10 space-y-2">
                      <div className="flex justify-between items-center border-b border-white/5 pb-2">
                        <span className="font-bold text-[#00CFFF]">{al.action}</span>
                        <span className="text-slate-400 text-[10px]">{new Date(al.createdAt).toLocaleString()}</span>
                      </div>
                      <p className="text-slate-200">{al.details}</p>
                      <div className="flex justify-between items-center text-[10px] text-slate-400 pt-1">
                        <span>Admin: {al.adminPublicId}</span>
                        <span>IP: {al.ipAddress || 'Internal'}</span>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-xs font-mono text-slate-400">No administrative audit records found for this user.</p>
              )}
            </div>
          )}

        </div>

      </div>

      {/* WALLET ADJUSTMENT MODAL */}
      {isAdjustModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/90 backdrop-blur-md flex items-center justify-center p-4">
          <div className="bg-[#07101D] border border-white/20 rounded-2xl p-6 max-w-lg w-full space-y-5 shadow-2xl">
            <div className="flex justify-between items-center border-b border-white/10 pb-4">
              <h3 className="text-base font-bold text-white font-mono flex items-center gap-2">
                <DollarSign className="w-5 h-5 text-[#00CFFF]" /> Adjust Wallet Balance
              </h3>
              <button onClick={() => setIsAdjustModalOpen(false)} className="text-slate-400 hover:text-white cursor-pointer">
                <X className="w-5 h-5" />
              </button>
            </div>

            {adjustError && (
              <div className="p-3 rounded-lg bg-[#F04438]/10 border border-[#F04438]/30 text-[#F04438] text-xs font-mono">
                {adjustError}
              </div>
            )}

            {!adjustConfirmStep ? (
              <div className="space-y-4 text-xs font-mono">
                <div>
                  <label className="text-slate-400 uppercase font-semibold block mb-1">Target User</label>
                  <input
                    type="text"
                    disabled
                    value={`${profile.fullName} (${profile.publicId})`}
                    className="w-full px-3 py-2 bg-[#05070B] border border-white/10 rounded-lg text-slate-300 font-bold"
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-slate-400 uppercase font-semibold block mb-1">Asset</label>
                    <select
                      value={adjustAsset}
                      onChange={(e) => setAdjustAsset(e.target.value as any)}
                      className="w-full px-3 py-2 bg-[#05070B] border border-white/10 rounded-lg text-white font-bold outline-none"
                    >
                      <option value="USDT">USDT</option>
                      <option value="PHIVO">PHIVO</option>
                    </select>
                  </div>

                  <div>
                    <label className="text-slate-400 uppercase font-semibold block mb-1">Direction</label>
                    <select
                      value={adjustDirection}
                      onChange={(e) => setAdjustDirection(e.target.value as any)}
                      className="w-full px-3 py-2 bg-[#05070B] border border-white/10 rounded-lg text-white font-bold outline-none"
                    >
                      <option value="CREDIT">CREDIT (+ Add)</option>
                      <option value="DEBIT">DEBIT (- Deduct)</option>
                    </select>
                  </div>
                </div>

                <div>
                  <label className="text-slate-400 uppercase font-semibold block mb-1">Amount</label>
                  <input
                    type="number"
                    step="any"
                    placeholder="0.00"
                    value={adjustAmount}
                    onChange={(e) => setAdjustAmount(e.target.value)}
                    className="w-full px-3 py-2 bg-[#05070B] border border-white/10 rounded-lg text-white font-bold text-base outline-none focus:border-[#00CFFF]"
                  />
                </div>

                <div>
                  <label className="text-slate-400 uppercase font-semibold block mb-1">Mandatory Administrative Reason *</label>
                  <textarea
                    rows={3}
                    placeholder="Provide explicit reason for reconciliation / audit entry (min 5 chars)..."
                    value={adjustReason}
                    onChange={(e) => setAdjustReason(e.target.value)}
                    className="w-full px-3 py-2 bg-[#05070B] border border-white/10 rounded-lg text-white outline-none focus:border-[#00CFFF]"
                  />
                </div>

                <div className="flex justify-end gap-3 pt-2">
                  <button
                    onClick={() => setIsAdjustModalOpen(false)}
                    className="px-4 py-2 rounded-xl bg-white/10 hover:bg-white/20 text-white font-bold cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={() => {
                      if (!adjustAmount || Number(adjustAmount) <= 0) {
                        setAdjustReasonError('Please enter a valid positive amount.');
                        return;
                      }
                      if (!adjustReason || adjustReason.trim().length < 5) {
                        setAdjustReasonError('Administrative reason is mandatory (minimum 5 characters).');
                        return;
                      }
                      setAdjustReasonError(null);
                      setAdjustConfirmStep(true);
                    }}
                    className="px-4 py-2 rounded-xl bg-[#00CFFF] text-slate-950 font-bold cursor-pointer hover:bg-[#00b8e6]"
                  >
                    Review Adjustment
                  </button>
                </div>
              </div>
            ) : (
              <div className="space-y-4 text-xs font-mono">
                <div className="p-4 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-300 space-y-2">
                  <span className="font-bold block text-sm flex items-center gap-1.5">
                    <AlertTriangle className="w-4 h-4" /> Final Confirmation Required
                  </span>
                  <p>
                    You are about to execute an immutable server-authoritative {adjustDirection} of {adjustAmount} {adjustAsset} for user {profile.publicId}. This will create an audited financial ledger entry.
                  </p>
                </div>

                <div className="p-4 rounded-xl bg-[#05070B] border border-white/10 space-y-2">
                  <div className="flex justify-between">
                    <span className="text-slate-400">Target User:</span>
                    <span className="text-white font-bold">{profile.fullName} ({profile.publicId})</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400">Action:</span>
                    <span className={adjustDirection === 'CREDIT' ? 'text-[#32D583] font-bold' : 'text-[#F04438] font-bold'}>
                      {adjustDirection}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400">Amount & Asset:</span>
                    <span className="text-white font-bold">{adjustAmount} {adjustAsset}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400">Reason:</span>
                    <span className="text-slate-300 italic">{adjustReason}</span>
                  </div>
                </div>

                <div className="flex justify-end gap-3 pt-2">
                  <button
                    onClick={() => setAdjustConfirmStep(false)}
                    disabled={adjustSubmitting}
                    className="px-4 py-2 rounded-xl bg-white/10 hover:bg-white/20 text-white font-bold cursor-pointer"
                  >
                    Back
                  </button>
                  <button
                    onClick={handleExecuteAdjustment}
                    disabled={adjustSubmitting}
                    className={`px-5 py-2 rounded-xl text-slate-950 font-bold flex items-center gap-2 cursor-pointer ${
                      adjustDirection === 'CREDIT' ? 'bg-[#32D583] hover:bg-[#28b86e]' : 'bg-[#F04438] text-white hover:bg-[#d9382d]'
                    }`}
                  >
                    {adjustSubmitting ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                    Confirm {adjustDirection}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ACCOUNT ACTION MODAL (LOCK / UNLOCK / REVOKE SESSIONS) */}
      {statusAction && (
        <div className="fixed inset-0 z-50 bg-black/90 backdrop-blur-md flex items-center justify-center p-4">
          <div className="bg-[#07101D] border border-white/20 rounded-2xl p-6 max-w-md w-full space-y-4 shadow-2xl">
            <div className="flex justify-between items-center border-b border-white/10 pb-3">
              <h3 className="text-base font-bold text-white font-mono">
                {statusAction === 'LOCK' && 'Lock User Account'}
                {statusAction === 'UNLOCK' && 'Unlock User Account'}
                {statusAction === 'REVOKE_SESSIONS' && 'Revoke All Active Sessions'}
              </h3>
              <button onClick={() => setStatusAction(null)} className="text-slate-400 hover:text-white cursor-pointer">
                <X className="w-5 h-5" />
              </button>
            </div>

            {actionError && (
              <div className="p-3 rounded-lg bg-[#F04438]/10 border border-[#F04438]/30 text-[#F04438] text-xs font-mono">
                {actionError}
              </div>
            )}

            <div className="space-y-3 text-xs font-mono">
              <p className="text-slate-300">
                Target User: <strong className="text-white">{profile.fullName} ({profile.publicId})</strong>
              </p>

              <div>
                <label className="text-slate-400 uppercase font-semibold block mb-1">Mandatory Administrative Reason *</label>
                <textarea
                  rows={3}
                  placeholder="Provide explicit audit reason (min 5 chars)..."
                  value={actionReason}
                  onChange={(e) => setActionReason(e.target.value)}
                  className="w-full px-3 py-2 bg-[#05070B] border border-white/10 rounded-lg text-white outline-none focus:border-[#00CFFF]"
                />
              </div>

              <div className="flex justify-end gap-3 pt-2">
                <button
                  onClick={() => setStatusAction(null)}
                  disabled={actionSubmitting}
                  className="px-4 py-2 rounded-xl bg-white/10 hover:bg-white/20 text-white font-bold cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  onClick={handleExecuteAccountAction}
                  disabled={actionSubmitting}
                  className="px-4 py-2 rounded-xl bg-[#00CFFF] text-slate-950 font-bold cursor-pointer hover:bg-[#00b8e6] flex items-center gap-2"
                >
                  {actionSubmitting && <RefreshCw className="w-4 h-4 animate-spin" />}
                  Confirm Action
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};
