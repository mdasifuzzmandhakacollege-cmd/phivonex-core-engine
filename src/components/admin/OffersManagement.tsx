import React, { useState, useEffect, useCallback } from 'react';
import {
  Gift,
  Plus,
  Edit2,
  Trash2,
  CheckCircle2,
  XCircle,
  Clock,
  Sparkles,
  Zap,
  Tag,
  ShieldCheck,
  Calendar,
  Layers,
  Coins,
  Users,
  AlertTriangle,
  RefreshCw,
  Eye,
  Check,
  X,
  ChevronRight
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
  createdAt: string;
}

interface OffersManagementProps {
  adminEmail?: string;
  onLogAction?: (action: string, targetType: string, targetId: string, details: string) => void;
}

const PRESET_BANNERS = [
  {
    name: 'Cyber Future Node',
    url: 'https://images.unsplash.com/photo-1639762681485-074b7f938ba0?q=80&w=800&auto=format&fit=crop'
  },
  {
    name: 'Blockchain Matrix',
    url: 'https://images.unsplash.com/photo-1620321023374-d1a68fbc720d?q=80&w=800&auto=format&fit=crop'
  },
  {
    name: 'Golden Rewards',
    url: 'https://images.unsplash.com/photo-1621416894569-0f39ed31d247?q=80&w=800&auto=format&fit=crop'
  },
  {
    name: 'Neon Tech Nodes',
    url: 'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?q=80&w=800&auto=format&fit=crop'
  }
];

export const OffersManagement: React.FC<OffersManagementProps> = ({ adminEmail, onLogAction }) => {
  const [offers, setOffers] = useState<PromotionalOffer[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [refreshing, setRefreshing] = useState<boolean>(false);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  // Modal State
  const [isModalOpen, setIsModalOpen] = useState<boolean>(false);
  const [editingOffer, setEditingOffer] = useState<PromotionalOffer | null>(null);
  const [saving, setSaving] = useState<boolean>(false);

  // Delete confirmation
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<boolean>(false);

  // Form State
  const [formData, setFormData] = useState<{
    title: string;
    description: string;
    bannerImage: string;
    offerType: 'BOGO_FREE_NODE' | 'FREE_BONUS_NODE' | 'DISCOUNT' | 'CUSTOM';
    bonusNodesCount: number;
    bonusMiningRewards: boolean;
    bonusMatchingEnabled: boolean;
    bonusReferralCommission: boolean;
    promotionalPriceUsd: number;
    discountPercent: number;
    badgeTag: string;
    totalAllocatedSlots: number;
    startDate: string;
    endDate: string;
    status: 'ACTIVE' | 'INACTIVE';
    targetAudience: 'ALL' | 'NEW' | 'VIP';
    priorityOrder: number;
  }>({
    title: '',
    description: '',
    bannerImage: PRESET_BANNERS[0].url,
    offerType: 'BOGO_FREE_NODE',
    bonusNodesCount: 1,
    bonusMiningRewards: true, // Free bonus node earns daily coin mining rewards
    bonusMatchingEnabled: false, // Free bonus node does NOT generate binary matching spots/volume
    bonusReferralCommission: false, // Free bonus node does NOT generate direct referral spot commissions
    promotionalPriceUsd: 1000.00,
    discountPercent: 0.00,
    badgeTag: '🔥 HOT_DEAL',
    totalAllocatedSlots: 100,
    startDate: new Date().toISOString().slice(0, 16),
    endDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 16),
    status: 'ACTIVE',
    targetAudience: 'ALL',
    priorityOrder: 1,
  });

  const fetchOffers = useCallback(async () => {
    try {
      setRefreshing(true);
      const res = await fetch('/api/promotions/admin/offers', { credentials: 'include' });
      if (res.ok) {
        const data = await res.json();
        setOffers(data.offers || []);
      }
    } catch (err) {
      console.error('[OffersManagement] Error fetching promotional offers:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchOffers();
  }, [fetchOffers]);

  const openCreateModal = () => {
    setEditingOffer(null);
    setFormData({
      title: 'Buy 1 Genesis Node, Get 1 Free Promo Node (BOGO)',
      description: 'Acquire 1 Genesis Validator Node and receive 1 Free Promo Node automatically. The Free Node earns full daily mining coin rewards with 0 binary matching spot generation.',
      bannerImage: PRESET_BANNERS[0].url,
      offerType: 'BOGO_FREE_NODE',
      bonusNodesCount: 1,
      bonusMiningRewards: true,
      bonusMatchingEnabled: false,
      bonusReferralCommission: false,
      promotionalPriceUsd: 1000.00,
      discountPercent: 0.00,
      badgeTag: '🔥 HOT_DEAL',
      totalAllocatedSlots: 100,
      startDate: new Date().toISOString().slice(0, 16),
      endDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 16),
      status: 'ACTIVE',
      targetAudience: 'ALL',
      priorityOrder: 1,
    });
    setFeedback(null);
    setIsModalOpen(true);
  };

  const openEditModal = (offer: PromotionalOffer) => {
    setEditingOffer(offer);
    setFormData({
      title: offer.title,
      description: offer.description,
      bannerImage: offer.bannerImage,
      offerType: offer.offerType,
      bonusNodesCount: offer.bonusNodesCount,
      bonusMiningRewards: offer.bonusMiningRewards,
      bonusMatchingEnabled: offer.bonusMatchingEnabled,
      bonusReferralCommission: offer.bonusReferralCommission,
      promotionalPriceUsd: offer.promotionalPriceUsd ?? 1000.00,
      discountPercent: offer.discountPercent ?? 0.00,
      badgeTag: offer.badgeTag || '🔥 HOT_DEAL',
      totalAllocatedSlots: offer.totalAllocatedSlots ?? 100,
      startDate: new Date(offer.startDate).toISOString().slice(0, 16),
      endDate: new Date(offer.endDate).toISOString().slice(0, 16),
      status: offer.status,
      targetAudience: offer.targetAudience,
      priorityOrder: offer.priorityOrder,
    });
    setFeedback(null);
    setIsModalOpen(true);
  };

  const handleSaveOffer = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setSaving(true);
      setFeedback(null);

      if (!formData.title.trim() || !formData.description.trim()) {
        setFeedback({ type: 'error', message: 'Offer title and description are required.' });
        setSaving(false);
        return;
      }

      const payload = {
        title: formData.title.trim(),
        description: formData.description.trim(),
        bannerImage: formData.bannerImage.trim(),
        offerType: formData.offerType,
        bonusNodesCount: Number(formData.bonusNodesCount) || 1,
        bonusMiningRewards: formData.bonusMiningRewards,
        bonusMatchingEnabled: formData.bonusMatchingEnabled,
        bonusReferralCommission: formData.bonusReferralCommission,
        startDate: new Date(formData.startDate).toISOString(),
        endDate: new Date(formData.endDate).toISOString(),
        status: formData.status,
        targetAudience: formData.targetAudience,
        priorityOrder: Number(formData.priorityOrder) || 1,
      };

      const url = editingOffer
        ? `/api/promotions/admin/offers/${editingOffer.id}`
        : '/api/promotions/admin/offers';
      const method = editingOffer ? 'PUT' : 'POST';

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(payload),
      });

      const resData = await res.json();

      if (!res.ok) {
        throw new Error(resData.message || resData.error || 'Failed to save offer');
      }

      setFeedback({
        type: 'success',
        message: editingOffer
          ? `Offer "${formData.title}" updated successfully!`
          : `New promotional offer "${formData.title}" created successfully!`
      });

      if (onLogAction) {
        onLogAction(
          editingOffer ? 'UPDATE_OFFER' : 'CREATE_OFFER',
          'promotional_offers',
          editingOffer ? editingOffer.id : resData.offer?.id || 'new',
          `Admin saved offer: ${formData.title} (Type: ${formData.offerType}, Bonus Nodes: ${formData.bonusNodesCount})`
        );
      }

      setIsModalOpen(false);
      await fetchOffers();
    } catch (err: any) {
      console.error('[OffersManagement] Error saving offer:', err);
      setFeedback({ type: 'error', message: err.message || 'Error saving promotional offer' });
    } finally {
      setSaving(false);
    }
  };

  const handleToggleStatus = async (offer: PromotionalOffer) => {
    try {
      const nextStatus = offer.status === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE';
      const res = await fetch(`/api/promotions/admin/offers/${offer.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          ...offer,
          status: nextStatus,
        }),
      });

      if (!res.ok) {
        throw new Error('Failed to toggle offer status');
      }

      setFeedback({
        type: 'success',
        message: `Offer "${offer.title}" is now ${nextStatus}.`
      });

      if (onLogAction) {
        onLogAction(
          'TOGGLE_OFFER_STATUS',
          'promotional_offers',
          offer.id,
          `Toggled offer status to ${nextStatus}`
        );
      }

      await fetchOffers();
    } catch (err: any) {
      setFeedback({ type: 'error', message: err.message || 'Could not toggle status' });
    }
  };

  const handleDeleteOffer = async (id: string) => {
    try {
      setDeleting(true);
      const res = await fetch(`/api/promotions/admin/offers/${id}`, {
        method: 'DELETE',
        credentials: 'include',
      });

      if (!res.ok) {
        throw new Error('Failed to delete promotional offer');
      }

      setFeedback({ type: 'success', message: 'Promotional offer removed successfully.' });

      if (onLogAction) {
        onLogAction('DELETE_OFFER', 'promotional_offers', id, 'Deleted promotional offer');
      }

      setDeleteConfirmId(null);
      await fetchOffers();
    } catch (err: any) {
      setFeedback({ type: 'error', message: err.message || 'Could not delete offer' });
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div className="p-6 rounded-2xl bg-gradient-to-r from-purple-950/50 via-slate-900 to-indigo-950/50 border border-purple-800/30 shadow-xl flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-2">
            <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-purple-500/20 text-purple-300 border border-purple-500/30 flex items-center gap-1">
              <Gift className="w-3.5 h-3.5" /> Promotional Engine
            </span>
            <span className="text-xs text-slate-400">Dynamic Offers & BOGO Management</span>
          </div>
          <h2 className="text-xl font-bold text-white flex items-center gap-2">
            Promotional Offers & Bonus Node Rules
          </h2>
          <p className="text-xs text-slate-400 mt-1 max-w-2xl">
            Create real-time promotional offers (e.g. Buy 1 Genesis Node, Get 1 Free Promo Node). Free promotional nodes earn daily mining coin rewards without generating binary MLM matching spots or direct sponsor spot commissions.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={fetchOffers}
            disabled={refreshing}
            className="px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 text-xs font-medium flex items-center gap-1.5 transition-all shadow-sm"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin' : ''}`} />
            Refresh
          </button>
          <button
            onClick={openCreateModal}
            className="px-4 py-2 rounded-xl bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white text-xs font-semibold flex items-center gap-2 transition-all shadow-lg shadow-purple-600/20"
          >
            <Plus className="w-4 h-4" />
            Create New Offer
          </button>
        </div>
      </div>

      {/* Feedback message */}
      {feedback && (
        <div
          className={`p-4 rounded-xl text-xs font-medium flex items-center justify-between gap-3 border ${
            feedback.type === 'success'
              ? 'bg-emerald-950/40 border-emerald-800/40 text-emerald-300'
              : 'bg-rose-950/40 border-rose-800/40 text-rose-300'
          }`}
        >
          <div className="flex items-center gap-2">
            {feedback.type === 'success' ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-400 flex-shrink-0" />
            ) : (
              <AlertTriangle className="w-4 h-4 text-rose-400 flex-shrink-0" />
            )}
            <span>{feedback.message}</span>
          </div>
          <button onClick={() => setFeedback(null)} className="text-slate-400 hover:text-white">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Offers Cards Grid */}
      {loading ? (
        <div className="p-12 text-center text-slate-400">
          <RefreshCw className="w-8 h-8 animate-spin mx-auto mb-3 text-purple-400" />
          <p className="text-sm">Loading promotional offers...</p>
        </div>
      ) : offers.length === 0 ? (
        <div className="p-12 text-center rounded-2xl bg-slate-900/60 border border-slate-800/80">
          <Gift className="w-12 h-12 text-slate-600 mx-auto mb-3" />
          <h3 className="text-base font-semibold text-white">No Promotional Offers Configured</h3>
          <p className="text-xs text-slate-400 mt-1 max-w-md mx-auto">
            Get started by creating your first promotional campaign such as Buy 1 Get 1 Free Node.
          </p>
          <button
            onClick={openCreateModal}
            className="mt-4 px-4 py-2 rounded-xl bg-purple-600 hover:bg-purple-500 text-white text-xs font-semibold inline-flex items-center gap-2"
          >
            <Plus className="w-4 h-4" /> Create BOGO Offer
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {offers.map((offer) => {
            const isActive = offer.status === 'ACTIVE';
            const isBogo = offer.offerType === 'BOGO_FREE_NODE' || offer.bonusNodesCount > 0;

            return (
              <div
                key={offer.id}
                className={`rounded-2xl border transition-all overflow-hidden flex flex-col justify-between ${
                  isActive
                    ? 'bg-slate-900/80 border-purple-800/40 shadow-lg shadow-purple-950/20'
                    : 'bg-slate-900/40 border-slate-800/60 opacity-75'
                }`}
              >
                <div>
                  {/* Top Image Banner */}
                  <div className="relative h-36 overflow-hidden bg-slate-950">
                    <img
                      src={offer.bannerImage}
                      alt={offer.title}
                      className="w-full h-full object-cover opacity-80 hover:scale-105 transition-transform duration-500"
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-slate-900 via-transparent to-transparent" />
                    
                    <div className="absolute top-3 left-3 flex items-center gap-2">
                      <span
                        className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold tracking-wider uppercase border shadow-sm ${
                          isActive
                            ? 'bg-emerald-500/20 border-emerald-500/40 text-emerald-300'
                            : 'bg-slate-800/80 border-slate-700 text-slate-400'
                        }`}
                      >
                        {offer.status}
                      </span>
                      {isBogo && (
                        <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase bg-purple-500/30 border border-purple-400/40 text-purple-200">
                          +{offer.bonusNodesCount} Free Node
                        </span>
                      )}
                    </div>

                    <div className="absolute top-3 right-3">
                      <span className="px-2 py-0.5 rounded-md text-[10px] font-mono bg-black/60 text-slate-300 border border-white/10">
                        Audience: {offer.targetAudience}
                      </span>
                    </div>
                  </div>

                  {/* Body Content */}
                  <div className="p-5 space-y-3">
                    <h3 className="text-base font-bold text-white line-clamp-1">{offer.title}</h3>
                    <p className="text-xs text-slate-400 line-clamp-2 leading-relaxed">{offer.description}</p>

                    {/* Operational Rule Indicators */}
                    <div className="p-3 rounded-xl bg-slate-950/60 border border-slate-800/80 space-y-2 text-[11px]">
                      <div className="flex items-center justify-between">
                        <span className="text-slate-400 flex items-center gap-1.5">
                          <Coins className="w-3.5 h-3.5 text-amber-400" /> Daily Mining Rewards:
                        </span>
                        <span className={`font-semibold ${offer.bonusMiningRewards ? 'text-emerald-400' : 'text-slate-500'}`}>
                          {offer.bonusMiningRewards ? 'Active (Yields Coin)' : 'Disabled'}
                        </span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-slate-400 flex items-center gap-1.5">
                          <Layers className="w-3.5 h-3.5 text-indigo-400" /> MLM Matching Spots:
                        </span>
                        <span className={`font-semibold ${offer.bonusMatchingEnabled ? 'text-amber-400' : 'text-slate-400'}`}>
                          {offer.bonusMatchingEnabled ? 'Enabled' : 'None (No Spot)'}
                        </span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-slate-400 flex items-center gap-1.5">
                          <Users className="w-3.5 h-3.5 text-cyan-400" /> Direct Sponsor Spot:
                        </span>
                        <span className={`font-semibold ${offer.bonusReferralCommission ? 'text-amber-400' : 'text-slate-400'}`}>
                          {offer.bonusReferralCommission ? 'Enabled' : 'None (No Spot)'}
                        </span>
                      </div>
                    </div>

                    {/* Validity Dates */}
                    <div className="text-[11px] text-slate-400 flex items-center justify-between pt-1">
                      <span className="flex items-center gap-1">
                        <Clock className="w-3.5 h-3.5 text-slate-500" />
                        Valid until:
                      </span>
                      <span className="font-mono text-slate-300">
                        {new Date(offer.endDate).toLocaleDateString()}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Card Actions Footer */}
                <div className="p-4 bg-slate-950/40 border-t border-slate-800/60 flex items-center justify-between gap-2">
                  <button
                    onClick={() => handleToggleStatus(offer)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
                      isActive
                        ? 'bg-amber-950/30 border-amber-800/40 text-amber-300 hover:bg-amber-900/40'
                        : 'bg-emerald-950/30 border-emerald-800/40 text-emerald-300 hover:bg-emerald-900/40'
                    }`}
                  >
                    {isActive ? 'Deactivate' : 'Activate'}
                  </button>

                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => openEditModal(offer)}
                      className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700"
                      title="Edit Offer"
                    >
                      <Edit2 className="w-3.5 h-3.5" />
                    </button>
                    {deleteConfirmId === offer.id ? (
                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => handleDeleteOffer(offer.id)}
                          disabled={deleting}
                          className="px-2 py-1 rounded bg-rose-600 hover:bg-rose-500 text-white text-[10px] font-bold"
                        >
                          Confirm
                        </button>
                        <button
                          onClick={() => setDeleteConfirmId(null)}
                          className="px-2 py-1 rounded bg-slate-800 text-slate-400 text-[10px]"
                        >
                          Cancel
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={() => setDeleteConfirmId(offer.id)}
                        className="p-1.5 rounded-lg bg-rose-950/40 hover:bg-rose-900/60 text-rose-400 border border-rose-800/40"
                        title="Delete Offer"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* CREATE / EDIT MODAL */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm overflow-y-auto">
          <div className="relative w-full max-w-xl bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl p-6 my-8 space-y-5">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <div className="flex items-center gap-2">
                <Gift className="w-5 h-5 text-purple-400" />
                <h3 className="text-base font-bold text-white">
                  {editingOffer ? 'Edit Promotional Offer' : 'Create New Promotional Offer'}
                </h3>
              </div>
              <button
                onClick={() => setIsModalOpen(false)}
                className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveOffer} className="space-y-4">
              {/* Title */}
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">Offer Title</label>
                <input
                  type="text"
                  required
                  value={formData.title}
                  onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                  placeholder="e.g. Buy 1 Genesis Node, Get 1 Free Promo Node (BOGO)"
                  className="w-full px-3.5 py-2 rounded-xl bg-slate-950 border border-slate-800 text-white text-xs focus:outline-none focus:border-purple-500"
                />
              </div>

              {/* Description */}
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">Description & User Terms</label>
                <textarea
                  rows={2}
                  required
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  placeholder="Explain promotion details, free node allocation and daily coin reward terms."
                  className="w-full px-3.5 py-2 rounded-xl bg-slate-950 border border-slate-800 text-white text-xs focus:outline-none focus:border-purple-500 resize-none"
                />
              </div>

              {/* Offer Type & Bonus Nodes Count */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">Offer Type</label>
                  <select
                    value={formData.offerType}
                    onChange={(e: any) => setFormData({ ...formData, offerType: e.target.value })}
                    className="w-full px-3.5 py-2 rounded-xl bg-slate-950 border border-slate-800 text-white text-xs focus:outline-none focus:border-purple-500"
                  >
                    <option value="BOGO_FREE_NODE">Buy 1 Get 1 Free (BOGO)</option>
                    <option value="FREE_BONUS_NODE">Free Bonus Node Promotion</option>
                    <option value="DISCOUNT">Discount Pricing</option>
                    <option value="CUSTOM">Custom Campaign</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">Bonus Free Nodes Count</label>
                  <input
                    type="number"
                    min="1"
                    max="10"
                    value={formData.bonusNodesCount}
                    onChange={(e) => setFormData({ ...formData, bonusNodesCount: parseInt(e.target.value, 10) || 1 })}
                    className="w-full px-3.5 py-2 rounded-xl bg-slate-950 border border-slate-800 text-white text-xs focus:outline-none focus:border-purple-500 font-mono"
                  />
                </div>
              </div>

              {/* Pricing, Discount, Badge Tag, and Allocation Slots */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">Price (USDT)</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={formData.promotionalPriceUsd}
                    onChange={(e) => setFormData({ ...formData, promotionalPriceUsd: parseFloat(e.target.value) || 1000 })}
                    className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-white text-xs font-mono focus:outline-none focus:border-purple-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">Discount %</label>
                  <input
                    type="number"
                    step="0.1"
                    min="0"
                    max="100"
                    value={formData.discountPercent}
                    onChange={(e) => setFormData({ ...formData, discountPercent: parseFloat(e.target.value) || 0 })}
                    className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-white text-xs font-mono focus:outline-none focus:border-purple-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">Badge Tag</label>
                  <input
                    type="text"
                    value={formData.badgeTag}
                    onChange={(e) => setFormData({ ...formData, badgeTag: e.target.value })}
                    placeholder="🔥 HOT_DEAL"
                    className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-white text-xs font-mono focus:outline-none focus:border-purple-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">Total Slots</label>
                  <input
                    type="number"
                    min="1"
                    value={formData.totalAllocatedSlots}
                    onChange={(e) => setFormData({ ...formData, totalAllocatedSlots: parseInt(e.target.value, 10) || 100 })}
                    className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-white text-xs font-mono focus:outline-none focus:border-purple-500"
                  />
                </div>
              </div>

              {/* Business Rules Controls */}
              <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 space-y-3">
                <div className="text-xs font-bold text-slate-200 flex items-center gap-1.5">
                  <ShieldCheck className="w-4 h-4 text-purple-400" /> Free Bonus Node Behavioral Rules
                </div>

                {/* Rule 1: Daily Mining Rewards */}
                <label className="flex items-start gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={formData.bonusMiningRewards}
                    onChange={(e) => setFormData({ ...formData, bonusMiningRewards: e.target.checked })}
                    className="mt-0.5 rounded bg-slate-900 border-slate-700 text-purple-600 focus:ring-purple-500"
                  />
                  <div>
                    <span className="text-xs font-semibold text-white flex items-center gap-1">
                      ✅ Accrue Daily Mining Coin Rewards (PHIVO)
                    </span>
                    <p className="text-[11px] text-slate-400">
                      The free bonus node actively participates in daily mining epoch settlements and produces daily coins.
                    </p>
                  </div>
                </label>

                {/* Rule 2: Binary Matching */}
                <label className="flex items-start gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={formData.bonusMatchingEnabled}
                    onChange={(e) => setFormData({ ...formData, bonusMatchingEnabled: e.target.checked })}
                    className="mt-0.5 rounded bg-slate-900 border-slate-700 text-purple-600 focus:ring-purple-500"
                  />
                  <div>
                    <span className="text-xs font-semibold text-white flex items-center gap-1">
                      Binary MLM Matching Spots / Volume
                    </span>
                    <p className="text-[11px] text-slate-400">
                      Default: <strong className="text-amber-300">Disabled</strong>. The free bonus node does NOT create left/right binary matching units or spot payouts.
                    </p>
                  </div>
                </label>

                {/* Rule 3: Referral Commission */}
                <label className="flex items-start gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={formData.bonusReferralCommission}
                    onChange={(e) => setFormData({ ...formData, bonusReferralCommission: e.target.checked })}
                    className="mt-0.5 rounded bg-slate-900 border-slate-700 text-purple-600 focus:ring-purple-500"
                  />
                  <div>
                    <span className="text-xs font-semibold text-white flex items-center gap-1">
                      Direct Sponsor Spot Commission ($50)
                    </span>
                    <p className="text-[11px] text-slate-400">
                      Default: <strong className="text-amber-300">Disabled</strong>. Only the real purchased node yields sponsor referral commission.
                    </p>
                  </div>
                </label>
              </div>

              {/* Start & End Dates */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">Start Date & Time</label>
                  <input
                    type="datetime-local"
                    required
                    value={formData.startDate}
                    onChange={(e) => setFormData({ ...formData, startDate: e.target.value })}
                    className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-white text-xs focus:outline-none focus:border-purple-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">End Date & Time</label>
                  <input
                    type="datetime-local"
                    required
                    value={formData.endDate}
                    onChange={(e) => setFormData({ ...formData, endDate: e.target.value })}
                    className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-white text-xs focus:outline-none focus:border-purple-500"
                  />
                </div>
              </div>

              {/* Banner Image URL Selection */}
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">Banner Image URL</label>
                <div className="flex gap-2 mb-2">
                  {PRESET_BANNERS.map((b, idx) => (
                    <button
                      type="button"
                      key={idx}
                      onClick={() => setFormData({ ...formData, bannerImage: b.url })}
                      className={`text-[10px] px-2 py-1 rounded-md border ${
                        formData.bannerImage === b.url
                          ? 'bg-purple-600/30 border-purple-500 text-purple-200'
                          : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-white'
                      }`}
                    >
                      {b.name}
                    </button>
                  ))}
                </div>
                <input
                  type="url"
                  required
                  value={formData.bannerImage}
                  onChange={(e) => setFormData({ ...formData, bannerImage: e.target.value })}
                  placeholder="https://..."
                  className="w-full px-3.5 py-2 rounded-xl bg-slate-950 border border-slate-800 text-white text-xs focus:outline-none focus:border-purple-500"
                />
              </div>

              {/* Status & Audience */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">Status</label>
                  <select
                    value={formData.status}
                    onChange={(e: any) => setFormData({ ...formData, status: e.target.value })}
                    className="w-full px-3.5 py-2 rounded-xl bg-slate-950 border border-slate-800 text-white text-xs focus:outline-none focus:border-purple-500"
                  >
                    <option value="ACTIVE">ACTIVE (Visible in Dashboard)</option>
                    <option value="INACTIVE">INACTIVE (Hidden)</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">Target Audience</label>
                  <select
                    value={formData.targetAudience}
                    onChange={(e: any) => setFormData({ ...formData, targetAudience: e.target.value })}
                    className="w-full px-3.5 py-2 rounded-xl bg-slate-950 border border-slate-800 text-white text-xs focus:outline-none focus:border-purple-500"
                  >
                    <option value="ALL">ALL Registered Members</option>
                    <option value="NEW">New Registrations Only</option>
                    <option value="VIP">VIP Nodes Owners</option>
                  </select>
                </div>
              </div>

              {/* Form Buttons */}
              <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-medium"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="px-5 py-2 rounded-xl bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white text-xs font-semibold shadow-lg shadow-purple-600/20 flex items-center gap-2"
                >
                  {saving ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                  {editingOffer ? 'Save Changes' : 'Create Offer'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
