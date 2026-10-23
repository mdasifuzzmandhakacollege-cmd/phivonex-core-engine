import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';
import {
  ShieldAlert,
  Users,
  Server,
  ShoppingBag,
  ArrowUpRight,
  ArrowLeftRight,
  GitFork,
  FileText,
  LayoutDashboard,
  Search,
  Filter,
  RefreshCw,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Clock,
  Loader2,
  Lock,
  Unlock,
  ChevronRight,
  ShieldCheck,
  DollarSign,
  Info,
  Sliders,
  Wallet,
  Coins,
  AlertOctagon,
  Database,
  Send,
  Key,
  Check,
  Download,
  Menu,
  X,
  Zap,
  Power,
  Gift,
  Edit3,
  Trophy,
  Mail,
  User,
  HelpCircle,
} from 'lucide-react';
import { PhivonexLogo } from '../components/brand/PhivonexLogo';
import { WithdrawalManagement } from '../components/admin/WithdrawalManagement';
import { EconomicControls } from '../components/admin/EconomicControls';
import { FinancialReconciliationView } from '../components/admin/FinancialReconciliationView';
import { AdminAuditLog } from '../components/admin/AdminAuditLog';
import { TreasuryMovementChart } from '../components/admin/TreasuryMovementChart';
import { CloudSqlDiagnosticCard } from '../components/admin/CloudSqlDiagnosticCard';
import { OffersManagement } from '../components/admin/OffersManagement';
import { WithdrawalStateLogsView } from '../components/admin/WithdrawalStateLogsView';
import { LeadershipRankControl } from '../components/admin/LeadershipRankControl';
import { AdminCommunicationsHub } from '../components/admin/AdminCommunicationsHub';
import { User360View } from '../components/admin/User360View';
import { KYCManagement } from '../components/admin/KYCManagement';
import { ReconciliationReport } from '../components/admin/ReconciliationReport';
import { AuditLogger, logAction, exportAuditLogsToCsv } from '../services/auditLogger';

interface AdminPageProps {
  onNavigate: (route: string) => void;
  currentPath?: string;
}

export type AdminTab =
  | 'overview'
  | 'kyc'
  | 'treasury'
  | 'reconciliation'
  | 'economics'
  | 'offers'
  | 'ranks'
  | 'users'
  | 'nodes'
  | 'orders'
  | 'withdrawals'
  | 'withdrawal-logs'
  | 'transactions'
  | 'network'
  | 'diagnostics'
  | 'audit'
  | 'communications'
  | 'support';

export const AdminPage: React.FC<AdminPageProps> = ({ onNavigate, currentPath = '/admin' }) => {
  const { user, loading } = useAuth();

  const ADMIN_EMAILS = [
    'md.asifuzzman.dhakacollege@gmail.com',
    'admin@phivonex.com',
  ];

  const isCurrentUserAdmin = Boolean(
    user && (
      user.isAdmin === true ||
      (user.role || '').toUpperCase() === 'ADMIN' ||
      (user.role || '').toUpperCase() === 'SUPER_ADMIN' ||
      (user.email && ADMIN_EMAILS.includes(user.email.toLowerCase().trim()))
    )
  );

  const getTabFromPath = (path: string): AdminTab => {
    const clean = path.toLowerCase().split('?')[0];
    if (clean.includes('/kyc')) return 'kyc';
    if (clean.includes('/communications') || clean.includes('/email')) return 'communications';
    if (clean.includes('/support') || clean.includes('/tickets')) return 'support';
    if (clean.includes('/treasury')) return 'treasury';
    if (clean.includes('/reconciliation')) return 'reconciliation';
    if (clean.includes('/economics')) return 'economics';
    if (clean.includes('/ranks') || clean.includes('/leadership')) return 'ranks';
    if (clean.includes('/offers') || clean.includes('/promotions')) return 'offers';
    if (clean.includes('/users')) return 'users';
    if (clean.includes('/nodes')) return 'nodes';
    if (clean.includes('/orders')) return 'orders';
    if (clean.includes('/withdrawal-logs') || clean.includes('/withdrawallogs')) return 'withdrawal-logs';
    if (clean.includes('/withdrawals')) return 'withdrawals';
    if (clean.includes('/transactions')) return 'transactions';
    if (clean.includes('/network')) return 'network';
    if (clean.includes('/diagnostics')) return 'diagnostics';
    if (clean.includes('/audit')) return 'audit';
    return 'overview';
  };

  const [activeTab, setActiveTab] = useState<AdminTab>(() => getTabFromPath(currentPath));
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState<boolean>(false);

  // Admin Data states
  const [summary, setSummary] = useState<any>(null);
  const [usersList, setUsersList] = useState<any[]>([]);
  const [nodesList, setNodesList] = useState<any[]>([]);
  const [ordersList, setOrdersList] = useState<any[]>([]);
  const [withdrawalsList, setWithdrawalsList] = useState<any[]>([]);
  const [transactionsList, setTransactionsList] = useState<any[]>([]);
  const [auditList, setAuditList] = useState<any[]>([]);

  const [loadingData, setLoadingData] = useState<boolean>(true);
  const [accessDenied, setAccessDenied] = useState<boolean>(false);

  // Search & Filter
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [statusFilter, setStatusFilter] = useState<string>('ALL');

  // Audit action feedback notification
  const [auditFeedback, setAuditFeedback] = useState<{
    type: 'success' | 'error' | 'info';
    message: string;
    logId?: string;
  } | null>(null);

  // Edit User Modal State
  const [editingUser, setEditingUser] = useState<any | null>(null);
  const [editUserFullName, setEditUserFullName] = useState<string>('');
  const [editUserCountry, setEditUserCountry] = useState<string>('');
  const [editUserPhone, setEditUserPhone] = useState<string>('');
  const [editUserStatus, setEditUserStatus] = useState<'ACTIVE' | 'LOCKED' | 'SUSPENDED'>('ACTIVE');
  const [editUserReason, setEditUserReason] = useState<string>('');
  const [savingUserEdit, setSavingUserEdit] = useState<boolean>(false);
  const [selectedUser360Id, setSelectedUser360Id] = useState<string | null>(null);

  const handleOpenUserEditModal = (u: any) => {
    setEditingUser(u);
    setEditUserFullName(u.fullName || '');
    setEditUserCountry(u.country || '');
    setEditUserPhone(u.phone || '');
    setEditUserStatus(u.status || 'ACTIVE');
    setEditUserReason('');
  };

  const handleSaveUserEdit = async () => {
    if (!editingUser) return;
    if (!editUserReason || editUserReason.trim().length < 5) {
      alert('Audit reason is required (minimum 5 characters).');
      return;
    }
    try {
      setSavingUserEdit(true);
      const res = await fetch(`/api/admin/users/${editingUser.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fullName: editUserFullName,
          country: editUserCountry,
          phone: editUserPhone,
          status: editUserStatus,
          reason: editUserReason.trim(),
        }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setEditingUser(null);
        setAuditFeedback({
          type: 'success',
          message: `User ${data.user.public_id} profile updated and logged to audit trail.`,
        });
        const userRes = await fetch(`/api/admin/users?search=${encodeURIComponent(searchQuery)}&status=${statusFilter}`);
        if (userRes.ok) {
          const uData = await userRes.json();
          setUsersList(uData.users || []);
        }
      } else {
        alert(data.message || 'Failed to update user profile.');
      }
    } catch (err: any) {
      alert(err.message || 'Network error updating user profile.');
    } finally {
      setSavingUserEdit(false);
    }
  };

  // CSV Export State
  const [exportingCsv, setExportingCsv] = useState<boolean>(false);

  // Auto-Withdrawal Mode State
  const [autoWithdrawalEnabled, setAutoWithdrawalEnabled] = useState<boolean>(false);
  const [togglingAutoWithdrawal, setTogglingAutoWithdrawal] = useState<boolean>(false);

  const handleToggleAutoWithdrawal = async () => {
    try {
      setTogglingAutoWithdrawal(true);
      const nextState = !autoWithdrawalEnabled;
      const res = await fetch('/api/withdrawals/admin/mode', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled: nextState }),
      });
      const data = await res.json();
      if (res.ok) {
        setAutoWithdrawalEnabled(data.autoWithdrawalEnabled);
        setAuditFeedback({
          type: 'success',
          message: data.message || `Withdrawal payout mode changed successfully: ${data.mode}`,
        });
        fetchAdminData();
      } else {
        throw new Error(data.message || 'Failed to toggle payout mode');
      }
    } catch (err: any) {
      setAuditFeedback({
        type: 'error',
        message: err.message || 'Failed to toggle payout mode',
      });
    } finally {
      setTogglingAutoWithdrawal(false);
    }
  };

  // Export system_audit_logs to CSV for compliance reporting
  const handleExportAuditLogs = async (categoryFilter?: string) => {
    try {
      setExportingCsv(true);
      setAuditFeedback(null);
      const res = await exportAuditLogsToCsv({
        category: categoryFilter,
        filename: `phivonex_compliance_audit_logs_${categoryFilter ? categoryFilter.toLowerCase() + '_' : ''}${Date.now()}.csv`,
      });
      setAuditFeedback({
        type: 'success',
        message: `Compliance Report: Successfully exported ${res.count} audit log records from 'system_audit_logs' to CSV (${res.filename}).`,
      });
    } catch (err: any) {
      console.error('[AdminPage] CSV Export failed:', err);
      setAuditFeedback({
        type: 'error',
        message: err.message || 'Failed to export system audit logs to CSV.',
      });
    } finally {
      setExportingCsv(false);
    }
  };

  // Treasury Settings State
  const [treasuryAddressInput, setTreasuryAddressInput] = useState<string>('0x71C...49A2 (Multi-Sig Vault)');
  const [coldStorageInput, setColdStorageInput] = useState<string>('0x94B...88F1 (Cold Multi-Sig)');
  const [reserveMinInput, setReserveMinInput] = useState<string>('50000');
  const [maxDailyDisburseInput, setMaxDailyDisburseInput] = useState<string>('25000');
  const [circuitBreakerActive, setCircuitBreakerActive] = useState<boolean>(false);
  const [autoSweepEnabled, setAutoSweepEnabled] = useState<boolean>(true);
  const [sweepAmountInput, setSweepAmountInput] = useState<string>('10000');

  // Sensitive User Action Modal
  const [selectedUserAction, setSelectedUserAction] = useState<{
    user: any;
    action: 'LOCK' | 'UNLOCK' | 'SET_ROLE_MANAGER' | 'SET_ROLE_USER';
  } | null>(null);
  const [actionReason, setActionReason] = useState<string>('');
  const [actionSubmitting, setActionSubmitting] = useState<boolean>(false);

  // Sync tab with URL
  useEffect(() => {
    const matched = getTabFromPath(currentPath);
    if (matched !== activeTab) {
      setActiveTab(matched);
    }
  }, [currentPath]);

  // Fetch Admin Data
  const fetchAdminData = useCallback(async (isManualRefresh = false) => {
    try {
      setLoadingData(true);
      setAccessDenied(false);

      const summaryRes = await fetch('/api/admin/summary');
      if (summaryRes.status === 403) {
        setAccessDenied(true);
        setLoadingData(false);
        return;
      }

      if (summaryRes.ok) {
        const sumData = await summaryRes.json();
        setSummary(sumData);
      }

      // Fetch Auto-Withdrawal Mode
      try {
        const modeRes = await fetch('/api/withdrawals/admin/mode');
        if (modeRes.ok) {
          const modeData = await modeRes.json();
          setAutoWithdrawalEnabled(Boolean(modeData.autoWithdrawalEnabled));
        }
      } catch {
        // non-blocking
      }

      // Fetch tab-specific data
      if (activeTab === 'users') {
        const res = await fetch(`/api/admin/users?search=${encodeURIComponent(searchQuery)}&status=${statusFilter}`);
        if (res.ok) {
          const data = await res.json();
          setUsersList(data.users || []);
        }
      } else if (activeTab === 'nodes') {
        const res = await fetch(`/api/admin/nodes?search=${encodeURIComponent(searchQuery)}&status=${statusFilter}`);
        if (res.ok) {
          const data = await res.json();
          setNodesList(data.nodes || []);
        }
      } else if (activeTab === 'orders') {
        const res = await fetch(`/api/admin/orders?search=${encodeURIComponent(searchQuery)}&status=${statusFilter}`);
        if (res.ok) {
          const data = await res.json();
          setOrdersList(data.orders || []);
        }
      } else if (activeTab === 'withdrawals') {
        const res = await fetch(`/api/admin/withdrawals?search=${encodeURIComponent(searchQuery)}&status=${statusFilter}`);
        if (res.ok) {
          const data = await res.json();
          setWithdrawalsList(data.withdrawals || []);
        }
      } else if (activeTab === 'transactions') {
        const res = await fetch(`/api/admin/transactions?search=${encodeURIComponent(searchQuery)}&type=${statusFilter}`);
        if (res.ok) {
          const data = await res.json();
          setTransactionsList(data.transactions || []);
        }
      } else if (activeTab === 'audit') {
        const res = await fetch(`/api/admin/audit-logs`);
        if (res.ok) {
          const data = await res.json();
          setAuditList(data.logs || []);
        }
      }

      if (isManualRefresh) {
        // Trigger audit log for administrative system sync
        await AuditLogger.logAction({
          actionType: 'ADMIN_SYSTEM_DATA_SYNC',
          category: 'SYSTEM',
          details: `Administrator manually synchronized system telemetry and ledger state for tab: ${activeTab.toUpperCase()}`,
          userUid: (user as any)?.uid || (user as any)?.publicId || 'ADMIN',
          actorEmail: user?.email || 'admin@phivonex.com',
          metadata: { tab: activeTab, refreshedAt: new Date().toISOString() },
        });
        setAuditFeedback({
          type: 'info',
          message: `System data synchronized and action logged to Firestore audit log.`,
        });
      }
    } catch (err) {
      console.error('[AdminPage] Fetch error:', err);
    } finally {
      setLoadingData(false);
    }
  }, [activeTab, searchQuery, statusFilter, user]);

  useEffect(() => {
    if (!loading && user) {
      fetchAdminData();
      const interval = setInterval(() => {
        fetchAdminData();
      }, 10000);
      return () => clearInterval(interval);
    }
  }, [loading, user, fetchAdminData]);

  // Handle Tab Switch
  const handleSelectTab = (tab: AdminTab) => {
    setActiveTab(tab);
    setSearchQuery('');
    setStatusFilter('ALL');
    setIsMobileMenuOpen(false);
    onNavigate(tab === 'overview' ? '/admin' : `/admin/${tab}`);
  };

  // 1. Audit-Logged Action: Update Treasury Settings
  const handleSaveTreasurySettings = async (settingType: string) => {
    try {
      setActionSubmitting(true);
      setAuditFeedback(null);

      let logPayload: any;
      if (settingType === 'WALLET_ADDRESS') {
        logPayload = {
          actionType: 'TREASURY_SETTINGS_WALLET_ADDRESS_UPDATE',
          category: 'TREASURY_MOVEMENT',
          targetType: 'TREASURY_WALLET_CONFIG',
          targetId: 'TREASURY_PRIMARY_ADDRESS',
          userUid: (user as any)?.uid || (user as any)?.publicId || 'ADMIN',
          actorEmail: user?.email || 'admin@phivonex.com',
          details: `Updated primary protocol treasury recipient wallet address to '${treasuryAddressInput}'.`,
          previousState: { treasuryAddress: '0x71C...49A2 (Multi-Sig Vault)' },
          newState: { treasuryAddress: treasuryAddressInput },
          metadata: { updatedBy: (user as any)?.publicId || 'SUPER_ADMIN', effectiveAt: new Date().toISOString() },
        };
      } else if (settingType === 'COLD_STORAGE') {
        logPayload = {
          actionType: 'TREASURY_SETTINGS_COLD_STORAGE_UPDATE',
          category: 'TREASURY_MOVEMENT',
          targetType: 'COLD_STORAGE_CONFIG',
          targetId: 'COLD_STORAGE_PRIMARY_ADDRESS',
          userUid: (user as any)?.uid || (user as any)?.publicId || 'ADMIN',
          actorEmail: user?.email || 'admin@phivonex.com',
          details: `Updated cold storage multi-sig sweep address to '${coldStorageInput}'.`,
          previousState: { coldStorageAddress: '0x94B...88F1 (Cold Multi-Sig)' },
          newState: { coldStorageAddress: coldStorageInput },
          metadata: { updatedBy: (user as any)?.publicId || 'SUPER_ADMIN', effectiveAt: new Date().toISOString() },
        };
      } else if (settingType === 'RESERVE_THRESHOLDS') {
        logPayload = {
          actionType: 'TREASURY_SETTINGS_RESERVE_THRESHOLDS_UPDATE',
          category: 'TREASURY_MOVEMENT',
          targetType: 'LIQUIDITY_BUFFER_CONFIG',
          targetId: 'HOT_WALLET_THRESHOLDS',
          userUid: (user as any)?.uid || (user as any)?.publicId || 'ADMIN',
          actorEmail: user?.email || 'admin@phivonex.com',
          details: `Adjusted hot wallet reserve minimum to $${reserveMinInput} USDT and daily disbursement ceiling to $${maxDailyDisburseInput} USDT.`,
          previousState: { reserveMin: 50000, maxDailyDisburse: 25000 },
          newState: { reserveMin: Number(reserveMinInput), maxDailyDisburse: Number(maxDailyDisburseInput) },
          metadata: { autoSweepEnabled },
        };
      }

      // Record to Firestore authoritative system_audit_logs collection
      const recordedLog = await AuditLogger.logAction(logPayload);

      setAuditFeedback({
        type: 'success',
        message: `Treasury settings successfully updated and committed to Firestore audit log (Ref: ${recordedLog.id.slice(0, 8)}).`,
        logId: recordedLog.id,
      });
    } catch (err: any) {
      console.error('[AdminPage] Error saving treasury settings:', err);
      setAuditFeedback({
        type: 'error',
        message: err.message || 'Failed to update treasury settings.',
      });
    } finally {
      setActionSubmitting(false);
    }
  };

  // 2. Audit-Logged Action: Trigger Treasury Liquidity Sweep
  const handleExecuteTreasurySweep = async () => {
    try {
      setActionSubmitting(true);
      setAuditFeedback(null);
      const sweepNum = parseFloat(sweepAmountInput);
      if (isNaN(sweepNum) || sweepNum <= 0) {
        throw new Error('Please specify a valid numeric sweep amount.');
      }

      // Record treasury sweep action to Firestore
      const recordedLog = await AuditLogger.logAction({
        actionType: 'TREASURY_HOT_WALLET_SWEEP_EXECUTED',
        category: 'TREASURY_MOVEMENT',
        targetType: 'TREASURY_HOT_WALLET',
        targetId: coldStorageInput,
        userUid: (user as any)?.uid || (user as any)?.publicId || 'ADMIN',
        actorEmail: user?.email || 'admin@phivonex.com',
        details: `Executed liquidity sweep of ${sweepNum} USDT from hot wallet reserves to cold multi-sig address '${coldStorageInput}'.`,
        metadata: {
          sweepAmountUsdt: sweepNum,
          destinationColdAddress: coldStorageInput,
          triggerSource: 'ADMIN_CONSOLE_DIRECT',
        },
      });

      setAuditFeedback({
        type: 'success',
        message: `Treasury reserve sweep of $${sweepNum.toFixed(2)} USDT initiated and registered in audit log (Doc ID: ${recordedLog.id.slice(0, 8)}).`,
        logId: recordedLog.id,
      });
    } catch (err: any) {
      console.error('[AdminPage] Error executing treasury sweep:', err);
      setAuditFeedback({
        type: 'error',
        message: err.message || 'Error executing treasury sweep.',
      });
    } finally {
      setActionSubmitting(false);
    }
  };

  // 3. Audit-Logged Action: Toggle Emergency Protocol Circuit Breaker
  const handleToggleCircuitBreaker = async () => {
    try {
      setActionSubmitting(true);
      setAuditFeedback(null);
      const nextState = !circuitBreakerActive;

      const recordedLog = await AuditLogger.logAction({
        actionType: nextState ? 'EMERGENCY_CIRCUIT_BREAKER_ACTIVATED' : 'EMERGENCY_CIRCUIT_BREAKER_DEACTIVATED',
        category: 'SECURITY',
        targetType: 'SYSTEM_PROTOCOL',
        targetId: 'TREASURY_PAYOUT_GATEWAY',
        userUid: (user as any)?.uid || (user as any)?.publicId || 'ADMIN',
        actorEmail: user?.email || 'admin@phivonex.com',
        previousState: { circuitBreakerActive },
        newState: { circuitBreakerActive: nextState },
        details: nextState
          ? 'EMERGENCY: Protocol withdrawal circuit breaker ACTIVATED. All automated treasury disbursements and sweeps are frozen.'
          : 'Protocol withdrawal circuit breaker DEACTIVATED. Normal automated payout operations resumed.',
        metadata: {
          emergencyLevel: nextState ? 'CRITICAL_HALT' : 'NORMAL_OPERATION',
          triggeredBy: (user as any)?.publicId || 'ADMIN',
        },
      });

      setCircuitBreakerActive(nextState);
      setAuditFeedback({
        type: nextState ? 'error' : 'success',
        message: `Circuit breaker status changed to ${nextState ? 'ACTIVE (FROZEN)' : 'INACTIVE (RESTORED)'}. Log ID: ${recordedLog.id.slice(0, 8)}.`,
        logId: recordedLog.id,
      });
    } catch (err: any) {
      console.error('[AdminPage] Error toggling circuit breaker:', err);
      setAuditFeedback({
        type: 'error',
        message: err.message || 'Failed to toggle emergency circuit breaker.',
      });
    } finally {
      setActionSubmitting(false);
    }
  };

  // 4. Audit-Logged Action: User Account Status / Role Update
  const handleConfirmUserAction = async () => {
    if (!selectedUserAction) return;
    try {
      setActionSubmitting(true);
      setAuditFeedback(null);
      const { user: targetUser, action } = selectedUserAction;

      let newStatus = targetUser.status;
      let newRole = targetUser.role;
      let actionTitle = '';

      if (action === 'LOCK') {
        newStatus = 'LOCKED';
        actionTitle = 'USER_ACCOUNT_LOCKED';
      } else if (action === 'UNLOCK') {
        newStatus = 'ACTIVE';
        actionTitle = 'USER_ACCOUNT_UNLOCKED';
      } else if (action === 'SET_ROLE_MANAGER') {
        newRole = 'ADMIN';
        actionTitle = 'USER_ROLE_PROMOTED_TO_ADMIN';
      } else if (action === 'SET_ROLE_USER') {
        newRole = 'USER';
        actionTitle = 'USER_ROLE_DEMOTED_TO_USER';
      }

      // Record to Firestore authoritative system_audit_logs collection
      const recordedLog = await AuditLogger.logAction({
        actionType: actionTitle,
        category: 'SECURITY',
        targetType: 'USER_ACCOUNT',
        targetId: targetUser.id || targetUser.publicId,
        userUid: (user as any)?.uid || (user as any)?.publicId || 'ADMIN',
        actorEmail: user?.email || 'admin@phivonex.com',
        previousState: { status: targetUser.status, role: targetUser.role },
        newState: { status: newStatus, role: newRole },
        details: `Administrator performed ${action} on operator account ${targetUser.publicId} (${targetUser.email}). Reason: ${actionReason.trim() || 'Manual administrative policy enforcement.'}`,
        metadata: {
          targetUserPublicId: targetUser.publicId,
          targetUserEmail: targetUser.email,
          reason: actionReason.trim() || 'Manual administrative policy enforcement',
        },
      });

      // Update local state list
      setUsersList((prev) =>
        prev.map((u) => (u.id === targetUser.id ? { ...u, status: newStatus, role: newRole } : u))
      );

      setAuditFeedback({
        type: 'success',
        message: `User ${targetUser.publicId} successfully updated with action '${action}'. Audit log registered (${recordedLog.id.slice(0, 8)}).`,
        logId: recordedLog.id,
      });

      setSelectedUserAction(null);
      setActionReason('');
    } catch (err: any) {
      console.error('[AdminPage] Error executing user action:', err);
      setAuditFeedback({
        type: 'error',
        message: err.message || 'Failed to complete user account action.',
      });
    } finally {
      setActionSubmitting(false);
    }
  };

  // 1. Auth Loading State
  if (loading) {
    return (
      <div className="min-h-screen bg-[#05070B] text-white flex flex-col items-center justify-center p-4 font-sans">
        <div className="p-8 rounded-2xl bg-[#07101D] border border-white/[0.08] flex flex-col items-center space-y-4 max-w-sm w-full text-center">
          <PhivonexLogo size="lg" />
          <div className="flex items-center gap-2 text-xs text-[#00CFFF] font-mono">
            <Loader2 className="w-4 h-4 animate-spin" />
            <span>Verifying Admin Credentials...</span>
          </div>
        </div>
      </div>
    );
  }

  // 2. Access Denied State (403 Forbidden)
  if (accessDenied || (user && !isCurrentUserAdmin)) {
    return (
      <div className="min-h-screen bg-[#05070B] text-white flex flex-col items-center justify-center p-4 font-sans selection:bg-[#F04438]/20">
        <div className="p-8 rounded-2xl bg-[#07101D] border border-[#F04438]/30 shadow-2xl flex flex-col items-center text-center space-y-4 max-w-md w-full">
          <div className="w-12 h-12 rounded-xl bg-[#F04438]/10 border border-[#F04438]/30 flex items-center justify-center text-[#F04438]">
            <ShieldAlert className="w-6 h-6" />
          </div>
          <h1 className="text-xl font-bold text-white">403 — Administrative Access Denied</h1>
          <p className="text-xs text-[#98A2B3]">
            Your operator account ({(user as any)?.publicId || 'Operator'}) does not possess administrative RBAC authorization for the PHIVONEX protocol control plane.
          </p>
          <button
            onClick={() => onNavigate('/app')}
            className="w-full py-2.5 px-4 rounded-xl bg-white/[0.06] hover:bg-white/[0.1] text-white font-bold text-xs flex items-center justify-center gap-2 transition-colors cursor-pointer"
          >
            Return to User Dashboard
          </button>
        </div>
      </div>
    );
  }

  const NAV_ITEMS = [
    { id: 'overview' as AdminTab, label: 'Overview', icon: LayoutDashboard },
    { id: 'kyc' as AdminTab, label: 'KYC Verification Hub', icon: ShieldCheck, badge: summary?.pendingKycCount },
    { id: 'treasury' as AdminTab, label: 'Treasury & Reserves', icon: Wallet },
    { id: 'reconciliation' as AdminTab, label: 'Financial Reconciliation', icon: ShieldCheck },
    { id: 'economics' as AdminTab, label: 'Economic Controls', icon: Sliders },
    { id: 'offers' as AdminTab, label: 'Promotions & Offers', icon: Gift },
    { id: 'ranks' as AdminTab, label: 'Leadership Ranks', icon: Trophy },
    { id: 'users' as AdminTab, label: 'Users', icon: Users },
    { id: 'nodes' as AdminTab, label: 'Nodes Inventory', icon: Server },
    { id: 'orders' as AdminTab, label: 'Node Orders', icon: ShoppingBag },
    { id: 'withdrawals' as AdminTab, label: 'Withdrawals & Payouts', icon: ArrowUpRight, badge: summary?.pendingWithdrawalsCount },
    { id: 'withdrawal-logs' as AdminTab, label: 'Withdrawal State Logs', icon: Clock },
    { id: 'transactions' as AdminTab, label: 'Ledger Explorer', icon: ArrowLeftRight },
    { id: 'network' as AdminTab, label: 'Network Telemetry', icon: GitFork },
    { id: 'diagnostics' as AdminTab, label: 'System Diagnostics', icon: ShieldAlert },
    { id: 'communications' as AdminTab, label: 'Communications & Email', icon: Mail },
    { id: 'support' as AdminTab, label: 'Support Center', icon: HelpCircle },
    { id: 'audit' as AdminTab, label: 'Admin Audit Logs', icon: FileText },
  ];

  return (
    <div className="min-h-screen bg-[#05070B] text-[#F7FAFC] flex font-sans selection:bg-[#00CFFF]/20">
      {/* Sidebar */}
      <aside className="w-64 fixed inset-y-0 left-0 bg-[#07101D] border-r border-white/[0.08] flex flex-col justify-between p-4 z-30 select-none hidden lg:flex">
        <div className="space-y-6">
          <div className="flex items-center gap-2 px-2">
            <PhivonexLogo size="md" />
            <span className="text-[10px] font-mono px-2 py-0.5 bg-[#F04438]/10 text-[#F04438] border border-[#F04438]/30 rounded font-bold uppercase">
              Admin
            </span>
          </div>

          <nav className="space-y-1">
            <div className="px-3 pb-2 text-[10px] font-mono uppercase tracking-wider text-[#98A2B3]">
              Control Plane Navigation
            </div>
            {NAV_ITEMS.map((item) => {
              const Icon = item.icon;
              const isActive = activeTab === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => handleSelectTab(item.id)}
                  className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-xs font-medium transition-all cursor-pointer ${
                    isActive
                      ? 'bg-gradient-to-r from-[#00CFFF]/15 to-[#168BFF]/10 text-white border border-[#00CFFF]/30'
                      : 'text-[#98A2B3] hover:text-white hover:bg-white/[0.04] border border-transparent'
                  }`}
                >
                  <div className="flex items-center gap-2.5">
                    <Icon className={`w-4 h-4 ${isActive ? 'text-[#00CFFF]' : 'text-[#98A2B3]'}`} />
                    <span>{item.label}</span>
                  </div>
                  {item.badge ? (
                    <span className="px-2 py-0.5 rounded-full bg-[#FFB020] text-[#05070B] text-[10px] font-mono font-bold">
                      {item.badge}
                    </span>
                  ) : null}
                </button>
              );
            })}
          </nav>
        </div>

        <div className="p-3 rounded-xl bg-white/[0.02] border border-white/[0.06] text-[11px] font-mono space-y-1 text-[#98A2B3]">
          <div className="text-white font-bold flex items-center gap-1.5">
            <ShieldCheck className="w-3.5 h-3.5 text-[#32D583]" />
            RBAC Authenticated
          </div>
          <div>Admin: {(user as any)?.publicId || 'ADMIN'}</div>
          <div className="text-[9px] text-[#00CFFF] flex items-center gap-1 pt-1">
            <Database className="w-2.5 h-2.5" />
            Audit Engine: Firestore Active
          </div>
        </div>
      </aside>

      {/* Mobile Slide-out Navigation Drawer & Overlay */}
      {isMobileMenuOpen && (
        <div className="lg:hidden fixed inset-0 z-50 flex">
          {/* Backdrop */}
          <div
            className="fixed inset-0 bg-black/80 backdrop-blur-sm transition-opacity"
            onClick={() => setIsMobileMenuOpen(false)}
            aria-hidden="true"
          />

          {/* Drawer Content */}
          <div className="relative flex-1 flex flex-col max-w-xs w-full bg-[#07101D] border-r border-white/[0.08] z-10 p-4 justify-between animate-slideRight">
            <div className="space-y-6">
              <div className="flex items-center justify-between px-2">
                <div className="flex items-center gap-2">
                  <PhivonexLogo size="md" />
                  <span className="text-[10px] font-mono px-2 py-0.5 bg-[#F04438]/10 text-[#F04438] border border-[#F04438]/30 rounded font-bold uppercase">
                    Admin
                  </span>
                </div>
                <button
                  onClick={() => setIsMobileMenuOpen(false)}
                  className="p-2 rounded-lg bg-white/[0.04] text-[#98A2B3] hover:text-white"
                  aria-label="Close menu"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <nav className="space-y-1 overflow-y-auto max-h-[calc(100vh-220px)]">
                <div className="px-3 pb-2 text-[10px] font-mono uppercase tracking-wider text-[#98A2B3]">
                  Admin Sections
                </div>
                {NAV_ITEMS.map((item) => {
                  const Icon = item.icon;
                  const isActive = activeTab === item.id;
                  return (
                    <button
                      key={item.id}
                      onClick={() => handleSelectTab(item.id)}
                      className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-xs font-medium transition-all cursor-pointer ${
                        isActive
                          ? 'bg-gradient-to-r from-[#00CFFF]/15 to-[#168BFF]/10 text-white border border-[#00CFFF]/30'
                          : 'text-[#98A2B3] hover:text-white hover:bg-white/[0.04] border border-transparent'
                      }`}
                    >
                      <div className="flex items-center gap-2.5">
                        <Icon className={`w-4 h-4 ${isActive ? 'text-[#00CFFF]' : 'text-[#98A2B3]'}`} />
                        <span>{item.label}</span>
                      </div>
                      {item.badge ? (
                        <span className="px-2 py-0.5 rounded-full bg-[#FFB020] text-[#05070B] text-[10px] font-mono font-bold">
                          {item.badge}
                        </span>
                      ) : null}
                    </button>
                  );
                })}
              </nav>
            </div>

            <div className="pt-4 border-t border-white/[0.08] space-y-2">
              <button
                onClick={() => onNavigate('/app')}
                className="w-full py-2.5 px-3 rounded-xl bg-white/[0.05] hover:bg-white/[0.1] text-xs font-bold text-white flex items-center justify-center gap-2"
              >
                <span>Return to User Dashboard</span>
                <ArrowUpRight className="w-4 h-4 text-[#00CFFF]" />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Main Container */}
      <div className="flex-1 lg:pl-64 flex flex-col min-w-0">
        {/* Top Header */}
        <header className="h-16 border-b border-white/[0.08] bg-[#07101D]/80 backdrop-blur-md px-4 sm:px-6 flex items-center justify-between sticky top-0 z-30">
          <div className="flex items-center gap-3">
            <button
              onClick={() => setIsMobileMenuOpen(true)}
              className="lg:hidden p-2 rounded-xl bg-white/[0.04] hover:bg-white/[0.08] border border-white/[0.1] text-white flex items-center justify-center cursor-pointer min-h-[40px] min-w-[40px]"
              aria-label="Open Admin Menu"
            >
              <Menu className="w-5 h-5 text-[#00CFFF]" />
            </button>
            <h1 className="text-xs sm:text-sm font-bold text-white capitalize flex items-center gap-2 truncate">
              <ShieldCheck className="w-4 h-4 text-[#00CFFF] flex-shrink-0" />
              <span className="hidden sm:inline">PHIVONEX Protocol Admin —</span>
              <span className="text-[#00CFFF]">{activeTab}</span>
            </h1>
            <div className="hidden sm:flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-[#32D583]/10 border border-[#32D583]/20 text-[#32D583] text-[10px] font-mono font-bold">
              <span className="w-1.5 h-1.5 rounded-full bg-[#32D583] animate-ping" />
              <span>Live Synced</span>
            </div>
          </div>

          <div className="flex items-center gap-2 sm:gap-3">
            <button
              onClick={() => handleExportAuditLogs()}
              disabled={exportingCsv}
              className="hidden md:flex px-3 py-1.5 rounded-lg bg-[#00CFFF]/15 hover:bg-[#00CFFF]/25 text-[#00CFFF] border border-[#00CFFF]/40 text-xs font-bold items-center gap-1.5 transition-colors cursor-pointer"
              title="Export system_audit_logs collection as CSV for compliance reporting"
            >
              {exportingCsv ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Download className="w-3.5 h-3.5" />
              )}
              <span>Export CSV</span>
            </button>
            <button
              onClick={() => fetchAdminData(true)}
              disabled={loadingData}
              className="px-2.5 sm:px-3 py-1.5 rounded-lg bg-white/[0.04] hover:bg-white/[0.08] text-white border border-white/[0.1] text-xs flex items-center gap-1.5 transition-colors cursor-pointer"
              title="Sync system data and record audit action"
            >
              <RefreshCw className={`w-3.5 h-3.5 text-[#00CFFF] ${loadingData ? 'animate-spin' : ''}`} />
              <span className="hidden sm:inline">Sync Data</span>
            </button>
            <button
              onClick={() => onNavigate('/app')}
              className="px-2.5 sm:px-3 py-1.5 rounded-lg bg-[#00CFFF]/10 hover:bg-[#00CFFF]/20 text-[#00CFFF] border border-[#00CFFF]/30 text-xs font-bold transition-colors cursor-pointer whitespace-nowrap"
            >
              User App
            </button>
          </div>
        </header>

        {/* Horizontal Quick-Switch Navigation Tabs (Desktop & Mobile) */}
        <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar py-2 px-4 sm:px-6 bg-[#07101D]/95 border-b border-white/[0.08] sticky top-16 z-20 backdrop-blur-md">
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            const isActive = activeTab === item.id;
            return (
              <button
                key={item.id}
                onClick={() => handleSelectTab(item.id)}
                className={`px-3 py-1.5 rounded-xl text-xs font-medium whitespace-nowrap flex items-center gap-1.5 transition-all cursor-pointer flex-shrink-0 ${
                  isActive
                    ? 'bg-[#00CFFF] text-[#05070B] font-bold shadow-md shadow-[#00CFFF]/20'
                    : 'bg-white/[0.04] text-[#98A2B3] hover:text-white hover:bg-white/[0.08] border border-white/[0.06]'
                }`}
              >
                <Icon className={`w-3.5 h-3.5 ${isActive ? 'text-[#05070B]' : 'text-[#00CFFF]'}`} />
                <span>{item.label}</span>
                {item.badge ? (
                  <span className={`px-1.5 py-0.2 rounded-full text-[9px] font-mono font-bold ${
                    isActive ? 'bg-[#05070B] text-[#00CFFF]' : 'bg-[#FFB020] text-[#05070B]'
                  }`}>
                    {item.badge}
                  </span>
                ) : null}
              </button>
            );
          })}
        </div>

        {/* Audit Feedback Toast Banner */}
        {auditFeedback && (
          <div className="px-6 pt-4">
            <div
              className={`p-3.5 rounded-xl border flex items-center justify-between text-xs transition-all ${
                auditFeedback.type === 'success'
                  ? 'bg-[#32D583]/10 border-[#32D583]/30 text-[#32D583]'
                  : auditFeedback.type === 'error'
                  ? 'bg-[#F04438]/10 border-[#F04438]/30 text-[#F04438]'
                  : 'bg-[#00CFFF]/10 border-[#00CFFF]/30 text-[#00CFFF]'
              }`}
            >
              <div className="flex items-center gap-2.5">
                {auditFeedback.type === 'success' ? (
                  <CheckCircle2 className="w-4 h-4 shrink-0 text-[#32D583]" />
                ) : auditFeedback.type === 'error' ? (
                  <AlertTriangle className="w-4 h-4 shrink-0 text-[#F04438]" />
                ) : (
                  <Info className="w-4 h-4 shrink-0 text-[#00CFFF]" />
                )}
                <span>{auditFeedback.message}</span>
                {auditFeedback.logId && (
                  <button
                    onClick={() => handleSelectTab('audit')}
                    className="underline text-[11px] font-mono hover:opacity-80 ml-1 cursor-pointer"
                  >
                    View in Audit Log &rarr;
                  </button>
                )}
              </div>
              <button
                onClick={() => setAuditFeedback(null)}
                className="text-white/60 hover:text-white p-1 cursor-pointer"
              >
                &times;
              </button>
            </div>
          </div>
        )}

        {/* Content Body */}
        <main className="p-6 max-w-7xl w-full mx-auto space-y-8">
          {/* TAB 1: OVERVIEW */}
          {activeTab === 'overview' && (
            <div className="space-y-6">
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <div className="p-4 rounded-xl bg-[#07101D] border border-white/[0.08] space-y-1">
                  <div className="text-xs text-[#98A2B3] flex items-center justify-between">
                    <span>Total Registered Users</span>
                    <Users className="w-4 h-4 text-[#00CFFF]" />
                  </div>
                  <div className="text-2xl font-extrabold text-white font-mono">{summary?.totalUsers || 0}</div>
                  <div className="text-[11px] text-[#32D583]">{summary?.activeUsers || 0} Active Users</div>
                </div>

                <div className="p-4 rounded-xl bg-[#07101D] border border-white/[0.08] space-y-1">
                  <div className="text-xs text-[#98A2B3] flex items-center justify-between">
                    <span>Genesis Node Supply</span>
                    <Server className="w-4 h-4 text-[#00CFFF]" />
                  </div>
                  <div className="text-2xl font-extrabold text-white font-mono">{summary?.activeNodes || 0} / 10,000</div>
                  <div className="text-[11px] text-[#98A2B3]">{summary?.availableNodes || 0} Available</div>
                </div>

                <div className="p-4 rounded-xl bg-[#07101D] border border-white/[0.08] space-y-1">
                  <div className="text-xs text-[#98A2B3] flex items-center justify-between">
                    <span>Pending Withdrawals</span>
                    <ArrowUpRight className="w-4 h-4 text-[#FFB020]" />
                  </div>
                  <div className="text-2xl font-extrabold text-white font-mono">${(summary?.pendingWithdrawalsAmount || 0).toFixed(2)}</div>
                  <div className="text-[11px] text-[#FFB020]">{summary?.pendingWithdrawalsCount || 0} Requests Awaiting Review</div>
                </div>

                <div className="p-4 rounded-xl bg-[#07101D] border border-white/[0.08] space-y-1">
                  <div className="text-xs text-[#98A2B3] flex items-center justify-between">
                    <span>Total Disbursed Payouts</span>
                    <CheckCircle2 className="w-4 h-4 text-[#32D583]" />
                  </div>
                  <div className="text-2xl font-extrabold text-white font-mono">${(summary?.completedWithdrawalsTotal || 0).toFixed(2)}</div>
                  <div className="text-[11px] text-[#32D583]">Settled Lifetime</div>
                </div>
              </div>

              {/* Automated Blockchain Payout Engine & Mode Switch on Overview */}
              <div className={`p-5 rounded-2xl border transition-all ${
                autoWithdrawalEnabled 
                  ? 'bg-gradient-to-r from-[#07101D] via-[#052e16]/40 to-[#07101D] border-emerald-500/40 shadow-emerald-500/10' 
                  : 'bg-gradient-to-r from-[#07101D] via-[#2d1b00]/40 to-[#07101D] border-amber-500/40 shadow-amber-500/10'
              } shadow-xl flex flex-col md:flex-row md:items-center justify-between gap-4`}>
                <div className="flex items-center gap-3.5">
                  <div className={`w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0 ${
                    autoWithdrawalEnabled ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' : 'bg-amber-500/20 text-amber-400 border border-amber-500/30'
                  }`}>
                    <Zap className={`w-6 h-6 ${autoWithdrawalEnabled ? 'fill-emerald-400' : ''}`} />
                  </div>
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="text-base font-bold text-white">Withdrawal Payout Control</h3>
                      <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-mono font-bold uppercase tracking-wider border ${
                        autoWithdrawalEnabled
                          ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
                          : 'bg-amber-500/20 text-amber-300 border-amber-500/40'
                      }`}>
                        {autoWithdrawalEnabled ? '🟢 FULL AUTOMATIC (24/7 ACTIVE)' : '⏸️ MANUAL APPROVAL MODE'}
                      </span>
                    </div>
                    <p className="text-xs text-[#98A2B3] mt-1 max-w-2xl leading-relaxed">
                      {autoWithdrawalEnabled ? (
                        <span>
                          <strong className="text-emerald-400">Full Automatic Mode Active:</strong> Public withdrawal requests trigger backend smart contract calls directly to the user's wallet without delay.
                        </span>
                      ) : (
                        <span>
                          <strong className="text-amber-400">Manual Approval Mode Active:</strong> Public withdrawal requests enter the queue for administrator 1-click review and payout execution.
                        </span>
                      )}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-3 shrink-0">
                  <button
                    onClick={() => setActiveTab('withdrawals')}
                    className="px-3.5 py-2.5 rounded-xl bg-white/[0.05] hover:bg-white/[0.1] text-white/90 hover:text-white border border-white/[0.08] text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer whitespace-nowrap"
                  >
                    <span>View Withdrawal Queue ({summary?.pendingWithdrawalsCount || 0})</span>
                    <ArrowUpRight className="w-4 h-4 text-amber-400" />
                  </button>

                  <button
                    onClick={handleToggleAutoWithdrawal}
                    disabled={togglingAutoWithdrawal}
                    className={`px-4 py-2.5 rounded-xl font-bold text-xs flex items-center gap-2 transition-all cursor-pointer shadow-lg active:scale-95 whitespace-nowrap ${
                      autoWithdrawalEnabled
                        ? 'bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-500/40'
                        : 'bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 border border-emerald-500/40'
                    }`}
                  >
                    {togglingAutoWithdrawal ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <Power className="w-4 h-4" />
                    )}
                    <span>{autoWithdrawalEnabled ? 'Switch to Manual Approval' : 'Switch to Full Automatic'}</span>
                  </button>
                </div>
              </div>

              {/* Live Cloud SQL PostgreSQL Diagnostic Card */}
              <CloudSqlDiagnosticCard />

              {/* Economic Totals Breakdown */}
              <div className="p-6 rounded-2xl bg-[#07101D] border border-white/[0.08] space-y-4">
                <h3 className="text-sm font-bold text-white flex items-center gap-2">
                  <DollarSign className="w-4 h-4 text-[#00CFFF]" />
                  System-Wide Economic Totals
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 font-mono text-xs">
                  <div className="p-4 rounded-xl bg-[#05070B] border border-white/[0.06] space-y-1">
                    <span className="text-[#98A2B3] text-[10px] uppercase">Referral Commissions</span>
                    <div className="text-lg font-bold text-white">${(summary?.referralCommissionsTotal || 0).toFixed(2)}</div>
                  </div>
                  <div className="p-4 rounded-xl bg-[#05070B] border border-white/[0.06] space-y-1">
                    <span className="text-[#98A2B3] text-[10px] uppercase">Binary Matching Bonuses</span>
                    <div className="text-lg font-bold text-white">${(summary?.matchingSettlementsTotal || 0).toFixed(2)}</div>
                  </div>
                  <div className="p-4 rounded-xl bg-[#05070B] border border-white/[0.06] space-y-1">
                    <span className="text-[#98A2B3] text-[10px] uppercase">Promotion Milestone Bonuses</span>
                    <div className="text-lg font-bold text-white">${(summary?.promotionBonusesTotal || 0).toFixed(2)}</div>
                  </div>
                </div>
              </div>

              {/* Protocol Treasury Movement History Graph on Overview */}
              <TreasuryMovementChart />

              {/* Regulatory & Compliance Audit Log Export Section */}
              <div className="p-6 rounded-2xl bg-[#07101D] border border-white/[0.08] space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div>
                    <h3 className="text-sm font-bold text-white flex items-center gap-2">
                      <FileText className="w-4 h-4 text-[#00CFFF]" />
                      Compliance &amp; Regulatory Audit Reporting
                    </h3>
                    <p className="text-xs text-[#98A2B3] mt-0.5">
                      Export immutable audit events stored in Cloud Firestore (<span className="font-mono text-[#00CFFF]">system_audit_logs</span>) as RFC 4180 compliant CSV files.
                    </p>
                  </div>
                  <button
                    onClick={() => handleExportAuditLogs()}
                    disabled={exportingCsv}
                    className="px-4 py-2 rounded-xl bg-[#00CFFF] hover:bg-[#00CFFF]/90 text-[#05070B] text-xs font-bold flex items-center gap-2 transition-all cursor-pointer shadow-lg shadow-[#00CFFF]/20 shrink-0 self-start sm:self-auto"
                  >
                    {exportingCsv ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />}
                    <span>Export Full Audit Trail (CSV)</span>
                  </button>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 pt-2">
                  <button
                    onClick={() => handleExportAuditLogs('TREASURY_MOVEMENT')}
                    disabled={exportingCsv}
                    className="p-3.5 rounded-xl bg-[#05070B] hover:bg-white/[0.03] border border-[#32D583]/20 hover:border-[#32D583]/40 text-left transition-all cursor-pointer flex flex-col justify-between group"
                  >
                    <div className="flex items-center justify-between text-xs text-[#32D583] font-mono font-bold mb-1">
                      <span>Treasury Movements</span>
                      <Download className="w-3.5 h-3.5 group-hover:translate-y-0.5 transition-transform" />
                    </div>
                    <p className="text-[11px] text-[#98A2B3]">Export inflows, reserve sweeps, and multi-sig movements.</p>
                  </button>

                  <button
                    onClick={() => handleExportAuditLogs('CONFIG_UPDATE')}
                    disabled={exportingCsv}
                    className="p-3.5 rounded-xl bg-[#05070B] hover:bg-white/[0.03] border border-amber-500/20 hover:border-amber-500/40 text-left transition-all cursor-pointer flex flex-col justify-between group"
                  >
                    <div className="flex items-center justify-between text-xs text-amber-400 font-mono font-bold mb-1">
                      <span>Config Changes</span>
                      <Download className="w-3.5 h-3.5 group-hover:translate-y-0.5 transition-transform" />
                    </div>
                    <p className="text-[11px] text-[#98A2B3]">Export economic parameter and threshold adjustments.</p>
                  </button>

                  <button
                    onClick={() => handleExportAuditLogs('FINANCIAL_SETTLEMENT')}
                    disabled={exportingCsv}
                    className="p-3.5 rounded-xl bg-[#05070B] hover:bg-white/[0.03] border border-[#00CFFF]/20 hover:border-[#00CFFF]/40 text-left transition-all cursor-pointer flex flex-col justify-between group"
                  >
                    <div className="flex items-center justify-between text-xs text-[#00CFFF] font-mono font-bold mb-1">
                      <span>Settlement Logs</span>
                      <Download className="w-3.5 h-3.5 group-hover:translate-y-0.5 transition-transform" />
                    </div>
                    <p className="text-[11px] text-[#98A2B3]">Export batch payouts and crypto disbursements.</p>
                  </button>

                  <button
                    onClick={() => handleExportAuditLogs('SECURITY')}
                    disabled={exportingCsv}
                    className="p-3.5 rounded-xl bg-[#05070B] hover:bg-white/[0.03] border border-purple-500/20 hover:border-purple-500/40 text-left transition-all cursor-pointer flex flex-col justify-between group"
                  >
                    <div className="flex items-center justify-between text-xs text-purple-300 font-mono font-bold mb-1">
                      <span>Security &amp; RBAC</span>
                      <Download className="w-3.5 h-3.5 group-hover:translate-y-0.5 transition-transform" />
                    </div>
                    <p className="text-[11px] text-[#98A2B3]">Export circuit breaker actions and admin role elevations.</p>
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* TAB: TREASURY & RESERVES (SENSITIVE AUDITED OPERATIONS) */}
          {activeTab === 'treasury' && (
            <div className="space-y-6">
              {/* Emergency Protocol Circuit Breaker Alert Banner */}
              <div className={`p-6 rounded-2xl border transition-all ${
                circuitBreakerActive
                  ? 'bg-[#F04438]/15 border-[#F04438]/40 shadow-xl shadow-[#F04438]/10'
                  : 'bg-[#07101D] border-white/[0.08]'
              }`}>
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <AlertOctagon className={`w-5 h-5 ${circuitBreakerActive ? 'text-[#F04438] animate-pulse' : 'text-[#FFB020]'}`} />
                      <h2 className="text-sm font-bold text-white">Emergency Protocol Circuit Breaker &amp; Outflow Guard</h2>
                      <span className={`text-[10px] font-mono px-2 py-0.5 rounded font-bold uppercase ${
                        circuitBreakerActive ? 'bg-[#F04438] text-white' : 'bg-[#32D583]/10 text-[#32D583]'
                      }`}>
                        {circuitBreakerActive ? 'HALT ACTIVE' : 'NORMAL STANDBY'}
                      </span>
                    </div>
                    <p className="text-xs text-[#98A2B3] max-w-2xl leading-relaxed">
                      Instantly freezes all automated cryptocurrency withdrawals, batch transactions, and treasury outflows across the network. Requires Super Admin confirmation. All actions are logged immutably into Firestore.
                    </p>
                  </div>

                  <button
                    onClick={handleToggleCircuitBreaker}
                    disabled={actionSubmitting}
                    className={`px-4 py-2.5 rounded-xl font-bold text-xs flex items-center gap-2 transition-all cursor-pointer ${
                      circuitBreakerActive
                        ? 'bg-[#32D583] hover:bg-[#32D583]/90 text-[#05070B]'
                        : 'bg-[#F04438] hover:bg-[#F04438]/90 text-white shadow-lg shadow-[#F04438]/20'
                    }`}
                  >
                    {actionSubmitting ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : circuitBreakerActive ? (
                      <>
                        <ShieldCheck className="w-4 h-4" />
                        <span>Deactivate Circuit Breaker (Resume Outflows)</span>
                      </>
                    ) : (
                      <>
                        <AlertOctagon className="w-4 h-4" />
                        <span>Activate Emergency Circuit Breaker</span>
                      </>
                    )}
                  </button>
                </div>
              </div>

              {/* Protocol Treasury Movement History Line Chart */}
              <TreasuryMovementChart />

              {/* Treasury Settings Grid */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Panel 1: Treasury Addresses */}
                <div className="p-6 rounded-2xl bg-[#07101D] border border-white/[0.08] space-y-4">
                  <div className="flex items-center justify-between pb-3 border-b border-white/[0.06]">
                    <div className="flex items-center gap-2">
                      <Wallet className="w-4 h-4 text-[#00CFFF]" />
                      <h3 className="text-sm font-bold text-white">Treasury Wallet Address Bindings</h3>
                    </div>
                    <span className="text-[10px] font-mono text-[#98A2B3]">Audited &amp; Multi-Sig</span>
                  </div>

                  <div className="space-y-4 text-xs">
                    <div>
                      <label className="block text-[#98A2B3] mb-1 font-medium">Primary Treasury Receiving Address (USDT / BNB)</label>
                      <div className="flex gap-2">
                        <input
                          type="text"
                          value={treasuryAddressInput}
                          onChange={(e) => setTreasuryAddressInput(e.target.value)}
                          className="flex-1 px-3 py-2 bg-[#05070B] border border-white/[0.1] rounded-xl text-white font-mono text-xs outline-none focus:border-[#00CFFF]"
                        />
                        <button
                          onClick={() => handleSaveTreasurySettings('WALLET_ADDRESS')}
                          disabled={actionSubmitting}
                          className="px-3 py-2 bg-[#00CFFF]/10 hover:bg-[#00CFFF]/20 text-[#00CFFF] border border-[#00CFFF]/30 rounded-xl font-bold cursor-pointer transition-colors"
                        >
                          Update
                        </button>
                      </div>
                    </div>

                    <div>
                      <label className="block text-[#98A2B3] mb-1 font-medium">Cold Storage Multi-Sig Sweep Target</label>
                      <div className="flex gap-2">
                        <input
                          type="text"
                          value={coldStorageInput}
                          onChange={(e) => setColdStorageInput(e.target.value)}
                          className="flex-1 px-3 py-2 bg-[#05070B] border border-white/[0.1] rounded-xl text-white font-mono text-xs outline-none focus:border-[#00CFFF]"
                        />
                        <button
                          onClick={() => handleSaveTreasurySettings('COLD_STORAGE')}
                          disabled={actionSubmitting}
                          className="px-3 py-2 bg-[#00CFFF]/10 hover:bg-[#00CFFF]/20 text-[#00CFFF] border border-[#00CFFF]/30 rounded-xl font-bold cursor-pointer transition-colors"
                        >
                          Update
                        </button>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Panel 2: Reserve Buffers & Limits */}
                <div className="p-6 rounded-2xl bg-[#07101D] border border-white/[0.08] space-y-4">
                  <div className="flex items-center justify-between pb-3 border-b border-white/[0.06]">
                    <div className="flex items-center gap-2">
                      <Sliders className="w-4 h-4 text-[#32D583]" />
                      <h3 className="text-sm font-bold text-white">Reserve Thresholds &amp; Auto-Sweep</h3>
                    </div>
                    <span className="text-[10px] font-mono text-[#98A2B3]">Risk Management</span>
                  </div>

                  <div className="space-y-4 text-xs">
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-[#98A2B3] mb-1 font-medium">Hot Wallet Min Buffer (USDT)</label>
                        <input
                          type="number"
                          value={reserveMinInput}
                          onChange={(e) => setReserveMinInput(e.target.value)}
                          className="w-full px-3 py-2 bg-[#05070B] border border-white/[0.1] rounded-xl text-white font-mono text-xs outline-none focus:border-[#32D583]"
                        />
                      </div>
                      <div>
                        <label className="block text-[#98A2B3] mb-1 font-medium">Max Daily Auto-Disburse</label>
                        <input
                          type="number"
                          value={maxDailyDisburseInput}
                          onChange={(e) => setMaxDailyDisburseInput(e.target.value)}
                          className="w-full px-3 py-2 bg-[#05070B] border border-white/[0.1] rounded-xl text-white font-mono text-xs outline-none focus:border-[#32D583]"
                        />
                      </div>
                    </div>

                    <div className="flex items-center justify-between pt-2">
                      <label className="flex items-center gap-2 text-[#98A2B3] cursor-pointer">
                        <input
                          type="checkbox"
                          checked={autoSweepEnabled}
                          onChange={(e) => setAutoSweepEnabled(e.target.checked)}
                          className="rounded bg-[#05070B] border-white/[0.2] text-[#00CFFF]"
                        />
                        <span>Enable Auto-Sweep of Excess Hot Reserves to Cold Storage</span>
                      </label>
                      <button
                        onClick={() => handleSaveTreasurySettings('RESERVE_THRESHOLDS')}
                        disabled={actionSubmitting}
                        className="px-3 py-1.5 bg-[#32D583]/10 hover:bg-[#32D583]/20 text-[#32D583] border border-[#32D583]/30 rounded-xl font-bold cursor-pointer transition-colors"
                      >
                        Save Limits
                      </button>
                    </div>
                  </div>
                </div>
              </div>

              {/* Panel 3: Manual Treasury Sweep & Liquidity Movement */}
              <div className="p-6 rounded-2xl bg-[#07101D] border border-white/[0.08] space-y-4">
                <div className="flex items-center justify-between pb-3 border-b border-white/[0.06]">
                  <div className="flex items-center gap-2">
                    <Send className="w-4 h-4 text-[#FFB020]" />
                    <h3 className="text-sm font-bold text-white">Manual Liquidity Sweep to Cold Multi-Sig Vault</h3>
                  </div>
                  <span className="text-[10px] font-mono text-[#FFB020]">Audited Treasury Movement</span>
                </div>

                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                  <div className="space-y-1">
                    <p className="text-xs text-[#98A2B3]">
                      Rebalances the protocol hot wallet by sweeping surplus liquidity to cold multi-sig vault. Triggers `TREASURY_HOT_WALLET_SWEEP_EXECUTED` in Firestore audit log.
                    </p>
                    <div className="text-[11px] font-mono text-[#32D583]">
                      Target: {coldStorageInput}
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <div className="relative">
                      <span className="absolute left-3 top-2.5 text-xs text-[#98A2B3] font-mono">$</span>
                      <input
                        type="number"
                        value={sweepAmountInput}
                        onChange={(e) => setSweepAmountInput(e.target.value)}
                        className="pl-7 pr-3 py-2 bg-[#05070B] border border-white/[0.1] rounded-xl text-white font-mono text-xs outline-none w-36"
                        placeholder="Amount"
                      />
                    </div>
                    <button
                      onClick={handleExecuteTreasurySweep}
                      disabled={actionSubmitting}
                      className="px-4 py-2 bg-[#FFB020] hover:bg-[#FFB020]/90 text-[#05070B] font-bold text-xs rounded-xl flex items-center gap-1.5 transition-colors cursor-pointer"
                    >
                      <Send className="w-3.5 h-3.5" />
                      <span>Execute Sweep</span>
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* TAB: KYC VERIFICATION HUB */}
          {activeTab === 'kyc' && (
            <KYCManagement
              adminEmail={user?.email}
              onLogAction={(action, targetType, targetId, details) => {
                logAction({
                  userUid: (user as any)?.uid || (user as any)?.publicId || 'ADMIN',
                  actorEmail: user?.email || 'admin@phivonex.com',
                  actionType: action,
                  category: 'KYC_REVIEW',
                  targetType,
                  targetId,
                  details,
                });
              }}
            />
          )}

          {/* TAB: FINANCIAL RECONCILIATION */}
          {activeTab === 'reconciliation' && <FinancialReconciliationView />}

          {/* TAB 2: ECONOMIC CONTROLS */}
          {activeTab === 'economics' && <EconomicControls />}

          {/* TAB: PROMOTIONAL OFFERS & BOGO */}
          {activeTab === 'offers' && (
            <OffersManagement
              adminEmail={user?.email}
              onLogAction={(action, targetType, targetId, details) => {
                logAction({
                  userUid: (user as any)?.uid || (user as any)?.publicId || 'ADMIN',
                  actorEmail: user?.email || 'admin@phivonex.com',
                  actionType: action,
                  category: 'CONFIG_UPDATE',
                  targetType,
                  targetId,
                  details,
                });
              }}
            />
          )}

          {/* TAB: SEQUENTIAL PROMOTION & LEADERSHIP RANKS */}
          {activeTab === 'ranks' && <LeadershipRankControl />}

          {/* TAB 3: USERS (WITH SENSITIVE AUDITED ACTIONS) */}
          {activeTab === 'users' && (
            <div className="p-6 rounded-2xl bg-[#07101D] border border-white/[0.08] space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-white/[0.08]">
                <div>
                  <h2 className="text-sm font-bold text-white">System User Accounts &amp; RBAC Control</h2>
                  <p className="text-xs text-[#98A2B3]">
                    Administrative modifications (account lock, unlock, role changes) are strictly logged with administrator identity and reason.
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    placeholder="Search name, email, public ID..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="px-3 py-1.5 bg-[#05070B] border border-white/[0.1] rounded-lg text-xs text-white outline-none w-64"
                  />
                  <select
                    value={statusFilter}
                    onChange={(e) => setStatusFilter(e.target.value)}
                    className="px-3 py-1.5 bg-[#05070B] border border-white/[0.1] rounded-lg text-xs text-white outline-none"
                  >
                    <option value="ALL">All Statuses</option>
                    <option value="ACTIVE">Active</option>
                    <option value="LOCKED">Locked</option>
                  </select>
                </div>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="text-[#98A2B3] border-b border-white/[0.06] uppercase text-[10px] font-mono">
                      <th className="py-2.5 px-3">Public ID</th>
                      <th className="py-2.5 px-3">Full Name</th>
                      <th className="py-2.5 px-3">Email</th>
                      <th className="py-2.5 px-3">Status</th>
                      <th className="py-2.5 px-3">Role</th>
                      <th className="py-2.5 px-3">Sponsor</th>
                      <th className="py-2.5 px-3">Active Nodes</th>
                      <th className="py-2.5 px-3">Joined</th>
                      <th className="py-2.5 px-3 text-right">Audited Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/[0.04]">
                    {usersList.map((u) => (
                      <tr key={u.id} className="hover:bg-white/[0.02]">
                        <td className="py-3 px-3 font-mono font-bold text-white">{u.publicId}</td>
                        <td className="py-3 px-3 text-white font-medium">{u.fullName}</td>
                        <td className="py-3 px-3 text-[#98A2B3]">{u.email}</td>
                        <td className="py-3 px-3">
                          <span className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold ${u.status === 'ACTIVE' ? 'bg-[#32D583]/10 text-[#32D583]' : 'bg-[#F04438]/10 text-[#F04438]'}`}>
                            {u.status}
                          </span>
                        </td>
                        <td className="py-3 px-3 font-mono text-[11px] text-[#00CFFF]">{u.role}</td>
                        <td className="py-3 px-3 font-mono text-[#98A2B3]">{u.sponsorPublicId || 'None'}</td>
                        <td className="py-3 px-3 font-mono font-bold text-white">{u.nodeCount}</td>
                        <td className="py-3 px-3 text-[#98A2B3]">{new Date(u.createdAt).toLocaleDateString()}</td>
                        <td className="py-3 px-3 text-right">
                          <div className="flex items-center justify-end gap-1.5">
                            <button
                              onClick={() => setSelectedUser360Id(u.id)}
                              className="px-2.5 py-1 rounded bg-[#00CFFF] hover:bg-[#00b8e6] text-slate-950 text-[10px] font-bold flex items-center gap-1 cursor-pointer shadow"
                              title="Open User 360° View & Wallet Control"
                            >
                              <User className="w-3 h-3" /> View 360°
                            </button>

                            <button
                              onClick={() => handleOpenUserEditModal(u)}
                              className="px-2 py-1 rounded bg-[#00CFFF]/10 hover:bg-[#00CFFF]/20 text-[#00CFFF] text-[10px] font-bold border border-[#00CFFF]/30 flex items-center gap-1 cursor-pointer"
                              title="Edit user profile safe fields (Audited)"
                            >
                              <Edit3 className="w-3 h-3" /> Edit
                            </button>

                            {u.status === 'ACTIVE' ? (
                              <button
                                onClick={() => setSelectedUserAction({ user: u, action: 'LOCK' })}
                                className="px-2 py-1 rounded bg-[#F04438]/10 hover:bg-[#F04438]/20 text-[#F04438] text-[10px] font-bold border border-[#F04438]/30 flex items-center gap-1 cursor-pointer"
                                title="Lock account (Audited)"
                              >
                                <Lock className="w-3 h-3" /> Lock
                              </button>
                            ) : (
                              <button
                                onClick={() => setSelectedUserAction({ user: u, action: 'UNLOCK' })}
                                className="px-2 py-1 rounded bg-[#32D583]/10 hover:bg-[#32D583]/20 text-[#32D583] text-[10px] font-bold border border-[#32D583]/30 flex items-center gap-1 cursor-pointer"
                                title="Unlock account (Audited)"
                              >
                                <Unlock className="w-3 h-3" /> Unlock
                              </button>
                            )}

                            {u.role === 'ADMIN' ? (
                              <button
                                onClick={() => setSelectedUserAction({ user: u, action: 'SET_ROLE_USER' })}
                                className="px-2 py-1 rounded bg-white/[0.05] hover:bg-white/[0.1] text-[#98A2B3] text-[10px] font-mono border border-white/[0.1] cursor-pointer"
                                title="Demote to standard user"
                              >
                                Demote
                              </button>
                            ) : (
                              <button
                                onClick={() => setSelectedUserAction({ user: u, action: 'SET_ROLE_MANAGER' })}
                                className="px-2 py-1 rounded bg-[#00CFFF]/10 hover:bg-[#00CFFF]/20 text-[#00CFFF] text-[10px] font-mono border border-[#00CFFF]/30 cursor-pointer"
                                title="Promote to admin role"
                              >
                                Elevate
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* TAB 3: WITHDRAWALS (STATE MANAGEMENT & SETTLEMENT CONTROL) */}
          {activeTab === 'withdrawals' && (
            <WithdrawalManagement
              summaryMetrics={summary}
              onRefreshSummary={fetchAdminData}
            />
          )}

          {/* TAB 3.5: DEDICATED WITHDRAWAL STATE TRANSITION LOGS */}
          {activeTab === 'withdrawal-logs' && (
            <WithdrawalStateLogsView />
          )}

          {/* TAB 4: TRANSACTIONS (LEDGER EXPLORER) */}
          {activeTab === 'transactions' && (
            <div className="p-6 rounded-2xl bg-[#07101D] border border-white/[0.08] space-y-4">
              <h2 className="text-sm font-bold text-white">System Financial Ledger Explorer</h2>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="text-[#98A2B3] border-b border-white/[0.06] uppercase text-[10px] font-mono">
                      <th className="py-2.5 px-3">Txn ID</th>
                      <th className="py-2.5 px-3">User</th>
                      <th className="py-2.5 px-3">Type</th>
                      <th className="py-2.5 px-3">Source</th>
                      <th className="py-2.5 px-3">Amount</th>
                      <th className="py-2.5 px-3">Description</th>
                      <th className="py-2.5 px-3">Date</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/[0.04]">
                    {transactionsList.map((t) => (
                      <tr key={t.id} className="hover:bg-white/[0.02]">
                        <td className="py-3 px-3 font-mono font-bold text-white">{t.publicTxnId}</td>
                        <td className="py-3 px-3 font-mono text-[#00CFFF]">{t.userPublicId}</td>
                        <td className="py-3 px-3 font-mono text-[11px]">
                          <span className={`px-2 py-0.5 rounded ${t.entryType === 'CREDIT' ? 'bg-[#32D583]/10 text-[#32D583]' : 'bg-[#F04438]/10 text-[#F04438]'}`}>
                            {t.entryType}
                          </span>
                        </td>
                        <td className="py-3 px-3 font-mono text-[#98A2B3]">{t.sourceType}</td>
                        <td className="py-3 px-3 font-mono font-bold text-white">${t.amount.toFixed(2)}</td>
                        <td className="py-3 px-3 text-[#98A2B3]">{t.description}</td>
                        <td className="py-3 px-3 text-[#98A2B3] font-mono">{new Date(t.createdAt).toLocaleDateString()}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {activeTab === 'diagnostics' && (
            <ReconciliationReport />
          )}

          {/* TAB 5: AUDIT LOGS */}
          {activeTab === 'audit' && <AdminAuditLog />}

          {/* TAB 6: COMMUNICATIONS & EMAIL AUTOMATION */}
          {activeTab === 'communications' && <AdminCommunicationsHub />}

          {/* TAB 7: SUPPORT CENTER & TICKET INBOX */}
          {activeTab === 'support' && (
            <div className="p-8 rounded-2xl bg-[#07101D] border border-white/[0.08] text-center text-slate-400">
              <HelpCircle className="w-12 h-12 mx-auto mb-3 text-slate-500" />
              <h3 className="text-lg font-bold text-white mb-1">Support Management</h3>
              <p className="text-xs">Support Center is currently operating under standard platform channel guidelines.</p>
            </div>
          )}
        </main>
      </div>

      {/* Sensitive User Action Confirmation Modal */}
      {selectedUserAction && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="p-6 rounded-2xl bg-[#07101D] border border-white/[0.1] shadow-2xl max-w-md w-full space-y-4 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-[#FFB020]/10 border border-[#FFB020]/30 flex items-center justify-center text-[#FFB020]">
                <Key className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-white">Confirm Sensitive Operator Action</h3>
                <p className="text-[11px] text-[#98A2B3]">Action: {selectedUserAction.action} on {selectedUserAction.user.publicId}</p>
              </div>
            </div>

            <p className="text-xs text-[#98A2B3]">
              This operation will modify administrative RBAC or account privileges and is permanently stored in Firestore <span className="font-mono text-[#00CFFF]">system_audit_logs</span>.
            </p>

            <div>
              <label className="block text-xs text-[#98A2B3] mb-1 font-medium">Audit Reason / Justification (Required)</label>
              <textarea
                value={actionReason}
                onChange={(e) => setActionReason(e.target.value)}
                placeholder="e.g. Compliance review, suspicious pattern, role upgrade requested..."
                className="w-full h-20 p-2.5 bg-[#05070B] border border-white/[0.1] rounded-xl text-xs text-white outline-none focus:border-[#00CFFF]"
              />
            </div>

            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                onClick={() => {
                  setSelectedUserAction(null);
                  setActionReason('');
                }}
                disabled={actionSubmitting}
                className="px-3.5 py-2 rounded-xl bg-white/[0.05] hover:bg-white/[0.1] text-white text-xs font-semibold cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={handleConfirmUserAction}
                disabled={actionSubmitting}
                className="px-4 py-2 rounded-xl bg-[#00CFFF] hover:bg-[#00CFFF]/90 text-[#05070B] text-xs font-bold flex items-center gap-2 cursor-pointer shadow-lg shadow-[#00CFFF]/20"
              >
                {actionSubmitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                <span>Confirm &amp; Log to Firestore</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Edit User Profile Safe Fields Modal */}
      {editingUser && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="p-6 rounded-2xl bg-[#07101D] border border-white/[0.12] shadow-2xl max-w-lg w-full space-y-4 max-h-[90vh] overflow-y-auto animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between pb-3 border-b border-white/[0.08]">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-[#00CFFF]/10 border border-[#00CFFF]/30 flex items-center justify-center text-[#00CFFF]">
                  <Edit3 className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-white">Edit Profile: {editingUser.publicId}</h3>
                  <p className="text-[11px] text-[#98A2B3]">{editingUser.email}</p>
                </div>
              </div>
              <button
                onClick={() => setEditingUser(null)}
                className="text-[#98A2B3] hover:text-white text-lg p-1"
              >
                &times;
              </button>
            </div>

            <div className="p-3 rounded-xl bg-[#05070B] border border-white/[0.06] text-[11px] text-[#98A2B3]">
              <strong className="text-white">Security Invariant:</strong> Financial ledgers, wallet balances, node purchases, earned commissions, and historical ledger entries are strictly immutable and cannot be altered via user profile editing.
            </div>

            <div className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-white mb-1">Full Name</label>
                <input
                  type="text"
                  value={editUserFullName}
                  onChange={(e) => setEditUserFullName(e.target.value)}
                  className="w-full px-3 py-2 bg-[#05070B] border border-white/[0.12] rounded-xl text-xs text-white outline-none focus:border-[#00CFFF]"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-white mb-1">Country</label>
                  <input
                    type="text"
                    value={editUserCountry}
                    onChange={(e) => setEditUserCountry(e.target.value)}
                    className="w-full px-3 py-2 bg-[#05070B] border border-white/[0.12] rounded-xl text-xs text-white outline-none focus:border-[#00CFFF]"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-white mb-1">Mobile / Phone</label>
                  <input
                    type="text"
                    value={editUserPhone}
                    onChange={(e) => setEditUserPhone(e.target.value)}
                    className="w-full px-3 py-2 bg-[#05070B] border border-white/[0.12] rounded-xl text-xs text-white outline-none focus:border-[#00CFFF]"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-white mb-1">Account Status</label>
                <select
                  value={editUserStatus}
                  onChange={(e) => setEditUserStatus(e.target.value as any)}
                  className="w-full px-3 py-2 bg-[#05070B] border border-white/[0.12] rounded-xl text-xs text-white outline-none"
                >
                  <option value="ACTIVE">ACTIVE (Operational)</option>
                  <option value="LOCKED">LOCKED (Administrative Lock)</option>
                  <option value="SUSPENDED">SUSPENDED (Restricted)</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-white mb-1">Audit Reason / Justification (Required)</label>
                <input
                  type="text"
                  placeholder="e.g. Identity verification update, contact correction..."
                  value={editUserReason}
                  onChange={(e) => setEditUserReason(e.target.value)}
                  className="w-full px-3 py-2 bg-[#05070B] border border-white/[0.12] rounded-xl text-xs text-white outline-none focus:border-[#00CFFF]"
                />
              </div>
            </div>

            <div className="flex items-center justify-end gap-3 pt-2 border-t border-white/[0.08]">
              <button
                type="button"
                onClick={() => setEditingUser(null)}
                disabled={savingUserEdit}
                className="px-4 py-2 rounded-xl bg-white/[0.08] hover:bg-white/[0.12] text-white text-xs font-bold cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSaveUserEdit}
                disabled={savingUserEdit}
                className="px-5 py-2 rounded-xl bg-[#00CFFF] hover:bg-[#00CFFF]/90 text-[#05070B] text-xs font-extrabold flex items-center gap-2 cursor-pointer shadow-lg active:scale-95"
              >
                {savingUserEdit ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    <span>Saving Profile...</span>
                  </>
                ) : (
                  <>
                    <Check className="w-3.5 h-3.5" />
                    <span>Save &amp; Log Audit</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* USER 360 COMPREHENSIVE VIEW OVERLAY */}
      {selectedUser360Id && (
        <User360View
          userId={selectedUser360Id}
          onClose={() => setSelectedUser360Id(null)}
          onUserUpdated={fetchAdminData}
        />
      )}
    </div>
  );
};
