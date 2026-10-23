import React, { useEffect, useRef, useState } from "react";
import { PALETTE as PAL } from "../palette.js";
import "./site-header.css";

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const fx2 = (value) => value.toFixed(1);

const NAV_ITEMS = [
  { label: "PROJECTS", href: "/projects" },
  { label: "RESUME", href: "/resume" },
  { label: "BLOG", href: "/blog" },
  { label: "PROFILES", href: "/profiles" },
];

const PROFILE_LINKS = [
  { label: "GITHUB", href: "https://github.com/MaxTretikov" },
  { label: "LINKEDIN", href: "https://www.linkedin.com/in/maxtretikov" },
];

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

function profileMenuMetrics(scene) {
  const fontSize = clamp(scene.sSize * 1.02, 14, 18);
  const width = scene.portrait
    ? clamp(scene.W - scene.m * 2 - 24, 286, 328)
    : clamp(fontSize * 24, 350, 420);
  return {
    fontSize,
    width,
    height: width * (236 / 420) * (scene.portrait ? 1.06 : 1),
  };
}

function ProfileMenu({ metrics, transform }) {
  const sx = metrics.width / 420;
  const sy = metrics.height / 236;
  return (
    <g id="profile-links-menu" className="profile-menu" role="group" aria-label="External profiles" transform={transform}>
      <image href="/profile-menu.svg?v=8" x="0" y="0" width={fx2(metrics.width)} height={fx2(metrics.height)} preserveAspectRatio="none" />
      <g className="profile-menu-meta" fill={PAL.inkDim}>
        <text x={fx2(80  * sx)} y={fx2(55 * sy)} fontSize={fx2(metrics.fontSize * 0.56)} letterSpacing={fx2(metrics.fontSize * 0.15)}>NET://PROFILE INDEX</text>
        <text x={fx2(300 * sx)} y={fx2(50 * sy)} fontSize={fx2(metrics.fontSize * 0.48)} letterSpacing={fx2(metrics.fontSize * 0.08)}>β LINKS</text>
      </g>
      {PROFILE_LINKS.map((profile, profileIndex) => (
        <a className="profile-link" tabIndex="0" key={profile.label} href={profile.href} target="_blank" rel="noopener noreferrer">
          <path className="profile-link-hit" d={profileIndex === 0
            ? `M${fx2(63 * sx)},${fx2(73 * sy)} H${fx2(383 * sx)} L${fx2(402 * sx)},${fx2(92 * sy)} V${fx2(123 * sy)} H${fx2(81 * sx)} L${fx2(63 * sx)},${fx2(105 * sy)} Z`
            : `M${fx2(63 * sx)},${fx2(135 * sy)} H${fx2(381 * sx)} L${fx2(397 * sx)},${fx2(151 * sy)} V${fx2(181 * sy)} L${fx2(383 * sx)},${fx2(195 * sy)} H${fx2(63 * sx)} Z`} />
          <text className="profile-link-index" x={fx2(82 * sx)} y={fx2((105 + profileIndex * 62) * sy)} fontSize={fx2(metrics.fontSize * 0.58)} letterSpacing={fx2(metrics.fontSize * 0.10)}>0{profileIndex + 1}</text>
          <text className="profile-link-label" x={fx2(118 * sx)} y={fx2((107 + profileIndex * 62) * sy)} fontSize={fx2(metrics.fontSize)} letterSpacing={fx2(metrics.fontSize * 0.13)}>{profile.label}</text>
          <path className="profile-link-arrow" d={`M${fx2(358 * sx)},${fx2((98 + profileIndex * 62) * sy)} h${fx2(16 * sx)} m${fx2(-6 * sx)},${fx2(-6 * sy)} l${fx2(6 * sx)},${fx2(6 * sy)} l${fx2(-6 * sx)},${fx2(6 * sy)}`} />
        </a>
      ))}
      <text className="profile-menu-footer" fontSize={fx2(metrics.fontSize * 0.52)} letterSpacing={fx2(metrics.fontSize * 0.06)}>
        <tspan x={fx2(75 * sx)} y={fx2(207 * sy)}>EXT.LINK</tspan>
        <tspan x={fx2(75 * sx)} y={fx2(220 * sy)}>SELECT</tspan>
      </text>
    </g>
  );
}

function HeroHeader({ scene: s, rootRef, triggerRef, profileMenu, setProfileMenu, setNavActive }) {
  const { W, H } = s;
  const navLines = s.portrait
    ? [NAV_ITEMS.slice(0, 2), NAV_ITEMS.slice(2)]
    : packNav(NAV_ITEMS, Math.max(W - s.titleX - s.m, 120), s.navCharW, s.navSeparatorSpan);

  return (
    <g ref={rootRef} role="banner" transform={`translate(${fx2(s.titleX)} 0)`}>
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
        const tretikovX = bracketRight + bracketGap + 3;
        const bracketTop = s.nameY - s.tSize * 0.82;
        const bracketBottom = s.nameY + s.tSize * 0.13;
        return <>
          <text className="title" x="0" y={s.nameY} fontSize={fx2(s.tSize)} fontWeight="600" letterSpacing={fx2(s.tLS)} fill={PAL.ink}>MAKSIM</text>
          <path d={`M${fx2(bracketLeft + 5)},${fx2(bracketTop)} H${fx2(bracketLeft)} V${fx2(bracketBottom)} H${fx2(bracketLeft + 5)} M${fx2(bracketRight - 5)},${fx2(bracketTop)} H${fx2(bracketRight)} V${fx2(bracketBottom)} H${fx2(bracketRight - 5)}`} fill="none" stroke={PAL.ink} strokeWidth={fx2(Math.max(1.5, s.tSize * 0.085))} strokeLinecap="square" strokeLinejoin="miter" />
          <text className="title" x={fx2(maxX)} y={s.nameY} fontSize={fx2(s.tSize)} fontWeight="600" letterSpacing={fx2(s.tLS)} fill={PAL.ink}>MAX</text>
          <text className="title" x={fx2(tretikovX)} y={s.nameY} fontSize={fx2(s.tSize)} fontWeight="600" letterSpacing={fx2(s.tLS)} fill={PAL.ink}>TRETIKOV</text>
        </>;
      })()}
      {navLines.map((line, lineIndex) => {
        let x = 0;
        const y = s.subY + lineIndex * s.sSize * 1.35;
        return line.map((item, itemIndex) => {
          const currentX = x;
          x += item.label.length * s.navCharW;
          const separator = itemIndex < line.length - 1 || (s.portrait && lineIndex === 0 && itemIndex === line.length - 1);
          const slashX = x + s.navSeparatorMargin + s.sSize * 0.045;
          if (separator) x += s.navSeparatorSpan;
          return (
            <React.Fragment key={item.label}>
              <a href={item.href} className="nav-link" aria-label={item.label} onPointerEnter={() => setNavActive(true)} onPointerLeave={() => setNavActive(false)} onFocus={() => setNavActive(true)} onBlur={() => setNavActive(false)} onClick={item.label === "PROFILES" ? (event) => {
                event.preventDefault();
                event.stopPropagation();
                if (profileMenu) { setProfileMenu(null); return; }
                const metrics = profileMenuMetrics(s);
                const anchorX = s.titleX + currentX - metrics.width * 0.075;
                const anchorY = y + s.sSize * 1.25;
                setNavActive(false);
                setProfileMenu({
                  x: clamp(anchorX, s.m, W - metrics.width - s.m),
                  y: clamp(anchorY, s.m, H - metrics.height - s.m),
                });
              } : undefined} ref={item.label === "PROFILES" ? triggerRef : undefined} tabIndex="0" aria-controls={item.label === "PROFILES" ? "profile-links-menu" : undefined} aria-expanded={item.label === "PROFILES" ? Boolean(profileMenu) : undefined}>
                <text x={fx2(currentX)} y={fx2(y)} fontSize={fx2(s.sSize)} letterSpacing={fx2(s.sLS)} fill={PAL.inkDim}>{item.label}</text>
              </a>
              {separator && <text x={fx2(slashX)} y={fx2(y)} fontSize={fx2(s.sSize)} letterSpacing="0" fill={PAL.inkDim}>/</text>}
            </React.Fragment>
          );
        });
      })}
      {profileMenu && <ProfileMenu metrics={profileMenuMetrics(s)} transform={`translate(${fx2(profileMenu.x - s.titleX)} ${fx2(profileMenu.y)})`} />}
    </g>
  );
}

export default function SiteHeader({ actions, children, scene, onNavActive, onProfilesChange }) {
  const [profileMenu, setProfileMenu] = useState(null);
  const rootRef = useRef(null);
  const triggerRef = useRef(null);
  const pathname = window.location.pathname;

  useEffect(() => {
    onProfilesChange?.(Boolean(profileMenu));
  }, [profileMenu, onProfilesChange]);

  useEffect(() => {
    if (!profileMenu) return undefined;
    const closeOutside = (event) => {
      if (!rootRef.current?.contains(event.target)) setProfileMenu(null);
    };
    const closeOnEscape = (event) => {
      if (event.key !== "Escape") return;
      setProfileMenu(null);
      triggerRef.current?.focus();
    };
    document.addEventListener("pointerdown", closeOutside);
    document.addEventListener("focusin", closeOutside);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOutside);
      document.removeEventListener("focusin", closeOutside);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [profileMenu]);

  if (scene) return <HeroHeader
    scene={scene}
    rootRef={rootRef}
    triggerRef={triggerRef}
    profileMenu={profileMenu}
    setProfileMenu={setProfileMenu}
    setNavActive={onNavActive}
  />;

  return <header className="site-header" ref={rootRef}>
    <a className="site-wordmark" href="/" aria-label="Return to Max Tretikov home">
      <span aria-hidden="true">[</span> MAX TRETIKOV <span aria-hidden="true">]</span>
    </a>
    {children && <div className="site-header-context">{children}</div>}
    <nav className="site-navigation" aria-label="Site navigation">
      {NAV_ITEMS.map((item) => item.label === "PROFILES"
        ? <div className="site-profiles" key={item.label}>
          <button
            type="button"
            ref={triggerRef}
            aria-controls="profile-links-menu"
            aria-expanded={Boolean(profileMenu)}
            onClick={() => setProfileMenu((current) => current ? null : {})}
          >{item.label}</button>
          {profileMenu && <svg className="site-profiles-panel" viewBox="0 0 420 236" xmlns="http://www.w3.org/2000/svg">
            <ProfileMenu metrics={{ width: 420, height: 236, fontSize: 18 }} />
          </svg>}
        </div>
        : <a href={item.href} key={item.label} aria-current={pathname === item.href || pathname.startsWith(`${item.href}/`) ? "page" : undefined}>{item.label}</a>)}
    </nav>
    {actions && <div className="site-header-actions">{actions}</div>}
  </header>;
}
