import { parse } from "smol-toml";

function requireRecord(value, path) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new TypeError(`${path} must be a TOML table.`);
  }
  return value;
}

function requireString(value, path) {
  if (typeof value !== "string" || value.trim() === "") {
    throw new TypeError(`${path} must be a non-empty string.`);
  }
  return value;
}

function requireArray(value, path) {
  if (!Array.isArray(value)) {
    throw new TypeError(`${path} must be an array of tables.`);
  }
  return value;
}

function requireWebUrl(value, path) {
  const url = new URL(requireString(value, path));
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new TypeError(`${path} must use http or https.`);
  }
  return url.href;
}

function normalizeLinks(value, text, path) {
  const links = value ?? [];
  if (!Array.isArray(links)) {
    throw new TypeError(`${path} must be an array of inline tables.`);
  }

  return links.map((rawLink, index) => {
    const link = requireRecord(rawLink, `${path}[${index}]`);
    const label = requireString(link.label, `${path}[${index}].label`);
    if (!text.includes(label)) {
      throw new TypeError(`${path}[${index}].label must occur in its description.`);
    }
    return {
      label,
      url: requireWebUrl(link.url, `${path}[${index}].url`),
    };
  });
}

function normalizeEntries(value, path, options = {}) {
  const { descriptionRequired = true } = options;
  return requireArray(value, path).map((rawEntry, index) => {
    const entryPath = `${path}[${index}]`;
    const entry = requireRecord(rawEntry, entryPath);
    const description = entry.description == null
      ? null
      : requireString(entry.description, `${entryPath}.description`);
    if (descriptionRequired && description == null) {
      throw new TypeError(`${entryPath}.description must be a non-empty string.`);
    }
    const role = entry.role == null ? null : requireString(entry.role, `${entryPath}.role`);

    return {
      organization: requireString(entry.organization, `${entryPath}.organization`),
      role,
      dates: requireString(entry.dates, `${entryPath}.dates`),
      description,
      links: normalizeLinks(entry.links, description ?? "", `${entryPath}.links`),
    };
  });
}

export function parseResumeToml(source) {
  const document = parse(source);
  const resume = requireRecord(document.resume, "resume");
  const contact = requireRecord(resume.contact, "resume.contact");

  return {
    name: requireString(resume.name, "resume.name"),
    headline: requireString(resume.headline, "resume.headline"),
    affiliation: requireString(resume.affiliation, "resume.affiliation"),
    summaryLead: requireString(resume.summary_lead, "resume.summary_lead"),
    summaryBody: requireString(resume.summary_body, "resume.summary_body"),
    contact: {
      location: requireString(contact.location, "resume.contact.location"),
      phone: requireString(contact.phone, "resume.contact.phone"),
      email: requireString(contact.email, "resume.contact.email"),
      linkedin: requireWebUrl(contact.linkedin, "resume.contact.linkedin"),
    },
    skills: requireArray(resume.skills, "resume.skills").map((rawSkill, index) => {
      const skill = requireRecord(rawSkill, `resume.skills[${index}]`);
      return {
        label: requireString(skill.label, `resume.skills[${index}].label`),
        detail: requireString(skill.detail, `resume.skills[${index}].detail`),
      };
    }),
    experience: normalizeEntries(resume.experience, "resume.experience"),
    community: normalizeEntries(resume.community, "resume.community"),
    education: normalizeEntries(resume.education, "resume.education", {
      descriptionRequired: false,
    }),
  };
}

export function linkedTextSegments(text, links = []) {
  const ranges = links
    .map((link) => {
      const start = text.indexOf(link.label);
      if (start < 0) {
        throw new TypeError(`Linked label not found in résumé text: ${link.label}`);
      }
      return { ...link, start, end: start + link.label.length };
    })
    .sort((a, b) => a.start - b.start);

  const segments = [];
  let cursor = 0;
  for (const range of ranges) {
    if (range.start < cursor) {
      throw new TypeError("Linked labels in a résumé description cannot overlap.");
    }
    if (range.start > cursor) segments.push({ text: text.slice(cursor, range.start) });
    segments.push({ text: text.slice(range.start, range.end), href: range.url });
    cursor = range.end;
  }
  if (cursor < text.length) segments.push({ text: text.slice(cursor) });
  return segments;
}
