import { Router, Response } from 'express';
import { requireAuth, requireAdmin, AuthRequest } from '../middleware/authMiddleware';
import {
  createSupportTicket,
  getUserSupportTickets,
  getSupportTicketDetails,
  addTicketMessage,
  updateTicketStatus,
  getAllSupportTickets,
  TicketCategory,
  TicketPriority,
  TicketStatus,
} from '../services/supportService';

const router = Router();

/**
 * POST /api/support/tickets
 * User: Create a new support ticket
 */
router.post('/tickets', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!.id;
    const { subject, message, category, priority } = req.body;

    if (!subject || !subject.trim()) {
      return res.status(400).json({ error: 'Subject is required' });
    }
    if (!message || !message.trim()) {
      return res.status(400).json({ error: 'Message is required' });
    }

    const ticket = await createSupportTicket({
      userId,
      subject: subject.trim(),
      message: message.trim(),
      category: category as TicketCategory,
      priority: priority as TicketPriority,
    });

    res.status(201).json({ success: true, ticket });
  } catch (err: any) {
    console.error('[SupportRoutes] Error creating ticket:', err);
    res.status(500).json({ error: 'Failed to create support ticket' });
  }
});

/**
 * GET /api/support/tickets
 * User: List tickets created by current user
 */
router.get('/tickets', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!.id;
    const tickets = await getUserSupportTickets(userId);
    res.json({ success: true, tickets });
  } catch (err: any) {
    console.error('[SupportRoutes] Error fetching user tickets:', err);
    res.status(500).json({ error: 'Failed to fetch support tickets' });
  }
});

/**
 * GET /api/support/tickets/:id
 * User or Admin: Get ticket details and conversation thread
 */
router.get('/tickets/:id', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!.role === 'ADMIN' ? undefined : req.user!.id;
    const ticket = await getSupportTicketDetails(req.params.id, userId);

    if (!ticket) {
      return res.status(404).json({ error: 'Ticket not found' });
    }

    res.json({ success: true, ticket });
  } catch (err: any) {
    console.error('[SupportRoutes] Error fetching ticket details:', err);
    res.status(500).json({ error: 'Failed to fetch ticket details' });
  }
});

/**
 * POST /api/support/tickets/:id/messages
 * User: Reply to an existing ticket
 */
router.post('/tickets/:id/messages', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!.id;
    const { message } = req.body;

    if (!message || !message.trim()) {
      return res.status(400).json({ error: 'Message is required' });
    }

    const ticket = await getSupportTicketDetails(req.params.id, req.user!.role === 'ADMIN' ? undefined : userId);
    if (!ticket) {
      return res.status(404).json({ error: 'Ticket not found' });
    }

    const senderRole = req.user!.role === 'ADMIN' ? 'ADMIN' : 'USER';
    const msg = await addTicketMessage({
      ticketIdentifier: ticket.id,
      senderId: userId,
      senderRole,
      message: message.trim(),
    });

    res.status(201).json({ success: true, message: msg });
  } catch (err: any) {
    console.error('[SupportRoutes] Error adding message:', err);
    res.status(500).json({ error: 'Failed to add message to ticket' });
  }
});

/**
 * GET /api/support/admin/tickets
 * Admin: List all tickets with optional filtering
 */
router.get('/admin/tickets', requireAdmin, async (req: AuthRequest, res: Response) => {
  try {
    const { status, category } = req.query;
    const tickets = await getAllSupportTickets({
      status: status as TicketStatus,
      category: category as TicketCategory,
    });
    res.json({ success: true, tickets });
  } catch (err: any) {
    console.error('[SupportRoutes] Error fetching admin tickets:', err);
    res.status(500).json({ error: 'Failed to fetch tickets' });
  }
});

/**
 * PATCH /api/support/admin/tickets/:id/status
 * Admin: Update ticket status
 */
router.patch('/admin/tickets/:id/status', requireAdmin, async (req: AuthRequest, res: Response) => {
  try {
    const { status } = req.body;
    if (!status) {
      return res.status(400).json({ error: 'Status is required' });
    }

    const ticket = await updateTicketStatus({
      ticketIdentifier: req.params.id,
      status: status as TicketStatus,
      adminId: req.user!.id,
    });

    res.json({ success: true, ticket });
  } catch (err: any) {
    console.error('[SupportRoutes] Error updating ticket status:', err);
    res.status(500).json({ error: 'Failed to update ticket status' });
  }
});

export const supportRouter = router;
export default router;
