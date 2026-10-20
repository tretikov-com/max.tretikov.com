export const DEFAULT_BURST_TRANSITION = { mode: 0, duration: 650, turn: 1, bend: 1, stagger: 1, phase: 0, overshoot: 1.2, origin: { x: 0, y: 0 } };

export function createBurstTransition(seed, recentModes, origin) {
  let state = seed || 1;
  const random = () => {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    return (state >>> 0) / 4294967296;
  };
  const available = [0, 1, 2, 3].filter((mode) => !recentModes.includes(mode));
  const mode = available[Math.floor(random() * available.length)];
  return {
    mode, origin,
    duration: 580 + Math.round(random() * 160),
    turn: .85 + random() * 1.2,
    bend: .65 + random() * 1.1,
    stagger: .75 + random() * .9,
    phase: random() * Math.PI * 2,
    overshoot: .8 + random() * .8,
  };
}

// Keep the pose formulas in sync with burst-renderer.js. This runs only to capture
// an interrupted transition; the GPU evaluates the normal animation frames.
export function burstFragmentPose(fromX, fromY, toX, toY, delay, turn, arc, progress, transition = DEFAULT_BURST_TRANSITION) {
  const { mode, origin, phase, overshoot } = transition;
  if (mode === 3) {
    const sweep = ((Math.atan2(toY - origin.y, toX - origin.x) + phase + Math.PI * 2) % (Math.PI * 2)) / (Math.PI * 2);
    delay = delay * .4 + sweep * .25;
  }
  delay = Math.min(.4, delay * transition.stagger);
  const t = Math.max(0, Math.min(1, (progress - delay) / (1 - delay)));
  let eased = 1 - Math.pow(1 - t, 3);
  let wave = Math.sin(Math.PI * t);
  let turnWave = wave;
  let scale = 1;
  if (mode === 1) {
    const back = t - 1;
    eased = 1 + (overshoot + 1) * back ** 3 + overshoot * back ** 2;
    turnWave = Math.sin(Math.PI * 2 * t) * (1 - t);
  } else if (mode === 2) {
    eased = t < .5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2;
    scale = 1 - wave * .65;
    turnWave *= 1.8;
  } else if (mode === 3) {
    eased = 1 - Math.pow(1 - t, 4);
    wave *= 2 * t - 1;
  }
  const angle = turnWave * turn * transition.turn;
  const dx = toX - fromX;
  const dy = toY - fromY;
  const distance = Math.hypot(dx, dy) || 1;
  return {
    eased, colorMix: Math.max(0, Math.min(1, eased)), scale,
    cos: Math.cos(angle), sin: Math.sin(angle),
    x: fromX + dx * eased - dy / distance * wave * arc * transition.bend,
    y: fromY + dy * eased + dx / distance * wave * arc * transition.bend,
  };
}
