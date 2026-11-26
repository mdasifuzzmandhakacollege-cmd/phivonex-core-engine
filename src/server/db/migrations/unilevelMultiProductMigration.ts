import { DatabaseClient } from '../db';

/**
 * TASK-02 & TASK-03: PostgreSQL Schema, Enterprise Security Tables & Canonical Master Seeding
 * Transitions PHIVONEX database schema to support:
 * 1. PHIVONEX QUANTUM ALPHA™ (Algorithmic Trading Pool — 5-Day Mon-Fri Yield)
 * 2. PHIVONEX CHRONO VAULTS™ (Time-Locked Staking — 7-Day Yield)
 * 3. 16-Generation Unilevel ROI-on-ROI Engine (40.00000000% Total Yield Royalty)
 * 4. Unilevel Leadership Ranks & Global Turnover Pool (7 Ranks 0..6 / 40% Cap)
 * 5. Founders' Council & Ecosystem Yield Settlement Epoch Locks
 * 6. Enterprise Security & Circuit-Breaker Tables (system_circuit_breaker_configs, wallet_signing_nonces, security_audit_logs)
 *
 * Strictly idempotent (CREATE TABLE IF NOT EXISTS, CREATE INDEX IF NOT EXISTS, ON CONFLICT DO UPDATE)
 * and 100% non-destructive to historical tables and SETTLED ledger entries.
 */
export async function ensureUnilevelMultiProductSchema(client: DatabaseClient): Promise<void> {
  // 0. Optimal Indexes on user_referrals for fast recursive 16-generation ancestor/descendant traversal
  await client.exec(`
    CREATE INDEX IF NOT EXISTS idx_user_referrals_user_sponsor
      ON user_referrals (user_id, sponsor_user_id);

    CREATE INDEX IF NOT EXISTS idx_user_referrals_sponsor_user
      ON user_referrals (sponsor_user_id, user_id);
  `);

  // 0b. Upgrade financial_ledger_entries & withdrawals amount precision to NUMERIC(20,8) & expand allowed source_type values
  try {
    await client.exec(`
      ALTER TABLE financial_ledger_entries
        ALTER COLUMN amount TYPE NUMERIC(20,8);
      ALTER TABLE withdrawals
        ALTER COLUMN amount TYPE NUMERIC(20,8);
      ALTER TABLE withdrawal_status_logs
        ALTER COLUMN amount TYPE NUMERIC(20,8);
    `);
  } catch (err) {
    console.warn('[DB Migration Task-02/03] Notice widening financial_ledger_entries/withdrawals.amount:', err);
  }

  try {
    await client.exec(`
      ALTER TABLE financial_ledger_entries DROP CONSTRAINT IF EXISTS chk_fle_source_type;
      ALTER TABLE financial_ledger_entries ADD CONSTRAINT chk_fle_source_type CHECK (
        source_type IN (
          'REFERRAL_COMMISSION',
          'MATCHING_BONUS',
          'PROMOTION_BONUS',
          'NODE_REWARD',
          'WITHDRAWAL',
          'BLOCKCHAIN_DEPOSIT',
          'COIN_SWAP',
          'NODE_PURCHASE',
          'USDT_DEPOSIT',
          'BNB_DEPOSIT',
          'DEPOSIT_CREDIT',
          'ADMIN_ADJUSTMENT',
          'WALLET_TRANSFER',
          'TRADING_POOL_DEPOSIT',
          'TRADING_POOL_YIELD',
          'TRADING_POOL_PRINCIPAL_RETURN',
          'TRADING_POOL_PRINCIPAL_REDEMPTION',
          'CHRONO_VAULT_STAKING',
          'CHRONO_VAULT_YIELD',
          'CHRONO_VAULT_MATURITY',
          'UNILEVEL_ROYALTY',
          'LEADERSHIP_RANK_REWARD',
          'GLOBAL_TURNOVER_POOL',
          'FOUNDERS_COUNCIL_DIVIDEND',
          'P2P_TRANSFER_SENT',
          'P2P_TRANSFER_RECEIVED'
        )
      );
    `);
  } catch (err) {
    console.warn('[DB Migration Task-02/03] Notice updating financial_ledger_entries source_type constraint:', err);
  }

  // 1. PHIVONEX QUANTUM ALPHA™ (Algorithmic Trading Pool — 5-Day Mon-Fri Yield)
  await client.exec(`
    CREATE TABLE IF NOT EXISTS trading_pool_tiers (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      tier_code VARCHAR(50) UNIQUE NOT NULL,
      tier_name VARCHAR(100) NOT NULL,
      min_amount NUMERIC(20,8) NOT NULL,
      max_amount NUMERIC(20,8) NULL,
      min_daily_rate_pct NUMERIC(20,8) NOT NULL,
      max_daily_rate_pct NUMERIC(20,8) NOT NULL,
      is_active BOOLEAN NOT NULL DEFAULT TRUE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT chk_tpt_tier_code CHECK (tier_code IN ('ALPHA_CORE', 'ALPHA_PRIME', 'ALPHA_SOVEREIGN')),
      CONSTRAINT chk_tpt_min_amount CHECK (min_amount > 0),
      CONSTRAINT chk_tpt_max_amount CHECK (max_amount IS NULL OR max_amount >= min_amount),
      CONSTRAINT chk_tpt_rate_range CHECK (min_daily_rate_pct >= 0 AND max_daily_rate_pct >= min_daily_rate_pct)
    );

    CREATE INDEX IF NOT EXISTS idx_trading_pool_tiers_active
      ON trading_pool_tiers (is_active, min_amount);

    CREATE TABLE IF NOT EXISTS daily_trading_yield_rates (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      trading_date DATE NOT NULL,
      tier_id UUID NOT NULL REFERENCES trading_pool_tiers(id) ON DELETE CASCADE,
      yield_rate_pct NUMERIC(20,8) NOT NULL,
      set_by_admin_id UUID NULL REFERENCES users(id) ON DELETE SET NULL,
      notes TEXT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT uq_daily_trading_yield_date_tier UNIQUE (trading_date, tier_id),
      CONSTRAINT chk_dtyr_yield_rate CHECK (yield_rate_pct >= 0 AND yield_rate_pct <= 100)
    );

    CREATE INDEX IF NOT EXISTS idx_dtyr_trading_date
      ON daily_trading_yield_rates (trading_date DESC);

    CREATE INDEX IF NOT EXISTS idx_dtyr_tier_date
      ON daily_trading_yield_rates (tier_id, trading_date DESC);

    CREATE TABLE IF NOT EXISTS user_trading_positions (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      tier_id UUID NOT NULL REFERENCES trading_pool_tiers(id) ON DELETE RESTRICT,
      principal_amount NUMERIC(20,8) NOT NULL,
      total_yield_earned NUMERIC(20,8) NOT NULL DEFAULT 0,
      status VARCHAR(20) NOT NULL DEFAULT 'ACTIVE',
      activated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
      unlock_eligible_at TIMESTAMPTZ NOT NULL DEFAULT (CURRENT_TIMESTAMP + INTERVAL '7 days'),
      last_settled_date DATE NULL,
      closed_at TIMESTAMPTZ NULL,
      redeemed_at TIMESTAMPTZ NULL,
      settlement_fee_pct NUMERIC(10,4) NOT NULL DEFAULT 0.0000,
      settlement_fee_usd NUMERIC(20,8) NOT NULL DEFAULT 0.00000000,
      net_redeemed_usd NUMERIC(20,8) NOT NULL DEFAULT 0.00000000,
      redemption_idempotency_key VARCHAR(128) NULL UNIQUE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT chk_utp_principal_positive CHECK (principal_amount > 0),
      CONSTRAINT chk_utp_total_yield_non_neg CHECK (total_yield_earned >= 0),
      CONSTRAINT chk_utp_status CHECK (status IN ('ACTIVE', 'CLOSED', 'REDEEMED'))
    );

    -- Idempotently add 7-day liquidity cycle & principal redemption columns on existing user_trading_positions tables
    ALTER TABLE user_trading_positions ADD COLUMN IF NOT EXISTS unlock_eligible_at TIMESTAMPTZ NULL;
    ALTER TABLE user_trading_positions ADD COLUMN IF NOT EXISTS redeemed_at TIMESTAMPTZ NULL;
    ALTER TABLE user_trading_positions ADD COLUMN IF NOT EXISTS settlement_fee_pct NUMERIC(10,4) NOT NULL DEFAULT 0.0000;
    ALTER TABLE user_trading_positions ADD COLUMN IF NOT EXISTS settlement_fee_usd NUMERIC(20,8) NOT NULL DEFAULT 0.00000000;
    ALTER TABLE user_trading_positions ADD COLUMN IF NOT EXISTS net_redeemed_usd NUMERIC(20,8) NOT NULL DEFAULT 0.00000000;
    ALTER TABLE user_trading_positions ADD COLUMN IF NOT EXISTS redemption_idempotency_key VARCHAR(128) NULL;

    UPDATE user_trading_positions
    SET unlock_eligible_at = activated_at + INTERVAL '7 days'
    WHERE unlock_eligible_at IS NULL;

    ALTER TABLE user_trading_positions ALTER COLUMN unlock_eligible_at SET DEFAULT (CURRENT_TIMESTAMP + INTERVAL '7 days');
    ALTER TABLE user_trading_positions ALTER COLUMN unlock_eligible_at SET NOT NULL;

    CREATE UNIQUE INDEX IF NOT EXISTS uq_utp_redemption_idempotency_key
      ON user_trading_positions (redemption_idempotency_key)
      WHERE redemption_idempotency_key IS NOT NULL;

    DO $$
    DECLARE
      c_name TEXT;
    BEGIN
      FOR c_name IN
        SELECT conname
        FROM pg_constraint
        WHERE conrelid = 'user_trading_positions'::regclass
          AND contype = 'c'
          AND pg_get_constraintdef(oid) ILIKE '%status%'
      LOOP
        EXECUTE format('ALTER TABLE user_trading_positions DROP CONSTRAINT IF EXISTS %I', c_name);
      END LOOP;

      ALTER TABLE user_trading_positions
        ADD CONSTRAINT chk_utp_status
        CHECK (status IN ('ACTIVE', 'CLOSED', 'REDEEMED'));
    END $$;

    CREATE INDEX IF NOT EXISTS idx_utp_user_status
      ON user_trading_positions (user_id, status);

    CREATE INDEX IF NOT EXISTS idx_utp_status_settled
      ON user_trading_positions (status, last_settled_date);

    CREATE INDEX IF NOT EXISTS idx_utp_tier_id
      ON user_trading_positions (tier_id);

    CREATE TABLE IF NOT EXISTS trading_yield_payouts (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      position_id UUID NOT NULL REFERENCES user_trading_positions(id) ON DELETE CASCADE,
      user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      trading_date DATE NOT NULL,
      applied_rate_pct NUMERIC(20,8) NOT NULL,
      yield_amount NUMERIC(20,8) NOT NULL,
      ledger_entry_id UUID NULL REFERENCES financial_ledger_entries(id) ON DELETE SET NULL,
      settled_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
      created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT uq_trading_yield_position_date UNIQUE (position_id, trading_date),
      CONSTRAINT chk_typ_applied_rate CHECK (applied_rate_pct >= 0),
      CONSTRAINT chk_typ_yield_amount CHECK (yield_amount >= 0)
    );

    CREATE INDEX IF NOT EXISTS idx_typ_user_date
      ON trading_yield_payouts (user_id, trading_date DESC);

    CREATE INDEX IF NOT EXISTS idx_typ_trading_date
      ON trading_yield_payouts (trading_date DESC);
  `);

  // 2. PHIVONEX CHRONO VAULTS™ (Time-Locked Staking — 7-Day Yield)
  await client.exec(`
    CREATE TABLE IF NOT EXISTS chrono_vault_plans (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      plan_code VARCHAR(50) UNIQUE NOT NULL,
      plan_name VARCHAR(100) NOT NULL,
      duration_days INT NOT NULL,
      daily_rate_pct NUMERIC(20,8) NOT NULL,
      min_amount NUMERIC(20,8) NOT NULL,
      return_principal_on_maturity BOOLEAN NOT NULL DEFAULT TRUE,
      is_active BOOLEAN NOT NULL DEFAULT TRUE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT chk_cvp_plan_code CHECK (plan_code IN ('CHRONO_200D', 'CHRONO_1Y', 'CHRONO_2Y', 'CHRONO_5Y', 'CHRONO_10Y')),
      CONSTRAINT chk_cvp_duration_days CHECK (duration_days > 0),
      CONSTRAINT chk_cvp_daily_rate CHECK (daily_rate_pct > 0 AND daily_rate_pct <= 100),
      CONSTRAINT chk_cvp_min_amount CHECK (min_amount > 0)
    );

    CREATE INDEX IF NOT EXISTS idx_chrono_vault_plans_active
      ON chrono_vault_plans (is_active, duration_days);

    CREATE TABLE IF NOT EXISTS user_vault_positions (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      plan_id UUID NOT NULL REFERENCES chrono_vault_plans(id) ON DELETE RESTRICT,
      principal_amount NUMERIC(20,8) NOT NULL,
      daily_rate_pct_snapshot NUMERIC(20,8) NOT NULL,
      total_yield_earned NUMERIC(20,8) NOT NULL DEFAULT 0,
      days_settled INT NOT NULL DEFAULT 0,
      status VARCHAR(20) NOT NULL DEFAULT 'ACTIVE',
      activated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
      maturity_at TIMESTAMPTZ NOT NULL,
      last_settled_date DATE NULL,
      principal_returned_at TIMESTAMPTZ NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT chk_uvp_principal_positive CHECK (principal_amount > 0),
      CONSTRAINT chk_uvp_rate_snapshot CHECK (daily_rate_pct_snapshot > 0),
      CONSTRAINT chk_uvp_total_yield_non_neg CHECK (total_yield_earned >= 0),
      CONSTRAINT chk_uvp_days_settled CHECK (days_settled >= 0),
      CONSTRAINT chk_uvp_status CHECK (status IN ('ACTIVE', 'MATURED'))
    );

    CREATE INDEX IF NOT EXISTS idx_uvp_user_status
      ON user_vault_positions (user_id, status);

    CREATE INDEX IF NOT EXISTS idx_uvp_status_maturity
      ON user_vault_positions (status, maturity_at);

    CREATE INDEX IF NOT EXISTS idx_uvp_plan_id
      ON user_vault_positions (plan_id);

    CREATE TABLE IF NOT EXISTS vault_yield_payouts (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      position_id UUID NOT NULL REFERENCES user_vault_positions(id) ON DELETE CASCADE,
      user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      epoch_date DATE NOT NULL,
      yield_amount NUMERIC(20,8) NOT NULL,
      ledger_entry_id UUID NULL REFERENCES financial_ledger_entries(id) ON DELETE SET NULL,
      settled_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
      created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT uq_vault_yield_position_epoch UNIQUE (position_id, epoch_date),
      CONSTRAINT chk_vyp_yield_amount CHECK (yield_amount >= 0)
    );

    CREATE INDEX IF NOT EXISTS idx_vyp_user_epoch
      ON vault_yield_payouts (user_id, epoch_date DESC);

    CREATE INDEX IF NOT EXISTS idx_vyp_epoch_date
      ON vault_yield_payouts (epoch_date DESC);
  `);

  // 3. 16-Generation Unilevel ROI-on-ROI Engine
  await client.exec(`
    CREATE TABLE IF NOT EXISTS unilevel_generation_configs (
      generation_level INT PRIMARY KEY,
      commission_pct NUMERIC(20,8) NOT NULL,
      required_direct_active_referrals INT NOT NULL DEFAULT 0,
      required_personal_active_usd NUMERIC(20,8) NOT NULL DEFAULT 0,
      is_active BOOLEAN NOT NULL DEFAULT TRUE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT chk_ugc_generation_level CHECK (generation_level BETWEEN 1 AND 16),
      CONSTRAINT chk_ugc_commission_pct CHECK (commission_pct >= 0 AND commission_pct <= 100),
      CONSTRAINT chk_ugc_req_directs CHECK (required_direct_active_referrals >= 0),
      CONSTRAINT chk_ugc_req_personal_usd CHECK (required_personal_active_usd >= 0)
    );

    CREATE TABLE IF NOT EXISTS unilevel_royalty_payouts (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      beneficiary_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      source_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      generation_level INT NOT NULL,
      source_product_type VARCHAR(50) NOT NULL,
      source_yield_id UUID NOT NULL,
      epoch_date DATE NOT NULL,
      source_yield_amount NUMERIC(20,8) NOT NULL,
      commission_pct NUMERIC(20,8) NOT NULL,
      royalty_amount NUMERIC(20,8) NOT NULL,
      currency VARCHAR(20) NOT NULL DEFAULT 'USDT',
      status VARCHAR(20) NOT NULL DEFAULT 'SETTLED',
      ledger_entry_id UUID NULL REFERENCES financial_ledger_entries(id) ON DELETE SET NULL,
      settled_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
      created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT chk_urp_generation_level CHECK (generation_level BETWEEN 1 AND 16),
      CONSTRAINT chk_urp_source_product CHECK (source_product_type IN ('GENESIS_NODE', 'TRADING_POOL', 'CHRONO_VAULT')),
      CONSTRAINT chk_urp_source_yield_amt CHECK (source_yield_amount >= 0),
      CONSTRAINT chk_urp_commission_pct CHECK (commission_pct >= 0 AND commission_pct <= 100),
      CONSTRAINT chk_urp_royalty_amt CHECK (royalty_amount >= 0),
      CONSTRAINT chk_urp_currency CHECK (currency IN ('USDT', 'USD', 'PHIVO')),
      CONSTRAINT chk_urp_status CHECK (status IN ('SETTLED', 'SKIPPED_LOCKED', 'FLUSHED', 'REVERSED')),
      CONSTRAINT chk_urp_no_self_royalty CHECK (beneficiary_user_id != source_user_id),
      CONSTRAINT uq_unilevel_royalty_source_gen UNIQUE (source_product_type, source_yield_id, beneficiary_user_id, generation_level)
    );

    ALTER TABLE unilevel_royalty_payouts DROP CONSTRAINT IF EXISTS chk_urp_status;
    ALTER TABLE unilevel_royalty_payouts ADD CONSTRAINT chk_urp_status CHECK (status IN ('SETTLED', 'SKIPPED_LOCKED', 'FLUSHED', 'REVERSED'));

    CREATE INDEX IF NOT EXISTS idx_urp_beneficiary_epoch
      ON unilevel_royalty_payouts (beneficiary_user_id, epoch_date DESC);

    CREATE INDEX IF NOT EXISTS idx_urp_source_user
      ON unilevel_royalty_payouts (source_user_id, epoch_date DESC);

    CREATE INDEX IF NOT EXISTS idx_urp_beneficiary_gen
      ON unilevel_royalty_payouts (beneficiary_user_id, generation_level);

    CREATE INDEX IF NOT EXISTS idx_urp_epoch_product
      ON unilevel_royalty_payouts (epoch_date DESC, source_product_type);
  `);

  // 4. Unilevel Leadership Ranks & Global Turnover Pool (7 Ranks 0..6 / 40% Cap)
  await client.exec(`
    CREATE TABLE IF NOT EXISTS unilevel_leadership_ranks (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      rank_level INT UNIQUE NOT NULL,
      rank_code VARCHAR(50) UNIQUE NOT NULL,
      rank_name VARCHAR(100) NOT NULL,
      required_personal_volume_usd NUMERIC(20,8) NOT NULL DEFAULT 0,
      required_team_volume_usd NUMERIC(20,8) NOT NULL DEFAULT 0,
      max_single_leg_cap_pct NUMERIC(20,8) NOT NULL DEFAULT 40.00000000,
      required_direct_active_legs INT NOT NULL DEFAULT 0,
      required_sub_rank_code VARCHAR(50) NULL,
      required_sub_rank_legs INT NOT NULL DEFAULT 0,
      milestone_bonus_usd NUMERIC(20,8) NOT NULL DEFAULT 0,
      global_pool_share_pct NUMERIC(20,8) NOT NULL DEFAULT 0,
      reward_description TEXT NULL,
      is_active BOOLEAN NOT NULL DEFAULT TRUE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT chk_ulr_rank_level CHECK (rank_level BETWEEN 0 AND 6),
      CONSTRAINT chk_ulr_req_personal CHECK (required_personal_volume_usd >= 0),
      CONSTRAINT chk_ulr_req_team CHECK (required_team_volume_usd >= 0),
      CONSTRAINT chk_ulr_leg_cap CHECK (max_single_leg_cap_pct > 0 AND max_single_leg_cap_pct <= 100),
      CONSTRAINT chk_ulr_req_legs CHECK (required_direct_active_legs >= 0),
      CONSTRAINT chk_ulr_milestone_bonus CHECK (milestone_bonus_usd >= 0),
      CONSTRAINT chk_ulr_pool_share CHECK (global_pool_share_pct >= 0 AND global_pool_share_pct <= 100)
    );

    ALTER TABLE unilevel_leadership_ranks ADD COLUMN IF NOT EXISTS required_sub_rank_code VARCHAR(50) NULL;
    ALTER TABLE unilevel_leadership_ranks ADD COLUMN IF NOT EXISTS required_sub_rank_legs INT NOT NULL DEFAULT 0;
    ALTER TABLE unilevel_leadership_ranks ADD COLUMN IF NOT EXISTS reward_description TEXT NULL;
    ALTER TABLE unilevel_leadership_ranks DROP CONSTRAINT IF EXISTS chk_ulr_rank_level;

    CREATE TABLE IF NOT EXISTS user_unilevel_ranks (
      user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
      current_rank_level INT NOT NULL DEFAULT 0,
      current_rank_code VARCHAR(50) NOT NULL DEFAULT 'INITIATE_MEMBER',
      personal_active_volume_usd NUMERIC(20,8) NOT NULL DEFAULT 0,
      raw_team_volume_usd NUMERIC(20,8) NOT NULL DEFAULT 0,
      qualified_team_volume_usd NUMERIC(20,8) NOT NULL DEFAULT 0,
      strongest_leg_volume_usd NUMERIC(20,8) NOT NULL DEFAULT 0,
      other_legs_volume_usd NUMERIC(20,8) NOT NULL DEFAULT 0,
      last_evaluated_at TIMESTAMPTZ NULL,
      promoted_at TIMESTAMPTZ NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT chk_uur_rank_level CHECK (current_rank_level BETWEEN 0 AND 6),
      CONSTRAINT chk_uur_volumes_non_neg CHECK (
        personal_active_volume_usd >= 0 AND
        raw_team_volume_usd >= 0 AND
        qualified_team_volume_usd >= 0 AND
        strongest_leg_volume_usd >= 0 AND
        other_legs_volume_usd >= 0
      )
    );

    ALTER TABLE user_unilevel_ranks DROP CONSTRAINT IF EXISTS chk_uur_rank_level;
    ALTER TABLE user_unilevel_ranks ADD CONSTRAINT chk_uur_rank_level CHECK (current_rank_level BETWEEN 0 AND 6);

    CREATE INDEX IF NOT EXISTS idx_uur_rank_level
      ON user_unilevel_ranks (current_rank_level DESC);

    CREATE TABLE IF NOT EXISTS unilevel_rank_milestone_payouts (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      rank_id UUID NOT NULL REFERENCES unilevel_leadership_ranks(id) ON DELETE RESTRICT,
      rank_level INT NOT NULL,
      rank_code VARCHAR(50) NOT NULL,
      qualified_team_volume_usd NUMERIC(20,8) NOT NULL,
      bonus_amount_usd NUMERIC(20,8) NOT NULL,
      ledger_entry_id UUID NULL REFERENCES financial_ledger_entries(id) ON DELETE SET NULL,
      awarded_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
      created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT uq_unilevel_rank_milestone_user_rank UNIQUE (user_id, rank_level),
      CONSTRAINT chk_urmp_rank_level CHECK (rank_level BETWEEN 0 AND 6),
      CONSTRAINT chk_urmp_qualified_vol CHECK (qualified_team_volume_usd >= 0),
      CONSTRAINT chk_urmp_bonus_amt CHECK (bonus_amount_usd >= 0)
    );

    ALTER TABLE unilevel_rank_milestone_payouts DROP CONSTRAINT IF EXISTS chk_urmp_rank_level;
    ALTER TABLE unilevel_rank_milestone_payouts ADD CONSTRAINT chk_urmp_rank_level CHECK (rank_level BETWEEN 0 AND 6);

    CREATE INDEX IF NOT EXISTS idx_urmp_user_id
      ON unilevel_rank_milestone_payouts (user_id, rank_level);

    CREATE TABLE IF NOT EXISTS global_turnover_pool_distributions (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      period_key VARCHAR(30) UNIQUE NOT NULL,
      period_start DATE NOT NULL,
      period_end DATE NOT NULL,
      total_ecosystem_turnover_usd NUMERIC(20,8) NOT NULL DEFAULT 0,
      pool_allocation_pct NUMERIC(20,8) NOT NULL DEFAULT 0,
      total_pool_amount_usd NUMERIC(20,8) NOT NULL DEFAULT 0,
      total_distributed_usd NUMERIC(20,8) NOT NULL DEFAULT 0,
      status VARCHAR(20) NOT NULL DEFAULT 'COMPLETED',
      settled_at TIMESTAMPTZ NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT chk_gtpd_status CHECK (status IN ('OPEN', 'COMPLETED')),
      CONSTRAINT chk_gtpd_amounts CHECK (
        total_ecosystem_turnover_usd >= 0 AND
        pool_allocation_pct >= 0 AND
        total_pool_amount_usd >= 0 AND
        total_distributed_usd >= 0
      )
    );

    CREATE TABLE IF NOT EXISTS global_turnover_pool_payouts (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      distribution_id UUID NOT NULL REFERENCES global_turnover_pool_distributions(id) ON DELETE CASCADE,
      user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      rank_level INT NOT NULL,
      rank_code VARCHAR(50) NOT NULL,
      payout_amount_usd NUMERIC(20,8) NOT NULL,
      ledger_entry_id UUID NULL REFERENCES financial_ledger_entries(id) ON DELETE SET NULL,
      settled_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
      created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT uq_global_pool_payout_dist_user_rank UNIQUE (distribution_id, user_id, rank_level),
      CONSTRAINT chk_gtpp_rank_level CHECK (rank_level BETWEEN 0 AND 6),
      CONSTRAINT chk_gtpp_payout_amt CHECK (payout_amount_usd >= 0)
    );

    ALTER TABLE global_turnover_pool_payouts DROP CONSTRAINT IF EXISTS chk_gtpp_rank_level;
    ALTER TABLE global_turnover_pool_payouts ADD CONSTRAINT chk_gtpp_rank_level CHECK (rank_level BETWEEN 0 AND 6);

    CREATE INDEX IF NOT EXISTS idx_gtpp_user_id
      ON global_turnover_pool_payouts (user_id, settled_at DESC);
  `);

  // 5. Founders' Council & Ecosystem Yield Settlement Epoch Locks
  await client.exec(`
    CREATE TABLE IF NOT EXISTS founders_council_members (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id UUID UNIQUE NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      seat_number INT UNIQUE NOT NULL,
      share_weight NUMERIC(20,8) NOT NULL DEFAULT 1.00000000,
      status VARCHAR(20) NOT NULL DEFAULT 'ACTIVE',
      inducted_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
      notes TEXT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT chk_fcm_seat_number CHECK (seat_number > 0),
      CONSTRAINT chk_fcm_share_weight CHECK (share_weight > 0),
      CONSTRAINT chk_fcm_status CHECK (status IN ('ACTIVE', 'SUSPENDED', 'REVOKED'))
    );

    CREATE TABLE IF NOT EXISTS founders_council_dividend_payouts (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      member_id UUID NOT NULL REFERENCES founders_council_members(id) ON DELETE CASCADE,
      user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      period_key VARCHAR(30) NOT NULL,
      dividend_amount_usd NUMERIC(20,8) NOT NULL,
      ledger_entry_id UUID NULL REFERENCES financial_ledger_entries(id) ON DELETE SET NULL,
      settled_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
      created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT uq_founders_dividend_member_period UNIQUE (member_id, period_key),
      CONSTRAINT chk_fcdp_dividend_amt CHECK (dividend_amount_usd >= 0)
    );

    CREATE INDEX IF NOT EXISTS idx_fcdp_user_id
      ON founders_council_dividend_payouts (user_id, settled_at DESC);

    CREATE TABLE IF NOT EXISTS ecosystem_yield_settlement_cycles (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      epoch_date DATE NOT NULL,
      engine_type VARCHAR(50) NOT NULL,
      status VARCHAR(20) NOT NULL DEFAULT 'RUNNING',
      positions_processed INT NOT NULL DEFAULT 0,
      total_yield_distributed NUMERIC(20,8) NOT NULL DEFAULT 0,
      total_royalty_distributed NUMERIC(20,8) NOT NULL DEFAULT 0,
      started_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
      completed_at TIMESTAMPTZ NULL,
      error_message TEXT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT uq_ecosystem_yield_cycle_date_engine UNIQUE (epoch_date, engine_type),
      CONSTRAINT chk_eysc_engine_type CHECK (engine_type IN ('TRADING_POOL', 'CHRONO_VAULT', 'GENESIS_NODE', 'UNILEVEL_ROYALTY', 'LEADERSHIP_RANK')),
      CONSTRAINT chk_eysc_status CHECK (status IN ('RUNNING', 'COMPLETED', 'FAILED')),
      CONSTRAINT chk_eysc_metrics CHECK (
        positions_processed >= 0 AND
        total_yield_distributed >= 0 AND
        total_royalty_distributed >= 0
      )
    );

    CREATE INDEX IF NOT EXISTS idx_eysc_epoch_date
      ON ecosystem_yield_settlement_cycles (epoch_date DESC, engine_type);
  `);

  // 6. TASK-03 Enterprise Security, Circuit-Breaker & Master Ecosystem Feature Switches Tables
  await client.exec(`
    CREATE TABLE IF NOT EXISTS system_circuit_breaker_configs (
      id INT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
      min_reserve_ratio NUMERIC(20,8) NOT NULL DEFAULT 1.25000000,
      max_hourly_outflow_usd NUMERIC(20,8) NOT NULL DEFAULT 25000.00000000,
      max_user_daily_withdrawal_usd NUMERIC(20,8) NOT NULL DEFAULT 10000.00000000,
      withdrawal_mode VARCHAR(32) NOT NULL DEFAULT 'AUTO' CHECK (withdrawal_mode IN ('AUTO', 'MANUAL_REVIEW', 'PAUSED_OFF')),
      trip_reason TEXT NULL,
      tripped_at TIMESTAMPTZ NULL,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    -- Idempotently widen withdrawal_mode check constraint to support PAUSED_OFF
    DO $$
    DECLARE
      c_name TEXT;
    BEGIN
      FOR c_name IN
        SELECT conname
        FROM pg_constraint
        WHERE conrelid = 'system_circuit_breaker_configs'::regclass
          AND contype = 'c'
          AND pg_get_constraintdef(oid) ILIKE '%withdrawal_mode%'
      LOOP
        EXECUTE format('ALTER TABLE system_circuit_breaker_configs DROP CONSTRAINT IF EXISTS %I', c_name);
      END LOOP;

      ALTER TABLE system_circuit_breaker_configs
        ADD CONSTRAINT chk_scbc_withdrawal_mode
        CHECK (withdrawal_mode IN ('AUTO', 'MANUAL_REVIEW', 'PAUSED_OFF'));
    END $$;

    CREATE TABLE IF NOT EXISTS ecosystem_feature_switches (
      switch_key VARCHAR(80) PRIMARY KEY,
      is_enabled BOOLEAN NOT NULL DEFAULT TRUE,
      category VARCHAR(40) NOT NULL,
      label VARCHAR(140) NOT NULL,
      description TEXT NULL,
      updated_by_admin_id UUID NULL REFERENCES users(id) ON DELETE SET NULL,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS unilevel_master_configs (
      config_key VARCHAR(80) PRIMARY KEY,
      config_value NUMERIC(20,8) NOT NULL,
      description TEXT NULL,
      updated_by_admin_id UUID NULL REFERENCES users(id) ON DELETE SET NULL,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS wallet_signing_nonces (
      chain_id INT PRIMARY KEY,
      wallet_address VARCHAR(64) NOT NULL,
      next_nonce BIGINT NOT NULL DEFAULT 0,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS security_audit_logs (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      trace_id VARCHAR(128) NOT NULL,
      actor_user_id UUID NULL,
      action_type VARCHAR(128) NOT NULL,
      severity VARCHAR(16) NOT NULL CHECK (severity IN ('INFO', 'WARN', 'CRITICAL')),
      payload JSONB NOT NULL DEFAULT '{}'::jsonb,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE INDEX IF NOT EXISTS idx_sal_created_at
      ON security_audit_logs (created_at DESC);

    CREATE INDEX IF NOT EXISTS idx_sal_action_type
      ON security_audit_logs (action_type, created_at DESC);

    CREATE INDEX IF NOT EXISTS idx_sal_actor_user
      ON security_audit_logs (actor_user_id, created_at DESC);

    CREATE TABLE IF NOT EXISTS unilevel_yield_events (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      source_product_type VARCHAR(32) NOT NULL CHECK (source_product_type IN ('GENESIS_NODE', 'TRADING_POOL', 'CHRONO_VAULT')),
      source_yield_id UUID NOT NULL,
      source_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      epoch_date DATE NOT NULL,
      source_roi_usd NUMERIC(20,8) NOT NULL CHECK (source_roi_usd > 0),
      raw_token_amount NUMERIC(20,8) NULL,
      token_reference_price_usd NUMERIC(20,8) NULL,
      processing_status VARCHAR(24) NOT NULL DEFAULT 'PENDING' CHECK (processing_status IN ('PENDING', 'PROCESSED', 'SKIPPED')),
      processed_at TIMESTAMPTZ NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      CONSTRAINT uq_unilevel_yield_events_product_yield UNIQUE (source_product_type, source_yield_id)
    );

    CREATE INDEX IF NOT EXISTS idx_uye_status_epoch
      ON unilevel_yield_events (processing_status, epoch_date ASC, created_at ASC);

    CREATE INDEX IF NOT EXISTS idx_uye_source_user
      ON unilevel_yield_events (source_user_id, epoch_date DESC);

    -- 6b. Canonical Unilevel Tree Reconstruction Telemetry Columns on user_referrals
    ALTER TABLE user_referrals ADD COLUMN IF NOT EXISTS direct_referrals_count INT NOT NULL DEFAULT 0;
    ALTER TABLE user_referrals ADD COLUMN IF NOT EXISTS active_direct_referrals_count INT NOT NULL DEFAULT 0;
    ALTER TABLE user_referrals ADD COLUMN IF NOT EXISTS unilevel_rebuilt_at TIMESTAMPTZ NULL;

    -- 6c. Genesis Node Backfill & Reward Wallet Tracking Columns on nodes
    ALTER TABLE nodes ADD COLUMN IF NOT EXISTS accrued_phivo NUMERIC(20,8) NOT NULL DEFAULT 0.00000000;
    ALTER TABLE nodes ADD COLUMN IF NOT EXISTS claimed_phivo NUMERIC(20,8) NOT NULL DEFAULT 0.00000000;
    ALTER TABLE nodes ADD COLUMN IF NOT EXISTS last_reward_date DATE NULL;

    -- 6d. Secure User-to-User (P2P) Internal Transfers Table (USDT & PHIVO)
    CREATE TABLE IF NOT EXISTS p2p_internal_transfers (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      transfer_ref VARCHAR(32) UNIQUE NOT NULL,
      sender_user_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
      recipient_user_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
      asset_type VARCHAR(16) NOT NULL,
      gross_amount NUMERIC(20,8) NOT NULL,
      fee_amount NUMERIC(20,8) NOT NULL DEFAULT 0.00000000,
      net_amount NUMERIC(20,8) NOT NULL,
      note VARCHAR(160) NULL,
      idempotency_key VARCHAR(128) UNIQUE NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      CONSTRAINT chk_p2p_asset_type CHECK (asset_type IN ('USDT', 'PHIVO')),
      CONSTRAINT chk_p2p_not_self CHECK (sender_user_id <> recipient_user_id),
      CONSTRAINT chk_p2p_positive_amounts CHECK (gross_amount > 0 AND fee_amount >= 0 AND net_amount > 0)
    );

    CREATE INDEX IF NOT EXISTS idx_p2p_sender_created
      ON p2p_internal_transfers (sender_user_id, created_at DESC);

    CREATE INDEX IF NOT EXISTS idx_p2p_recipient_created
      ON p2p_internal_transfers (recipient_user_id, created_at DESC);
  `);

  // 7. Seed Canonical Master Configurations Idempotently (ON CONFLICT DO NOTHING preserves live Admin edits)
  await seedTask03CanonicalMasterConfigs(client);
}

async function seedTask03CanonicalMasterConfigs(client: DatabaseClient): Promise<void> {
  // 7a. Seed PHIVONEX QUANTUM ALPHA™ Trading Pool Tiers (preserve live admin updates)
  await client.exec(`
    INSERT INTO trading_pool_tiers (
      id, tier_code, tier_name, min_amount, max_amount, min_daily_rate_pct, max_daily_rate_pct, is_active, updated_at
    ) VALUES
      ('a1000001-0000-4000-8000-000000000001', 'ALPHA_CORE',      'Alpha Core',        200.00000000, 1000.00000000, 0.30000000, 0.45000000, TRUE, CURRENT_TIMESTAMP),
      ('a1000001-0000-4000-8000-000000000002', 'ALPHA_PRIME',     'Alpha Prime',      1000.00000001, 5000.00000000, 0.50000000, 0.90000000, TRUE, CURRENT_TIMESTAMP),
      ('a1000001-0000-4000-8000-000000000003', 'ALPHA_SOVEREIGN', 'Alpha Sovereign',  5000.00000001, NULL,          0.85000000, 1.00000000, TRUE, CURRENT_TIMESTAMP)
    ON CONFLICT (tier_code) DO NOTHING;
  `);

  // 7b. Seed PHIVONEX CHRONO VAULTS™ Plans (preserve live admin updates)
  await client.exec(`
    INSERT INTO chrono_vault_plans (
      id, plan_code, plan_name, duration_days, daily_rate_pct, min_amount, return_principal_on_maturity, is_active, updated_at
    ) VALUES
      ('c2000001-0000-4000-8000-000000000001', 'CHRONO_200D', 'Chrono Bronze Vault',    200,  0.35000000, 100.00000000, TRUE, TRUE, CURRENT_TIMESTAMP),
      ('c2000001-0000-4000-8000-000000000002', 'CHRONO_1Y',   'Chrono Silver Vault',    365,  0.45000000, 100.00000000, TRUE, TRUE, CURRENT_TIMESTAMP),
      ('c2000001-0000-4000-8000-000000000003', 'CHRONO_2Y',   'Chrono Cyan Vault',      730,  0.55000000, 100.00000000, TRUE, TRUE, CURRENT_TIMESTAMP),
      ('c2000001-0000-4000-8000-000000000004', 'CHRONO_5Y',   'Chrono Gold Vault',     1825,  0.65000000, 100.00000000, TRUE, TRUE, CURRENT_TIMESTAMP),
      ('c2000001-0000-4000-8000-000000000005', 'CHRONO_10Y',  'Chrono Sovereign Vault',3650,  0.80000000, 100.00000000, TRUE, TRUE, CURRENT_TIMESTAMP)
    ON CONFLICT (plan_code) DO NOTHING;
  `);

  // 7c. Seed 16-Generation Unilevel ROI-on-ROI Schedule (Total Sum = 40.00000000%, preserve live admin updates)
  await client.exec(`
    INSERT INTO unilevel_generation_configs (
      generation_level, commission_pct, required_direct_active_referrals, required_personal_active_usd, is_active, updated_at
    ) VALUES
      (1,  10.00000000,  1,  200.00000000, TRUE, CURRENT_TIMESTAMP),
      (2,   6.00000000,  2,  200.00000000, TRUE, CURRENT_TIMESTAMP),
      (3,   4.00000000,  3,  500.00000000, TRUE, CURRENT_TIMESTAMP),
      (4,   3.00000000,  4,  500.00000000, TRUE, CURRENT_TIMESTAMP),
      (5,   2.50000000,  5, 1000.00000000, TRUE, CURRENT_TIMESTAMP),
      (6,   2.00000000,  6, 1000.00000000, TRUE, CURRENT_TIMESTAMP),
      (7,   2.00000000,  7, 1500.00000000, TRUE, CURRENT_TIMESTAMP),
      (8,   1.50000000,  8, 1500.00000000, TRUE, CURRENT_TIMESTAMP),
      (9,   1.50000000,  9, 2000.00000000, TRUE, CURRENT_TIMESTAMP),
      (10,  1.50000000, 10, 2500.00000000, TRUE, CURRENT_TIMESTAMP),
      (11,  1.00000000, 11, 3000.00000000, TRUE, CURRENT_TIMESTAMP),
      (12,  1.00000000, 12, 3500.00000000, TRUE, CURRENT_TIMESTAMP),
      (13,  1.00000000, 13, 4000.00000000, TRUE, CURRENT_TIMESTAMP),
      (14,  1.00000000, 14, 4500.00000000, TRUE, CURRENT_TIMESTAMP),
      (15,  1.00000000, 15, 5000.00000000, TRUE, CURRENT_TIMESTAMP),
      (16,  1.00000000, 16, 5000.00000000, TRUE, CURRENT_TIMESTAMP)
    ON CONFLICT (generation_level) DO NOTHING;
  `);

  // 7d. Ensure Rank constraint 0..6 and Seed 7 Canonical Unilevel Leadership Ranks (preserve live admin updates)
  await client.exec(`
    DELETE FROM unilevel_leadership_ranks WHERE rank_level NOT BETWEEN 0 AND 6;

    ALTER TABLE unilevel_leadership_ranks DROP CONSTRAINT IF EXISTS chk_ulr_rank_level;
    ALTER TABLE unilevel_leadership_ranks ADD CONSTRAINT chk_ulr_rank_level CHECK (rank_level BETWEEN 0 AND 6);

    INSERT INTO unilevel_leadership_ranks (
      id, rank_level, rank_code, rank_name,
      required_personal_volume_usd, required_team_volume_usd,
      max_single_leg_cap_pct, required_direct_active_legs,
      required_sub_rank_code, required_sub_rank_legs,
      milestone_bonus_usd, global_pool_share_pct, reward_description, is_active, updated_at
    ) VALUES
      ('d3000001-0000-4000-8000-000000000000', 0, 'INITIATE_MEMBER',      'Initiate Member',         0.00000000,      0.00000000, 40.00000000, 0, NULL,                 0,      0.00000000, 0.00000000, 'Base Unilevel Operator Status', TRUE, CURRENT_TIMESTAMP),
      ('d3000001-0000-4000-8000-000000000001', 1, 'QUANTUM_ARCHITECT',    'Quantum Architect',     500.00000000,  25000.00000000, 40.00000000, 2, NULL,                 0,   1000.00000000, 0.00000000, '$1,000 Milestone Reward', TRUE, CURRENT_TIMESTAMP),
      ('d3000001-0000-4000-8000-000000000002', 2, 'APEX_STRATEGIST',      'Apex Strategist',      1000.00000000, 100000.00000000, 40.00000000, 2, NULL,                 0,   5000.00000000, 0.00000000, '$5,000 Milestone Reward', TRUE, CURRENT_TIMESTAMP),
      ('d3000001-0000-4000-8000-000000000003', 3, 'VANGUARD_COMMANDER',   'Vanguard Commander',   2500.00000000, 350000.00000000, 40.00000000, 3, NULL,                 0,  15000.00000000, 0.00000000, '$15,000 Milestone Reward', TRUE, CURRENT_TIMESTAMP),
      ('d3000001-0000-4000-8000-000000000004', 4, 'SOVEREIGN_MARSHAL',    'Sovereign Marshal',    2500.00000000,      0.00000000, 40.00000000, 3, 'VANGUARD_COMMANDER', 3,  40000.00000000, 0.00000000, '3 Distinct Legs with 1 Vanguard Commander each — $40,000 (or Luxury Car/Tour)', TRUE, CURRENT_TIMESTAMP),
      ('d3000001-0000-4000-8000-000000000005', 5, 'GLOBAL_AMBASSADOR',    'Global Ambassador',    5000.00000000,      0.00000000, 40.00000000, 3, 'SOVEREIGN_MARSHAL',  3, 100000.00000000, 0.00000000, '3 Distinct Legs with 1 Sovereign Marshal each — $100,000 (or Luxury Award)', TRUE, CURRENT_TIMESTAMP),
      ('d3000001-0000-4000-8000-000000000006', 6, 'TITAN_APEX_SOVEREIGN', 'Titan Apex Sovereign', 5000.00000000,      0.00000000, 40.00000000, 3, 'GLOBAL_AMBASSADOR',  3, 250000.00000000, 2.00000000, '3 Distinct Legs with 1 Global Ambassador each — $250,000 + Global Revenue Share Pool', TRUE, CURRENT_TIMESTAMP)
    ON CONFLICT (rank_level) DO NOTHING;
  `);

  // 7e. Seed Default System Circuit Breaker Config (id = 1, preserve live admin updates)
  await client.exec(`
    INSERT INTO system_circuit_breaker_configs (
      id, min_reserve_ratio, max_hourly_outflow_usd, max_user_daily_withdrawal_usd, withdrawal_mode, updated_at
    ) VALUES (
      1, 1.25000000, 25000.00000000, 10000.00000000, 'AUTO', NOW()
    )
    ON CONFLICT (id) DO NOTHING;
  `);

  // 7f. Seed All 11 Master Ecosystem Feature ON/OFF Switches (preserve live admin toggles)
  await client.exec(`
    INSERT INTO ecosystem_feature_switches (
      switch_key, is_enabled, category, label, description, updated_at
    ) VALUES
      ('quantum_alpha_subscriptions_enabled', TRUE, 'PRODUCTS',   'Quantum Alpha™ Subscriptions',         'Enable or pause new USDT capital allocations into PHIVONEX QUANTUM ALPHA™ Trading Pool tiers.', NOW()),
      ('quantum_alpha_yield_enabled',         TRUE, 'YIELD',      'Quantum Alpha™ Daily Yield Engine',    'Enable or pause Mon–Fri UTC daily trading yield settlement across all active trading positions.', NOW()),
      ('chrono_vaults_subscriptions_enabled', TRUE, 'PRODUCTS',   'Chrono Vaults™ Subscriptions',         'Enable or pause new time-locked staking subscriptions across all PHIVONEX CHRONO VAULTS™ plans.', NOW()),
      ('chrono_vaults_yield_enabled',         TRUE, 'YIELD',      'Chrono Vaults™ Daily Yield Engine',    'Enable or pause 7-day UTC daily staking yield settlement & maturity principal returns.', NOW()),
      ('genesis_node_purchase_enabled',       TRUE, 'PRODUCTS',   'Genesis Core™ Node Purchases',         'Enable or pause new Genesis Node minting, reservations, and balance activations.', NOW()),
      ('genesis_node_emission_enabled',       TRUE, 'YIELD',      'Genesis Core™ Daily PHIVO Emission',   'Enable or pause daily PHIVO coin emissions for all active Genesis Core™ validator nodes.', NOW()),
      ('phivo_instant_swap_enabled',          TRUE, 'TREASURY',   'PHIVO Instant Swap Engine',            'Enable or pause instant bidirectional PHIVO <-> USDT swaps in the wallet treasury.', NOW()),
      ('unilevel_royalty_engine_enabled',     TRUE, 'AFFILIATE',  '16-Gen Unilevel Royalty Engine',       'Master switch for asset-matched 16-generation ROI-on-ROI affiliate commission distribution.', NOW()),
      ('leadership_rank_engine_enabled',      TRUE, 'AFFILIATE',  '7-Stage Leadership Rank Engine',       'Master switch for automated 7-stage career rank promotions and one-time milestone payouts.', NOW()),
      ('internal_compounding_enabled',        TRUE, 'TREASURY',   'Internal Wallet Compounding',          'Enable or pause instant reinvestment from Main USDT Wallet into Trading Pool or Chrono Vaults.', NOW()),
      ('bep20_deposits_enabled',              TRUE, 'TREASURY',   'BEP-20 Blockchain Deposits',           'Enable or pause BSC (BEP-20) USDT/BNB deposit ingestion and manual TxHash verification.', NOW()),
      ('p2p_internal_transfers_enabled',      TRUE, 'TREASURY',   'User-to-User (P2P) Internal Transfers','Enable or pause instant zero-sum P2P USDT & PHIVO balance transfers between platform members.', NOW())
    ON CONFLICT (switch_key) DO NOTHING;

    INSERT INTO unilevel_master_configs (
      config_key, config_value, description, updated_at
    ) VALUES
      ('alpha_redemption_fee_pct', 15.00000000, 'Total Quantum Alpha™ principal redemption settlement fee percentage (7.50% Liquidity Exit + 4.50% Institutional Clearing + 3.00% Custody Reserve)', NOW()),
      ('p2p_transfer_fee_pct',      0.00000000, 'Internal P2P transfer settlement fee percentage (0.00% default; configurable by Super Admin)', NOW())
    ON CONFLICT (config_key) DO NOTHING;
  `);

  // 7g. Ensure Canonical PHIVONEX GENESIS CORE™ Economic Parameters (10,000 Cap, $1,000 Price, 15 PHIVO/day, $0.10 Reference Price)
  try {
    await client.exec(`
      INSERT INTO system_economic_configs (
        id, config_key, config_value, category, description, status, version, effective_from, updated_by_admin_public_id, created_at, updated_at
      ) VALUES
        (gen_random_uuid(), 'GENESIS_NODE_CAP', '10000', 'NODES', 'Total immutable Genesis Node cap (PHX-NODE-000001 to PHX-NODE-010000)', 'ACTIVE', 1, NOW(), 'SYSTEM_INIT', NOW(), NOW()),
        (gen_random_uuid(), 'NODE_BASE_PRICE_USD', '1000', 'NODES', 'Base price per Genesis Node in USD/USDT', 'ACTIVE', 1, NOW(), 'SYSTEM_INIT', NOW(), NOW()),
        (gen_random_uuid(), 'NODE_REWARD_RATE_PER_EPOCH', '15', 'REWARDS', 'Daily PHIVO reward rate per active Genesis Node (15 PHIVO/day)', 'ACTIVE', 1, NOW(), 'SYSTEM_INIT', NOW(), NOW()),
        (gen_random_uuid(), 'INTERNAL_COIN_PRICE_USDT', '{"priceUsdt":0.10,"swapEnabled":true}', 'TOKENOMICS', 'PHIVO reference price in USDT ($0.10 USDT)', 'ACTIVE', 1, NOW(), 'SYSTEM_INIT', NOW(), NOW())
      ON CONFLICT (config_key) DO NOTHING;
    `);
  } catch (err) {
    console.warn('[DB Migration Task-06] Notice syncing system_economic_configs Genesis defaults:', err);
  }

  // 8. Admin-Controlled Overview Promo & Supply Spotlight Banners Table
  await client.exec(`
    CREATE TABLE IF NOT EXISTS ecosystem_promo_banners (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      slug VARCHAR(64) UNIQUE NULL,
      title VARCHAR(200) NOT NULL,
      subtitle TEXT NOT NULL,
      badge_text VARCHAR(64) NOT NULL DEFAULT 'ECOSYSTEM SPOTLIGHT',
      cta_label VARCHAR(64) NOT NULL DEFAULT 'Explore Now',
      target_tab VARCHAR(64) NOT NULL DEFAULT 'products:alpha',
      accent_theme VARCHAR(32) NOT NULL DEFAULT 'cyan',
      show_node_scarcity BOOLEAN NOT NULL DEFAULT FALSE,
      is_active BOOLEAN NOT NULL DEFAULT TRUE,
      sort_order INT NOT NULL DEFAULT 10,
      updated_by_admin_id UUID NULL REFERENCES users(id) ON DELETE SET NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      CONSTRAINT chk_epb_accent_theme CHECK (accent_theme IN ('cyan', 'emerald', 'gold'))
    );

    CREATE INDEX IF NOT EXISTS idx_epb_active_sort
      ON ecosystem_promo_banners (is_active, sort_order ASC, created_at ASC);

    INSERT INTO ecosystem_promo_banners (
      id, slug, title, subtitle, badge_text, cta_label, target_tab, accent_theme, show_node_scarcity, is_active, sort_order, updated_at
    ) VALUES
      (
        'e4000001-0000-4000-8000-000000000001',
        'quantum-alpha-spotlight',
        'PHIVONEX QUANTUM ALPHA™ — Weekly 7-Day Liquidity Cycle',
        'Deploy from $200 USDT into institutional Mon–Fri trading sessions with weekly principal liquidity.',
        'HOT ECOSYSTEM POOL',
        'Allocate Now',
        'products:alpha',
        'cyan',
        FALSE,
        TRUE,
        1,
        NOW()
      ),
      (
        'e4000001-0000-4000-8000-000000000002',
        'genesis-core-scarcity',
        'GENESIS CORE™ NODES — Limited Global Supply (10,000 Cap)',
        'Mint your serialized validator node ($1,000 USDT) for 15 PHIVO daily emissions up to 10,000 PHIVO.',
        'LIMITED SUPPLY',
        'Mint Node',
        'products:genesis',
        'emerald',
        TRUE,
        TRUE,
        2,
        NOW()
      ),
      (
        'e4000001-0000-4000-8000-000000000003',
        'chrono-vaults-spotlight',
        'PHIVONEX CHRONO VAULTS™ — Multi-Horizon Staking',
        'Lock USDT across 200-Day to 10-Year vaults with 7-day daily yield settlements and 100% principal return.',
        '7-DAY YIELD',
        'Explore Vaults',
        'products:chrono',
        'gold',
        FALSE,
        TRUE,
        3,
        NOW()
      )
    ON CONFLICT (slug) DO NOTHING;
  `);
}
