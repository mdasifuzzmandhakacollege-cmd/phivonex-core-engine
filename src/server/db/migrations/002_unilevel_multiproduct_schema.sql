-- ============================================================================
-- PHIVONEX TASK-02 & TASK-03: PostgreSQL Schema, Enterprise Security Tables &
-- Canonical Master Configurations (100% Unilevel & Multi-Product Ecosystem)
-- ============================================================================

-- 0. Optimal Indexes on user_referrals for 16-Generation Recursive CTE Traversal
CREATE INDEX IF NOT EXISTS idx_user_referrals_user_sponsor
  ON user_referrals (user_id, sponsor_user_id);

CREATE INDEX IF NOT EXISTS idx_user_referrals_sponsor_user
  ON user_referrals (sponsor_user_id, user_id);

-- ============================================================================
-- 1. PHIVONEX QUANTUM ALPHA™ (Algorithmic Trading Pool — 5-Day Mon-Fri Yield)
-- ============================================================================

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
  last_settled_date DATE NULL,
  closed_at TIMESTAMPTZ NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT chk_utp_principal_positive CHECK (principal_amount > 0),
  CONSTRAINT chk_utp_total_yield_non_neg CHECK (total_yield_earned >= 0),
  CONSTRAINT chk_utp_status CHECK (status IN ('ACTIVE', 'CLOSED'))
);

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

-- ============================================================================
-- 2. PHIVONEX CHRONO VAULTS™ (Time-Locked Staking — 7-Day Yield)
-- ============================================================================

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

-- ============================================================================
-- 3. 16-GENERATION UNILEVEL ROI-ON-ROI ENGINE
-- ============================================================================

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

-- ============================================================================
-- 4. UNILEVEL LEADERSHIP RANKS & GLOBAL TURNOVER POOL (7 Ranks 0..6 / 40% Cap)
-- ============================================================================

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

CREATE INDEX IF NOT EXISTS idx_gtpp_user_id
  ON global_turnover_pool_payouts (user_id, settled_at DESC);

-- ============================================================================
-- 5. FOUNDERS' COUNCIL & DAILY YIELD EPOCH IDEMPOTENCY LOCKS
-- ============================================================================

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

-- ============================================================================
-- 6. ENTERPRISE SECURITY & CIRCUIT-BREAKER TABLES (TASK-03)
-- ============================================================================

CREATE TABLE IF NOT EXISTS system_circuit_breaker_configs (
  id INT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  min_reserve_ratio NUMERIC(20,8) NOT NULL DEFAULT 1.25000000,
  max_hourly_outflow_usd NUMERIC(20,8) NOT NULL DEFAULT 25000.00000000,
  max_user_daily_withdrawal_usd NUMERIC(20,8) NOT NULL DEFAULT 10000.00000000,
  withdrawal_mode VARCHAR(32) NOT NULL DEFAULT 'AUTO' CHECK (withdrawal_mode IN ('AUTO', 'MANUAL_REVIEW')),
  trip_reason TEXT NULL,
  tripped_at TIMESTAMPTZ NULL,
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

-- ============================================================================
-- 7. UNIFIED UNILEVEL YIELD EVENT BRIDGE OUTBOX (TASK-06)
-- ============================================================================

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

