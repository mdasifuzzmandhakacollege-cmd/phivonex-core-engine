import React, { useState, useEffect } from 'react';
import {
  Server,
  Layers,
  Coins,
  CheckCircle2,
  AlertCircle,
  ArrowRight,
  Loader2,
  Zap,
  Sparkles,
  Info,
  ShieldCheck,
  Wallet,
} from 'lucide-react';
import { UserProfile } from '../../context/AuthContext';
import { useSystemConfig } from '../../context/SystemConfigContext';
import { GENESIS_NODE_CAP, NODE_BASE_PRICE_USD } from '../../config/nodeConfig';
import { UsdtIcon } from '../brand/CryptoIcons';

interface BuyNodeViewProps {
  user: UserProfile;
  onNavigateTab: (tab: string) => void;
}

interface NodeStats {
  genesisCap: number;
  basePriceUsd: number;
  available: number;
  reserved: number;
  active: number;
  retired: number;
  allocated: number;
}

export const BuyNodeView: React.FC<BuyNodeViewProps> = ({ user, onNavigateTab }) => {
  const { nodeBasePriceUsd: realTimeNodePrice } = useSystemConfig();
  const [stats, setStats] = useState<NodeStats | null>(null);
  const [availableBalance, setAvailableBalance] = useState<number>(0);
  const [nodeQty, setNodeQty] = useState<number>(1);
  const [loading, setLoading] = useState<boolean>(true);
  const [purchasing, setPurchasing] = useState<boolean>(false);
  const [purchaseKeys, setPurchaseKeys] = useState<string[]>([]);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [activatedNodes, setActivatedNodes] = useState<Array<{ publicNodeId: string; nodeNumber: number }>>([]);
  const [activeOffers, setActiveOffers] = useState<any[]>([]);

  const nodePrice = realTimeNodePrice || stats?.basePriceUsd || NODE_BASE_PRICE_USD;
  const totalCost = nodeQty * nodePrice;
  const isSufficient = availableBalance >= totalCost;

  const loadData = async (isBackground = false) => {
    if (!isBackground) setErrorMsg(null);
    try {
      const [statsRes, walletRes, promoRes, valRes] = await Promise.all([
        fetch('/api/nodes/stats'),
        fetch('/api/wallet/me', { credentials: 'include' }),
        fetch('/api/promotions/offers', { credentials: 'include' }),
        fetch('/api/node-orders/balance-validation', { credentials: 'include' }),
      ]);

      if (statsRes.ok) {
        const statsData = await statsRes.json();
        setStats(statsData);
      }

      let walletAvail = 0;
      if (walletRes.ok) {
        const walletData = await walletRes.json();
        walletAvail = Number(walletData.availableBalance || walletData.ledgerBalance || 0);
      }

      if (valRes.ok) {
        const valData = await valRes.json();
        if (valData.success && valData.validation?.usdtBalance) {
          walletAvail = Math.max(walletAvail, Number(valData.validation.usdtBalance.available || 0));
        }
      }

      setAvailableBalance(walletAvail);

      if (promoRes.ok) {
        const promoData = await promoRes.json();
        setActiveOffers(promoData.offers || []);
      }
    } catch (err) {
      if (!isBackground) {
        console.error('Failed to load buy node data:', err);
        setErrorMsg('Failed to fetch protocol inventory.');
      }
    } finally {
      if (!isBackground) setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handlePurchase = async () => {
    setErrorMsg(null);
    setSuccessMsg(null);

    if (!isSufficient) {
      setErrorMsg(`Insufficient available balance ($${availableBalance.toFixed(2)} USDT available, $${totalCost.toFixed(2)} required). Please deposit funds.`);
      return;
    }

    // Generate stable idempotency keys if not already present or if quantity changed
    let currentKeys = purchaseKeys;
    if (currentKeys.length !== nodeQty) {
      currentKeys = Array.from({ length: nodeQty }, (_, i) => 
        `node-purchase-${user.id || 'usr'}-${Date.now()}-${i}-${Math.random().toString(36).substring(2, 9)}`
      );
      setPurchaseKeys(currentKeys);
    }

    setPurchasing(true);
    try {
      const results: Array<{ publicNodeId: string; nodeNumber: number }> = [];

      for (let i = 0; i < nodeQty; i++) {
        const idempotencyKey = currentKeys[i];
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 20000);

        try {
          const res = await fetch('/api/node-orders/activate-with-asset', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            signal: controller.signal,
            body: JSON.stringify({ asset: 'USDT', idempotencyKey }),
          });

          clearTimeout(timeoutId);
          const data = await res.json();
          if (!res.ok) {
            throw new Error(data.message || data.error || 'Failed to purchase node.');
          }

          if (data.result?.node) {
            results.push({
              publicNodeId: data.result.node.publicNodeId,
              nodeNumber: data.result.node.nodeNumber,
            });
          } else if (data.node) {
            results.push({
              publicNodeId: data.node.publicNodeId,
              nodeNumber: data.node.nodeNumber,
            });
          }
        } catch (fetchErr: any) {
          clearTimeout(timeoutId);

          if (fetchErr.name === 'AbortError') {
            // Client timed out: reconcile with authoritative orders to verify if it committed
            try {
              const ordersRes = await fetch('/api/node-orders/me', { credentials: 'include' });
              if (ordersRes.ok) {
                const ordersData = await ordersRes.json();
                const matchedOrder = (ordersData.orders || []).find(
                  (o: any) => o.idempotencyKey === idempotencyKey && o.status === 'COMPLETED'
                );
                if (matchedOrder) {
                  results.push({
                    publicNodeId: matchedOrder.publicNodeId,
                    nodeNumber: matchedOrder.nodeNumber,
                  });
                  continue;
                }
              }
            } catch (reconErr) {
              console.warn('[BuyNodeView Reconciliation Warning]', reconErr);
            }
            throw new Error('Node purchase timed out. If the order was processed, your node will appear in My Nodes. You can safely retry.');
          } else {
            throw fetchErr;
          }
        }
      }

      setActivatedNodes(results);
      setSuccessMsg(`Successfully purchased and activated ${results.length} Genesis Node(s)!`);
      setPurchaseKeys([]); // Clear keys upon complete success
      window.dispatchEvent(new CustomEvent('phivonex:balance-or-tx-updated'));
      await loadData(true);
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to process node purchase.');
    } finally {
      setPurchasing(false);
    }
  };

  return (
    <div className="space-y-6 sm:space-y-8 animate-fadeIn max-w-5xl mx-auto pb-12">
      
      {/* Top Header Banner */}
      <div className="p-6 sm:p-8 rounded-2xl bg-gradient-to-r from-[#07101D] via-[#0A1A2F] to-[#07101D] border border-white/[0.08] shadow-2xl relative overflow-hidden">
        <div className="absolute top-0 right-0 w-96 h-96 bg-[#00CFFF]/5 rounded-full blur-3xl pointer-events-none" />
        
        <div className="relative z-10 space-y-4">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[#00CFFF]/10 border border-[#00CFFF]/30 text-[#00CFFF] text-xs font-mono font-semibold">
            <Server className="w-3.5 h-3.5" />
            <span>PHIVONEX Genesis Network</span>
          </div>

          <h1 className="text-2xl sm:text-3xl font-bold text-white tracking-tight">
            Acquire Genesis Nodes
          </h1>

          <p className="text-xs sm:text-sm text-[#98A2B3] max-w-2xl leading-relaxed">
            Genesis Nodes validate network transitions, secure decentralized consensus, and earn proportional daily block mining rewards. Use your available USDT balance to acquire active nodes instantly.
          </p>

          <div className="flex flex-wrap items-center gap-6 pt-2 text-xs font-mono">
            <div>
              <span className="text-[#98A2B3] block text-[10px] uppercase">Unit Price</span>
              <span className="text-lg font-bold text-white font-mono">${nodePrice.toLocaleString()} USD</span>
            </div>
            <div className="h-8 w-px bg-white/[0.08]" />
            <div>
              <span className="text-[#98A2B3] block text-[10px] uppercase">Consensus Tier</span>
              <span className="text-lg font-bold text-[#00CFFF] font-mono flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-[#00CFFF] animate-pulse" />
                Genesis Alpha
              </span>
            </div>
            <div className="h-8 w-px bg-white/[0.08]" />
            <div>
              <span className="text-[#98A2B3] block text-[10px] uppercase">Allocation Status</span>
              <span className="text-lg font-bold text-[#32D583] font-mono flex items-center gap-1.5">
                <ShieldCheck className="w-4 h-4 text-[#32D583]" />
                Open & Validating
              </span>
            </div>
            <div className="h-8 w-px bg-white/[0.08]" />
            <div>
              <span className="text-[#98A2B3] block text-[10px] uppercase">Network Capacity</span>
              <span className="text-lg font-bold text-slate-200 font-mono">
                Decentralized Active
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Active Promotional Offer Cards */}
      {activeOffers && activeOffers.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center justify-between text-xs font-mono text-[#98A2B3]">
            <span className="flex items-center gap-1.5 text-purple-300 font-bold uppercase tracking-wider">
              <Sparkles className="w-3.5 h-3.5 text-purple-400" />
              Active Promotional Offers & Bonuses ({activeOffers.length})
            </span>
            <span className="text-[11px] text-emerald-400 font-semibold">Auto-applied upon activation</span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {activeOffers.map((offer) => (
              <div
                key={offer.id}
                className="p-4 sm:p-5 rounded-2xl bg-gradient-to-r from-purple-950/40 via-[#0D1B30] to-indigo-950/40 border border-purple-500/30 hover:border-purple-400/50 shadow-xl transition-all relative overflow-hidden flex flex-col justify-between"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-start gap-3">
                    <div className="w-9 h-9 rounded-xl bg-purple-500/20 border border-purple-400/30 flex items-center justify-center text-purple-300 shrink-0 mt-0.5">
                      <Sparkles className="w-4 h-4" />
                    </div>
                    <div>
                      <div className="text-xs sm:text-sm font-bold text-white tracking-tight flex items-center gap-2">
                        <span>{offer.title}</span>
                      </div>
                      <div className="text-[11px] text-[#98A2B3] mt-1 leading-relaxed">
                        {offer.description}
                      </div>
                    </div>
                  </div>
                  <span className="px-2.5 py-1 rounded-lg text-[10px] sm:text-xs font-mono bg-purple-500/20 border border-purple-400/40 text-purple-300 font-bold shrink-0 uppercase tracking-wider">
                    +{offer.bonusNodesCount || 1} Bonus Node
                  </span>
                </div>

                <div className="mt-3 pt-3 border-t border-white/[0.06] flex items-center justify-between text-[11px] font-mono">
                  <span className="text-[#32D583] flex items-center gap-1">
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    Eligibility: Active for all accounts
                  </span>
                  <span className="text-purple-300 font-semibold">
                    {offer.offerType === 'BOGO_FREE_NODE' ? 'BOGO Promo' : 'Limited Offer'}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Success Notification */}
      {successMsg && (
        <div className="p-4 rounded-xl bg-[#32D583]/10 border border-[#32D583]/30 text-[#32D583] text-xs flex items-center justify-between gap-3 animate-fadeIn">
          <div className="flex items-center gap-2.5">
            <CheckCircle2 className="w-5 h-5 shrink-0" />
            <span className="font-medium">{successMsg}</span>
          </div>
          <button
            onClick={() => onNavigateTab('nodes')}
            className="text-xs font-bold text-white underline hover:text-[#32D583] transition-colors cursor-pointer"
          >
            View My Nodes →
          </button>
        </div>
      )}

      {/* Error Notification */}
      {errorMsg && (
        <div className="p-4 rounded-xl bg-[#F04438]/10 border border-[#F04438]/30 text-[#F04438] text-xs flex items-center justify-between gap-3 animate-fadeIn">
          <div className="flex items-center gap-2.5">
            <AlertCircle className="w-5 h-5 shrink-0" />
            <span className="font-medium">{errorMsg}</span>
          </div>
          {!isSufficient && (
            <button
              onClick={() => onNavigateTab('deposit')}
              className="px-3 py-1.5 rounded-lg bg-[#00CFFF] hover:bg-[#00CFFF]/90 text-[#05070B] font-bold text-[11px] transition-all cursor-pointer shrink-0"
            >
              Go to Deposit
            </button>
          )}
        </div>
      )}

      {/* Activated Nodes List */}
      {activatedNodes.length > 0 && (
        <div className="p-6 rounded-2xl bg-[#07101D] border-2 border-[#32D583]/40 shadow-2xl space-y-4 animate-scaleUp">
          <div className="flex items-center gap-2 text-[#32D583]">
            <CheckCircle2 className="w-5 h-5" />
            <h2 className="text-sm font-bold font-mono uppercase tracking-wider">Newly Activated Genesis Nodes</h2>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {activatedNodes.map((node, idx) => (
              <div key={idx} className="p-4 rounded-xl bg-[#05070B] border border-white/[0.08] flex items-center justify-between font-mono">
                <div>
                  <span className="text-[10px] text-[#98A2B3] block">NODE ID</span>
                  <span className="text-sm font-bold text-[#00CFFF]">{node.publicNodeId}</span>
                </div>
                <div className="text-right">
                  <span className="text-[10px] text-[#98A2B3] block">CONSENSUS STATUS</span>
                  <span className="text-xs font-bold text-[#32D583] flex items-center gap-1 justify-end">
                    <span className="w-1.5 h-1.5 rounded-full bg-[#32D583]" />
                    Active & Staked
                  </span>
                </div>
              </div>
            ))}
          </div>
          <div className="pt-2">
            <button
              onClick={() => onNavigateTab('nodes')}
              className="w-full py-3 rounded-xl bg-[#00CFFF] hover:bg-[#00CFFF]/90 text-[#05070B] font-bold text-xs flex items-center justify-center gap-2 transition-all cursor-pointer shadow-lg"
            >
              <span>View All My Nodes in Dashboard</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* MAIN PURCHASE CARD */}
      <div className="p-6 sm:p-8 rounded-2xl bg-[#07101D] border border-white/[0.08] shadow-2xl space-y-6">
        
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-6 border-b border-white/[0.08]">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-xl bg-[#00CFFF]/10 border border-[#00CFFF]/30 text-[#00CFFF] flex items-center justify-center">
              <Layers className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-base font-bold text-white">Purchase Genesis Nodes</h2>
              <p className="text-xs text-[#98A2B3]">Instantly pay with your available account balance (USDT)</p>
            </div>
          </div>

          {/* Available Balance Box */}
          <div className="flex items-center gap-3 p-3.5 rounded-xl bg-[#05070B] border border-white/[0.1] font-mono">
            <Wallet className="w-5 h-5 text-[#32D583]" />
            <div>
              <div className="text-[10px] text-[#98A2B3] uppercase">Available Balance</div>
              <div className="text-base font-bold text-[#32D583]">${availableBalance.toFixed(2)} USDT</div>
            </div>
          </div>
        </div>

        {/* Quantity Selector & Cost Breakdown */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <label className="text-xs font-mono text-[#98A2B3] uppercase tracking-wider">
              Select Number of Nodes
            </label>
            <span className="text-xs font-mono text-white">
              1 Node = ${nodePrice.toLocaleString()} USD
            </span>
          </div>

          <div className="grid grid-cols-4 gap-2 sm:gap-3">
            {[1, 2, 5, 10].map((qty) => (
              <button
                key={qty}
                type="button"
                onClick={() => setNodeQty(qty)}
                className={`py-3 rounded-xl border text-xs font-bold font-mono transition-all cursor-pointer flex flex-col items-center gap-1 ${
                  nodeQty === qty
                    ? 'bg-[#00CFFF]/15 border-[#00CFFF] text-[#00CFFF] shadow-lg shadow-[#00CFFF]/10'
                    : 'bg-[#05070B] border-white/[0.08] text-slate-300 hover:border-white/[0.2]'
                }`}
              >
                <span>{qty} {qty === 1 ? 'Node' : 'Nodes'}</span>
                <span className="text-[10px] text-[#98A2B3]">${(qty * nodePrice).toLocaleString()}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Total Cost Summary Card */}
        <div className="p-5 rounded-xl bg-[#05070B] border border-white/[0.08] space-y-3 font-mono">
          <div className="flex items-center justify-between text-xs">
            <span className="text-[#98A2B3]">Selected Quantity:</span>
            <span className="text-white font-bold">{nodeQty} Genesis Node(s)</span>
          </div>
          <div className="flex items-center justify-between text-xs">
            <span className="text-[#98A2B3]">Unit Price:</span>
            <span className="text-white">${nodePrice.toLocaleString()} USD</span>
          </div>
          <div className="h-px bg-white/[0.06]" />
          <div className="flex items-center justify-between text-sm">
            <span className="text-white font-bold">Total Cost:</span>
            <span className="text-[#00CFFF] font-bold text-base">${totalCost.toLocaleString()} USDT</span>
          </div>
        </div>

        {/* Balance Status & Action Button */}
        <div className="space-y-3 pt-2">
          {!isSufficient ? (
            <div className="p-4 rounded-xl bg-[#F04438]/10 border border-[#F04438]/30 flex flex-col sm:flex-row items-center justify-between gap-3">
              <div className="flex items-center gap-2.5 text-[#F04438] text-xs">
                <AlertCircle className="w-5 h-5 shrink-0" />
                <span>Insufficient balance. You need ${(totalCost - availableBalance).toFixed(2)} more USDT.</span>
              </div>
              <button
                type="button"
                onClick={() => onNavigateTab('deposit')}
                className="w-full sm:w-auto px-4 py-2 rounded-lg bg-[#00CFFF] hover:bg-[#00CFFF]/90 text-[#05070B] font-bold text-xs transition-all cursor-pointer shrink-0"
              >
                Go to Deposit Section →
              </button>
            </div>
          ) : (
            <div className="p-3 rounded-xl bg-[#32D583]/10 border border-[#32D583]/30 text-[#32D583] text-xs flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 shrink-0" />
              <span>Sufficient available balance. Ready for instant activation.</span>
            </div>
          )}

          <button
            type="button"
            onClick={handlePurchase}
            disabled={purchasing}
            className="w-full py-4 rounded-xl bg-gradient-to-r from-[#00CFFF] to-[#168BFF] hover:brightness-110 text-[#05070B] font-extrabold text-sm flex items-center justify-center gap-2 transition-all cursor-pointer shadow-xl shadow-[#00CFFF]/25 disabled:opacity-50 min-h-[52px]"
          >
            {purchasing ? (
              <>
                <Loader2 className="w-5 h-5 animate-spin text-[#05070B]" />
                <span>Processing Node Acquisition...</span>
              </>
            ) : (
              <>
                <Zap className="w-5 h-5 fill-[#05070B]" />
                <span>Buy {nodeQty} Genesis Node Now (${totalCost.toLocaleString()} USDT)</span>
              </>
            )}
          </button>
        </div>

        {/* Security / Protocol Info */}
        <div className="flex flex-wrap items-center justify-between gap-4 pt-4 border-t border-white/[0.08] text-[11px] text-[#98A2B3]">
          <div className="flex items-center gap-1.5 text-emerald-400">
            <ShieldCheck className="w-4 h-4" />
            <span>Instant On-Chain &amp; Ledger Verification</span>
          </div>
          <div className="flex items-center gap-1.5">
            <Info className="w-4 h-4 text-[#00CFFF]" />
            <span>No extra deposit needed here (Deposits managed in Deposit tab)</span>
          </div>
        </div>

      </div>

    </div>
  );
};
