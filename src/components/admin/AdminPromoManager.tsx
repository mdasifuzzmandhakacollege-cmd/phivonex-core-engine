import React, { useState, useEffect, useCallback } from 'react';
import { PhxGlassCard } from '../ui/phivonex';
import {
  Sparkles,
  Plus,
  Save,
  Trash2,
  Loader2,
  RefreshCw,
  CheckCircle2,
  AlertCircle,
  Power,
} from 'lucide-react';

interface EcosystemPromoBanner {
  id: string;
  slug: string;
  badgeText: string;
  title: string;
  subtitle: string;
  ctaLabel: string;
  targetTab: string;
  accentTheme: 'gold' | 'cyan' | 'emerald';
  showNodeScarcity: boolean;
  isActive: boolean;
  sortOrder: number;
  updatedAt: string;
}

interface GenesisSupplyTelemetry {
  totalCap: number;
  soldCount: number;
  remainingCount: number;
}

const TARGET_TAB_OPTIONS = [
  { value: 'products:alpha', label: 'Quantum Alpha™ Hub' },
  { value: 'products:genesis', label: 'Genesis Core™ Hub' },
  { value: 'products:chrono', label: 'Chrono Vaults™ Hub' },
  { value: 'products', label: 'Ecosystem Hubs (Default)' },
  { value: 'network', label: 'Partner Network & Ranks' },
  { value: 'wallet', label: 'Wallet & PHIVO Swap' },
  { value: 'deposit', label: 'USDT Deposit' },
  { value: 'withdrawals', label: 'BEP-20 Withdrawals' },
];

export const AdminPromoManager: React.FC = () => {
  const [promos, setPromos] = useState<EcosystemPromoBanner[]>([]);
  const [supply, setSupply] = useState<GenesisSupplyTelemetry | null>(null);
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const [drafts, setDrafts] = useState<Record<string, EcosystemPromoBanner>>({});
  const [newPromo, setNewPromo] = useState({
    badgeText: 'PROTOCOL ANNOUNCEMENT',
    title: '',
    subtitle: '',
    ctaLabel: 'Explore Hub',
    targetTab: 'products:alpha',
    accentTheme: 'cyan' as 'gold' | 'cyan' | 'emerald',
    showNodeScarcity: false,
    isActive: true,
    sortOrder: 4,
  });

  const fetchPromos = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/admin/ecosystem-promos', { credentials: 'include' });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.message || 'Failed to load promo spotlights.');
      }
      const list: EcosystemPromoBanner[] = Array.isArray(data.promos) ? data.promos : [];
      setPromos(list);
      setSupply(data.genesisSupply || null);
      const nextDrafts: Record<string, EcosystemPromoBanner> = {};
      for (const item of list) {
        nextDrafts[item.id] = { ...item };
      }
      setDrafts(nextDrafts);
    } catch (err: any) {
      setMessage({ type: 'error', text: err.message || 'Failed to fetch promo spotlights.' });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchPromos();
  }, [fetchPromos]);

  const handleUpdateDraft = (id: string, patch: Partial<EcosystemPromoBanner>) => {
    setDrafts((prev) => ({
      ...prev,
      [id]: {
        ...prev[id],
        ...patch,
      },
    }));
  };

  const handleSavePromo = async (id: string) => {
    const draft = drafts[id];
    if (!draft) return;
    setSavingId(id);
    setMessage(null);
    try {
      const res = await fetch(`/api/admin/ecosystem-promos/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          badgeText: draft.badgeText,
          title: draft.title,
          subtitle: draft.subtitle,
          ctaLabel: draft.ctaLabel,
          targetTab: draft.targetTab,
          accentTheme: draft.accentTheme,
          showNodeScarcity: draft.showNodeScarcity,
          isActive: draft.isActive,
          sortOrder: Number(draft.sortOrder) || 0,
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        throw new Error(json.message || 'Failed to save spotlight banner.');
      }
      setMessage({ type: 'success', text: `Saved spotlight "${draft.title}" successfully.` });
      await fetchPromos();
    } catch (err: any) {
      setMessage({ type: 'error', text: err.message || 'Error updating spotlight banner.' });
    } finally {
      setSavingId(null);
    }
  };

  const handleQuickToggle = async (promo: EcosystemPromoBanner) => {
    setSavingId(promo.id);
    setMessage(null);
    try {
      const res = await fetch(`/api/admin/ecosystem-promos/${promo.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ isActive: !promo.isActive }),
      });
      const json = await res.json();
      if (!res.ok) {
        throw new Error(json.message || 'Failed to toggle spotlight status.');
      }
      setMessage({
        type: 'success',
        text: `Spotlight "${promo.title}" is now ${!promo.isActive ? 'ACTIVE (LIVE)' : 'HIDDEN (OFF)'}.`,
      });
      await fetchPromos();
    } catch (err: any) {
      setMessage({ type: 'error', text: err.message || 'Error toggling spotlight.' });
    } finally {
      setSavingId(null);
    }
  };

  const handleDeletePromo = async (promo: EcosystemPromoBanner) => {
    setDeletingId(promo.id);
    setMessage(null);
    try {
      const res = await fetch(`/api/admin/ecosystem-promos/${promo.id}`, {
        method: 'DELETE',
        credentials: 'include',
      });
      const json = await res.json();
      if (!res.ok) {
        throw new Error(json.message || 'Failed to delete spotlight.');
      }
      setMessage({ type: 'success', text: `Removed spotlight "${promo.title}".` });
      await fetchPromos();
    } catch (err: any) {
      setMessage({ type: 'error', text: err.message || 'Error deleting spotlight.' });
    } finally {
      setDeletingId(null);
    }
  };

  const handleCreatePromo = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newPromo.title.trim() || !newPromo.subtitle.trim()) {
      setMessage({ type: 'error', text: 'Title and subtitle are required to publish a spotlight.' });
      return;
    }
    setCreating(true);
    setMessage(null);
    try {
      const res = await fetch('/api/admin/ecosystem-promos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(newPromo),
      });
      const json = await res.json();
      if (!res.ok) {
        throw new Error(json.message || 'Failed to create spotlight banner.');
      }
      setMessage({ type: 'success', text: `Published new spotlight "${newPromo.title}".` });
      setNewPromo({
        badgeText: 'PROTOCOL ANNOUNCEMENT',
        title: '',
        subtitle: '',
        ctaLabel: 'Explore Hub',
        targetTab: 'products:alpha',
        accentTheme: 'cyan',
        showNodeScarcity: false,
        isActive: true,
        sortOrder: promos.length + 1,
      });
      await fetchPromos();
    } catch (err: any) {
      setMessage({ type: 'error', text: err.message || 'Error creating spotlight banner.' });
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header & Live Genesis Scarcity Telemetry */}
      <PhxGlassCard accent="gold">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h3 className="text-base font-bold text-white flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-[#F5B800]" />
              <span>Overview Promo &amp; Supply Spotlight Manager</span>
            </h3>
            <p className="text-xs text-[#98A2B3] mt-1">
              Control the animated One UI 9.5 spotlight carousel shown on every member&apos;s Dashboard Overview. Toggle ON/OFF, edit copy, change accent themes, or add new product spotlights in real time.
            </p>
          </div>

          <div className="flex items-center gap-3 shrink-0">
            {supply && (
              <div className="px-3.5 py-2 rounded-xl bg-[#050807] border border-[#00E676]/30 text-right">
                <div className="text-[10px] font-mono uppercase text-[#98A2B3]">Live Node Scarcity</div>
                <div className="text-xs font-mono font-bold text-[#00E676] tabular-nums">
                  {Number(supply.remainingCount ?? 10000).toLocaleString()} / {Number(supply.totalCap ?? 10000).toLocaleString()} Remaining
                </div>
              </div>
            )}
            <button
              type="button"
              onClick={fetchPromos}
              disabled={loading}
              className="px-3.5 py-2.5 rounded-xl bg-white/[0.05] hover:bg-white/[0.1] border border-white/10 text-xs font-bold text-white inline-flex items-center gap-1.5 cursor-pointer"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
              <span>Refresh</span>
            </button>
          </div>
        </div>

        {message && (
          <div
            className={`mt-4 p-3 rounded-xl border text-xs flex items-center gap-2 ${
              message.type === 'success'
                ? 'bg-[#00E676]/10 border-[#00E676]/35 text-[#00E676]'
                : 'bg-[#F04438]/10 border-[#F04438]/35 text-[#F04438]'
            }`}
          >
            {message.type === 'success' ? (
              <CheckCircle2 className="w-4 h-4 shrink-0" />
            ) : (
              <AlertCircle className="w-4 h-4 shrink-0" />
            )}
            <span>{message.text}</span>
          </div>
        )}
      </PhxGlassCard>

      {/* Existing Spotlights List */}
      <div className="space-y-4">
        {loading ? (
          <PhxGlassCard accent="cyan">
            <div className="py-10 flex items-center justify-center gap-2 text-xs font-mono text-[#00E5FF]">
              <Loader2 className="w-4 h-4 animate-spin" />
              <span>Loading Overview Promo Spotlights...</span>
            </div>
          </PhxGlassCard>
        ) : promos.length === 0 ? (
          <PhxGlassCard accent="cyan">
            <div className="py-8 text-center text-xs text-[#98A2B3]">
              No spotlight banners configured yet. Create your first spotlight below.
            </div>
          </PhxGlassCard>
        ) : (
          promos.map((promo) => {
            const d = drafts[promo.id] || promo;
            const isSaving = savingId === promo.id;
            const isDeleting = deletingId === promo.id;

            return (
              <PhxGlassCard
                key={promo.id}
                accent={d.accentTheme === 'gold' ? 'gold' : 'cyan'}
              >
                <div className="space-y-4">
                  <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 pb-3">
                    <div className="flex items-center gap-2.5">
                      <span className="px-2.5 py-0.5 rounded-full text-[10px] font-mono font-bold bg-white/[0.06] text-[#D0D5DD] border border-white/10">
                        #{d.sortOrder}
                      </span>
                      <span className="text-sm font-extrabold text-white">{promo.title}</span>
                      <span
                        className={`px-2 py-0.5 rounded-full text-[10px] font-mono font-bold border ${
                          promo.isActive
                            ? 'bg-[#00E676]/15 text-[#00E676] border-[#00E676]/40'
                            : 'bg-[#F04438]/15 text-[#F04438] border-[#F04438]/40'
                        }`}
                      >
                        {promo.isActive ? 'LIVE ON OVERVIEW' : 'HIDDEN (OFF)'}
                      </span>
                    </div>

                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => handleQuickToggle(promo)}
                        disabled={isSaving}
                        className={`px-3 py-1.5 rounded-lg text-[11px] font-mono font-bold border inline-flex items-center gap-1.5 cursor-pointer ${
                          promo.isActive
                            ? 'bg-[#F04438]/15 text-[#F04438] border-[#F04438]/40 hover:bg-[#F04438]/25'
                            : 'bg-[#00E676]/15 text-[#00E676] border-[#00E676]/40 hover:bg-[#00E676]/25'
                        }`}
                      >
                        <Power className="w-3.5 h-3.5" />
                        <span>{promo.isActive ? 'Turn OFF' : 'Turn ON'}</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => handleDeletePromo(promo)}
                        disabled={isDeleting}
                        className="px-2.5 py-1.5 rounded-lg bg-[#F04438]/10 hover:bg-[#F04438]/20 border border-[#F04438]/30 text-[#F04438] text-xs inline-flex items-center gap-1 cursor-pointer disabled:opacity-50"
                        title="Delete spotlight"
                      >
                        {isDeleting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                      </button>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
                    <div>
                      <label className="text-[10px] font-mono uppercase text-[#98A2B3] block mb-1">
                        Badge Label
                      </label>
                      <input
                        type="text"
                        value={d.badgeText}
                        onChange={(e) => handleUpdateDraft(promo.id, { badgeText: e.target.value })}
                        className="w-full px-3 py-2 rounded-xl bg-[#050807] border border-white/15 text-white text-xs font-mono"
                      />
                    </div>

                    <div className="lg:col-span-2">
                      <label className="text-[10px] font-mono uppercase text-[#98A2B3] block mb-1">
                        Headline Title
                      </label>
                      <input
                        type="text"
                        value={d.title}
                        onChange={(e) => handleUpdateDraft(promo.id, { title: e.target.value })}
                        className="w-full px-3 py-2 rounded-xl bg-[#050807] border border-white/15 text-white text-xs font-bold"
                      />
                    </div>

                    <div>
                      <label className="text-[10px] font-mono uppercase text-[#98A2B3] block mb-1">
                        Sort Order
                      </label>
                      <input
                        type="number"
                        min={0}
                        max={999}
                        value={d.sortOrder}
                        onChange={(e) => handleUpdateDraft(promo.id, { sortOrder: Number(e.target.value) })}
                        className="w-full px-3 py-2 rounded-xl bg-[#050807] border border-white/15 text-white text-xs font-mono"
                      />
                    </div>

                    <div className="md:col-span-2 lg:col-span-4">
                      <label className="text-[10px] font-mono uppercase text-[#98A2B3] block mb-1">
                        Subtitle / Institutional Description
                      </label>
                      <input
                        type="text"
                        value={d.subtitle}
                        onChange={(e) => handleUpdateDraft(promo.id, { subtitle: e.target.value })}
                        className="w-full px-3 py-2 rounded-xl bg-[#050807] border border-white/15 text-white text-xs"
                      />
                    </div>

                    <div>
                      <label className="text-[10px] font-mono uppercase text-[#98A2B3] block mb-1">
                        CTA Button Label
                      </label>
                      <input
                        type="text"
                        value={d.ctaLabel}
                        onChange={(e) => handleUpdateDraft(promo.id, { ctaLabel: e.target.value })}
                        className="w-full px-3 py-2 rounded-xl bg-[#050807] border border-white/15 text-white text-xs"
                      />
                    </div>

                    <div>
                      <label className="text-[10px] font-mono uppercase text-[#98A2B3] block mb-1">
                        Target Destination
                      </label>
                      <select
                        value={d.targetTab}
                        onChange={(e) => handleUpdateDraft(promo.id, { targetTab: e.target.value })}
                        className="w-full px-3 py-2 rounded-xl bg-[#050807] border border-white/15 text-white text-xs"
                      >
                        {TARGET_TAB_OPTIONS.map((opt) => (
                          <option key={opt.value} value={opt.value}>
                            {opt.label}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="text-[10px] font-mono uppercase text-[#98A2B3] block mb-1">
                        Accent Theme
                      </label>
                      <select
                        value={d.accentTheme}
                        onChange={(e) =>
                          handleUpdateDraft(promo.id, {
                            accentTheme: e.target.value as 'gold' | 'cyan' | 'emerald',
                          })
                        }
                        className="w-full px-3 py-2 rounded-xl bg-[#050807] border border-white/15 text-white text-xs"
                      >
                        <option value="cyan">Electric Cyan (#00E5FF)</option>
                        <option value="emerald">Emerald Pulse (#00E676)</option>
                        <option value="gold">Metallic Gold (#F5B800)</option>
                      </select>
                    </div>

                    <div className="flex items-end justify-between gap-2">
                      <label className="flex items-center gap-2 text-xs text-[#D0D5DD] cursor-pointer py-2">
                        <input
                          type="checkbox"
                          checked={d.showNodeScarcity}
                          onChange={(e) =>
                            handleUpdateDraft(promo.id, { showNodeScarcity: e.target.checked })
                          }
                          className="accent-[#00E676] w-4 h-4"
                        />
                        <span>10k Node Scarcity Bar</span>
                      </label>

                      <button
                        type="button"
                        onClick={() => handleSavePromo(promo.id)}
                        disabled={isSaving}
                        className="px-4 py-2 rounded-xl bg-[#00E5FF] hover:brightness-110 text-[#050807] font-extrabold text-xs inline-flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                      >
                        {isSaving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                        <span>Save</span>
                      </button>
                    </div>
                  </div>
                </div>
              </PhxGlassCard>
            );
          })
        )}
      </div>

      {/* Add New Spotlight Form */}
      <PhxGlassCard accent="cyan">
        <form onSubmit={handleCreatePromo} className="space-y-4">
          <h4 className="text-sm font-bold text-white flex items-center gap-2">
            <Plus className="w-4 h-4 text-[#00E5FF]" />
            <span>Add New Overview Promo Spotlight</span>
          </h4>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
            <div>
              <label className="text-[10px] font-mono uppercase text-[#98A2B3] block mb-1">
                Badge Text
              </label>
              <input
                type="text"
                value={newPromo.badgeText}
                onChange={(e) => setNewPromo((p) => ({ ...p, badgeText: e.target.value }))}
                className="w-full px-3 py-2 rounded-xl bg-[#050807] border border-white/15 text-white text-xs font-mono"
                required
              />
            </div>

            <div className="lg:col-span-2">
              <label className="text-[10px] font-mono uppercase text-[#98A2B3] block mb-1">
                Spotlight Title
              </label>
              <input
                type="text"
                placeholder="e.g., Q4 Sovereign Liquidity Campaign"
                value={newPromo.title}
                onChange={(e) => setNewPromo((p) => ({ ...p, title: e.target.value }))}
                className="w-full px-3 py-2 rounded-xl bg-[#050807] border border-white/15 text-white text-xs"
                required
              />
            </div>

            <div>
              <label className="text-[10px] font-mono uppercase text-[#98A2B3] block mb-1">
                Accent Theme
              </label>
              <select
                value={newPromo.accentTheme}
                onChange={(e) =>
                  setNewPromo((p) => ({
                    ...p,
                    accentTheme: e.target.value as 'gold' | 'cyan' | 'emerald',
                  }))
                }
                className="w-full px-3 py-2 rounded-xl bg-[#050807] border border-white/15 text-white text-xs"
              >
                <option value="cyan">Electric Cyan</option>
                <option value="emerald">Emerald Pulse</option>
                <option value="gold">Metallic Gold</option>
              </select>
            </div>

            <div className="md:col-span-2 lg:col-span-4">
              <label className="text-[10px] font-mono uppercase text-[#98A2B3] block mb-1">
                Subtitle Copy
              </label>
              <input
                type="text"
                placeholder="Concise institutional highlight shown inside the Overview carousel..."
                value={newPromo.subtitle}
                onChange={(e) => setNewPromo((p) => ({ ...p, subtitle: e.target.value }))}
                className="w-full px-3 py-2 rounded-xl bg-[#050807] border border-white/15 text-white text-xs"
                required
              />
            </div>

            <div>
              <label className="text-[10px] font-mono uppercase text-[#98A2B3] block mb-1">
                CTA Button Text
              </label>
              <input
                type="text"
                value={newPromo.ctaLabel}
                onChange={(e) => setNewPromo((p) => ({ ...p, ctaLabel: e.target.value }))}
                className="w-full px-3 py-2 rounded-xl bg-[#050807] border border-white/15 text-white text-xs"
                required
              />
            </div>

            <div>
              <label className="text-[10px] font-mono uppercase text-[#98A2B3] block mb-1">
                Target Hub
              </label>
              <select
                value={newPromo.targetTab}
                onChange={(e) => setNewPromo((p) => ({ ...p, targetTab: e.target.value }))}
                className="w-full px-3 py-2 rounded-xl bg-[#050807] border border-white/15 text-white text-xs"
              >
                {TARGET_TAB_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex items-end">
              <label className="flex items-center gap-2 text-xs text-[#D0D5DD] cursor-pointer py-2">
                <input
                  type="checkbox"
                  checked={newPromo.showNodeScarcity}
                  onChange={(e) =>
                    setNewPromo((p) => ({ ...p, showNodeScarcity: e.target.checked }))
                  }
                  className="accent-[#00E676] w-4 h-4"
                />
                <span>Show 10,000 Node Scarcity Bar</span>
              </label>
            </div>

            <div className="flex items-end justify-end">
              <button
                type="submit"
                disabled={creating}
                className="w-full px-4 py-2.5 rounded-xl bg-gradient-to-r from-[#00E5FF] to-[#00E676] text-[#050807] font-extrabold text-xs inline-flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50"
              >
                {creating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                <span>Publish Spotlight</span>
              </button>
            </div>
          </div>
        </form>
      </PhxGlassCard>
    </div>
  );
};
