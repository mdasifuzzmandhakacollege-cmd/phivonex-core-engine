import React, { useState } from 'react';
import { UserPlus, ArrowRight, X } from 'lucide-react';
import { UnplacedMember } from './NetworkView';

interface PlacementManagerProps {
  unplacedMembers: UnplacedMember[];
  selectedMember: UnplacedMember | null;
  setSelectedMember: (member: UnplacedMember | null) => void;
  onPlace: (memberId: string, side: 'LEFT' | 'RIGHT', parentId: string) => Promise<void>;
  isSubmitting: boolean;
  onClose: () => void;
}

export const PlacementManager: React.FC<PlacementManagerProps> = ({
  unplacedMembers,
  selectedMember,
  setSelectedMember,
  onPlace,
  isSubmitting,
  onClose,
}) => {

  if (unplacedMembers.length === 0) {
    return (
      <div className="p-4 bg-white/5 rounded-xl border border-white/10 text-center text-sm text-gray-400">
        No unplaced referrals found.
      </div>
    );
  }

  return (
    <div className="bg-[#0B1728] border border-white/10 rounded-2xl p-5 shadow-2xl space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold text-white flex items-center gap-2">
          <UserPlus className="w-5 h-5 text-[#00CFFF]" />
          Placement Manager
        </h3>
        <button onClick={onClose} className="text-gray-400 hover:text-white">
          <X className="w-5 h-5" />
        </button>
      </div>

      <p className="text-sm text-gray-400">
        Select a member to place, then click an empty slot in your network tree.
      </p>

      <div className="space-y-2 max-h-60 overflow-y-auto pr-2">
        {unplacedMembers.map((member) => (
          <button
            key={member.publicId}
            onClick={() => setSelectedMember(member)}
            className={`w-full flex items-center justify-between p-3 rounded-lg border text-left transition-all ${
              selectedMember?.publicId === member.publicId
                ? 'bg-[#00CFFF]/20 border-[#00CFFF]/50'
                : 'bg-white/5 border-white/5 hover:bg-white/10'
            }`}
          >
            <span className="font-medium text-white">{member.displayName}</span>
            <span className="text-xs text-gray-400">ID: {member.publicId}</span>
          </button>
        ))}
      </div>

      {selectedMember && (
        <div className="p-3 bg-[#00CFFF]/10 border border-[#00CFFF]/20 rounded-lg text-sm text-[#00CFFF]">
          <span className="font-semibold">Ready:</span> {selectedMember.displayName} selected. Click a '+' slot in the tree.
        </div>
      )}
    </div>
  );
};
