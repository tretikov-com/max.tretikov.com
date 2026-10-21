export const BURST_TWEEN_MS = 280;

// A short, monotonic settle. Tiny per-piece delays avoid a mechanical unison move.
export function burstProgress(progress, pieceDelay) {
  const delay = Math.min(.06, pieceDelay * .3);
  const t = Math.max(0, Math.min(1, (progress - delay) / (1 - delay)));
  return t * t * (3 - 2 * t);
}
