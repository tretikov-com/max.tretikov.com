import React, { useMemo, useRef, useState } from "react";
import { blogPostPath, DISCUSSIONS_URL } from "./config.js";
import BurstCanvas from "./BurstCanvas.jsx";
import { formatBlogDate } from "./date.js";
import { arrangeBlogPosts, BURST_SLOTS } from "./layout.js";

export default function BurstIndex({ posts }) {
  const [active, setActive] = useState(null);
  const [archiveCount, setArchiveCount] = useState(20);
  const originLetter = useRef(null);
  const { featured, archive } = useMemo(() => arrangeBlogPosts(posts), [posts]);
  const positions = useMemo(() => featured.map((post, index) => ({ ...BURST_SLOTS[index], seed: post.number })), [featured]);

  return <main className="blog-index" id="blog-main">
    <a className="burst-side-note" href={DISCUSSIONS_URL} target="_blank" rel="noopener noreferrer">FOLLOW ON GITHUB ↗</a>
    <div className="burst-side-count">{String(posts.length).padStart(2, "0")} {posts[0]?.isDemo ? "LOCAL EXAMPLES" : "ENTRIES"}</div>
    <section className="burst-canvas" aria-label="Explore recent blog posts">
      <BurstCanvas positions={positions} active={active} originLetter={originLetter} />
      <h1 className="burst-center" aria-label="Blog.">Bl<span className="burst-origin-letter" ref={originLetter}>o</span>g<span className="burst-period">.</span></h1>
      <div className="burst-posts">
        {featured.map((post, index) => {
          const { x, y, tilt } = positions[index];
          return <a
            className={`burst-post${active === index ? " is-active" : ""}`}
            key={post.number}
            href={blogPostPath(post.number)}
            style={{ "--x": `${x}%`, "--y": `${y}%`, "--tilt": `${tilt}deg` }}
            onPointerEnter={() => setActive(index)}
            onPointerLeave={(event) => { if (event.currentTarget !== document.activeElement) setActive(null); }}
            onFocus={() => setActive(index)}
            onBlur={() => setActive(null)}
          >
            <span className="burst-post-title">{post.title}</span>
            <span className="burst-post-meta">
              <span>{String(post.number).padStart(3, "0")}</span>
              <time dateTime={post.createdAt}>{formatBlogDate(post.createdAt)}</time>
              <span className="burst-post-arrow" aria-hidden="true">↗</span>
            </span>
          </a>;
        })}
      </div>
    </section>
    {!!archive.length && <section className="blog-archive" aria-labelledby="archive-title">
      <h2 id="archive-title">Archive</h2>
      <div className="blog-archive-list">
        {archive.slice(0, archiveCount).map((post) => <a className="blog-archive-post" href={blogPostPath(post.number)} key={post.number}>
          <span className="blog-archive-number">{String(post.number).padStart(3, "0")}</span>
          <h3>{post.title}</h3>
          <time dateTime={post.createdAt}>{formatBlogDate(post.createdAt)}</time>
          <span className="blog-archive-arrow" aria-hidden="true">↗</span>
        </a>)}
      </div>
      {archiveCount < archive.length && <button className="blog-archive-more" type="button" onClick={() => setArchiveCount((count) => count + 20)}>SHOW MORE POSTS <span aria-hidden="true">↓</span></button>}
    </section>}
  </main>;
}
