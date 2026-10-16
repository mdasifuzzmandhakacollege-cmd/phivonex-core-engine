/**
 * Browser-based Web Audio alert system for subtle, high-priority notifications.
 * Uses native Web Audio API oscillators to generate a pleasant, non-intrusive harmonic chime
 * without requiring external audio asset downloads.
 */

const AUDIO_STORAGE_KEY = 'phivonex_audio_alerts_enabled';

let sharedAudioContext: AudioContext | null = null;

function getAudioContext(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
  if (!AudioCtx) return null;

  if (!sharedAudioContext || sharedAudioContext.state === 'closed') {
    sharedAudioContext = new AudioCtx();
  }
  return sharedAudioContext;
}

/**
 * Get whether audio alerts are enabled by the user.
 * Defaults to false (optional / opt-in) to respect user autonomy.
 */
export function getAudioAlertsEnabled(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    const val = localStorage.getItem(AUDIO_STORAGE_KEY);
    return val === 'true';
  } catch {
    return false;
  }
}

/**
 * Persist user preference for audio alerts.
 */
export function setAudioAlertsEnabled(enabled: boolean): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(AUDIO_STORAGE_KEY, enabled ? 'true' : 'false');
  } catch {
    // Ignore storage quota/security errors
  }
}

/**
 * High-priority system event classifications that qualify for audio awareness.
 */
export const HIGH_PRIORITY_NOTIFICATION_TYPES = new Set([
  'SECURITY_ALERT',
  'NODE_ACTIVATED',
  'USDT_DEPOSIT_CONFIRMED',
  'WITHDRAWAL_STATUS',
  'PROMOTION_EARNED',
  'MATCHING_EARNED',
]);

export function isHighPriorityNotification(type: string): boolean {
  return HIGH_PRIORITY_NOTIFICATION_TYPES.has(type);
}

/**
 * Plays a gentle, harmonic chime (D5 -> A5 chord with soft exponential decay).
 * Subtle, non-abrasive protocol audio feedback.
 */
export function playSubtleChime(force = false): void {
  if (typeof window === 'undefined') return;
  if (!force && !getAudioAlertsEnabled()) return;

  try {
    const ctx = getAudioContext();
    if (!ctx) return;

    if (ctx.state === 'suspended') {
      ctx.resume().catch(() => {});
    }

    const now = ctx.currentTime;
    const duration = 0.35;

    // Master volume gain node to keep the chime soft and gentle
    const masterGain = ctx.createGain();
    masterGain.gain.setValueAtTime(0.001, now);
    masterGain.gain.linearRampToValueAtTime(0.06, now + 0.02);
    masterGain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
    masterGain.connect(ctx.destination);

    // Primary fundamental tone: 587.33 Hz (D5)
    const osc1 = ctx.createOscillator();
    osc1.type = 'sine';
    osc1.frequency.setValueAtTime(587.33, now);
    osc1.frequency.exponentialRampToValueAtTime(880.0, now + 0.15); // gentle glide to A5
    osc1.connect(masterGain);

    // Harmonic overtone: 1174.66 Hz (D6) with lower volume for warmth
    const osc2 = ctx.createOscillator();
    osc2.type = 'sine';
    osc2.frequency.setValueAtTime(1174.66, now);

    const osc2Gain = ctx.createGain();
    osc2Gain.gain.setValueAtTime(0.35, now);
    osc2.connect(osc2Gain);
    osc2Gain.connect(masterGain);

    // Trigger start & stop
    osc1.start(now);
    osc2.start(now + 0.02);
    osc1.stop(now + duration);
    osc2.stop(now + duration);
  } catch (err) {
    console.debug('[AudioAlert] Web Audio playback prevented or unavailable:', err);
  }
}
