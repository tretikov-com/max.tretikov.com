export const BURST_SLOTS = [
  { x: 79, y: 38, tilt: -4 },
  { x: 21, y: 62, tilt: -4 },
  { x: 21, y: 38, tilt: 4 },
  { x: 79, y: 62, tilt: 4 },
  { x: 76, y: 15, tilt: -8 },
  { x: 24, y: 85, tilt: -8 },
  { x: 24, y: 15, tilt: 8 },
  { x: 76, y: 85, tilt: 8 },
];

export function arrangeBlogPosts(posts) {
  const chronological = [...posts].sort((a, b) => b.createdAt.localeCompare(a.createdAt) || b.number - a.number);
  return { featured: chronological.slice(0, BURST_SLOTS.length), archive: chronological.slice(BURST_SLOTS.length) };
}
