import React, { useEffect, useRef } from "react";
import { createBurstGeometry, createLocalBurstGeometry, sampleBurstGeometry } from "./burst-geometry.js";
import { createBurstRenderer } from "./burst-renderer.js";
import { BURST_TWEEN_MS } from "./burst-motion.js";

function restingEye(canvas, letter, context) {
  const bounds = canvas.getBoundingClientRect();
  if (!letter || !context) return { origin: { x: bounds.width / 2, y: bounds.height / 2 }, radius: { x: 20, y: 20 } };
  const glyph = letter.getBoundingClientRect();
  const styles = getComputedStyle(letter);
  context.font = `${styles.fontWeight} ${styles.fontSize} ${styles.fontFamily}`;
  const metrics = context.measureText("o");
  const ascent = metrics.fontBoundingBoxAscent ?? parseFloat(styles.fontSize) * .8;
  const descent = metrics.fontBoundingBoxDescent ?? parseFloat(styles.fontSize) * .2;
  const baseline = glyph.top - bounds.top + (glyph.height - ascent - descent) / 2 + ascent;
  return {
    origin: {
      x: glyph.left - bounds.left + (metrics.actualBoundingBoxRight - metrics.actualBoundingBoxLeft) / 2,
      y: baseline + (metrics.actualBoundingBoxDescent - metrics.actualBoundingBoxAscent) / 2,
    },
    radius: {
      x: (metrics.actualBoundingBoxRight + metrics.actualBoundingBoxLeft) * .31,
      y: (metrics.actualBoundingBoxAscent + metrics.actualBoundingBoxDescent) * .31,
    },
  };
}

export default function BurstCanvas({ positions, active, originLetter }) {
  const surface = useRef(null);
  const controller = useRef(null);
  const selection = useRef(null);
  selection.current = active == null ? null : positions[active];

  useEffect(() => {
    const canvas = surface.current;
    const measurement = document.createElement("canvas").getContext("2d");
    let renderer = createBurstRenderer(canvas);
    if (!renderer) return;
    let dimensions, base, from, to, started = 0, frame = 0, resizeFrame = 0, previousSize = "", animationFrames = 0, lastPaint = 0, unavailable = false;
    const cache = new Map();
    const progressAt = (time) => frame ? Math.min(1, Math.max(0, (time - started) / BURST_TWEEN_MS)) : 1;
    const draw = (progress) => {
      renderer.draw(progress, dimensions.eye.origin, dimensions.eye.radius);
      if (import.meta.env.DEV) {
        canvas.dataset.drawCount = Number(canvas.dataset.drawCount || 0) + 1;
        canvas.dataset.progress = progress.toFixed(3);
      }
    };
    const animate = (time) => {
      const progress = progressAt(time);
      // A 120/144 Hz display should not double the work for this brief background effect.
      if (time - lastPaint >= 1000 / 60 - .5 || progress >= 1) {
        draw(progress);
        animationFrames++;
        lastPaint = time;
      }
      if (import.meta.env.DEV && progress >= 1) {
        canvas.dataset.animationFrames = animationFrames;
        canvas.dataset.animationMs = (time - started).toFixed(1);
      }
      frame = progress < 1 ? requestAnimationFrame(animate) : 0;
    };
    const transition = (selected, immediate = false) => {
      if (!dimensions || unavailable) return;
      const now = performance.now();
      const previousProgress = progressAt(now);
      const source = to && { vertices: sampleBurstGeometry(from.vertices, to.vertices, previousProgress) };
      cancelAnimationFrame(frame);
      frame = 0;
      const { width, height, eye } = dimensions;
      const target = selected && { x: selected.x / 100 * width, y: selected.y / 100 * height };
      const key = selected ? `${selected.seed}:${target.x}:${target.y}` : "rest";
      const cached = cache.has(key);
      const paintStarted = performance.now();
      if (!cached) {
        if (cache.size >= 9) cache.delete([...cache.keys()].find((entry) => entry !== "rest"));
        cache.set(key, createLocalBurstGeometry(base, target, selected.seed));
      }
      to = cache.get(key);
      from = source || to;
      renderer.setGeometry(from, to);
      if (import.meta.env.DEV) {
        canvas.dataset.renderer = renderer.animated ? "webgl" : "2d";
        canvas.dataset.geometryBuilds = Number(canvas.dataset.geometryBuilds || 0) + Number(!cached);
        canvas.dataset.drawMs = (performance.now() - paintStarted).toFixed(2);
        canvas.dataset.pathCacheHit = String(cached);
        canvas.dataset.seed = 43107;
        canvas.dataset.origin = `${eye.origin.x.toFixed(1)},${eye.origin.y.toFixed(1)}`;
        canvas.dataset.movedPieces = to.movedIds?.length || 0;
        canvas.dataset.duration = BURST_TWEEN_MS;
      }
      if (immediate || !renderer.animated || window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
        from = to;
        draw(1);
        return;
      }
      // One short settle for a few nearby fragments. The composition and eye stay fixed.
      // The GPU interpolates cached targets; no frames run while idle.
      started = now;
      animationFrames = 0;
      lastPaint = now;
      draw(0);
      frame = requestAnimationFrame(animate);
    };
    const resize = () => {
      cancelAnimationFrame(resizeFrame);
      resizeFrame = requestAnimationFrame(() => {
        const { width, height } = canvas.getBoundingClientRect();
        if (!width || !height || unavailable) return;
        const eye = restingEye(canvas, originLetter.current, measurement);
        const dpr = window.devicePixelRatio || 1;
        const size = `${width}:${height}:${dpr}:${eye.origin.x}:${eye.origin.y}`;
        if (size === previousSize) return;
        previousSize = size;
        cancelAnimationFrame(frame);
        frame = 0;
        from = to = null;
        cache.clear();
        const styles = getComputedStyle(canvas);
        const colors = {
          accent: styles.getPropertyValue("--accent").trim(),
          ink: styles.getPropertyValue("--wedge-ink").trim(),
          edge: styles.getPropertyValue("--wedge-line").trim(),
          paper: styles.getPropertyValue("--wedge").trim(),
        };
        dimensions = { width, height, eye };
        base = createBurstGeometry(width, height, colors, 43107, eye.origin);
        cache.set("rest", base);
        const ratio = Math.min(dpr, 2, Math.sqrt(4_000_000 / (width * height)));
        renderer.resize(width, height, ratio, colors.paper);
        transition(window.matchMedia("(max-width: 960px)").matches ? null : selection.current, true);
      });
    };
    const lost = (event) => { event.preventDefault(); unavailable = true; cancelAnimationFrame(frame); frame = 0; };
    const restored = () => { renderer.dispose(); renderer = createBurstRenderer(canvas); unavailable = false; previousSize = ""; resize(); };
    const observer = new ResizeObserver(resize);
    observer.observe(canvas);
    if (originLetter.current) {
      observer.observe(originLetter.current);
      observer.observe(originLetter.current.parentElement);
    }
    canvas.addEventListener("webglcontextlost", lost);
    canvas.addEventListener("webglcontextrestored", restored);
    window.addEventListener("resize", resize);
    controller.current = (selected) => {
      if (!window.matchMedia("(max-width: 960px)").matches) transition(selected);
    };
    resize();
    return () => {
      controller.current = null;
      observer.disconnect();
      canvas.removeEventListener("webglcontextlost", lost);
      canvas.removeEventListener("webglcontextrestored", restored);
      window.removeEventListener("resize", resize);
      cancelAnimationFrame(frame);
      cancelAnimationFrame(resizeFrame);
      renderer.dispose();
    };
  }, [originLetter]);

  useEffect(() => { controller.current?.(selection.current); }, [active, positions]);

  return <canvas className="burst-art" ref={surface} aria-hidden="true" />;
}
