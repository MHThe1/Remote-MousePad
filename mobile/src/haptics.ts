/**
 * haptics.ts — Cross-platform feedback for MouseRemote
 *
 * Android Chrome/Firefox: Vibration API (navigator.vibrate)
 * iOS Safari: Web Audio API click sound (iOS blocks vibration entirely)
 * Desktop: No-op (silent)
 *
 * iOS note: Apple has never implemented the Vibration API and has stated
 * they won't. The only web-accessible alternative is audio feedback.
 */

/* ── Capability detection ─────────────────────────────────────── */
export const canVibrate =
  typeof navigator !== "undefined" &&
  typeof navigator.vibrate === "function";

// iOS = no vibration API but has AudioContext
export const isIOS =
  typeof navigator !== "undefined" &&
  /iPad|iPhone|iPod/.test(navigator.userAgent) &&
  !(window as any).MSStream;

/* ── User preference (persisted) ─────────────────────────────── */
const PREF_KEY = "mr_haptic_audio";

function getAudioPref(): boolean {
  try { return localStorage.getItem(PREF_KEY) !== "off"; } catch { return true; }
}
function setAudioPref(v: boolean): void {
  try { localStorage.setItem(PREF_KEY, v ? "on" : "off"); } catch {}
}

let audioEnabled = getAudioPref();
export function setHapticAudio(v: boolean): void {
  audioEnabled = v;
  setAudioPref(v);
}
export function getHapticAudio(): boolean { return audioEnabled; }

/* ── Web Audio click engine ───────────────────────────────────── */
let _ctx: AudioContext | null = null;

function getCtx(): AudioContext | null {
  if (!audioEnabled) return null;
  if (typeof AudioContext === "undefined" &&
      typeof (window as any).webkitAudioContext === "undefined") return null;
  if (!_ctx) {
    try {
      _ctx = new (AudioContext || (window as any).webkitAudioContext)();
    } catch { return null; }
  }
  // Resume if suspended (required after user gesture on iOS)
  if (_ctx.state === "suspended") {
    _ctx.resume().catch(() => {});
  }
  return _ctx;
}

/**
 * Play a short synthesized click.
 * @param freq   Oscillator frequency in Hz — higher = brighter click
 * @param vol    Peak gain 0–1
 * @param dur    Duration in seconds
 */
function audioClick(freq = 800, vol = 0.12, dur = 0.018): void {
  const ctx = getCtx();
  if (!ctx) return;
  try {
    const osc  = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.type = "sine";
    osc.frequency.setValueAtTime(freq, ctx.currentTime);
    gain.gain.setValueAtTime(vol, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + dur);
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + dur);
  } catch { /* ignore */ }
}

/* ── Core dispatcher ─────────────────────────────────────────── */
function vibrate(pattern: number | number[]): void {
  if (canVibrate) {
    try { navigator.vibrate(pattern); } catch { /* ignore */ }
  }
}

/**
 * Unified feedback: vibrate on Android, audio click on iOS.
 * @param vibePattern   Pattern/duration for Android vibration (ms)
 * @param freq          Audio click frequency for iOS (Hz)
 * @param vol           Audio click volume for iOS (0–1)
 */
function feedback(vibePattern: number | number[], freq = 800, vol = 0.12): void {
  if (canVibrate) {
    vibrate(vibePattern);
  } else {
    // iOS or desktop — use audio click
    audioClick(freq, vol);
  }
}

/* ── Named haptic patterns ───────────────────────────────────── */

/** Single crisp tap — left click, key press, generic confirm */
export const hapticTap        = () => feedback(50, 900, 0.1);

/** Medium thump — connect, confirm, modifier key */
export const hapticMedium     = () => feedback(80, 700, 0.14);

/** Double-pulse — double click */
export const hapticDouble     = () => {
  feedback([55, 60, 55], 850, 0.1);
  if (!canVibrate) setTimeout(() => audioClick(850, 0.1), 80);
};

/** Right-click — distinct from left click */
export const hapticRightClick = () => feedback([40, 50, 70], 600, 0.13);

/** Scroll tick — brief but perceptible */
export const hapticScroll     = () => feedback(30, 1000, 0.06);

/** Mode change — quick noticeable bump */
export const hapticModeChange = () => feedback(60, 750, 0.12);

/** Success — long-short ("done!") */
export const hapticSuccess    = () => feedback([80, 60, 40], 500, 0.15);

/** Warning — escalating pattern */
export const hapticWarning    = () => feedback([50, 50, 50, 50, 80], 400, 0.16);

/** Error / disconnect */
export const hapticError      = () => feedback([80, 60, 80], 300, 0.18);

/** Media play/pause */
export const hapticMedia      = () => feedback(65, 650, 0.12);

/** Media skip */
export const hapticSkip       = () => feedback([45, 50, 45], 750, 0.1);

/** Volume — light */
export const hapticVolume     = () => feedback(35, 1100, 0.07);

/** Lock / Sleep */
export const hapticPower      = () => feedback(100, 450, 0.18);

/** Shutdown / Restart confirmed */
export const hapticDanger     = () => feedback([80, 50, 80, 50, 120], 350, 0.2);

/** App switched */
export const hapticAppSwitch  = () => feedback(55, 800, 0.11);

/** Clipboard sent/received */
export const hapticClipboard  = () => feedback([45, 55, 45], 700, 0.11);

/** Tab change — lightest */
export const hapticTabChange  = () => feedback(35, 950, 0.08);

/**
 * Call on first user gesture to prime AudioContext (required on iOS).
 * Returns true if any feedback method is available.
 */
export function hapticTest(): boolean {
  const ctx = getCtx(); // prime the AudioContext
  if (canVibrate) {
    vibrate(80);
    console.log("[Haptics] Vibration API active ✓");
    return true;
  } else if (ctx) {
    audioClick(800, 0.15, 0.025);
    console.log("[Haptics] Audio click active ✓ (iOS mode)");
    return true;
  }
  console.warn("[Haptics] No feedback available.");
  return false;
}

export const hapticSupported = canVibrate || (
  typeof AudioContext !== "undefined" ||
  typeof (window as any).webkitAudioContext !== "undefined"
);
