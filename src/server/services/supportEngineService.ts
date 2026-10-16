import { getDb } from '../db/db';
import {
  SupportUserLiveData,
  getUserLiveDataForSupport,
  createSupportTicket,
  SupportTicket,
  TicketCategory,
  TicketPriority,
} from './supportService';

export interface SmartTicketAnalysis {
  category: TicketCategory;
  priority: TicketPriority;
  suggestedAction: string;
  relevantRecord?: {
    type: 'WITHDRAWAL' | 'DEPOSIT' | 'TRANSACTION' | 'NODE';
    id: string;
    details: string;
  };
  summary: string;
}

/**
 * Analyzes user issue description against their live account data.
 */
export async function analyzeSupportRequest(
  userId: string,
  userMessage: string,
  providedCategory?: string
): Promise<SmartTicketAnalysis> {
  const liveData: SupportUserLiveData = await getUserLiveDataForSupport(userId);
  const msgLower = (userMessage || '').toLowerCase();

  let category: TicketCategory = providedCategory || 'GENERAL';
  let priority: TicketPriority = 'MEDIUM';
  let suggestedAction = 'Reviewing account state';
  let relevantRecord: SmartTicketAnalysis['relevantRecord'];

  if (msgLower.includes('withdraw') || msgLower.includes('payout')) {
    category = 'WITHDRAWAL';
    const pendingW = liveData.recentWithdrawals.find((w: any) => w.status === 'PENDING' || w.status === 'PROCESSING');
    if (pendingW) {
      priority = 'HIGH';
      relevantRecord = {
        type: 'WITHDRAWAL',
        id: pendingW.publicWithdrawalId || pendingW.id,
        details: `Pending withdrawal of $${pendingW.amount} ${pendingW.currency} to ${pendingW.destinationReference}`,
      };
      suggestedAction = 'Check blockchain payout confirmation or pending admin queue';
    }
  } else if (msgLower.includes('deposit') || msgLower.includes('usdt') || msgLower.includes('bnb')) {
    category = 'DEPOSIT';
    const recentD = liveData.recentDeposits.find((d: any) => d.status === 'PENDING' || d.status === 'DETECTED');
    if (recentD) {
      priority = 'HIGH';
      relevantRecord = {
        type: 'DEPOSIT',
        id: recentD.publicDepositId || recentD.id,
        details: `Deposit of ${recentD.amount} ${recentD.asset} (Tx: ${recentD.txHash || 'N/A'})`,
      };
      suggestedAction = 'Track BSC scan confirmation for transaction hash';
    }
  } else if (msgLower.includes('node') || msgLower.includes('reward') || msgLower.includes('mining')) {
    category = 'NODE';
    suggestedAction = `User currently owns ${liveData.activeNodesCount} active Genesis Nodes`;
  }

  return {
    category,
    priority,
    suggestedAction,
    relevantRecord,
    summary: `Live analysis completed for user ${liveData.publicId} (${liveData.email}).`,
  };
}

/**
 * Smart ticket intake: analyzes context and creates ticket with enriched metadata.
 */
export async function createSmartSupportTicket(params: {
  userId: string;
  subject: string;
  userMessage: string;
  category?: string;
  priority?: string;
}): Promise<{ ticket: SupportTicket; analysis: SmartTicketAnalysis }> {
  const analysis = await analyzeSupportRequest(params.userId, params.userMessage, params.category);

  const ticket = await createSupportTicket({
    userId: params.userId,
    subject: params.subject,
    userMessage: params.userMessage,
    category: params.category || analysis.category,
    priority: (params.priority as TicketPriority) || analysis.priority,
  });

  return {
    ticket,
    analysis,
  };
}
