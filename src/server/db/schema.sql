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



