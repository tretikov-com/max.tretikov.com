// Convert the rendered glyph's baseline and ink bounds into canvas CSS coordinates.
// Backing-store pixels (DPR) never enter this calculation. Rect ratios also account
// for CSS zoom/scaling without depending on a browser's font line-box conventions.
export function burstEyeFromGlyph({ canvasRect, width, height, baselineRect, metrics }) {
  const scaleX = canvasRect.width / width;
  const scaleY = canvasRect.height / height;
  return {
    origin: {
      x: (baselineRect.left - canvasRect.left) / scaleX + (metrics.actualBoundingBoxRight - metrics.actualBoundingBoxLeft) / 2,
      y: (baselineRect.top - canvasRect.top) / scaleY + (metrics.actualBoundingBoxDescent - metrics.actualBoundingBoxAscent) / 2,
    },
    radius: {
      x: (metrics.actualBoundingBoxRight + metrics.actualBoundingBoxLeft) * .31,
      y: (metrics.actualBoundingBoxAscent + metrics.actualBoundingBoxDescent) * .31,
    },
  };
}

export function watchBurstEnvironment(view, fonts, onChange) {
  let disposed = false;
  let density;
  const densityChanged = () => { watchDensity(); onChange(); };
  const watchDensity = () => {
    density?.removeEventListener("change", densityChanged);
    density = view.matchMedia(`(resolution: ${view.devicePixelRatio || 1}dppx)`);
    density.addEventListener("change", densityChanged);
  };
  watchDensity();
  view.addEventListener("resize", onChange);
  view.visualViewport?.addEventListener("resize", onChange);
  fonts?.addEventListener("loadingdone", onChange);
  fonts?.ready.then(() => { if (!disposed) onChange(); });
  return () => {
    disposed = true;
    density.removeEventListener("change", densityChanged);
    view.removeEventListener("resize", onChange);
    view.visualViewport?.removeEventListener("resize", onChange);
    fonts?.removeEventListener("loadingdone", onChange);
  };
}
