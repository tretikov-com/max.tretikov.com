import React, { useEffect, useRef, useState } from "react";

function randomSource(seed) {
  return () => {
    seed |= 0;
    seed = seed + 0x6D2B79F5 | 0;
    let value = Math.imul(seed ^ seed >>> 15, 1 | seed);
    value = value + Math.imul(value ^ value >>> 7, 61 | value) ^ value;
    return ((value ^ value >>> 14) >>> 0) / 4294967296;
  };
}

function polygon(context, points, fill, stroke, lineWidth = .7) {
  context.beginPath();
  points.forEach(([x, y], index) => index ? context.lineTo(x, y) : context.moveTo(x, y));
  context.closePath();
  if (fill) { context.fillStyle = fill; context.fill(); }
  if (stroke) { context.strokeStyle = stroke; context.lineWidth = lineWidth; context.stroke(); }
}

function line(context, points, color, width = .6) {
  context.beginPath();
  points.forEach(([x, y], index) => index ? context.lineTo(x, y) : context.moveTo(x, y));
  context.strokeStyle = color;
  context.lineWidth = width;
  context.stroke();
}

function paintBurst(context, width, height, colors, seed, origin) {
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
    const outline = spine.map(([x, y], step) => [x, y - thickness * (1 - step / 5)])
      .concat(spine.slice().reverse());
    polygon(context, outline, index % 4 ? accent + "12" : ink + "28", edge + "65", .55);
    line(context, spine, ink + "55", .5);
    if (index % 3 === 0) {
      const end = point(angle, length * 1.08);
      line(context, [spine.at(-1), end, [end[0] + 15, end[1]]], edge + "70");
      polygon(context, [[end[0] + 18, end[1] - 1], [end[0] + 20, end[1] - 1], [end[0] + 20, end[1] + 1], [end[0] + 18, end[1] + 1]], ink + "90");
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
    const solid = index % 9 === 0;
    polygon(context, [a, b, mid], solid ? accent + "b0" : accent + "20", edge + "65");
    polygon(context, [b, c, mid], solid ? ink + "a0" : ink + "16", ink + "70", .45);
    polygon(context, [c, d, a, mid], solid ? accent + "70" : paper + "8c", edge + "80", .5);
    if (index % 4 === 0 && size > 13) {
      for (let stripe = 1; stripe < 5; stripe++) {
        const fraction = stripe / 6;
        line(context, [
          [a[0] + (b[0] - a[0]) * fraction, a[1] + (b[1] - a[1]) * fraction],
          [d[0] + (c[0] - d[0]) * fraction, d[1] + (c[1] - d[1]) * fraction],
        ], ink + "70", .45);
      }
    }
  }

  // Fine registration details use the same geometry as the larger plates.
  for (let index = 0; index < 54; index++) {
    const angle = random() * Math.PI * 2;
    const distance = radius * (.46 + random() * .62);
    const [x, y] = point(angle, distance);
    const size = 1.5 + random() * 3;
    if (index % 5) {
      polygon(context, [[x, y], [x + size * 2, y - size], [x + size, y + size]], accent + "70");
    } else {
      line(context, [[x - 4, y], [x + 4, y]], ink + "80");
      line(context, [[x, y - 4], [x, y + 4]], ink + "80");
    }
  }
}

function paintFrame(canvas, dimensions, selection) {
  const context = canvas.getContext("2d", { alpha: false });
  if (!context) return;
  const { width, height, colors } = dimensions;
  const seed = selection ? Math.imul(selection.seed ^ 0xA3C59AC3, 2654435761) >>> 0 : 43107;
  const origin = selection ? { x: selection.x / 100 * width, y: selection.y / 100 * height } : { x: width / 2, y: height / 2 };
  const started = performance.now();
  context.setTransform(canvas.width / width, 0, 0, canvas.height / height, 0, 0);
  context.fillStyle = colors.paper;
  context.fillRect(0, 0, width, height);
  paintBurst(context, width, height, colors, seed, origin);
  if (import.meta.env.DEV) {
    canvas.dataset.drawMs = (performance.now() - started).toFixed(2);
    canvas.dataset.drawCount = Number(canvas.dataset.drawCount || 0) + 1;
    canvas.dataset.seed = seed;
    canvas.dataset.origin = `${origin.x.toFixed(1)},${origin.y.toFixed(1)}`;
  }
}

export default function BurstCanvas({ positions, active }) {
  const surfaces = useRef([]);
  const dimensions = useRef(null);
  const currentSurface = useRef(0);
  const selection = useRef(null);
  const [visible, setVisible] = useState(0);
  selection.current = active == null ? null : positions[active];

  useEffect(() => {
    const canvas = surfaces.current[0];
    let frame = 0;
    let previousSize = "";
    const resize = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const { width, height } = canvas.getBoundingClientRect();
        if (!width || !height) return;
        const size = `${width}:${height}`;
        if (size === previousSize) return;
        previousSize = size;
        const ratio = Math.min(window.devicePixelRatio || 1, 1.5, Math.sqrt(1_400_000 / (width * height)));
        for (const surface of surfaces.current) {
          surface.width = Math.round(width * ratio);
          surface.height = Math.round(height * ratio);
        }
        const styles = getComputedStyle(canvas);
        dimensions.current = {
          width, height,
          colors: {
            accent: styles.getPropertyValue("--accent").trim(),
            ink: styles.getPropertyValue("--wedge-ink").trim(),
            edge: styles.getPropertyValue("--wedge-line").trim(),
            paper: styles.getPropertyValue("--wedge").trim(),
          },
        };
        const selected = window.matchMedia("(max-width: 960px)").matches ? null : selection.current;
        paintFrame(surfaces.current[currentSurface.current], dimensions.current, selected);
      });
    };
    const observer = new ResizeObserver(resize);
    observer.observe(canvas);
    resize();
    return () => { observer.disconnect(); cancelAnimationFrame(frame); };
  }, []);

  useEffect(() => {
    if (!dimensions.current || window.matchMedia("(max-width: 960px)").matches) return;
    const next = 1 - currentSurface.current;
    paintFrame(surfaces.current[next], dimensions.current, selection.current);
    currentSurface.current = next;
    setVisible(next);
  }, [active, positions]);

  return <>
    {[0, 1].map((index) => <canvas
      className={`burst-art${visible === index ? " is-visible" : ""}`}
      key={index}
      ref={(canvas) => { surfaces.current[index] = canvas; }}
      aria-hidden="true"
    />)}
  </>;
}
