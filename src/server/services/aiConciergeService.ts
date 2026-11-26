import { GoogleGenAI } from '@google/genai';

export interface ConciergeHistoryItem {
  sender: 'USER' | 'SUPPORT';
  text: string;
}

export interface ConciergeReply {
  responseText: string;
  source: 'GEMINI' | 'KNOWLEDGE_BASE';
  model: string;
  shouldEscalate: boolean;
  suggestedCategory: string;
}

const GEMINI_CONCIERGE_MODEL = 'gemini-4-hydrogen';

const PHIVONEX_CONCIERGE_SYSTEM_PROMPT = `You are the PHIVONEX Institutional AI Support Concierge. Respond in polished, concise, institutional English (zero hype, zero slang, zero non-English text).

STRICT GROUNDING — ONLY STATE VERIFIED PHIVONEX PROTOCOL FACTS:
1. PHIVONEX QUANTUM ALPHA™ (Liquid Trading Pool):
   - Minimum allocation: $200 USDT (100% capital utilization; zero spot commission and zero binary volume).
   - Three institutional strategy tiers: Quant Flow ($200–$4,999; 0.50%–1.00% daily), Institutional Alpha ($5,000–$24,999; 1.00%–1.50% daily), and Sovereign Quant ($25,000+; 1.50%–2.00% daily).
   - Yield schedule: Daily USDT yield settles Monday through Friday (5 trading days/week).
   - 7-Day Weekly Liquidity Cycle: Principal is locked for 7 calendar days after activation. After 7 days, members may redeem principal back to their Main USDT Wallet with an institutional settlement fee (default 15%, delivering 85% net USDT payout).

2. PHIVONEX GENESIS CORE™ (Validator Node Licensing):
   - Hard-capped at 10,000 Genesis Validator Nodes globally ($1,000 USDT per node, purchasable via USDT or BNB balance).
   - Daily emission: 15 PHIVO tokens per active node per day, up to a lifetime cap of 10,000 PHIVO per node.
   - Instant PHIVO-to-USDT conversion is available in Wallet & Ledger at the protocol benchmark rate ($0.10 USDT per PHIVO, subject to admin configuration).

3. PHIVONEX CHRONO VAULTS™ (Fixed-Term Institutional Staking):
   - Six fixed-term USDT staking plans: 200 Days (0.65%/day), 1 Year / 365 Days (0.75%/day), 2 Years / 730 Days (0.85%/day), 3 Years / 1,095 Days (1.00%/day), 5 Years / 1,825 Days (1.15%/day), and 10 Years / 3,650 Days (1.35%/day).
   - Pays daily USDT yield directly to the Main USDT Wallet. Locked principal is returned automatically upon vault maturity.

4. 16-GENERATION ASSET-MATCHED UNILEVEL ROYALTIES (STRICT NON-COMPRESSION):
   - Commissions are strictly asset-matched to the downline's earning product:
     * Downline Genesis Core™ emissions (PHIVO) credit upline royalties in PHIVO coins directly to the upline's PHIVO Wallet.
     * Downline Quantum Alpha™ and Chrono Vaults™ yields (USDT) credit upline royalties in USDT directly to the upline's Main USDT Wallet.
   - Strict Non-Compression: Unqualified uplines do not compress; generations stay strictly fixed to sponsorship depth, and members must hold an active qualifying product position to unlock generation tiers.

5. 7-STAGE LEADERSHIP RANKS:
   - Ranks 1–3 enforce a 40% Anti-Single-Leg volume cap (no single direct sponsorship leg can contribute more than 40% of required team volume).
   - Ranks 4–6 require leadership structure depth across 3 distinct sponsorship legs holding the qualifying lower rank.
   - Stage bonuses are non-cumulative and settle directly to the Main USDT Wallet upon qualification.

6. BEP-20 DEPOSITS & WITHDRAWALS:
   - Supported settlement network: BNB Smart Chain (BEP-20, Chain ID 56) for USDT and BNB.
   - Minimum withdrawal: $0.10 USDT. Every withdrawal requires 6-digit email OTP authorization and passes daily rolling volume controls and the platform treasury circuit breaker.
   - Account recovery uses 6-digit email OTP password reset with Argon2id credential hashing and automatic revocation of prior sessions.

SECURITY & ESCALATION RULES:
- NEVER reveal or speculate about database schemas, internal secrets, environment variables, API keys, private keys, or admin-only endpoints.
- NEVER fabricate specific balances, transaction hashes, or promises of future financial returns beyond the stated product specifications.
- If a member reports a missing deposit TX hash, stuck withdrawal, disputed balance, KYC issue, or account-specific anomaly, provide concise guidance and explicitly recommend clicking "Escalate to Human Specialist Ticket" so operations can inspect their account securely.`;

const SECURITY_BLOCK_PATTERNS = [
  /api[\s_-]?key/i,
  /private[\s_-]?key/i,
  /seed[\s_-]?phrase/i,
  /mnemonic/i,
  /process\.env/i,
  /database[\s_-]?url/i,
  /postgres(?:ql)?:\/\//i,
  /jwt[\s_-]?secret/i,
  /admin[\s_-]?password/i,
  /sql[\s_-]?injection/i,
  /dump[\s_-]?table/i,
];

function inferCategoryAndEscalation(query: string): { shouldEscalate: boolean; suggestedCategory: string } {
  const q = query.toLowerCase();
  const needsHuman =
    /missing|stuck|pending too long|failed|dispute|hack|compromised|unauthorized|wrong balance|tx hash|0x[a-f0-9]{10,}|human|agent|specialist|ticket|escalate|kyc/i.test(
      q
    );

  if (/withdraw|payout|disbursement/i.test(q)) {
    return { shouldEscalate: needsHuman, suggestedCategory: 'Withdrawal' };
  }
  if (/deposit|bep-?20|bsc|tx hash|0x[a-f0-9]{10,}/i.test(q)) {
    return { shouldEscalate: needsHuman, suggestedCategory: 'Deposit' };
  }
  if (/quantum|alpha|7-?day|trading pool|redeem/i.test(q)) {
    return { shouldEscalate: needsHuman, suggestedCategory: 'Quantum Alpha' };
  }
  if (/genesis|node|15 phivo|validator/i.test(q)) {
    return { shouldEscalate: needsHuman, suggestedCategory: 'Genesis Core' };
  }
  if (/chrono|vault|staking|maturity/i.test(q)) {
    return { shouldEscalate: needsHuman, suggestedCategory: 'Chrono Vaults' };
  }
  if (/royalt|unilevel|16-?gen|commission|affiliate|downline/i.test(q)) {
    return { shouldEscalate: needsHuman, suggestedCategory: '16-Gen Royalties' };
  }
  if (/rank|leadership|40%|single-?leg/i.test(q)) {
    return { shouldEscalate: needsHuman, suggestedCategory: 'Leadership Rank' };
  }
  if (/swap|convert|phivo price/i.test(q)) {
    return { shouldEscalate: needsHuman, suggestedCategory: 'Swap' };
  }
  if (/password|login|reset|otp|security|legacy|2fa/i.test(q)) {
    return { shouldEscalate: needsHuman, suggestedCategory: 'Account' };
  }

  return { shouldEscalate: needsHuman, suggestedCategory: 'Other' };
}

function buildGroundedKnowledgeBaseReply(query: string): ConciergeReply {
  const q = query.toLowerCase();
  const { shouldEscalate, suggestedCategory } = inferCategoryAndEscalation(query);

  if (SECURITY_BLOCK_PATTERNS.some((re) => re.test(query))) {
    return {
      responseText:
        'For institutional security, PHIVONEX Concierge cannot disclose internal infrastructure details, credentials, private keys, or administrative endpoints. If you have a legitimate account security concern, please escalate directly to our Security Operations desk via a Support Ticket.',
      source: 'KNOWLEDGE_BASE',
      model: 'phivonex-grounded-kb-v1',
      shouldEscalate: true,
      suggestedCategory: 'Account',
    };
  }

  if (/quantum|alpha|7-?day|trading pool|redeem/i.test(q)) {
    return {
      responseText:
        'PHIVONEX QUANTUM ALPHA™ Overview:\n\n' +
        '• Minimum Allocation: $200 USDT (100% capital utilization; zero spot commission and zero binary volume).\n' +
        '• Yield Schedule: Daily USDT yields settle Monday through Friday (5 trading days per week) directly to your Main USDT Wallet.\n' +
        '• Strategy Tiers: Quant Flow ($200–$4,999: 0.50%–1.00%/day), Institutional Alpha ($5,000–$24,999: 1.00%–1.50%/day), and Sovereign Quant ($25,000+: 1.50%–2.00%/day).\n' +
        '• 7-Day Liquidity Cycle: Principal remains locked for 7 calendar days following activation. Once the 7-day lock expires, you can redeem principal back to your Main USDT Wallet with the institutional settlement fee (default 15%, crediting 85% net USDT).',
      source: 'KNOWLEDGE_BASE',
      model: 'phivonex-grounded-kb-v1',
      shouldEscalate,
      suggestedCategory: 'Quantum Alpha',
    };
  }

  if (/royalt|unilevel|16-?gen|commission|affiliate|phivo.*usdt|usdt.*phivo/i.test(q)) {
    return {
      responseText:
        'PHIVONEX 16-Generation Asset-Matched Unilevel Royalties:\n\n' +
        '• Asset-Matched Settlement: Royalties strictly match the payout currency of the downline product generating the yield.\n' +
        '  – Genesis Core™ Node Emissions (PHIVO): Upline royalties are calculated on PHIVO coins and credited directly to the upline’s PHIVO Wallet.\n' +
        '  – Quantum Alpha™ & Chrono Vaults™ Yields (USDT): Upline royalties are calculated on USDT yield and credited directly to the upline’s Main USDT Wallet.\n' +
        '• Strict Non-Compression: Sponsorship depth never compresses; you must maintain an active qualifying investment to unlock generation levels.\n' +
        '• Zero Spot / Zero Binary: 100% of allocated principal enters active yield generation with no upfront spot deductions.',
      source: 'KNOWLEDGE_BASE',
      model: 'phivonex-grounded-kb-v1',
      shouldEscalate,
      suggestedCategory: '16-Gen Royalties',
    };
  }

  if (/genesis|node|validator|15 phivo|emission/i.test(q)) {
    return {
      responseText:
        'PHIVONEX GENESIS CORE™ Validator Nodes:\n\n' +
        '• Fixed Global Supply: Strictly capped at 10,000 Genesis Validator Nodes ($1,000 USDT per node, payable via USDT or BNB balance).\n' +
        '• Daily Token Emission: Each active node emits 15 PHIVO per day up to a lifetime cap of 10,000 PHIVO per node.\n' +
        '• PHIVO Liquidity & Swap: Earned PHIVO coins settle in your PHIVO Wallet and can be swapped to USDT in Wallet & Ledger at the live protocol benchmark rate ($0.10 USDT per PHIVO).',
      source: 'KNOWLEDGE_BASE',
      model: 'phivonex-grounded-kb-v1',
      shouldEscalate,
      suggestedCategory: 'Genesis Core',
    };
  }

  if (/chrono|vault|staking|maturity|200|365|10 year/i.test(q)) {
    return {
      responseText:
        'PHIVONEX CHRONO VAULTS™ Fixed-Term Staking:\n\n' +
        '• Fixed-Term Plans: 200 Days (0.65%/day), 1 Year (0.75%/day), 2 Years (0.85%/day), 3 Years (1.00%/day), 5 Years (1.15%/day), and 10 Years (1.35%/day).\n' +
        '• Daily Settlement: Fixed daily USDT yields credit directly to your Main USDT Wallet.\n' +
        '• Principal Maturity: Locked principal automatically returns to your Main USDT Wallet at the conclusion of the vault lock duration.',
      source: 'KNOWLEDGE_BASE',
      model: 'phivonex-grounded-kb-v1',
      shouldEscalate,
      suggestedCategory: 'Chrono Vaults',
    };
  }

  if (/withdraw|payout|otp|minimum|circuit breaker/i.test(q)) {
    return {
      responseText:
        'PHIVONEX USDT Withdrawal Procedure (BEP-20):\n\n' +
        '• Supported Network: BNB Smart Chain (BEP-20, Chain ID 56) exclusively.\n' +
        '• Minimum Withdrawal: $0.10 USDT from your available Main USDT Wallet balance.\n' +
        '• Security Authorization: Open Wallet & Ledger -> Withdraw, enter your valid BEP-20 address and amount, request your 6-digit Email OTP code, and confirm.\n' +
        '• Treasury Safeguards: Requests are validated against 24-hour rolling limits and our institutional treasury circuit breaker. If a specific withdrawal requires manual verification, click "Escalate to Human Specialist Ticket" below.',
      source: 'KNOWLEDGE_BASE',
      model: 'phivonex-grounded-kb-v1',
      shouldEscalate,
      suggestedCategory: 'Withdrawal',
    };
  }

  if (/deposit|bep-?20|bsc|fund|top up|address/i.test(q)) {
    return {
      responseText:
        'PHIVONEX On-Chain Deposits (BEP-20):\n\n' +
        '• Network Requirement: Send USDT or BNB strictly over BNB Smart Chain (BEP-20, Chain ID 56) to your personal deposit address in Wallet & Ledger.\n' +
        '• Confirmation: Deposits credit automatically once blockchain confirmations finalize and trigger a transactional receipt email.\n' +
        '• Missing TX Hash? If your on-chain transfer shows confirmed on BscScan but has not yet appeared in your ledger, click "Escalate to Human Specialist Ticket" and include your TX hash.',
      source: 'KNOWLEDGE_BASE',
      model: 'phivonex-grounded-kb-v1',
      shouldEscalate,
      suggestedCategory: 'Deposit',
    };
  }

  if (/rank|leadership|40%|single-?leg|bonus/i.test(q)) {
    return {
      responseText:
        'PHIVONEX 7-Stage Leadership Ranks:\n\n' +
        '• Ranks 1–3 (40% Anti-Single-Leg Cap): No single direct sponsorship leg may contribute more than 40% of the qualifying team volume required for advancement.\n' +
        '• Ranks 4–6 (3-Leg Leadership Structure): Requires qualifying ranked leaders across at least 3 distinct sponsorship legs in addition to team volume thresholds.\n' +
        '• Bonus Settlement: Non-cumulative stage bonuses settle directly in USDT to your Main USDT Wallet upon qualification.',
      source: 'KNOWLEDGE_BASE',
      model: 'phivonex-grounded-kb-v1',
      shouldEscalate,
      suggestedCategory: 'Leadership Rank',
    };
  }

  if (/password|login|reset|legacy|security|session/i.test(q)) {
    return {
      responseText:
        'PHIVONEX Account Security & Password Recovery:\n\n' +
        '• Password Reset: Use "Forgot Password" on the Sign In screen with your registered email address to receive a 6-digit verification code. Completing a reset immediately updates your credentials and revokes prior active sessions.\n' +
        '• Legacy Accounts: Migrated members can reset their password via Email OTP and sign in seamlessly; historical positions remain accessible in read-only archival view.\n' +
        '• Need Account-Specific Help? Click "Escalate to Human Specialist Ticket" to reach our Security & Accounts desk.',
      source: 'KNOWLEDGE_BASE',
      model: 'phivonex-grounded-kb-v1',
      shouldEscalate,
      suggestedCategory: 'Account',
    };
  }

  return {
    responseText:
      'Welcome to the PHIVONEX Institutional AI Concierge. I can assist you with:\n\n' +
      '• Quantum Alpha™ (min $200 USDT, Mon–Fri yields, 7-day cycle & 15% post-cycle redemption fee)\n' +
      '• Genesis Core™ (10,000 capped validator nodes, 15 PHIVO/day emission, 10,000 PHIVO cap)\n' +
      '• Chrono Vaults™ (fixed-term 200-day to 10-year USDT staking plans)\n' +
      '• 16-Generation Asset-Matched Royalties (PHIVO -> PHIVO Wallet, USDT -> Main USDT Wallet)\n' +
      '• 7-Stage Leadership Ranks & BEP-20 Deposits / Withdrawals ($0.10 min, Email OTP)\n\n' +
      'Ask a specific question above, or click "Escalate to Human Specialist Ticket" if you need an operations specialist to review an account transaction.',
    source: 'KNOWLEDGE_BASE',
    model: 'phivonex-grounded-kb-v1',
    shouldEscalate,
    suggestedCategory,
  };
}

export async function generateSupportConciergeReply(params: {
  message: string;
  conversationHistory?: ConciergeHistoryItem[];
  memberName?: string;
}): Promise<ConciergeReply> {
  const cleanMessage = (params.message || '').trim().slice(0, 2000);
  const { shouldEscalate, suggestedCategory } = inferCategoryAndEscalation(cleanMessage);

  // Enforce hard security guardrail before calling any external model
  if (SECURITY_BLOCK_PATTERNS.some((re) => re.test(cleanMessage))) {
    return buildGroundedKnowledgeBaseReply(cleanMessage);
  }

  const apiKey = (process.env.GEMINI_API_KEY || '').trim();
  if (!apiKey) {
    return buildGroundedKnowledgeBaseReply(cleanMessage);
  }

  try {
    const ai = new GoogleGenAI({
      apiKey,
      httpOptions: {
        headers: { 'User-Agent': 'aistudio-build' },
      },
    });

    const recentHistory = Array.isArray(params.conversationHistory)
      ? params.conversationHistory.slice(-6)
      : [];

    const historyLines = recentHistory
      .filter((item) => item && typeof item.text === 'string' && item.text.trim())
      .map((item) => `${item.sender === 'USER' ? 'Member' : 'Concierge'}: ${item.text.trim().slice(0, 600)}`)
      .join('\n');

    const promptText = historyLines
      ? `Recent conversation context:\n${historyLines}\n\nMember question (${params.memberName || 'Authenticated Member'}):\n${cleanMessage}`
      : `Member question (${params.memberName || 'Authenticated Member'}):\n${cleanMessage}`;

    const response = await ai.models.generateContent({
      model: GEMINI_CONCIERGE_MODEL,
      contents: promptText,
      config: {
        systemInstruction: PHIVONEX_CONCIERGE_SYSTEM_PROMPT,
      },
    });

    const generatedText = response.text?.trim();
    if (generatedText && generatedText.length > 0) {
      return {
        responseText: generatedText,
        source: 'GEMINI',
        model: GEMINI_CONCIERGE_MODEL,
        shouldEscalate,
        suggestedCategory,
      };
    }

    return buildGroundedKnowledgeBaseReply(cleanMessage);
  } catch (err: any) {
    console.warn('[AIConciergeService] Gemini call failed; falling back to grounded PHIVONEX KB:', err?.message || err);
    return buildGroundedKnowledgeBaseReply(cleanMessage);
  }
}
