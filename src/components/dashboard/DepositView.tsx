import React, { useState, useEffect, useCallback } from 'react';
import {
  ArrowDownLeft,
  Copy,
  Check,
  ExternalLink,
  RefreshCw,
  AlertTriangle,
  ShieldCheck,
  CheckCircle2,
  Coins,
  QrCode,
  Radio,
  Info,
  Layers,
  Search,
  Send,
  Loader2,
  Wallet,
  Clock,
  Sparkles,
} from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import { UserProfile } from '../../context/AuthContext';
import { UsdtIcon, BnbIcon } from '../brand/CryptoIcons';
import { useSystemConfig } from '../../context/SystemConfigContext';

export type DepositAsset = 'BNB' | 'USDT';

interface DepositAddressInfo {
  address: string;
  chainId: number;
  asset: DepositAsset;
  networkName: string;
  requiredConfirmations: number;
  explorerUrl: string;
  derivationReference?: string;
  warning?: string;
  note?: string;
}

interface BlockchainDeposit {
  id: string;
  publicDepositId: string;
  userId: string;
  chainId: number;
  asset: DepositAsset;
  txHash: string;
  fromAddress: string;
  toAddress: string;
  amount: number;
  blockNumber: number;
  confirmations: number;
  status: 'DETECTED' | 'CONFIRMING' | 'CONFIRMED' | 'CREDITED' | 'REORGED' | 'FAILED';
  detectedAt: string;
  confirmedAt: string | null;
  creditedAt: string | null;
  createdAt: string;
}

interface DepositSummary {
  totalCreditedBnb?: number;
  totalPendingBnb?: number;
  totalCreditedUsdt?: number;
  totalPendingUsdt?: number;
  depositCount: number;
  requiredConfirmations: number;
  chainId: number;
  networkName: string;
}

const DEFAULT_DEPOSIT_ADDRESS = '0x39F47C356d45eA49826a76C252794c4C83572D76';

interface DepositViewProps {
  user: UserProfile;
  onNavigateTab?: (tab: string) => void;
}

export const DepositView: React.FC<DepositViewProps> = ({ user: _user, onNavigateTab }) => {
  const { cryptoDepositsEnabled } = useSystemConfig();
  // Asset Selector State: 'USDT' or 'BNB'
  const [selectedAsset, setSelectedAsset] = useState<DepositAsset>('USDT');

  const [addressInfo, setAddressInfo] = useState<DepositAddressInfo | null>(null);
  const [deposits, setDeposits] = useState<BlockchainDeposit[]>([]);
  const [summary, setSummary] = useState<DepositSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [rescanning, setRescanning] = useState(false);
  const [copied, setCopied] = useState(false);
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Manual TxHash Verification State
  const [inputTxHash, setInputTxHash] = useState('');
  const [submittingTx, setSubmittingTx] = useState(false);
  const [txVerifySuccess, setTxVerifySuccess] = useState<string | null>(null);
  const [txVerifyError, setTxVerifyError] = useState<string | null>(null);

  // Fetch Deposit Address & Transaction History
  const fetchData = useCallback(async () => {
    try {
      setErrorMessage(null);

      // 1. Fetch Deposit Address
      const addrRes = await fetch(`/api/deposits/address?asset=${selectedAsset}`, {
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
      });
      const addrData = await addrRes.json();

      if (addrRes.ok && addrData.success) {
        setAddressInfo(addrData.data);
      } else {
        throw new Error(addrData.message || `Failed to load ${selectedAsset} deposit address`);
      }

      // 2. Fetch User Deposits History
      const filterParam = statusFilter !== 'ALL' ? `&status=${statusFilter}` : '';
      const depRes = await fetch(`/api/deposits/me?page=1&limit=50${filterParam}`, {
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
      });
      const depData = await depRes.json();

      if (depRes.ok && depData.success) {
        setDeposits(depData.data.deposits || []);
        setSummary(depData.data.summary || null);
      }
    } catch (err: any) {
      console.warn('[DepositView] Error fetching data:', err);
      setErrorMessage(err?.message || 'Unable to communicate with the BNB Smart Chain service.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [selectedAsset, statusFilter]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Handle Asset Switch
  const handleAssetChange = (asset: DepositAsset) => {
    if (asset === selectedAsset) return;
    setSelectedAsset(asset);
    setLoading(true);
    setCopied(false);
    setTxVerifyError(null);
    setTxVerifySuccess(null);
  };

  const activeAddress = addressInfo?.address || DEFAULT_DEPOSIT_ADDRESS;

  // Handle Copy Address
  const handleCopy = () => {
    navigator.clipboard.writeText(activeAddress);
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  };

  // Trigger Real-Time On-Chain Rescan
  const handleRescan = async () => {
    try {
      setRescanning(true);
      setErrorMessage(null);
      const res = await fetch('/api/deposits/rescan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
      });
      const data = await res.json();

      if (res.ok && data.success) {
        setSuccessMessage('BNB Smart Chain listener synchronized. Latest transactions updated.');
        setTimeout(() => setSuccessMessage(null), 4000);
        await fetchData();
      } else {
        throw new Error(data.message || 'Rescan failed');
      }
    } catch (err: any) {
      setErrorMessage(err?.message || 'Error during on-chain scan');
    } finally {
      setRescanning(false);
    }
  };

  // Submit on-chain Transaction Hash for instant verification
  const handleSubmitTxHash = async (e: React.FormEvent) => {
    e.preventDefault();
    setTxVerifyError(null);
    setTxVerifySuccess(null);

    const cleanHash = inputTxHash.trim();
    if (!cleanHash) {
      setTxVerifyError('Please enter the transaction hash (TxHash / TxID) from your wallet or exchange.');
      return;
    }

    if (!/^0x[a-fA-F0-9]{64}$/.test(cleanHash)) {
      setTxVerifyError('Invalid TxHash format. Must be a 66-character hex string starting with 0x.');
      return;
    }

    try {
      setSubmittingTx(true);
      const res = await fetch('/api/deposits/submit-txhash', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          txHash: cleanHash,
          asset: selectedAsset,
        }),
      });

      const data = await res.json();

      if (res.ok && data.success) {
        setTxVerifySuccess(data.message || 'Deposit verified and credited successfully!');
        setInputTxHash('');
        await fetchData();
      } else {
        throw new Error(data.message || 'Transaction verification failed.');
      }
    } catch (err: any) {
      setTxVerifyError(err.message || 'Failed to verify transaction hash.');
    } finally {
      setSubmittingTx(false);
    }
  };

  const handlePasteTx = async () => {
    try {
      const text = await navigator.clipboard.readText();
      if (text) {
        setInputTxHash(text.trim());
      }
    } catch {
      // Ignore clipboard read errors
    }
  };

  // Filter deposits by search
  const filteredDeposits = deposits.filter((dep) => {
    const matchesSearch =
      !searchQuery.trim() ||
      dep.publicDepositId.toLowerCase().includes(searchQuery.toLowerCase()) ||
      dep.txHash.toLowerCase().includes(searchQuery.toLowerCase()) ||
      dep.fromAddress.toLowerCase().includes(searchQuery.toLowerCase()) ||
      dep.amount.toString().includes(searchQuery);
    return matchesSearch;
  });

  const formatShortAddress = (addr: string) => {
    if (!addr || addr.length < 12) return addr;
    return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
  };

  const formatShortTx = (tx: string) => {
    if (!tx || tx.length < 14) return tx;
    return `${tx.slice(0, 8)}...${tx.slice(-6)}`;
  };

  const isBnbSelected = selectedAsset === 'BNB';

  // Calculate total credited funds
  const totalCreditedUsdtAmount = deposits
    .filter((d) => d.status === 'CREDITED')
    .reduce((acc, d) => acc + (d.amount || 0), 0);

  return (
    <div className="space-y-6 sm:space-y-8 animate-fadeIn pb-12">
      {/* ========================================================
          1. COMPACT PAGE HERO
         ======================================================== */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-[#07101D] via-[#0B1728] to-[#07101D] border border-white/[0.08] p-5 sm:p-7 shadow-xl">
        <div className="absolute top-0 right-0 -mt-10 -mr-10 w-72 h-72 bg-[#00CFFF]/10 rounded-full blur-3xl pointer-events-none" />

        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-5">
          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-2 text-xs font-medium">
              <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-md bg-[#F59E0B]/10 border border-[#F59E0B]/25 text-[#F59E0B] text-[11px] font-semibold">
                <BnbIcon size={13} />
                BNB Smart Chain (BEP-20)
              </span>
              <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-md bg-[#32D583]/10 border border-[#32D583]/25 text-[#32D583] text-[11px] font-semibold">
                <span className="w-1.5 h-1.5 rounded-full bg-[#32D583] animate-pulse" />
                Auto-Credit Listener
              </span>
            </div>

            <h1 className="text-2xl sm:text-3xl font-bold text-white tracking-tight">
              Deposit Funds
            </h1>

            <p className="text-xs sm:text-sm text-[#98A2B3] max-w-2xl leading-relaxed">
              Deposit BEP-20 USDT or native BNB to your assigned protocol address on BNB Smart Chain for instant automated ledger crediting.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2 self-start md:self-auto">
            {onNavigateTab && (
              <button
                onClick={() => onNavigateTab('wallet')}
                className="px-3.5 py-2 rounded-xl bg-white/[0.04] hover:bg-white/[0.08] text-white border border-white/[0.08] text-xs font-medium flex items-center gap-1.5 transition-all cursor-pointer min-h-[44px]"
              >
                <Wallet className="w-3.5 h-3.5 text-[#00CFFF]" />
                <span>Wallet</span>
              </button>
            )}
            <button
              onClick={() => {
                setRefreshing(true);
                fetchData();
              }}
              disabled={loading || refreshing}
              className="px-3 py-2 rounded-xl bg-white/[0.04] hover:bg-white/[0.08] text-[#98A2B3] hover:text-white border border-white/[0.08] text-xs font-medium flex items-center gap-1.5 transition-all cursor-pointer disabled:opacity-50 min-h-[44px]"
              title="Refresh deposits"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin text-[#00CFFF]' : ''}`} />
              <span className="hidden sm:inline">Refresh</span>
            </button>
            <button
              onClick={handleRescan}
              disabled={rescanning || loading}
              className="px-3 py-2 rounded-xl bg-[#F59E0B]/10 hover:bg-[#F59E0B]/20 text-[#F59E0B] border border-[#F59E0B]/30 text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer disabled:opacity-50 min-h-[44px]"
            >
              <Radio className={`w-3.5 h-3.5 ${rescanning ? 'animate-pulse' : ''}`} />
              <span>{rescanning ? 'Scanning...' : 'Sync Chain'}</span>
            </button>
          </div>
        </div>
      </div>

      {/* Notifications */}
      {!cryptoDepositsEnabled && (
        <div className="p-4 rounded-xl bg-amber-500/10 border border-amber-500/30 flex items-center gap-3 text-xs text-amber-300">
          <AlertTriangle className="w-4 h-4 shrink-0 text-amber-400" />
          <span>
            Cryptocurrency deposits are temporarily paused by administration. Please refrain from sending funds to the protocol address until service resumes.
          </span>
        </div>
      )}

      {errorMessage && (
        <div className="p-4 rounded-xl bg-[#F04438]/10 border border-[#F04438]/30 flex items-center gap-3 text-xs text-[#FDA29B]">
          <AlertTriangle className="w-4 h-4 shrink-0 text-[#F04438]" />
          <span>{errorMessage}</span>
        </div>
      )}

      {successMessage && (
        <div className="p-4 rounded-xl bg-[#32D583]/10 border border-[#32D583]/30 flex items-center gap-3 text-xs text-[#32D583]">
          <CheckCircle2 className="w-4 h-4 shrink-0" />
          <span>{successMessage}</span>
        </div>
      )}

      {/* ========================================================
          2. METRIC SUMMARY CARDS
         ======================================================== */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        {/* Card 1: Total Credited Deposits */}
        <div className="p-4 sm:p-5 rounded-xl bg-[#07101D] border border-[#32D583]/20 space-y-2 relative overflow-hidden">
          <div className="flex items-center justify-between text-xs text-[#98A2B3]">
            <span className="font-medium">Total Credited</span>
            <div className="w-7 h-7 rounded-lg bg-[#32D583]/10 border border-[#32D583]/20 flex items-center justify-center text-[#32D583]">
              <ArrowDownLeft className="w-3.5 h-3.5" />
            </div>
          </div>
          <div className="text-2xl sm:text-3xl font-bold font-mono text-[#32D583] tabular-nums">
            ${totalCreditedUsdtAmount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </div>
          <div className="text-[11px] text-[#32D583]/80">
            Confirmed on BSC &amp; credited
          </div>
        </div>

        {/* Card 2: Total Deposit Count */}
        <div className="p-4 sm:p-5 rounded-xl bg-[#07101D] border border-white/[0.08] space-y-2 relative overflow-hidden">
          <div className="flex items-center justify-between text-xs text-[#98A2B3]">
            <span className="font-medium">Deposits Count</span>
            <div className="w-7 h-7 rounded-lg bg-[#00CFFF]/10 border border-[#00CFFF]/20 flex items-center justify-center text-[#00CFFF]">
              <Coins className="w-3.5 h-3.5" />
            </div>
          </div>
          <div className="text-2xl sm:text-3xl font-bold font-mono text-white tabular-nums">
            {deposits.length}
          </div>
          <div className="text-[11px] text-[#667085]">
            Total on-chain transfers
          </div>
        </div>

        {/* Card 3: Network Chain */}
        <div className="p-4 sm:p-5 rounded-xl bg-[#07101D] border border-white/[0.08] space-y-2 relative overflow-hidden">
          <div className="flex items-center justify-between text-xs text-[#98A2B3]">
            <span className="font-medium">Network / Chain</span>
            <div className="w-7 h-7 rounded-lg bg-[#F59E0B]/10 border border-[#F59E0B]/20 flex items-center justify-center text-[#F59E0B]">
              <BnbIcon size={14} />
            </div>
          </div>
          <div className="text-lg font-bold font-mono text-white">
            BSC Mainnet (56)
          </div>
          <div className="text-[11px] text-[#667085]">
            BEP-20 Protocol Standard
          </div>
        </div>

        {/* Card 4: Required Confirmations */}
        <div className="p-4 sm:p-5 rounded-xl bg-[#07101D] border border-white/[0.08] space-y-2 relative overflow-hidden">
          <div className="flex items-center justify-between text-xs text-[#98A2B3]">
            <span className="font-medium">Confirmations</span>
            <div className="w-7 h-7 rounded-lg bg-white/[0.05] border border-white/[0.1] flex items-center justify-center text-[#98A2B3]">
              <Clock className="w-3.5 h-3.5" />
            </div>
          </div>
          <div className="text-2xl sm:text-3xl font-bold font-mono text-white tabular-nums">
            {addressInfo?.requiredConfirmations || 3} Blocks
          </div>
          <div className="text-[11px] text-[#667085]">
            ≈ 9 seconds finality
          </div>
        </div>
      </div>

      {/* ========================================================
          3. ASSET TOGGLE & ASSIGNED DEPOSIT ADDRESS CARD
         ======================================================== */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left: Address & Details (8 Cols) */}
        <div className="lg:col-span-8 p-5 sm:p-6 rounded-2xl bg-[#07101D] border border-white/[0.08] shadow-xl space-y-5">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-white/[0.06] pb-4">
            <div className="flex items-center gap-2.5">
              {isBnbSelected ? <BnbIcon size={22} /> : <UsdtIcon size={22} />}
              <div>
                <h2 className="text-sm sm:text-base font-bold text-white">
                  Official {selectedAsset} Deposit Address
                </h2>
                <p className="text-xs text-[#98A2B3]">
                  Send {selectedAsset} on BNB Smart Chain to this address.
                </p>
              </div>
            </div>

            {/* Currency Selector Toggle */}
            <div className="inline-flex p-1 rounded-xl bg-[#05070B] border border-white/[0.08] self-start sm:self-auto">
              <button
                onClick={() => handleAssetChange('USDT')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer min-h-[36px] ${
                  !isBnbSelected
                    ? 'bg-[#32D583]/15 text-[#32D583] border border-[#32D583]/30 shadow-sm'
                    : 'text-[#98A2B3] hover:text-white'
                }`}
              >
                <UsdtIcon size={14} />
                <span>USDT (BEP-20)</span>
              </button>

              <button
                onClick={() => handleAssetChange('BNB')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer min-h-[36px] ${
                  isBnbSelected
                    ? 'bg-[#F59E0B]/15 text-[#F59E0B] border border-[#F59E0B]/30 shadow-sm'
                    : 'text-[#98A2B3] hover:text-white'
                }`}
              >
                <BnbIcon size={14} />
                <span>BNB (Native)</span>
              </button>
            </div>
          </div>

          {/* Monospace Address Box */}
          <div className="space-y-2">
            <label className="text-xs font-mono text-[#98A2B3] uppercase tracking-wider block">
              Recipient BSC Address
            </label>
            <div className="flex items-center gap-2">
              <div className="flex-1 px-4 py-3 rounded-xl bg-[#05070B] border border-white/[0.08] font-mono text-xs sm:text-sm font-semibold text-[#00CFFF] select-all truncate min-h-[44px] flex items-center">
                {activeAddress}
              </div>
              <button
                onClick={handleCopy}
                className="px-4 py-3 rounded-xl bg-[#00CFFF]/10 hover:bg-[#00CFFF]/20 text-[#00CFFF] border border-[#00CFFF]/30 font-mono text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer min-h-[44px] shrink-0"
                title="Copy deposit address"
              >
                {copied ? <Check className="w-4 h-4 text-[#32D583]" /> : <Copy className="w-4 h-4" />}
                <span>{copied ? 'Copied' : 'Copy'}</span>
              </button>
            </div>
          </div>

          {/* Explorer Links & Notes */}
          <div className="flex flex-wrap items-center justify-between gap-3 pt-3 border-t border-white/[0.04] text-xs text-[#98A2B3]">
            <div className="flex flex-wrap items-center gap-4">
              <span>
                Asset: <strong className="text-white font-mono">{selectedAsset}</strong>
              </span>
              <span>
                Network: <strong className="text-white font-mono">BNB Smart Chain (BSC)</strong>
              </span>
            </div>
            <a
              href={addressInfo?.explorerUrl || `https://bscscan.com/address/${activeAddress}`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-[#00CFFF] hover:underline flex items-center gap-1 font-mono text-xs"
            >
              <span>View on BscScan</span>
              <ExternalLink className="w-3 h-3" />
            </a>
          </div>

          {/* Safety Notice */}
          <div className="p-3.5 rounded-xl bg-white/[0.02] border border-white/[0.06] flex items-start gap-2.5 text-xs text-[#98A2B3]">
            <ShieldCheck className="w-4 h-4 text-[#32D583] shrink-0 mt-0.5" />
            <p className="text-[11px] leading-relaxed">
              Send <strong className="text-white">BEP-20 USDT</strong> or <strong className="text-white">native BNB</strong> on BNB Smart Chain only. Submissions are verified on-chain and credited to your ledger balance.
            </p>
          </div>
        </div>

        {/* Right: QR Code (4 Cols) */}
        <div className="lg:col-span-4 p-5 sm:p-6 rounded-2xl bg-[#07101D] border border-white/[0.08] shadow-xl flex flex-col items-center justify-center text-center space-y-4">
          <div className="space-y-1">
            <span className="text-xs font-mono text-[#F59E0B] font-semibold">QR SCAN</span>
            <h3 className="text-sm font-bold text-white">Scan with Mobile Wallet</h3>
          </div>

          <div className="p-3.5 rounded-2xl bg-white shadow-xl inline-block">
            <QRCodeSVG
              value={activeAddress}
              size={140}
              bgColor="#FFFFFF"
              fgColor="#05070B"
              level="M"
              includeMargin={false}
            />
          </div>

          <p className="text-[11px] text-[#667085] max-w-xs">
            Compatible with Binance App, Trust Wallet, MetaMask, and SafePal.
          </p>
        </div>
      </div>

      {/* ========================================================
          4. INSTANT TXHASH SUBMISSION FORM
         ======================================================== */}
      <div className="p-5 sm:p-6 rounded-2xl bg-[#07101D] border border-white/[0.08] shadow-xl space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-white/[0.06] pb-3">
          <div className="flex items-center gap-2">
            <Send className="w-4 h-4 text-[#F59E0B]" />
            <h3 className="text-sm sm:text-base font-bold text-white">
              Instant TxHash Auto-Credit
            </h3>
          </div>
          <span className="text-xs font-mono text-[#98A2B3]">
            Paste TxHash for instant on-chain verification
          </span>
        </div>

        {/* Verification Success / Error */}
        {txVerifySuccess && (
          <div className="p-3.5 rounded-xl bg-[#32D583]/10 border border-[#32D583]/30 text-[#32D583] flex items-center gap-2 text-xs">
            <CheckCircle2 className="w-4 h-4 shrink-0" />
            <span>{txVerifySuccess}</span>
          </div>
        )}

        {txVerifyError && (
          <div className="p-3.5 rounded-xl bg-[#F04438]/10 border border-[#F04438]/30 text-[#FDA29B] flex items-center gap-2 text-xs">
            <AlertTriangle className="w-4 h-4 shrink-0 text-[#F04438]" />
            <span>{txVerifyError}</span>
          </div>
        )}

        <form onSubmit={handleSubmitTxHash} className="space-y-3">
          <div className="flex flex-col sm:flex-row items-stretch gap-2.5">
            <div className="relative flex-1">
              <input
                type="text"
                value={inputTxHash}
                onChange={(e) => setInputTxHash(e.target.value)}
                placeholder="Paste transaction hash: 0x1234567890abcdef..."
                disabled={submittingTx}
                className="w-full px-4 py-3 rounded-xl bg-[#05070B] border border-white/[0.1] text-xs sm:text-sm text-white placeholder-[#667085] font-mono focus:outline-none focus:border-[#00CFFF] transition-colors pr-20 min-h-[44px]"
              />
              <button
                type="button"
                onClick={handlePasteTx}
                disabled={submittingTx}
                className="absolute right-2 top-2 px-2.5 py-1.5 rounded-lg bg-white/[0.06] hover:bg-white/[0.12] text-[#98A2B3] hover:text-white text-xs font-mono font-medium transition-all cursor-pointer"
              >
                Paste
              </button>
            </div>

            <button
              type="submit"
              disabled={submittingTx || !inputTxHash.trim()}
              className="px-5 py-3 rounded-xl bg-[#F59E0B] hover:bg-[#F59E0B]/90 text-[#05070B] text-xs sm:text-sm font-bold flex items-center justify-center gap-2 transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed shrink-0 min-h-[44px]"
            >
              {submittingTx ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Verifying...</span>
                </>
              ) : (
                <>
                  <Check className="w-4 h-4" />
                  <span>Verify &amp; Credit</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>

      {/* ========================================================
          5. DEPOSIT TRANSACTION HISTORY
         ======================================================== */}
      <div className="p-5 sm:p-6 rounded-2xl bg-[#07101D] border border-white/[0.08] shadow-xl space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-white/[0.06] pb-3">
          <div>
            <h3 className="text-sm sm:text-base font-bold text-white flex items-center gap-2">
              <Clock className="w-4 h-4 text-[#00CFFF]" />
              <span>Deposit Transaction History</span>
            </h3>
            <p className="text-xs text-[#98A2B3]">
              On-chain transfers detected and credited to your financial ledger.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {/* Search */}
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-[#98A2B3] absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                placeholder="Search TX / ID..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-8 pr-3 py-1.5 rounded-lg bg-[#05070B] border border-white/[0.1] text-xs text-white placeholder-[#667085] focus:outline-none focus:border-[#00CFFF] w-36 sm:w-48 min-h-[36px]"
              />
            </div>

            {/* Status Filter */}
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="px-2.5 py-1.5 rounded-lg bg-[#05070B] border border-white/[0.1] text-xs text-white focus:outline-none focus:border-[#00CFFF] min-h-[36px]"
            >
              <option value="ALL">All Statuses</option>
              <option value="CREDITED">Credited</option>
              <option value="CONFIRMING">Confirming</option>
              <option value="DETECTED">Detected</option>
            </select>
          </div>
        </div>

        {/* Desktop Table View */}
        <div className="hidden md:block overflow-x-auto">
          {filteredDeposits.length === 0 && !loading ? (
            <div className="p-8 text-center text-xs text-[#98A2B3] font-mono border border-dashed border-white/[0.08] rounded-xl space-y-2">
              <div className="text-white font-medium">No deposits recorded yet</div>
              <p className="text-[#667085]">
                Send USDT or BNB to your deposit address above to see transactions here.
              </p>
            </div>
          ) : (
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="border-b border-white/[0.06] text-[#98A2B3] uppercase font-mono text-[11px] tracking-wider">
                  <th className="py-3 px-3">Deposit ID</th>
                  <th className="py-3 px-3">Asset</th>
                  <th className="py-3 px-3">Amount</th>
                  <th className="py-3 px-3">From</th>
                  <th className="py-3 px-3">TX Hash</th>
                  <th className="py-3 px-3">Confirmations</th>
                  <th className="py-3 px-3">Status</th>
                  <th className="py-3 px-3 text-right">Date</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/[0.04]">
                {filteredDeposits.map((dep) => (
                  <tr key={dep.id} className="hover:bg-white/[0.02] transition-colors">
                    <td className="py-3 px-3 font-mono text-[#00CFFF] font-medium">
                      {dep.publicDepositId}
                    </td>
                    <td className="py-3 px-3 font-mono font-bold">
                      <span
                        className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] ${
                          dep.asset === 'BNB'
                            ? 'bg-[#F59E0B]/10 text-[#F59E0B] border border-[#F59E0B]/20'
                            : 'bg-[#32D583]/10 text-[#32D583] border border-[#32D583]/20'
                        }`}
                      >
                        {dep.asset || 'USDT'}
                      </span>
                    </td>
                    <td className="py-3 px-3 font-mono font-bold text-white">
                      +{dep.amount} {dep.asset || 'USDT'}
                    </td>
                    <td className="py-3 px-3 font-mono text-[#98A2B3]">
                      {formatShortAddress(dep.fromAddress)}
                    </td>
                    <td className="py-3 px-3 font-mono">
                      <a
                        href={`https://bscscan.com/tx/${dep.txHash}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-[#00CFFF] hover:underline flex items-center gap-1"
                      >
                        {formatShortTx(dep.txHash)}
                        <ExternalLink className="w-3 h-3" />
                      </a>
                    </td>
                    <td className="py-3 px-3 font-mono text-[#98A2B3]">
                      {dep.confirmations} / {summary?.requiredConfirmations || 3}
                    </td>
                    <td className="py-3 px-3">
                      <span
                        className={`px-2 py-0.5 rounded-full text-[10px] font-mono font-bold ${
                          dep.status === 'CREDITED'
                            ? 'bg-[#32D583]/10 text-[#32D583]'
                            : dep.status === 'CONFIRMING'
                            ? 'bg-[#F59E0B]/10 text-[#F59E0B]'
                            : 'bg-[#00CFFF]/10 text-[#00CFFF]'
                        }`}
                      >
                        {dep.status}
                      </span>
                    </td>
                    <td className="py-3 px-3 text-[#98A2B3] text-[11px] text-right font-mono">
                      {new Date(dep.createdAt).toLocaleDateString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* Mobile Stacked Card View (<768px) */}
        <div className="block md:hidden space-y-3">
          {filteredDeposits.length === 0 && !loading ? (
            <div className="p-6 text-center text-xs text-[#98A2B3] font-mono border border-dashed border-white/[0.08] rounded-xl space-y-2">
              <div className="text-white font-medium">No deposits found</div>
              <p className="text-[#667085]">
                Incoming on-chain deposits will appear here.
              </p>
            </div>
          ) : (
            filteredDeposits.map((dep) => (
              <div
                key={dep.id}
                className="p-4 rounded-xl bg-[#05070B] border border-white/[0.06] space-y-2.5"
              >
                <div className="flex items-center justify-between">
                  <span className="font-mono font-bold text-xs text-[#00CFFF]">
                    {dep.publicDepositId}
                  </span>
                  <span
                    className={`px-2 py-0.5 rounded-full text-[9px] font-mono font-bold ${
                      dep.status === 'CREDITED'
                        ? 'bg-[#32D583]/10 text-[#32D583]'
                        : dep.status === 'CONFIRMING'
                        ? 'bg-[#F59E0B]/10 text-[#F59E0B]'
                        : 'bg-[#00CFFF]/10 text-[#00CFFF]'
                    }`}
                  >
                    {dep.status}
                  </span>
                </div>

                <div className="flex items-center justify-between">
                  <div className="text-sm font-mono font-bold text-white">
                    +{dep.amount} {dep.asset || 'USDT'}
                  </div>
                  <span className="text-[10px] font-mono text-[#667085]">
                    {new Date(dep.createdAt).toLocaleDateString()}
                  </span>
                </div>

                <div className="flex items-center justify-between text-xs pt-1 border-t border-white/[0.04]">
                  <span className="text-[11px] font-mono text-[#98A2B3]">
                    {formatShortAddress(dep.fromAddress)}
                  </span>
                  <a
                    href={`https://bscscan.com/tx/${dep.txHash}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-[#00CFFF] font-mono text-xs flex items-center gap-1"
                  >
                    <span>{formatShortTx(dep.txHash)}</span>
                    <ExternalLink className="w-3 h-3" />
                  </a>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
};
