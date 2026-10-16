/**
 * Server-authoritative Genesis Node Mining / Reward Configuration
 *
 * CRITICAL BUSINESS RULE:
 * - NO production default reward amount exists. PHIVONEX management has NOT finalized
 *   the Node reward rate yet.
 * - Reward parameters are strictly server-authoritative and configurable only via explicit
 *   server environment or verified administrative configuration.
 * - Frontend cannot submit, choose, or alter reward amounts or rates.
 * - If the reward rate is not configured, epoch settlement must NOT create rewards and
 *   must return a controlled REWARD_RATE_NOT_CONFIGURED status.
 */

// Reward currency standard
export const REWARD_CURRENCY = 'PHIVO';

// Minimum allowable reward per node (when configured)
export const MIN_REWARD_PER_NODE = 0.01;

// Maximum allowable reward per node (guardrail against runaway configurations)
export const MAX_REWARD_PER_NODE = 1000.00;

/**
 * Returns the explicitly configured reward rate per node from server environment or admin parameters.
 * Returns null if not configured. Never assumes or invents any default amount.
 */
export function getConfiguredRewardPerNode(override?: number): number | null {
  // 1. If explicit administrative override is passed by authoritative server caller:
  if (typeof override === 'number' && !isNaN(override) && override > 0) {
    if (override < MIN_REWARD_PER_NODE || override > MAX_REWARD_PER_NODE) {
      throw new Error(
        `Configured reward rate ${override} PHIVO is outside allowed bounds [${MIN_REWARD_PER_NODE}, ${MAX_REWARD_PER_NODE}]`
      );
    }
    return override;
  }

  // 2. Check server environment variable (authoritative server configuration)
  const envVal = process.env.NODE_REWARD_PER_EPOCH;
  if (envVal !== undefined && envVal.trim() !== '') {
    const parsed = parseFloat(envVal);
    if (!isNaN(parsed) && parsed > 0) {
      if (parsed < MIN_REWARD_PER_NODE || parsed > MAX_REWARD_PER_NODE) {
        throw new Error(
          `Configured reward rate ${parsed} PHIVO is outside allowed bounds [${MIN_REWARD_PER_NODE}, ${MAX_REWARD_PER_NODE}]`
        );
      }
      return parsed;
    }
  }

  // 3. No default reward amount exists in production
  return null;
}
