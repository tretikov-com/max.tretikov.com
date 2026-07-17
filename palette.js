/* TRK-01 palette — single source of truth for the max.tretikov.com plate.
   Every colour the drawing uses lives here. The SVG (app.jsx) reads the object
   directly; the stylesheet (styles.css) reads the matching CSS custom property,
   which this file publishes from the same values (camelCase -> --kebab-case).
   To re-skin the plate, edit only this file. */
export const PALETTE = {
  // ── field: the large background — now the morphogenesis image over deep void ──
  bg:        "#0b0d14",          // deep navy-black: page backdrop + image fallback
  image:     new URL("./morphogenesis.webp", import.meta.url).href,
  activatedImage: new URL("./morphogenesis_activated.webp", import.meta.url).href,
  ink:       "#f3f4f6",          // primary light marks, on the dark field (name, comb, dashes)
  inkDim:    "#aeb6c2",          // secondary light marks, on the dark field (subtitle)
  line:      "#c7ccd4",          // thin light rules, on the dark field (relief band)
  mark:      "#959db0",          // edge chrome while it sits on the dark field (light slate)

  // ── wedge: the angular region — flipped to white "paper", inked in slate-violet ──
  // Tuned to read on white: dots are the lightest texture, linework mid, ink darkest.
  wedge:     "#f6f6f5",          // near-white wedge fill
  wedgeDot:  "#a99ec1",          // dot grid on the white wedge
  wedgeLine: "#827798",          // blueprint linework (panel + faint cross) on the wedge
  wedgeInk:  "#534763",          // text / marks while they sit on the white wedge (readable)

  // ── accents: carried across both fields ──
  accent:    "#8c63d4",          // violet marker block — sampled from the image's highlight
  accentMid: "#9aa0a8",          // neutral mid ticks
};

window.PALETTE = PALETTE;

/* Publish every #hex token as a CSS variable so styles.css stays in lockstep. */
(function (P) {
  const root = document.documentElement.style;
  for (const k in P) {
    if (typeof P[k] === "string" && P[k][0] === "#") {
      root.setProperty("--" + k.replace(/[A-Z]/g, (m) => "-" + m.toLowerCase()), P[k]);
    }
  }
})(PALETTE);
