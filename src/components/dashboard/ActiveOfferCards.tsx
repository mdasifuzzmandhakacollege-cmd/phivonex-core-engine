import React, { useState, useEffect, useCallback } from 'react';
import {
  Gift,
  Sparkles,
  ArrowRight,
  CheckCircle2,
  Tag,
  Zap,
  Clock,
  Layers,
  Coins,
  ShieldCheck,
  ChevronRight,
  ExternalLink
} from 'lucide-react';

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
  startDate: string;
  endDate: string;
  status: 'ACTIVE' | 'INACTIVE';
  targetAudience: 'ALL' | 'NEW' | 'VIP';
  priorityOrder: number;
}

interface ActiveOfferCardsProps {
  onNavigateTab?: (tab: string) => void;
  compact?: boolean;
}

export const ActiveOfferCards: React.FC<ActiveOfferCardsProps> = ({ onNavigateTab, compact = false }) => {
  const [offers, setOffers] = useState<PromotionalOffer[]>([]);
  const [loading, setLoading] = useState<boolean>(true);

  const fetchOffers = useCallback(async () => {
    try {
      const res = await fetch('/api/promotions/offers', { credentials: 'include' });
      if (res.ok) {
        const data = await res.json();
        if (data.success && Array.isArray(data.offers)) {
          setOffers(data.offers.filter((o: PromotionalOffer) => o.status === 'ACTIVE'));
        }
      }
    } catch (err) {
      console.error('[ActiveOfferCards] Failed to fetch offers:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchOffers();
  }, [fetchOffers]);

  if (loading || offers.length === 0) {
    return null;
  }

  const handleClaimOffer = (offer: PromotionalOffer) => {
    if (onNavigateTab) {
      onNavigateTab('nodes/buy');
    }
  };

  const getBadgeText = (offer: PromotionalOffer) => {
    switch (offer.offerType) {
      case 'BOGO_FREE_NODE':
        return 'SPECIAL BOGO PROMO';
      case 'FREE_BONUS_NODE':
        return 'BONUS NODE GIFT';
      case 'DISCOUNT':
        return 'LIMITED DISCOUNT';
      default:
        return 'EXCLUSIVE OFFER';
    }
  };

  return (
    <div className="space-y-3 animate-fadeIn">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 rounded-lg bg-purple-500/10 border border-purple-500/20 flex items-center justify-center text-purple-400">
            <Gift className="w-3.5 h-3.5" />
          </div>
          <h2 className="text-xs sm:text-sm font-bold text-white uppercase tracking-wider font-mono flex items-center gap-2">
            <span>Active Ecosystem Offers &amp; Bonuses</span>
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
          </h2>
        </div>
        <span className="text-[11px] font-mono text-purple-300 bg-purple-500/10 px-2 py-0.5 rounded border border-purple-500/20">
          {offers.length} {offers.length === 1 ? 'Offer Active' : 'Offers Active'}
        </span>
      </div>

      <div className={`grid gap-4 ${compact ? 'grid-cols-1' : 'grid-cols-1 md:grid-cols-2'}`}>
        {offers.map((offer) => (
          <div
            key={offer.id}
            className="p-5 rounded-2xl bg-gradient-to-r from-purple-950/40 via-[#0A1428] to-indigo-950/40 border border-purple-500/30 hover:border-purple-400/60 shadow-xl transition-all duration-300 relative overflow-hidden group flex flex-col justify-between"
          >
            {/* Background Glow */}
            <div className="absolute top-0 right-0 w-64 h-64 bg-purple-500/5 rounded-full blur-2xl pointer-events-none group-hover:bg-purple-500/10 transition-all" />

            <div className="relative z-10 space-y-3">
              <div className="flex items-center justify-between gap-2">
                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-purple-500/20 border border-purple-400/40 text-purple-300 text-[10px] font-mono font-bold tracking-wider uppercase">
                  <Sparkles className="w-3 h-3 text-purple-400" />
                  {getBadgeText(offer)}
                </span>
                <span className="px-2.5 py-0.5 rounded-lg text-xs font-mono font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                  +{offer.bonusNodesCount || 1} Free Node
                </span>
              </div>

              <div>
                <h3 className="text-sm sm:text-base font-bold text-white group-hover:text-purple-200 transition-colors">
                  {offer.title}
                </h3>
                <p className="text-xs text-[#98A2B3] mt-1 line-clamp-2 leading-relaxed">
                  {offer.description}
                </p>
              </div>

              {/* Offer Perks Badges */}
              <div className="flex flex-wrap items-center gap-2 pt-1 text-[11px] font-mono">
                {offer.bonusMiningRewards && (
                  <span className="px-2 py-0.5 rounded-md bg-[#05070B] border border-white/[0.08] text-cyan-300 flex items-center gap-1">
                    <Coins className="w-3 h-3 text-cyan-400" />
                    Daily Mining ROI
                  </span>
                )}
                <span className="px-2 py-0.5 rounded-md bg-[#05070B] border border-white/[0.08] text-emerald-300 flex items-center gap-1">
                  <ShieldCheck className="w-3 h-3 text-emerald-400" />
                  Instant Activation
                </span>
              </div>
            </div>

            <div className="relative z-10 mt-4 pt-3 border-t border-white/[0.06] flex items-center justify-between gap-3">
              <div className="text-[11px] font-mono text-slate-400">
                Eligible on Genesis Node purchase
              </div>
              <button
                type="button"
                onClick={() => handleClaimOffer(offer)}
                className="px-3.5 py-1.5 rounded-xl bg-purple-600 hover:bg-purple-500 text-white font-bold text-xs flex items-center gap-1.5 transition-all shadow-md shadow-purple-600/30 cursor-pointer shrink-0"
              >
                <span>Claim Offer</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
