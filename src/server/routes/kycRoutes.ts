import { Router, Response } from 'express';
import { requireAuth, requireAdmin, AuthRequest } from '../middleware/authMiddleware';
import {
  submitUserKYC,
  getUserKYCStatus,
  getAdminKYCSubmissions,
  reviewKYCSubmission,
} from '../services/kycService';

export const kycRouter = Router();

/**
 * GET /api/kyc/me
 * Returns current authenticated user's KYC verification status and document records.
 */
kycRouter.get('/me', requireAuth, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const user = req.user!;
    const statusData = await getUserKYCStatus(user.id);

    res.status(200).json({
      success: true,
      ...statusData,
    });
  } catch (err: any) {
    console.error('[KYC API] Error getting user KYC status:', err);
    res.status(500).json({
      success: false,
      error: 'SERVER_ERROR',
      message: err.message || 'Failed to retrieve KYC status.',
    });
  }
});

/**
 * POST /api/kyc/submit
 * Submits or re-submits Binance-grade KYC identification documents.
 */
kycRouter.post('/submit', requireAuth, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const user = req.user!;
    const {
      fullLegalName,
      dob,
      country,
      residentialAddress,
      city,
      postalCode,
      documentType,
      documentNumber,
      documentFrontUrl,
      documentBackUrl,
      selfiePhotoUrl,
    } = req.body;

    if (!fullLegalName || !dob || !country || !residentialAddress || !city || !documentType || !documentNumber || !documentFrontUrl || !selfiePhotoUrl) {
      res.status(400).json({
        success: false,
        error: 'INVALID_INPUT',
        message: 'All identity parameters, front document photo, and live selfie are required.',
      });
      return;
    }

    const submission = await submitUserKYC(user.id, {
      fullLegalName,
      dob,
      country,
      residentialAddress,
      city,
      postalCode: postalCode || '',
      documentType,
      documentNumber,
      documentFrontUrl,
      documentBackUrl,
      selfiePhotoUrl,
    });

    res.status(200).json({
      success: true,
      message: 'Identity verification submitted successfully. Under active review.',
      submission,
    });
  } catch (err: any) {
    console.error('[KYC API] Error submitting KYC:', err);
    res.status(400).json({
      success: false,
      error: 'SUBMISSION_FAILED',
      message: err.message || 'Failed to submit KYC verification.',
    });
  }
});

/**
 * GET /api/kyc/admin/submissions
 * Administrator queue for reviewing pending and processed KYC verifications.
 */
kycRouter.get('/admin/submissions', requireAuth, requireAdmin, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const statusFilter = (req.query.status as string) || 'ALL';
    const searchQuery = (req.query.search as string) || '';
    const limit = parseInt(req.query.limit as string) || 50;
    const offset = parseInt(req.query.offset as string) || 0;

    const data = await getAdminKYCSubmissions({
      statusFilter,
      searchQuery,
      limit,
      offset,
    });

    res.status(200).json({
      success: true,
      ...data,
    });
  } catch (err: any) {
    console.error('[KYC API Admin] Error listing KYC submissions:', err);
    res.status(500).json({
      success: false,
      error: 'SERVER_ERROR',
      message: err.message || 'Failed to list KYC submissions.',
    });
  }
});

/**
 * POST /api/kyc/admin/:id/review
 * Administrator decision endpoint: APPROVE or REJECT a KYC verification.
 */
kycRouter.post('/admin/:id/review', requireAuth, requireAdmin, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const admin = req.user!;
    const submissionId = req.params.id;
    const { decision, reason } = req.body;

    if (!decision || (decision !== 'APPROVE' && decision !== 'REJECT')) {
      res.status(400).json({
        success: false,
        error: 'INVALID_DECISION',
        message: 'Decision must be either "APPROVE" or "REJECT".',
      });
      return;
    }

    if (decision === 'REJECT' && (!reason || reason.trim().length < 3)) {
      res.status(400).json({
        success: false,
        error: 'REASON_REQUIRED',
        message: 'A rejection reason is required for the user to remediate.',
      });
      return;
    }

    const result = await reviewKYCSubmission(
      admin.id,
      admin.public_id,
      submissionId,
      decision,
      reason
    );

    res.status(200).json(result);
  } catch (err: any) {
    console.error('[KYC API Admin] Error reviewing submission:', err);
    res.status(400).json({
      success: false,
      error: 'REVIEW_FAILED',
      message: err.message || 'Failed to process KYC review.',
    });
  }
});
