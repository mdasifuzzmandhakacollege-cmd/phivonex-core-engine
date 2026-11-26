import React, { useEffect } from 'react';
import { UserProfile } from '../../context/AuthContext';
import { WalletSection } from './WalletSection';
import { P2pTransferConsole } from './P2pTransferConsole';
import { UnifiedLedgerHub } from '../unilevel';

interface WalletViewProps {
  user: UserProfile | null;
  onNavigateTab?: (tab: string) => void;
}

export const WalletView: React.FC<WalletViewProps> = ({ user, onNavigateTab }) => {
  useEffect(() => {
    const scrollToP2p = () => {
      const el = document.getElementById('p2p-transfer-console');
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    };

    if (typeof window !== 'undefined' && window.sessionStorage.getItem('phivonex_scroll_p2p') === '1') {
      window.sessionStorage.removeItem('phivonex_scroll_p2p');
      setTimeout(scrollToP2p, 120);
    }

    window.addEventListener('phivonex:focus-p2p-transfer', scrollToP2p);
    return () => window.removeEventListener('phivonex:focus-p2p-transfer', scrollToP2p);
  }, []);

  return (
    <div className="space-y-8">
      <WalletSection onNavigateTab={onNavigateTab} />
      <P2pTransferConsole user={user} />
      <UnifiedLedgerHub user={user} onNavigateTab={onNavigateTab || (() => {})} />
    </div>
  );
};
