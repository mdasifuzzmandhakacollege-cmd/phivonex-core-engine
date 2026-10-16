import React from 'react';
import { UserProfile } from '../../context/AuthContext';
import { WalletSection } from './WalletSection';

interface WalletViewProps {
  user: UserProfile | null;
  onNavigateTab?: (tab: string) => void;
}

export const WalletView: React.FC<WalletViewProps> = ({ onNavigateTab }) => {
  return (
    <div className="space-y-6">
      <WalletSection onNavigateTab={onNavigateTab} />
    </div>
  );
};
