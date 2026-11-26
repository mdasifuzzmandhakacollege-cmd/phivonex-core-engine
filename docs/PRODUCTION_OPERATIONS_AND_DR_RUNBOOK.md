# PHIVONEX PRODUCTION OPERATIONS & DISASTER RECOVERY RUNBOOK

## 1. Cloud SQL Automated Backups & Point-in-Time Recovery (PITR)
- **Automated Daily Backups:** Configured daily between 02:00–04:00 UTC with a 30-day retention window.
- **Binary Logging & PITR:** Enabled on Google Cloud SQL PostgreSQL instances to allow minute-by-minute restoration in the event of ledger anomaly or data corruption.
- **Restoration Procedure:**
  1. Access Google Cloud Console -> SQL -> Select instance `phivonex-production-db`.
  2. Click **Restore**, select the target point in time (UTC timestamp), and provision a restored test instance.
  3. Verify zero-sum double-entry ledger reconciliation audit (`GET /api/admin/ledger/reconcile`) on the restored instance before promoting to primary traffic.

## 2. Google Cloud KMS Hot-Wallet Signing & Least-Privilege IAM
- **Key Ring & CryptoKey:** GCP KMS asymmetric key ring `phivonex-bep20-ring`, crypto key `usdt-bep20-signer`, algorithm `EC_SIGN_SECP256K1_SHA256`.
- **IAM Principle of Least Privilege:**
  - Grant `roles/cloudkms.signerVerifier` exclusively to the Google Cloud Service Account bound to the backend Node.js compute runtime (e.g., Cloud Run service account `phivonex-backend@project.iam.gserviceaccount.com`).
  - No private key plaintext exists in source code, environment files, or memory dumps. All EVM transactions are signed via KMS RPC.
- **Offline Testing Fallback:** Set `KMS_EMULATOR_MODE=true` in preview/development environments to use a deterministic offline secp256k1 signer.

## 3. Liquidity Circuit Breaker & Incident Response SOP
- **Automatic Tripping:** If the liquid reserve ratio drops below `1.25x` or hourly outflow exceeds `50,000 USDT`, the circuit breaker automatically switches `withdrawal_mode` to `MANUAL_REVIEW` and writes a `CRITICAL` log to `security_audit_logs`.
- **Incident Response Checklist:**
  1. Inspect `system_circuit_breaker_configs` and recent `security_audit_logs` entries for trip reason.
  2. Verify hot-wallet liquidity and reserve balances.
  3. Once resolved, authorized Admin invokes the circuit breaker reset endpoint (`POST /api/admin/circuit-breaker/reset` or Admin Console) with a verified audit reason to restore `AUTO` mode.
