import { burstProgress } from "./burst-motion.js";

function randomSource(seed) {
  return () => {
    seed |= 0;
    seed = seed + 0x6D2B79F5 | 0;
    let value = Math.imul(seed ^ seed >>> 15, 1 | seed);
    value = value + Math.imul(value ^ value >>> 7, 61 | value) ^ value;
    return ((value ^ value >>> 14) >>> 0) / 4294967296;
  };
}

function polygon(shapes, points, fill, stroke, lineWidth = .7) {
  shapes.push({ points, fill, stroke, lineWidth, closed: true, ...shapes.element });
}

function line(shapes, points, stroke, lineWidth = .6) {
  shapes.push({ points, stroke, lineWidth, ...shapes.element });
}

export function createBurstShapes(width, height, colors, seed, origin) {
  const shapes = [];
  const { accent, ink, edge, paper } = colors;
  const random = randomSource(seed);
  const cx = origin.x;
  const cy = origin.y;
  const radius = Math.min(height * .48, width * .3);
  const stretch = Math.min(1.8, width / height);
  const point = (angle, distance, perpendicular = 0) => [
    cx + Math.cos(angle) * distance * stretch - Math.sin(angle) * perpendicular,
    cy + Math.sin(angle) * distance + Math.cos(angle) * perpendicular,
  ];

  // Long, broken structural ribs. Every rib has its own construction and length.
  for (let index = 0; index < 21; index++) {
    const angle = index / 21 * Math.PI * 2 + (random() - .5) * .22;
    const length = radius * (.48 + random() * .54);
    const thickness = 2 + random() * 15;
    const spine = [.13, .34, .57, .74, 1].map((fraction) => point(angle, length * fraction, (random() - .5) * 26));
    shapes.element = { id: index, center: spine[2] };
    const outline = spine.map(([x, y], step) => [x, y - thickness * (1 - step / 5)])
      .concat(spine.slice().reverse());
    polygon(shapes, outline, index % 4 ? accent + "12" : ink + "28", edge + "65", .55);
    line(shapes, spine, ink + "55", .5);
    if (index % 3 === 0) {
      const end = point(angle, length * 1.08);
      line(shapes, [spine.at(-1), end, [end[0] + 15, end[1]]], edge + "70");
      polygon(shapes, [[end[0] + 18, end[1] - 1], [end[0] + 20, end[1] - 1], [end[0] + 20, end[1] + 1], [end[0] + 18, end[1] + 1]], ink + "90");
    }
  }

  // Faceted plates cluster at the source, then break into thin, scattered pieces.
  const fragments = width < 760 ? 130 : 240;
  for (let index = 0; index < fragments; index++) {
    const angle = random() * Math.PI * 2;
    const distance = radius * (.17 + Math.pow(random(), 1.65) * .85);
    const size = (1 - distance / (radius * 1.2)) * (7 + random() * 35);
    const length = size * (1.3 + random() * 2.6);
    const breadth = size * (.16 + random() * .55);
    const a = point(angle, distance - length * .5, -breadth * .2);
    const b = point(angle + .025, distance + length * .5, -breadth * .55);
    const c = point(angle + .04, distance + length * .28, breadth * .65);
    const d = point(angle - .025, distance - length * .3, breadth * .8);
    const mid = [(a[0] + c[0]) * .5 + size * .15, (a[1] + c[1]) * .5 - size * .25];
    shapes.element = { id: 21 + index, center: point(angle, distance) };
    const solid = index % 9 === 0;
    polygon(shapes, [a, b, mid], solid ? accent + "b0" : accent + "20", edge + "65");
    polygon(shapes, [b, c, mid], solid ? ink + "a0" : ink + "16", ink + "70", .45);
    polygon(shapes, [c, d, a, mid], solid ? accent + "70" : paper + "8c", edge + "80", .5);
    if (index % 4 === 0) {
      for (let stripe = 1; stripe < 5; stripe++) {
        const fraction = stripe / 6;
        line(shapes, [
          [a[0] + (b[0] - a[0]) * fraction, a[1] + (b[1] - a[1]) * fraction],
          [d[0] + (c[0] - d[0]) * fraction, d[1] + (c[1] - d[1]) * fraction],
        ], ink + (size > 13 ? "70" : "00"), .45);
      }
    }
  }

  // Fine registration details use the same geometry as the larger plates.
  for (let index = 0; index < 54; index++) {
    const angle = random() * Math.PI * 2;
    const distance = radius * (.46 + random() * .62);
    const [x, y] = point(angle, distance);
    const size = 1.5 + random() * 3;
    shapes.element = { id: 21 + fragments + index, center: [x, y] };
    if (index % 5) {
      polygon(shapes, [[x, y], [x + size * 2, y - size], [x + size, y + size]], accent + "70");
    } else {
      line(shapes, [[x - 4, y], [x + 4, y]], ink + "80");
      line(shapes, [[x, y - 4], [x, y + 4]], ink + "80");
    }
  }
  delete shapes.element;
  return shapes;
}

export const BURST_VERTEX_STRIDE = 12;

function rgba(hex) {
  const value = hex.slice(1).padEnd(8, "f");
  return [0, 2, 4, 6].map((offset) => parseInt(value.slice(offset, offset + 2), 16) / 255);
}

export function createBurstGeometry(width, height, colors, seed, origin) {
  const shapes = createBurstShapes(width, height, colors, seed, origin);
  const count = shapes.reduce((sum, shape) => sum + (shape.fill ? (shape.points.length - 2) * 3 : 0) + (shape.stroke ? (shape.points.length - (shape.closed ? 0 : 1)) * 6 : 0), 0);
  const vertices = new Float32Array(count * BURST_VERTEX_STRIDE);
  const pieces = [];
  const motions = new Map();
  let offset = 0;
  let motion;
  const vertex = (point, color, shape) => {
    vertices[offset] = point[0]; vertices[offset + 1] = point[1];
    vertices[offset + 2] = shape.center[0]; vertices[offset + 3] = shape.center[1];
    for (let channel = 0; channel < 4; channel++) vertices[offset + 4 + channel] = color[channel];
    for (let parameter = 0; parameter < 3; parameter++) vertices[offset + 8 + parameter] = motion[parameter];
    vertices[offset + 11] = shape.id;
    offset += BURST_VERTEX_STRIDE;
  };
  for (const shape of shapes) {
    const piece = pieces[shape.id] ||= { id: shape.id, start: offset, center: shape.center, minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity, radius: 0 };
    for (const [x, y] of shape.points) {
      piece.minX = Math.min(piece.minX, x); piece.minY = Math.min(piece.minY, y);
      piece.maxX = Math.max(piece.maxX, x); piece.maxY = Math.max(piece.maxY, y);
      piece.radius = Math.max(piece.radius, Math.hypot(x - piece.center[0], y - piece.center[1]));
    }
    if (!motions.has(shape.id)) {
      const random = randomSource(seed ^ Math.imul(shape.id + 1, 2654435761));
      motions.set(shape.id, [random() * .18, (random() - .5) * 2.8, (random() - .5) * 120]);
    }
    motion = motions.get(shape.id);
    const { points, fill, stroke, lineWidth, closed } = shape;
    if (fill) {
      const color = rgba(fill);
      for (let index = 1; index < points.length - 1; index++) {
        for (const point of [points[0], points[index], points[index + 1]]) vertex(point, color, shape);
      }
    }
    if (stroke) {
      const color = rgba(stroke);
      for (let index = 0; index < points.length - (closed ? 0 : 1); index++) {
        const a = points[index];
        const b = points[(index + 1) % points.length];
        const length = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
        const dx = -(b[1] - a[1]) / length * lineWidth / 2;
        const dy = (b[0] - a[0]) / length * lineWidth / 2;
        const corners = [[a[0] + dx, a[1] + dy], [b[0] + dx, b[1] + dy], [b[0] - dx, b[1] - dy], [a[0] - dx, a[1] - dy]];
        for (const corner of [0, 1, 2, 0, 2, 3]) vertex(corners[corner], color, shape);
      }
    }
    piece.end = offset;
  }
  return { vertices, shapes, pieces };
}

export function createLocalBurstGeometry(base, target, seed) {
  const random = randomSource(seed);
  const candidates = base.pieces.filter((piece) => {
    if (piece.id < 21 || piece.radius > 65 || Math.max(piece.maxX - piece.minX, piece.maxY - piece.minY) > 96) return false;
    const dx = piece.center[0] - target.x;
    const dy = piece.center[1] - target.y;
    // Move fragments around the label, where the adjustment will be visible.
    return Math.hypot(dx, dy) < 280 && !(Math.abs(dx) < 155 && Math.abs(dy) < 85);
  }).map((piece) => ({ piece, score: Math.hypot(piece.center[0] - target.x, piece.center[1] - target.y) * (.85 + random() * .3) }));
  candidates.sort((a, b) => a.score - b.score);
  const adjustments = new Map();
  const vertices = new Float32Array(base.vertices);
  for (const { piece } of candidates.slice(0, 14)) {
    const dx = piece.center[0] - target.x;
    const dy = piece.center[1] - target.y;
    const distance = Math.hypot(dx, dy) || 1;
    const shift = 4 + random() * 2;
    const tangent = (random() - .5) * 2;
    const angle = (random() - .5) * Math.PI / 36;
    const moveX = dx / distance * shift - dy / distance * tangent;
    const moveY = dy / distance * shift + dx / distance * tangent;
    const cos = Math.cos(angle), sin = Math.sin(angle);
    const transform = ([x, y]) => {
      const localX = x - piece.center[0], localY = y - piece.center[1];
      return [piece.center[0] + moveX + cos * localX - sin * localY, piece.center[1] + moveY + sin * localX + cos * localY];
    };
    adjustments.set(piece.id, { transform, center: [piece.center[0] + moveX, piece.center[1] + moveY] });
    for (let index = piece.start; index < piece.end; index += BURST_VERTEX_STRIDE) {
      const [x, y] = transform([base.vertices[index], base.vertices[index + 1]]);
      vertices[index] = x; vertices[index + 1] = y;
      vertices[index + 2] += moveX; vertices[index + 3] += moveY;
    }
  }
  const shapes = base.shapes.map((shape) => {
    const adjustment = adjustments.get(shape.id);
    return adjustment ? { ...shape, center: adjustment.center, points: shape.points.map(adjustment.transform) } : shape;
  });
  return { vertices, shapes, pieces: base.pieces, movedIds: [...adjustments.keys()] };
}

// Capture only interrupted transitions. Ordinary frames interpolate on the GPU.
export function sampleBurstGeometry(from, to, progress) {
  if (progress >= 1) return to;
  if (progress <= 0) return from;
  const result = new Float32Array(to);
  const progressByPiece = [];
  for (let index = 0; index < to.length; index += BURST_VERTEX_STRIDE) {
    const id = to[index + 11];
    const eased = progressByPiece[id] ??= burstProgress(progress, to[index + 8]);
    for (let channel = 0; channel < 8; channel++) result[index + channel] = from[index + channel] + (to[index + channel] - from[index + channel]) * eased;
  }
  return result;
}

