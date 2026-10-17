import { v4 as uuidv4 } from 'uuid';
import { getDb } from '../db/db';
import { logAdminAction } from './adminService';

export interface KYCSubmissionInput {
  fullLegalName: string;
  dob: string;
  country: string;
  residentialAddress: string;
  city: string;
  postalCode: string;
  documentType: 'NATIONAL_ID' | 'PASSPORT' | 'DRIVERS_LICENSE';
  documentNumber: string;
  documentFrontUrl: string;
  documentBackUrl?: string;
  selfiePhotoUrl: string;
}

export interface KYCRecord {
  id: string;
  userId: string;
  userPublicId?: string;
  userEmail?: string;
  userFullName?: string;
  fullLegalName: string;
  dob: string;
  country: string;
  residentialAddress: string;
  city: string;
  postalCode: string;
  documentType: 'NATIONAL_ID' | 'PASSPORT' | 'DRIVERS_LICENSE';
  documentNumber: string;
  documentFrontUrl: string;
  documentBackUrl?: string;
  selfiePhotoUrl: string;
  status: 'PENDING' | 'VERIFIED' | 'REJECTED';
  rejectionReason?: string | null;
  reviewerId?: string | null;
  reviewedAt?: string | null;
  createdAt: string;
  updatedAt: string;
}

/**
 * Submit or re-submit user identity documents for Binance-standard KYC review.
 */
export async function submitUserKYC(userId: string, input: KYCSubmissionInput): Promise<KYCRecord> {
  const db = await getDb();

  // Validate required inputs
  if (!input.fullLegalName || input.fullLegalName.trim().length < 2) {
    throw new Error('Full legal name is required and must match your ID document.');
  }
  if (!input.dob || !input.country || !input.residentialAddress || !input.city) {
    throw new Error('Complete residential address and personal details are mandatory.');
  }
  if (!input.documentNumber || input.documentNumber.trim().length < 3) {
    throw new Error('Valid document number is required.');
  }
  if (!input.documentFrontUrl || !input.selfiePhotoUrl) {
    throw new Error('Front document photo and live facial selfie photo are mandatory.');
  }

  // Check if existing pending or verified record exists
  const existingRes = await db.query(
    `SELECT id, status FROM kyc_verifications WHERE user_id = $1 ORDER BY created_at DESC LIMIT 1`,
    [userId]
  );

  let recordId = uuidv4();
  const now = new Date().toISOString();

  if (existingRes.rows.length > 0) {
    recordId = existingRes.rows[0].id;
    await db.query(
      `
      UPDATE kyc_verifications
      SET full_legal_name = $1,
          dob = $2,
          country = $3,
          residential_address = $4,
          city = $5,
          postal_code = $6,
          document_type = $7,
          document_number = $8,
          document_front_url = $9,
          document_back_url = $10,
          selfie_photo_url = $11,
          status = 'PENDING',
          rejection_reason = NULL,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = $12
      `,
      [
        input.fullLegalName.trim(),
        input.dob.trim(),
        input.country.trim(),
        input.residentialAddress.trim(),
        input.city.trim(),
        input.postalCode.trim(),
        input.documentType,
        input.documentNumber.trim(),
        input.documentFrontUrl,
        input.documentBackUrl || null,
        input.selfiePhotoUrl,
        recordId,
      ]
    );
  } else {
    await db.query(
      `
      INSERT INTO kyc_verifications (
        id, user_id, full_legal_name, dob, country, residential_address,
        city, postal_code, document_type, document_number, document_front_url,
        document_back_url, selfie_photo_url, status, created_at, updated_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, 'PENDING', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
      `,
      [
        recordId,
        userId,
        input.fullLegalName.trim(),
        input.dob.trim(),
        input.country.trim(),
        input.residentialAddress.trim(),
        input.city.trim(),
        input.postalCode.trim(),
        input.documentType,
        input.documentNumber.trim(),
        input.documentFrontUrl,
        input.documentBackUrl || null,
        input.selfiePhotoUrl,
      ]
    );
  }

  // Update user's kyc_status on users table
  await db.query(
    `UPDATE users SET kyc_status = 'PENDING', kyc_reject_reason = NULL, updated_at = CURRENT_TIMESTAMP WHERE id = $1`,
    [userId]
  );

  // Sync to Cloud Firestore for real-time listener updates (< seconds)
  try {
    const { adminFirestore } = await import('../../lib/firebase-admin');
    await adminFirestore.collection('kyc_verifications').doc(userId).set(
      {
        id: recordId,
        userId,
        status: 'PENDING',
        documentType: input.documentType,
        fullLegalName: input.fullLegalName.trim(),
        submittedAt: now,
        updatedAt: now,
      },
      { merge: true }
    );
    await adminFirestore.collection('users').doc(userId).set(
      {
        kycStatus: 'PENDING',
        kycRejectReason: null,
        updatedAt: now,
      },
      { merge: true }
    );
  } catch (fsErr) {
    console.warn('[KYC Service] Firestore real-time sync warning:', fsErr);
  }

  // Create notification for user
  try {
    await db.query(
      `
      INSERT INTO notifications (id, user_id, type, title, message, created_at)
      VALUES ($1, $2, 'SECURITY_ALERT', 'Identity Verification Submitted', 
              'Your KYC documents (Front, Back, and Live Selfie) were received and are under active security verification.', CURRENT_TIMESTAMP)
      `,
      [uuidv4(), userId]
    );
  } catch {
    // non-fatal
  }

  return {
    id: recordId,
    userId,
    fullLegalName: input.fullLegalName.trim(),
    dob: input.dob.trim(),
    country: input.country.trim(),
    residentialAddress: input.residentialAddress.trim(),
    city: input.city.trim(),
    postalCode: input.postalCode.trim(),
    documentType: input.documentType,
    documentNumber: input.documentNumber.trim(),
    documentFrontUrl: input.documentFrontUrl,
    documentBackUrl: input.documentBackUrl,
    selfiePhotoUrl: input.selfiePhotoUrl,
    status: 'PENDING',
    createdAt: now,
    updatedAt: now,
  };
}

/**
 * Fetch current user's KYC verification status and details
 */
export async function getUserKYCStatus(userId: string): Promise<{
  kycStatus: 'UNVERIFIED' | 'PENDING' | 'VERIFIED' | 'REJECTED';
  rejectionReason: string | null;
  verifiedAt: string | null;
  submission: KYCRecord | null;
}> {
  const db = await getDb();

  const userRes = await db.query(
    `SELECT kyc_status, kyc_reject_reason, kyc_verified_at FROM users WHERE id = $1`,
    [userId]
  );

  const kycStatus = (userRes.rows[0]?.kyc_status || 'UNVERIFIED') as 'UNVERIFIED' | 'PENDING' | 'VERIFIED' | 'REJECTED';
  const rejectionReason = userRes.rows[0]?.kyc_reject_reason || null;
  const verifiedAt = userRes.rows[0]?.kyc_verified_at || null;

  const subRes = await db.query(
    `
    SELECT id, user_id, full_legal_name, dob, country, residential_address,
           city, postal_code, document_type, document_number, document_front_url,
           document_back_url, selfie_photo_url, status, rejection_reason,
           reviewer_id, reviewed_at, created_at, updated_at
    FROM kyc_verifications
    WHERE user_id = $1
    ORDER BY created_at DESC
    LIMIT 1
    `,
    [userId]
  );

  let submission: KYCRecord | null = null;
  if (subRes.rows.length > 0) {
    const r = subRes.rows[0];
    submission = {
      id: r.id,
      userId: r.user_id,
      fullLegalName: r.full_legal_name,
      dob: r.dob,
      country: r.country,
      residentialAddress: r.residential_address,
      city: r.city,
      postalCode: r.postal_code,
      documentType: r.document_type,
      documentNumber: r.document_number,
      documentFrontUrl: r.document_front_url,
      documentBackUrl: r.document_back_url,
      selfiePhotoUrl: r.selfie_photo_url,
      status: r.status,
      rejectionReason: r.rejection_reason,
      reviewerId: r.reviewer_id,
      reviewedAt: r.reviewed_at,
      createdAt: r.created_at,
      updatedAt: r.updated_at,
    };
  }

  return {
    kycStatus,
    rejectionReason,
    verifiedAt,
    submission,
  };
}

/**
 * Fetch KYC submissions for Admin Review Hub
 */
export async function getAdminKYCSubmissions(params: {
  statusFilter?: string;
  searchQuery?: string;
  limit?: number;
  offset?: number;
}): Promise<{
  submissions: KYCRecord[];
  totalCount: number;
  pendingCount: number;
  verifiedCount: number;
  rejectedCount: number;
}> {
  const db = await getDb();
  const limit = params.limit || 50;
  const offset = params.offset || 0;

  // Counts summary
  const countsRes = await db.query(`
    SELECT 
      COUNT(*) AS total,
      COUNT(*) FILTER (WHERE status = 'PENDING') AS pending,
      COUNT(*) FILTER (WHERE status = 'VERIFIED') AS verified,
      COUNT(*) FILTER (WHERE status = 'REJECTED') AS rejected
    FROM kyc_verifications
  `);
  const countsRow = countsRes.rows[0] || {};
  const pendingCount = Number(countsRow.pending || 0);
  const verifiedCount = Number(countsRow.verified || 0);
  const rejectedCount = Number(countsRow.rejected || 0);
  const totalCount = Number(countsRow.total || 0);

  let query = `
    SELECT 
      k.id, k.user_id, k.full_legal_name, k.dob, k.country, k.residential_address,
      k.city, k.postal_code, k.document_type, k.document_number, k.document_front_url,
      k.document_back_url, k.selfie_photo_url, k.status, k.rejection_reason,
      k.reviewer_id, k.reviewed_at, k.created_at, k.updated_at,
      u.public_id AS user_public_id, u.email AS user_email, u.full_name AS user_full_name
    FROM kyc_verifications k
    JOIN users u ON k.user_id = u.id
    WHERE 1=1
  `;
  const queryParams: any[] = [];

  if (params.statusFilter && params.statusFilter !== 'ALL') {
    queryParams.push(params.statusFilter);
    query += ` AND k.status = $${queryParams.length} `;
  }

  if (params.searchQuery && params.searchQuery.trim()) {
    queryParams.push(`%${params.searchQuery.trim()}%`);
    const pIdx = queryParams.length;
    query += ` AND (
      k.full_legal_name ILIKE $${pIdx} OR 
      u.email ILIKE $${pIdx} OR 
      u.public_id ILIKE $${pIdx} OR 
      k.document_number ILIKE $${pIdx} OR
      k.country ILIKE $${pIdx}
    ) `;
  }

  query += ` ORDER BY CASE WHEN k.status = 'PENDING' THEN 0 ELSE 1 END, k.created_at DESC `;
  queryParams.push(limit, offset);
  query += ` LIMIT $${queryParams.length - 1} OFFSET $${queryParams.length} `;

  const res = await db.query(query, queryParams);

  const submissions: KYCRecord[] = res.rows.map((r) => ({
    id: r.id,
    userId: r.user_id,
    userPublicId: r.user_public_id,
    userEmail: r.user_email,
    userFullName: r.user_full_name,
    fullLegalName: r.full_legal_name,
    dob: r.dob,
    country: r.country,
    residentialAddress: r.residential_address,
    city: r.city,
    postalCode: r.postal_code,
    documentType: r.document_type,
    documentNumber: r.document_number,
    documentFrontUrl: r.document_front_url,
    documentBackUrl: r.document_back_url,
    selfiePhotoUrl: r.selfie_photo_url,
    status: r.status,
    rejectionReason: r.rejection_reason,
    reviewerId: r.reviewer_id,
    reviewedAt: r.reviewed_at,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  }));

  return {
    submissions,
    totalCount,
    pendingCount,
    verifiedCount,
    rejectedCount,
  };
}

/**
 * Review a KYC Submission (Approve or Reject) by an Admin
 */
export async function reviewKYCSubmission(
  adminUserId: string,
  adminPublicId: string,
  submissionId: string,
  decision: 'APPROVE' | 'REJECT',
  reason?: string
): Promise<{ success: boolean; status: string; message: string }> {
  const db = await getDb();

  const subRes = await db.query(
    `SELECT k.*, u.public_id, u.email, u.full_name FROM kyc_verifications k JOIN users u ON k.user_id = u.id WHERE k.id = $1`,
    [submissionId]
  );

  if (subRes.rows.length === 0) {
    throw new Error('KYC submission record not found.');
  }

  const record = subRes.rows[0];
  const targetUserId = record.user_id;
  const now = new Date().toISOString();

  if (decision === 'APPROVE') {
    // 1. Update kyc_verifications
    await db.query(
      `
      UPDATE kyc_verifications
      SET status = 'VERIFIED',
          rejection_reason = NULL,
          reviewer_id = $1,
          reviewed_at = CURRENT_TIMESTAMP,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = $2
      `,
      [adminUserId, submissionId]
    );

    // 2. Update users table
    await db.query(
      `
      UPDATE users
      SET kyc_status = 'VERIFIED',
          kyc_reject_reason = NULL,
          kyc_verified_at = CURRENT_TIMESTAMP,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = $1
      `,
      [targetUserId]
    );

    // 3. Sync to Cloud Firestore for instant real-time listener updates (< seconds)
    try {
      const { adminFirestore } = await import('../../lib/firebase-admin');
      await adminFirestore.collection('kyc_verifications').doc(targetUserId).set(
        {
          id: submissionId,
          userId: targetUserId,
          status: 'VERIFIED',
          reviewedAt: now,
          reviewerId: adminPublicId,
          updatedAt: now,
        },
        { merge: true }
      );
      await adminFirestore.collection('users').doc(targetUserId).set(
        {
          kycStatus: 'VERIFIED',
          kycRejectReason: null,
          kycVerifiedAt: now,
          updatedAt: now,
        },
        { merge: true }
      );
    } catch (fsErr) {
      console.warn('[KYC Service] Firestore real-time review sync warning:', fsErr);
    }

    // 4. Log Admin Action
    await logAdminAction({
      adminUserId,
      adminPublicId,
      action: 'APPROVE_KYC_VERIFICATION',
      targetType: 'kyc_verifications',
      targetId: submissionId,
      details: `Approved KYC Level 1 Identity Verification for operator ${record.public_id} (${record.email}) - Legal Name: "${record.full_legal_name}"`,
    });

    // 5. In-App Notification
    try {
      await db.query(
        `
        INSERT INTO notifications (id, user_id, type, title, message, created_at)
        VALUES ($1, $2, 'SECURITY_ALERT', 'KYC Verification Approved!', 
                'Congratulations! Your identity has been verified with Binance-grade Level 1 status. Full withdrawal limits and priority node services are unlocked.', CURRENT_TIMESTAMP)
        `,
        [uuidv4(), targetUserId]
      );
    } catch {
      // non-fatal
    }

    return {
      success: true,
      status: 'VERIFIED',
      message: `User ${record.public_id} identity successfully verified.`,
    };
  } else {
    // REJECT
    const rejectionReason = reason?.trim() || 'Document image unreadable or details mismatch.';

    await db.query(
      `
      UPDATE kyc_verifications
      SET status = 'REJECTED',
          rejection_reason = $1,
          reviewer_id = $2,
          reviewed_at = CURRENT_TIMESTAMP,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = $3
      `,
      [rejectionReason, adminUserId, submissionId]
    );

    await db.query(
      `
      UPDATE users
      SET kyc_status = 'REJECTED',
          kyc_reject_reason = $1,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = $2
      `,
      [rejectionReason, targetUserId]
    );

    try {
      const { adminFirestore } = await import('../../lib/firebase-admin');
      await adminFirestore.collection('kyc_verifications').doc(targetUserId).set(
        {
          id: submissionId,
          userId: targetUserId,
          status: 'REJECTED',
          rejection_reason: rejectionReason,
          reviewedAt: now,
          reviewerId: adminPublicId,
          updatedAt: now,
        },
        { merge: true }
      );
      await adminFirestore.collection('users').doc(targetUserId).set(
        {
          kycStatus: 'REJECTED',
          kycRejectReason: rejectionReason,
          updatedAt: now,
        },
        { merge: true }
      );
    } catch (fsErr) {
      console.warn('[KYC Service] Firestore real-time rejection sync warning:', fsErr);
    }

    await logAdminAction({
      adminUserId,
      adminPublicId,
      action: 'REJECT_KYC_VERIFICATION',
      targetType: 'kyc_verifications',
      targetId: submissionId,
      details: `Rejected KYC verification for operator ${record.public_id} (${record.email}). Reason: "${rejectionReason}"`,
    });

    try {
      await db.query(
        `
        INSERT INTO notifications (id, user_id, type, title, message, created_at)
        VALUES ($1, $2, 'SECURITY_ALERT', 'KYC Verification Needs Attention', 
                $3, CURRENT_TIMESTAMP)
        `,
        [uuidv4(), targetUserId, `Your identity verification was rejected: ${rejectionReason}. Please resubmit with clear photos.`]
      );
    } catch {
      // non-fatal
    }

    return {
      success: true,
      status: 'REJECTED',
      message: `KYC submission rejected for ${record.public_id}.`,
    };
  }
}
