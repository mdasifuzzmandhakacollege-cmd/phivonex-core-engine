-- PHIVONEX Authentication & Referral Database Schema
-- Task #2 & Task #3 Backend

-- Users Table
CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY,
  public_id VARCHAR(50) UNIQUE NOT NULL,
  full_name VARCHAR(255) NOT NULL,
  email VARCHAR(255) NOT NULL,
  phone VARCHAR(50) NULL,
  country VARCHAR(100) NOT NULL,
  password_hash TEXT NOT NULL,
  status VARCHAR(50) NOT NULL DEFAULT 'ACTIVE',
  role VARCHAR(20) NOT NULL DEFAULT 'USER',
  email_verified_at TIMESTAMP WITH TIME ZONE NULL,
  pending_referral_code VARCHAR(50) NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
  last_login_at TIMESTAMP WITH TIME ZONE NULL
);

-- Unique constraints and indexes on users
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_public_id ON users (public_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_email_lower ON users (LOWER(email));
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_phone ON users (phone) WHERE phone IS NOT NULL AND phone != '';
CREATE INDEX IF NOT EXISTS idx_users_status ON users (status);

-- Sessions Table
CREATE TABLE IF NOT EXISTS sessions (
  id UUID PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL,
  user_agent TEXT NULL,
  ip_address VARCHAR(100) NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
  expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
  last_used_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
  revoked_at TIMESTAMP WITH TIME ZONE NULL
);

CREATE INDEX IF NOT EXISTS idx_sessions_token_hash ON sessions (token_hash);
CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON sessions (user_id);
CREATE INDEX IF NOT EXISTS idx_sessions_expires_at ON sessions (expires_at);

-- Security Activity Log Table (Task #5)
CREATE TABLE IF NOT EXISTS security_events (
  id UUID PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  event_type VARCHAR(100) NOT NULL,
  description TEXT NOT NULL,
  user_agent_summary VARCHAR(255) NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_security_events_user ON security_events (user_id, created_at DESC);

-- Auth Tokens Table (Email Verification and Password Reset)
CREATE TABLE IF NOT EXISTS auth_tokens (
  id UUID PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type VARCHAR(50) NOT NULL, -- 'EMAIL_VERIFY', 'PASSWORD_RESET'
  token_hash TEXT NOT NULL,
  expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
  used_at TIMESTAMP WITH TIME ZONE NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_auth_tokens_hash_type ON auth_tokens (token_hash, type);
CREATE INDEX IF NOT EXISTS idx_auth_tokens_user_id ON auth_tokens (user_id);

-- User Referrals Table (Task #3)
CREATE TABLE IF NOT EXISTS user_referrals (
  user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  referral_code VARCHAR(50) UNIQUE NOT NULL,
  sponsor_user_id UUID NULL REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT chk_no_self_referral CHECK (user_id != sponsor_user_id)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_user_referrals_code ON user_referrals (referral_code);
CREATE INDEX IF NOT EXISTS idx_user_referrals_sponsor ON user_referrals (sponsor_user_id);

-- Genesis Nodes Inventory Table (Task #6)
CREATE TABLE IF NOT EXISTS nodes (
  id UUID PRIMARY KEY,
  node_number INTEGER UNIQUE NOT NULL,
  public_node_id VARCHAR(50) UNIQUE NOT NULL,
  status VARCHAR(50) NOT NULL,
  owner_user_id UUID NULL REFERENCES users(id) ON DELETE SET NULL,
  reserved_by_user_id UUID NULL REFERENCES users(id) ON DELETE SET NULL,
  product_version VARCHAR(50) NOT NULL DEFAULT 'GENESIS_V1',
  purchase_price_usd NUMERIC(12, 2) NOT NULL DEFAULT 1000.00,
  phivo_reference_price_at_purchase NUMERIC(10, 4) NOT NULL DEFAULT 0.10,
  lifetime_phivo_allocation NUMERIC(14, 2) NOT NULL DEFAULT 10000.00,
  term_days INTEGER NOT NULL DEFAULT 200,
  daily_phivo_emission NUMERIC(10, 2) NOT NULL DEFAULT 50.00,
  purchase_timestamp TIMESTAMP WITH TIME ZONE NULL,
  reserved_at TIMESTAMP WITH TIME ZONE NULL,
  activated_at TIMESTAMP WITH TIME ZONE NULL,
  maturity_timestamp TIMESTAMP WITH TIME ZONE NULL,
  distributed_phivo NUMERIC(14, 2) NOT NULL DEFAULT 0.00,
  remaining_phivo NUMERIC(14, 2) NOT NULL DEFAULT 10000.00,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT chk_node_number_range CHECK (node_number >= 1 AND node_number <= 10000),
  CONSTRAINT chk_node_status_valid CHECK (status IN ('AVAILABLE', 'RESERVED', 'PURCHASED', 'ACTIVE', 'EMITTING', 'MATURED', 'RETIRED')),
  CONSTRAINT chk_node_available_owner CHECK (status != 'AVAILABLE' OR owner_user_id IS NULL),
  CONSTRAINT chk_node_active_owner CHECK (status NOT IN ('ACTIVE', 'EMITTING', 'MATURED') OR owner_user_id IS NOT NULL)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_nodes_node_number ON nodes (node_number);
CREATE UNIQUE INDEX IF NOT EXISTS idx_nodes_public_node_id ON nodes (public_node_id);
CREATE INDEX IF NOT EXISTS idx_nodes_status ON nodes (status);
CREATE INDEX IF NOT EXISTS idx_nodes_owner ON nodes (owner_user_id);

-- Genesis Node Orders Table (Task #7)
CREATE TABLE IF NOT EXISTS node_orders (
  id UUID PRIMARY KEY,
  public_order_id VARCHAR(50) UNIQUE NOT NULL,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  node_id UUID NOT NULL REFERENCES nodes(id) ON DELETE CASCADE,
  node_number INTEGER NOT NULL,
  amount_usd NUMERIC(12, 2) NOT NULL DEFAULT 1000.00,
  currency VARCHAR(20) NOT NULL DEFAULT 'USD',
  status VARCHAR(50) NOT NULL DEFAULT 'PENDING',
  payment_method VARCHAR(50) NOT NULL DEFAULT 'SIMULATED_INSTANT',
  payment_reference VARCHAR(255) NULL,
  idempotency_key VARCHAR(100) NULL,
  reserved_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
  expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
  completed_at TIMESTAMP WITH TIME ZONE NULL,
  cancelled_at TIMESTAMP WITH TIME ZONE NULL,
  failed_at TIMESTAMP WITH TIME ZONE NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT chk_node_order_status CHECK (status IN ('PENDING', 'SETTLING', 'COMPLETED', 'CANCELLED', 'EXPIRED', 'FAILED')),
  CONSTRAINT chk_node_order_amount CHECK (amount_usd = 1000.00)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_node_orders_public_id ON node_orders (public_order_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_node_orders_idempotency ON node_orders (idempotency_key) WHERE idempotency_key IS NOT NULL AND idempotency_key != '';
CREATE UNIQUE INDEX IF NOT EXISTS idx_unique_active_user_order ON node_orders (user_id) WHERE status = 'PENDING';
CREATE INDEX IF NOT EXISTS idx_node_orders_user ON node_orders (user_id);
CREATE INDEX IF NOT EXISTS idx_node_orders_status ON node_orders (status);
CREATE INDEX IF NOT EXISTS idx_node_orders_node_id ON node_orders (node_id);
CREATE INDEX IF NOT EXISTS idx_node_orders_expires_at ON node_orders (expires_at);

CREATE TABLE IF NOT EXISTS node_owners (
  id UUID PRIMARY KEY,
  node_id UUID NOT NULL REFERENCES nodes(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  acquired_via VARCHAR(64) NOT NULL DEFAULT 'PURCHASE',
  acquired_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
  is_current_owner BOOLEAN NOT NULL DEFAULT TRUE,
  CONSTRAINT unique_node_user_owner UNIQUE (node_id, user_id)
);
CREATE INDEX IF NOT EXISTS idx_node_owners_node ON node_owners (node_id);
CREATE INDEX IF NOT EXISTS idx_node_owners_user ON node_owners (user_id);

-- Direct Referral Commissions Table (Task #8)
CREATE TABLE IF NOT EXISTS referral_commissions (
  id UUID PRIMARY KEY,
  public_commission_id VARCHAR(50) UNIQUE NOT NULL,
  sponsor_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  referred_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  node_id UUID UNIQUE NOT NULL REFERENCES nodes(id) ON DELETE CASCADE,
  node_order_id UUID NOT NULL REFERENCES node_orders(id) ON DELETE CASCADE,
  amount_usd NUMERIC(12, 2) NOT NULL DEFAULT 50.00,
  status VARCHAR(50) NOT NULL DEFAULT 'EARNED',
  earned_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
  reversed_at TIMESTAMP WITH TIME ZONE NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT chk_commission_amount CHECK (amount_usd = 50.00),
  CONSTRAINT chk_commission_status CHECK (status IN ('EARNED', 'REVERSED')),
  CONSTRAINT chk_commission_no_self CHECK (sponsor_user_id != referred_user_id)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_referral_commissions_public_id ON referral_commissions (public_commission_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_referral_commissions_node_id ON referral_commissions (node_id);
CREATE INDEX IF NOT EXISTS idx_referral_commissions_sponsor ON referral_commissions (sponsor_user_id);
CREATE INDEX IF NOT EXISTS idx_referral_commissions_referred ON referral_commissions (referred_user_id);
CREATE INDEX IF NOT EXISTS idx_referral_commissions_order ON referral_commissions (node_order_id);
CREATE INDEX IF NOT EXISTS idx_referral_commissions_status ON referral_commissions (status);

-- Binary Network Placements Table (Task #9)
CREATE TABLE IF NOT EXISTS binary_placements (
  user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  parent_user_id UUID NULL REFERENCES users(id) ON DELETE SET NULL,
  side VARCHAR(10) NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'UNPLACED',
  placed_at TIMESTAMP WITH TIME ZONE NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT chk_no_self_parent CHECK (parent_user_id IS NULL OR user_id != parent_user_id),
  CONSTRAINT chk_placement_side CHECK (side IS NULL OR side IN ('LEFT', 'RIGHT')),
  CONSTRAINT chk_placement_status CHECK (status IN ('UNPLACED', 'PLACED'))
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_binary_parent_side ON binary_placements (parent_user_id, side) WHERE parent_user_id IS NOT NULL AND side IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_binary_placements_parent ON binary_placements (parent_user_id);
CREATE INDEX IF NOT EXISTS idx_binary_placements_status ON binary_placements (status);

-- Task #10: Binary Volume Engine Tables
CREATE TABLE IF NOT EXISTS binary_volume_events (
  id UUID PRIMARY KEY,
  public_event_id VARCHAR(50) UNIQUE NOT NULL,
  beneficiary_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  source_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  source_node_id UUID NOT NULL REFERENCES nodes(id) ON DELETE CASCADE,
  side VARCHAR(10) NOT NULL,
  volume_units INTEGER NOT NULL DEFAULT 1,
  status VARCHAR(20) NOT NULL DEFAULT 'ACTIVE',
  business_date DATE NOT NULL,
  occurred_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
  reversed_at TIMESTAMP WITH TIME ZONE NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT uq_bve_beneficiary_node UNIQUE (beneficiary_user_id, source_node_id),
  CONSTRAINT chk_bve_side CHECK (side IN ('LEFT', 'RIGHT')),
  CONSTRAINT chk_bve_status CHECK (status IN ('ACTIVE', 'REVERSED')),
  CONSTRAINT chk_bve_units CHECK (volume_units > 0)
);

CREATE TABLE IF NOT EXISTS binary_daily_volumes (
  id UUID PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  business_date DATE NOT NULL,
  left_units INTEGER NOT NULL DEFAULT 0,
  right_units INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT uq_bdv_user_date UNIQUE (user_id, business_date),
  CONSTRAINT chk_bdv_left CHECK (left_units >= 0),
  CONSTRAINT chk_bdv_right CHECK (right_units >= 0)
);

CREATE TABLE IF NOT EXISTS binary_volume_balances (
  user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  carry_left_units INTEGER NOT NULL DEFAULT 0,
  carry_right_units INTEGER NOT NULL DEFAULT 0,
  last_settled_business_date DATE NULL,
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT chk_bvb_carry_left CHECK (carry_left_units >= 0),
  CONSTRAINT chk_bvb_carry_right CHECK (carry_right_units >= 0)
);

-- Task #11: Daily Binary Matching Settlement Engine Tables
CREATE TABLE IF NOT EXISTS binary_matching_settlements (
  id UUID PRIMARY KEY,
  public_settlement_id VARCHAR(50) UNIQUE NOT NULL,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  business_date DATE NOT NULL,
  available_left_units INTEGER NOT NULL,
  available_right_units INTEGER NOT NULL,
  consumed_left_units INTEGER NOT NULL,
  consumed_right_units INTEGER NOT NULL,
  carry_left_before INTEGER NOT NULL,
  carry_right_before INTEGER NOT NULL,
  carry_left_after INTEGER NOT NULL,
  carry_right_after INTEGER NOT NULL,
  total_bonus_usd NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
  status VARCHAR(20) NOT NULL DEFAULT 'COMPLETED',
  settled_at TIMESTAMP WITH TIME ZONE NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT uq_bms_user_date UNIQUE (user_id, business_date),
  CONSTRAINT chk_bms_status CHECK (status IN ('COMPLETED', 'REVERSED')),
  CONSTRAINT chk_bms_units CHECK (
    available_left_units >= 0 AND
    available_right_units >= 0 AND
    consumed_left_units >= 0 AND
    consumed_right_units >= 0 AND
    carry_left_before >= 0 AND
    carry_right_before >= 0 AND
    carry_left_after >= 0 AND
    carry_right_after >= 0 AND
    total_bonus_usd >= 0
  )
);

CREATE TABLE IF NOT EXISTS binary_matching_components (
  id UUID PRIMARY KEY,
  settlement_id UUID NOT NULL REFERENCES binary_matching_settlements(id) ON DELETE CASCADE,
  tier_units INTEGER NOT NULL,
  left_units INTEGER NOT NULL,
  right_units INTEGER NOT NULL,
  bonus_usd NUMERIC(12, 2) NOT NULL,
  sequence_no INTEGER NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT chk_bmc_tier CHECK (tier_units >= 2),
  CONSTRAINT chk_bmc_bonus CHECK (bonus_usd > 0)
);

CREATE TABLE IF NOT EXISTS binary_settlement_cycles (
  business_date DATE PRIMARY KEY,
  status VARCHAR(20) NOT NULL DEFAULT 'RUNNING',
  total_users_settled INTEGER NOT NULL DEFAULT 0,
  total_bonus_usd NUMERIC(14, 2) NOT NULL DEFAULT 0.00,
  started_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
  completed_at TIMESTAMP WITH TIME ZONE NULL,
  error_message TEXT NULL,
  CONSTRAINT chk_bsc_status CHECK (status IN ('RUNNING', 'COMPLETED', 'FAILED'))
);

CREATE INDEX IF NOT EXISTS idx_bve_beneficiary ON binary_volume_events (beneficiary_user_id);
CREATE INDEX IF NOT EXISTS idx_bve_source_user ON binary_volume_events (source_user_id);
CREATE INDEX IF NOT EXISTS idx_bve_source_node ON binary_volume_events (source_node_id);
CREATE INDEX IF NOT EXISTS idx_bve_business_date ON binary_volume_events (business_date);
CREATE INDEX IF NOT EXISTS idx_bve_status ON binary_volume_events (status);
CREATE INDEX IF NOT EXISTS idx_bve_beneficiary_date ON binary_volume_events (beneficiary_user_id, business_date);
CREATE INDEX IF NOT EXISTS idx_bdv_user_date ON binary_daily_volumes (user_id, business_date);

CREATE INDEX IF NOT EXISTS idx_bms_user_id ON binary_matching_settlements (user_id);
CREATE INDEX IF NOT EXISTS idx_bms_business_date ON binary_matching_settlements (business_date);
CREATE INDEX IF NOT EXISTS idx_bms_status ON binary_matching_settlements (status);
CREATE INDEX IF NOT EXISTS idx_bms_user_settled_at ON binary_matching_settlements (user_id, settled_at DESC);
CREATE INDEX IF NOT EXISTS idx_bmc_settlement_id ON binary_matching_components (settlement_id);
CREATE INDEX IF NOT EXISTS idx_bmc_settlement_seq ON binary_matching_components (settlement_id, sequence_no);

-- Task #12: Promotion Milestone Bonuses Table
CREATE TABLE IF NOT EXISTS promotion_bonuses (
  id UUID PRIMARY KEY,
  public_bonus_id VARCHAR(50) UNIQUE NOT NULL,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  milestone VARCHAR(20) NOT NULL,
  left_units INTEGER NOT NULL,
  right_units INTEGER NOT NULL,
  amount_usd NUMERIC(12, 2) NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'EARNED',
  qualified_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT uq_pb_user_milestone UNIQUE (user_id, milestone),
  CONSTRAINT chk_pb_status CHECK (status IN ('EARNED', 'REVERSED')),
  CONSTRAINT chk_pb_units CHECK (left_units >= 0 AND right_units >= 0 AND amount_usd > 0)
);

CREATE INDEX IF NOT EXISTS idx_pb_user_id ON promotion_bonuses (user_id);
CREATE INDEX IF NOT EXISTS idx_pb_status ON promotion_bonuses (status);
CREATE INDEX IF NOT EXISTS idx_pb_milestone ON promotion_bonuses (milestone);
CREATE INDEX IF NOT EXISTS idx_pb_qualified_at ON promotion_bonuses (qualified_at DESC);

-- Task #13: Financial Ledger Entries Table
CREATE TABLE IF NOT EXISTS financial_ledger_entries (
  id UUID PRIMARY KEY,
  public_txn_id VARCHAR(50) UNIQUE NOT NULL,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  entry_type VARCHAR(20) NOT NULL,
  source_type VARCHAR(50) NOT NULL,
  source_id UUID NOT NULL,
  source_ref VARCHAR(100) NOT NULL,
  description TEXT NOT NULL,
  amount NUMERIC(12, 2) NOT NULL,
  currency VARCHAR(10) NOT NULL DEFAULT 'USD',
  status VARCHAR(20) NOT NULL DEFAULT 'SETTLED',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT chk_fle_entry_type CHECK (entry_type IN ('CREDIT', 'DEBIT', 'REVERSAL')),
  CONSTRAINT chk_fle_source_type CHECK (source_type IN ('REFERRAL_COMMISSION', 'MATCHING_BONUS', 'PROMOTION_BONUS', 'NODE_REWARD', 'NODE_PURCHASE', 'USDT_DEPOSIT', 'BNB_DEPOSIT', 'COIN_SWAP', 'WITHDRAWAL', 'BLOCKCHAIN_DEPOSIT', 'DEPOSIT_CREDIT', 'ADMIN_ADJUSTMENT')),
  CONSTRAINT chk_fle_status CHECK (status IN ('SETTLED', 'REVERSED', 'PENDING')),
  CONSTRAINT chk_fle_amount CHECK (amount > 0),
  CONSTRAINT uq_fle_source_entry_type UNIQUE (source_type, source_id, entry_type)
);

CREATE INDEX IF NOT EXISTS idx_fle_user_id ON financial_ledger_entries (user_id);
CREATE INDEX IF NOT EXISTS idx_fle_user_created ON financial_ledger_entries (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_fle_source ON financial_ledger_entries (source_type, source_id);
CREATE INDEX IF NOT EXISTS idx_fle_entry_type ON financial_ledger_entries (entry_type);
CREATE INDEX IF NOT EXISTS idx_fle_status ON financial_ledger_entries (status);
CREATE INDEX IF NOT EXISTS idx_fle_public_txn_id ON financial_ledger_entries (public_txn_id);

-- Task #14: Genesis Node Mining Reward Epochs
CREATE TABLE IF NOT EXISTS reward_epochs (
  id UUID PRIMARY KEY,
  public_epoch_id VARCHAR(50) UNIQUE NOT NULL,
  epoch_number INTEGER UNIQUE NOT NULL,
  start_at TIMESTAMP WITH TIME ZONE NOT NULL,
  end_at TIMESTAMP WITH TIME ZONE NOT NULL,
  reward_per_node NUMERIC(14, 4) NULL,
  currency VARCHAR(10) NOT NULL DEFAULT 'USD',
  status VARCHAR(20) NOT NULL DEFAULT 'OPEN',
  settled_at TIMESTAMP WITH TIME ZONE NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT chk_epoch_status CHECK (status IN ('OPEN', 'COMPLETED')),
  CONSTRAINT chk_epoch_reward CHECK (reward_per_node IS NULL OR reward_per_node > 0)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_reward_epochs_public_id ON reward_epochs (public_epoch_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_reward_epochs_number ON reward_epochs (epoch_number);
CREATE INDEX IF NOT EXISTS idx_reward_epochs_status ON reward_epochs (status);
CREATE INDEX IF NOT EXISTS idx_reward_epochs_dates ON reward_epochs (start_at, end_at);

-- Task #14: Genesis Node Individual Rewards
CREATE TABLE IF NOT EXISTS node_rewards (
  id UUID PRIMARY KEY,
  public_reward_id VARCHAR(50) UNIQUE NOT NULL,
  epoch_id UUID NOT NULL REFERENCES reward_epochs(id) ON DELETE CASCADE,
  node_id UUID NOT NULL REFERENCES nodes(id) ON DELETE CASCADE,
  owner_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  amount NUMERIC(14, 4) NOT NULL,
  currency VARCHAR(10) NOT NULL DEFAULT 'USD',
  status VARCHAR(20) NOT NULL DEFAULT 'ACCRUED',
  accrued_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
  claimed_at TIMESTAMP WITH TIME ZONE NULL,
  reversed_at TIMESTAMP WITH TIME ZONE NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT uq_nr_node_epoch UNIQUE (node_id, epoch_id),
  CONSTRAINT chk_nr_status CHECK (status IN ('ACCRUED', 'CLAIMED', 'REVERSED')),
  CONSTRAINT chk_nr_amount CHECK (amount > 0)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_node_rewards_public_id ON node_rewards (public_reward_id);
CREATE INDEX IF NOT EXISTS idx_node_rewards_owner ON node_rewards (owner_user_id);
CREATE INDEX IF NOT EXISTS idx_node_rewards_node ON node_rewards (node_id);
CREATE INDEX IF NOT EXISTS idx_node_rewards_epoch ON node_rewards (epoch_id);
CREATE INDEX IF NOT EXISTS idx_node_rewards_status ON node_rewards (status);
CREATE INDEX IF NOT EXISTS idx_node_rewards_accrued_at ON node_rewards (accrued_at DESC);

-- Task #19.1: Internal Coin -> USDT Swap Transactions Table
CREATE TABLE IF NOT EXISTS coin_swap_transactions (
  id UUID PRIMARY KEY,
  public_swap_id VARCHAR(50) UNIQUE NOT NULL,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  coin_amount NUMERIC(28, 6) NOT NULL,
  rate_usdt NUMERIC(16, 6) NOT NULL,
  usdt_amount NUMERIC(16, 4) NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'COMPLETED',
  rate_version INTEGER NOT NULL DEFAULT 1,
  idempotency_key VARCHAR(100) NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
  completed_at TIMESTAMP WITH TIME ZONE NULL,
  CONSTRAINT chk_cst_status CHECK (status IN ('PENDING', 'COMPLETED', 'REVERSED')),
  CONSTRAINT chk_cst_coin_amount CHECK (coin_amount > 0),
  CONSTRAINT chk_cst_rate_usdt CHECK (rate_usdt > 0),
  CONSTRAINT chk_cst_usdt_amount CHECK (usdt_amount > 0)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_cst_public_id ON coin_swap_transactions (public_swap_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_cst_user_idempotency ON coin_swap_transactions (user_id, idempotency_key) WHERE idempotency_key IS NOT NULL AND idempotency_key != '';
CREATE INDEX IF NOT EXISTS idx_cst_user_id ON coin_swap_transactions (user_id);
CREATE INDEX IF NOT EXISTS idx_cst_status ON coin_swap_transactions (status);
CREATE INDEX IF NOT EXISTS idx_cst_created_at ON coin_swap_transactions (created_at DESC);

-- Task #20: In-App Notifications Table
CREATE TABLE IF NOT EXISTS notifications (
  id UUID PRIMARY KEY,
  public_notification_id VARCHAR(50) UNIQUE NOT NULL,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type VARCHAR(50) NOT NULL,
  title VARCHAR(255) NOT NULL,
  message TEXT NOT NULL,
  source_type VARCHAR(50) NULL,
  source_id VARCHAR(100) NULL,
  read_at TIMESTAMP WITH TIME ZONE NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT chk_notification_type CHECK (type IN (
    'NODE_ACTIVATED',
    'REFERRAL_EARNED',
    'MATCHING_EARNED',
    'PROMOTION_EARNED',
    'PHIVO_REWARD',
    'PHIVO_SWAP_COMPLETED',
    'USDT_DEPOSIT_CONFIRMED',
    'WITHDRAWAL_STATUS',
    'SECURITY_ALERT',
    'SUPPORT_TICKET_CREATED',
    'SUPPORT_TICKET_UPDATE'
  ))
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_notifications_public_id ON notifications (public_notification_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_notifications_idempotency ON notifications (user_id, source_type, source_id, type) WHERE source_type IS NOT NULL AND source_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_notifications_user_unread ON notifications (user_id, read_at, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notifications_user_created ON notifications (user_id, created_at DESC);

-- Task #21: Financial Reconciliation Tables
CREATE TABLE IF NOT EXISTS financial_reconciliation_runs (
  id UUID PRIMARY KEY,
  public_run_id VARCHAR(50) UNIQUE NOT NULL,
  started_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
  completed_at TIMESTAMP WITH TIME ZONE NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'RUNNING',
  issues_found INTEGER NOT NULL DEFAULT 0,
  created_by UUID NULL REFERENCES users(id) ON DELETE SET NULL,
  created_by_public_id VARCHAR(50) NULL,
  phivo_integrity VARCHAR(20) NOT NULL DEFAULT 'PENDING',
  usdt_integrity VARCHAR(20) NOT NULL DEFAULT 'PENDING',
  ledger_integrity VARCHAR(20) NOT NULL DEFAULT 'PENDING',
  withdrawal_integrity VARCHAR(20) NOT NULL DEFAULT 'PENDING',
  swap_integrity VARCHAR(20) NOT NULL DEFAULT 'PENDING',
  summary TEXT NULL,
  error_message TEXT NULL,
  CONSTRAINT chk_frr_status CHECK (status IN ('RUNNING', 'COMPLETED', 'FAILED'))
);

CREATE TABLE IF NOT EXISTS financial_reconciliation_issues (
  id UUID PRIMARY KEY,
  run_id UUID NOT NULL REFERENCES financial_reconciliation_runs(id) ON DELETE CASCADE,
  issue_type VARCHAR(100) NOT NULL,
  source_type VARCHAR(100) NOT NULL,
  source_reference VARCHAR(100) NOT NULL,
  asset VARCHAR(20) NOT NULL,
  expected_amount NUMERIC(28, 6) NOT NULL DEFAULT 0,
  actual_amount NUMERIC(28, 6) NOT NULL DEFAULT 0,
  status VARCHAR(20) NOT NULL DEFAULT 'DETECTED',
  user_id UUID NULL REFERENCES users(id) ON DELETE SET NULL,
  description TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT chk_fri_status CHECK (status IN ('DETECTED', 'RESOLVED', 'IGNORED'))
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_frr_public_id ON financial_reconciliation_runs (public_run_id);
CREATE INDEX IF NOT EXISTS idx_frr_status ON financial_reconciliation_runs (status);
CREATE INDEX IF NOT EXISTS idx_frr_started ON financial_reconciliation_runs (started_at DESC);

CREATE INDEX IF NOT EXISTS idx_fri_run_id ON financial_reconciliation_issues (run_id);
CREATE INDEX IF NOT EXISTS idx_fri_issue_type ON financial_reconciliation_issues (issue_type);
CREATE INDEX IF NOT EXISTS idx_fri_asset ON financial_reconciliation_issues (asset);
CREATE INDEX IF NOT EXISTS idx_fri_created ON financial_reconciliation_issues (created_at DESC);

-- Task #17.1: Production BSC HD Deposit Wallets & On-Chain Tables
CREATE SEQUENCE IF NOT EXISTS bsc_deposit_derivation_index_seq START WITH 0 MINVALUE 0 INCREMENT BY 1;

CREATE TABLE IF NOT EXISTS user_deposit_addresses (
  id UUID PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  chain_id INTEGER NOT NULL DEFAULT 56,
  asset VARCHAR(20) NOT NULL DEFAULT 'USDT',
  address VARCHAR(100) NOT NULL,
  derivation_index INTEGER NOT NULL DEFAULT 0,
  derivation_reference VARCHAR(100) NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT uq_user_deposit_chain_asset UNIQUE (user_id, chain_id, asset),
  CONSTRAINT uq_deposit_chain_address UNIQUE (chain_id, address)
);

CREATE INDEX IF NOT EXISTS idx_uda_user_id ON user_deposit_addresses (user_id);
CREATE INDEX IF NOT EXISTS idx_uda_address ON user_deposit_addresses (address);
CREATE INDEX IF NOT EXISTS idx_uda_chain_asset ON user_deposit_addresses (chain_id, asset);
CREATE INDEX IF NOT EXISTS idx_uda_chain_index ON user_deposit_addresses (chain_id, derivation_index);

CREATE TABLE IF NOT EXISTS blockchain_deposits (
  id UUID PRIMARY KEY,
  public_deposit_id VARCHAR(50) UNIQUE NOT NULL,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  chain_id INTEGER NOT NULL DEFAULT 56,
  asset VARCHAR(20) NOT NULL DEFAULT 'USDT',
  tx_hash VARCHAR(100) NOT NULL,
  log_index INTEGER NOT NULL DEFAULT 0,
  from_address VARCHAR(100) NOT NULL,
  to_address VARCHAR(100) NOT NULL,
  amount NUMERIC(28, 18) NOT NULL,
  block_number BIGINT NOT NULL,
  confirmations INTEGER NOT NULL DEFAULT 0,
  status VARCHAR(20) NOT NULL DEFAULT 'DETECTED',
  detected_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
  confirmed_at TIMESTAMP WITH TIME ZONE NULL,
  credited_at TIMESTAMP WITH TIME ZONE NULL,
  swept_at TIMESTAMP WITH TIME ZONE NULL,
  sweep_tx_hash VARCHAR(100) NULL,
  gas_funding_tx_hash VARCHAR(100) NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT uq_bcd_chain_tx_log_to UNIQUE (chain_id, tx_hash, log_index, to_address),
  CONSTRAINT chk_bcd_status CHECK (status IN ('DETECTED', 'CONFIRMING', 'CONFIRMED', 'CREDITED', 'SWEPT', 'REORGED', 'FAILED')),
  CONSTRAINT chk_bcd_amount CHECK (amount > 0)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_bcd_public_id ON blockchain_deposits (public_deposit_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_bcd_idempotency ON blockchain_deposits (chain_id, tx_hash, log_index, to_address);
CREATE INDEX IF NOT EXISTS idx_bcd_user_id ON blockchain_deposits (user_id);
CREATE INDEX IF NOT EXISTS idx_bcd_tx_hash ON blockchain_deposits (tx_hash);
CREATE INDEX IF NOT EXISTS idx_bcd_to_address ON blockchain_deposits (to_address);
CREATE INDEX IF NOT EXISTS idx_bcd_status ON blockchain_deposits (status);
CREATE INDEX IF NOT EXISTS idx_bcd_created ON blockchain_deposits (created_at DESC);

CREATE TABLE IF NOT EXISTS blockchain_withdrawals (
  id UUID PRIMARY KEY,
  withdrawal_id UUID UNIQUE NOT NULL REFERENCES withdrawals(id) ON DELETE CASCADE,
  chain_id INTEGER NOT NULL DEFAULT 56,
  tx_hash VARCHAR(100) NULL,
  nonce INTEGER NOT NULL,
  from_address VARCHAR(100) NOT NULL,
  destination VARCHAR(100) NOT NULL,
  amount_bnb NUMERIC(28, 18) NOT NULL,
  gas_price_gwei NUMERIC(10, 4) NULL,
  gas_used BIGINT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'PENDING',
  broadcast_at TIMESTAMP WITH TIME ZONE NULL,
  confirmed_at TIMESTAMP WITH TIME ZONE NULL,
  error_message TEXT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT chk_bcw_status CHECK (status IN ('PENDING', 'BROADCASTED', 'CONFIRMED', 'FAILED'))
);

CREATE INDEX IF NOT EXISTS idx_bcw_withdrawal_id ON blockchain_withdrawals (withdrawal_id);
CREATE INDEX IF NOT EXISTS idx_bcw_tx_hash ON blockchain_withdrawals (tx_hash);
CREATE INDEX IF NOT EXISTS idx_bcw_status ON blockchain_withdrawals (status);

CREATE TABLE IF NOT EXISTS payout_wallet_nonces (
  wallet_address VARCHAR(100) NOT NULL,
  chain_id INTEGER NOT NULL,
  last_nonce INTEGER NOT NULL DEFAULT -1,
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (wallet_address, chain_id)
);

-- Support Tickets and Messages
CREATE TABLE IF NOT EXISTS support_tickets (
  id UUID PRIMARY KEY,
  public_ticket_id VARCHAR(50) UNIQUE NOT NULL,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  subject VARCHAR(255) NOT NULL,
  category VARCHAR(50) NOT NULL DEFAULT 'GENERAL',
  priority VARCHAR(20) NOT NULL DEFAULT 'MEDIUM',
  status VARCHAR(20) NOT NULL DEFAULT 'OPEN',
  assigned_admin_id UUID NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS support_ticket_messages (
  id UUID PRIMARY KEY,
  ticket_id UUID NOT NULL REFERENCES support_tickets(id) ON DELETE CASCADE,
  sender_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  sender_role VARCHAR(20) NOT NULL DEFAULT 'USER',
  message TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_support_tickets_user_id ON support_tickets (user_id);
CREATE INDEX IF NOT EXISTS idx_support_tickets_status ON support_tickets (status);
CREATE INDEX IF NOT EXISTS idx_support_ticket_messages_ticket_id ON support_ticket_messages (ticket_id);

-- Binance-Grade KYC Verifications Table
CREATE TABLE IF NOT EXISTS kyc_verifications (
  id UUID PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  full_legal_name VARCHAR(255) NOT NULL,
  dob VARCHAR(50) NOT NULL,
  country VARCHAR(100) NOT NULL,
  residential_address TEXT NOT NULL,
  city VARCHAR(100) NOT NULL,
  postal_code VARCHAR(50) NOT NULL,
  document_type VARCHAR(50) NOT NULL,
  document_number VARCHAR(100) NOT NULL,
  document_front_url TEXT NOT NULL,
  document_back_url TEXT NULL,
  selfie_photo_url TEXT NOT NULL,
  status VARCHAR(50) NOT NULL DEFAULT 'PENDING',
  rejection_reason TEXT NULL,
  reviewer_id UUID NULL,
  reviewed_at TIMESTAMP WITH TIME ZONE NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_kyc_verifications_user_id ON kyc_verifications (user_id);
CREATE INDEX IF NOT EXISTS idx_kyc_verifications_status ON kyc_verifications (status);

-- ============================================================================
-- TASK-02: 100% Unilevel (16-Generation ROI-on-ROI) & Multi-Product Ecosystem
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_user_referrals_user_sponsor
  ON user_referrals (user_id, sponsor_user_id);

CREATE INDEX IF NOT EXISTS idx_user_referrals_sponsor_user
  ON user_referrals (sponsor_user_id, user_id);

-- 1. PHIVONEX QUANTUM ALPHA™ (Algorithmic Trading Pool — 5-Day Mon-Fri Yield)
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

CREATE INDEX IF NOT EXISTS idx_trading_pool_tiers_active ON trading_pool_tiers (is_active, min_amount);

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

CREATE INDEX IF NOT EXISTS idx_dtyr_trading_date ON daily_trading_yield_rates (trading_date DESC);
CREATE INDEX IF NOT EXISTS idx_dtyr_tier_date ON daily_trading_yield_rates (tier_id, trading_date DESC);

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

CREATE INDEX IF NOT EXISTS idx_utp_user_status ON user_trading_positions (user_id, status);
CREATE INDEX IF NOT EXISTS idx_utp_status_settled ON user_trading_positions (status, last_settled_date);
CREATE INDEX IF NOT EXISTS idx_utp_tier_id ON user_trading_positions (tier_id);

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

CREATE INDEX IF NOT EXISTS idx_typ_user_date ON trading_yield_payouts (user_id, trading_date DESC);
CREATE INDEX IF NOT EXISTS idx_typ_trading_date ON trading_yield_payouts (trading_date DESC);

-- 2. PHIVONEX CHRONO VAULTS™ (Time-Locked Staking — 7-Day Yield)
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

CREATE INDEX IF NOT EXISTS idx_chrono_vault_plans_active ON chrono_vault_plans (is_active, duration_days);

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

CREATE INDEX IF NOT EXISTS idx_uvp_user_status ON user_vault_positions (user_id, status);
CREATE INDEX IF NOT EXISTS idx_uvp_status_maturity ON user_vault_positions (status, maturity_at);
CREATE INDEX IF NOT EXISTS idx_uvp_plan_id ON user_vault_positions (plan_id);

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

CREATE INDEX IF NOT EXISTS idx_vyp_user_epoch ON vault_yield_payouts (user_id, epoch_date DESC);
CREATE INDEX IF NOT EXISTS idx_vyp_epoch_date ON vault_yield_payouts (epoch_date DESC);

-- 3. 16-Generation Unilevel ROI-on-ROI Engine
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

CREATE INDEX IF NOT EXISTS idx_urp_beneficiary_epoch ON unilevel_royalty_payouts (beneficiary_user_id, epoch_date DESC);
CREATE INDEX IF NOT EXISTS idx_urp_source_user ON unilevel_royalty_payouts (source_user_id, epoch_date DESC);
CREATE INDEX IF NOT EXISTS idx_urp_beneficiary_gen ON unilevel_royalty_payouts (beneficiary_user_id, generation_level);
CREATE INDEX IF NOT EXISTS idx_urp_epoch_product ON unilevel_royalty_payouts (epoch_date DESC, source_product_type);

-- 4. Unilevel Leadership Ranks & Global Turnover Pool (7 Ranks 0..6 / 40% Cap)
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

CREATE INDEX IF NOT EXISTS idx_uur_rank_level ON user_unilevel_ranks (current_rank_level DESC);

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

CREATE INDEX IF NOT EXISTS idx_urmp_user_id ON unilevel_rank_milestone_payouts (user_id, rank_level);

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

CREATE INDEX IF NOT EXISTS idx_gtpp_user_id ON global_turnover_pool_payouts (user_id, settled_at DESC);

-- 5. Founders' Council & Daily Yield Epoch Idempotency Locks
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

CREATE INDEX IF NOT EXISTS idx_fcdp_user_id ON founders_council_dividend_payouts (user_id, settled_at DESC);

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

CREATE INDEX IF NOT EXISTS idx_eysc_epoch_date ON ecosystem_yield_settlement_cycles (epoch_date DESC, engine_type);

-- 6. Enterprise Security & Circuit-Breaker Tables (Task-03)
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

CREATE INDEX IF NOT EXISTS idx_sal_created_at ON security_audit_logs (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_sal_action_type ON security_audit_logs (action_type, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_sal_actor_user ON security_audit_logs (actor_user_id, created_at DESC);

-- 7. Unified Unilevel Yield Event Bridge Outbox (Task-06)
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

CREATE INDEX IF NOT EXISTS idx_uye_status_epoch ON unilevel_yield_events (processing_status, epoch_date ASC, created_at ASC);
CREATE INDEX IF NOT EXISTS idx_uye_source_user ON unilevel_yield_events (source_user_id, epoch_date DESC);


