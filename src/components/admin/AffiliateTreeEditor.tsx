import React, { useState, useEffect, useCallback } from 'react';
import {
  GitFork,
  Users,
  Search,
  CheckCircle2,
  AlertTriangle,
  RefreshCw,
  UserCheck,
  ArrowRight,
  Info,
  Loader2,
  Save,
  Link,
  Zap,
  Cpu,
  DollarSign,
  Layers,
  RotateCcw,
} from 'lucide-react';
import {
  AffiliateMasterNodeSpec,
  DEFAULT_AFFILIATE_MASTER_MAP,
} from '../../config/affiliateMasterMap';

interface EnrichedMasterMapRow extends AffiliateMasterNodeSpec {
  userId?: string | null;
  publicId?: string | null;
  referralCode?: string | null;
  activeNodePublicId?: string | null;
  activeNodesCount?: number;
  walletBalanceUsd?: number;
  spotCommissionEarnedUsd?: number;
  leftVolumeUnits?: number;
  rightVolumeUnits?: number;
  directReferralsCount?: number;
  binaryStatus?: 'PLACED' | 'UNPLACED';
}

interface UserTreeRecord {
  id: string;
  publicId: string;
  fullName: string;
  email: string;
  status: string;
  createdAt: string;
  referralCode: string | null;
  sponsor: {
    id: string;
    publicId: string;
    fullName: string;
    email: string;
  } | null;
  binaryPlacement: {
    parentId: string | null;
    parentPublicId: string | null;
    parentFullName: string | null;
    side: 'LEFT' | 'RIGHT' | null;
    status: 'PLACED' | 'UNPLACED';
    placedAt: string | null;
  };
}

export const AffiliateTreeEditor: React.FC = () => {
  // Master Affiliate Map state
  const [masterMapRows, setMasterMapRows] = useState<EnrichedMasterMapRow[]>(
    DEFAULT_AFFILIATE_MASTER_MAP
  );
  const [loadingMasterMap, setLoadingMasterMap] = useState<boolean>(false);
  const [savingMasterMap, setSavingMasterMap] = useState<boolean>(false);
  const [showVisualTree, setShowVisualTree] = useState<boolean>(true);

  // Individual User Explorer state
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [loading, setLoading] = useState<boolean>(false);
  const [usersList, setUsersList] = useState<UserTreeRecord[]>([]);
  const [selectedUser, setSelectedUser] = useState<UserTreeRecord | null>(null);

  // Edit Sponsor Form
  const [newSponsorInput, setNewSponsorInput] = useState<string>('');
  const [sponsorEditReason, setSponsorEditReason] = useState<string>('');
  const [savingSponsor, setSavingSponsor] = useState<boolean>(false);

  // Edit Placement Form
  const [targetParentInput, setTargetParentInput] = useState<string>('');
  const [targetSide, setTargetSide] = useState<'LEFT' | 'RIGHT'>('LEFT');
  const [placementEditReason, setPlacementEditReason] = useState<string>('');
  const [savingPlacement, setSavingPlacement] = useState<boolean>(false);

  // Tree Repair State
  const [repairing, setRepairing] = useState<boolean>(false);

  // Feedback Notification
  const [feedback, setFeedback] = useState<{
    type: 'success' | 'error' | 'info';
    message: string;
  } | null>(null);

  // Fetch Master Affiliate Map live status
  const fetchMasterMapStatus = useCallback(async () => {
    try {
      setLoadingMasterMap(true);
      const res = await fetch('/api/admin/network/master-map', { credentials: 'include' });
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data.specs) && data.specs.length > 0) {
          setMasterMapRows(data.specs);
        }
      }
    } catch (err) {
      console.error('[AffiliateTreeEditor] Master map fetch error:', err);
    } finally {
      setLoadingMasterMap(false);
    }
  }, []);

  // Search/Fetch Tree Users
  const fetchTreeUsers = useCallback(async (query = '') => {
    try {
      setLoading(true);
      const res = await fetch(
        `/api/admin/users?search=${encodeURIComponent(query)}&limit=25`,
        { credentials: 'include' }
      );
      if (res.ok) {
        const data = await res.json();
        const mapped: UserTreeRecord[] = (data.users || []).map((u: any) => ({
          id: u.id,
          publicId: u.publicId || 'PHX-USER',
          fullName: u.fullName || 'Operator',
          email: u.email || '',
          status: u.status || 'ACTIVE',
          createdAt: u.createdAt || new Date().toISOString(),
          referralCode: u.referralCode || null,
          sponsor: u.sponsorPublicId
            ? {
                id: u.sponsorUserId || '',
                publicId: u.sponsorPublicId,
                fullName: 'Sponsor Leader',
                email: '',
              }
            : null,
          binaryPlacement: {
            parentId: null,
            parentPublicId: null,
            parentFullName: null,
            side: null,
            status: 'UNPLACED',
            placedAt: null,
          },
        }));

        setUsersList(mapped);
        if (mapped.length > 0 && !selectedUser) {
          handleSelectUser(mapped[0]);
        }
      }
    } catch (err: any) {
      console.error('[AffiliateTreeEditor] Fetch error:', err);
    } finally {
      setLoading(false);
    }
  }, [selectedUser]);

  useEffect(() => {
    fetchMasterMapStatus();
    fetchTreeUsers();
  }, []);

  // Update a row field in the Master Affiliate Map editor
  const handleUpdateMasterRow = (
    index: number,
    field: keyof AffiliateMasterNodeSpec,
    value: any
  ) => {
    setMasterMapRows((prev) => {
      const updated = [...prev];
      updated[index] = {
        ...updated[index],
        [field]: value,
      };
      return updated;
    });
  };

  // Reset Master Map to canonical defaults from src/config/affiliateMasterMap.ts
  const handleResetToDefaultMap = () => {
    setMasterMapRows(DEFAULT_AFFILIATE_MASTER_MAP);
    setFeedback({
      type: 'info',
      message:
        'Loaded default 12-member Master Affiliate Map from src/config/affiliateMasterMap.ts. Click "Save & Activate Full Affiliate Map" to apply.',
    });
  };

  // 1-Click Save & Activate Master Affiliate Map
  const handleSaveAndActivateMasterMap = async () => {
    try {
      setSavingMasterMap(true);
      setFeedback(null);

      const cleanSpecs: AffiliateMasterNodeSpec[] = masterMapRows.map((r) => ({
        levelLabel: r.levelLabel,
        fullName: r.fullName,
        email: r.email,
        role: r.role,
        sponsorEmail: r.sponsorEmail,
        binaryParentEmail: r.binaryParentEmail,
        side: r.side,
        nodeStatus: r.nodeStatus,
        nodePriceUsd: Number(r.nodePriceUsd || 1000),
        spotCommissionUsd: Number(r.spotCommissionUsd || 0),
        extraWalletBalanceUsd: Number(r.extraWalletBalanceUsd || 0),
      }));

      const res = await fetch('/api/admin/network/master-map/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ specs: cleanSpecs }),
      });

      const data = await res.json();
      if (res.ok && data.success) {
        if (Array.isArray(data.specs) && data.specs.length > 0) {
          setMasterMapRows(data.specs);
        } else {
          await fetchMasterMapStatus();
        }
        await fetchTreeUsers(searchQuery);
        setFeedback({
          type: 'success',
          message:
            data.message ||
            `Successfully saved & activated all ${data.count || 12} Affiliate Master Map accounts! All $1,000 Genesis Nodes, $25 Spot Commissions, and Referral/Binary Trees are now 100% active and backed up to Firestore.`,
        });
      } else {
        throw new Error(data.message || 'Failed to save and activate Master Affiliate Map.');
      }
    } catch (err: any) {
      setFeedback({
        type: 'error',
        message: err.message || 'Error saving Master Affiliate Map.',
      });
    } finally {
      setSavingMasterMap(false);
    }
  };

  const handleSelectUser = async (user: UserTreeRecord) => {
    setSelectedUser(user);
    setNewSponsorInput(user.sponsor?.publicId || '');
    setSponsorEditReason('');
    setTargetParentInput('');
    setPlacementEditReason('');

    try {
      const res = await fetch(`/api/admin/users/${user.id}/360`, {
        credentials: 'include',
      });
      if (res.ok) {
        const data = await res.json();
        const fullUser = data.user || {};
        const fullSponsor = data.sponsor || null;
        const bp = data.binaryPlacement || null;

        const updatedRecord: UserTreeRecord = {
          id: fullUser.id || user.id,
          publicId: fullUser.public_id || user.publicId,
          fullName: fullUser.full_name || user.fullName,
          email: fullUser.email || user.email,
          status: fullUser.status || user.status,
          createdAt: fullUser.created_at || user.createdAt,
          referralCode: data.referralCode || user.referralCode,
          sponsor: fullSponsor
            ? {
                id: fullSponsor.sponsor_id || '',
                publicId: fullSponsor.sponsor_public_id || 'PHX-LEADER',
                fullName: fullSponsor.sponsor_full_name || 'Leader',
                email: fullSponsor.sponsor_email || '',
              }
            : null,
          binaryPlacement: {
            parentId: bp?.parent_id || null,
            parentPublicId: bp?.parent_public_id || null,
            parentFullName: bp?.parent_full_name || null,
            side: bp?.side || null,
            status: bp?.status === 'PLACED' ? 'PLACED' : 'UNPLACED',
            placedAt: bp?.placed_at || null,
          },
        };

        setSelectedUser(updatedRecord);
        setNewSponsorInput(updatedRecord.sponsor?.publicId || '');
        setTargetParentInput(updatedRecord.binaryPlacement.parentPublicId || '');
        setTargetSide(updatedRecord.binaryPlacement.side || 'LEFT');
      }
    } catch (err) {
      console.error('[AffiliateTreeEditor] User details error:', err);
    }
  };

  // 1. Re-assign Team Sponsor Leader
  const handleSaveSponsor = async () => {
    if (!selectedUser) return;
    if (!newSponsorInput.trim()) {
      setFeedback({
        type: 'error',
        message: 'Sponsor identifier (Public ID, Referral Code, or Email) is required.',
      });
      return;
    }
    if (!sponsorEditReason.trim() || sponsorEditReason.trim().length < 5) {
      setFeedback({
        type: 'error',
        message: 'Admin audit reason is mandatory (minimum 5 characters).',
      });
      return;
    }

    try {
      setSavingSponsor(true);
      setFeedback(null);

      const res = await fetch(`/api/admin/users/${selectedUser.id}/sponsor`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          sponsorIdentifier: newSponsorInput.trim(),
          reason: sponsorEditReason.trim(),
        }),
      });

      const data = await res.json();
      if (res.ok && data.success) {
        setFeedback({
          type: 'success',
          message: `Sponsor team leader updated successfully for ${selectedUser.publicId} and backed up to Firestore!`,
        });
        handleSelectUser(selectedUser);
        fetchMasterMapStatus();
      } else {
        throw new Error(data.message || 'Failed to update sponsor team leader.');
      }
    } catch (err: any) {
      setFeedback({ type: 'error', message: err.message || 'Error updating sponsor.' });
    } finally {
      setSavingSponsor(false);
    }
  };

  // 2. Force or Update Binary Placement
  const handleSavePlacement = async () => {
    if (!selectedUser) return;
    if (!targetParentInput.trim()) {
      setFeedback({
        type: 'error',
        message: 'Parent User Public ID is required for binary placement.',
      });
      return;
    }
    if (!placementEditReason.trim() || placementEditReason.trim().length < 5) {
      setFeedback({
        type: 'error',
        message: 'Admin audit reason is mandatory (minimum 5 characters).',
      });
      return;
    }

    try {
      setSavingPlacement(true);
      setFeedback(null);

      const res = await fetch(`/api/admin/network/placement/update`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          memberPublicId: selectedUser.publicId,
          targetParentPublicId: targetParentInput.trim(),
          side: targetSide,
          reason: placementEditReason.trim(),
        }),
      });

      const data = await res.json();
      if (res.ok && data.success) {
        setFeedback({
          type: 'success',
          message: `Binary placement successfully set for ${selectedUser.publicId} (${targetSide} under ${data.parentPublicId}) and backed up to Firestore!`,
        });
        handleSelectUser(selectedUser);
        fetchMasterMapStatus();
      } else {
        throw new Error(data.message || 'Failed to update binary placement.');
      }
    } catch (err: any) {
      setFeedback({
        type: 'error',
        message: err.message || 'Error updating binary placement.',
      });
    } finally {
      setSavingPlacement(false);
    }
  };

  // 3. Trigger 1-Click Tree Repair & Firestore Backup Sync
  const handleRepairTree = async () => {
    try {
      setRepairing(true);
      setFeedback(null);

      const res = await fetch('/api/admin/network/tree/repair', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
      });

      const data = await res.json();
      if (res.ok && data.success) {
        setFeedback({
          type: 'success',
          message: `Affiliate Tree Audit & Repair Completed! Reconciled ${data.repairedSponsors || 0} missing sponsor links, fixed ${data.repairedPlacements || 0} binary placements, and backed up all records to Firestore!`,
        });
        fetchMasterMapStatus();
        fetchTreeUsers(searchQuery);
      } else {
        throw new Error(data.message || 'Failed to repair affiliate tree.');
      }
    } catch (err: any) {
      setFeedback({
        type: 'error',
        message: err.message || 'Error running affiliate tree repair.',
      });
    } finally {
      setRepairing(false);
    }
  };

  const activeNodesTotal = masterMapRows.filter((r) => r.nodeStatus === 'ACTIVE').length;
  const pendingNodesTotal = masterMapRows.filter((r) => r.nodeStatus === 'PENDING').length;
  const totalSpotCommUsd = masterMapRows.reduce(
    (sum, r) => sum + Number(r.spotCommissionUsd || 0),
    0
  );

  return (
    <div className="space-y-6 font-sans">
      {/* Top Banner */}
      <div className="p-5 rounded-2xl bg-[#07101D] border border-white/[0.08] shadow-xl flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-3.5">
          <div className="w-12 h-12 rounded-xl bg-[#00CFFF]/10 border border-[#00CFFF]/30 flex items-center justify-center text-[#00CFFF] flex-shrink-0">
            <GitFork className="w-6 h-6" />
          </div>
          <div>
            <h2 className="text-base font-bold text-white flex items-center gap-2">
              <span>Affiliate &amp; Binary Tree Master Control</span>
              <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-[#32D583]/10 text-[#32D583] border border-[#32D583]/30 font-bold uppercase">
                100% Data Protection
              </span>
            </h2>
            <p className="text-xs text-[#98A2B3]">
              1-Click Master Affiliate Map activation (`src/config/affiliateMasterMap.ts`), Genesis Node assignment, $25 Spot Commissions, and permanent Firestore sync.
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <button
            onClick={handleRepairTree}
            disabled={repairing}
            className="px-3.5 py-2.5 rounded-xl bg-white/[0.05] hover:bg-white/[0.1] border border-white/[0.1] text-white font-bold text-xs flex items-center justify-center gap-2 transition-all cursor-pointer whitespace-nowrap"
          >
            {repairing ? (
              <Loader2 className="w-4 h-4 animate-spin text-[#00CFFF]" />
            ) : (
              <RefreshCw className="w-4 h-4 text-[#00CFFF]" />
            )}
            <span>Repair &amp; Sync Tree</span>
          </button>

          <button
            onClick={handleSaveAndActivateMasterMap}
            disabled={savingMasterMap}
            className="px-4 py-2.5 rounded-xl bg-gradient-to-r from-[#32D583] to-[#00CFFF] hover:opacity-95 text-[#05070B] font-extrabold text-xs flex items-center justify-center gap-2 transition-all cursor-pointer whitespace-nowrap shadow-lg shadow-[#32D583]/20"
          >
            {savingMasterMap ? (
              <Loader2 className="w-4 h-4 animate-spin text-[#05070B]" />
            ) : (
              <Save className="w-4 h-4 text-[#05070B]" />
            )}
            <span>Save &amp; Activate Full Affiliate Map</span>
          </button>
        </div>
      </div>

      {/* Feedback Alert Toast */}
      {feedback && (
        <div
          className={`p-4 rounded-xl border flex items-center justify-between text-xs transition-all ${
            feedback.type === 'success'
              ? 'bg-[#32D583]/10 border-[#32D583]/30 text-[#32D583]'
              : feedback.type === 'error'
              ? 'bg-[#F04438]/10 border-[#F04438]/30 text-[#F04438]'
              : 'bg-[#00CFFF]/10 border-[#00CFFF]/30 text-[#00CFFF]'
          }`}
        >
          <div className="flex items-center gap-2.5">
            {feedback.type === 'success' ? (
              <CheckCircle2 className="w-4 h-4 shrink-0 text-[#32D583]" />
            ) : feedback.type === 'error' ? (
              <AlertTriangle className="w-4 h-4 shrink-0 text-[#F04438]" />
            ) : (
              <Info className="w-4 h-4 shrink-0 text-[#00CFFF]" />
            )}
            <span>{feedback.message}</span>
          </div>
          <button
            onClick={() => setFeedback(null)}
            className="text-white/60 hover:text-white p-1"
          >
            &times;
          </button>
        </div>
      )}

      {/* =====================================================================
          MASTER AFFILIATE & NODE ACTIVATION MAP (1-CLICK SAVE & SYNC)
         ===================================================================== */}
      <div className="p-5 rounded-2xl bg-[#07101D] border border-[#00CFFF]/25 shadow-xl space-y-4">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 border-b border-white/[0.08] pb-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <Cpu className="w-4 h-4 text-[#00CFFF]" />
              <h3 className="text-sm font-extrabold text-white uppercase tracking-wide font-mono">
                Master Affiliate Genealogy &amp; Node Activation Map
              </h3>
              <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-[#00CFFF]/15 text-[#00CFFF] border border-[#00CFFF]/30">
                src/config/affiliateMasterMap.ts
              </span>
            </div>
            <p className="text-xs text-[#98A2B3]">
              Edit Node status (`ACTIVE` = $1,000 Genesis Node activated &amp; deducted, `PENDING` = awaiting activation), Spot Commission ($25), or Sponsor/Binary leg below, then click <strong>Save &amp; Activate Full Affiliate Map</strong>.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className="px-3 py-1.5 rounded-lg bg-[#05070B] border border-white/[0.08] text-[11px] font-mono text-[#98A2B3]">
              Active Nodes: <span className="text-[#32D583] font-bold">{activeNodesTotal}</span> | Pending: <span className="text-[#F59E0B] font-bold">{pendingNodesTotal}</span> | Spot Comm: <span className="text-[#00CFFF] font-bold">${totalSpotCommUsd}</span>
            </div>

            <button
              type="button"
              onClick={() => setShowVisualTree(!showVisualTree)}
              className="px-3 py-1.5 rounded-lg bg-white/[0.05] hover:bg-white/[0.1] border border-white/[0.1] text-xs font-mono text-white flex items-center gap-1.5 cursor-pointer"
            >
              <Layers className="w-3.5 h-3.5 text-[#00CFFF]" />
              <span>{showVisualTree ? 'Hide' : 'Show'} Visual Tree</span>
            </button>

            <button
              type="button"
              onClick={handleResetToDefaultMap}
              className="px-3 py-1.5 rounded-lg bg-white/[0.05] hover:bg-white/[0.1] border border-white/[0.1] text-xs font-mono text-[#98A2B3] hover:text-white flex items-center gap-1.5 cursor-pointer"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Reset Defaults</span>
            </button>

            <button
              type="button"
              onClick={fetchMasterMapStatus}
              disabled={loadingMasterMap}
              className="px-3 py-1.5 rounded-lg bg-white/[0.05] hover:bg-white/[0.1] border border-white/[0.1] text-xs font-mono text-[#00CFFF] flex items-center gap-1.5 cursor-pointer"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loadingMasterMap ? 'animate-spin' : ''}`} />
              <span>Refresh Status</span>
            </button>
          </div>
        </div>

        {/* Visual Hierarchy Diagram (Mother -> L0 -> L1 -> L2 -> L3 -> Left & Right Branches) */}
        {showVisualTree && (
          <div className="p-4 rounded-xl bg-[#05070B] border border-white/[0.08] space-y-3 overflow-x-auto">
            <div className="text-[11px] font-mono text-[#00CFFF] uppercase tracking-wider flex items-center justify-between">
              <span>Live Referral &amp; Binary Tree Structure (Mother &rarr; L0 &rarr; L1..L7)</span>
              <span className="text-[#98A2B3]">Left Branch (L4-A..L7-A) &amp; Right Branch (L4-B..L6-B)</span>
            </div>

            <div className="font-mono text-xs space-y-1.5 text-[#E5E7EB] min-w-[680px]">
              {masterMapRows.map((row) => {
                const indentMap: Record<string, string> = {
                  MOTHER: 'pl-0',
                  L0: 'pl-4',
                  L1: 'pl-8',
                  L2: 'pl-12',
                  L3: 'pl-16',
                  'L4-A': 'pl-20',
                  'L5-A': 'pl-24',
                  'L6-A': 'pl-28',
                  'L7-A': 'pl-32',
                  'L4-B': 'pl-20',
                  'L5-B': 'pl-24',
                  'L6-B': 'pl-28',
                };
                const indentClass = indentMap[row.levelLabel] || 'pl-4';
                const isRightBranch = row.levelLabel.endsWith('-B');

                return (
                  <div
                    key={row.email}
                    className={`flex items-center justify-between py-1.5 px-3 rounded-lg border ${
                      row.nodeStatus === 'ACTIVE'
                        ? 'bg-[#32D583]/[0.05] border-[#32D583]/20'
                        : 'bg-[#F59E0B]/[0.05] border-[#F59E0B]/20'
                    } ${indentClass}`}
                  >
                    <div className="flex items-center gap-2">
                      <span className="text-[#98A2B3]">└──</span>
                      <span
                        className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                          isRightBranch
                            ? 'bg-[#32D583]/20 text-[#32D583]'
                            : 'bg-[#00CFFF]/20 text-[#00CFFF]'
                        }`}
                      >
                        [{row.levelLabel}{row.side ? ` • ${row.side}` : ''}]
                      </span>
                      <span className="font-bold text-white">{row.fullName}</span>
                      <span className="text-[#98A2B3] text-[11px]">({row.email})</span>
                      {row.publicId && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-white/[0.06] text-[#00CFFF]">
                          {row.publicId}
                        </span>
                      )}
                    </div>

                    <div className="flex items-center gap-3 text-[11px]">
                      <span
                        className={`px-2 py-0.5 rounded font-bold ${
                          row.nodeStatus === 'ACTIVE'
                            ? 'bg-[#32D583]/20 text-[#32D583]'
                            : 'bg-[#F59E0B]/20 text-[#F59E0B]'
                        }`}
                      >
                        {row.nodeStatus === 'ACTIVE'
                          ? `Node ACTIVE ($1,000)${row.activeNodePublicId ? ` • ${row.activeNodePublicId}` : ''}`
                          : 'Node PENDING'}
                      </span>
                      <span className="text-[#00CFFF] font-bold">
                        Spot: ${Number(row.spotCommissionUsd || 0).toFixed(0)}
                      </span>
                      <span className="text-[#98A2B3]">
                        Vol L:{row.leftVolumeUnits ?? 0} / R:{row.rightVolumeUnits ?? 0}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Editable Master Table */}
        <div className="overflow-x-auto rounded-xl border border-white/[0.08]">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="bg-[#05070B] border-b border-white/[0.08] text-[10px] font-mono uppercase text-[#98A2B3]">
                <th className="py-3 px-3">Level</th>
                <th className="py-3 px-3">Member &amp; Email</th>
                <th className="py-3 px-3">Sponsor &amp; Binary Leg</th>
                <th className="py-3 px-3">Genesis Node ($1,000)</th>
                <th className="py-3 px-3">Spot Commission ($)</th>
                <th className="py-3 px-3">Extra Balance ($)</th>
                <th className="py-3 px-3 text-right">Live Wallet &amp; Volume</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/[0.06] font-mono">
              {masterMapRows.map((row, idx) => (
                <tr key={row.email} className="hover:bg-white/[0.02] transition-colors">
                  {/* Level */}
                  <td className="py-2.5 px-3 whitespace-nowrap">
                    <span className="px-2 py-1 rounded bg-[#00CFFF]/15 text-[#00CFFF] border border-[#00CFFF]/30 font-bold text-[11px]">
                      {row.levelLabel}
                    </span>
                  </td>

                  {/* Member & Email */}
                  <td className="py-2.5 px-3">
                    <input
                      type="text"
                      value={row.fullName}
                      onChange={(e) => handleUpdateMasterRow(idx, 'fullName', e.target.value)}
                      className="bg-[#05070B] border border-white/[0.1] focus:border-[#00CFFF] rounded-lg px-2.5 py-1 text-xs text-white font-sans font-bold w-44 outline-none"
                    />
                    <div className="text-[11px] text-[#98A2B3] mt-1 flex items-center gap-1.5">
                      <span>{row.email}</span>
                      {row.publicId && (
                        <span className="text-[10px] text-[#00CFFF] bg-[#00CFFF]/10 px-1.5 py-0.2 rounded">
                          {row.publicId}
                        </span>
                      )}
                    </div>
                  </td>

                  {/* Sponsor & Binary Leg */}
                  <td className="py-2.5 px-3">
                    {row.levelLabel === 'MOTHER' ? (
                      <span className="text-[11px] text-[#98A2B3]">Root Mother Account</span>
                    ) : (
                      <div className="space-y-1">
                        <div className="flex items-center gap-1.5">
                          <span className="text-[10px] text-[#98A2B3] w-14">Sponsor:</span>
                          <input
                            type="text"
                            value={row.sponsorEmail || ''}
                            onChange={(e) =>
                              handleUpdateMasterRow(idx, 'sponsorEmail', e.target.value)
                            }
                            className="bg-[#05070B] border border-white/[0.1] focus:border-[#00CFFF] rounded px-2 py-0.5 text-[11px] text-white w-48 outline-none"
                          />
                        </div>
                        <div className="flex items-center gap-1.5">
                          <span className="text-[10px] text-[#98A2B3] w-14">Leg Side:</span>
                          <select
                            value={row.side || 'LEFT'}
                            onChange={(e) =>
                              handleUpdateMasterRow(
                                idx,
                                'side',
                                e.target.value as 'LEFT' | 'RIGHT'
                              )
                            }
                            className="bg-[#05070B] border border-white/[0.1] focus:border-[#00CFFF] rounded px-2 py-0.5 text-[11px] text-[#00CFFF] font-bold outline-none cursor-pointer"
                          >
                            <option value="LEFT">LEFT LEG</option>
                            <option value="RIGHT">RIGHT LEG</option>
                          </select>
                        </div>
                      </div>
                    )}
                  </td>

                  {/* Genesis Node Status */}
                  <td className="py-2.5 px-3">
                    <select
                      value={row.nodeStatus}
                      onChange={(e) =>
                        handleUpdateMasterRow(
                          idx,
                          'nodeStatus',
                          e.target.value as 'ACTIVE' | 'PENDING'
                        )
                      }
                      className={`rounded-lg px-2.5 py-1.5 text-xs font-bold border outline-none cursor-pointer ${
                        row.nodeStatus === 'ACTIVE'
                          ? 'bg-[#32D583]/15 text-[#32D583] border-[#32D583]/30'
                          : 'bg-[#F59E0B]/15 text-[#F59E0B] border-[#F59E0B]/30'
                      }`}
                    >
                      <option value="ACTIVE" className="bg-[#07101D] text-[#32D583]">
                        ACTIVE ($1,000 Node)
                      </option>
                      <option value="PENDING" className="bg-[#07101D] text-[#F59E0B]">
                        PENDING
                      </option>
                    </select>
                    {row.activeNodePublicId && (
                      <div className="text-[10px] text-[#32D583] mt-1">
                        Node: {row.activeNodePublicId}
                      </div>
                    )}
                  </td>

                  {/* Spot Commission ($) */}
                  <td className="py-2.5 px-3">
                    <div className="flex items-center gap-1">
                      <DollarSign className="w-3.5 h-3.5 text-[#32D583]" />
                      <input
                        type="number"
                        min={0}
                        step={5}
                        value={row.spotCommissionUsd}
                        onChange={(e) =>
                          handleUpdateMasterRow(
                            idx,
                            'spotCommissionUsd',
                            parseFloat(e.target.value) || 0
                          )
                        }
                        className="bg-[#05070B] border border-white/[0.1] focus:border-[#32D583] rounded-lg px-2.5 py-1 text-xs text-[#32D583] font-bold w-20 outline-none"
                      />
                    </div>
                  </td>

                  {/* Extra Wallet Balance ($) */}
                  <td className="py-2.5 px-3">
                    <div className="flex items-center gap-1">
                      <DollarSign className="w-3.5 h-3.5 text-[#00CFFF]" />
                      <input
                        type="number"
                        min={0}
                        step={10}
                        value={row.extraWalletBalanceUsd || 0}
                        onChange={(e) =>
                          handleUpdateMasterRow(
                            idx,
                            'extraWalletBalanceUsd',
                            parseFloat(e.target.value) || 0
                          )
                        }
                        className="bg-[#05070B] border border-white/[0.1] focus:border-[#00CFFF] rounded-lg px-2.5 py-1 text-xs text-white w-20 outline-none"
                      />
                    </div>
                  </td>

                  {/* Live Wallet & Volume */}
                  <td className="py-2.5 px-3 text-right whitespace-nowrap">
                    <div className="text-xs font-bold text-[#32D583]">
                      Wallet: ${(row.walletBalanceUsd ?? row.spotCommissionUsd ?? 0).toFixed(2)}
                    </div>
                    <div className="text-[10px] text-[#98A2B3]">
                      L: {row.leftVolumeUnits ?? 0}u | R: {row.rightVolumeUnits ?? 0}u | Refs: {row.directReferralsCount ?? 0}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Bottom Action Bar */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-2">
          <div className="text-[11px] text-[#98A2B3] flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-[#32D583] shrink-0" />
            <span>
              Clicking <strong>Save &amp; Activate Full Affiliate Map</strong> automatically activates all <code>ACTIVE</code> $1,000 Genesis Nodes, deducts the $1,000 node purchase from the deposit ledger, credits $25 Spot Commissions, links all referrals &amp; binary placements, and syncs to Firestore.
            </span>
          </div>

          <button
            onClick={handleSaveAndActivateMasterMap}
            disabled={savingMasterMap}
            className="px-6 py-3 rounded-xl bg-gradient-to-r from-[#32D583] to-[#00CFFF] hover:opacity-95 text-[#05070B] font-extrabold text-xs flex items-center justify-center gap-2 transition-all cursor-pointer whitespace-nowrap shadow-lg shadow-[#32D583]/25"
          >
            {savingMasterMap ? (
              <Loader2 className="w-4 h-4 animate-spin text-[#05070B]" />
            ) : (
              <Zap className="w-4 h-4 text-[#05070B] fill-[#05070B]" />
            )}
            <span>Save &amp; Activate Full Affiliate Map Now</span>
          </button>
        </div>
      </div>

      {/* =====================================================================
          INDIVIDUAL OPERATOR SPONSOR & BINARY PLACEMENT EDITOR
         ===================================================================== */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Column: User Explorer */}
        <div className="lg:col-span-5 p-5 rounded-2xl bg-[#07101D] border border-white/[0.08] space-y-4 flex flex-col">
          <div className="flex items-center justify-between border-b border-white/[0.06] pb-3">
            <h3 className="text-xs font-bold text-white uppercase font-mono tracking-wider flex items-center gap-2">
              <Users className="w-4 h-4 text-[#00CFFF]" />
              <span>Select Individual Operator</span>
            </h3>
            <button
              onClick={() => fetchTreeUsers(searchQuery)}
              disabled={loading}
              className="text-[#00CFFF] hover:underline text-xs flex items-center gap-1 font-mono cursor-pointer"
            >
              <RefreshCw className={`w-3 h-3 ${loading ? 'animate-spin' : ''}`} />
              <span>Reload</span>
            </button>
          </div>

          {/* Search Box */}
          <div className="relative">
            <Search className="w-4 h-4 text-[#98A2B3] absolute left-3 top-2.5" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && fetchTreeUsers(searchQuery)}
              placeholder="Search Public ID, Email, or Name..."
              className="w-full bg-[#05070B] border border-white/[0.1] focus:border-[#00CFFF] rounded-xl pl-9 pr-3 py-2 text-xs text-white placeholder-[#98A2B3] outline-none transition-all"
            />
          </div>

          {/* Users List */}
          <div className="space-y-1.5 overflow-y-auto max-h-[500px] pr-1 no-scrollbar">
            {loading ? (
              <div className="p-8 text-center text-xs text-[#98A2B3] flex items-center justify-center gap-2">
                <Loader2 className="w-4 h-4 animate-spin text-[#00CFFF]" />
                <span>Loading users...</span>
              </div>
            ) : usersList.length === 0 ? (
              <div className="p-8 text-center text-xs text-[#98A2B3]">
                No users found. Try searching with a different term.
              </div>
            ) : (
              usersList.map((u) => {
                const isSelected = selectedUser?.id === u.id;
                return (
                  <button
                    key={u.id}
                    onClick={() => handleSelectUser(u)}
                    className={`w-full p-3 rounded-xl border text-left transition-all cursor-pointer flex items-center justify-between ${
                      isSelected
                        ? 'bg-[#00CFFF]/15 border-[#00CFFF] text-white shadow-md'
                        : 'bg-white/[0.02] hover:bg-white/[0.05] border-white/[0.06] text-[#98A2B3]'
                    }`}
                  >
                    <div>
                      <div className="text-xs font-bold text-white flex items-center gap-2">
                        <span>{u.fullName}</span>
                        <span className="font-mono text-[10px] px-1.5 py-0.5 rounded bg-white/[0.08] text-[#00CFFF]">
                          {u.publicId}
                        </span>
                      </div>
                      <div className="text-[11px] text-[#98A2B3] truncate max-w-[200px]">
                        {u.email}
                      </div>
                    </div>
                    <ArrowRight
                      className={`w-4 h-4 ${isSelected ? 'text-[#00CFFF]' : 'text-white/20'}`}
                    />
                  </button>
                );
              })
            )}
          </div>
        </div>

        {/* Right Column: Active Tree Editor Panel */}
        <div className="lg:col-span-7 space-y-6">
          {selectedUser ? (
            <>
              {/* Selected User Overview Card */}
              <div className="p-5 rounded-2xl bg-[#07101D] border border-white/[0.08] space-y-3">
                <div className="flex items-center justify-between border-b border-white/[0.06] pb-3">
                  <div>
                    <div className="text-xs font-extrabold text-white flex items-center gap-2">
                      <span className="text-base">{selectedUser.fullName}</span>
                      <span className="font-mono text-xs px-2 py-0.5 rounded bg-[#00CFFF]/20 text-[#00CFFF] border border-[#00CFFF]/30">
                        {selectedUser.publicId}
                      </span>
                    </div>
                    <div className="text-xs text-[#98A2B3]">{selectedUser.email}</div>
                  </div>
                  <div className="text-right font-mono text-[11px] text-[#98A2B3]">
                    <div>
                      Referral Code:{' '}
                      <span className="text-white font-bold">
                        {selectedUser.referralCode || 'N/A'}
                      </span>
                    </div>
                    <div>Joined: {new Date(selectedUser.createdAt).toLocaleDateString()}</div>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs font-mono">
                  <div className="p-3 rounded-xl bg-white/[0.02] border border-white/[0.06] space-y-1">
                    <div className="text-[10px] text-[#98A2B3] uppercase">
                      Current Direct Sponsor
                    </div>
                    <div className="font-bold text-white flex items-center gap-1.5">
                      <UserCheck className="w-3.5 h-3.5 text-[#32D583]" />
                      <span>
                        {selectedUser.sponsor
                          ? `${selectedUser.sponsor.publicId} (${selectedUser.sponsor.fullName})`
                          : 'Unassigned (Top / Root)'}
                      </span>
                    </div>
                  </div>

                  <div className="p-3 rounded-xl bg-white/[0.02] border border-white/[0.06] space-y-1">
                    <div className="text-[10px] text-[#98A2B3] uppercase">
                      Binary Tree Placement
                    </div>
                    <div className="font-bold text-white flex items-center gap-1.5">
                      <GitFork className="w-3.5 h-3.5 text-[#00CFFF]" />
                      <span>
                        {selectedUser.binaryPlacement.status === 'PLACED'
                          ? `${selectedUser.binaryPlacement.side || 'ROOT'} leg under ${
                              selectedUser.binaryPlacement.parentPublicId || 'Root'
                            }`
                          : 'UNPLACED'}
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Form 1: Edit Team Sponsor / Referral Leader */}
              <div className="p-5 rounded-2xl bg-[#07101D] border border-white/[0.08] space-y-4">
                <div className="border-b border-white/[0.06] pb-2">
                  <h3 className="text-xs font-bold text-white uppercase font-mono tracking-wider flex items-center gap-2">
                    <Link className="w-4 h-4 text-[#32D583]" />
                    <span>Re-assign Team Sponsor Leader</span>
                  </h3>
                  <p className="text-[11px] text-[#98A2B3]">
                    Change the direct referral sponsor for {selectedUser.publicId}. Synchronizes instantly across PostgreSQL &amp; Firestore.
                  </p>
                </div>

                <div className="space-y-3">
                  <div>
                    <label className="text-[11px] text-[#98A2B3] font-mono block mb-1">
                      New Sponsor Leader (Public ID, Referral Code, or Email)
                    </label>
                    <input
                      type="text"
                      value={newSponsorInput}
                      onChange={(e) => setNewSponsorInput(e.target.value)}
                      placeholder="e.g. PHX-100802 or plcshahjalal@gmail.com"
                      className="w-full bg-[#05070B] border border-white/[0.1] focus:border-[#32D583] rounded-xl px-3 py-2 text-xs text-white placeholder-[#98A2B3] outline-none"
                    />
                  </div>

                  <div>
                    <label className="text-[11px] text-[#98A2B3] font-mono block mb-1">
                      Admin Audit Reason (Required, min 5 chars)
                    </label>
                    <input
                      type="text"
                      value={sponsorEditReason}
                      onChange={(e) => setSponsorEditReason(e.target.value)}
                      placeholder="Reason for changing sponsor linkage..."
                      className="w-full bg-[#05070B] border border-white/[0.1] focus:border-[#32D583] rounded-xl px-3 py-2 text-xs text-white placeholder-[#98A2B3] outline-none"
                    />
                  </div>

                  <button
                    onClick={handleSaveSponsor}
                    disabled={savingSponsor}
                    className="w-full py-2.5 px-4 rounded-xl bg-[#32D583]/15 hover:bg-[#32D583]/25 text-[#32D583] border border-[#32D583]/30 font-bold text-xs flex items-center justify-center gap-2 transition-all cursor-pointer"
                  >
                    {savingSponsor ? (
                      <Loader2 className="w-4 h-4 animate-spin text-[#32D583]" />
                    ) : (
                      <Save className="w-4 h-4 text-[#32D583]" />
                    )}
                    <span>Save Sponsor Linkage &amp; Sync to Firestore</span>
                  </button>
                </div>
              </div>

              {/* Form 2: Force / Edit Binary Placement */}
              <div className="p-5 rounded-2xl bg-[#07101D] border border-white/[0.08] space-y-4">
                <div className="border-b border-white/[0.06] pb-2">
                  <h3 className="text-xs font-bold text-white uppercase font-mono tracking-wider flex items-center gap-2">
                    <GitFork className="w-4 h-4 text-[#00CFFF]" />
                    <span>Force / Adjust Binary Tree Placement</span>
                  </h3>
                  <p className="text-[11px] text-[#98A2B3]">
                    Place or move {selectedUser.publicId} into a specific Binary Tree position (Left or Right) under a Parent User.
                  </p>
                </div>

                <div className="space-y-3">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="text-[11px] text-[#98A2B3] font-mono block mb-1">
                        Parent User Public ID
                      </label>
                      <input
                        type="text"
                        value={targetParentInput}
                        onChange={(e) => setTargetParentInput(e.target.value)}
                        placeholder="e.g. PHX-100805"
                        className="w-full bg-[#05070B] border border-white/[0.1] focus:border-[#00CFFF] rounded-xl px-3 py-2 text-xs text-white placeholder-[#98A2B3] outline-none"
                      />
                    </div>

                    <div>
                      <label className="text-[11px] text-[#98A2B3] font-mono block mb-1">
                        Binary Leg Side
                      </label>
                      <select
                        value={targetSide}
                        onChange={(e) =>
                          setTargetSide(e.target.value as 'LEFT' | 'RIGHT')
                        }
                        className="w-full bg-[#05070B] border border-white/[0.1] focus:border-[#00CFFF] rounded-xl px-3 py-2 text-xs text-white outline-none cursor-pointer"
                      >
                        <option value="LEFT">LEFT Leg Position</option>
                        <option value="RIGHT">RIGHT Leg Position</option>
                      </select>
                    </div>
                  </div>

                  <div>
                    <label className="text-[11px] text-[#98A2B3] font-mono block mb-1">
                      Admin Audit Reason (Required, min 5 chars)
                    </label>
                    <input
                      type="text"
                      value={placementEditReason}
                      onChange={(e) => setPlacementEditReason(e.target.value)}
                      placeholder="Reason for placing or adjusting binary tree location..."
                      className="w-full bg-[#05070B] border border-white/[0.1] focus:border-[#00CFFF] rounded-xl px-3 py-2 text-xs text-white placeholder-[#98A2B3] outline-none"
                    />
                  </div>

                  <button
                    onClick={handleSavePlacement}
                    disabled={savingPlacement}
                    className="w-full py-2.5 px-4 rounded-xl bg-[#00CFFF]/15 hover:bg-[#00CFFF]/25 text-[#00CFFF] border border-[#00CFFF]/30 font-bold text-xs flex items-center justify-center gap-2 transition-all cursor-pointer"
                  >
                    {savingPlacement ? (
                      <Loader2 className="w-4 h-4 animate-spin text-[#00CFFF]" />
                    ) : (
                      <Save className="w-4 h-4 text-[#00CFFF]" />
                    )}
                    <span>Update Binary Placement &amp; Sync to Firestore</span>
                  </button>
                </div>
              </div>
            </>
          ) : (
            <div className="p-12 text-center text-xs text-[#98A2B3] rounded-2xl bg-[#07101D] border border-white/[0.08] space-y-2">
              <Users className="w-8 h-8 text-white/20 mx-auto" />
              <div>
                Select an operator from the left list to edit their affiliate tree links or binary placement.
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
