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
  Radio,
  Search,
  Send,
  Loader2,
  Wallet,
  Clock,
  Info,
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

  const [inputTxHash, setInputTxHash] = useState('');
  const [submittingTx, setSubmittingTx] = useState(false);
  const [txVerifySuccess, setTxVerifySuccess] = useState<string | null>(null);
  const [txVerifyError, setTxVerifyError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    try {
      setErrorMessage(null);
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

      const filterParam = statusFilter !== 'ALL' ? `&status=${statusFilter}` : '';
      const depRes = await fetch(`/api/deposits/me?page=1&limit=50${filterParam}`, {
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
      });
      const depData = await depRes.json();

      if (depRes.ok && depData.success) {
        setDeposits(Array.isArray(depData.data?.deposits) ? depData.data.deposits : []);
        setSummary(depData.data?.summary || null);
      }
    } catch (err: any) {
      setErrorMessage(err?.message || 'Unable to communicate with the BNB Smart Chain service.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [selectedAsset, statusFilter]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleAssetChange = (asset: DepositAsset) => {
    if (asset === selectedAsset) return;
    setSelectedAsset(asset);
    setLoading(true);
    setCopied(false);
    setTxVerifyError(null);
    setTxVerifySuccess(null);
  };

  const activeAddress = addressInfo?.address || DEFAULT_DEPOSIT_ADDRESS;

  const handleCopy = () => {
    navigator.clipboard.writeText(activeAddress);
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  };

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
        setSuccessMessage('BNB Smart Chain listener synchronized. Latest deposits updated.');
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
        setTxVerifySuccess(data.message || 'Deposit verified and credited successfully.');
        setInputTxHash('');
        await fetchData();
      } else {
        throw new Error(data.message || 'Transaction verification failed.');
      }
    } catch (err: any) {
      setTxVerifyError(err?.message || 'Failed to verify transaction hash.');
    } finally {
      setSubmittingTx(false);
    }
  };

  const handlePasteTx = async () => {
    try {
      const text = await navigator.clipboard.readText();
      if (text) setInputTxHash(text.trim());
    } catch {
      // ignore clipboard restrictions
    }
  };

  const filteredDeposits = deposits.filter((dep) => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    return (
      dep.publicDepositId.toLowerCase().includes(q) ||
      dep.txHash.toLowerCase().includes(q) ||
      dep.fromAddress.toLowerCase().includes(q) ||
      dep.amount.toString().includes(q)
    );
  });

  const formatShortAddress = (addr: string) => (!addr || addr.length < 12 ? addr : `${addr.slice(0, 6)}...${addr.slice(-4)}`);
  const formatShortTx = (tx: string) => (!tx || tx.length < 14 ? tx : `${tx.slice(0, 8)}...${tx.slice(-6)}`);

  const isBnbSelected = selectedAsset === 'BNB';

  const totalCreditedUsdtAmount = deposits
    .filter((d) => d.status === 'CREDITED')
    .reduce((acc, d) => acc + Number(d.amount || 0), 0);

  return (
    <div className="space-y-6 animate-fadeIn pb-10 min-w-0 max-w-full overflow-x-hidden">
      {/* 1. ONE UI 9.5 HERO HEADER */}
      <div className="oneui-glass-card rounded-[24px] p-5 sm:p-7 relative overflow-hidden">
        <div className="absolute top-0 right-0 -mt-14 -mr-14 w-72 h-72 bg-[#00E676]/[0.07] rounded-full blur-3xl pointer-events-none" />

        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-5">
          <div className="space-y-2 min-w-0">
            <div className="flex flex-wrap items-center gap-2 text-xs font-medium">
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#F5B800]/15 border border-[#F5B800]/35 text-[#F5B800] text-[11px] font-mono font-bold">
                <BnbIcon size={13} />
                BNB Smart Chain (BEP-20) Network Only
              </span>
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-[#00E676]/12 border border-[#00E676]/25 text-[#00E676] text-[11px] font-mono font-semibold">
                <span className="w-1.5 h-1.5 rounded-full bg-[#00E676] animate-pulse" />
                Auto-Credit Active
              </span>
            </div>

            <h1 className="text-xl sm:text-3xl font-extrabold text-white tracking-tight">
              BEP-20 Deposit Hub
            </h1>

            <p className="text-xs sm:text-sm text-slate-400 max-w-2xl leading-relaxed">
              Transfer BEP-20 USDT or native BNB to your dedicated BNB Smart Chain address for automated settlement into your Main Wallet.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2 shrink-0">
            {onNavigateTab && (
              <button
                type="button"
                onClick={() => onNavigateTab('wallet')}
                className="px-3.5 py-2 rounded-2xl bg-white/[0.05] hover:bg-white/[0.1] text-white border border-white/[0.1] text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer min-h-[42px] active:scale-95"
              >
                <Wallet className="w-3.5 h-3.5 text-[#00E5FF]" />
                <span>Wallet</span>
              </button>
            )}
            <button
              type="button"
              onClick={() => {
                setRefreshing(true);
                fetchData();
              }}
              disabled={loading || refreshing}
              className="px-3 py-2 rounded-2xl bg-white/[0.05] hover:bg-white/[0.1] text-slate-300 hover:text-white border border-white/[0.1] text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer disabled:opacity-50 min-h-[42px] active:scale-95"
              title="Refresh deposits"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin text-[#00E5FF]' : ''}`} />
              <span className="hidden sm:inline">Refresh</span>
            </button>
            <button
              type="button"
              onClick={handleRescan}
              disabled={rescanning || loading}
              className="px-3.5 py-2 rounded-2xl bg-[#F5B800]/15 hover:bg-[#F5B800]/25 text-[#F5B800] border border-[#F5B800]/35 text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer disabled:opacity-50 min-h-[42px] active:scale-95"
            >
              <Radio className={`w-3.5 h-3.5 ${rescanning ? 'animate-pulse' : ''}`} />
              <span>{rescanning ? 'Scanning...' : 'Sync Chain'}</span>
            </button>
          </div>
        </div>
      </div>

      {/* Banners */}
      {!cryptoDepositsEnabled && (
        <div className="p-4 rounded-2xl bg-[#F5B800]/12 border border-[#F5B800]/30 flex items-center gap-3 text-xs text-[#F5B800]">
          <AlertTriangle className="w-4 h-4 shrink-0" />
          <span>
            Cryptocurrency deposits are temporarily paused by administration. Please wait until deposit rails resume before sending funds.
          </span>
        </div>
      )}

      {errorMessage && (
        <div className="p-4 rounded-2xl bg-[#FF4D4F]/12 border border-[#FF4D4F]/30 flex items-center gap-3 text-xs text-[#FF8587]">
          <AlertTriangle className="w-4 h-4 shrink-0 text-[#FF4D4F]" />
          <span>{errorMessage}</span>
        </div>
      )}

      {successMessage && (
        <div className="p-4 rounded-2xl bg-[#00E676]/12 border border-[#00E676]/30 flex items-center gap-3 text-xs text-[#00E676]">
          <CheckCircle2 className="w-4 h-4 shrink-0" />
          <span>{successMessage}</span>
        </div>
      )}

      {/* 2. METRIC SUMMARY CARDS */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        <div className="oneui-glass-card rounded-[22px] p-4 space-y-1.5 min-w-0">
          <div className="flex items-center justify-between text-xs text-slate-400">
            <span>Total Credited</span>
            <ArrowDownLeft className="w-4 h-4 text-[#00E676]" />
          </div>
          <div className="text-xl sm:text-2xl font-bold font-mono text-[#00E676] tabular-nums truncate">
            ${totalCreditedUsdtAmount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </div>
          <div className="text-[10px] text-slate-400">Confirmed on BSC</div>
        </div>

        <div className="oneui-glass-card rounded-[22px] p-4 space-y-1.5 min-w-0">
          <div className="flex items-center justify-between text-xs text-slate-400">
            <span>Deposits Count</span>
            <Coins className="w-4 h-4 text-[#00E5FF]" />
          </div>
          <div className="text-xl sm:text-2xl font-bold font-mono text-white tabular-nums">
            {deposits.length}
          </div>
          <div className="text-[10px] text-slate-400">On-chain transfers</div>
        </div>

        <div className="oneui-glass-card rounded-[22px] p-4 space-y-1.5 min-w-0">
          <div className="flex items-center justify-between text-xs text-slate-400">
            <span>Network / Chain</span>
            <BnbIcon size={15} />
          </div>
          <div className="text-base sm:text-lg font-bold font-mono text-white truncate">
            BSC Mainnet (56)
          </div>
          <div className="text-[10px] text-[#F5B800]">BEP-20 Standard Only</div>
        </div>

        <div className="oneui-glass-card rounded-[22px] p-4 space-y-1.5 min-w-0">
          <div className="flex items-center justify-between text-xs text-slate-400">
            <span>Finality</span>
            <Clock className="w-4 h-4 text-slate-300" />
          </div>
          <div className="text-xl sm:text-2xl font-bold font-mono text-white tabular-nums">
            {addressInfo?.requiredConfirmations || 3} Blocks
          </div>
          <div className="text-[10px] text-slate-400">~9 seconds settlement</div>
        </div>
      </div>

      {/* 3. DEPOSIT ADDRESS & QR CODE */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        <div className="lg:col-span-8 oneui-glass-card rounded-[24px] p-5 sm:p-6 space-y-5 min-w-0">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-white/[0.08] pb-4">
            <div className="flex items-center gap-3 min-w-0">
              {isBnbSelected ? <BnbIcon size={24} /> : <UsdtIcon size={24} />}
              <div className="min-w-0">
                <h2 className="text-sm sm:text-base font-bold text-white truncate">
                  Official {selectedAsset} Deposit Address
                </h2>
                <p className="text-xs text-slate-400">
                  Send {selectedAsset} on BNB Smart Chain (BEP-20) to this address.
                </p>
              </div>
            </div>

            <div className="inline-flex p-1 rounded-2xl bg-[#050807]/80 border border-white/[0.1] self-start sm:self-auto shrink-0">
              <button
                type="button"
                onClick={() => handleAssetChange('USDT')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer min-h-[36px] ${
                  !isBnbSelected
                    ? 'bg-[#00E676]/15 text-[#00E676] border border-[#00E676]/35'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                <UsdtIcon size={14} />
                <span>USDT (BEP-20)</span>
              </button>

              <button
                type="button"
                onClick={() => handleAssetChange('BNB')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer min-h-[36px] ${
                  isBnbSelected
                    ? 'bg-[#F5B800]/15 text-[#F5B800] border border-[#F5B800]/35'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                <BnbIcon size={14} />
                <span>BNB (Native)</span>
              </button>
            </div>
          </div>

          {/* High-Visibility Safety Badge */}
          <div className="p-3.5 rounded-2xl bg-[#F5B800]/10 border border-[#F5B800]/30 flex items-start gap-2.5 text-xs text-[#F5B800]">
            <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
            <div className="space-y-0.5">
              <div className="font-bold">BNB Smart Chain (BEP-20) Network Only</div>
              <p className="text-[11px] text-slate-300 leading-relaxed">
                Sending assets over TRC-20, ERC-20, or unsupported networks will result in permanent loss. Minimum deposit: <strong className="text-white font-mono">1.00 USDT</strong> (or <strong className="text-white font-mono">0.005 BNB</strong>).
              </p>
            </div>
          </div>

          {/* Address Box + 1-Tap Copy */}
          <div className="space-y-2">
            <label className="text-[11px] font-mono text-slate-400 uppercase tracking-wider block">
              Recipient BEP-20 Address
            </label>
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5">
              <div className="flex-1 px-4 py-3 rounded-2xl bg-[#050807]/85 border border-white/[0.1] font-mono text-xs sm:text-sm font-semibold text-[#00E5FF] select-all truncate min-h-[46px] flex items-center">
                {activeAddress}
              </div>
              <button
                type="button"
                onClick={handleCopy}
                className="px-4 py-3 rounded-2xl bg-[#00E5FF] hover:bg-[#00E5FF]/90 text-[#050807] font-bold text-xs flex items-center justify-center gap-1.5 transition-all cursor-pointer min-h-[46px] shrink-0 active:scale-95 shadow-lg shadow-[#00E5FF]/20"
              >
                {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                <span>{copied ? 'Address Copied' : 'Copy BEP-20 Address'}</span>
              </button>
            </div>
          </div>

          {/* Explorer Meta */}
          <div className="flex flex-wrap items-center justify-between gap-3 pt-3 border-t border-white/[0.06] text-xs text-slate-400">
            <div className="flex flex-wrap items-center gap-4">
              <span>
                Asset: <strong className="text-white font-mono">{selectedAsset}</strong>
              </span>
              <span>
                Minimum: <strong className="text-white font-mono">{isBnbSelected ? '0.005 BNB' : '$1.00 USDT'}</strong>
              </span>
            </div>
            <a
              href={addressInfo?.explorerUrl || `https://bscscan.com/address/${activeAddress}`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-[#00E5FF] hover:underline flex items-center gap-1 font-mono text-xs"
            >
              <span>View on BscScan</span>
              <ExternalLink className="w-3 h-3" />
            </a>
          </div>
        </div>

        {/* Crisp QR Code Card */}
        <div className="lg:col-span-4 oneui-glass-card rounded-[24px] p-5 sm:p-6 flex flex-col items-center justify-center text-center space-y-4">
          <div className="space-y-1">
            <span className="text-[11px] font-mono uppercase tracking-wider text-[#F5B800] font-bold">
              BEP-20 QR Code
            </span>
            <h3 className="text-sm font-bold text-white">Scan with Mobile Wallet</h3>
          </div>

          <div className="p-4 rounded-[22px] bg-white shadow-2xl inline-block ring-4 ring-white/10">
            <QRCodeSVG
              value={activeAddress}
              size={152}
              bgColor="#FFFFFF"
              fgColor="#050807"
              level="M"
              includeMargin={false}
            />
          </div>

          <div className="flex items-center gap-1.5 text-[11px] text-[#00E676] font-mono">
            <ShieldCheck className="w-3.5 h-3.5" />
            <span>Binance · Trust Wallet · MetaMask</span>
          </div>
        </div>
      </div>

      {/* 4. INSTANT TXHASH VERIFIER */}
      <div className="oneui-glass-card rounded-[24px] p-5 sm:p-6 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-white/[0.08] pb-3">
          <div className="flex items-center gap-2">
            <Send className="w-4 h-4 text-[#F5B800]" />
            <h3 className="text-sm sm:text-base font-bold text-white">
              Instant TxHash Verification
            </h3>
          </div>
          <span className="text-xs font-mono text-slate-400">
            Submit BSC TxHash for immediate verification
          </span>
        </div>

        {txVerifySuccess && (
          <div className="p-3.5 rounded-2xl bg-[#00E676]/12 border border-[#00E676]/30 text-[#00E676] flex items-center gap-2 text-xs">
            <CheckCircle2 className="w-4 h-4 shrink-0" />
            <span>{txVerifySuccess}</span>
          </div>
        )}

        {txVerifyError && (
          <div className="p-3.5 rounded-2xl bg-[#FF4D4F]/12 border border-[#FF4D4F]/30 text-[#FF8587] flex items-center gap-2 text-xs">
            <AlertTriangle className="w-4 h-4 shrink-0 text-[#FF4D4F]" />
            <span>{txVerifyError}</span>
          </div>
        )}

        <form onSubmit={handleSubmitTxHash} className="space-y-3">
          <div className="flex flex-col sm:flex-row items-stretch gap-2.5">
            <div className="relative flex-1 min-w-0">
              <input
                type="text"
                value={inputTxHash}
                onChange={(e) => setInputTxHash(e.target.value)}
                placeholder="Paste transaction hash: 0x..."
                disabled={submittingTx}
                className="w-full px-4 py-3 rounded-2xl bg-[#050807]/85 border border-white/[0.1] text-xs sm:text-sm text-white placeholder-slate-500 font-mono focus:outline-none focus:border-[#00E5FF] transition-colors pr-20 min-h-[46px]"
              />
              <button
                type="button"
                onClick={handlePasteTx}
                disabled={submittingTx}
                className="absolute right-2 top-2 px-3 py-1.5 rounded-xl bg-white/[0.07] hover:bg-white/[0.14] text-slate-300 hover:text-white text-xs font-mono font-semibold transition-all cursor-pointer"
              >
                Paste
              </button>
            </div>

            <button
              type="submit"
              disabled={submittingTx || !inputTxHash.trim()}
              className="px-5 py-3 rounded-2xl bg-[#F5B800] hover:bg-[#F5B800]/90 text-[#050807] text-xs sm:text-sm font-bold flex items-center justify-center gap-2 transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed shrink-0 min-h-[46px] active:scale-95"
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

      {/* 5. RECENT DEPOSITS TABLE */}
      <div className="oneui-glass-card rounded-[24px] p-5 sm:p-6 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-white/[0.08] pb-3">
          <div>
            <h3 className="text-sm sm:text-base font-bold text-white flex items-center gap-2">
              <Clock className="w-4 h-4 text-[#00E5FF]" />
              <span>Recent Deposits History</span>
            </h3>
            <p className="text-xs text-slate-400">
              Verified BEP-20 transfers credited to your wallet ledger.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                placeholder="Search TX / ID..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-8 pr-3 py-2 rounded-xl bg-[#050807]/85 border border-white/[0.1] text-xs text-white placeholder-slate-500 focus:outline-none focus:border-[#00E5FF] w-36 sm:w-48"
              />
            </div>

            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="px-3 py-2 rounded-xl bg-[#050807]/85 border border-white/[0.1] text-xs text-white focus:outline-none focus:border-[#00E5FF]"
            >
              <option value="ALL">All Statuses</option>
              <option value="CREDITED">Credited</option>
              <option value="CONFIRMING">Confirming</option>
              <option value="DETECTED">Detected</option>
            </select>
          </div>
        </div>

        {/* Desktop Table */}
        <div className="hidden md:block overflow-x-auto">
          {filteredDeposits.length === 0 && !loading ? (
            <div className="p-8 text-center text-xs text-slate-400 font-mono border border-dashed border-white/[0.1] rounded-2xl space-y-1.5">
              <div className="text-white font-semibold">No deposits recorded yet</div>
              <p>Send BEP-20 USDT or BNB to your deposit address above to view settlement history here.</p>
            </div>
          ) : (
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="border-b border-white/[0.08] text-slate-400 uppercase font-mono text-[10px] tracking-wider">
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
              <tbody className="divide-y divide-white/[0.05]">
                {filteredDeposits.map((dep) => (
                  <tr key={dep.id} className="hover:bg-white/[0.03] transition-colors">
                    <td className="py-3 px-3 font-mono text-[#00E5FF] font-semibold">{dep.publicDepositId}</td>
                    <td className="py-3 px-3 font-mono font-bold">
                      <span
                        className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] ${
                          dep.asset === 'BNB'
                            ? 'bg-[#F5B800]/12 text-[#F5B800] border border-[#F5B800]/25'
                            : 'bg-[#00E676]/12 text-[#00E676] border border-[#00E676]/25'
                        }`}
                      >
                        {dep.asset || 'USDT'}
                      </span>
                    </td>
                    <td className="py-3 px-3 font-mono font-bold text-white tabular-nums">
                      +{dep.amount} {dep.asset || 'USDT'}
                    </td>
                    <td className="py-3 px-3 font-mono text-slate-400">{formatShortAddress(dep.fromAddress)}</td>
                    <td className="py-3 px-3 font-mono">
                      <a
                        href={`https://bscscan.com/tx/${dep.txHash}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-[#00E5FF] hover:underline flex items-center gap-1"
                      >
                        {formatShortTx(dep.txHash)}
                        <ExternalLink className="w-3 h-3" />
                      </a>
                    </td>
                    <td className="py-3 px-3 font-mono text-slate-400 tabular-nums">
                      {dep.confirmations} / {summary?.requiredConfirmations || 3}
                    </td>
                    <td className="py-3 px-3">
                      <span
                        className={`px-2.5 py-0.5 rounded-full text-[10px] font-mono font-bold ${
                          dep.status === 'CREDITED'
                            ? 'bg-[#00E676]/12 text-[#00E676]'
                            : dep.status === 'CONFIRMING'
                            ? 'bg-[#F5B800]/12 text-[#F5B800]'
                            : 'bg-[#00E5FF]/12 text-[#00E5FF]'
                        }`}
                      >
                        {dep.status}
                      </span>
                    </td>
                    <td className="py-3 px-3 text-slate-400 text-[11px] text-right font-mono">
                      {new Date(dep.createdAt).toLocaleDateString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* Mobile Stacked Cards */}
        <div className="block md:hidden space-y-3">
          {filteredDeposits.length === 0 && !loading ? (
            <div className="p-6 text-center text-xs text-slate-400 font-mono border border-dashed border-white/[0.1] rounded-2xl space-y-1">
              <div className="text-white font-semibold">No deposits found</div>
              <p>Incoming BEP-20 transfers will appear here.</p>
            </div>
          ) : (
            filteredDeposits.map((dep) => (
              <div
                key={dep.id}
                className="p-4 rounded-2xl bg-[#050807]/75 border border-white/[0.08] space-y-2.5"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="font-mono font-bold text-xs text-[#00E5FF] truncate">{dep.publicDepositId}</span>
                  <span
                    className={`px-2 py-0.5 rounded-full text-[10px] font-mono font-bold shrink-0 ${
                      dep.status === 'CREDITED'
                        ? 'bg-[#00E676]/12 text-[#00E676]'
                        : dep.status === 'CONFIRMING'
                        ? 'bg-[#F5B800]/12 text-[#F5B800]'
                        : 'bg-[#00E5FF]/12 text-[#00E5FF]'
                    }`}
                  >
                    {dep.status}
                  </span>
                </div>

                <div className="flex items-center justify-between">
                  <div className="text-sm font-mono font-bold text-white tabular-nums">
                    +{dep.amount} {dep.asset || 'USDT'}
                  </div>
                  <span className="text-[10px] font-mono text-slate-400">
                    {new Date(dep.createdAt).toLocaleDateString()}
                  </span>
                </div>

                <div className="flex items-center justify-between text-xs pt-2 border-t border-white/[0.06]">
                  <span className="text-[11px] font-mono text-slate-400">{formatShortAddress(dep.fromAddress)}</span>
                  <a
                    href={`https://bscscan.com/tx/${dep.txHash}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-[#00E5FF] font-mono text-xs flex items-center gap-1"
                  >
                    <span>{formatShortTx(dep.txHash)}</span>
                    <ExternalLink className="w-3 h-3" />
                  </a>
                </div>
              </div>
            ))
          )}
        </div>

        <div className="flex items-center gap-2 text-[11px] text-slate-400 pt-1">
          <Info className="w-3.5 h-3.5 text-[#00E5FF] shrink-0" />
          <span>Deposits are automatically matched and settled once required BNB Smart Chain confirmations finalize.</span>
        </div>
      </div>
    </div>
  );
};
