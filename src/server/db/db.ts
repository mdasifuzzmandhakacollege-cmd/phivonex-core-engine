import { PGlite } from '@electric-sql/pglite';
import { Pool } from 'pg';
import fs from 'fs';
import path from 'path';
import { generatePublicId, generateReferralCode, normalizeReferralCode } from '../utils/idGenerator';
import { v4 as uuidv4 } from 'uuid';
import { GENESIS_NODE_CAP, formatPublicNodeId } from '../../config/nodeConfig';

export interface QueryResult<T = any> {
  rows: T[];
  rowCount: number;
}

export interface DatabaseClient {
  query<T = any>(sql: string, params?: any[]): Promise<QueryResult<T>>;
  exec(sql: string): Promise<void>;
  transaction<T>(callback: (client: DatabaseClient) => Promise<T>): Promise<T>;
}

declare global {
  // eslint-disable-next-line no-var
  var __phivonexDb: DatabaseClient | undefined;
  // eslint-disable-next-line no-var
  var __phivonexDbPromise: Promise<DatabaseClient> | undefined;
  // eslint-disable-next-line no-var
  var __phivonexPool: Pool | undefined;
  // eslint-disable-next-line no-var
  var __phivonexPglite: PGlite | undefined;
}

export function getEffectiveDatabaseUrl(): string | undefined {
  if (process.env.DATABASE_URL?.trim()) {
    return process.env.DATABASE_URL.trim();
  }
  if (process.env.SQL_HOST && process.env.SQL_USER && process.env.SQL_PASSWORD && process.env.SQL_DB_NAME) {
    const isUnix = process.env.SQL_HOST.startsWith('/');
    const port = process.env.SQL_PORT || '5432';
    // If it's a Unix socket path, verify that the socket directory or file exists
    if (isUnix && !fs.existsSync(process.env.SQL_HOST)) {
      console.warn(`[DB] Unix socket path (${process.env.SQL_HOST}) not found in runtime environment. Skipping external unix socket connection.`);
      return undefined;
    }
    return isUnix
      ? `postgresql://${encodeURIComponent(process.env.SQL_USER)}:${encodeURIComponent(process.env.SQL_PASSWORD)}@/${process.env.SQL_DB_NAME}?host=${encodeURIComponent(process.env.SQL_HOST)}`
      : `postgresql://${encodeURIComponent(process.env.SQL_USER)}:${encodeURIComponent(process.env.SQL_PASSWORD)}@${process.env.SQL_HOST}:${port}/${process.env.SQL_DB_NAME}`;
  }
  return undefined;
}

export async function getDb(): Promise<DatabaseClient> {
  // 1. If singleton instance is ready, return immediately
  if (globalThis.__phivonexDb) {
    return globalThis.__phivonexDb;
  }

  // 2. If initialization is already in progress, await shared promise (concurrency barrier)
  if (globalThis.__phivonexDbPromise) {
    return globalThis.__phivonexDbPromise;
  }

  // 3. Initiate single initialization lifecycle
  globalThis.__phivonexDbPromise = (async () => {
    try {
      const isProduction =
        (process.env.APP_ENV || '').toLowerCase() === 'production' ||
        (process.env.NODE_ENV || '').toLowerCase() === 'production';
      const databaseUrl = getEffectiveDatabaseUrl();
      let client: DatabaseClient | null = null;

      // 1. Try external PostgreSQL connection if DATABASE_URL is configured
      if (
        databaseUrl &&
        !databaseUrl.includes('placeholder') &&
        !databaseUrl.includes('YOUR_') &&
        (databaseUrl.startsWith('postgres://') || databaseUrl.startsWith('postgresql://'))
      ) {
        try {
          let safeHost = 'localhost';
          let safeDbName = 'unknown';
          try {
            const parsedUrl = new URL(databaseUrl);
            safeHost = parsedUrl.hostname || 'unix-socket';
            safeDbName = parsedUrl.pathname ? parsedUrl.pathname.replace(/^\//, '') : 'default';
          } catch {
            safeHost = 'custom-connection';
          }
          console.log(`[DB Identity] Engine: PostgreSQL (Cloud SQL) | Host: ${safeHost} | Database: ${safeDbName}`);
          const isUnixSocket = databaseUrl.includes('host=/') || databaseUrl.includes('host=%2F') || databaseUrl.startsWith('/');
          let pool: Pool;
          const poolConfig = {
            connectionTimeoutMillis: 3000,
            idleTimeoutMillis: 30000,
            max: 20,
            keepAlive: true,
            keepAliveInitialDelayMillis: 10000,
          };

          if (isUnixSocket) {
            pool = new Pool({
              connectionString: databaseUrl,
              ssl: false,
              ...poolConfig,
            });
          } else {
            try {
              const url = new URL(databaseUrl);
              pool = new Pool({
                host: url.hostname,
                port: parseInt(url.port || '5432', 10),
                user: decodeURIComponent(url.username),
                password: decodeURIComponent(url.password),
                database: (url.pathname ? url.pathname.replace(/^\//, '') : 'postgres') || 'postgres',
                ssl: { rejectUnauthorized: false },
                ...poolConfig,
              });
            } catch {
              pool = new Pool({
                connectionString: databaseUrl,
                ssl: { rejectUnauthorized: false },
                ...poolConfig,
              });
            }
          }

          pool.on('error', (err) => {
            console.warn('[DB Pool Background Warning]:', err?.message || err);
          });

          // Fast probe with 3s timeout
          await Promise.race([
            pool.query('SELECT 1'),
            new Promise((_, reject) =>
              setTimeout(() => reject(new Error('PostgreSQL connection probe timeout (3000ms)')), 3000)
            ),
          ]);

          globalThis.__phivonexPool = pool;

          client = {
            async query<T = any>(sql: string, params?: any[]): Promise<QueryResult<T>> {
              const res = await pool.query(sql, params);
              return {
                rows: res.rows as T[],
                rowCount: res.rowCount ?? res.rows.length,
              };
            },
            async exec(sql: string): Promise<void> {
              await pool.query(sql);
            },
            async transaction<T>(callback: (client: DatabaseClient) => Promise<T>): Promise<T> {
              const pgClient = await pool.connect();
              const trxClient: DatabaseClient = {
                async query<R = any>(sql: string, params?: any[]): Promise<QueryResult<R>> {
                  const res = await pgClient.query(sql, params);
                  return {
                    rows: res.rows as R[],
                    rowCount: res.rowCount ?? res.rows.length,
                  };
                },
                async exec(sql: string): Promise<void> {
                  await pgClient.query(sql);
                },
                async transaction<R>(cb: (c: DatabaseClient) => Promise<R>): Promise<R> {
                  return cb(trxClient);
                },
              };

              try {
                await pgClient.query('BEGIN');
                const result = await callback(trxClient);
                await pgClient.query('COMMIT');
                return result;
              } catch (err) {
                await pgClient.query('ROLLBACK').catch(() => {});
                throw err;
              } finally {
                pgClient.release();
              }
            },
          };
          console.log('[DB] Successfully connected to PostgreSQL database.');
        } catch (poolErr: any) {
          console.error('[DB] Failed to connect to external PostgreSQL:', poolErr?.message || poolErr);
          if (globalThis.__phivonexPool) {
            await globalThis.__phivonexPool.end().catch(() => {});
            globalThis.__phivonexPool = undefined;
          }
          if (isProduction) {
            throw new Error(`[CRITICAL_DATABASE_ERROR] Production PostgreSQL connection failed: ${poolErr?.message || poolErr}. DATABASE_URL is mandatory and PGlite is strictly prohibited in production.`);
          }
          client = null;
        }
      } else if (isProduction) {
        throw new Error('[CRITICAL_DATABASE_ERROR] DATABASE_URL is mandatory in production. PGlite is strictly prohibited in production.');
      }

      // 2. Resilient Embedded PostgreSQL (PGlite) fallback (Allowed ONLY in development/tests)
      if (!client) {
        if (isProduction) {
          throw new Error('[CRITICAL_DATABASE_ERROR] Production requires a valid PostgreSQL connection. PGlite is strictly prohibited in production.');
        }
        // In production, isProduction check above already threw. PGlite is only used in development and tests.
        const dataDir = process.env.PGLITE_DATA_DIR || path.resolve(process.cwd(), '.data/pglite_db');
        if (!fs.existsSync(dataDir)) {
          fs.mkdirSync(dataDir, { recursive: true });
        }

        console.log('[DB] Initializing embedded PostgreSQL (PGlite) engine in:', dataDir);
        console.log(`[DB Identity] Engine: Embedded PGlite | Path: ${dataDir}`);
        let pglite: PGlite;
        try {
          pglite = new PGlite(dataDir);
          await pglite.waitReady;
          globalThis.__phivonexPglite = pglite;
        } catch (pgInitErr: any) {
          console.warn(`[DB] PGlite failed to initialize from (${dataDir}). Recovering clean state:`, pgInitErr?.message || pgInitErr);
          try {
            if (fs.existsSync(dataDir)) {
              fs.rmSync(dataDir, { recursive: true, force: true });
              fs.mkdirSync(dataDir, { recursive: true });
            }
            pglite = new PGlite(dataDir);
            await pglite.waitReady;
            console.log('[DB] PGlite recovered and initialized successfully.');
          } catch (recoverErr) {
            console.error('[DB] Fatal error during PGlite recovery:', recoverErr);
            throw recoverErr;
          }
        }

        client = {
          async query<T = any>(sql: string, params?: any[]): Promise<QueryResult<T>> {
            const res = await pglite.query<T>(sql, params);
            return {
              rows: res.rows as T[],
              rowCount: res.rows.length,
            };
          },
          async exec(sql: string): Promise<void> {
            await pglite.exec(sql);
          },
          async transaction<T>(callback: (client: DatabaseClient) => Promise<T>): Promise<T> {
            const trxClient: DatabaseClient = {
              async query<R = any>(sql: string, params?: any[]): Promise<QueryResult<R>> {
                const res = await pglite.query<R>(sql, params);
                return {
                  rows: res.rows as R[],
                  rowCount: res.rows.length,
                };
              },
              async exec(sql: string): Promise<void> {
                await pglite.exec(sql);
              },
              async transaction<R>(cb: (c: DatabaseClient) => Promise<R>): Promise<R> {
                return cb(trxClient);
              },
            };

            try {
              await pglite.query('BEGIN');
              const result = await callback(trxClient);
              await pglite.query('COMMIT');
              return result;
            } catch (err) {
              await pglite.query('ROLLBACK').catch(() => {});
              throw err;
            } finally {
              // no release needed for PGlite
            }
          },
        };
      }

      // Run schema migration and Genesis node verification once
      await initSchema(client);

      globalThis.__phivonexDb = client;
      return client;
    } catch (err) {
      // Clear promise so subsequent requests can retry cleanly
      globalThis.__phivonexDbPromise = undefined;
      globalThis.__phivonexDb = undefined;
      console.error('[DB] Fatal error during database singleton initialization:', err);
      throw err;
    }
  })();

  return globalThis.__phivonexDbPromise;
}

export async function closeDb(): Promise<void> {
  if (globalThis.__phivonexPool) {
    try {
      await globalThis.__phivonexPool.end();
    } catch {}
    globalThis.__phivonexPool = undefined;
  }
  if (globalThis.__phivonexPglite) {
    try {
      await globalThis.__phivonexPglite.close();
    } catch {}
    globalThis.__phivonexPglite = undefined;
  }
  globalThis.__phivonexDb = undefined;
  globalThis.__phivonexDbPromise = undefined;
}

async function initSchema(client: DatabaseClient) {
  try {
    // 1. Run core DDL statements individually or with client.exec
    await client.exec(`
      DROP TABLE IF EXISTS pending_registrations;

      CREATE TABLE IF NOT EXISTS pending_registrations (
        email VARCHAR(255) PRIMARY KEY,
        code_hash TEXT NOT NULL,
        registration_data TEXT NOT NULL,
        failed_attempts INTEGER NOT NULL DEFAULT 0,
        expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
        verification_token VARCHAR(100) NULL,
        is_verified BOOLEAN NOT NULL DEFAULT FALSE,
        created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
        last_sent_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS users (
        id UUID PRIMARY KEY,
        public_id VARCHAR(50),
        full_name VARCHAR(255) NOT NULL,
        email VARCHAR(255) NOT NULL,
        phone VARCHAR(50) NULL,
        country VARCHAR(100) NOT NULL,
        password_hash TEXT NOT NULL,
        status VARCHAR(50) NOT NULL DEFAULT 'ACTIVE',
        email_verified_at TIMESTAMP WITH TIME ZONE NULL,
        pending_referral_code VARCHAR(50) NULL,
        created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
        last_login_at TIMESTAMP WITH TIME ZONE NULL
      );

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

      CREATE TABLE IF NOT EXISTS security_events (
        id UUID PRIMARY KEY,
        user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        event_type VARCHAR(100) NOT NULL,
        description TEXT NOT NULL,
        user_agent_summary VARCHAR(255) NULL,
        created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS auth_tokens (
        id UUID PRIMARY KEY,
        user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        type VARCHAR(50) NOT NULL,
        token_hash TEXT NOT NULL,
        expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
        used_at TIMESTAMP WITH TIME ZONE NULL,
        created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS user_referrals (
        user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
        referral_code VARCHAR(50) UNIQUE NOT NULL,
        sponsor_user_id UUID NULL REFERENCES users(id) ON DELETE SET NULL,
        created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT chk_no_self_referral CHECK (user_id != sponsor_user_id)
      );

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
        CONSTRAINT chk_node_order_amount CHECK (amount_usd > 0)
      );

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
        CONSTRAINT chk_commission_amount CHECK (amount_usd >= 0),
        CONSTRAINT chk_commission_status CHECK (status IN ('EARNED', 'REVERSED')),
        CONSTRAINT chk_commission_no_self CHECK (sponsor_user_id != referred_user_id)
      );

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

      ALTER TABLE nodes ADD COLUMN IF NOT EXISTS product_version VARCHAR(50) NOT NULL DEFAULT 'GENESIS_V1';
      ALTER TABLE nodes ADD COLUMN IF NOT EXISTS purchase_price_usd NUMERIC(12, 2) NOT NULL DEFAULT 1000.00;
      ALTER TABLE nodes ADD COLUMN IF NOT EXISTS phivo_reference_price_at_purchase NUMERIC(10, 4) NOT NULL DEFAULT 0.10;
      ALTER TABLE nodes ADD COLUMN IF NOT EXISTS lifetime_phivo_allocation NUMERIC(14, 2) NOT NULL DEFAULT 10000.00;
      ALTER TABLE nodes ADD COLUMN IF NOT EXISTS term_days INTEGER NOT NULL DEFAULT 200;
      ALTER TABLE nodes ADD COLUMN IF NOT EXISTS daily_phivo_emission NUMERIC(10, 2) NOT NULL DEFAULT 50.00;
      UPDATE nodes SET term_days = 200 WHERE term_days = 400;
      ALTER TABLE nodes ADD COLUMN IF NOT EXISTS purchase_timestamp TIMESTAMP WITH TIME ZONE NULL;
      ALTER TABLE nodes ADD COLUMN IF NOT EXISTS maturity_timestamp TIMESTAMP WITH TIME ZONE NULL;
      ALTER TABLE nodes ADD COLUMN IF NOT EXISTS distributed_phivo NUMERIC(14, 2) NOT NULL DEFAULT 0.00;
      ALTER TABLE nodes ADD COLUMN IF NOT EXISTS remaining_phivo NUMERIC(14, 2) NOT NULL DEFAULT 10000.00;

      ALTER TABLE nodes DROP CONSTRAINT IF EXISTS chk_node_status_valid;
      ALTER TABLE nodes ADD CONSTRAINT chk_node_status_valid CHECK (status IN ('AVAILABLE', 'RESERVED', 'PURCHASED', 'ACTIVE', 'EMITTING', 'MATURED', 'RETIRED'));

      ALTER TABLE nodes DROP CONSTRAINT IF EXISTS chk_node_active_owner;
      ALTER TABLE nodes ADD CONSTRAINT chk_node_active_owner CHECK (status NOT IN ('ACTIVE', 'EMITTING', 'MATURED') OR owner_user_id IS NOT NULL);

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
        CONSTRAINT chk_fle_source_type CHECK (source_type IN ('REFERRAL_COMMISSION', 'MATCHING_BONUS', 'PROMOTION_BONUS', 'NODE_REWARD', 'WITHDRAWAL', 'NODE_PURCHASE', 'USDT_DEPOSIT', 'BNB_DEPOSIT', 'COIN_SWAP', 'BLOCKCHAIN_DEPOSIT', 'DEPOSIT_CREDIT', 'ADMIN_ADJUSTMENT', 'WALLET_TRANSFER')),
        CONSTRAINT chk_fle_status CHECK (status IN ('SETTLED', 'REVERSED', 'PENDING')),
        CONSTRAINT chk_fle_amount CHECK (amount > 0),
        CONSTRAINT uq_fle_source_entry_type UNIQUE (source_type, source_id, entry_type)
      );

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

      -- Task #17: Withdrawals Table
      CREATE TABLE IF NOT EXISTS withdrawals (
        id UUID PRIMARY KEY,
        public_withdrawal_id VARCHAR(50) UNIQUE NOT NULL,
        user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        amount NUMERIC(12, 2) NOT NULL,
        currency VARCHAR(10) NOT NULL DEFAULT 'USD',
        destination_type VARCHAR(50) NOT NULL,
        destination_reference TEXT NOT NULL,
        status VARCHAR(20) NOT NULL DEFAULT 'PENDING',
        requested_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
        approved_at TIMESTAMP WITH TIME ZONE NULL,
        rejected_at TIMESTAMP WITH TIME ZONE NULL,
        completed_at TIMESTAMP WITH TIME ZONE NULL,
        cancelled_at TIMESTAMP WITH TIME ZONE NULL,
        failed_at TIMESTAMP WITH TIME ZONE NULL,
        rejection_reason TEXT NULL,
        idempotency_key VARCHAR(100) NULL,
        created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT chk_withdrawal_status CHECK (status IN ('PENDING', 'APPROVED', 'REJECTED', 'PROCESSING', 'COMPLETED', 'FAILED', 'CANCELLED')),
        CONSTRAINT chk_withdrawal_amount CHECK (amount > 0)
      );

      -- Task #17.2: Withdrawal State Transition Audit Logs
      CREATE TABLE IF NOT EXISTS withdrawal_status_logs (
        id UUID PRIMARY KEY,
        withdrawal_id UUID NOT NULL REFERENCES withdrawals(id) ON DELETE CASCADE,
        public_withdrawal_id VARCHAR(50) NOT NULL,
        user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        user_email VARCHAR(255) NULL,
        user_name VARCHAR(255) NULL,
        previous_status VARCHAR(20) NULL,
        new_status VARCHAR(20) NOT NULL,
        actor_type VARCHAR(20) NOT NULL DEFAULT 'SYSTEM',
        actor_id VARCHAR(100) NULL,
        actor_email VARCHAR(255) NULL,
        reason TEXT NULL,
        amount NUMERIC(12, 2) NOT NULL,
        destination_type VARCHAR(50) NOT NULL,
        destination_reference TEXT NOT NULL,
        tx_hash VARCHAR(100) NULL,
        transition_timestamp TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
        created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
      );

      -- Support System Tables
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
    `);

    // Ensure public_id column exists on users (if created in previous version)
    try {
      await client.exec(`ALTER TABLE users ADD COLUMN IF NOT EXISTS public_id VARCHAR(50);`);
    } catch {
      // Column may already exist
    }

    // Ensure role column exists on users (default USER)
    try {
      await client.exec(`ALTER TABLE users ADD COLUMN IF NOT EXISTS role VARCHAR(20) NOT NULL DEFAULT 'USER';`);
      await client.exec(`
        UPDATE users 
        SET role = 'ADMIN' 
        WHERE LOWER(email) IN ('md.asifuzzman.dhakacollege@gmail.com', 'admin@phivonex.com');
      `);
    } catch {
      // Column may already exist or table empty
    }

    // Ensure reward_epochs allows NULL reward_per_node when rate is not finalized
    try {
      await client.exec(`ALTER TABLE reward_epochs ALTER COLUMN reward_per_node DROP NOT NULL;`);
      await client.exec(`ALTER TABLE reward_epochs DROP CONSTRAINT IF EXISTS chk_epoch_reward;`);
      await client.exec(`ALTER TABLE reward_epochs ADD CONSTRAINT chk_epoch_reward CHECK (reward_per_node IS NULL OR reward_per_node > 0);`);
    } catch {
      // Constraints may already be updated
    }

    // Ensure user_agent and ip_address columns exist on sessions
    try {
      await client.exec(`ALTER TABLE sessions ADD COLUMN IF NOT EXISTS user_agent TEXT;`);
      await client.exec(`ALTER TABLE sessions ADD COLUMN IF NOT EXISTS ip_address VARCHAR(100);`);
    } catch {
      // Columns may already exist
    }

    // Ensure security_events allows NULL user_id for unauthenticated/failed login security tracking
    try {
      await client.exec(`ALTER TABLE security_events ALTER COLUMN user_id DROP NOT NULL;`);
    } catch {
      // Column constraint may already be relaxed
    }

    // 2. Create indexes
    await client.exec(`
      CREATE UNIQUE INDEX IF NOT EXISTS idx_users_public_id ON users (public_id);
      CREATE UNIQUE INDEX IF NOT EXISTS idx_users_email_lower ON users (LOWER(email));
      CREATE UNIQUE INDEX IF NOT EXISTS idx_users_phone ON users (phone) WHERE phone IS NOT NULL AND phone != '';
      CREATE INDEX IF NOT EXISTS idx_users_status ON users (status);

      CREATE INDEX IF NOT EXISTS idx_sessions_token_hash ON sessions (token_hash);
      CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON sessions (user_id);
      CREATE INDEX IF NOT EXISTS idx_sessions_expires_at ON sessions (expires_at);

      CREATE INDEX IF NOT EXISTS idx_security_events_user ON security_events (user_id, created_at DESC);

      CREATE INDEX IF NOT EXISTS idx_auth_tokens_hash_type ON auth_tokens (token_hash, type);
      CREATE INDEX IF NOT EXISTS idx_auth_tokens_user_id ON auth_tokens (user_id);

      CREATE UNIQUE INDEX IF NOT EXISTS idx_user_referrals_code ON user_referrals (referral_code);
      CREATE INDEX IF NOT EXISTS idx_user_referrals_sponsor ON user_referrals (sponsor_user_id);

      CREATE UNIQUE INDEX IF NOT EXISTS idx_nodes_node_number ON nodes (node_number);
      CREATE UNIQUE INDEX IF NOT EXISTS idx_nodes_public_node_id ON nodes (public_node_id);
      CREATE INDEX IF NOT EXISTS idx_nodes_status ON nodes (status);
      CREATE INDEX IF NOT EXISTS idx_nodes_owner ON nodes (owner_user_id);

      CREATE UNIQUE INDEX IF NOT EXISTS idx_node_orders_public_id ON node_orders (public_order_id);
      CREATE UNIQUE INDEX IF NOT EXISTS idx_node_orders_idempotency ON node_orders (idempotency_key) WHERE idempotency_key IS NOT NULL AND idempotency_key != '';
      CREATE UNIQUE INDEX IF NOT EXISTS idx_unique_active_user_order ON node_orders (user_id) WHERE status = 'PENDING';
      CREATE INDEX IF NOT EXISTS idx_node_orders_user ON node_orders (user_id);
      CREATE INDEX IF NOT EXISTS idx_node_orders_status ON node_orders (status);
      CREATE INDEX IF NOT EXISTS idx_node_orders_node_id ON node_orders (node_id);
      CREATE INDEX IF NOT EXISTS idx_node_orders_expires_at ON node_orders (expires_at);

      CREATE UNIQUE INDEX IF NOT EXISTS idx_referral_commissions_public_id ON referral_commissions (public_commission_id);
      CREATE UNIQUE INDEX IF NOT EXISTS idx_referral_commissions_node_id ON referral_commissions (node_id);
      CREATE INDEX IF NOT EXISTS idx_referral_commissions_sponsor ON referral_commissions (sponsor_user_id);
      CREATE INDEX IF NOT EXISTS idx_referral_commissions_referred ON referral_commissions (referred_user_id);
      CREATE INDEX IF NOT EXISTS idx_referral_commissions_order ON referral_commissions (node_order_id);
      CREATE INDEX IF NOT EXISTS idx_referral_commissions_status ON referral_commissions (status);

      CREATE UNIQUE INDEX IF NOT EXISTS idx_binary_parent_side ON binary_placements (parent_user_id, side) WHERE parent_user_id IS NOT NULL AND side IS NOT NULL;
      CREATE INDEX IF NOT EXISTS idx_binary_placements_parent ON binary_placements (parent_user_id);
      CREATE INDEX IF NOT EXISTS idx_binary_placements_status ON binary_placements (status);

      -- Task #10: Indexes for binary volume engine
      CREATE INDEX IF NOT EXISTS idx_bve_beneficiary ON binary_volume_events (beneficiary_user_id);
      CREATE INDEX IF NOT EXISTS idx_bve_source_user ON binary_volume_events (source_user_id);
      CREATE INDEX IF NOT EXISTS idx_bve_source_node ON binary_volume_events (source_node_id);
      CREATE INDEX IF NOT EXISTS idx_bve_business_date ON binary_volume_events (business_date);
      CREATE INDEX IF NOT EXISTS idx_bve_status ON binary_volume_events (status);
      CREATE INDEX IF NOT EXISTS idx_bve_beneficiary_date ON binary_volume_events (beneficiary_user_id, business_date);

      CREATE INDEX IF NOT EXISTS idx_bdv_user_date ON binary_daily_volumes (user_id, business_date);

      -- Task #11: Indexes for binary matching settlements & components
      CREATE INDEX IF NOT EXISTS idx_bms_user_id ON binary_matching_settlements (user_id);
      CREATE INDEX IF NOT EXISTS idx_bms_business_date ON binary_matching_settlements (business_date);
      CREATE INDEX IF NOT EXISTS idx_bms_status ON binary_matching_settlements (status);
      CREATE INDEX IF NOT EXISTS idx_bms_user_settled_at ON binary_matching_settlements (user_id, settled_at DESC);
      CREATE INDEX IF NOT EXISTS idx_bmc_settlement_id ON binary_matching_components (settlement_id);
      CREATE INDEX IF NOT EXISTS idx_bmc_settlement_seq ON binary_matching_components (settlement_id, sequence_no);

      -- Task #12: Indexes for promotion milestone bonuses
      CREATE INDEX IF NOT EXISTS idx_pb_user_id ON promotion_bonuses (user_id);
      CREATE INDEX IF NOT EXISTS idx_pb_status ON promotion_bonuses (status);
      CREATE INDEX IF NOT EXISTS idx_pb_milestone ON promotion_bonuses (milestone);
      CREATE INDEX IF NOT EXISTS idx_pb_qualified_at ON promotion_bonuses (qualified_at DESC);

      -- Task #13: Indexes for financial ledger entries
      CREATE INDEX IF NOT EXISTS idx_fle_user_id ON financial_ledger_entries (user_id);
      CREATE INDEX IF NOT EXISTS idx_fle_user_created ON financial_ledger_entries (user_id, created_at DESC);
      CREATE INDEX IF NOT EXISTS idx_fle_source ON financial_ledger_entries (source_type, source_id);
      CREATE INDEX IF NOT EXISTS idx_fle_entry_type ON financial_ledger_entries (entry_type);
      CREATE INDEX IF NOT EXISTS idx_fle_status ON financial_ledger_entries (status);
      CREATE INDEX IF NOT EXISTS idx_fle_public_txn_id ON financial_ledger_entries (public_txn_id);

      -- Task #14: Indexes for reward epochs and node rewards
      CREATE UNIQUE INDEX IF NOT EXISTS idx_reward_epochs_public_id ON reward_epochs (public_epoch_id);
      CREATE UNIQUE INDEX IF NOT EXISTS idx_reward_epochs_number ON reward_epochs (epoch_number);
      CREATE INDEX IF NOT EXISTS idx_reward_epochs_status ON reward_epochs (status);
      CREATE INDEX IF NOT EXISTS idx_reward_epochs_dates ON reward_epochs (start_at, end_at);

      CREATE UNIQUE INDEX IF NOT EXISTS idx_node_rewards_public_id ON node_rewards (public_reward_id);
      CREATE INDEX IF NOT EXISTS idx_node_rewards_owner ON node_rewards (owner_user_id);
      CREATE INDEX IF NOT EXISTS idx_node_rewards_node ON node_rewards (node_id);
      CREATE INDEX IF NOT EXISTS idx_node_rewards_epoch ON node_rewards (epoch_id);
      CREATE INDEX IF NOT EXISTS idx_node_rewards_status ON node_rewards (status);
      CREATE INDEX IF NOT EXISTS idx_node_rewards_accrued_at ON node_rewards (accrued_at DESC);

      -- Task #17: Withdrawal Indexes
      CREATE UNIQUE INDEX IF NOT EXISTS idx_withdrawals_public_id ON withdrawals (public_withdrawal_id);
      CREATE INDEX IF NOT EXISTS idx_withdrawals_user_id ON withdrawals (user_id);
      CREATE INDEX IF NOT EXISTS idx_withdrawals_status ON withdrawals (status);
      CREATE INDEX IF NOT EXISTS idx_withdrawals_created ON withdrawals (created_at DESC);
      CREATE UNIQUE INDEX IF NOT EXISTS idx_withdrawals_idempotency ON withdrawals (user_id, idempotency_key) WHERE idempotency_key IS NOT NULL AND idempotency_key != '';

      CREATE INDEX IF NOT EXISTS idx_wsl_withdrawal_id ON withdrawal_status_logs (withdrawal_id);
      CREATE INDEX IF NOT EXISTS idx_wsl_public_withdrawal_id ON withdrawal_status_logs (public_withdrawal_id);
      CREATE INDEX IF NOT EXISTS idx_wsl_user_id ON withdrawal_status_logs (user_id);
      CREATE INDEX IF NOT EXISTS idx_wsl_new_status ON withdrawal_status_logs (new_status);
      CREATE INDEX IF NOT EXISTS idx_wsl_transition ON withdrawal_status_logs (transition_timestamp DESC);
    `);

    // Ensure financial_ledger_entries constraint supports NODE_REWARD and WITHDRAWAL
    try {
      await client.exec(`
        ALTER TABLE financial_ledger_entries DROP CONSTRAINT IF EXISTS chk_fle_source_type;
        ALTER TABLE financial_ledger_entries ADD CONSTRAINT chk_fle_source_type CHECK (source_type IN ('REFERRAL_COMMISSION', 'MATCHING_BONUS', 'PROMOTION_BONUS', 'NODE_REWARD', 'WITHDRAWAL', 'NODE_PURCHASE', 'USDT_DEPOSIT', 'BNB_DEPOSIT', 'COIN_SWAP', 'BLOCKCHAIN_DEPOSIT', 'DEPOSIT_CREDIT', 'ADMIN_ADJUSTMENT'));
      `);
    } catch {
      // Constraint update ignored if already applied or table structure matches
    }

    // Ensure admin_audit_logs table and indexes exist
    try {
      await client.exec(`
        CREATE TABLE IF NOT EXISTS admin_audit_logs (
          id UUID PRIMARY KEY,
          admin_user_id UUID NULL REFERENCES users(id) ON DELETE SET NULL,
          admin_public_id VARCHAR(50) NOT NULL,
          action VARCHAR(100) NOT NULL,
          target_type VARCHAR(50) NOT NULL,
          target_id VARCHAR(100) NOT NULL,
          details TEXT NOT NULL,
          metadata TEXT NULL,
          ip_address VARCHAR(100) NULL,
          created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
        );

        CREATE INDEX IF NOT EXISTS idx_admin_audit_admin_id ON admin_audit_logs (admin_user_id);
        CREATE INDEX IF NOT EXISTS idx_admin_audit_action ON admin_audit_logs (action);
        CREATE INDEX IF NOT EXISTS idx_admin_audit_target ON admin_audit_logs (target_type, target_id);
        CREATE INDEX IF NOT EXISTS idx_admin_audit_created ON admin_audit_logs (created_at DESC);
      `);
    } catch (auditTableErr) {
      console.warn('[DB Migration] admin_audit_logs creation error:', auditTableErr);
    }

    // Task #17.1: BNB Smart Chain Deposit & On-Chain Withdrawal Tables
    try {
      await client.exec(`
        -- 0. Atomic Derivation Index Sequence (Multi-instance safe)
        CREATE SEQUENCE IF NOT EXISTS bsc_deposit_derivation_index_seq START WITH 0 MINVALUE 0 INCREMENT BY 1;

        -- 1. User Deposit Addresses
        CREATE TABLE IF NOT EXISTS user_deposit_addresses (
          id UUID PRIMARY KEY,
          user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          chain_id INTEGER NOT NULL DEFAULT 56,
          asset VARCHAR(20) NOT NULL DEFAULT 'USDT',
          address VARCHAR(100) NOT NULL,
          derivation_index INTEGER NOT NULL DEFAULT 0,
          derivation_reference VARCHAR(100) NOT NULL,
          created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
          CONSTRAINT uq_user_deposit_chain_asset UNIQUE (user_id, chain_id, asset)
        );
        ALTER TABLE user_deposit_addresses DROP CONSTRAINT IF EXISTS uq_deposit_chain_address;
      `);
    } catch (t171Err) {
      console.warn('[DB Migration] user_deposit_addresses init warning:', t171Err);
    }

    try {
      await client.exec(`ALTER TABLE user_deposit_addresses ADD COLUMN IF NOT EXISTS derivation_index INTEGER NOT NULL DEFAULT 0;`);
      await client.exec(`CREATE INDEX IF NOT EXISTS idx_uda_user_id ON user_deposit_addresses (user_id);`);
      await client.exec(`CREATE INDEX IF NOT EXISTS idx_uda_address ON user_deposit_addresses (address);`);
      await client.exec(`CREATE INDEX IF NOT EXISTS idx_uda_chain_asset ON user_deposit_addresses (chain_id, asset);`);
      await client.exec(`CREATE INDEX IF NOT EXISTS idx_uda_chain_index ON user_deposit_addresses (chain_id, derivation_index);`);
    } catch (udaColErr) {
      console.warn('[DB Migration] user_deposit_addresses column migration warning:', udaColErr);
    }

    try {
      await client.exec(`ALTER TABLE reward_epochs ADD COLUMN IF NOT EXISTS economic_config_version INTEGER NULL;`);
      await client.exec(`ALTER TABLE reward_epochs ADD COLUMN IF NOT EXISTS reward_rate_used NUMERIC(14, 4) NULL;`);
      await client.exec(`ALTER TABLE node_rewards ADD COLUMN IF NOT EXISTS reward_rate_used NUMERIC(14, 4) NULL;`);
      await client.exec(`ALTER TABLE node_rewards ADD COLUMN IF NOT EXISTS economic_config_version INTEGER NULL;`);
      await client.exec(`ALTER TABLE node_rewards ADD COLUMN IF NOT EXISTS business_date VARCHAR(20) NULL;`);
    } catch (rewColErr) {
      console.warn('[DB Migration] reward columns migration warning:', rewColErr);
    }

    try {
      await client.exec(`
        -- 2. Blockchain Deposits Tracking
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
      `);
    } catch (bcdInitErr) {
      console.warn('[DB Migration] blockchain_deposits init warning:', bcdInitErr);
    }

    try {
      await client.exec(`ALTER TABLE blockchain_deposits ADD COLUMN IF NOT EXISTS log_index INTEGER NOT NULL DEFAULT 0;`);
      await client.exec(`ALTER TABLE blockchain_deposits ADD COLUMN IF NOT EXISTS swept_at TIMESTAMP WITH TIME ZONE NULL;`);
      await client.exec(`ALTER TABLE blockchain_deposits ADD COLUMN IF NOT EXISTS sweep_tx_hash VARCHAR(100) NULL;`);
      await client.exec(`ALTER TABLE blockchain_deposits ADD COLUMN IF NOT EXISTS gas_funding_tx_hash VARCHAR(100) NULL;`);
      await client.exec(`ALTER TABLE blockchain_deposits DROP CONSTRAINT IF EXISTS chk_bcd_status;`);
      await client.exec(`ALTER TABLE blockchain_deposits ADD CONSTRAINT chk_bcd_status CHECK (status IN ('DETECTED', 'CONFIRMING', 'CONFIRMED', 'CREDITED', 'SWEPT', 'REORGED', 'FAILED'));`);
      await client.exec(`ALTER TABLE blockchain_deposits DROP CONSTRAINT IF EXISTS uq_bcd_chain_tx_to;`);
      await client.exec(`CREATE UNIQUE INDEX IF NOT EXISTS idx_bcd_public_id ON blockchain_deposits (public_deposit_id);`);
      await client.exec(`CREATE UNIQUE INDEX IF NOT EXISTS idx_bcd_idempotency ON blockchain_deposits (chain_id, tx_hash, log_index, to_address);`);
      await client.exec(`CREATE INDEX IF NOT EXISTS idx_bcd_user_id ON blockchain_deposits (user_id);`);
      await client.exec(`CREATE INDEX IF NOT EXISTS idx_bcd_tx_hash ON blockchain_deposits (tx_hash);`);
      await client.exec(`CREATE INDEX IF NOT EXISTS idx_bcd_to_address ON blockchain_deposits (to_address);`);
      await client.exec(`CREATE INDEX IF NOT EXISTS idx_bcd_status ON blockchain_deposits (status);`);
      await client.exec(`CREATE INDEX IF NOT EXISTS idx_bcd_created ON blockchain_deposits (created_at DESC);`);
    } catch (bcdColErr) {
      console.warn('[DB Migration] blockchain_deposits column migration warning:', bcdColErr);
    }

    try {
      await client.exec(`
        -- 3. Blockchain On-Chain Withdrawals Tracking
        CREATE TABLE IF NOT EXISTS blockchain_withdrawals (
          id UUID PRIMARY KEY,
          withdrawal_id UUID UNIQUE NOT NULL REFERENCES withdrawals(id) ON DELETE CASCADE,
          chain_id INTEGER NOT NULL,
          tx_hash VARCHAR(100) NULL,
          nonce INTEGER NOT NULL,
          from_address VARCHAR(100) NOT NULL,
          destination VARCHAR(100) NOT NULL,
          amount_bnb NUMERIC(28, 18) NOT NULL,
          gas_price_gwei NUMERIC(14, 4) NULL,
          gas_used BIGINT NULL,
          status VARCHAR(20) NOT NULL DEFAULT 'PENDING',
          broadcast_at TIMESTAMP WITH TIME ZONE NULL,
          confirmed_at TIMESTAMP WITH TIME ZONE NULL,
          error_message TEXT NULL,
          created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
          CONSTRAINT chk_bcw_status CHECK (status IN ('PENDING', 'BROADCASTED', 'CONFIRMED', 'FAILED')),
          CONSTRAINT chk_bcw_amount CHECK (amount_bnb > 0)
        );

        CREATE INDEX IF NOT EXISTS idx_bcw_withdrawal_id ON blockchain_withdrawals (withdrawal_id);
        CREATE INDEX IF NOT EXISTS idx_bcw_tx_hash ON blockchain_withdrawals (tx_hash);
        CREATE INDEX IF NOT EXISTS idx_bcw_status ON blockchain_withdrawals (status);
        CREATE INDEX IF NOT EXISTS idx_bcw_chain_nonce ON blockchain_withdrawals (chain_id, from_address, nonce);

        -- Multi-instance Nonce Safety Tracker
        CREATE TABLE IF NOT EXISTS payout_wallet_nonces (
          wallet_address VARCHAR(100) NOT NULL,
          chain_id INTEGER NOT NULL,
          last_nonce INTEGER NOT NULL DEFAULT -1,
          updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
          PRIMARY KEY (wallet_address, chain_id)
        );
      `);

      // Update financial_ledger_entries constraint to support BLOCKCHAIN_DEPOSIT & COIN_SWAP & NODE_PURCHASE
      await client.exec(`
        ALTER TABLE financial_ledger_entries DROP CONSTRAINT IF EXISTS chk_fle_source_type;
        ALTER TABLE financial_ledger_entries ADD CONSTRAINT chk_fle_source_type CHECK (source_type IN ('REFERRAL_COMMISSION', 'MATCHING_BONUS', 'PROMOTION_BONUS', 'NODE_REWARD', 'WITHDRAWAL', 'BLOCKCHAIN_DEPOSIT', 'COIN_SWAP', 'NODE_PURCHASE', 'USDT_DEPOSIT', 'BNB_DEPOSIT', 'DEPOSIT_CREDIT', 'ADMIN_ADJUSTMENT'));
      `);
    } catch (task171Err) {
      console.warn('[DB Migration] Task #17.1 BSC schema migration warning:', task171Err);
    }

    // Task #19: System Economic Configurations & Versioned Audit Trail Tables
    try {
      await client.exec(`
        CREATE TABLE IF NOT EXISTS system_economic_configs (
          id UUID PRIMARY KEY,
          config_key VARCHAR(100) UNIQUE NOT NULL,
          config_value TEXT NOT NULL,
          category VARCHAR(50) NOT NULL,
          description TEXT NOT NULL,
          status VARCHAR(20) NOT NULL DEFAULT 'ACTIVE',
          version INTEGER NOT NULL DEFAULT 1,
          effective_from TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
          updated_by_admin_id UUID NULL REFERENCES users(id) ON DELETE SET NULL,
          updated_by_admin_public_id VARCHAR(50) NOT NULL DEFAULT 'SYSTEM_INIT',
          created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
          CONSTRAINT chk_sec_status CHECK (status IN ('ACTIVE', 'PAUSED', 'DISABLED'))
        );

        CREATE INDEX IF NOT EXISTS idx_sec_config_key ON system_economic_configs (config_key);
        CREATE INDEX IF NOT EXISTS idx_sec_category ON system_economic_configs (category);
        CREATE INDEX IF NOT EXISTS idx_sec_status ON system_economic_configs (status);

        CREATE TABLE IF NOT EXISTS economic_config_audit_logs (
          id UUID PRIMARY KEY,
          config_key VARCHAR(100) NOT NULL,
          category VARCHAR(50) NOT NULL,
          old_value TEXT NOT NULL,
          new_value TEXT NOT NULL,
          version INTEGER NOT NULL,
          admin_user_id UUID NULL REFERENCES users(id) ON DELETE SET NULL,
          admin_public_id VARCHAR(50) NOT NULL,
          reason TEXT NULL,
          effective_from TIMESTAMP WITH TIME ZONE NOT NULL,
          ip_address VARCHAR(100) NULL,
          created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
        );

        CREATE INDEX IF NOT EXISTS idx_ecal_config_key ON economic_config_audit_logs (config_key);
        CREATE INDEX IF NOT EXISTS idx_ecal_category ON economic_config_audit_logs (category);
        CREATE INDEX IF NOT EXISTS idx_ecal_admin ON economic_config_audit_logs (admin_user_id);
        CREATE INDEX IF NOT EXISTS idx_ecal_created ON economic_config_audit_logs (created_at DESC);

        -- Relax node_orders and referral_commissions amount constraints to support dynamic admin economic controls
        ALTER TABLE node_orders DROP CONSTRAINT IF EXISTS chk_node_order_amount;
        ALTER TABLE node_orders ADD CONSTRAINT chk_node_order_amount CHECK (amount_usd > 0);

        ALTER TABLE referral_commissions DROP CONSTRAINT IF EXISTS chk_commission_amount;
        ALTER TABLE referral_commissions ADD CONSTRAINT chk_commission_amount CHECK (amount_usd >= 0);
      `);
    } catch (task19Err) {
      console.warn('[DB Migration] Task #19 Economic Configs schema migration warning:', task19Err);
    }

    // Task #19.1: Internal Coin -> USDT Swap Transactions Table
    try {
      await client.exec(`
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

        ALTER TABLE coin_swap_transactions ADD COLUMN IF NOT EXISTS direction VARCHAR(20) NOT NULL DEFAULT 'COIN_TO_USDT';

        -- Update financial_ledger_entries constraint to support COIN_SWAP, ADMIN_ADJUSTMENT & WALLET_TRANSFER
        ALTER TABLE financial_ledger_entries DROP CONSTRAINT IF EXISTS chk_fle_source_type;
        ALTER TABLE financial_ledger_entries ADD CONSTRAINT chk_fle_source_type CHECK (source_type IN ('REFERRAL_COMMISSION', 'MATCHING_BONUS', 'PROMOTION_BONUS', 'NODE_REWARD', 'WITHDRAWAL', 'BLOCKCHAIN_DEPOSIT', 'COIN_SWAP', 'NODE_PURCHASE', 'USDT_DEPOSIT', 'BNB_DEPOSIT', 'DEPOSIT_CREDIT', 'ADMIN_ADJUSTMENT', 'WALLET_TRANSFER'));
      `);
    } catch (task191Err) {
      console.warn('[DB Migration] Task #19.1 Swap Transactions schema migration warning:', task191Err);
    }

    // Task #20: In-App Notifications Table
    try {
      await client.exec(`
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
      `);

      try {
        await client.exec(`
          ALTER TABLE notifications DROP CONSTRAINT IF EXISTS chk_notification_type;
          ALTER TABLE notifications ADD CONSTRAINT chk_notification_type CHECK (type IN (
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
          ));
        `);
      } catch {}
    } catch (task20Err) {
      console.warn('[DB Migration] Task #20 Notifications schema migration warning:', task20Err);
    }

    // Web Push Tokens Table for Firebase Cloud Messaging (FCM)
    try {
      await client.exec(`
        CREATE TABLE IF NOT EXISTS user_push_tokens (
          id UUID PRIMARY KEY,
          user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          token TEXT NOT NULL,
          platform VARCHAR(50) DEFAULT 'WEB',
          user_agent TEXT,
          is_active BOOLEAN DEFAULT TRUE,
          created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
          CONSTRAINT uq_user_push_token UNIQUE (user_id, token)
        );

        CREATE INDEX IF NOT EXISTS idx_user_push_tokens_user ON user_push_tokens (user_id, is_active);
      `);
    } catch (pushErr) {
      console.warn('[DB Migration] Web Push tokens schema migration warning:', pushErr);
    }

    // Task #21: Financial Reconciliation Tables
    try {
      await client.exec(`
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
      `);
    } catch (task21Err) {
      console.warn('[DB Migration] Task #21 Financial Reconciliation schema migration warning:', task21Err);
    }

    // Task #23.3A: Dynamic Matching Configurations & Versioned Audit Trail Tables
    try {
      await client.exec(`
        CREATE TABLE IF NOT EXISTS binary_matching_config (
          id UUID PRIMARY KEY,
          matching_enabled BOOLEAN NOT NULL DEFAULT TRUE,
          daily_max_payout NUMERIC(12, 2) NOT NULL DEFAULT 5000.00,
          sponsor_qualification_required BOOLEAN NOT NULL DEFAULT TRUE,
          carry_forward_behavior VARCHAR(50) NOT NULL DEFAULT 'DISCARD_WEAK_CARRY_STRONG',
          effective_date DATE NOT NULL,
          version INTEGER NOT NULL DEFAULT 1,
          tiers_json TEXT NOT NULL,
          created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS binary_matching_config_audit (
          id UUID PRIMARY KEY,
          config_id UUID NOT NULL REFERENCES binary_matching_config(id) ON DELETE CASCADE,
          admin_user_id UUID NULL REFERENCES users(id) ON DELETE SET NULL,
          old_value_json TEXT NOT NULL,
          new_value_json TEXT NOT NULL,
          effective_time TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
          version INTEGER NOT NULL,
          created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
        );

        -- Seed default matching configuration
        INSERT INTO binary_matching_config (
          id, matching_enabled, daily_max_payout, sponsor_qualification_required,
          carry_forward_behavior, effective_date, version, tiers_json
        )
        SELECT 
          '2c45abba-b586-4032-8cf4-6a039eec92bc', TRUE, 5000.00, TRUE,
          'DISCARD_WEAK_CARRY_STRONG', CURRENT_DATE, 1,
          '[{"units":2,"bonusUsd":500},{"units":4,"bonusUsd":1000},{"units":8,"bonusUsd":1500},{"units":12,"bonusUsd":2000},{"units":16,"bonusUsd":2500},{"units":20,"bonusUsd":3000},{"units":24,"bonusUsd":3500},{"units":28,"bonusUsd":4000},{"units":32,"bonusUsd":4500},{"units":36,"bonusUsd":5000}]'
        WHERE NOT EXISTS (SELECT 1 FROM binary_matching_config);

        -- Update default tier schedule if needed
        UPDATE binary_matching_config
        SET tiers_json = '[{"units":2,"bonusUsd":500},{"units":4,"bonusUsd":1000},{"units":8,"bonusUsd":1500},{"units":12,"bonusUsd":2000},{"units":16,"bonusUsd":2500},{"units":20,"bonusUsd":3000},{"units":24,"bonusUsd":3500},{"units":28,"bonusUsd":4000},{"units":32,"bonusUsd":4500},{"units":36,"bonusUsd":5000}]'
        WHERE version = 1 AND tiers_json LIKE '%"units":6%';
      `);
    } catch (task233AErr) {
      console.warn('[DB Migration] Task #23.3A Dynamic Matching schema migration warning:', task233AErr);
    }

    // Task #23.3B: Dynamic Offers, Banners, and Settings Tables
    try {
      await client.exec(`
        CREATE TABLE IF NOT EXISTS promotional_offers (
          id UUID PRIMARY KEY,
          title TEXT NOT NULL,
          description TEXT NOT NULL,
          banner_image TEXT NOT NULL,
          offer_type VARCHAR(50) NOT NULL DEFAULT 'BOGO_FREE_NODE',
          bonus_nodes_count INTEGER NOT NULL DEFAULT 1,
          bonus_mining_rewards BOOLEAN NOT NULL DEFAULT TRUE,
          bonus_matching_enabled BOOLEAN NOT NULL DEFAULT FALSE,
          bonus_referral_commission BOOLEAN NOT NULL DEFAULT FALSE,
          start_date TIMESTAMP WITH TIME ZONE NOT NULL,
          end_date TIMESTAMP WITH TIME ZONE NOT NULL,
          status VARCHAR(20) NOT NULL DEFAULT 'ACTIVE',
          target_audience VARCHAR(20) NOT NULL DEFAULT 'ALL',
          priority_order INTEGER NOT NULL DEFAULT 0,
          created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
        );

        -- Add columns if missing in existing table
        ALTER TABLE promotional_offers ADD COLUMN IF NOT EXISTS offer_type VARCHAR(50) NOT NULL DEFAULT 'BOGO_FREE_NODE';
        ALTER TABLE promotional_offers ADD COLUMN IF NOT EXISTS bonus_nodes_count INTEGER NOT NULL DEFAULT 1;
        ALTER TABLE promotional_offers ADD COLUMN IF NOT EXISTS bonus_mining_rewards BOOLEAN NOT NULL DEFAULT TRUE;
        ALTER TABLE promotional_offers ADD COLUMN IF NOT EXISTS bonus_matching_enabled BOOLEAN NOT NULL DEFAULT FALSE;
        ALTER TABLE promotional_offers ADD COLUMN IF NOT EXISTS bonus_referral_commission BOOLEAN NOT NULL DEFAULT FALSE;

        -- Seed BOGO offer if none exists
        INSERT INTO promotional_offers (
          id, title, description, banner_image, offer_type, bonus_nodes_count,
          bonus_mining_rewards, bonus_matching_enabled, bonus_referral_commission,
          start_date, end_date, status, target_audience, priority_order
        )
        SELECT
          '3c55abba-b586-4032-8cf4-6a039eec92bc',
          'Buy 1 Genesis Node, Get 1 Free Promo Node (BOGO)',
          'Limited promotion: Acquire 1 Genesis Validator Node and receive 1 Free Promo Node. The Free Node accrues daily mining coin rewards without binary matching or direct spot commissions.',
          'https://images.unsplash.com/photo-1639762681485-074b7f938ba0?q=80&w=800&auto=format&fit=crop',
          'BOGO_FREE_NODE',
          1,
          TRUE,
          FALSE,
          FALSE,
          CURRENT_TIMESTAMP - INTERVAL '1 day',
          CURRENT_TIMESTAMP + INTERVAL '90 days',
          'ACTIVE',
          'ALL',
          1
        WHERE NOT EXISTS (SELECT 1 FROM promotional_offers WHERE offer_type = 'BOGO_FREE_NODE');

        CREATE TABLE IF NOT EXISTS promotional_banners (
          id UUID PRIMARY KEY,
          content TEXT NOT NULL,
          image_url TEXT NOT NULL,
          cta_text VARCHAR(100) NOT NULL,
          cta_destination VARCHAR(255) NOT NULL,
          display_order INTEGER NOT NULL DEFAULT 0,
          status VARCHAR(20) NOT NULL DEFAULT 'ACTIVE',
          start_date TIMESTAMP WITH TIME ZONE NOT NULL,
          end_date TIMESTAMP WITH TIME ZONE NOT NULL,
          created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS promotional_settings (
          key VARCHAR(100) PRIMARY KEY,
          value TEXT NOT NULL,
          created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
        );

        -- Seed default settings if they don't exist
        INSERT INTO promotional_settings (key, value)
        VALUES 
          ('leaderboard_metric', '"DIRECT_REFERRALS"'),
          ('performance_popup', '{"enabled":true,"metric":"DIRECT_REFERRALS","topCount":3,"durationSeconds":5}')
        ON CONFLICT (key) DO NOTHING;
      `);
    } catch (task233BErr) {
      console.warn('[DB Migration] Task #23.3B Promotional schema migration warning:', task233BErr);
    }

    // Task #23.4: Dynamic Email & Automation Engine Tables
    try {
      await client.exec(`
        CREATE TABLE IF NOT EXISTS email_templates (
          id UUID PRIMARY KEY,
          event_name VARCHAR(100) UNIQUE NOT NULL,
          subject TEXT NOT NULL,
          body_html TEXT NOT NULL,
          enabled BOOLEAN NOT NULL DEFAULT TRUE,
          created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS email_queue (
          id UUID PRIMARY KEY,
          to_email VARCHAR(255) NOT NULL,
          subject TEXT NOT NULL,
          body_html TEXT NOT NULL,
          status VARCHAR(20) NOT NULL DEFAULT 'QUEUED',
          provider_message_id VARCHAR(255) NULL,
          error_message TEXT NULL,
          sent_at TIMESTAMP WITH TIME ZONE NULL,
          scheduled_send_at TIMESTAMP WITH TIME ZONE NULL,
          created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
        );

        -- Ensure column exists for already created tables
        ALTER TABLE email_queue ADD COLUMN IF NOT EXISTS scheduled_send_at TIMESTAMP WITH TIME ZONE NULL;

        CREATE TABLE IF NOT EXISTS automation_rules (
          id UUID PRIMARY KEY,
          name VARCHAR(255) NOT NULL,
          enabled BOOLEAN NOT NULL DEFAULT TRUE,
          trigger_criteria VARCHAR(100) NOT NULL,
          delay_hours INTEGER NOT NULL DEFAULT 0,
          cooldown_days INTEGER NOT NULL DEFAULT 7,
          template_id UUID NOT NULL REFERENCES email_templates(id) ON DELETE CASCADE,
          created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS automation_cooldowns (
          id UUID PRIMARY KEY,
          user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          rule_id UUID NOT NULL REFERENCES automation_rules(id) ON DELETE CASCADE,
          last_triggered_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
          CONSTRAINT uq_user_rule UNIQUE (user_id, rule_id)
        );

        -- Seed default templates with rich cyber-luxe digital transformation HTML
        INSERT INTO email_templates (id, event_name, subject, body_html, enabled)
        VALUES 
          ('e0011111-1111-1111-1111-111111111111', 'WELCOME', 'Welcome to PHIVONEX Digital Infrastructure Engine', '<div style="background-color: #05070c; font-family: -apple-system, BlinkMacSystemFont, ''Segoe UI'', Roboto, Helvetica, Arial, sans-serif; color: #f8fafc; padding: 40px 15px; margin: 0; width: 100%;"><table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width: 620px; margin: 0 auto; background-color: #0b1329; border: 1px solid #1e293b; border-radius: 16px; overflow: hidden; box-shadow: 0 20px 50px rgba(0, 207, 255, 0.08);"><tr><td style="background: linear-gradient(135deg, #0f172a 0%, #070d1e 100%); padding: 32px 30px; border-bottom: 1px solid rgba(0, 207, 255, 0.2); text-align: center;"><div style="font-size: 26px; font-weight: 900; letter-spacing: 4px; color: #ffffff; font-family: monospace;">PHIVONEX</div><div style="font-size: 10px; font-weight: 700; letter-spacing: 2px; color: #00CFFF; margin-top: 6px; text-transform: uppercase;">DECENTRALIZED AUTONOMOUS NODE INFRASTRUCTURE</div></td></tr><tr><td style="padding: 35px 30px;"><div style="display: inline-block; padding: 6px 14px; background: rgba(0, 207, 255, 0.12); border: 1px solid rgba(0, 207, 255, 0.3); border-radius: 20px; font-size: 11px; font-weight: 700; color: #00CFFF; font-family: monospace; text-transform: uppercase; margin-bottom: 20px;">OPERATOR INITIALIZATION</div><h1 style="font-size: 22px; font-weight: 800; color: #ffffff; margin: 0 0 14px 0; line-height: 1.3;">Welcome to PHIVONEX Matrix, {{displayName}}!</h1><p style="font-size: 14px; color: #94a3b8; line-height: 1.6; margin: 0 0 25px 0;">Your decentralized operator profile has been successfully provisioned. You are now connected to the PHIVONEX high-throughput validator node network with cryptographically secured real-time settlement capability.</p><table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background: rgba(15, 23, 42, 0.8); border: 1px solid rgba(255, 255, 255, 0.08); border-radius: 12px; margin-bottom: 25px; font-size: 13px;"><tr><td style="padding: 14px 18px; border-bottom: 1px solid rgba(255, 255, 255, 0.05); color: #64748b; font-weight: 600;">Public Operator ID</td><td style="padding: 14px 18px; border-bottom: 1px solid rgba(255, 255, 255, 0.05); color: #00CFFF; font-weight: 700; font-family: monospace; text-align: right;">{{publicId}}</td></tr><tr><td style="padding: 14px 18px; color: #64748b; font-weight: 600;">Status</td><td style="padding: 14px 18px; color: #10B981; font-weight: 700; text-align: right;">ACTIVE OPERATOR</td></tr></table><div style="text-align: center; margin: 30px 0 15px 0;"><a href="https://phivonex.com/app/dashboard" style="display: inline-block; padding: 14px 32px; background: linear-gradient(135deg, #00CFFF 0%, #0077FF 100%); color: #05070c; font-size: 14px; font-weight: 800; text-decoration: none; border-radius: 10px; box-shadow: 0 0 25px rgba(0, 207, 255, 0.35); text-transform: uppercase; letter-spacing: 0.5px;">Access Console</a></div></td></tr><tr><td style="background-color: #070c1a; padding: 25px 30px; border-top: 1px solid rgba(255, 255, 255, 0.06); font-size: 11px; color: #475569; line-height: 1.5; text-align: center;"><p style="margin: 0 0 8px 0; font-family: monospace; color: #64748b;">PHIVONEX Digital Infrastructure Engine • 256-bit Encrypted Channel</p><p style="margin: 0;">Automated Operational Transmission.</p></td></tr></table></div>', TRUE),

          ('e0022222-2222-2222-2222-222222222222', 'REFERRAL_SIGNUP', 'New Network Referral Registered', '<div style="background-color: #05070c; font-family: -apple-system, BlinkMacSystemFont, ''Segoe UI'', Roboto, Helvetica, Arial, sans-serif; color: #f8fafc; padding: 40px 15px; margin: 0; width: 100%;"><table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width: 620px; margin: 0 auto; background-color: #0b1329; border: 1px solid #1e293b; border-radius: 16px; overflow: hidden; box-shadow: 0 20px 50px rgba(0, 207, 255, 0.08);"><tr><td style="background: linear-gradient(135deg, #0f172a 0%, #070d1e 100%); padding: 32px 30px; border-bottom: 1px solid rgba(50, 213, 131, 0.3); text-align: center;"><div style="font-size: 26px; font-weight: 900; letter-spacing: 4px; color: #ffffff; font-family: monospace;">PHIVONEX</div><div style="font-size: 10px; font-weight: 700; letter-spacing: 2px; color: #32D583; margin-top: 6px; text-transform: uppercase;">REFERRAL NETWORK GROWTH ENGINE</div></td></tr><tr><td style="padding: 35px 30px;"><div style="display: inline-block; padding: 6px 14px; background: rgba(50, 213, 131, 0.12); border: 1px solid rgba(50, 213, 131, 0.3); border-radius: 20px; font-size: 11px; font-weight: 700; color: #32D583; font-family: monospace; text-transform: uppercase; margin-bottom: 20px;">NEW REFERRAL REGISTERED</div><h1 style="font-size: 22px; font-weight: 800; color: #ffffff; margin: 0 0 14px 0; line-height: 1.3;">New Operator Registered!</h1><p style="font-size: 14px; color: #94a3b8; line-height: 1.6; margin: 0 0 25px 0;">A new operator registered using your referral code. When they activate a Genesis Node, you will earn direct referral commissions and binary matching points.</p><table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background: rgba(15, 23, 42, 0.8); border: 1px solid rgba(255, 255, 255, 0.08); border-radius: 12px; margin-bottom: 25px; font-size: 13px;"><tr><td style="padding: 14px 18px; border-bottom: 1px solid rgba(255, 255, 255, 0.05); color: #64748b; font-weight: 600;">Referred Operator</td><td style="padding: 14px 18px; border-bottom: 1px solid rgba(255, 255, 255, 0.05); color: #ffffff; font-weight: 700; text-align: right;">{{displayName}}</td></tr><tr><td style="padding: 14px 18px; color: #64748b; font-weight: 600;">Operator ID</td><td style="padding: 14px 18px; color: #32D583; font-weight: 700; font-family: monospace; text-align: right;">{{publicId}}</td></tr></table><div style="text-align: center; margin: 30px 0 15px 0;"><a href="https://phivonex.com/app/referrals" style="display: inline-block; padding: 14px 32px; background: linear-gradient(135deg, #32D583 0%, #10B981 100%); color: #05070c; font-size: 14px; font-weight: 800; text-decoration: none; border-radius: 10px; box-shadow: 0 0 25px rgba(50, 213, 131, 0.35); text-transform: uppercase; letter-spacing: 0.5px;">View Referral Tree</a></div></td></tr><tr><td style="background-color: #070c1a; padding: 25px 30px; border-top: 1px solid rgba(255, 255, 255, 0.06); font-size: 11px; color: #475569; line-height: 1.5; text-align: center;"><p style="margin: 0 0 8px 0; font-family: monospace; color: #64748b;">PHIVONEX Digital Infrastructure Engine • Network Growth Audit</p><p style="margin: 0;">Automated Referral Tracking System.</p></td></tr></table></div>', TRUE),

          ('e0033333-3333-3333-3333-333333333333', 'NODE_ACTIVATION', 'Genesis Node Activated and Operational', '<div style="background-color: #05070c; font-family: -apple-system, BlinkMacSystemFont, ''Segoe UI'', Roboto, Helvetica, Arial, sans-serif; color: #f8fafc; padding: 40px 15px; margin: 0; width: 100%;"><table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width: 620px; margin: 0 auto; background-color: #0b1329; border: 1px solid #1e293b; border-radius: 16px; overflow: hidden; box-shadow: 0 20px 50px rgba(0, 207, 255, 0.08);"><tr><td style="background: linear-gradient(135deg, #0f172a 0%, #070d1e 100%); padding: 32px 30px; border-bottom: 1px solid rgba(0, 207, 255, 0.3); text-align: center;"><div style="font-size: 26px; font-weight: 900; letter-spacing: 4px; color: #ffffff; font-family: monospace;">PHIVONEX</div><div style="font-size: 10px; font-weight: 700; letter-spacing: 2px; color: #00CFFF; margin-top: 6px; text-transform: uppercase;">GENESIS VALIDATOR NODE INFRASTRUCTURE</div></td></tr><tr><td style="padding: 35px 30px;"><div style="display: inline-block; padding: 6px 14px; background: rgba(0, 207, 255, 0.12); border: 1px solid rgba(0, 207, 255, 0.3); border-radius: 20px; font-size: 11px; font-weight: 700; color: #00CFFF; font-family: monospace; text-transform: uppercase; margin-bottom: 20px;">NODE ACTIVE & OPERATIONAL</div><h1 style="font-size: 22px; font-weight: 800; color: #ffffff; margin: 0 0 14px 0; line-height: 1.3;">Genesis Node Activated!</h1><p style="font-size: 14px; color: #94a3b8; line-height: 1.6; margin: 0 0 25px 0;">Your Genesis Node has been provisioned and is actively mining daily PHIVO coin rewards in the PHIVONEX ecosystem.</p><table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background: rgba(15, 23, 42, 0.8); border: 1px solid rgba(255, 255, 255, 0.08); border-radius: 12px; margin-bottom: 25px; font-size: 13px;"><tr><td style="padding: 14px 18px; border-bottom: 1px solid rgba(255, 255, 255, 0.05); color: #64748b; font-weight: 600;">Node ID</td><td style="padding: 14px 18px; border-bottom: 1px solid rgba(255, 255, 255, 0.05); color: #00CFFF; font-weight: 800; font-family: monospace; text-align: right;">PHX-NODE-{{nodeNumber}}</td></tr><tr><td style="padding: 14px 18px; color: #64748b; font-weight: 600;">Daily Mining Status</td><td style="padding: 14px 18px; color: #10B981; font-weight: 700; text-align: right;">ACTIVE (24/7 MINING)</td></tr></table><div style="text-align: center; margin: 30px 0 15px 0;"><a href="https://phivonex.com/app/nodes" style="display: inline-block; padding: 14px 32px; background: linear-gradient(135deg, #00CFFF 0%, #0077FF 100%); color: #05070c; font-size: 14px; font-weight: 800; text-decoration: none; border-radius: 10px; box-shadow: 0 0 25px rgba(0, 207, 255, 0.35); text-transform: uppercase; letter-spacing: 0.5px;">Manage Genesis Nodes</a></div></td></tr><tr><td style="background-color: #070c1a; padding: 25px 30px; border-top: 1px solid rgba(255, 255, 255, 0.06); font-size: 11px; color: #475569; line-height: 1.5; text-align: center;"><p style="margin: 0 0 8px 0; font-family: monospace; color: #64748b;">PHIVONEX Autonomous Digital Infrastructure • Telemetry Sync</p><p style="margin: 0;">Real-Time Block Validation Active.</p></td></tr></table></div>', TRUE),

          ('e0044444-4444-4444-4444-444444444444', 'DEPOSIT_CONFIRM', 'USDT On-Chain Deposit Confirmed', '<div style="background-color: #05070c; font-family: -apple-system, BlinkMacSystemFont, ''Segoe UI'', Roboto, Helvetica, Arial, sans-serif; color: #f8fafc; padding: 40px 15px; margin: 0; width: 100%;"><table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width: 620px; margin: 0 auto; background-color: #0b1329; border: 1px solid #1e293b; border-radius: 16px; overflow: hidden; box-shadow: 0 20px 50px rgba(0, 207, 255, 0.08);"><tr><td style="background: linear-gradient(135deg, #0f172a 0%, #070d1e 100%); padding: 32px 30px; border-bottom: 1px solid rgba(16, 185, 129, 0.3); text-align: center;"><div style="font-size: 26px; font-weight: 900; letter-spacing: 4px; color: #ffffff; font-family: monospace;">PHIVONEX</div><div style="font-size: 10px; font-weight: 700; letter-spacing: 2px; color: #10B981; margin-top: 6px; text-transform: uppercase;">ON-CHAIN FINANCIAL SETTLEMENT</div></td></tr><tr><td style="padding: 35px 30px;"><div style="display: inline-block; padding: 6px 14px; background: rgba(16, 185, 129, 0.12); border: 1px solid rgba(16, 185, 129, 0.3); border-radius: 20px; font-size: 11px; font-weight: 700; color: #10B981; font-family: monospace; text-transform: uppercase; margin-bottom: 20px;">DEPOSIT CONFIRMED</div><h1 style="font-size: 22px; font-weight: 800; color: #ffffff; margin: 0 0 14px 0; line-height: 1.3;">USDT Deposit Confirmed!</h1><p style="font-size: 14px; color: #94a3b8; line-height: 1.6; margin: 0 0 25px 0;">Your deposit has been verified on the BNB Smart Chain (BSC) network and credited to your available deposit balance. You can use it for node purchases, coin buys, or withdrawals.</p><table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background: rgba(15, 23, 42, 0.8); border: 1px solid rgba(255, 255, 255, 0.08); border-radius: 12px; margin-bottom: 25px; font-size: 13px;"><tr><td style="padding: 14px 18px; border-bottom: 1px solid rgba(255, 255, 255, 0.05); color: #64748b; font-weight: 600;">Amount Credited</td><td style="padding: 14px 18px; border-bottom: 1px solid rgba(255, 255, 255, 0.05); color: #10B981; font-weight: 800; font-size: 16px; font-family: monospace; text-align: right;">+\${{amount}} USDT</td></tr><tr><td style="padding: 14px 18px; color: #64748b; font-weight: 600;">Network</td><td style="padding: 14px 18px; color: #e2e8f0; font-weight: 600; text-align: right;">BNB Smart Chain (BSC)</td></tr></table><div style="text-align: center; margin: 30px 0 15px 0;"><a href="https://phivonex.com/app/deposit" style="display: inline-block; padding: 14px 32px; background: linear-gradient(135deg, #10B981 0%, #059669 100%); color: #ffffff; font-size: 14px; font-weight: 800; text-decoration: none; border-radius: 10px; box-shadow: 0 0 25px rgba(16, 185, 129, 0.35); text-transform: uppercase; letter-spacing: 0.5px;">View Available Balance</a></div></td></tr><tr><td style="background-color: #070c1a; padding: 25px 30px; border-top: 1px solid rgba(255, 255, 255, 0.06); font-size: 11px; color: #475569; line-height: 1.5; text-align: center;"><p style="margin: 0 0 8px 0; font-family: monospace; color: #64748b;">PHIVONEX Digital Infrastructure Engine • On-Chain Telemetry</p><p style="margin: 0;">Verified 256-Bit Cryptographic Settlement Notice.</p></td></tr></table></div>', TRUE),

          ('e0055555-5555-5555-5555-555555555555', 'REWARD', 'PHIVO Daily Mining Reward Accrued', '<div style="background-color: #05070c; font-family: -apple-system, BlinkMacSystemFont, ''Segoe UI'', Roboto, Helvetica, Arial, sans-serif; color: #f8fafc; padding: 40px 15px; margin: 0; width: 100%;"><table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width: 620px; margin: 0 auto; background-color: #0b1329; border: 1px solid #1e293b; border-radius: 16px; overflow: hidden; box-shadow: 0 20px 50px rgba(0, 207, 255, 0.08);"><tr><td style="background: linear-gradient(135deg, #0f172a 0%, #070d1e 100%); padding: 32px 30px; border-bottom: 1px solid rgba(16, 185, 129, 0.3); text-align: center;"><div style="font-size: 26px; font-weight: 900; letter-spacing: 4px; color: #ffffff; font-family: monospace;">PHIVONEX</div><div style="font-size: 10px; font-weight: 700; letter-spacing: 2px; color: #10B981; margin-top: 6px; text-transform: uppercase;">DAILY MINING REWARD DISTRIBUTION</div></td></tr><tr><td style="padding: 35px 30px;"><div style="display: inline-block; padding: 6px 14px; background: rgba(16, 185, 129, 0.12); border: 1px solid rgba(16, 185, 129, 0.3); border-radius: 20px; font-size: 11px; font-weight: 700; color: #10B981; font-family: monospace; text-transform: uppercase; margin-bottom: 20px;">MINING REWARD ACCRUED</div><h1 style="font-size: 22px; font-weight: 800; color: #ffffff; margin: 0 0 14px 0; line-height: 1.3;">PHIVO Mining Reward Accrued!</h1><p style="font-size: 14px; color: #94a3b8; line-height: 1.6; margin: 0 0 25px 0;">Your Genesis Nodes generated daily mining rewards for the current epoch. PHIVO coins have been credited to your reward ledger.</p><table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background: rgba(15, 23, 42, 0.8); border: 1px solid rgba(255, 255, 255, 0.08); border-radius: 12px; margin-bottom: 25px; font-size: 13px;"><tr><td style="padding: 14px 18px; border-bottom: 1px solid rgba(255, 255, 255, 0.05); color: #64748b; font-weight: 600;">Reward Accrued</td><td style="padding: 14px 18px; color: #10B981; font-weight: 800; font-size: 16px; font-family: monospace; text-align: right;">+{{amount}} PHIVO</td></tr></table><div style="text-align: center; margin: 30px 0 15px 0;"><a href="https://phivonex.com/app/rewards" style="display: inline-block; padding: 14px 32px; background: linear-gradient(135deg, #10B981 0%, #059669 100%); color: #ffffff; font-size: 14px; font-weight: 800; text-decoration: none; border-radius: 10px; box-shadow: 0 0 25px rgba(16, 185, 129, 0.35); text-transform: uppercase; letter-spacing: 0.5px;">View Reward Console</a></div></td></tr><tr><td style="background-color: #070c1a; padding: 25px 30px; border-top: 1px solid rgba(255, 255, 255, 0.06); font-size: 11px; color: #475569; line-height: 1.5; text-align: center;"><p style="margin: 0 0 8px 0; font-family: monospace; color: #64748b;">PHIVONEX Digital Infrastructure Engine • Epoch Settlement</p><p style="margin: 0;">Cryptographically Validated Distribution Notice.</p></td></tr></table></div>', TRUE),

          ('e0066666-6666-6666-6666-666666666666', 'SWAP_COMPLETE', 'PHIVO to USDT Swap Completed', '<div style="background-color: #05070c; font-family: -apple-system, BlinkMacSystemFont, ''Segoe UI'', Roboto, Helvetica, Arial, sans-serif; color: #f8fafc; padding: 40px 15px; margin: 0; width: 100%;"><table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width: 620px; margin: 0 auto; background-color: #0b1329; border: 1px solid #1e293b; border-radius: 16px; overflow: hidden; box-shadow: 0 20px 50px rgba(0, 207, 255, 0.08);"><tr><td style="background: linear-gradient(135deg, #0f172a 0%, #070d1e 100%); padding: 32px 30px; border-bottom: 1px solid rgba(56, 189, 248, 0.3); text-align: center;"><div style="font-size: 26px; font-weight: 900; letter-spacing: 4px; color: #ffffff; font-family: monospace;">PHIVONEX</div><div style="font-size: 10px; font-weight: 700; letter-spacing: 2px; color: #38BDF8; margin-top: 6px; text-transform: uppercase;">INSTANT LIQUIDITY SWAP ENGINE</div></td></tr><tr><td style="padding: 35px 30px;"><div style="display: inline-block; padding: 6px 14px; background: rgba(56, 189, 248, 0.12); border: 1px solid rgba(56, 189, 248, 0.3); border-radius: 20px; font-size: 11px; font-weight: 700; color: #38BDF8; font-family: monospace; text-transform: uppercase; margin-bottom: 20px;">SWAP EXECUTED</div><h1 style="font-size: 22px; font-weight: 800; color: #ffffff; margin: 0 0 14px 0; line-height: 1.3;">PHIVO → USDT Swap Completed!</h1><p style="font-size: 14px; color: #94a3b8; line-height: 1.6; margin: 0 0 25px 0;">Your coin swap order executed instantly. Your PHIVO coins were converted into USDT and credited directly to your available balance.</p><table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background: rgba(15, 23, 42, 0.8); border: 1px solid rgba(255, 255, 255, 0.08); border-radius: 12px; margin-bottom: 25px; font-size: 13px;"><tr><td style="padding: 14px 18px; border-bottom: 1px solid rgba(255, 255, 255, 0.05); color: #64748b; font-weight: 600;">Swapped PHIVO</td><td style="padding: 14px 18px; border-bottom: 1px solid rgba(255, 255, 255, 0.05); color: #e2e8f0; font-weight: 700; font-family: monospace; text-align: right;">{{fromAmount}} PHIVO</td></tr><tr><td style="padding: 14px 18px; color: #64748b; font-weight: 600;">Received USDT</td><td style="padding: 14px 18px; color: #38BDF8; font-weight: 800; font-size: 15px; font-family: monospace; text-align: right;">+\${{toAmount}} USDT</td></tr></table><div style="text-align: center; margin: 30px 0 15px 0;"><a href="https://phivonex.com/app/swap" style="display: inline-block; padding: 14px 32px; background: linear-gradient(135deg, #38BDF8 0%, #0284C7 100%); color: #05070c; font-size: 14px; font-weight: 800; text-decoration: none; border-radius: 10px; box-shadow: 0 0 25px rgba(56, 189, 248, 0.35); text-transform: uppercase; letter-spacing: 0.5px;">Access Swap Desk</a></div></td></tr><tr><td style="background-color: #070c1a; padding: 25px 30px; border-top: 1px solid rgba(255, 255, 255, 0.06); font-size: 11px; color: #475569; line-height: 1.5; text-align: center;"><p style="margin: 0 0 8px 0; font-family: monospace; color: #64748b;">PHIVONEX Digital Infrastructure Engine • Liquidity Pool</p><p style="margin: 0;">Automated Market Settlement Notice.</p></td></tr></table></div>', TRUE),

          ('e0077777-7777-7777-7777-777777777777', 'WITHDRAWAL_STATUS', 'Withdrawal Request Update', '<div style="background-color: #05070c; font-family: -apple-system, BlinkMacSystemFont, ''Segoe UI'', Roboto, Helvetica, Arial, sans-serif; color: #f8fafc; padding: 40px 15px; margin: 0; width: 100%;"><table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width: 620px; margin: 0 auto; background-color: #0b1329; border: 1px solid #1e293b; border-radius: 16px; overflow: hidden; box-shadow: 0 20px 50px rgba(0, 207, 255, 0.08);"><tr><td style="background: linear-gradient(135deg, #0f172a 0%, #070d1e 100%); padding: 32px 30px; border-bottom: 1px solid rgba(245, 158, 11, 0.3); text-align: center;"><div style="font-size: 26px; font-weight: 900; letter-spacing: 4px; color: #ffffff; font-family: monospace;">PHIVONEX</div><div style="font-size: 10px; font-weight: 700; letter-spacing: 2px; color: #F59E0B; margin-top: 6px; text-transform: uppercase;">WITHDRAWAL DISBURSEMENT ENGINE</div></td></tr><tr><td style="padding: 35px 30px;"><div style="display: inline-block; padding: 6px 14px; background: rgba(245, 158, 11, 0.12); border: 1px solid rgba(245, 158, 11, 0.3); border-radius: 20px; font-size: 11px; font-weight: 700; color: #F59E0B; font-family: monospace; text-transform: uppercase; margin-bottom: 20px;">WITHDRAWAL STATUS: {{status}}</div><h1 style="font-size: 22px; font-weight: 800; color: #ffffff; margin: 0 0 14px 0; line-height: 1.3;">Withdrawal Request Update</h1><p style="font-size: 14px; color: #94a3b8; line-height: 1.6; margin: 0 0 25px 0;">Your withdrawal request of \${{amount}} USDT has been updated. Check details below.</p><table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background: rgba(15, 23, 42, 0.8); border: 1px solid rgba(255, 255, 255, 0.08); border-radius: 12px; margin-bottom: 25px; font-size: 13px;"><tr><td style="padding: 14px 18px; border-bottom: 1px solid rgba(255, 255, 255, 0.05); color: #64748b; font-weight: 600;">Amount</td><td style="padding: 14px 18px; border-bottom: 1px solid rgba(255, 255, 255, 0.05); color: #F59E0B; font-weight: 800; font-size: 15px; font-family: monospace; text-align: right;">\${{amount}} USDT</td></tr><tr><td style="padding: 14px 18px; color: #64748b; font-weight: 600;">Status</td><td style="padding: 14px 18px; color: #ffffff; font-weight: 700; text-align: right;">{{status}}</td></tr></table><div style="text-align: center; margin: 30px 0 15px 0;"><a href="https://phivonex.com/app/withdrawals" style="display: inline-block; padding: 14px 32px; background: linear-gradient(135deg, #F59E0B 0%, #D97706 100%); color: #ffffff; font-size: 14px; font-weight: 800; text-decoration: none; border-radius: 10px; box-shadow: 0 0 25px rgba(245, 158, 11, 0.35); text-transform: uppercase; letter-spacing: 0.5px;">View Withdrawals</a></div></td></tr><tr><td style="background-color: #070c1a; padding: 25px 30px; border-top: 1px solid rgba(255, 255, 255, 0.06); font-size: 11px; color: #475569; line-height: 1.5; text-align: center;"><p style="margin: 0 0 8px 0; font-family: monospace; color: #64748b;">PHIVONEX Digital Infrastructure Engine • On-Chain Disbursement</p><p style="margin: 0;">Real-Time Financial Settlement Notice.</p></td></tr></table></div>', TRUE),

          ('e0088888-8888-8888-8888-888888888888', 'SECURITY_ALERT', 'PHIVONEX Security Alert: Account Modified', '<div style="background-color: #05070c; font-family: -apple-system, BlinkMacSystemFont, ''Segoe UI'', Roboto, Helvetica, Arial, sans-serif; color: #f8fafc; padding: 40px 15px; margin: 0; width: 100%;"><table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width: 620px; margin: 0 auto; background-color: #0b1329; border: 1px solid #1e293b; border-radius: 16px; overflow: hidden; box-shadow: 0 20px 50px rgba(0, 207, 255, 0.08);"><tr><td style="background: linear-gradient(135deg, #0f172a 0%, #070d1e 100%); padding: 32px 30px; border-bottom: 1px solid rgba(239, 68, 68, 0.3); text-align: center;"><div style="font-size: 26px; font-weight: 900; letter-spacing: 4px; color: #ffffff; font-family: monospace;">PHIVONEX</div><div style="font-size: 10px; font-weight: 700; letter-spacing: 2px; color: #EF4444; margin-top: 6px; text-transform: uppercase;">SECURITY AUDIT MONITORING</div></td></tr><tr><td style="padding: 35px 30px;"><div style="display: inline-block; padding: 6px 14px; background: rgba(239, 68, 68, 0.12); border: 1px solid rgba(239, 68, 68, 0.3); border-radius: 20px; font-size: 11px; font-weight: 700; color: #EF4444; font-family: monospace; text-transform: uppercase; margin-bottom: 20px;">SECURITY ALERT</div><h1 style="font-size: 22px; font-weight: 800; color: #ffffff; margin: 0 0 14px 0; line-height: 1.3;">Account Security Notice</h1><p style="font-size: 14px; color: #94a3b8; line-height: 1.6; margin: 0 0 25px 0;">Your account credentials or security parameters have been modified. If you performed this change, no action is required.</p><div style="text-align: center; margin: 30px 0 15px 0;"><a href="https://phivonex.com/app/security" style="display: inline-block; padding: 14px 32px; background: linear-gradient(135deg, #EF4444 0%, #DC2626 100%); color: #ffffff; font-size: 14px; font-weight: 800; text-decoration: none; border-radius: 10px; box-shadow: 0 0 25px rgba(239, 68, 68, 0.35); text-transform: uppercase; letter-spacing: 0.5px;">Review Security Log</a></div></td></tr><tr><td style="background-color: #070c1a; padding: 25px 30px; border-top: 1px solid rgba(255, 255, 255, 0.06); font-size: 11px; color: #475569; line-height: 1.5; text-align: center;"><p style="margin: 0 0 8px 0; font-family: monospace; color: #64748b;">PHIVONEX Digital Infrastructure Engine • Security Operations</p><p style="margin: 0;">If you did not perform this action, contact support immediately.</p></td></tr></table></div>', TRUE)
        ON CONFLICT (event_name) DO UPDATE SET 
          subject = EXCLUDED.subject,
          body_html = EXCLUDED.body_html;
      `);
    } catch (task234Err) {
      console.warn('[DB Migration] Task #23.4 Email & Automation schema migration warning:', task234Err);
    }

    // Sequential Binary Promotion + Leadership Rank Engine
    try {
      const { ensurePromotionTables } = await import('../services/leadershipRankService');
      await ensurePromotionTables(client);
    } catch (promoErr) {
      console.warn('[DB Migration] Sequential Promotion schema migration warning:', promoErr);
    }

    // 3. Backfill existing users with missing public_id, user_referrals, and binary_placements
    await backfillExistingUsers(client);

    // 4. Seed Genesis Nodes inventory (10,000 nodes)
    await seedGenesisNodes(client);

    // 5. Seed System Economic Parameters
    await seedEconomicConfigs(client);

    // 6. Hydrate users and essential records from persistent Cloud Firestore across rollouts
    await restoreUsersFromFirestore(client);

    console.log('[DB] PostgreSQL schema & Task #6 Genesis Node migrations initialized successfully.');
  } catch (err) {
    console.error('[DB] Error initializing schema:', err);
    throw err;
  }
}

/**
 * Hydrates users and associated essential records from Google Cloud Firestore
 * into the active database upon startup/rollout.
 * Ensures user accounts and credentials persist seamlessly across all container restarts.
 */
async function restoreUsersFromFirestore(client: DatabaseClient) {
  // Regression/E2E suites use isolated PGlite databases and must never reach
  // external Google Cloud services. Keeping the dynamic Firebase import below
  // this guard prevents ADC lookup and makes tests hermetic/reproducible.
  if ((process.env.NODE_ENV || '').toLowerCase() === 'test') {
    console.log('[DB Hydration] Skipped in test environment (isolated database).');
    return;
  }

  try {
    const { adminFirestore } = await import('../../lib/firebase-admin');
    console.log('[DB Hydration] Checking Firestore for persistent users across rollouts...');
    const snapshot = await adminFirestore.collection('users').get();
    if (snapshot.empty) {
      console.log('[DB Hydration] No Firestore users found to restore.');
      return;
    }

    let restoredCount = 0;
    for (const doc of snapshot.docs) {
      const u = doc.data();
      const email = u.email?.toLowerCase()?.trim();
      if (!email) continue;

      const existing = await client.query(`SELECT id FROM users WHERE LOWER(email) = $1`, [email]);
      if (existing.rowCount === 0) {
        const userId = u.id || u.uid || doc.id;
        const publicId = u.publicId || `PHX-${Math.floor(100000 + Math.random() * 900000)}`;
        const referralCode = u.referralCode || `PHX${Math.floor(10000 + Math.random() * 90000)}`;
        const role = (email === 'md.asifuzzman.dhakacollege@gmail.com' || email === 'mdasifuzzman.official@gmail.com' || email === 'admin@phivonex.com') ? 'ADMIN' : (u.role || 'USER');

        await client.query(`
          INSERT INTO users (
            id, public_id, full_name, email, phone, country, password_hash,
            status, role, email_verified_at, created_at, updated_at
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
          ON CONFLICT (id) DO NOTHING
        `, [
          userId,
          publicId,
          u.fullName || email.split('@')[0],
          email,
          u.phone || null,
          u.country || 'Global',
          u.passwordHash || '$argon2id$v=19$m=65536,t=3,p=4$dummyhashforrestoreduser',
          u.status || 'ACTIVE',
          role,
        ]);

        await client.query(`
          INSERT INTO user_referrals (user_id, referral_code, created_at)
          VALUES ($1, $2, CURRENT_TIMESTAMP)
          ON CONFLICT (user_id) DO NOTHING
        `, [userId, referralCode]);

        await client.query(`
          INSERT INTO binary_placements (user_id, parent_user_id, side, status, placed_at, created_at)
          VALUES ($1, NULL, NULL, 'UNPLACED', NULL, CURRENT_TIMESTAMP)
          ON CONFLICT (user_id) DO NOTHING
        `, [userId]);

        restoredCount++;
      }
    }

    if (restoredCount > 0) {
      console.log(`[DB Hydration] Successfully verified and restored ${restoredCount} user(s) from persistent Firestore cloud storage!`);
    } else {
      console.log('[DB Hydration] All Firestore users are already up-to-date in database.');
    }
  } catch (syncErr: any) {
    console.warn('[DB Hydration] Firestore restore skipped or notice:', syncErr?.message || syncErr);
  }
}

/**
 * Backfill existing users:
 * 1. Assign public_id if missing
 * 2. Assign referral_code in user_referrals if missing
 * 3. Resolve pending_referral_code if sponsor relationship not yet set
 */
async function backfillExistingUsers(client: DatabaseClient) {
  try {
    // 1. Users missing public_id
    const usersMissingPublicId = await client.query<{ id: string }>(
      `SELECT id FROM users WHERE public_id IS NULL OR public_id = ''`
    );

    for (const u of usersMissingPublicId.rows) {
      let assigned = false;
      while (!assigned) {
        const candidate = generatePublicId();
        const existing = await client.query(`SELECT 1 FROM users WHERE public_id = $1`, [candidate]);
        if (existing.rowCount === 0) {
          await client.query(`UPDATE users SET public_id = $1 WHERE id = $2`, [candidate, u.id]);
          assigned = true;
        }
      }
    }

    // 2. Users missing user_referrals row
    const usersMissingReferralRow = await client.query<{ id: string; pending_referral_code: string | null }>(
      `SELECT u.id, u.pending_referral_code 
       FROM users u 
       LEFT JOIN user_referrals r ON u.id = r.user_id 
       WHERE r.user_id IS NULL`
    );

    for (const u of usersMissingReferralRow.rows) {
      let codeAssigned = false;
      let newReferralCode = '';
      while (!codeAssigned) {
        const candidate = generateReferralCode();
        const existing = await client.query(`SELECT 1 FROM user_referrals WHERE referral_code = $1`, [candidate]);
        if (existing.rowCount === 0) {
          newReferralCode = candidate;
          codeAssigned = true;
        }
      }

      await client.query(
        `INSERT INTO user_referrals (user_id, referral_code, sponsor_user_id, created_at)
         VALUES ($1, $2, NULL, CURRENT_TIMESTAMP)`,
        [u.id, newReferralCode]
      );
    }

    // 3. Resolve pending_referral_code for users who do not have a sponsor_user_id yet
    const pendingUsers = await client.query<{ id: string; pending_referral_code: string }>(
      `SELECT u.id, u.pending_referral_code 
       FROM users u 
       JOIN user_referrals r ON u.id = r.user_id 
       WHERE u.pending_referral_code IS NOT NULL 
         AND u.pending_referral_code != '' 
         AND r.sponsor_user_id IS NULL`
    );

    for (const u of pendingUsers.rows) {
      const normCode = normalizeReferralCode(u.pending_referral_code);
      const sponsorResult = await client.query<{ user_id: string }>(
        `SELECT user_id FROM user_referrals WHERE referral_code = $1`,
        [normCode]
      );

      if (sponsorResult.rowCount > 0) {
        const sponsorUserId = sponsorResult.rows[0].user_id;
        if (sponsorUserId !== u.id) {
          await client.query(
            `UPDATE user_referrals SET sponsor_user_id = $1 WHERE user_id = $2`,
            [sponsorUserId, u.id]
          );
          await client.query(
            `UPDATE users SET pending_referral_code = NULL WHERE id = $1`,
            [u.id]
          );
          console.log(`[DB Migration] Resolved pending referral code ${normCode} for user ${u.id}`);
        }
      } else {
        console.log(`[DB Migration] Pending referral code ${normCode} for user ${u.id} could not be resolved (invalid code).`);
      }
    }

    // 4. Ensure all users exist in binary_placements (UNPLACED by default)
    await client.exec(`
      INSERT INTO binary_placements (user_id, parent_user_id, side, status, placed_at, created_at)
      SELECT u.id, NULL, NULL, 'UNPLACED', NULL, u.created_at
      FROM users u
      LEFT JOIN binary_placements bp ON u.id = bp.user_id
      WHERE bp.user_id IS NULL
      ON CONFLICT (user_id) DO NOTHING;
    `);

    // 5. Ensure all users have binary_volume_balances row initialized
    await client.exec(`
      INSERT INTO binary_volume_balances (user_id, carry_left_units, carry_right_units, updated_at)
      SELECT u.id, 0, 0, CURRENT_TIMESTAMP
      FROM users u
      LEFT JOIN binary_volume_balances bvb ON u.id = bvb.user_id
      WHERE bvb.user_id IS NULL
      ON CONFLICT (user_id) DO NOTHING;
    `);
  } catch (err) {
    console.error('[DB Migration] Error during backfill of existing users:', err);
  }
}

/**
 * Seed Genesis Nodes inventory (1 to 10,000) idempotently (Task #6)
 */
async function seedGenesisNodes(client: DatabaseClient) {
  try {
    const countRes = await client.query<{ count: string | number }>(
      `SELECT COUNT(*)::int AS count FROM nodes`
    );
    const currentCount = parseInt(String(countRes.rows[0]?.count || '0'), 10);

    if (currentCount < GENESIS_NODE_CAP) {
      console.log(`[DB Migration] Seeding Genesis Nodes inventory (${currentCount}/${GENESIS_NODE_CAP} existing)...`);

      try {
        // Fast PostgreSQL / PGlite batch insertion with generate_series
        await client.exec(`
          INSERT INTO nodes (id, node_number, public_node_id, status, created_at, updated_at)
          SELECT 
            gen_random_uuid(),
            s.n,
            'PHX-NODE-' || LPAD(s.n::text, 6, '0'),
            'AVAILABLE',
            CURRENT_TIMESTAMP,
            CURRENT_TIMESTAMP
          FROM generate_series(1, ${GENESIS_NODE_CAP}) AS s(n)
          ON CONFLICT (node_number) DO NOTHING;
        `);
      } catch (sqlErr) {
        console.warn('[DB Migration] SQL generate_series fallback to batch chunks:', sqlErr);
        const batchSize = 500;
        for (let start = 1; start <= GENESIS_NODE_CAP; start += batchSize) {
          const end = Math.min(start + batchSize - 1, GENESIS_NODE_CAP);
          const values: any[] = [];
          const placeholders: string[] = [];
          let paramIdx = 1;

          for (let n = start; n <= end; n++) {
            const id = uuidv4();
            const publicId = formatPublicNodeId(n);
            placeholders.push(`($${paramIdx}, $${paramIdx + 1}, $${paramIdx + 2}, 'AVAILABLE', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`);
            values.push(id, n, publicId);
            paramIdx += 3;
          }

          await client.query(
            `INSERT INTO nodes (id, node_number, public_node_id, status, created_at, updated_at)
             VALUES ${placeholders.join(', ')}
             ON CONFLICT (node_number) DO NOTHING`,
            values
          );
        }
      }

      const finalCountRes = await client.query<{ count: string | number }>(
        `SELECT COUNT(*)::int AS count FROM nodes`
      );
      console.log(`[DB Migration] Genesis Nodes inventory active: ${finalCountRes.rows[0]?.count} total nodes.`);
    }
  } catch (err) {
    console.error('[DB Migration] Error during Genesis Nodes seeding:', err);
  }
}

/**
 * Task #19: Seed default system economic configuration parameters.
 * Idempotently inserts default values if missing without overwriting configured historical values.
 */
async function seedEconomicConfigs(client: DatabaseClient) {
  try {
    const defaultConfigs = [
      {
        key: 'NODE_BASE_PRICE_USD',
        value: JSON.stringify(1000.00),
        category: 'NODE',
        description: 'Base purchase price in USD per Genesis Node',
      },
      {
        key: 'NODE_SALES_ENABLED',
        value: JSON.stringify(true),
        category: 'NODE',
        description: 'Master switch for Genesis Node sales and reservations',
      },
      {
        key: 'GENESIS_NODE_CAP',
        value: JSON.stringify(GENESIS_NODE_CAP),
        category: 'NODE',
        description: 'Maximum Genesis Node issuance limit (Immutable)',
      },
      {
        key: 'DIRECT_REFERRAL_COMMISSION_USD',
        value: JSON.stringify(50.00),
        category: 'REFERRAL',
        description: 'Commission earned by sponsor per activated node purchase (future events only)',
      },
      {
        key: 'MATCHING_TIERS_CONFIG',
        value: JSON.stringify([
          { units: 2, rewardUsd: 500 },
          { units: 4, rewardUsd: 1000 },
          { units: 8, rewardUsd: 1500 },
          { units: 12, rewardUsd: 2000 },
          { units: 16, rewardUsd: 2500 },
          { units: 20, rewardUsd: 3000 },
          { units: 24, rewardUsd: 3500 },
          { units: 28, rewardUsd: 4000 },
          { units: 32, rewardUsd: 4500 },
          { units: 36, rewardUsd: 5000 },
        ]),
        category: 'MATCHING',
        description: 'Daily binary volume balance matching bonus reward tiers',
      },
      {
        key: 'PROMOTION_MILESTONES_CONFIG',
        value: JSON.stringify([
          { milestone: '20_20', units: 20, rewardUsd: 500 },
          { milestone: '50_50', units: 50, rewardUsd: 1500 },
          { milestone: '100_100', units: 100, rewardUsd: 3500 },
        ]),
        category: 'PROMOTION',
        description: 'Career promotion volume milestone bonus rewards',
      },
      {
        key: 'NODE_REWARDS_ENABLED',
        value: JSON.stringify(true),
        category: 'REWARDS',
        description: 'Master switch for daily epoch node mining reward distributions',
      },
      {
        key: 'NODE_REWARD_RATE_PER_EPOCH',
        value: JSON.stringify(null), // Must remain null until explicitly configured by admin
        category: 'REWARDS',
        description: 'Authoritative reward payout rate per Active Node per Epoch (USD). Unconfigured by default.',
      },
      {
        key: 'INTERNAL_COIN_PRICE_USDT',
        value: JSON.stringify({
          coinSymbol: 'PHIVO',
          priceUsdt: 0.10,
          effectiveFrom: new Date().toISOString(),
          swapEnabled: true,
        }),
        category: 'COIN_PRICE',
        description: 'PHIVONEX internal coin (PHIVO) conversion valuation rate against USDT',
      },
      {
        key: 'INTERNAL_COIN_SWAP_ENABLED',
        value: JSON.stringify(true),
        category: 'COIN_PRICE',
        description: 'Master toggle enabling or disabling user coin-to-USDT swaps',
      },
      {
        key: 'CRYPTO_DEPOSITS_ENABLED',
        value: JSON.stringify(true),
        category: 'GATEWAY',
        description: 'BNB / USDT cryptocurrency blockchain deposit listener master switch',
      },
      {
        key: 'CRYPTO_WITHDRAWALS_ENABLED',
        value: JSON.stringify(true),
        category: 'GATEWAY',
        description: 'Cryptocurrency blockchain on-chain withdrawal broadcast master switch',
      },
      {
        key: 'BSC_REQUIRED_CONFIRMATIONS',
        value: JSON.stringify(3),
        category: 'GATEWAY',
        description: 'Required block confirmations on BNB Smart Chain before crediting deposit',
      },
      {
        key: 'AUTO_WITHDRAWAL_ENABLED',
        value: JSON.stringify(false),
        category: 'GATEWAY',
        description: 'Automated on-chain broadcast for approved withdrawals without manual admin signing',
      },
      {
        key: 'MIN_WITHDRAWAL_AMOUNT',
        value: JSON.stringify(0.10),
        category: 'GATEWAY',
        description: 'Minimum allowed withdrawal amount in USD / USDT for user requests',
      },
      {
        key: 'BNB_PRICE_USD',
        value: JSON.stringify(450.0),
        category: 'PRICING',
        description: 'Authoritative server-side exchange rate for 1 BNB in USD',
      },
    ];

    for (const cfg of defaultConfigs) {
      const id = uuidv4();
      await client.query(
        `
        INSERT INTO system_economic_configs (
          id, config_key, config_value, category, description, status, version, effective_from, updated_by_admin_public_id, created_at, updated_at
        ) VALUES ($1, $2, $3, $4, $5, 'ACTIVE', 1, CURRENT_TIMESTAMP, 'SYSTEM_INIT', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
        ON CONFLICT (config_key) DO NOTHING;
        `,
        [id, cfg.key, cfg.value, cfg.category, cfg.description]
      );
    }

    // Ensure INTERNAL_COIN_PRICE_USDT always has coinSymbol: 'PHIVO'
    await client.query(`
      UPDATE system_economic_configs
      SET config_value = REPLACE(config_value, '"PHX"', '"PHIVO"')
      WHERE config_key = 'INTERNAL_COIN_PRICE_USDT' AND config_value LIKE '%PHX%';
    `);

    console.log('[DB Migration] System Economic configuration parameters initialized.');
  } catch (err) {
    console.error('[DB Migration] Error during economic configs seeding:', err);
  }
}

