import React, { useState, useEffect, useCallback } from 'react';
import {
  Sparkles,
  Gift,
  ShieldCheck,
  Coins,
  CheckCircle2,
  AlertCircle,
  X,
  Wallet,
  ArrowRight,
  Loader2,
  Server,
  Zap,
  Tag,
  CreditCard
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';

export interface PromotionalOffer {
  id: string;
  title: string;
  description: string;
  bannerImage: string;
  offerType: 'BOGO_FREE_NODE' | 'FREE_BONUS_NODE' | 'DISCOUNT' | 'CUSTOM';
  bonusNodesCount: number;
  bonusMiningRewards: boolean;
  bonusMatchingEnabled: boolean;
  bonusReferralCommission: boolean;
  promotionalPriceUsd?: number;
  discountPercent?: number;
  badgeTag?: string;
  totalAllocatedSlots?: number;
  claimedSlots?: number;
  startDate: string;
  endDate: string;
  status: 'ACTIVE' | 'INACTIVE';
  targetAudience: 'ALL' | 'NEW' | 'VIP';
  priorityOrder: number;
}

interface OfferPaymentModalProps {
  isOpen: boolean;
  offer: PromotionalOffer | null;
  onClose: () => void;
  onNavigateTab?: (tab: string) => void;
  onSuccess?: () => void;
}

export const OfferPaymentModal: React.FC<OfferPaymentModalProps> = ({
  isOpen,
  offer,
  onClose,
  onNavigateTab,
  onSuccess,
}) => {
  const { user } = useAuth();
  const [availableBalance, setAvailableBalance] = useState<number>(0);
  const [loadingBalance, setLoadingBalance] = useState<boolean>(true);
  const [paying, setPaying] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successData, setSuccessData] = useState<any | null>(null);

  // Fetch current available deposit balance
  const fetchBalance = useCallback(async () => {
    try {
      setLoadingBalance(true);
      const res = await fetch('/api/wallet/me', { credentials: 'include' });
      if (res.ok) {
        const data = await res.json();
        setAvailableBalance(Number(data.availableBalance || 0));
      }
    } catch {
      // fallback
    } finally {
      setLoadingBalance(false);
    }
  }, []);

  useEffect(() => {
    if (isOpen) {
      fetchBalance();
      setSuccessData(null);
      setErrorMsg(null);
    }
  }, [isOpen, fetchBalance]);

  if (!isOpen || !offer) return null;

  const costUsd = offer.promotionalPriceUsd && offer.promotionalPriceUsd > 0 ? offer.promotionalPriceUsd : 1000.0;
  const hasEnoughBalance = availableBalance >= costUsd;
  const shortfall = Math.max(0, costUsd - availableBalance);

  const handlePayAndClaim = async () => {
    setErrorMsg(null);
    setPaying(true);

    try {
      const res = await fetch(`/api/promotions/offers/${offer.id}/claim-and-pay`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ preferredAsset: 'USDT' }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.message || 'Payment execution failed.');
      }

      setSuccessData(data);
      if (onSuccess) onSuccess();
    } catch (err: any) {
      setErrorMsg(err.message || 'Payment failed. Please check your available balance.');
    } finally {
      setPaying(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/85 backdrop-blur-md animate-fadeIn">
      <div className="relative w-full max-w-lg rounded-3xl bg-[#07101E] border border-purple-500/30 shadow-2xl shadow-purple-950/50 overflow-hidden">
        
        {/* Header Bar */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-white/[0.08] bg-gradient-to-r from-purple-950/40 via-[#0A162B] to-indigo-950/40">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-purple-500/20 border border-purple-400/30 flex items-center justify-center text-purple-300">
              <Gift className="w-5 h-5 text-purple-400" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-sm sm:text-base font-bold text-white font-mono">
                  Promotional Offer Checkout
                </h2>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-purple-500/20 text-purple-300 border border-purple-500/30">
                  {offer.offerType}
                </span>
              </div>
              <p className="text-[11px] text-[#98A2B3]">
                Instant validator node provisioning &amp; promotional bonus allocation
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-xl bg-white/[0.04] hover:bg-white/[0.08] text-[#98A2B3] hover:text-white transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-6 space-y-5">
          {successData ? (
            <div className="text-center space-y-4 py-3">
              <div className="w-16 h-16 mx-auto rounded-3xl bg-emerald-500/20 border border-emerald-400/40 flex items-center justify-center text-emerald-400 shadow-xl shadow-emerald-500/20">
                <CheckCircle2 className="w-9 h-9" />
              </div>

              <div className="space-y-1">
                <h3 className="text-lg font-bold text-white">Promotional Node Provisioned!</h3>
                <p className="text-xs text-[#98A2B3] max-w-sm mx-auto">
                  {successData.message || 'Your Genesis Node and Free Bonus Node have been activated and are actively mining PHIVO coins.'}
                </p>
              </div>

              <div className="p-4 rounded-2xl bg-black/50 border border-white/[0.08] text-left font-mono text-xs space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-slate-400">Primary Node:</span>
                  <span className="text-cyan-400 font-bold">{successData.node?.publicNodeId || 'PHX-NODE'}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-slate-400">Bonus Perk:</span>
                  <span className="text-emerald-400 font-bold">+{offer.bonusNodesCount || 1} Free Promo Node</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-slate-400">Payment Deducted:</span>
                  <span className="text-white font-bold">${costUsd.toFixed(2)} USDT</span>
                </div>
              </div>

              <div className="pt-2 flex items-center justify-center gap-3">
                <button
                  type="button"
                  onClick={() => {
                    onClose();
                    if (onNavigateTab) onNavigateTab('nodes');
                  }}
                  className="px-6 py-2.5 rounded-xl bg-purple-600 hover:bg-purple-500 text-white font-bold text-xs shadow-lg shadow-purple-600/30 cursor-pointer transition-all"
                >
                  View My Nodes
                </button>
              </div>
            </div>
          ) : (
            <>
              {/* Offer Summary Card */}
              <div className="p-4 rounded-2xl bg-gradient-to-r from-purple-950/30 via-[#0A1428] to-indigo-950/30 border border-purple-500/20 space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-bold text-white">{offer.title}</h3>
                  <span className="px-2.5 py-0.5 rounded-lg text-xs font-mono font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                    +{offer.bonusNodesCount || 1} Free Node
                  </span>
                </div>
                <p className="text-xs text-[#98A2B3] leading-relaxed">
                  {offer.description}
                </p>

                <div className="flex flex-wrap items-center gap-2 pt-1 font-mono text-[11px]">
                  <span className="px-2 py-0.5 rounded-md bg-black/40 border border-white/[0.08] text-cyan-300 flex items-center gap-1">
                    <Coins className="w-3 h-3 text-cyan-400" />
                    Daily Mining ROI Active
                  </span>
                  <span className="px-2 py-0.5 rounded-md bg-black/40 border border-white/[0.08] text-emerald-300 flex items-center gap-1">
                    <ShieldCheck className="w-3 h-3 text-emerald-400" />
                    Consensus Backed
                  </span>
                </div>
              </div>

              {/* Price & Balance Breakdown */}
              <div className="p-4 rounded-2xl bg-black/40 border border-white/[0.08] space-y-3 font-mono text-xs">
                <div className="flex items-center justify-between text-slate-400">
                  <span>Standard Node Price:</span>
                  <span className="text-slate-300">$1,000.00 USDT</span>
                </div>

                {offer.discountPercent && offer.discountPercent > 0 && (
                  <div className="flex items-center justify-between text-emerald-400">
                    <span>Promotional Discount:</span>
                    <span>-{offer.discountPercent}%</span>
                  </div>
                )}

                <div className="flex items-center justify-between text-white font-bold pt-2 border-t border-white/[0.08]">
                  <span>Total Due Today:</span>
                  <span className="text-base text-purple-300">${costUsd.toFixed(2)} USDT</span>
                </div>

                <div className="flex items-center justify-between pt-2 border-t border-white/[0.06]">
                  <span className="text-slate-400 flex items-center gap-1.5">
                    <Wallet className="w-3.5 h-3.5 text-cyan-400" />
                    <span>Your Available Balance:</span>
                  </span>
                  <span className={`font-bold ${hasEnoughBalance ? 'text-emerald-400' : 'text-amber-400'}`}>
                    ${availableBalance.toFixed(2)} USDT
                  </span>
                </div>

                {!hasEnoughBalance && (
                  <div className="p-2.5 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-300 text-[11px] flex items-center justify-between">
                    <span>Shortfall Amount:</span>
                    <span className="font-bold">${shortfall.toFixed(2)} USDT</span>
                  </div>
                )}
              </div>

              {errorMsg && (
                <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{errorMsg}</span>
                </div>
              )}

              {/* CTA Action Buttons */}
              <div className="pt-2 space-y-2">
                {hasEnoughBalance ? (
                  <button
                    type="button"
                    onClick={handlePayAndClaim}
                    disabled={paying}
                    className="w-full py-3 px-4 rounded-xl bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white font-bold text-xs font-mono flex items-center justify-center gap-2 shadow-xl shadow-purple-600/30 cursor-pointer transition-all disabled:opacity-50"
                  >
                    {paying ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        <span>Provisioning Nodes...</span>
                      </>
                    ) : (
                      <>
                        <Zap className="w-4 h-4" />
                        <span>Confirm &amp; Pay ${costUsd.toFixed(2)} USDT</span>
                      </>
                    )}
                  </button>
                ) : (
                  <div className="space-y-2">
                    <button
                      type="button"
                      onClick={() => {
                        onClose();
                        if (onNavigateTab) onNavigateTab('deposit');
                      }}
                      className="w-full py-3 px-4 rounded-xl bg-gradient-to-r from-cyan-400 to-blue-500 hover:from-cyan-300 hover:to-blue-400 text-black font-bold text-xs font-mono flex items-center justify-center gap-2 shadow-xl shadow-cyan-500/25 cursor-pointer transition-all"
                    >
                      <span>Deposit ${shortfall.toFixed(2)} USDT to Unlock Offer</span>
                      <ArrowRight className="w-4 h-4" />
                    </button>
                    <p className="text-[10px] text-center text-[#98A2B3] font-mono">
                      Fast on-chain deposit via BNB Smart Chain (BEP-20)
                    </p>
                  </div>
                )}
              </div>
            </>
          )}
        </div>

      </div>
    </div>
  );
};
