import React, { useEffect } from "react";
import Giscus from "@giscus/react";
import "katex/dist/katex.min.css";
import snapshot from "./posts.json";
import { blogPostNumber } from "./config.js";
import BurstIndex from "./BurstIndex.jsx";
import { formatBlogDate } from "./date.js";
import "./blog.css";

const isLocalDevelopment = import.meta.env.DEV && ["localhost", "127.0.0.1", "::1", "[::1]"].includes(window.location.hostname);
let posts = snapshot.posts;
if (import.meta.env.DEV && isLocalDevelopment && !posts.length) {
  posts = (await import("./dev-posts.js")).default;
}

function PostDate({ value }) {
  return <time dateTime={value}>{formatBlogDate(value)}</time>;
}

function BlogPost({ post }) {
  return <main className="blog-reader" id="blog-main">
    <div className="blog-post-nav"><a href="/blog">← ALL POSTS</a><a href={post.url} target="_blank" rel="noopener noreferrer">VIEW ON GITHUB ↗</a></div>
    <article aria-labelledby="post-title">
      <header className="blog-post-header">
        <div>
          <h1 id="post-title">{post.title}</h1>
          {post.author && <a className="blog-byline" href={post.author.url} target="_blank" rel="noopener noreferrer">@{post.author.login}</a>}
        </div>
        <div className="blog-entry-meta"><PostDate value={post.createdAt} /><span>{post.readingMinutes} MIN READ</span><span>POST / {String(post.number).padStart(3, "0")}</span></div>
      </header>
      <div className="blog-prose" dangerouslySetInnerHTML={{ __html: post.html }} />
    </article>
    <section className="blog-conversation" aria-labelledby="conversation-title">
      <header><h2 id="conversation-title">Conversation</h2><a href={post.url} target="_blank" rel="noopener noreferrer">JOIN ON GITHUB ↗</a></header>
      <p>Sign in with GitHub to comment or leave a reaction.</p>
      {post.isDemo ? <p className="blog-demo-notice">This is a localhost example post. Comments and reactions connect to GitHub on published posts.</p> : <Giscus
        key={post.number}
        id="blog-comments"
        repo={snapshot.repository}
        repoId={snapshot.repositoryId}
        category={snapshot.category.name}
        categoryId={snapshot.category.id}
        mapping="number"
        term={String(post.number)}
        reactionsEnabled="1"
        emitMetadata="0"
        inputPosition="top"
        theme="light"
        lang="en"
        loading="lazy"
      />}
    </section>
  </main>;
}

export default function BlogApp({ route }) {
  const isIndex = /^\/blog\/?$/.test(route.pathname);
  const number = blogPostNumber(route.pathname);
  const post = posts.find((entry) => entry.number === number);

  useEffect(() => {
    const html = document.documentElement;
    const body = document.body;
    const oldHtmlView = html.dataset.view;
    const oldBodyView = body.dataset.view;
    const oldTitle = document.title;
    html.dataset.view = body.dataset.view = "blog";
    return () => {
      if (oldHtmlView == null) delete html.dataset.view;
      else html.dataset.view = oldHtmlView;
      if (oldBodyView == null) delete body.dataset.view;
      else body.dataset.view = oldBodyView;
      document.title = oldTitle;
    };
  }, []);

  useEffect(() => {
    document.title = `${post ? post.title : isIndex ? "Blog" : "Post not found"} — Max Tretikov`;
    const frame = requestAnimationFrame(() => {
      let anchor;
      try { anchor = route.hash && document.getElementById(decodeURIComponent(route.hash.slice(1))); } catch { /* Invalid URL fragment. */ }
      if (anchor) anchor.scrollIntoView();
      else window.scrollTo(0, 0);
    });
    return () => cancelAnimationFrame(frame);
  }, [route.pathname, route.hash, post, isIndex]);

  return <div className="blog-page">
    <a className="blog-skip" href="#blog-main">Skip to content</a>
    <header className="blog-toolbar">
      <a className="blog-wordmark" href="/"><span>[</span> MAX TRETIKOV <span>]</span></a>
      <nav aria-label="Site navigation"><a href="/projects">PROJECTS</a><a href="/resume">RÉSUMÉ</a><a href="/blog" aria-current="page">BLOG</a></nav>
    </header>
    {isIndex ? <BurstIndex posts={posts} /> : post ? <BlogPost post={post} /> : <main className="blog-not-found" id="blog-main">
      <h1>Post not found.</h1><p>This post may have moved or is no longer published.</p><a href="/blog">← ALL POSTS</a>
    </main>}
  </div>;
}
