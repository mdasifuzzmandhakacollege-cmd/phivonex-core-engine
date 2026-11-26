import { v4 as uuidv4 } from 'uuid';
import { DatabaseClient, getDb } from '../db/db';
import {
  parseAmountToScaledBigInt,
  formatScaledBigInt,
  DECIMAL_SCALE,
} from './tradingPoolService';

export type UnilevelSourceProductType = 'GENESIS_NODE' | 'TRADING_POOL' | 'CHRONO_VAULT';
export type UnilevelYieldEventStatus = 'PENDING' | 'PROCESSED' | 'SKIPPED';

export interface UnilevelYieldEventRecord {
  id: string;
  sourceProductType: UnilevelSourceProductType;
  sourceYieldId: string;
  sourceUserId: string;
  epochDate: string;
  sourceRoiUsd: string;
  rawTokenAmount: string | null;
  tokenReferencePriceUsd: string | null;
  processingStatus: UnilevelYieldEventStatus;
  processedAt: string | null;
  createdAt: string;
}

/**
 * Exact NUMERIC(20,8) calculation for converting token yield (e.g. PHIVO) into USD equivalent:
 * source_roi_usd = round8(raw_token_amount * token_reference_price_usd)
 */
export function calculateTokenRoiUsdExact(
  rawTokenAmount: number | string,
  tokenReferencePriceUsd: number | string
): {
  roiUsdStr: string;
  roiUsdScaled: bigint;
  rawTokenAmountStr: string;
  tokenReferencePriceUsdStr: string;
} {
  const tokenScaled = parseAmountToScaledBigInt(rawTokenAmount);
  const priceScaled = parseAmountToScaledBigInt(tokenReferencePriceUsd);

  if (tokenScaled <= 0n || priceScaled <= 0n) {
    return {
      roiUsdStr: '0.00000000',
      roiUsdScaled: 0n,
      rawTokenAmountStr: formatScaledBigInt(tokenScaled > 0n ? tokenScaled : 0n),
      tokenReferencePriceUsdStr: formatScaledBigInt(priceScaled > 0n ? priceScaled : 0n),
    };
  }

  // tokenScaled (10^8) * priceScaled (10^8) = 10^16.
  // Divide by 10^8 (100_000_000n) with half-up rounding:
  const halfScale = 50_000_000n;
  const roiUsdScaled = (tokenScaled * priceScaled + halfScale) / DECIMAL_SCALE;

  return {
    roiUsdStr: formatScaledBigInt(roiUsdScaled),
    roiUsdScaled,
    rawTokenAmountStr: formatScaledBigInt(tokenScaled),
    tokenReferencePriceUsdStr: formatScaledBigInt(priceScaled),
  };
}

/**
 * Idempotently enqueues a Unified Unilevel Yield Event into `unilevel_yield_events`
 * inside the caller's PostgreSQL ACID transaction so Task 07's 16-Generation ROI-on-ROI Engine
 * processes all 3 product engines (`GENESIS_NODE`, `TRADING_POOL`, `CHRONO_VAULT`) through one unified outbox.
 * Guarded by UNIQUE(source_product_type, source_yield_id).
 */
export async function enqueueUnilevelYieldEvent(
  client: DatabaseClient,
  params: {
    sourceProductType: UnilevelSourceProductType;
    sourceYieldId: string;
    sourceUserId: string;
    epochDate: string;
    sourceRoiUsd: number | string;
    rawTokenAmount?: number | string | null;
    tokenReferencePriceUsd?: number | string | null;
  }
): Promise<UnilevelYieldEventRecord | null> {
  const {
    sourceProductType,
    sourceYieldId,
    sourceUserId,
    epochDate,
    sourceRoiUsd,
    rawTokenAmount,
    tokenReferencePriceUsd,
  } = params;

  const roiUsdScaled = parseAmountToScaledBigInt(sourceRoiUsd);
  if (roiUsdScaled <= 0n) {
    return null;
  }

  const roiUsdStr = formatScaledBigInt(roiUsdScaled);
  const rawTokenStr =
    rawTokenAmount !== undefined && rawTokenAmount !== null
      ? formatScaledBigInt(parseAmountToScaledBigInt(rawTokenAmount))
      : null;
  const refPriceStr =
    tokenReferencePriceUsd !== undefined && tokenReferencePriceUsd !== null
      ? formatScaledBigInt(parseAmountToScaledBigInt(tokenReferencePriceUsd))
      : null;

  const eventId = uuidv4();
  const insRes = await client.query<{
    id: string;
    source_product_type: UnilevelSourceProductType;
    source_yield_id: string;
    source_user_id: string;
    epoch_date: string;
    source_roi_usd: string;
    raw_token_amount: string | null;
    token_reference_price_usd: string | null;
    processing_status: UnilevelYieldEventStatus;
    processed_at: Date | null;
    created_at: Date;
  }>(
    `
    INSERT INTO unilevel_yield_events (
      id,
      source_product_type,
      source_yield_id,
      source_user_id,
      epoch_date,
      source_roi_usd,
      raw_token_amount,
      token_reference_price_usd,
      processing_status,
      processed_at,
      created_at
    )
    VALUES (
      $1,
      $2,
      $3,
      $4,
      $5::date,
      $6::numeric(20,8),
      $7::numeric(20,8),
      $8::numeric(20,8),
      'PENDING',
      NULL,
      NOW()
    )
    ON CONFLICT (source_product_type, source_yield_id) DO NOTHING
    RETURNING
      id,
      source_product_type,
      source_yield_id,
      source_user_id,
      epoch_date::text AS epoch_date,
      ROUND(source_roi_usd, 8)::text AS source_roi_usd,
      CASE WHEN raw_token_amount IS NULL THEN NULL ELSE ROUND(raw_token_amount, 8)::text END AS raw_token_amount,
      CASE WHEN token_reference_price_usd IS NULL THEN NULL ELSE ROUND(token_reference_price_usd, 8)::text END AS token_reference_price_usd,
      processing_status,
      processed_at,
      created_at
    `,
    [
      eventId,
      sourceProductType,
      sourceYieldId,
      sourceUserId,
      epochDate,
      roiUsdStr,
      rawTokenStr,
      refPriceStr,
    ]
  );

  if (insRes.rowCount > 0) {
    const r = insRes.rows[0];
    return {
      id: r.id,
      sourceProductType: r.source_product_type,
      sourceYieldId: r.source_yield_id,
      sourceUserId: r.source_user_id,
      epochDate: r.epoch_date,
      sourceRoiUsd: r.source_roi_usd,
      rawTokenAmount: r.raw_token_amount,
      tokenReferencePriceUsd: r.token_reference_price_usd,
      processingStatus: r.processing_status,
      processedAt: r.processed_at ? new Date(r.processed_at).toISOString() : null,
      createdAt: new Date(r.created_at).toISOString(),
    };
  }

  return getUnilevelYieldEventBySource(sourceProductType, sourceYieldId, client);
}

/**
 * Retrieves an existing Unilevel Yield Event by `(source_product_type, source_yield_id)`.
 */
export async function getUnilevelYieldEventBySource(
  sourceProductType: UnilevelSourceProductType,
  sourceYieldId: string,
  dbClient?: DatabaseClient
): Promise<UnilevelYieldEventRecord | null> {
  const db = dbClient || (await getDb());
  const res = await db.query<{
    id: string;
    source_product_type: UnilevelSourceProductType;
    source_yield_id: string;
    source_user_id: string;
    epoch_date: string;
    source_roi_usd: string;
    raw_token_amount: string | null;
    token_reference_price_usd: string | null;
    processing_status: UnilevelYieldEventStatus;
    processed_at: Date | null;
    created_at: Date;
  }>(
    `
    SELECT
      id,
      source_product_type,
      source_yield_id,
      source_user_id,
      epoch_date::text AS epoch_date,
      ROUND(source_roi_usd, 8)::text AS source_roi_usd,
      CASE WHEN raw_token_amount IS NULL THEN NULL ELSE ROUND(raw_token_amount, 8)::text END AS raw_token_amount,
      CASE WHEN token_reference_price_usd IS NULL THEN NULL ELSE ROUND(token_reference_price_usd, 8)::text END AS token_reference_price_usd,
      processing_status,
      processed_at,
      created_at
    FROM unilevel_yield_events
    WHERE source_product_type = $1 AND source_yield_id = $2
    LIMIT 1
    `,
    [sourceProductType, sourceYieldId]
  );

  if (res.rowCount === 0) return null;
  const r = res.rows[0];
  return {
    id: r.id,
    sourceProductType: r.source_product_type,
    sourceYieldId: r.source_yield_id,
    sourceUserId: r.source_user_id,
    epochDate: r.epoch_date,
    sourceRoiUsd: r.source_roi_usd,
    rawTokenAmount: r.raw_token_amount,
    tokenReferencePriceUsd: r.token_reference_price_usd,
    processingStatus: r.processing_status,
    processedAt: r.processed_at ? new Date(r.processed_at).toISOString() : null,
    createdAt: new Date(r.created_at).toISOString(),
  };
}
