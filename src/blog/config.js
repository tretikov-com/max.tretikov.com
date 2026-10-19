export const BLOG_SOURCE = {
  owner: "tretikov-com",
  repo: "max.tretikov.com",
  category: "Announcements",
};

export const DISCUSSIONS_URL = `https://github.com/${BLOG_SOURCE.owner}/${BLOG_SOURCE.repo}/discussions`;

export function blogPostPath(number) {
  return `/blog/${number}`;
}

// Discussion numbers keep links stable when a post's title changes.
export function blogPostNumber(pathname) {
  const match = /^\/blog\/([1-9]\d*)\/?$/.exec(pathname);
  return match && Number.isSafeInteger(Number(match[1])) ? Number(match[1]) : null;
}
