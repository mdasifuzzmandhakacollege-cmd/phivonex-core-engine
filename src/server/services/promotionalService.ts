import { v4 as uuidv4 } from 'uuid';
import { getDb } from '../db/db';
import { logAdminAction } from './adminService';

// Interfaces
export interface PromotionalOffer {
  id: string;
  title: string;
  description: string;
  bannerImage: string;
  offerType: 'BOGO_FREE_NODE' | 'FREE_BONUS_NODE' | 'DISCOUNT' | 'CUSTOM';
  bonusNodesCount: number;
  bonusMiningRewards: boolean;
  bonusMatchingEnabled: boolean;
  bonusReferralCommission: boolean;
  startDate: string;
  endDate: string;
  status: 'ACTIVE' | 'INACTIVE';
  targetAudience: 'ALL' | 'NEW' | 'VIP';
  priorityOrder: number;
  createdAt: string;
}

export interface PromotionalBanner {
  id: string;
  content: string;
  imageUrl: string;
  ctaText: string;
  ctaDestination: string;
  displayOrder: number;
  status: 'ACTIVE' | 'INACTIVE';
  startDate: string;
  endDate: string;
  createdAt: string;
}

export interface PerformancePopupSettings {
  enabled: boolean;
  metric: 'DIRECT_REFERRALS' | 'NODE_SALES' | 'BINARY_VOLUME' | 'MATCHING_PERFORMANCE';
  topCount: number;
  durationSeconds: number;
}

// ----------------------------------------------------------------------------
// 1. DYNAMIC OFFERS CRUD
// ----------------------------------------------------------------------------

export async function getPromotionalOffers(adminOnly: boolean = false): Promise<PromotionalOffer[]> {
  const db = await getDb();
  let query = `
    SELECT id, title, description, banner_image, offer_type, bonus_nodes_count,
           bonus_mining_rewards, bonus_matching_enabled, bonus_referral_commission,
           start_date, end_date, status, target_audience, priority_order, created_at 
    FROM promotional_offers
  `;
  const params: any[] = [];

  if (!adminOnly) {
    query += ` WHERE status = 'ACTIVE' AND start_date <= CURRENT_TIMESTAMP AND end_date >= CURRENT_TIMESTAMP `;
  }

  query += ` ORDER BY priority_order ASC, created_at DESC `;

  const res = await db.query<any>(query, params);
  return res.rows.map(r => ({
    id: r.id,
    title: r.title,
    description: r.description,
    bannerImage: r.banner_image,
    offerType: r.offer_type || 'BOGO_FREE_NODE',
    bonusNodesCount: Number(r.bonus_nodes_count ?? 1),
    bonusMiningRewards: r.bonus_mining_rewards ?? true,
    bonusMatchingEnabled: r.bonus_matching_enabled ?? false,
    bonusReferralCommission: r.bonus_referral_commission ?? false,
    startDate: r.start_date,
    endDate: r.end_date,
    status: r.status,
    targetAudience: r.target_audience,
    priorityOrder: r.priority_order,
    createdAt: r.created_at
  }));
}

export async function createPromotionalOffer(
  adminUserId: string,
  adminPublicId: string,
  offer: Omit<PromotionalOffer, 'id' | 'createdAt'>
): Promise<PromotionalOffer> {
  const db = await getDb();
  const id = uuidv4();

  await db.query(
    `
    INSERT INTO promotional_offers (
      id, title, description, banner_image, offer_type, bonus_nodes_count,
      bonus_mining_rewards, bonus_matching_enabled, bonus_referral_commission,
      start_date, end_date, status, target_audience, priority_order
    )
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
    `,
    [
      id,
      offer.title,
      offer.description,
      offer.bannerImage,
      offer.offerType || 'BOGO_FREE_NODE',
      offer.bonusNodesCount ?? 1,
      offer.bonusMiningRewards ?? true,
      offer.bonusMatchingEnabled ?? false,
      offer.bonusReferralCommission ?? false,
      offer.startDate,
      offer.endDate,
      offer.status,
      offer.targetAudience,
      offer.priorityOrder
    ]
  );

  const created: PromotionalOffer = {
    id,
    ...offer,
    createdAt: new Date().toISOString()
  };

  await logAdminAction({
    adminUserId,
    adminPublicId,
    action: 'CREATE_PROMOTIONAL_OFFER',
    targetType: 'promotional_offers',
    targetId: id,
    details: `Created promotional offer: "${offer.title}" (${offer.offerType || 'BOGO_FREE_NODE'})`
  });

  return created;
}

export async function updatePromotionalOffer(
  adminUserId: string,
  adminPublicId: string,
  id: string,
  offer: Omit<PromotionalOffer, 'id' | 'createdAt'>
): Promise<PromotionalOffer> {
  const db = await getDb();

  // Load previous value for logging
  const oldRes = await db.query(`SELECT * FROM promotional_offers WHERE id = $1`, [id]);
  if (oldRes.rows.length === 0) {
    throw new Error('Offer not found');
  }

  await db.query(
    `
    UPDATE promotional_offers
    SET title = $1, description = $2, banner_image = $3, offer_type = $4, bonus_nodes_count = $5,
        bonus_mining_rewards = $6, bonus_matching_enabled = $7, bonus_referral_commission = $8,
        start_date = $9, end_date = $10, status = $11, target_audience = $12, priority_order = $13
    WHERE id = $14
    `,
    [
      offer.title,
      offer.description,
      offer.bannerImage,
      offer.offerType || 'BOGO_FREE_NODE',
      offer.bonusNodesCount ?? 1,
      offer.bonusMiningRewards ?? true,
      offer.bonusMatchingEnabled ?? false,
      offer.bonusReferralCommission ?? false,
      offer.startDate,
      offer.endDate,
      offer.status,
      offer.targetAudience,
      offer.priorityOrder,
      id
    ]
  );

  const updated: PromotionalOffer = {
    id,
    ...offer,
    createdAt: oldRes.rows[0].created_at
  };

  await logAdminAction({
    adminUserId,
    adminPublicId,
    action: 'UPDATE_PROMOTIONAL_OFFER',
    targetType: 'promotional_offers',
    targetId: id,
    details: `Updated promotional offer: "${offer.title}"`
  });

  return updated;
}

export async function deletePromotionalOffer(
  adminUserId: string,
  adminPublicId: string,
  id: string
): Promise<boolean> {
  const db = await getDb();
  
  const oldRes = await db.query(`SELECT title FROM promotional_offers WHERE id = $1`, [id]);
  if (oldRes.rows.length === 0) {
    return false;
  }

  await db.query(`DELETE FROM promotional_offers WHERE id = $1`, [id]);

  await logAdminAction({
    adminUserId,
    adminPublicId,
    action: 'DELETE_PROMOTIONAL_OFFER',
    targetType: 'promotional_offers',
    targetId: id,
    details: `Deleted promotional offer: "${oldRes.rows[0].title}"`
  });

  return true;
}

// ----------------------------------------------------------------------------
// 2. DYNAMIC BANNERS CRUD
// ----------------------------------------------------------------------------

export async function getPromotionalBanners(adminOnly: boolean = false): Promise<PromotionalBanner[]> {
  const db = await getDb();
  let query = `
    SELECT id, content, image_url, cta_text, cta_destination, display_order, status, start_date, end_date, created_at 
    FROM promotional_banners
  `;
  const params: any[] = [];

  if (!adminOnly) {
    query += ` WHERE status = 'ACTIVE' AND start_date <= CURRENT_TIMESTAMP AND end_date >= CURRENT_TIMESTAMP `;
  }

  query += ` ORDER BY display_order ASC, created_at DESC `;

  const res = await db.query<any>(query, params);
  return res.rows.map(r => ({
    id: r.id,
    content: r.content,
    imageUrl: r.image_url,
    ctaText: r.cta_text,
    ctaDestination: r.cta_destination,
    displayOrder: r.display_order,
    status: r.status,
    startDate: r.start_date,
    endDate: r.end_date,
    createdAt: r.created_at
  }));
}

export async function createPromotionalBanner(
  adminUserId: string,
  adminPublicId: string,
  banner: Omit<PromotionalBanner, 'id' | 'createdAt'>
): Promise<PromotionalBanner> {
  const db = await getDb();
  const id = uuidv4();

  await db.query(
    `
    INSERT INTO promotional_banners (id, content, image_url, cta_text, cta_destination, display_order, status, start_date, end_date)
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
    `,
    [
      id,
      banner.content,
      banner.imageUrl,
      banner.ctaText,
      banner.ctaDestination,
      banner.displayOrder,
      banner.status,
      banner.startDate,
      banner.endDate
    ]
  );

  const created: PromotionalBanner = {
    id,
    ...banner,
    createdAt: new Date().toISOString()
  };

  await logAdminAction({
    adminUserId,
    adminPublicId,
    action: 'CREATE_PROMOTIONAL_BANNER',
    targetType: 'promotional_banners',
    targetId: id,
    details: `Created promotional banner: "${banner.content.substring(0, 30)}..."`
  });

  return created;
}

export async function updatePromotionalBanner(
  adminUserId: string,
  adminPublicId: string,
  id: string,
  banner: Omit<PromotionalBanner, 'id' | 'createdAt'>
): Promise<PromotionalBanner> {
  const db = await getDb();

  // Load previous value for logging
  const oldRes = await db.query(`SELECT * FROM promotional_banners WHERE id = $1`, [id]);
  if (oldRes.rows.length === 0) {
    throw new Error('Banner not found');
  }

  await db.query(
    `
    UPDATE promotional_banners
    SET content = $1, image_url = $2, cta_text = $3, cta_destination = $4, display_order = $5, status = $6, start_date = $7, end_date = $8
    WHERE id = $9
    `,
    [
      banner.content,
      banner.imageUrl,
      banner.ctaText,
      banner.ctaDestination,
      banner.displayOrder,
      banner.status,
      banner.startDate,
      banner.endDate,
      id
    ]
  );

  const updated: PromotionalBanner = {
    id,
    ...banner,
    createdAt: oldRes.rows[0].created_at
  };

  await logAdminAction({
    adminUserId,
    adminPublicId,
    action: 'UPDATE_PROMOTIONAL_BANNER',
    targetType: 'promotional_banners',
    targetId: id,
    details: `Updated promotional banner: "${banner.content.substring(0, 30)}..."`
  });

  return updated;
}

export async function deletePromotionalBanner(
  adminUserId: string,
  adminPublicId: string,
  id: string
): Promise<boolean> {
  const db = await getDb();
  
  const oldRes = await db.query(`SELECT content FROM promotional_banners WHERE id = $1`, [id]);
  if (oldRes.rows.length === 0) {
    return false;
  }

  await db.query(`DELETE FROM promotional_banners WHERE id = $1`, [id]);

  await logAdminAction({
    adminUserId,
    adminPublicId,
    action: 'DELETE_PROMOTIONAL_BANNER',
    targetType: 'promotional_banners',
    targetId: id,
    details: `Deleted promotional banner: "${oldRes.rows[0].content.substring(0, 30)}..."`
  });

  return true;
}

// ----------------------------------------------------------------------------
// 3. PERFORMANCE LEADERBOARD CALCULATOR
// ----------------------------------------------------------------------------

export async function getLeaderboardSettings(): Promise<{ metric: string }> {
  const db = await getDb();
  const res = await db.query(`SELECT value FROM promotional_settings WHERE key = 'leaderboard_metric'`);
  if (res.rows.length === 0) {
    return { metric: 'DIRECT_REFERRALS' };
  }
  return { metric: JSON.parse(res.rows[0].value) };
}

export async function updateLeaderboardSettings(
  adminUserId: string,
  adminPublicId: string,
  metric: string
): Promise<string> {
  const db = await getDb();

  const oldSettings = await getLeaderboardSettings();

  await db.query(
    `
    INSERT INTO promotional_settings (key, value)
    VALUES ('leaderboard_metric', $1)
    ON CONFLICT (key) DO UPDATE SET value = $1
    `,
    [JSON.stringify(metric)]
  );

  await logAdminAction({
    adminUserId,
    adminPublicId,
    action: 'UPDATE_LEADERBOARD_METRIC',
    targetType: 'promotional_settings',
    targetId: 'leaderboard_metric',
    details: `Changed leaderboard metric from "${oldSettings.metric}" to "${metric}"`
  });

  return metric;
}

export async function getLeaderboard(metric?: string): Promise<any[]> {
  const db = await getDb();
  const activeMetric = metric || (await getLeaderboardSettings()).metric;

  let query = '';
  if (activeMetric === 'DIRECT_REFERRALS') {
    query = `
      SELECT u.id, u.public_id, u.full_name, COUNT(ur.user_id)::int AS score
      FROM users u
      INNER JOIN user_referrals ur ON u.id = ur.sponsor_user_id
      GROUP BY u.id, u.public_id, u.full_name
      ORDER BY score DESC, u.id
      LIMIT 10
    `;
  } else if (activeMetric === 'NODE_SALES') {
    query = `
      SELECT u.id, u.public_id, u.full_name, COALESCE(SUM(o.total_price_usd), 0)::numeric::float AS score
      FROM users u
      INNER JOIN user_referrals ur ON u.id = ur.sponsor_user_id
      INNER JOIN node_orders o ON ur.user_id = o.user_id
      WHERE o.status = 'COMPLETED'
      GROUP BY u.id, u.public_id, u.full_name
      ORDER BY score DESC, u.id
      LIMIT 10
    `;
  } else if (activeMetric === 'BINARY_VOLUME') {
    query = `
      SELECT u.id, u.public_id, u.full_name, (COALESCE(b.left_volume_units, 0) + COALESCE(b.right_volume_units, 0))::int AS score
      FROM users u
      INNER JOIN binary_volume_balances b ON u.id = b.user_id
      GROUP BY u.id, u.public_id, u.full_name, b.left_volume_units, b.right_volume_units
      ORDER BY score DESC, u.id
      LIMIT 10
    `;
  } else if (activeMetric === 'MATCHING_PERFORMANCE') {
    query = `
      SELECT u.id, u.public_id, u.full_name, COALESCE(SUM(ms.bonus_usd), 0)::numeric::float AS score
      FROM users u
      INNER JOIN binary_matching_settlements ms ON u.id = ms.user_id
      GROUP BY u.id, u.public_id, u.full_name
      ORDER BY score DESC, u.id
      LIMIT 10
    `;
  } else {
    // Fallback safe query
    query = `
      SELECT id, public_id, full_name, 0::int AS score
      FROM users
      LIMIT 10
    `;
  }

  const res = await db.query<any>(query);

  // Map to privacy-safe public info only!
  return res.rows.map((r, index) => {
    // Generate a secure, beautiful display name (e.g. "John D." or safe username public_id)
    const nameParts = r.full_name.trim().split(' ');
    const safeDisplayName = nameParts.length > 1 
      ? `${nameParts[0]} ${nameParts[nameParts.length - 1][0]}.` 
      : nameParts[0];

    return {
      rank: index + 1,
      publicId: r.public_id,
      displayName: safeDisplayName,
      score: r.score,
    };
  });
}

// ----------------------------------------------------------------------------
// 4. PERFORMANCE POPUP
// ----------------------------------------------------------------------------

export async function getPerformancePopupSettings(): Promise<PerformancePopupSettings> {
  const db = await getDb();
  const res = await db.query(`SELECT value FROM promotional_settings WHERE key = 'performance_popup'`);
  if (res.rows.length === 0) {
    return {
      enabled: true,
      metric: 'DIRECT_REFERRALS',
      topCount: 3,
      durationSeconds: 5
    };
  }
  return JSON.parse(res.rows[0].value);
}

export async function updatePerformancePopupSettings(
  adminUserId: string,
  adminPublicId: string,
  settings: PerformancePopupSettings
): Promise<PerformancePopupSettings> {
  const db = await getDb();

  const oldSettings = await getPerformancePopupSettings();

  await db.query(
    `
    INSERT INTO promotional_settings (key, value)
    VALUES ('performance_popup', $1)
    ON CONFLICT (key) DO UPDATE SET value = $1
    `,
    [JSON.stringify(settings)]
  );

  await logAdminAction({
    adminUserId,
    adminPublicId,
    action: 'UPDATE_PERFORMANCE_POPUP_SETTINGS',
    targetType: 'promotional_settings',
    targetId: 'performance_popup',
    details: `Updated performance popup settings: enabled=${settings.enabled}, metric=${settings.metric}, topCount=${settings.topCount}`
  });

  return settings;
}

export async function getPerformancePopupData(): Promise<any> {
  const settings = await getPerformancePopupSettings();
  if (!settings.enabled) {
    return { enabled: false, users: [], displayDurationSeconds: settings.durationSeconds };
  }

  // Fetch real leaders based on settings metric
  const leaders = await getLeaderboard(settings.metric);
  const slicedLeaders = leaders.slice(0, settings.topCount);

  // Return synchronized popup metadata payload
  return {
    enabled: true,
    metric: settings.metric,
    displayDurationSeconds: settings.durationSeconds,
    users: slicedLeaders.map(u => ({
      rank: u.rank,
      displayName: u.displayName,
      publicId: u.publicId,
      achievementType: 
        settings.metric === 'DIRECT_REFERRALS' ? 'Fast Growth' :
        settings.metric === 'NODE_SALES' ? 'Node Sales Leader' :
        settings.metric === 'BINARY_VOLUME' ? 'Matching Leader' : 'Top Performer'
    }))
  };
}
