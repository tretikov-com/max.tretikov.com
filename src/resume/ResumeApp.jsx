import React, { useEffect } from "react";
import resumeSource from "./resume.toml?raw";
import { linkedTextSegments, parseResumeToml } from "./model.js";
import "./resume.css";

const resume = parseResumeToml(resumeSource);

function restoreDataAttribute(element, name, previousValue) {
  if (previousValue == null) delete element.dataset[name];
  else element.dataset[name] = previousValue;
}

function RichText({ links, text }) {
  return linkedTextSegments(text, links).map((segment, index) => (
    segment.href
      ? <a href={segment.href} key={`${segment.href}-${index}`} target="_blank" rel="noopener noreferrer">{segment.text}</a>
      : <React.Fragment key={`text-${index}`}>{segment.text}</React.Fragment>
  ));
}

function ResumeEntry({ entry }) {
  return <article className="resume-entry">
    <header className="resume-entry-header">
      <div>
        <h3>{entry.organization}</h3>
        {entry.role && <p className="resume-role">{entry.role}</p>}
      </div>
      <time>{entry.dates}</time>
    </header>
    {entry.description && <p className="resume-entry-description">
      <RichText text={entry.description} links={entry.links} />
    </p>}
  </article>;
}

function ResumeSection({ entries, index, title }) {
  const id = `resume-section-${index}`;
  return <section className="resume-section" aria-labelledby={id}>
    <header className="resume-section-header">
      <span aria-hidden="true">{String(index).padStart(2, "0")}</span>
      <h2 id={id}>{title}</h2>
    </header>
    <div className="resume-entry-list">
      {entries.map((entry) => <ResumeEntry entry={entry} key={`${entry.organization}-${entry.dates}`} />)}
    </div>
  </section>;
}

function ResumeName({ name }) {
  const parts = name.match(/^(.+?)\s+\[([^\]]+)]\s+(.+)$/);
  if (!parts) return <h1 id="resume-name">{name}</h1>;

  const [, firstName, alias, lastName] = parts;
  return <h1 id="resume-name" aria-label={name}>
    <span>{firstName}</span>
    <span className="resume-name-alias">{alias}</span>
    <span>{lastName}</span>
  </h1>;
}

export default function ResumeApp() {
  useEffect(() => {
    const html = document.documentElement;
    const body = document.body;
    const previousHtmlView = html.dataset.view;
    const previousBodyView = body.dataset.view;
    const previousTitle = document.title;

    html.dataset.view = "resume";
    body.dataset.view = "resume";
    document.title = `${resume.name} — Résumé`;

    return () => {
      restoreDataAttribute(html, "view", previousHtmlView);
      restoreDataAttribute(body, "view", previousBodyView);
      document.title = previousTitle;
    };
  }, []);

  const linkedinLabel = resume.contact.linkedin
    .replace(/^https?:\/\/(?:www\.)?/, "")
    .replace(/\/$/, "");
  const phoneHref = `tel:${resume.contact.phone.replace(/[^+\d]/g, "")}`;

  return <div className="resume-page">
    <nav className="resume-toolbar" aria-label="Résumé controls">
      <a className="resume-home-link" href="/">
        <span aria-hidden="true">[</span> MAX TRETIKOV <span aria-hidden="true">]</span>
      </a>
      <span className="resume-toolbar-label" aria-hidden="true">DOCUMENT / RÉSUMÉ</span>
      <a
        className="resume-pdf-link"
        href="/Maksim-Tretikov-Resume.pdf"
        download
        aria-label="Download résumé PDF"
        title="Download the one-page PDF"
      >
        EXPORT PDF <span aria-hidden="true">↗</span>
      </a>
    </nav>

    <main>
      <article className="resume-document" aria-labelledby="resume-name">
        <header className="resume-masthead">
          <div className="resume-identity">
            <div>
              <span className="resume-title-marker" aria-hidden="true" />
              <ResumeName name={resume.name} />
            </div>
            <div className="resume-descriptors">
              <p>{resume.headline}</p>
              <p>{resume.affiliation}</p>
            </div>
          </div>

          <address className="resume-contact">
            <span>{resume.contact.location}</span>
            <a href={phoneHref}>{resume.contact.phone}</a>
            <a href={`mailto:${resume.contact.email}`}>{resume.contact.email}</a>
            <a href={resume.contact.linkedin} target="_blank" rel="noopener noreferrer">{linkedinLabel}</a>
          </address>

          <p className="resume-summary">
            <strong>{resume.summaryLead}</strong>{" "}{resume.summaryBody}
          </p>

          <div className="resume-skills" aria-label="Skills">
            {resume.skills.map((skill) => <p key={skill.label}>
              <strong>{skill.label}</strong>
              <span>{skill.detail}</span>
            </p>)}
          </div>
        </header>

        <ResumeSection index={1} title="Work, Research and Internship Experience" entries={resume.experience} />
        <ResumeSection index={2} title="Open Source & Community Contributions" entries={resume.community} />
        <ResumeSection index={3} title="Education" entries={resume.education} />
      </article>
    </main>
  </div>;
}
