import { Router, Request, Response } from 'express';
import {
  getPublicNetworkSummary,
  getPublicNetworkEvents,
  publicNetworkEventEmitter,
  PublicNetworkEvent,
} from '../services/publicNetworkService';

import { getTokenPriceTrend } from '../services/economicService';

export const publicNetworkRouter = Router();

/**
 * GET /api/public/network/price-trend
 * Returns real-time 24h token price performance data for Recharts.
 */
publicNetworkRouter.get('/price-trend', async (req: Request, res: Response) => {
  try {
    const timeframe = (req.query.timeframe as string) || '24h';
    const trendData = await getTokenPriceTrend(timeframe);
    res.setHeader('Cache-Control', 'public, max-age=5');
    return res.status(200).json(trendData);
  } catch (err: any) {
    console.error('[Public API] Error fetching token price trend:', err);
    return res.status(500).json({
      error: 'SERVER_ERROR',
      message: 'Failed to retrieve token price trend data.',
    });
  }
});

/**
 * GET /api/public/network/summary
 * Returns safe public aggregated metrics for landing page & public network page.
 * Exposes zero private user data.
 */
publicNetworkRouter.get('/summary', async (req: Request, res: Response) => {
  try {
    const summary = await getPublicNetworkSummary();
    res.setHeader('Cache-Control', 'public, max-age=5');
    return res.status(200).json(summary);
  } catch (err: any) {
    console.error('[Public API] Error fetching network summary:', err);
    return res.status(500).json({
      error: 'SERVER_ERROR',
      message: 'Failed to retrieve public network summary.',
    });
  }
});

/**
 * GET /api/public/network/events
 * Returns privacy-sanitized real events from DB.
 */
publicNetworkRouter.get('/events', async (req: Request, res: Response) => {
  try {
    const rawLimit = parseInt(req.query.limit as string, 10);
    const limit = isNaN(rawLimit) ? 20 : Math.min(100, Math.max(1, rawLimit));

    const events = await getPublicNetworkEvents(limit);
    res.setHeader('Cache-Control', 'public, max-age=5');
    return res.status(200).json(events);
  } catch (err: any) {
    console.error('[Public API] Error fetching network events:', err);
    return res.status(500).json({
      error: 'SERVER_ERROR',
      message: 'Failed to retrieve public network events.',
    });
  }
});

/**
 * GET /api/public/network/stream
 * Realtime Server-Sent Events (SSE) stream for live network updates.
 */
publicNetworkRouter.get('/stream', async (req: Request, res: Response) => {
  // Set SSE Headers
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders?.();

  // Send initial summary payload
  try {
    const initialSummary = await getPublicNetworkSummary();
    res.write(`event: summary\ndata: ${JSON.stringify(initialSummary)}\n\n`);
  } catch (err) {
    console.warn('[Public SSE] Failed to send initial summary payload:', err);
  }

  // Periodic heartbeat ping to keep connection alive
  const heartbeatInterval = setInterval(() => {
    try {
      res.write(': ping\n\n');
    } catch {
      // Ignore write errors if socket closed
    }
  }, 15000);

  // Subscribe to live broadcast events
  const onNetworkEvent = (evt: PublicNetworkEvent) => {
    try {
      res.write(`event: ${evt.type}\ndata: ${JSON.stringify(evt)}\n\n`);
    } catch (err) {
      console.warn('[Public SSE] Error broadcasting event:', err);
    }
  };

  publicNetworkEventEmitter.on('networkEvent', onNetworkEvent);

  // Clean up when client disconnects
  req.on('close', () => {
    clearInterval(heartbeatInterval);
    publicNetworkEventEmitter.off('networkEvent', onNetworkEvent);
  });
});
