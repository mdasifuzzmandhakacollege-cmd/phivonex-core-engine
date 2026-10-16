import { getDb } from '../src/server/db/db';
import {
  createSupportTicket,
  getUserTickets,
  getTicketByPublicId,
  getAdminTickets,
  getUserLiveDataForSupport,
  addTicketMessage,
  updateTicketStatus,
} from '../src/server/services/supportService';
import { v4 as uuidv4 } from 'uuid';

async function runSmartSupportTest() {
  console.log('===============================================================');
  console.log('🧪 TESTING SMART SUPPORT CENTER & ENGINE');
  console.log('===============================================================');

  const db = await getDb();
  const userId = uuidv4();
  const email = `support_test_${Date.now()}@phivonex.test`;

  await db.query(
    `INSERT INTO users (id, email, password_hash, full_name, role, country)
     VALUES ($1, $2, 'hash_pass', 'Smart Support Tester', 'USER', 'BD')`,
    [userId, email]
  );

  // Test 1: User Live Data
  console.log('--- Test 1: Live User Support Data Retrieval ---');
  const liveData = await getUserLiveDataForSupport(userId);
  if (!liveData.userId || liveData.email !== email) {
    throw new Error('getUserLiveDataForSupport failed');
  }
  console.log('  ✅ [PASS] Retrieved user support live snapshot successfully');

  // Test 2: Create ticket with "Withdrawal" category
  console.log('--- Test 2: Ticket Creation with Flexible Category ---');
  const ticket = await createSupportTicket({
    userId,
    subject: 'Withdrawal assistance needed',
    userMessage: 'My withdrawal of 50 USDT is taking longer than expected.',
    category: 'Withdrawal',
    priority: 'HIGH',
  });

  if (!ticket.publicTicketId || ticket.status !== 'OPEN') {
    throw new Error('Ticket creation failed');
  }
  console.log('  ✅ [PASS] Created ticket:', ticket.publicTicketId);

  // Test 3: Fetch by user and public ID
  console.log('--- Test 3: Querying Tickets ---');
  const userTickets = await getUserTickets(userId);
  if (userTickets.length === 0) {
    throw new Error('getUserTickets returned empty list');
  }
  console.log('  ✅ [PASS] getUserTickets returned created ticket');

  const byPublic = await getTicketByPublicId(ticket.publicTicketId);
  if (!byPublic || byPublic.id !== ticket.id) {
    throw new Error('getTicketByPublicId failed');
  }
  console.log('  ✅ [PASS] getTicketByPublicId fetched identical ticket');

  // Test 4: Add admin reply using publicTicketId
  console.log('--- Test 4: Support Agent Reply with publicTicketId ---');
  const adminId = uuidv4();
  await db.query(
    `INSERT INTO users (id, email, password_hash, full_name, role, country)
     VALUES ($1, $2, 'hash_pass', 'Support Agent Alice', 'ADMIN', 'BD')`,
    [adminId, `agent_${Date.now()}@phivonex.test`]
  );

  const replyMsg = await addTicketMessage({
    publicTicketId: ticket.publicTicketId,
    senderId: adminId,
    senderRole: 'ADMIN',
    message: 'Hello, your withdrawal is currently queued for broadcast.',
  });

  if (!replyMsg.senderPublicName) {
    throw new Error('senderPublicName missing on message');
  }
  console.log('  ✅ [PASS] Agent reply posted with senderPublicName:', replyMsg.senderPublicName);

  // Test 5: Update ticket status to RESOLVED using publicTicketId & verify resolvedAt
  console.log('--- Test 5: Resolve Ticket & Audit resolvedAt ---');
  const resolved = await updateTicketStatus({
    publicTicketId: ticket.publicTicketId,
    status: 'RESOLVED',
    adminId,
  });

  if (resolved.status !== 'RESOLVED' || !resolved.resolvedAt) {
    throw new Error('resolved.status or resolvedAt invalid');
  }
  console.log('  ✅ [PASS] Ticket resolved and verified resolvedAt timestamp:', resolved.resolvedAt);

  // Test 6: Admin All Tickets
  console.log('--- Test 6: Admin All Tickets Query ---');
  const allTickets = await getAdminTickets();
  if (allTickets.length === 0) {
    throw new Error('getAdminTickets returned empty list');
  }
  console.log('  ✅ [PASS] getAdminTickets returned platform tickets list');

  console.log('===============================================================');
  console.log('🎉 ALL SMART SUPPORT TESTS PASSED (0 ERRORS)');
  console.log('===============================================================');
  process.exit(0);
}

runSmartSupportTest().catch((err) => {
  console.error('❌ Smart support test failed:', err);
  process.exit(1);
});
