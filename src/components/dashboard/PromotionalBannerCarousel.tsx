import React, { useState, useEffect, useCallback } from 'react';
import {
  Sparkles,
  ArrowRight,
  ChevronLeft,
  ChevronRight,
  AlertTriangle,
  X,
  Zap,
  Gift,
  Info,
  ShieldAlert,
} from 'lucide-react';
import { useSystemConfig } from '../../context/SystemConfigContext';

export interface PromotionalBannerItem {
  id: string;
  content: string;
  imageUrl: string;
  ctaText: string;
  ctaDestination: string;
  displayOrder: number;
  status: 'ACTIVE' | 'INACTIVE';
  startDate: string;
  endDate: string;
}

interface PromotionalBannerCarouselProps {
  onNavigateTab?: (tab: string) => void;
}

export const PromotionalBannerCarousel: React.FC<PromotionalBannerCarouselProps> = ({ onNavigateTab }) => {
  const {
    cryptoDepositsEnabled,
    cryptoWithdrawalsEnabled,
    internalCoinSwapEnabled,
    systemNotice,
  } = useSystemConfig();

  const [banners, setBanners] = useState<PromotionalBannerItem[]>([]);
  const [currentIndex, setCurrentIndex] = useState<number>(0);
  const [dismissedBanners, setDismissedBanners] = useState<boolean>(false);
  const [dismissedNotice, setDismissedNotice] = useState<boolean>(false);

  // Fetch active promotional banners
  const fetchBanners = useCallback(async () => {
    try {
      const res = await fetch('/api/promotions/banners', { credentials: 'include' });
      if (res.ok) {
        const data = await res.json();
        if (data.success && Array.isArray(data.banners)) {
          setBanners(data.banners.filter((b: PromotionalBannerItem) => b.status === 'ACTIVE'));
        }
      }
    } catch {
      // non-blocking
    }
  }, []);

  useEffect(() => {
    fetchBanners();
  }, [fetchBanners]);

  // Auto-rotate banners every 7 seconds
  useEffect(() => {
    if (banners.length <= 1) return;
    const interval = setInterval(() => {
      setCurrentIndex((prev) => (prev + 1) % banners.length);
    }, 7000);
    return () => clearInterval(interval);
  }, [banners.length]);

  const handleNext = () => {
    if (banners.length === 0) return;
    setCurrentIndex((prev) => (prev + 1) % banners.length);
  };

  const handlePrev = () => {
    if (banners.length === 0) return;
    setCurrentIndex((prev) => (prev - 1 + banners.length) % banners.length);
  };

  const handleCtaClick = (destination: string) => {
    if (!destination) return;
    if (onNavigateTab) {
      const clean = destination.replace(/^\/app\//, '').replace(/^\//, '');
      onNavigateTab(clean);
    }
  };

  const hasSystemAlert = !cryptoWithdrawalsEnabled || !cryptoDepositsEnabled || !internalCoinSwapEnabled || Boolean(systemNotice);

  return (
    <div className="space-y-4">
      {/* 1. Protocol Availability & Maintenance Notice */}
      {hasSystemAlert && !dismissedNotice && (
        <div className="p-4 rounded-2xl bg-gradient-to-r from-amber-500/15 via-[#07101D] to-amber-500/10 border border-amber-500/30 text-amber-300 text-xs sm:text-sm flex items-start sm:items-center justify-between gap-3 shadow-lg animate-fadeIn">
          <div className="flex items-center gap-2.5">
            <AlertTriangle className="w-5 h-5 text-amber-400 shrink-0" />
            <div>
              <span className="font-bold text-white mr-1.5">Protocol Notice:</span>
              <span>
                {systemNotice || (
                  !cryptoWithdrawalsEnabled ? 'Cryptocurrency withdrawals are temporarily paused for scheduled maintenance.' :
                  !cryptoDepositsEnabled ? 'Cryptocurrency deposits are temporarily paused by administration.' :
                  !internalCoinSwapEnabled ? 'Coin-to-USDT internal swap desk is temporarily paused.' : ''
                )}
              </span>
            </div>
          </div>
          <button
            onClick={() => setDismissedNotice(true)}
            className="p-1 rounded-lg text-amber-400/70 hover:text-amber-300 hover:bg-amber-500/10 transition-colors cursor-pointer"
            title="Dismiss notice"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* 2. Promotional Banner Carousel */}
      {banners.length > 0 && !dismissedBanners && (
        <div className="relative overflow-hidden rounded-2xl bg-[#07101D] border border-white/[0.08] shadow-xl group animate-fadeIn">
          {banners.map((banner, index) => {
            const isActive = index === currentIndex;
            return (
              <div
                key={banner.id}
                className={`transition-opacity duration-500 flex flex-col md:flex-row items-stretch ${
                  isActive ? 'opacity-100 relative z-10' : 'opacity-0 absolute inset-0 pointer-events-none'
                }`}
              >
                {/* Visual Image Side */}
                {banner.imageUrl && (
                  <div className="relative md:w-2/5 min-h-[160px] md:min-h-auto overflow-hidden bg-[#05070B]">
                    <img
                      src={banner.imageUrl}
                      alt="Promotional Banner"
                      className="w-full h-full object-cover object-center group-hover:scale-105 transition-transform duration-700"
                    />
                    <div className="absolute inset-0 bg-gradient-to-t md:bg-gradient-to-r from-transparent via-[#07101D]/40 to-[#07101D]" />
                    <div className="absolute top-3 left-3 px-2 py-0.5 rounded-full bg-[#00CFFF]/20 border border-[#00CFFF]/40 text-[#00CFFF] text-[10px] font-mono font-bold flex items-center gap-1 backdrop-blur-sm">
                      <Sparkles className="w-3 h-3" />
                      <span>Special Promotion</span>
                    </div>
                  </div>
                )}

                {/* Content Side */}
                <div className="p-5 sm:p-6 flex-1 flex flex-col justify-between space-y-4">
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="w-2 h-2 rounded-full bg-[#00CFFF] animate-ping" />
                        <span className="text-[10px] font-mono uppercase tracking-wider text-[#00CFFF] font-bold">
                          Exclusive Protocol Opportunity
                        </span>
                      </div>
                      <button
                        onClick={() => setDismissedBanners(true)}
                        className="text-[#98A2B3] hover:text-white p-1 rounded transition-colors"
                        title="Dismiss banner"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>

                    <h3 className="text-base sm:text-lg font-extrabold text-white leading-snug">
                      {banner.content}
                    </h3>
                  </div>

                  <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-white/[0.04]">
                    {banner.ctaText && banner.ctaDestination && (
                      <button
                        onClick={() => handleCtaClick(banner.ctaDestination)}
                        className="px-4 py-2 rounded-xl bg-gradient-to-r from-[#00CFFF] to-[#168BFF] hover:opacity-90 text-[#05070B] text-xs font-bold flex items-center gap-2 transition-all cursor-pointer shadow-lg shadow-[#00CFFF]/20 active:scale-95"
                      >
                        <span>{banner.ctaText}</span>
                        <ArrowRight className="w-3.5 h-3.5" />
                      </button>
                    )}

                    {banners.length > 1 && (
                      <div className="flex items-center gap-1.5 ml-auto">
                        <button
                          onClick={handlePrev}
                          className="p-1.5 rounded-lg bg-white/[0.04] hover:bg-white/[0.08] text-white/70 hover:text-white transition-colors cursor-pointer"
                        >
                          <ChevronLeft className="w-3.5 h-3.5" />
                        </button>
                        <div className="flex items-center gap-1 px-1">
                          {banners.map((_, dotIdx) => (
                            <button
                              key={dotIdx}
                              onClick={() => setCurrentIndex(dotIdx)}
                              className={`w-1.5 h-1.5 rounded-full transition-all cursor-pointer ${
                                dotIdx === currentIndex ? 'w-4 bg-[#00CFFF]' : 'bg-white/20 hover:bg-white/40'
                              }`}
                            />
                          ))}
                        </div>
                        <button
                          onClick={handleNext}
                          className="p-1.5 rounded-lg bg-white/[0.04] hover:bg-white/[0.08] text-white/70 hover:text-white transition-colors cursor-pointer"
                        >
                          <ChevronRight className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
