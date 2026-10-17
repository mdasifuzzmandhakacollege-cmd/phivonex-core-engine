import React, { useState, useEffect, useCallback, useRef } from 'react';
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
  ChevronLeft,
  Flame,
  CreditCard,
  Percent,
  Timer
} from 'lucide-react';
import { OfferPaymentModal, PromotionalOffer } from '../modals/OfferPaymentModal';
import { db } from '../../lib/firebase';
import { collection, onSnapshot } from 'firebase/firestore';

interface ActiveOfferCardsProps {
  onNavigateTab?: (tab: string) => void;
  compact?: boolean;
}

export const ActiveOfferCards: React.FC<ActiveOfferCardsProps> = ({ onNavigateTab, compact = false }) => {
  const [offers, setOffers] = useState<PromotionalOffer[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [activeSlide, setActiveSlide] = useState<number>(0);
  const [isPaused, setIsPaused] = useState<boolean>(false);

  // Selected Offer for Payment Modal
  const [selectedOfferForPay, setSelectedOfferForPay] = useState<PromotionalOffer | null>(null);

  // Countdown timer state ticking every second
  const [timeLeft, setTimeLeft] = useState<{ days: number; hours: number; minutes: number; seconds: number }>({
    days: 3,
    hours: 14,
    minutes: 45,
    seconds: 20,
  });

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

  // Real-time Firestore onSnapshot for sub-second admin sync (< seconds)
  useEffect(() => {
    let unsub: (() => void) | undefined;
    try {
      unsub = onSnapshot(collection(db, 'promotional_offers'), (snap) => {
        if (!snap.empty) {
          const fsOffers: PromotionalOffer[] = [];
          snap.forEach((d) => {
            const data = d.data() as PromotionalOffer;
            if (data.status === 'ACTIVE') {
              fsOffers.push({ ...data, id: d.id });
            }
          });
          if (fsOffers.length > 0) {
            setOffers(fsOffers.sort((a, b) => (a.priorityOrder || 0) - (b.priorityOrder || 0)));
          }
        }
      });
    } catch {
      // fallback
    }

    return () => {
      if (unsub) unsub();
    };
  }, []);

  // Live Countdown Timer
  useEffect(() => {
    const timer = setInterval(() => {
      setTimeLeft((prev) => {
        if (prev.seconds > 0) return { ...prev, seconds: prev.seconds - 1 };
        if (prev.minutes > 0) return { ...prev, minutes: 59, seconds: 59 };
        if (prev.hours > 0) return { ...prev, hours: prev.hours - 1, minutes: 59, seconds: 59 };
        if (prev.days > 0) return { ...prev, days: prev.days - 1, hours: 23, minutes: 59, seconds: 59 };
        return { days: 0, hours: 0, minutes: 0, seconds: 0 };
      });
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  // Automatic carousel slide rotation every 7 seconds
  useEffect(() => {
    if (offers.length <= 1 || isPaused) return;

    const interval = setInterval(() => {
      setActiveSlide((prev) => (prev + 1) % offers.length);
    }, 7000);

    return () => clearInterval(interval);
  }, [offers.length, isPaused]);

  if (loading || offers.length === 0) {
    return null;
  }

  const currentOffer = offers[activeSlide] || offers[0];

  const handleNextSlide = () => {
    setActiveSlide((prev) => (prev + 1) % offers.length);
  };

  const handlePrevSlide = () => {
    setActiveSlide((prev) => (prev - 1 + offers.length) % offers.length);
  };

  const getBadgeTag = (offer: PromotionalOffer) => {
    if (offer.badgeTag) return offer.badgeTag;
    switch (offer.offerType) {
      case 'BOGO_FREE_NODE':
        return '🔥 LIMITED BOGO DECK';
      case 'FREE_BONUS_NODE':
        return '🎁 BONUS NODE GIFT';
      case 'DISCOUNT':
        return '⚡ FLASH DISCOUNT';
      default:
        return '💎 VIP ECOSYSTEM OFFER';
    }
  };

  const claimedCount = currentOffer.claimedSlots || 24;
  const totalSlots = currentOffer.totalAllocatedSlots || 100;
  const claimedPercent = Math.min(100, Math.round((claimedCount / totalSlots) * 100));

  return (
    <div className="space-y-3 animate-fadeIn">
      {/* Header with Title and Live Badge */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 rounded-lg bg-gradient-to-tr from-purple-500/20 to-indigo-500/20 border border-purple-500/30 flex items-center justify-center text-purple-400">
            <Gift className="w-3.5 h-3.5" />
          </div>
          <h2 className="text-xs sm:text-sm font-bold text-white uppercase tracking-wider font-mono flex items-center gap-2">
            <span>Special Promotional Node Offers</span>
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
          </h2>
        </div>

        <div className="flex items-center gap-2">
          {offers.length > 1 && (
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={handlePrevSlide}
                className="p-1 rounded-lg bg-white/[0.04] hover:bg-white/[0.08] text-slate-400 hover:text-white transition-colors cursor-pointer"
                title="Previous Offer"
              >
                <ChevronLeft className="w-3.5 h-3.5" />
              </button>
              <span className="text-[10px] font-mono text-purple-300 px-1.5">
                {activeSlide + 1} / {offers.length}
              </span>
              <button
                type="button"
                onClick={handleNextSlide}
                className="p-1 rounded-lg bg-white/[0.04] hover:bg-white/[0.08] text-slate-400 hover:text-white transition-colors cursor-pointer"
                title="Next Offer"
              >
                <ChevronRight className="w-3.5 h-3.5" />
              </button>
            </div>
          )}
          <span className="text-[11px] font-mono text-purple-300 bg-purple-500/10 px-2 py-0.5 rounded border border-purple-500/20">
            {offers.length} {offers.length === 1 ? 'Live Promotion' : 'Live Promotions'}
          </span>
        </div>
      </div>

      {/* INTERNATIONAL STANDARD ANIMATED CARD SHOWCASE (Slide side effect) */}
      <div
        className="relative overflow-hidden rounded-3xl group"
        onMouseEnter={() => setIsPaused(true)}
        onMouseLeave={() => setIsPaused(false)}
      >
        <div
          key={currentOffer.id}
          className="p-6 sm:p-7 rounded-3xl bg-gradient-to-br from-[#0B1428] via-[#080E1F] to-[#120B28] border border-purple-500/30 hover:border-purple-400/60 shadow-2xl transition-all duration-500 relative overflow-hidden flex flex-col justify-between"
          style={{
            animation: 'slideInRight 0.4s cubic-bezier(0.16, 1, 0.3, 1)',
          }}
        >
          {/* Cybernetic Grid & Glow Overlay */}
          <div className="absolute top-0 right-0 w-96 h-96 bg-purple-500/10 rounded-full blur-3xl pointer-events-none group-hover:bg-purple-500/15 transition-all" />
          <div className="absolute -bottom-10 -left-10 w-64 h-64 bg-cyan-500/5 rounded-full blur-2xl pointer-events-none" />

          {/* Top Row: Tags + Live Countdown Timer */}
          <div className="relative z-10 flex flex-wrap items-center justify-between gap-3 mb-4">
            <div className="flex items-center gap-2">
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-gradient-to-r from-purple-500/20 to-indigo-500/20 border border-purple-400/50 text-purple-300 text-[10px] font-mono font-bold tracking-wider uppercase shadow-inner">
                <Flame className="w-3.5 h-3.5 text-purple-400" />
                {getBadgeTag(currentOffer)}
              </span>
              <span className="px-2.5 py-0.5 rounded-lg text-xs font-mono font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                +{currentOffer.bonusNodesCount || 1} Free Promo Node
              </span>
            </div>

            {/* Live Ticking Countdown Timer */}
            <div className="flex items-center gap-1.5 px-3 py-1 rounded-xl bg-black/60 border border-white/[0.08] font-mono text-[11px] text-white">
              <Timer className="w-3.5 h-3.5 text-amber-400 animate-pulse" />
              <span className="text-slate-400 text-[10px] uppercase">Ends In:</span>
              <span className="font-bold text-amber-300">
                {String(timeLeft.days).padStart(2, '0')}d :{' '}
                {String(timeLeft.hours).padStart(2, '0')}h :{' '}
                {String(timeLeft.minutes).padStart(2, '0')}m :{' '}
                {String(timeLeft.seconds).padStart(2, '0')}s
              </span>
            </div>
          </div>

          {/* Middle Row: Content & Perks */}
          <div className="relative z-10 space-y-3">
            <div>
              <h3 className="text-base sm:text-lg font-bold text-white group-hover:text-purple-200 transition-colors flex items-center gap-2">
                <span>{currentOffer.title}</span>
                <Sparkles className="w-4 h-4 text-purple-400" />
              </h3>
              <p className="text-xs text-[#98A2B3] mt-1.5 leading-relaxed max-w-2xl">
                {currentOffer.description}
              </p>
            </div>

            {/* Perks Pills */}
            <div className="flex flex-wrap items-center gap-2 pt-1 text-[11px] font-mono">
              <span className="px-2.5 py-1 rounded-lg bg-black/50 border border-white/[0.08] text-cyan-300 flex items-center gap-1.5">
                <Coins className="w-3.5 h-3.5 text-cyan-400" />
                <span>Daily Mining ROI</span>
              </span>
              <span className="px-2.5 py-1 rounded-lg bg-black/50 border border-white/[0.08] text-emerald-300 flex items-center gap-1.5">
                <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
                <span>Instant Node Activation</span>
              </span>
              <span className="px-2.5 py-1 rounded-lg bg-black/50 border border-white/[0.08] text-purple-300 flex items-center gap-1.5">
                <Zap className="w-3.5 h-3.5 text-purple-400" />
                <span>2 Nodes Emitting</span>
              </span>
            </div>

            {/* Real-time Allocation Progress Bar */}
            <div className="pt-2 max-w-md space-y-1">
              <div className="flex items-center justify-between text-[10px] font-mono text-slate-400">
                <span>Allocation Capacity:</span>
                <span className="text-purple-300 font-bold">{claimedPercent}% Claimed ({claimedCount}/{totalSlots})</span>
              </div>
              <div className="w-full h-1.5 rounded-full bg-white/[0.08] overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-purple-500 via-indigo-400 to-cyan-400 rounded-full transition-all duration-500"
                  style={{ width: `${claimedPercent}%` }}
                />
              </div>
            </div>
          </div>

          {/* Bottom Row: Price & Pay CTA Action */}
          <div className="relative z-10 mt-5 pt-4 border-t border-white/[0.08] flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div className="flex items-baseline gap-2 font-mono">
              <span className="text-xs text-slate-400">Promotional Price:</span>
              <span className="text-lg font-bold text-white">
                ${(currentOffer.promotionalPriceUsd || 1000).toFixed(2)} USDT
              </span>
              {currentOffer.discountPercent && currentOffer.discountPercent > 0 && (
                <span className="text-xs text-emerald-400 font-semibold">
                  (-{currentOffer.discountPercent}%)
                </span>
              )}
            </div>

            <div className="flex items-center gap-3 w-full sm:w-auto">
              <button
                type="button"
                onClick={() => setSelectedOfferForPay(currentOffer)}
                className="w-full sm:w-auto px-5 py-2.5 rounded-xl bg-gradient-to-r from-purple-600 via-indigo-600 to-purple-600 hover:from-purple-500 hover:to-indigo-500 text-white font-bold text-xs font-mono flex items-center justify-center gap-2 shadow-xl shadow-purple-600/30 cursor-pointer transition-all active:scale-95"
              >
                <Zap className="w-4 h-4 text-purple-200" />
                <span>Claim &amp; Pay Now</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>

        {/* Carousel indicator dots */}
        {offers.length > 1 && (
          <div className="flex items-center justify-center gap-1.5 pt-2">
            {offers.map((_, idx) => (
              <button
                key={idx}
                type="button"
                onClick={() => setActiveSlide(idx)}
                className={`h-1.5 rounded-full transition-all cursor-pointer ${
                  activeSlide === idx ? 'w-6 bg-purple-400' : 'w-1.5 bg-white/20 hover:bg-white/40'
                }`}
              />
            ))}
          </div>
        )}
      </div>

      {/* Offer Checkout / Payment Modal */}
      <OfferPaymentModal
        isOpen={Boolean(selectedOfferForPay)}
        offer={selectedOfferForPay}
        onClose={() => setSelectedOfferForPay(null)}
        onNavigateTab={onNavigateTab}
        onSuccess={() => {
          fetchOffers();
        }}
      />
    </div>
  );
};
