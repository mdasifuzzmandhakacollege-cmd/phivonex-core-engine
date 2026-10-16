import { Router, Request, Response } from 'express';
import crypto from 'crypto';
import { handleProviderEmailWebhook } from '../services/emailService';

export const emailWebhookRouter = Router();

export function verifyCryptographicSignature(
  rawBody: string,
  headers: Record<string, string | string[] | undefined>,
  secret: string
): boolean {
  const svixId = (headers['svix-id'] || headers['webhook-id']) as string;
  const svixTimestamp = (headers['svix-timestamp'] || headers['webhook-timestamp']) as string;
  const svixSignature = (headers['svix-signature'] || headers['webhook-signature'] || headers['x-resend-signature'] || headers['x-provider-signature']) as string;

  if (!svixId || !svixTimestamp || !svixSignature) {
    return false;
  }

  // Prevent replay attacks (5 min tolerance)
  const now = Math.floor(Date.now() / 1000);
  const tsInt = parseInt(svixTimestamp, 10);
  if (isNaN(tsInt) || Math.abs(now - tsInt) > 300) {
    return false;
  }

  const toSign = `${svixId}.${svixTimestamp}.${rawBody}`;
  
  let cleanSecret = secret;
  if (cleanSecret.startsWith('whsec_')) {
    cleanSecret = cleanSecret.substring(6);
  }

  // Generate potential key buffers
  const keyCandidates: Buffer[] = [
    Buffer.from(secret, 'utf-8'),
    Buffer.from(cleanSecret, 'utf-8')
  ];

  const base64Regex = /^[A-Za-z0-9+/]*={0,2}$/;
  if (cleanSecret.length % 4 === 0 && base64Regex.test(cleanSecret)) {
    try {
      keyCandidates.push(Buffer.from(cleanSecret, 'base64'));
    } catch {}
  }
  if (secret.length % 4 === 0 && base64Regex.test(secret)) {
    try {
      keyCandidates.push(Buffer.from(secret, 'base64'));
    } catch {}
  }

  const signatures = svixSignature.split(' ');

  for (const key of keyCandidates) {
    const hmacHex = crypto.createHmac('sha256', key).update(toSign).digest('hex');
    const hmacBase64 = crypto.createHmac('sha256', key).update(toSign).digest('base64');

    for (const sig of signatures) {
      const parts = sig.split(',');
      const targetSig = parts.length === 2 ? parts[1] : sig;

      // 1. Try Hex match
      try {
        const expectedBuf = Buffer.from(targetSig, 'hex');
        const computedBuf = Buffer.from(hmacHex, 'hex');
        if (expectedBuf.length === computedBuf.length && crypto.timingSafeEqual(expectedBuf, computedBuf)) {
          return true;
        }
      } catch {}

      // 2. Try Base64 match
      try {
        const expectedBuf = Buffer.from(targetSig, 'base64');
        const computedBuf = Buffer.from(hmacBase64, 'base64');
        if (expectedBuf.length === computedBuf.length && crypto.timingSafeEqual(expectedBuf, computedBuf)) {
          return true;
        }
      } catch {}
    }
  }

  return false;
}

/**
 * POST /api/webhooks/email
 * Receives provider status callback events (bounced, delivered, failed)
 * Validates authentic signatures cryptographically before processing.
 */
emailWebhookRouter.post('/', async (req: Request, res: Response) => {
  try {
    const isTest = process.env.NODE_ENV === 'test';
    const secret = process.env.EMAIL_WEBHOOK_SECRET || (isTest ? 'test_secret_key' : '');

    if (!secret) {
      console.error('[Webhook API] Missing EMAIL_WEBHOOK_SECRET in production/staging. Failing closed.');
      return res.status(401).json({ error: 'UNAUTHORIZED', message: 'Webhook configuration error. Request rejected.' });
    }

    // Capture exact raw HTTP request body bytes
    const rawBody = (req as any).rawBody || JSON.stringify(req.body);

    const isAuthorized = verifyCryptographicSignature(rawBody, req.headers as any, secret);

    if (!isAuthorized) {
      return res.status(401).json({ error: 'UNAUTHORIZED', message: 'Failed cryptographic signature verification.' });
    }

    const { messageId, status, errorReason } = req.body || {};

    if (!messageId || !status || !['delivered', 'bounced', 'failed'].includes(status)) {
      return res.status(400).json({ error: 'INVALID_INPUT', message: 'Invalid callback webhook structure.' });
    }

    const matched = await handleProviderEmailWebhook(messageId, status, errorReason);
    return res.status(200).json({ success: matched });
  } catch (err: any) {
    console.error('[Webhook API] Error in email webhook:', err);
    return res.status(500).json({ error: 'SERVER_ERROR', message: 'Failed to process email status callback.' });
  }
});
