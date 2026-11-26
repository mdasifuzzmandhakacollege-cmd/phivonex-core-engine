import React, { useState, useEffect, useCallback } from 'react';
import { PhxGlassCard, HolographicTiltCard, TabularCounter, MaturityArcGauge } from '../ui/phivonex';
import { GenesisCoreEmblem } from '../brand';
import {
  Server,
  Coins,
  ArrowLeftRight,
  CheckCircle2,
  AlertCircle,
  Loader2,
  ShieldCheck,
  X,
  FileCheck2,
  Sparkles,
  Wallet,
} from 'lucide-react';

interface GenesisCoreHubProps {
  user: any;
  onNavigateTab: (tab: string) => void;
}

interface OwnedGenesisNode {
  publicNodeId: string;
  nodeNumber: number;
  status: 'ACTIVE' | 'MATURED' | string;
  purchasePriceUsd: string;
  dailyPhivoEmission: string;
  lifetimePhivoAllocation: string;
  distributedPhivo: string;
  remainingPhivo: string;
  progressPercent: number;
  activatedAt: string | null;
  maturityTimestamp: string | null;
}

interface GenesisOverviewData {
  totalSupplyCap: number;
  soldCount: number;
  reservedCount: number;
  activeCount: number;
  maturedCount: number;
  remainingCount: number;
  nodePriceUsd: string;
  dailyPhivoEmissionRate: string;
  lifetimePhivoAllocation: string;
  phivoReferencePriceUsd: string;
  swapEnabled: boolean;
  userSummary: {
    ownedNodesCount: number;
    activeNodesCount: number;
    maturedNodesCount: number;
    totalDistributedPhivo: string;
    totalRemainingPhivo: string;
    unclaimedPhivoRewards: string;
    unclaimedUsdEquivalent: string;
    claimedPhivoWalletBalance: string;
    claimedPhivoUsdEquivalent: string;
    mainUsdtWalletBalance: string;
    nodes: OwnedGenesisNode[];
  };
}

export const GenesisCoreHub: React.FC<GenesisCoreHubProps> = ({ onNavigateTab }) => {
  const [overview, setOverview] = useState<GenesisOverviewData | null>(null);
  const [loading, setLoading] = useState(true);
  const [claiming, setClaiming] = useState(false);
  const [swapping, setSwapping] = useState(false);
  const [swapInput, setSwapInput] = useState<string>('');
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [nodePurchaseEnabled, setNodePurchaseEnabled] = useState<boolean>(true);
  const [swapFeatureEnabled, setSwapFeatureEnabled] = useState<boolean>(true);

  // Mandatory Genesis Node Participation Terms & Conditions Modal
  const [showTermsModal, setShowTermsModal] = useState(false);
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [purchasingNode, setPurchasingNode] = useState(false);
  const [purchaseModalError, setPurchaseModalError] = useState<string | null>(null);

  const fetchOverview = useCallback(async () => {
    try {
      const [res, cfgRes] = await Promise.all([
        fetch('/api/genesis-nodes/overview', { credentials: 'include' }),
        fetch('/api/public/ecosystem-config'),
      ]);
      const payload = await res.json();
      if (res.ok && payload?.data) {
        setOverview(payload.data);
      }
      if (cfgRes.ok) {
        const cfgData = await cfgRes.json();
        if (cfgData?.featureSwitches) {
          if (typeof cfgData.featureSwitches.genesis_node_purchase_enabled === 'boolean') {
            setNodePurchaseEnabled(cfgData.featureSwitches.genesis_node_purchase_enabled);
          }
          if (typeof cfgData.featureSwitches.phivo_instant_swap_enabled === 'boolean') {
            setSwapFeatureEnabled(cfgData.featureSwitches.phivo_instant_swap_enabled);
          }
        }
      }
    } catch (err) {
      console.warn('Failed to load Genesis Core overview:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchOverview();
  }, [fetchOverview]);

  const totalSupplyCap = overview?.totalSupplyCap ?? 10000;
  const soldCount = overview?.soldCount ?? 0;
  const remainingCount = overview?.remainingCount ?? Math.max(0, totalSupplyCap - soldCount);
  const mintedPct = totalSupplyCap > 0 ? Math.min(100, (soldCount / totalSupplyCap) * 100) : 0;

  const nodePriceUsd = parseFloat(overview?.nodePriceUsd || '1000');
  const dailyEmission = parseFloat(overview?.dailyPhivoEmissionRate || '15');
  const lifetimeCap = parseFloat(overview?.lifetimePhivoAllocation || '10000');
  const phivoRefPrice = parseFloat(overview?.phivoReferencePriceUsd || '0.10');
  const isSwapLive = swapFeatureEnabled && (overview?.swapEnabled ?? true);

  const userSummary = overview?.userSummary;
  const userNodes: OwnedGenesisNode[] = userSummary?.nodes || [];
  const unclaimedPhivo = parseFloat(userSummary?.unclaimedPhivoRewards || '0');
  const claimedPhivoBalance = parseFloat(userSummary?.claimedPhivoWalletBalance || '0');
  const mainUsdtBalance = parseFloat(userSummary?.mainUsdtWalletBalance || '0');

  const swapNumeric = parseFloat(swapInput) || 0;
  const estimatedSwapUsdt = swapNumeric * phivoRefPrice;

  const handleOpenPurchaseModal = () => {
    setPurchaseModalError(null);
    setTermsAccepted(false);
    setShowTermsModal(true);
  };

  const handleConfirmNodePurchase = async () => {
    if (!termsAccepted) return;
    setPurchaseModalError(null);
    setPurchasingNode(true);

    try {
      const idempotencyKey = `genesis-node-buy-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      const res = await fetch('/api/node-orders/activate-with-asset', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          asset: 'USDT',
          idempotencyKey,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        setPurchaseModalError(
          data.message || data.error || 'Unable to acquire Genesis Node. Please check your Main USDT Wallet balance.'
        );
        return;
      }

      const publicNodeId = data.node?.publicNodeId || data.publicNodeId || 'Genesis Validator Node';
      setSuccessMsg(
        `Genesis Node Activated (${publicNodeId})! Your node is now emitting ${dailyEmission.toFixed(2)} PHIVO daily up to ${lifetimeCap.toLocaleString()} PHIVO.`
      );
      setShowTermsModal(false);
      await fetchOverview();
    } catch (err: any) {
      setPurchaseModalError(err?.message || 'Network error while activating Genesis Node.');
    } finally {
      setPurchasingNode(false);
    }
  };

  const handleClaimRewards = async () => {
    setErrorMsg(null);
    setSuccessMsg(null);
    setClaiming(true);

    try {
      const res = await fetch('/api/rewards/claim', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.message || data.error || 'No claimable PHIVO rewards available right now.');
      }

      const claimedTotal = parseFloat(data.totalClaimedAmount || '0');
      setSuccessMsg(
        `Claimed ${claimedTotal.toFixed(4)} PHIVO directly into your PHIVO Wallet! You can now hold or swap instantly to USDT.`
      );
      await fetchOverview();
    } catch (err: any) {
      setErrorMsg(err?.message || 'Failed to claim node validation rewards.');
    } finally {
      setClaiming(false);
    }
  };

  const handleExecuteSwap = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setSuccessMsg(null);

    if (swapNumeric <= 0) {
      setErrorMsg('Enter a valid PHIVO amount greater than 0 to swap.');
      return;
    }
    if (swapNumeric > claimedPhivoBalance) {
      setErrorMsg('Swap amount exceeds your available PHIVO Wallet balance. Claim accrued rewards first.');
      return;
    }

    setSwapping(true);
    try {
      const idempotencyKey = `phivo-swap-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      const res = await fetch('/api/swap/coin-to-usdt', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          coinAmount: swapNumeric,
          idempotencyKey,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.message || data.error || 'PHIVO to USDT swap failed.');
      }

      const receivedUsdt = parseFloat(data.swap?.usdtAmount || data.usdtAmount || String(estimatedSwapUsdt));
      setSuccessMsg(
        `Swapped ${swapNumeric.toFixed(4)} PHIVO into $${receivedUsdt.toFixed(2)} USDT — credited directly to your Main USDT Wallet.`
      );
      setSwapInput('');
      await fetchOverview();
    } catch (err: any) {
      setErrorMsg(err?.message || 'Network error while executing PHIVO swap.');
    } finally {
      setSwapping(false);
    }
  };

  return (
    <div className="space-y-8 animate-fadeIn">
      {/* Hero Banner & Live Global Supply Telemetry */}
      <div className="rounded-[28px] bg-gradient-to-br from-[#050807] via-[#09151C] to-[#050807] border border-white/10 p-6 sm:p-8 shadow-2xl relative overflow-hidden">
        <div className="absolute -right-12 -top-12 w-96 h-96 bg-[#00E5FF]/8 rounded-full blur-3xl pointer-events-none" />

        <div className="relative z-10 flex flex-col lg:flex-row items-start lg:items-center justify-between gap-6">
          <div className="space-y-3 max-w-2xl">
            <div className="flex flex-wrap items-center gap-2">
              <span className="px-3 py-1 rounded-full text-[11px] font-mono font-bold tracking-wider uppercase bg-[#00E5FF]/15 text-[#00E5FF] border border-[#00E5FF]/35">
                {totalSupplyCap.toLocaleString()} HARD-CAPPED SUPPLY
              </span>
              <span className="text-[11px] font-mono text-[#F5B800] px-2.5 py-1 rounded-lg bg-[#F5B800]/10 border border-[#F5B800]/30">
                1 PHIVO = ${phivoRefPrice.toFixed(2)} USDT SWAP RATE
              </span>
              <span className="text-[11px] font-mono text-[#00E676] px-2.5 py-1 rounded-lg bg-[#00E676]/10 border border-[#00E676]/25">
                7 DAYS / WEEK EMISSION
              </span>
            </div>

            <h1 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight">
              PHIVONEX GENESIS CORE™
            </h1>

            <p className="text-xs sm:text-sm text-[#98A2B3] leading-relaxed">
              Sovereign capped-supply validator infrastructure emitting{' '}
              <strong className="text-white">{dailyEmission.toFixed(2)} PHIVO/day</strong> (7 days/week) up to a guaranteed{' '}
              <strong className="text-white">{lifetimeCap.toLocaleString()} PHIVO</strong> lifetime allocation per node, with 1-click reward claims and instant USDT conversion.
            </p>
          </div>

          {/* Acquire Genesis Node Action Card */}
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-4 bg-[#050807]/90 backdrop-blur-xl p-4 sm:p-5 rounded-2xl border border-[#00E5FF]/25 w-full lg:w-auto shadow-[0_0_28px_rgba(0,229,255,0.08)]">
            <div className="text-left">
              <span className="text-[10px] font-mono text-[#98A2B3] uppercase block">Genesis Node Price</span>
              <div className="text-2xl font-extrabold font-mono text-white tabular-nums">
                ${nodePriceUsd.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}{' '}
                <span className="text-xs text-[#00E5FF]">USDT</span>
              </div>
              <span className="text-[10px] font-mono text-[#00E676]">
                Wallet: ${mainUsdtBalance.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} USDT
              </span>
            </div>

            <div className="h-10 w-[1px] bg-white/10 hidden sm:block" />

            <button
              type="button"
              onClick={handleOpenPurchaseModal}
              disabled={!nodePurchaseEnabled || remainingCount <= 0}
              className="py-3.5 px-6 rounded-xl bg-gradient-to-r from-[#00E5FF] to-[#168BFF] hover:from-[#1eeaff] hover:to-[#2b95ff] text-[#050807] font-extrabold text-xs uppercase tracking-wider flex items-center justify-center gap-2 transition-all shadow-lg shadow-[#00E5FF]/20 cursor-pointer disabled:opacity-50"
            >
              <Server className="w-4 h-4" />
              <span>
                {!nodePurchaseEnabled
                  ? 'Node Minting Paused'
                  : remainingCount <= 0
                  ? 'Global Cap Reached'
                  : 'Acquire Genesis Node'}
              </span>
            </button>
          </div>
        </div>

        {/* Live Global Supply Scarcity Bar */}
        <div className="relative z-10 mt-8 pt-6 border-t border-white/10 space-y-2.5">
          <div className="flex flex-wrap items-center justify-between gap-2 text-xs font-mono tabular-nums">
            <span className="text-white font-bold">
              {soldCount.toLocaleString()} / {totalSupplyCap.toLocaleString()} Genesis Nodes Minted
            </span>
            <span className="text-[#00E5FF]">
              {remainingCount.toLocaleString()} Remaining ({mintedPct.toFixed(2)}% Minted)
            </span>
          </div>
          <div className="w-full h-3.5 rounded-full bg-[#050807] overflow-hidden p-0.5 border border-white/10">
            <div
              className="h-full rounded-full bg-gradient-to-r from-[#00E5FF] via-[#00E676] to-[#F5B800] transition-all duration-1000"
              style={{ width: `${Math.max(mintedPct, soldCount > 0 ? 1.2 : 0)}%` }}
            />
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-3 font-mono">
            <div className="p-3 rounded-xl bg-[#050807]/80 border border-white/10">
              <span className="text-[10px] text-[#98A2B3] uppercase block">Daily Emission</span>
              <span className="text-sm font-bold text-[#00E5FF]">{dailyEmission.toFixed(2)} PHIVO / Day</span>
            </div>
            <div className="p-3 rounded-xl bg-[#050807]/80 border border-white/10">
              <span className="text-[10px] text-[#98A2B3] uppercase block">Lifetime Cap / Node</span>
              <span className="text-sm font-bold text-white">{lifetimeCap.toLocaleString()} PHIVO</span>
            </div>
            <div className="p-3 rounded-xl bg-[#050807]/80 border border-white/10">
              <span className="text-[10px] text-[#98A2B3] uppercase block">Your Active Nodes</span>
              <span className="text-sm font-bold text-[#00E676]">
                {userSummary?.activeNodesCount ?? 0} Active / {userSummary?.ownedNodesCount ?? 0} Total
              </span>
            </div>
            <div className="p-3 rounded-xl bg-[#050807]/80 border border-white/10">
              <span className="text-[10px] text-[#98A2B3] uppercase block">Instant Swap Parity</span>
              <span className="text-sm font-bold text-[#F5B800]">1 PHIVO = ${phivoRefPrice.toFixed(2)}</span>
            </div>
          </div>
        </div>
      </div>

      {(!nodePurchaseEnabled || !isSwapLive) && (
        <div className="p-4 rounded-xl bg-[#F5B800]/10 border border-[#F5B800]/35 text-xs text-[#F5B800] flex items-center gap-3">
          <AlertCircle className="w-5 h-5 shrink-0" />
          <div>
            <div className="font-mono font-bold uppercase tracking-wider">
              Protocol Governance Notice
            </div>
            <p className="text-[#98A2B3] mt-0.5">
              {!nodePurchaseEnabled && !isSwapLive
                ? 'Genesis Node minting and PHIVO Instant Swap are currently paused by protocol governance.'
                : !nodePurchaseEnabled
                ? 'New Genesis Node minting is temporarily paused by protocol governance.'
                : 'PHIVO Instant Swap is temporarily paused by protocol governance.'}
            </p>
          </div>
        </div>
      )}

      {errorMsg && (
        <div className="p-3.5 rounded-xl bg-[#F04438]/10 border border-[#F04438]/35 text-xs text-[#FF8A80] flex items-center gap-2.5">
          <AlertCircle className="w-4 h-4 text-[#F04438] shrink-0" />
          <span>{errorMsg}</span>
        </div>
      )}

      {successMsg && (
        <div className="p-3.5 rounded-xl bg-[#00E676]/10 border border-[#00E676]/35 text-xs text-[#69F0AE] flex items-center gap-2.5">
          <CheckCircle2 className="w-4 h-4 text-[#00E676] shrink-0" />
          <span>{successMsg}</span>
        </div>
      )}

      {/* Dual Action Bar: 1-Click Claim Rewards + Instant PHIVO -> USDT Swap Widget */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Card 1: 1-Click Reward Claim */}
        <PhxGlassCard accent="cyan">
          <div className="flex flex-col h-full justify-between gap-5">
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-mono text-[#00E5FF] uppercase tracking-widest flex items-center gap-1.5">
                  <Sparkles className="w-3.5 h-3.5" />
                  Accrued Unclaimed PHIVO
                </span>
                <span className="text-[10px] font-mono text-[#98A2B3]">
                  ≈ ${(unclaimedPhivo * phivoRefPrice).toFixed(2)} USDT
                </span>
              </div>
              <div className="text-3xl font-extrabold font-mono text-white tabular-nums">
                <TabularCounter value={unclaimedPhivo} decimals={4} suffix=" PHIVO" />
              </div>
              <p className="text-xs text-[#98A2B3]">
                Claim accrued daily validator emissions directly into your PHIVO Wallet in a single click.
              </p>
            </div>

            <button
              type="button"
              onClick={handleClaimRewards}
              disabled={claiming || unclaimedPhivo <= 0}
              className="w-full py-3.5 px-5 rounded-xl bg-gradient-to-r from-[#00E676] to-[#00C853] hover:brightness-110 text-[#050807] font-extrabold text-xs uppercase tracking-wider flex items-center justify-center gap-2 transition-all shadow-lg shadow-[#00E676]/20 cursor-pointer disabled:opacity-45"
            >
              {claiming ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Claiming PHIVO Emissions...</span>
                </>
              ) : (
                <>
                  <Coins className="w-4 h-4" />
                  <span>Claim Rewards ({unclaimedPhivo.toFixed(2)} PHIVO)</span>
                </>
              )}
            </button>
          </div>
        </PhxGlassCard>

        {/* Card 2: Instant PHIVO -> USDT Swap Widget */}
        <PhxGlassCard accent="gold">
          <form onSubmit={handleExecuteSwap} className="space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-mono text-[#F5B800] uppercase tracking-widest flex items-center gap-1.5">
                <ArrowLeftRight className="w-3.5 h-3.5" />
                Instant Swap PHIVO → USDT
              </span>
              <span className="text-[11px] font-mono text-white font-semibold tabular-nums">
                PHIVO Wallet: {claimedPhivoBalance.toFixed(4)} PHIVO
              </span>
            </div>

            <div className="relative">
              <input
                type="number"
                min="0.01"
                step="0.01"
                max={claimedPhivoBalance > 0 ? claimedPhivoBalance : undefined}
                value={swapInput}
                onChange={(e) => setSwapInput(e.target.value)}
                placeholder="Enter PHIVO amount to swap"
                className="w-full pl-4 pr-20 py-3 rounded-xl bg-[#050807] border border-white/15 text-white font-mono text-base font-bold tabular-nums focus:outline-none focus:border-[#F5B800]"
              />
              <span className="absolute inset-y-0 right-4 flex items-center text-xs font-mono font-bold text-[#F5B800]">
                PHIVO
              </span>
            </div>

            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-1.5">
                {[0.25, 0.5, 1].map((ratio) => (
                  <button
                    key={ratio}
                    type="button"
                    disabled={claimedPhivoBalance <= 0}
                    onClick={() => setSwapInput((claimedPhivoBalance * ratio).toFixed(4))}
                    className="px-2.5 py-1 rounded-lg bg-white/[0.04] hover:bg-white/[0.1] border border-white/10 text-[10px] font-mono font-bold text-slate-300 cursor-pointer disabled:opacity-40"
                  >
                    {ratio === 1 ? 'MAX' : `${ratio * 100}%`}
                  </button>
                ))}
              </div>
              <div className="text-xs font-mono text-[#00E676] font-bold tabular-nums">
                Receive: ≈ ${estimatedSwapUsdt.toFixed(2)} USDT
              </div>
            </div>

            <button
              type="submit"
              disabled={swapping || !isSwapLive || swapNumeric <= 0 || swapNumeric > claimedPhivoBalance}
              className="w-full py-3.5 px-5 rounded-xl bg-gradient-to-r from-[#F5B800] to-[#FF9D00] hover:brightness-110 text-[#050807] font-extrabold text-xs uppercase tracking-wider flex items-center justify-center gap-2 transition-all shadow-lg shadow-[#F5B800]/20 cursor-pointer disabled:opacity-45"
            >
              {!isSwapLive ? (
                <span>Instant Swap Paused by Governance</span>
              ) : swapping ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Converting PHIVO to USDT...</span>
                </>
              ) : (
                <>
                  <ArrowLeftRight className="w-4 h-4" />
                  <span>Swap PHIVO → USDT</span>
                </>
              )}
            </button>
          </form>
        </PhxGlassCard>
      </div>

      {/* Owned Genesis Node Inventory */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-extrabold text-white flex items-center gap-2">
            <Server className="w-5 h-5 text-[#00E5FF]" />
            <span>My Genesis Node Fleet</span>
          </h2>
          <span className="text-xs font-mono text-[#98A2B3]">
            {userNodes.length} Owned {userNodes.length === 1 ? 'Node' : 'Nodes'}
          </span>
        </div>

        {loading ? (
          <div className="py-16 flex items-center justify-center">
            <Loader2 className="w-8 h-8 animate-spin text-[#00E5FF]" />
          </div>
        ) : userNodes.length === 0 ? (
          <PhxGlassCard className="text-center py-12">
            <Server className="w-12 h-12 text-white/20 mx-auto mb-3" />
            <h3 className="text-sm font-bold text-white mb-1">No Genesis Nodes Owned Yet</h3>
            <p className="text-xs text-[#98A2B3] max-w-md mx-auto mb-6">
              Acquire your first Genesis Core™ validator node to earn {dailyEmission.toFixed(2)} PHIVO daily (7 days/week) up to a {lifetimeCap.toLocaleString()} PHIVO lifetime allocation.
            </p>
            <button
              type="button"
              onClick={handleOpenPurchaseModal}
              disabled={!nodePurchaseEnabled}
              className="py-3 px-6 rounded-xl bg-gradient-to-r from-[#00E5FF] to-[#168BFF] text-[#050807] font-extrabold text-xs uppercase tracking-wider cursor-pointer disabled:opacity-50"
            >
              Acquire First Genesis Node ($1,000.00 USDT)
            </button>
          </PhxGlassCard>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {userNodes.map((node) => {
              const distributed = parseFloat(node.distributedPhivo || '0');
              const allocation = parseFloat(node.lifetimePhivoAllocation || '10000');
              const remaining = parseFloat(node.remainingPhivo || String(Math.max(0, allocation - distributed)));
              const pct = allocation > 0 ? Math.min(100, (distributed / allocation) * 100) : 0;
              const isMatured = node.status === 'MATURED';

              return (
                <HolographicTiltCard key={node.publicNodeId} accent={isMatured ? 'gold' : 'cyan'}>
                  <div className="p-6 space-y-5">
                    <div className="flex items-center justify-between">
                      <GenesisCoreEmblem status={node.status as any} size={48} />
                      <span
                        className={`px-2.5 py-1 rounded-full text-[10px] font-mono font-bold uppercase border ${
                          isMatured
                            ? 'bg-[#F5B800]/15 text-[#F5B800] border-[#F5B800]/35'
                            : 'bg-[#00E676]/15 text-[#00E676] border-[#00E676]/35'
                        }`}
                      >
                        {node.status}
                      </span>
                    </div>

                    <div>
                      <span className="text-[10px] font-mono text-[#98A2B3] uppercase">Validator Serial ID</span>
                      <h3 className="text-base font-extrabold font-mono text-white tracking-tight mt-0.5">
                        {node.publicNodeId}
                      </h3>
                      <span className="text-[11px] font-mono text-[#00E5FF]">
                        +{parseFloat(node.dailyPhivoEmission || '15').toFixed(2)} PHIVO / Day
                      </span>
                    </div>

                    {/* Radial & Linear Maturity Progress */}
                    <div className="pt-4 border-t border-white/10 space-y-3">
                      <div className="flex items-center justify-between gap-3">
                        <div className="space-y-1">
                          <span className="text-[10px] font-mono text-[#98A2B3] uppercase block">
                            Emission Progress
                          </span>
                          <div className="text-sm font-bold font-mono text-white tabular-nums">
                            {distributed.toLocaleString('en-US', { maximumFractionDigits: 2 })} /{' '}
                            {allocation.toLocaleString('en-US', { maximumFractionDigits: 0 })} PHIVO
                          </div>
                          <span className="text-[10px] font-mono text-[#98A2B3] block">
                            Remaining: {remaining.toLocaleString('en-US', { maximumFractionDigits: 2 })} PHIVO
                          </span>
                        </div>
                        <MaturityArcGauge value={distributed} max={allocation} size={68} strokeWidth={6} label="" />
                      </div>

                      <div className="w-full h-2 rounded-full bg-[#050807] overflow-hidden border border-white/10">
                        <div
                          className={`h-full rounded-full transition-all duration-700 ${
                            isMatured
                              ? 'bg-gradient-to-r from-[#F5B800] to-[#00E676]'
                              : 'bg-gradient-to-r from-[#00E5FF] to-[#00E676]'
                          }`}
                          style={{ width: `${Math.max(pct, distributed > 0 ? 1.5 : 0)}%` }}
                        />
                      </div>
                    </div>
                  </div>
                </HolographicTiltCard>
              );
            })}
          </div>
        )}
      </div>

      {/* Mandatory Genesis Node Participation Terms & Conditions Modal */}
      {showTermsModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-fadeIn">
          <div className="w-full max-w-lg rounded-3xl bg-[#071018] border border-[#00E5FF]/40 shadow-2xl overflow-hidden">
            <div className="p-6 border-b border-white/10 flex items-start justify-between gap-4 bg-gradient-to-r from-[#00E5FF]/10 to-transparent">
              <div>
                <span className="text-[10px] font-mono font-bold uppercase tracking-widest text-[#00E5FF]">
                  GENESIS CORE™ VALIDATOR ACQUISITION
                </span>
                <h3 className="text-lg font-extrabold text-white mt-1 flex items-center gap-2">
                  <FileCheck2 className="w-5 h-5 text-[#00E5FF]" />
                  <span>Genesis Node Participation Terms &amp; Conditions</span>
                </h3>
              </div>
              <button
                type="button"
                onClick={() => !purchasingNode && setShowTermsModal(false)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-white/10 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 space-y-5">
              {/* Summary Grid */}
              <div className="grid grid-cols-2 gap-3 font-mono text-xs">
                <div className="p-3.5 rounded-xl bg-[#050807] border border-white/10">
                  <span className="text-[10px] text-[#98A2B3] uppercase block">Node Acquisition Price</span>
                  <span className="text-base font-extrabold text-white mt-0.5 block">
                    ${nodePriceUsd.toFixed(2)} USDT
                  </span>
                </div>
                <div className="p-3.5 rounded-xl bg-[#050807] border border-white/10">
                  <span className="text-[10px] text-[#98A2B3] uppercase block">Your Main USDT Wallet</span>
                  <span
                    className={`text-base font-extrabold mt-0.5 block ${
                      mainUsdtBalance >= nodePriceUsd ? 'text-[#00E676]' : 'text-[#F04438]'
                    }`}
                  >
                    ${mainUsdtBalance.toFixed(2)} USDT
                  </span>
                </div>
              </div>

              {/* Terms List */}
              <div className="rounded-2xl bg-[#050807]/90 border border-white/10 p-4 space-y-2.5 text-xs text-[#98A2B3]">
                <div className="text-[10px] font-mono uppercase tracking-wider text-white font-bold flex items-center gap-1.5 mb-1">
                  <ShieldCheck className="w-3.5 h-3.5 text-[#00E5FF]" />
                  <span>Node License &amp; Emission Terms</span>
                </div>
                <p>
                  1. <strong className="text-white">Hard-Capped Validator Supply:</strong> Genesis Core™ is strictly limited to {totalSupplyCap.toLocaleString()} total validator nodes globally. Each activated node receives a unique serial identifier (<span className="font-mono text-white">PHX-NODE-XXXXXX</span>).
                </p>
                <p>
                  2. <strong className="text-white">Daily PHIVO Emission Schedule:</strong> Active nodes emit {dailyEmission.toFixed(2)} PHIVO daily (7 days/week UTC) until reaching the lifetime cap of {lifetimeCap.toLocaleString()} PHIVO, at which point the node transitions to <span className="font-mono text-[#F5B800]">MATURED</span> status.
                </p>
                <p>
                  3. <strong className="text-white">Finality &amp; Liquidity Conversion:</strong> Node acquisition debits ${nodePriceUsd.toFixed(2)} USDT immediately from your Main USDT Wallet and is non-reversible once minted. Claimed PHIVO emissions may be swapped into USDT at the active reference swap rate (${phivoRefPrice.toFixed(2)} USDT/PHIVO).
                </p>
              </div>

              {mainUsdtBalance < nodePriceUsd && (
                <div className="p-3 rounded-xl bg-[#F5B800]/10 border border-[#F5B800]/35 text-xs text-[#F5B800] flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <Wallet className="w-4 h-4 shrink-0" />
                    <span>Insufficient USDT balance. Deposit at least ${(nodePriceUsd - mainUsdtBalance).toFixed(2)} USDT to proceed.</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setShowTermsModal(false);
                      onNavigateTab('wallet');
                    }}
                    className="px-2.5 py-1 rounded-lg bg-[#F5B800] text-[#050807] font-bold text-[10px] uppercase shrink-0 cursor-pointer"
                  >
                    Fund Wallet
                  </button>
                </div>
              )}

              {/* Mandatory Checkbox */}
              <label className="flex items-start gap-3 p-3.5 rounded-xl bg-white/[0.03] border border-white/10 cursor-pointer hover:border-[#00E5FF]/40 transition-colors">
                <input
                  type="checkbox"
                  checked={termsAccepted}
                  onChange={(e) => setTermsAccepted(e.target.checked)}
                  className="mt-0.5 rounded border-white/25 bg-[#050807] text-[#00E5FF] focus:ring-[#00E5FF]"
                />
                <span className="text-xs text-slate-200 leading-relaxed">
                  I have read, understood, and agree to the Genesis Core™ Node Participation Terms, 10,000 PHIVO lifetime emission cap, and immediate ${nodePriceUsd.toFixed(2)} USDT debit from my Main USDT Wallet.
                </span>
              </label>

              {purchaseModalError && (
                <div className="p-3 rounded-xl bg-[#F04438]/12 border border-[#F04438]/40 text-xs text-[#FF8A80] flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 text-[#F04438] shrink-0" />
                  <span>{purchaseModalError}</span>
                </div>
              )}

              <div className="flex items-center gap-3 pt-1">
                <button
                  type="button"
                  disabled={purchasingNode}
                  onClick={() => setShowTermsModal(false)}
                  className="flex-1 py-3 rounded-xl bg-white/[0.05] hover:bg-white/[0.1] border border-white/15 text-xs font-bold text-white cursor-pointer disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={!termsAccepted || purchasingNode || mainUsdtBalance < nodePriceUsd}
                  onClick={handleConfirmNodePurchase}
                  className="flex-1 py-3 rounded-xl bg-gradient-to-r from-[#00E5FF] to-[#168BFF] text-[#050807] font-extrabold text-xs uppercase tracking-wider flex items-center justify-center gap-2 cursor-pointer disabled:opacity-40 shadow-lg shadow-[#00E5FF]/20"
                >
                  {purchasingNode ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span>Minting Node...</span>
                    </>
                  ) : (
                    <>
                      <CheckCircle2 className="w-4 h-4" />
                      <span>Confirm &amp; Acquire Node</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
