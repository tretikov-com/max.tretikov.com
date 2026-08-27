import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { linkedTextSegments, parseResumeToml } from "./model.js";

const source = await readFile(new URL("./resume.toml", import.meta.url), "utf8");
const resume = parseResumeToml(source);

test("resume TOML preserves every source section and embedded headline", () => {
  assert.equal(resume.name, "Maksim [Max] Tretikov");
  assert.equal(resume.headline, "Machine Learning Engineer");
  assert.equal(resume.affiliation, "Bioengineering @ UC Berkeley");
  assert.equal(resume.skills.length, 2);
  assert.equal(resume.experience.length, 5);
  assert.equal(resume.community.length, 2);
  assert.equal(resume.education.length, 1);
});

test("resume links are normalized without changing the surrounding copy", () => {
  const harvard = resume.experience.at(-1);
  const segments = linkedTextSegments(harvard.description, harvard.links);

  assert.equal(segments.map((segment) => segment.text).join(""), harvard.description);
  assert.deepEqual(
    segments.filter((segment) => segment.href).map((segment) => segment.text),
    ["quantifiable planning", "Roadmap for Pandemic Resilience", "executive order"],
  );
});

test("resume content includes all source links", () => {
  const inlineLinks = [...resume.experience, ...resume.community]
    .flatMap((entry) => entry.links);
  assert.equal(inlineLinks.length, 8);
  assert.equal(resume.contact.linkedin, "https://www.linkedin.com/in/maxtretikov/");
});
