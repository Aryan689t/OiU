/**
 * Self-contained 1-second translucent cyber-yellow screen flash overlay.
 *
 * IMPORTANT: `triggerYellowScreenFlash` is passed directly to
 * `chrome.scripting.executeScript({ func: triggerYellowScreenFlash })`,
 * so it MUST remain 100% self-contained with zero external references or imports.
 */
export function triggerYellowScreenFlash(): void {
  try {
    const OVERLAY_ID = "oiu-yellow-flash-overlay";
    const TIMERS_KEY = "__oiuYellowFlashTimers";

    const win = window as unknown as Record<string, { fade?: number; remove?: number } | undefined>;
    const prevTimers = win[TIMERS_KEY];
    if (prevTimers) {
      if (prevTimers.fade) window.clearTimeout(prevTimers.fade);
      if (prevTimers.remove) window.clearTimeout(prevTimers.remove);
      win[TIMERS_KEY] = undefined;
    }

    const existing = document.getElementById(OVERLAY_ID);
    if (existing) existing.remove();

    const overlay = document.createElement("div");
    overlay.id = OVERLAY_ID;
    overlay.style.cssText = [
      "position: fixed",
      "inset: 0",
      "z-index: 2147483647",
      "pointer-events: none",
      "background: radial-gradient(circle at center, rgba(255, 230, 0, 0.28) 0%, rgba(255, 230, 0, 0.46) 100%)",
      "box-shadow: inset 0 0 90px rgba(255, 230, 0, 0.85), inset 0 0 18px 4px rgba(255, 230, 0, 0.95)",
      "opacity: 0",
      "transition: opacity 120ms ease-out",
    ].join("; ");

    (document.body || document.documentElement).appendChild(overlay);

    // Force layout before animating in, then fade out over ~1 second total
    void overlay.offsetWidth;
    overlay.style.opacity = "1";

    const fadeTimer = window.setTimeout(() => {
      overlay.style.transition = "opacity 780ms ease-out";
      overlay.style.opacity = "0";
    }, 220);

    const removeTimer = window.setTimeout(() => {
      const el = document.getElementById(OVERLAY_ID);
      if (el) el.remove();
      win[TIMERS_KEY] = undefined;
    }, 1050);

    win[TIMERS_KEY] = { fade: fadeTimer, remove: removeTimer };
  } catch (err) {
    console.warn("[OiU] Translucent flash overlay error:", err);
  }
}

/**
 * Cleans up any active flash overlay and pending timers inside the current page.
 */
export function clearYellowScreenFlash(): void {
  try {
    const win = window as unknown as Record<string, { fade?: number; remove?: number } | undefined>;
    const prevTimers = win.__oiuYellowFlashTimers;
    if (prevTimers) {
      if (prevTimers.fade) window.clearTimeout(prevTimers.fade);
      if (prevTimers.remove) window.clearTimeout(prevTimers.remove);
      win.__oiuYellowFlashTimers = undefined;
    }
    const existing = document.getElementById("oiu-yellow-flash-overlay");
    if (existing) existing.remove();
  } catch {
    // ignore cleanup failures
  }
}

