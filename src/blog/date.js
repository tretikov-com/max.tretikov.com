const formatter = new Intl.DateTimeFormat("en-US", {
  day: "2-digit", month: "short", year: "numeric", timeZone: "UTC",
});

export function formatBlogDate(value) {
  const parts = Object.fromEntries(formatter.formatToParts(new Date(value)).map(({ type, value }) => [type, value]));
  return `${parts.day} ${parts.month} ${parts.year}`;
}
