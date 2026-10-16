let passed = 0;
let failed = 0;

function assert(condition: boolean, desc: string, detail?: string) {
  if (condition) {
    console.log(`  [PASS] ${desc}`);
    passed++;
  } else {
    console.error(`  [FAIL] ${desc}${detail ? ` -> ${detail}` : ''}`);
    failed++;
  }
}

async function runLiveHttpTests() {
  console.log('====================================================');
  console.log('PHIVONEX LIVE HTTP API & RUNTIME VERIFICATION');
  console.log('====================================================\n');

  const baseUrl = 'http://localhost:3000';

  // 1. Health & Node Stats (Public)
  console.log('--- 1. Public Endpoints ---');
  const healthRes = await fetch(`${baseUrl}/api/health`);
  assert(healthRes.status === 200, 'GET /api/health returns HTTP 200');

  const statsRes = await fetch(`${baseUrl}/api/nodes/stats`);
  assert(statsRes.status === 200, 'GET /api/nodes/stats returns HTTP 200');
  const statsData = await statsRes.json();
  assert(statsData.genesisCap === 10000, 'Stats genesisCap is exactly 10000');
  assert(
    statsData.available + statsData.reserved + statsData.active + statsData.retired === 10000,
    'Stats total supply matches 10,000 invariant'
  );

  // 2. Auth Flow (Register & Session Cookie)
  console.log('\n--- 2. Auth Flow & Session Verification ---');
  const runId = Date.now().toString().slice(-6);
  const testEmail = `operator_http_${Date.now()}_${Math.floor(Math.random()*10000)}@phivonex.test`;
  const testPhone = `+1${Math.floor(2000000000 + Math.random() * 7000000000)}`;
  const regRes = await fetch(`${baseUrl}/api/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      fullName: 'Alice Operator',
      email: testEmail,
      phone: testPhone,
      country: 'United States',
      password: 'StrongPassword123!',
      confirmPassword: 'StrongPassword123!',
    }),
  });

  assert(regRes.status === 201, `POST /api/auth/register returns HTTP 201 (Status: ${regRes.status})`);
  const regCookie = regRes.headers.get('set-cookie');
  assert(Boolean(regCookie), 'Registration returned session cookie');

  const cookieHeader = regCookie ? regCookie.split(';')[0] : '';

  // 3. Authenticated Endpoints
  console.log('\n--- 3. Authenticated User Endpoints ---');
  const meRes = await fetch(`${baseUrl}/api/auth/me`, {
    headers: { Cookie: cookieHeader },
  });
  assert(meRes.status === 200, 'GET /api/auth/me returns HTTP 200');
  const meData = await meRes.json();
  assert(Boolean(meData.user?.publicId), `User public ID exists (${meData.user?.publicId})`);

  // Nodes Me
  const myNodesRes = await fetch(`${baseUrl}/api/nodes/me`, {
    headers: { Cookie: cookieHeader },
  });
  assert(myNodesRes.status === 200, 'GET /api/nodes/me returns HTTP 200');

  // Network Summary
  const netSummaryRes = await fetch(`${baseUrl}/api/network/summary`, {
    headers: { Cookie: cookieHeader },
  });
  assert(netSummaryRes.status === 200, 'GET /api/network/summary returns HTTP 200');
  const netSummaryData = await netSummaryRes.json();
  assert(typeof netSummaryData.directReferrals === 'number', 'Network summary returns numeric directReferrals');
  assert(typeof netSummaryData.placedMembers === 'number', 'Network summary returns numeric placedMembers');

  // Network Tree
  const netTreeRes = await fetch(`${baseUrl}/api/network/tree?depth=3`, {
    headers: { Cookie: cookieHeader },
  });
  assert(netTreeRes.status === 200, 'GET /api/network/tree returns HTTP 200');
  const treeData = await netTreeRes.json();
  assert(Boolean(treeData.tree?.user?.publicId), 'Network tree returns root user publicId');

  // Network Unplaced
  const netUnplacedRes = await fetch(`${baseUrl}/api/network/unplaced`, {
    headers: { Cookie: cookieHeader },
  });
  assert(netUnplacedRes.status === 200, 'GET /api/network/unplaced returns HTTP 200');

  // Direct Referrals
  const directRefRes = await fetch(`${baseUrl}/api/referrals/direct`, {
    headers: { Cookie: cookieHeader },
  });
  assert(directRefRes.status === 200, 'GET /api/referrals/direct returns HTTP 200');

  // Referral Commissions
  const commMeRes = await fetch(`${baseUrl}/api/referral-commissions/me`, {
    headers: { Cookie: cookieHeader },
  });
  assert(commMeRes.status === 200, 'GET /api/referral-commissions/me returns HTTP 200');
  const commData = await commMeRes.json();
  assert(commData.totalEarnedUsd === 0, 'New user commission total is 0 USD');

  // Task #10: Network Volume Summary
  const volSummaryRes = await fetch(`${baseUrl}/api/network/volume-summary`, {
    headers: { Cookie: cookieHeader },
  });
  assert(volSummaryRes.status === 200, 'GET /api/network/volume-summary returns HTTP 200');
  const volSummaryData = await volSummaryRes.json();
  assert(typeof volSummaryData.businessDate === 'string', 'Volume summary returns businessDate string');
  assert(typeof volSummaryData.today?.left === 'number', 'Volume summary returns numeric today.left');
  assert(typeof volSummaryData.today?.right === 'number', 'Volume summary returns numeric today.right');
  assert(typeof volSummaryData.carry?.left === 'number', 'Volume summary returns numeric carry.left');
  assert(typeof volSummaryData.carry?.right === 'number', 'Volume summary returns numeric carry.right');
  assert(typeof volSummaryData.availableForFutureMatching?.left === 'number', 'Volume summary returns numeric availableForFutureMatching.left');
  assert(typeof volSummaryData.availableForFutureMatching?.right === 'number', 'Volume summary returns numeric availableForFutureMatching.right');

  // Task #10: Network Volume History
  const volHistoryRes = await fetch(`${baseUrl}/api/network/volume-history?page=1&limit=10`, {
    headers: { Cookie: cookieHeader },
  });
  assert(volHistoryRes.status === 200, 'GET /api/network/volume-history returns HTTP 200');
  const volHistoryData = await volHistoryRes.json();
  assert(Array.isArray(volHistoryData.history), 'Volume history returns an array');
  assert(typeof volHistoryData.pagination?.page === 'number', 'Volume history returns pagination object');

  // Task #11: Matching Summary
  const matchSummaryRes = await fetch(`${baseUrl}/api/matching/summary`, {
    headers: { Cookie: cookieHeader },
  });
  assert(matchSummaryRes.status === 200, 'GET /api/matching/summary returns HTTP 200');
  const matchSummaryData = await matchSummaryRes.json();
  assert(typeof matchSummaryData.todayVolume?.left === 'number', 'Matching summary returns todayVolume.left');
  assert(typeof matchSummaryData.todayVolume?.right === 'number', 'Matching summary returns todayVolume.right');
  assert(typeof matchSummaryData.carry?.left === 'number', 'Matching summary returns carry.left');
  assert(typeof matchSummaryData.carry?.right === 'number', 'Matching summary returns carry.right');
  assert(typeof matchSummaryData.totalMatchingEarnedUsd === 'number', 'Matching summary returns totalMatchingEarnedUsd');
  assert(typeof matchSummaryData.nextSettlement?.scheduledTime === 'string', 'Matching summary returns nextSettlement.scheduledTime');

  // Task #11: Matching History
  const matchHistoryRes = await fetch(`${baseUrl}/api/matching/history?page=1&limit=10`, {
    headers: { Cookie: cookieHeader },
  });
  assert(matchHistoryRes.status === 200, 'GET /api/matching/history returns HTTP 200');
  const matchHistoryData = await matchHistoryRes.json();
  assert(Array.isArray(matchHistoryData.history), 'Matching history returns history array');
  assert(typeof matchHistoryData.pagination?.page === 'number', 'Matching history returns pagination object');

  // Task #12: Promotion Bonuses
  const promoRes = await fetch(`${baseUrl}/api/promotions/me`, {
    headers: { Cookie: cookieHeader },
  });
  assert(promoRes.status === 200, 'GET /api/promotions/me returns HTTP 200');
  const promoData = await promoRes.json();
  assert(typeof promoData.currentProgress?.leftUnits === 'number', 'Promotion API returns currentProgress.leftUnits');
  assert(typeof promoData.currentProgress?.rightUnits === 'number', 'Promotion API returns currentProgress.rightUnits');
  assert(Array.isArray(promoData.achievedMilestones), 'Promotion API returns achievedMilestones array');
  assert(typeof promoData.totalPromotionBonusEarned === 'number', 'Promotion API returns totalPromotionBonusEarned');
  assert(Array.isArray(promoData.milestones), 'Promotion API returns milestones array');
  assert(promoData.milestones.length === 3, 'Promotion API returns all 3 official milestones (20/20, 50/50, 100/100)');

  // Task #13: Wallet Summary & Transactions
  const walletMeRes = await fetch(`${baseUrl}/api/wallet/me`, {
    headers: { Cookie: cookieHeader },
  });
  assert(walletMeRes.status === 200, 'GET /api/wallet/me returns HTTP 200');
  const walletSummary = await walletMeRes.json();
  assert(typeof walletSummary.totalEarned === 'number', 'Wallet summary returns numeric totalEarned');
  assert(typeof walletSummary.totalReversed === 'number', 'Wallet summary returns numeric totalReversed');
  assert(typeof walletSummary.ledgerBalance === 'number', 'Wallet summary returns numeric ledgerBalance');
  assert(typeof walletSummary.transactionCount === 'number', 'Wallet summary returns numeric transactionCount');
  assert(typeof walletSummary.breakdown?.referral === 'number', 'Wallet breakdown has referral');
  assert(typeof walletSummary.breakdown?.matching === 'number', 'Wallet breakdown has matching');
  assert(typeof walletSummary.breakdown?.promotion === 'number', 'Wallet breakdown has promotion');

  const walletTxRes = await fetch(`${baseUrl}/api/wallet/transactions?page=1&limit=10`, {
    headers: { Cookie: cookieHeader },
  });
  assert(walletTxRes.status === 200, 'GET /api/wallet/transactions returns HTTP 200');
  const walletTxData = await walletTxRes.json();
  assert(Array.isArray(walletTxData.transactions), 'Wallet transactions returns transactions array');
  assert(typeof walletTxData.pagination?.page === 'number', 'Wallet transactions returns pagination object');

  // Verify unauthorized access protection
  const unauthWalletRes = await fetch(`${baseUrl}/api/wallet/me`);
  assert(unauthWalletRes.status === 401, 'Unauthenticated GET /api/wallet/me returns HTTP 401');

  // Verify financial writes from client are rejected (server-authoritative only)
  const clientWriteRes = await fetch(`${baseUrl}/api/wallet/me`, {
    method: 'POST',
    headers: { Cookie: cookieHeader, 'Content-Type': 'application/json' },
    body: JSON.stringify({ amount: 1000 }),
  });
  assert(clientWriteRes.status === 404 || clientWriteRes.status === 405, 'Client cannot POST /api/wallet/me (HTTP 404/405)');

  console.log('\n====================================================');
  console.log(`LIVE HTTP VERIFICATION: ${passed} PASSED | ${failed} FAILED`);
  console.log('====================================================');

  if (failed > 0) {
    process.exit(1);
  } else {
    process.exit(0);
  }
}

runLiveHttpTests().catch((err) => {
  console.error('[Live HTTP Test Error]', err);
  process.exit(1);
});
