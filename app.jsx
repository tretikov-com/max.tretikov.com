/* TRK-01 — adaptive engineering-drawing plate.
   The scene is rebuilt parametrically from the live viewport size, so it fills
   any aspect ratio without letterbox bars and without distorting the art:
     • the signature diagonal wedge is mapped from a normalized facet
       template onto the real viewport (left wedge in landscape, top band in
       portrait);
     • the title block, the blueprint field, and the registration marks in every
       corner re-anchor to the actual edges;
     • the relief band still animates imperatively in a React effect (the same
       per-frame approach the fixed version used) so resizes stay cheap.
   Landscape and portrait get distinct compositions. */
const { useEffect, useMemo, useRef, useState } = React;

const PAL = window.PALETTE;        // central palette — see palette.js

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const fx2 = (n) => n.toFixed(1);

/* Normalized facets of the signature diagonal seam, thin waist → thick end.
   fx = fraction of the wedge's width, fy = fraction along its long axis.
   Derived from the original hand-authored TRK-01 wedge (widest facet = 1.0). */
const FACETS = [
  [0.62, 0.00], [0.31, 0.18], [0.31, 0.38],
  [0.54, 0.55], [0.54, 0.70], [0.76, 0.85], [1.00, 1.00],
];

const NAV_ITEMS = [
  { label: "PROJECTS", href: "#projects" },
  { label: "BLOG", href: "#blog" },
  { label: "PAPERS", href: "#papers" },
  { label: "PROFILES", href: "#profiles" },
];

// intersection of line a→b with line c→d (used to miter offset segments)
function lineInt(a, b, c, d) {
  const x1 = a[0], y1 = a[1], x2 = b[0], y2 = b[1];
  const x3 = c[0], y3 = c[1], x4 = d[0], y4 = d[1];
  const den = (x1 - x2) * (y3 - y4) - (y1 - y2) * (x3 - x4);
  if (Math.abs(den) < 1e-6) return b.slice();
  const t = ((x1 - x3) * (y3 - y4) - (y1 - y3) * (x3 - x4)) / den;
  return [x1 + t * (x2 - x1), y1 + t * (y2 - y1)];
}

function toPath(pts) {
  let s = "M";
  for (let i = 0; i < pts.length; i++) s += (i ? " L" : "") + fx2(pts[i][0]) + "," + fx2(pts[i][1]);
  return s;
}

/* Offset a seam polyline perpendicular by `dist`, then extend its first/last
   point out to the plate edges so the relief band always spans the full seam.
   `edge` names the axis the seam terminates on: 'y' for landscape (top/bottom),
   'x' for portrait (left/right). Sign of `dist` chooses which side to grow into. */
function offsetSeam(P, dist, edge) {
  const segs = [];
  for (let i = 0; i < P.length - 1; i++) {
    const dx = P[i + 1][0] - P[i][0], dy = P[i + 1][1] - P[i][1];
    const L = Math.hypot(dx, dy) || 1, nx = (dy / L) * dist, ny = (-dx / L) * dist;
    segs.push([[P[i][0] + nx, P[i][1] + ny], [P[i + 1][0] + nx, P[i + 1][1] + ny]]);
  }
  const out = [segs[0][0].slice()];
  for (let j = 1; j < segs.length; j++) out.push(lineInt(segs[j - 1][0], segs[j - 1][1], segs[j][0], segs[j][1]));
  out.push(segs[segs.length - 1][1].slice());
  const s0 = segs[0], sl = segs[segs.length - 1];
  if (edge.axis === "y") {
    out[0] = [s0[0][0] + (s0[1][0] - s0[0][0]) * ((edge.v0 - s0[0][1]) / ((s0[1][1] - s0[0][1]) || 1)), edge.v0];
    out[out.length - 1] = [sl[0][0] + (sl[1][0] - sl[0][0]) * ((edge.v1 - sl[0][1]) / ((sl[1][1] - sl[0][1]) || 1)), edge.v1];
  } else {
    out[0] = [edge.v0, s0[0][1] + (s0[1][1] - s0[0][1]) * ((edge.v0 - s0[0][0]) / ((s0[1][0] - s0[0][0]) || 1))];
    out[out.length - 1] = [edge.v1, sl[0][1] + (sl[1][1] - sl[0][1]) * ((edge.v1 - sl[0][0]) / ((sl[1][0] - sl[0][0]) || 1))];
  }
  return out;
}

function seamXAtY(P, y) {
  for (let i = 0; i < P.length - 1; i++) {
    const [x1, y1] = P[i], [x2, y2] = P[i + 1];
    if ((y >= y1 && y <= y2) || (y >= y2 && y <= y1)) {
      const t = (y - y1) / ((y2 - y1) || 1);
      return x1 + t * (x2 - x1);
    }
  }
  return P[P.length - 1][0];
}

// Greedily wrap navigation items to fit the open field.
function packNav(items, avail, charW, separatorSpan) {
  const lines = [[]];
  let width = 0;
  for (const item of items) {
    const itemWidth = item.label.length * charW;
    const nextWidth = width ? width + separatorSpan + itemWidth : itemWidth;
    if (width && nextWidth > avail) {
      lines.push([item]);
      width = itemWidth;
    } else {
      lines[lines.length - 1].push(item);
      width = nextWidth;
    }
  }
  return lines;
}

function useViewport() {
  const [vp, setVp] = useState(() => ({ w: window.innerWidth, h: window.innerHeight }));
  useEffect(() => {
    let raf = 0;
    const onResize = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => setVp({ w: window.innerWidth, h: window.innerHeight }));
    };
    window.addEventListener("resize", onResize);
    window.addEventListener("orientationchange", onResize);
    return () => {
      window.removeEventListener("resize", onResize);
      window.removeEventListener("orientationchange", onResize);
      cancelAnimationFrame(raf);
    };
  }, []);
  return vp;
}

// ───── parametric layout ───────────────────────────────────────
function buildScene(W, H) {
  const portrait = H > W;
  const mn = Math.min(W, H);
  const pad = clamp(mn * 0.03, 14, 44);
  const m = clamp(mn * 0.045, 22, 64);          // corner margin
  const tSize = clamp(mn * 0.026, 16, 30);       // title size
  const sSize = clamp(tSize * 0.62, 10, 16);     // subtitle size
  const tLS = tSize * 0.32, sLS = sSize * 0.085;

  let seam, wedge, edge, nsign, titleX, titleBaseY, faint, depth;

  if (!portrait) {
    const wedgeW = clamp(W * 0.26, 230, 520);
    seam = FACETS.map(([a, b]) => [a * wedgeW, b * H]);
    wedge = "M0,0 L" + seam.map((p) => fx2(p[0]) + "," + fx2(p[1])).join(" L") + " L0," + fx2(H) + " Z";
    edge = { axis: "y", v0: 0, v1: H };
    nsign = 1;                                    // relief grows right, into the field
    titleBaseY = clamp(H * 0.30, 150, 360);
    titleX = seamXAtY(seam, titleBaseY) + clamp(W * 0.058, 48, 116); // clear the white wedge with margin
    faint = [wedgeW * 0.22, H * 0.10];
    depth = wedgeW;
  } else {
    const bandH = clamp(H * 0.24, 200, 460);
    seam = FACETS.map(([a, b]) => [b * W, a * bandH]);
    const rev = seam.slice().reverse();
    wedge = "M0,0 L" + fx2(W) + ",0 L" + rev.map((p) => fx2(p[0]) + "," + fx2(p[1])).join(" L") + " Z";
    edge = { axis: "x", v0: 0, v1: W };
    nsign = -1;                                   // relief grows down, into the field
    titleBaseY = bandH + clamp(H * 0.06, 34, 90);
    titleX = m + pad + clamp(W * 0.025, 10, 28);
    faint = [W * 0.10, bandH * 0.28];
    depth = bandH;
  }

  const avail = Math.max(W - titleX - m, 120);
  const navCharW = sSize * 0.60 + sLS;
  const navSeparatorMargin = sSize * 0.65;
  const navSeparatorSpan = navSeparatorMargin * 2 + sSize * 0.60;
  const navLines = packNav(NAV_ITEMS, avail, navCharW, navSeparatorSpan);

  const bioChrome = portrait
    ? [m + pad, H * 0.18]
    : [m + pad, H - m - sSize * 0.7];

  return {
    W, H, portrait, m, pad, tSize, sSize, tLS, sLS,
    seam, wedge, edge, nsign, titleX, depth,
    markerY: titleBaseY - tSize * 2.0,
    nameY: titleBaseY,
    subY: titleBaseY + tSize * 1.35,
    navLines, navCharW, navSeparatorSpan, navSeparatorMargin, faint, bioChrome,
  };
}

// small reusable registration cross
function Cross({ x, y, s, c, w }) {
  return <path d={`M${fx2(x - s / 2)},${fx2(y)} h${fx2(s)} M${fx2(x)},${fx2(y - s / 2)} v${fx2(s)}`} stroke={c} strokeWidth={w || 2} />;
}

function Frame() {
  const { w: W, h: H } = useViewport();
  const scene = useMemo(() => buildScene(W, H), [W, H]);
  const svgRef = useRef(null);
  const [navActive, setNavActive] = useState(false);

  // relief band — imperative per-frame so resizes never thrash React
  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return undefined;
    const paths = Array.prototype.slice.call(svg.querySelectorAll("#relief path"));
    const N = paths.length, PERIOD = 4.2;
    const D_MAX = clamp(Math.min(W, H) * 0.07, 40, 92);
    const { seam, edge, nsign } = scene;
    const reduce = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    if (reduce) {
      paths.forEach((p, i) => {
        const d = ((i + 0.5) / N) * D_MAX * 0.6;
        p.setAttribute("d", toPath(offsetSeam(seam, nsign * d, edge)));
        p.setAttribute("opacity", "0.8");
      });
      return undefined;
    }

    let raf = 0;
    const tick = (now) => {
      const t = now / 1000;
      for (let i = 0; i < N; i++) {
        const frac = ((t / PERIOD) + i / N) % 1;
        const d = D_MAX * frac;                   // born at the seam, travels into the field
        paths[i].setAttribute("d", toPath(offsetSeam(seam, nsign * d, edge)));
        paths[i].setAttribute("opacity", (Math.pow(1 - frac, 1.2) * 0.9).toFixed(3));
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [scene, W, H]);

  const s = scene;
  const tickStep = clamp(s.tSize * 0.65, 11, 16);
  const combX = (i) => fx2(i * tickStep);

  // Edge chrome straddles the wedge↔field boundary, so ink it for whatever it lands on.
  // Landscape: the wedge is on the left, so the left-edge label/arrows/rule lie on white
  // while the top-right registration lies on the dark field; portrait flips which is which.
  const leftInk = s.portrait ? PAL.mark : PAL.wedgeInk;     // vertical label, arrows, corner rule
  const cornerInk = s.portrait ? PAL.wedgeInk : PAL.mark;   // top-right registration marks

  return (
    <div id="stage">
      <svg ref={svgRef} viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="xMidYMid slice" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <pattern id="dots" width="15" height="15" patternUnits="userSpaceOnUse">
            <circle cx="1" cy="1" r="0.7" fill={PAL.wedgeDot} />
          </pattern>
          <clipPath id="wedgeclip"><path d={s.wedge} /></clipPath>
        </defs>

        {/* base field — morphogenesis image over a deep fallback, cover-fit */}
        <rect x="0" y="0" width={W} height={H} fill={PAL.bg} />
        <image className="background-layer" href={PAL.image} x="0" y="0" width={W} height={H}
          preserveAspectRatio="xMidYMid slice" />
        <image className={`background-layer activated${navActive ? " is-active" : ""}`} href={PAL.activatedImage} x="0" y="0" width={W} height={H}
          preserveAspectRatio="xMidYMid slice" />

        {/* angular wedge — flipped to white "paper" */}
        <path d={s.wedge} fill={PAL.wedge} />

        {/* blueprint detail, confined to the wedge */}
        <g clipPath="url(#wedgeclip)">
          <rect x="0" y="0" width={W} height={H} fill="url(#dots)" />
          <g stroke={PAL.wedgeLine} strokeWidth="2">
            <path d={`M${fx2(s.faint[0] - 11)},${fx2(s.faint[1])} h22 M${fx2(s.faint[0])},${fx2(s.faint[1] - 11)} v22`} />
          </g>
        </g>

        {/* equidistant relief lines, animated outward from the seam */}
        <g id="relief" fill="none" strokeLinejoin="miter">
          <path stroke={PAL.line} strokeWidth="1" />
          <path stroke={PAL.line} strokeWidth="1" />
          <path stroke={PAL.line} strokeWidth="1" />
        </g>

        {/* decorative crosses in the open field */}
        <g stroke={PAL.mark} strokeWidth="2">
          <Cross x={s.portrait ? W * 0.72 : Math.min(W * 0.62, W - s.m - 40)} y={s.portrait ? H * 0.55 : H * 0.45} s={22} c={PAL.mark} />
          <Cross x={s.portrait ? W * 0.30 : Math.min(W * 0.48, W - s.m - 30)} y={s.portrait ? H * 0.80 : H * 0.80} s={18} c={PAL.mark} />
        </g>

        {/* top-right registration marks */}
        <g stroke={cornerInk} strokeWidth="2">
          <Cross x={W - s.m - 22} y={s.m + 11} s={22} c={cornerInk} />
          <Cross x={W - s.m - 4} y={s.m + 26} s={14} c={cornerInk} />
        </g>

        {/* bottom-right tick comb + dashes */}
        <g transform={`translate(${fx2(W - s.m - tickStep * 6)} ${fx2(H - s.m - 16)})`}>
          <path stroke={PAL.ink} strokeWidth="2"
            d={`M${combX(0)},0 v16 M${combX(1)},0 v16 M${combX(2)},0 v16 M${combX(3)},0 v16 M${combX(4)},0 v16 M${combX(5)},0 v16 M${combX(6)},0 v16`} />
          <g fill={PAL.ink}>
            <rect x={fx2(tickStep * 4)} y="-14" width="14" height="7" />
            <rect x={fx2(tickStep * 4 + 20)} y="-14" width="22" height="7" />
          </g>
        </g>

        {/* bottom-left vertical text + ticks */}
        <g>
          <text x={s.m} y={H * 0.32} fontSize={fx2(s.sSize * 0.82)} letterSpacing={fx2(s.sLS)} fill={leftInk}
            transform={`rotate(90 ${s.m} ${H * 0.32})`}>GENE CIRCUIT SYSTEMS ▪ UNIT 01 ▪ REV Δ</text>
          <g fill={leftInk}>
            <path d={`M${fx2(s.m + 50)},${fx2(H * 0.50 + 55)} l9,0 l-9,7 z`} />
            <path d={`M${fx2(s.m + 50)},${fx2(H * 0.50 + 112)} l9,0 l-9,7 z`} />
          </g>
          <line x1={s.m - 4} y1={H - s.m - 85} x2={s.m - 4} y2={H - s.m} stroke={leftInk} strokeWidth="2" />

          {/* Readable metadata chrome, deliberately kept on the dotted paper field. */}
          <g transform={`translate(${fx2(s.bioChrome[0])} ${fx2(s.bioChrome[1])})`} fill={PAL.wedgeInk}>
            {(() => {
              const pad = s.sSize * 0.5;
              const width = 15 * (s.sSize * 0.60 + s.sLS) + pad * 2;
              return <>
                <rect x="0" y={fx2(-s.sSize * 1.02)} width={fx2(width)} height={fx2(s.sSize * 1.55)} fill={PAL.wedge} stroke={PAL.wedgeLine} strokeWidth="1.1" />
                <text x={fx2(pad)} y={fx2(s.sSize * 0.12)} fontSize={fx2(s.sSize)} letterSpacing={fx2(s.sLS)}>BIO ML ENGINEER</text>
              </>;
            })()}
          </g>
        </g>

        {/* title block — marker ▪|||▪ + name + subtitle */}
        <g transform={`translate(${fx2(s.titleX)} 0)`}>
          <g transform={`translate(0 ${fx2(s.markerY)})`}>
            <rect x="0" y="0" width="14" height="7" fill={PAL.ink} />
            <rect x="20" y="-1" width="2" height="9" fill={PAL.accentMid} />
            <rect x="27" y="-1" width="2" height="9" fill={PAL.accentMid} />
            <rect x="34" y="-1" width="2" height="9" fill={PAL.accentMid} />
            <rect x="54" y="0" width="11" height="7" fill={PAL.accent} />
          </g>
          {(() => {
            const titleUnit = s.tSize * 0.62 + s.tLS;
            const maksWidth = 6 * titleUnit;
            const maxWidth = 3 * titleUnit;
            const bracketGap = s.tSize * 0.70;
            const bracketLeft = maksWidth + bracketGap;
            const maxX = bracketLeft + bracketGap + 3;
            const bracketRight = maxX + maxWidth + bracketGap + 3;
            const tretikovX = bracketRight + bracketGap - s.tSize * 0.11;
            const bracketTop = s.nameY - s.tSize * 0.82;
            const bracketBottom = s.nameY + s.tSize * 0.13;
            return <>
              <text className="title" x="0" y={s.nameY} fontSize={fx2(s.tSize)} fontWeight="600" letterSpacing={fx2(s.tLS)} fill={PAL.ink}>MAKSIM</text>
              <path d={`M${fx2(bracketLeft + 5)},${fx2(bracketTop)} H${fx2(bracketLeft)} V${fx2(bracketBottom)} H${fx2(bracketLeft + 5)} M${fx2(bracketRight - 5)},${fx2(bracketTop)} H${fx2(bracketRight)} V${fx2(bracketBottom)} H${fx2(bracketRight - 5)}`} fill="none" stroke={PAL.ink} strokeWidth={fx2(Math.max(1.5, s.tSize * 0.085))} strokeLinecap="square" strokeLinejoin="miter" />
              <text className="title" x={fx2(maxX)} y={s.nameY} fontSize={fx2(s.tSize)} fontWeight="600" letterSpacing={fx2(s.tLS)} fill={PAL.ink}>MAX</text>
              <text className="title" x={fx2(tretikovX)} y={s.nameY} fontSize={fx2(s.tSize)} fontWeight="600" letterSpacing={fx2(s.tLS)} fill={PAL.ink}>TRETIKOV</text>
            </>;
          })()}
          {s.navLines.map((line, lineIndex) => {
            let x = 0;
            const y = s.subY + lineIndex * s.sSize * 1.35;
            return line.map((item, itemIndex) => {
              const currentX = x;
              x += item.label.length * s.navCharW;
              const separator = itemIndex < line.length - 1;
              const slashX = x + s.navSeparatorMargin + s.sSize * 0.045;
              if (separator) x += s.navSeparatorSpan;
              return (
                <React.Fragment key={item.label}>
                  <a href={item.href} className="nav-link" onPointerEnter={() => setNavActive(true)} onPointerLeave={() => setNavActive(false)} onFocus={() => setNavActive(true)} onBlur={() => setNavActive(false)}>
                    <text x={fx2(currentX)} y={fx2(y)} fontSize={fx2(s.sSize)} letterSpacing={fx2(s.sLS)} fill={PAL.inkDim}>{item.label}</text>
                  </a>
                  {separator && <text x={fx2(slashX)} y={fx2(y)} fontSize={fx2(s.sSize)} letterSpacing="0" fill={PAL.inkDim}>/</text>}
                </React.Fragment>
              );
            });
          })}
        </g>
      </svg>
    </div>
  );
}

ReactDOM.createRoot(document.getElementById("root")).render(<Frame />);
