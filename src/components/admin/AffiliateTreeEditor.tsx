import React, { useState, useEffect } from 'react';
import {
  GitFork,
  Users,
  Search,
  CheckCircle2,
  AlertTriangle,
  RefreshCw,
  Edit3,
  UserCheck,
  ShieldCheck,
  Database,
  ArrowRight,
  Info,
  Loader2,
  Save,
  Link,
  Zap,
} from 'lucide-react';

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

  // Search/Fetch Tree Users
  const fetchTreeUsers = async (query = '') => {
    try {
      setLoading(true);
      setFeedback(null);      const res = await fetch(`/api/admin/users?search=${encodeURIComponent(query)}&limit=25`);
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
  };

  useEffect(() => {
    fetchTreeUsers();
  }, []);

  const handleSelectUser = async (user: UserTreeRecord) => {
    setSelectedUser(user);
    setNewSponsorInput(user.sponsor?.publicId || '');
    setSponsorEditReason('');
    setTargetParentInput('');
    setPlacementEditReason('');
    setFeedback(null);

    // Fetch deep User 360 & binary placement details
    try {
      const res = await fetch(`/api/admin/users/${user.id}/360`);
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
      setFeedback({ type: 'error', message: 'Sponsor identifier (Public ID, Referral Code, or Email) is required.' });
      return;
    }
    if (!sponsorEditReason.trim() || sponsorEditReason.trim().length < 5) {
      setFeedback({ type: 'error', message: 'Admin audit reason is mandatory (minimum 5 characters).' });
      return;
    }

    try {
      setSavingSponsor(true);
      setFeedback(null);

      const res = await fetch(`/api/admin/users/${selectedUser.id}/sponsor`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
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
      setFeedback({ type: 'error', message: 'Parent User Public ID is required for binary placement.' });
      return;
    }
    if (!placementEditReason.trim() || placementEditReason.trim().length < 5) {
      setFeedback({ type: 'error', message: 'Admin audit reason is mandatory (minimum 5 characters).' });
      return;
    }

    try {
      setSavingPlacement(true);
      setFeedback(null);

      const res = await fetch(`/api/admin/network/placement/update`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
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
      } else {
        throw new Error(data.message || 'Failed to update binary placement.');
      }
    } catch (err: any) {
      setFeedback({ type: 'error', message: err.message || 'Error updating binary placement.' });
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
      });

      const data = await res.json();
      if (res.ok && data.success) {
        setFeedback({
          type: 'success',
          message: `Affiliate Tree Audit & Repair Completed! Reconciled ${data.repairedSponsors || 0} missing sponsor links, fixed ${data.repairedPlacements || 0} binary placements, and backed up all records to Firestore!`,
        });
        fetchTreeUsers(searchQuery);
      } else {
        throw new Error(data.message || 'Failed to repair affiliate tree.');
      }
    } catch (err: any) {
      setFeedback({ type: 'error', message: err.message || 'Error running affiliate tree repair.' });
    } finally {
      setRepairing(false);
    }
  };

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
              <span>Affiliate & Binary Tree Management Panel</span>
              <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-[#32D583]/10 text-[#32D583] border border-[#32D583]/30 font-bold uppercase">
                100% Data Protection
              </span>
            </h2>
            <p className="text-xs text-[#98A2B3]">
              Re-assign team sponsors, adjust binary tree positions (Left/Right), and run 1-click tree integrity repairs with instant Firestore backup.
            </p>
          </div>
        </div>

        <button
          onClick={handleRepairTree}
          disabled={repairing}
          className="px-4 py-2.5 rounded-xl bg-gradient-to-r from-[#00CFFF] to-[#168BFF] hover:opacity-90 text-[#05070B] font-bold text-xs flex items-center justify-center gap-2 transition-all cursor-pointer whitespace-nowrap shadow-lg shadow-[#00CFFF]/20"
        >
          {repairing ? (
            <Loader2 className="w-4 h-4 animate-spin text-[#05070B]" />
          ) : (
            <Zap className="w-4 h-4 text-[#05070B] fill-[#05070B]" />
          )}
          <span>Repair & Sync Affiliate Tree</span>
        </button>
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
          <button onClick={() => setFeedback(null)} className="text-white/60 hover:text-white p-1">
            &times;
          </button>
        </div>
      )}

      {/* Main Grid: Left = User List & Search, Right = Tree Editor Controls */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Column: User Explorer */}
        <div className="lg:col-span-5 p-5 rounded-2xl bg-[#07101D] border border-white/[0.08] space-y-4 flex flex-col">
          <div className="flex items-center justify-between border-b border-white/[0.06] pb-3">
            <h3 className="text-xs font-bold text-white uppercase font-mono tracking-wider flex items-center gap-2">
              <Users className="w-4 h-4 text-[#00CFFF]" />
              <span>Select Operator</span>
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
                    <ArrowRight className={`w-4 h-4 ${isSelected ? 'text-[#00CFFF]' : 'text-white/20'}`} />
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
                    <div>Referral Code: <span className="text-white font-bold">{selectedUser.referralCode || 'N/A'}</span></div>
                    <div>Joined: {new Date(selectedUser.createdAt).toLocaleDateString()}</div>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs font-mono">
                  <div className="p-3 rounded-xl bg-white/[0.02] border border-white/[0.06] space-y-1">
                    <div className="text-[10px] text-[#98A2B3] uppercase">Current Direct Sponsor</div>
                    <div className="font-bold text-white flex items-center gap-1.5">
                      <UserCheck className="w-3.5 h-3.5 text-[#32D583]" />
                      <span>{selectedUser.sponsor ? `${selectedUser.sponsor.publicId} (${selectedUser.sponsor.fullName})` : 'Unassigned (Top / Root)'}</span>
                    </div>
                  </div>

                  <div className="p-3 rounded-xl bg-white/[0.02] border border-white/[0.06] space-y-1">
                    <div className="text-[10px] text-[#98A2B3] uppercase">Binary Tree Placement</div>
                    <div className="font-bold text-white flex items-center gap-1.5">
                      <GitFork className="w-3.5 h-3.5 text-[#00CFFF]" />
                      <span>
                        {selectedUser.binaryPlacement.status === 'PLACED'
                          ? `${selectedUser.binaryPlacement.side} leg under ${selectedUser.binaryPlacement.parentPublicId || 'Parent'}`
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
                    Change the direct referral sponsor for {selectedUser.publicId}. Synchronizes instantly across PostgreSQL & Firestore.
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
                      placeholder="e.g. PHX-100200 or leader@phivonex.com"
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
                    <span>Save Sponsor Linkage & Sync to Firestore</span>
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
                        placeholder="e.g. PHX-500100"
                        className="w-full bg-[#05070B] border border-white/[0.1] focus:border-[#00CFFF] rounded-xl px-3 py-2 text-xs text-white placeholder-[#98A2B3] outline-none"
                      />
                    </div>

                    <div>
                      <label className="text-[11px] text-[#98A2B3] font-mono block mb-1">
                        Binary Leg Side
                      </label>
                      <select
                        value={targetSide}
                        onChange={(e) => setTargetSide(e.target.value as 'LEFT' | 'RIGHT')}
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
                    <span>Update Binary Placement & Sync to Firestore</span>
                  </button>
                </div>
              </div>
            </>
          ) : (
            <div className="p-12 text-center text-xs text-[#98A2B3] rounded-2xl bg-[#07101D] border border-white/[0.08] space-y-2">
              <Users className="w-8 h-8 text-white/20 mx-auto" />
              <div>Select an operator from the left list to edit their affiliate tree links or binary placement.</div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
