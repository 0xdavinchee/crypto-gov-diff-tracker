import type { Topic } from './types.js';

function isPositiveInt(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value > 0;
}

function isNonemptyString(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0;
}

// Shared by the Discourse parser (snake_case input) and snapshot loading (Topic input).
export function validateTopics(raw: unknown, countKey: 'posts_count' | 'postsCount'): Topic[] {
  if (!Array.isArray(raw)) throw new Error('topics is not an array');
  const seen = new Set<number>();
  return raw.map((item: unknown, index) => {
    if (typeof item !== 'object' || item === null) throw new Error(`topic ${index} is not an object`);
    const t = item as Record<string, unknown>;
    const { id, title, slug } = t;
    const postsCount = t[countKey];
    if (!isPositiveInt(id)) throw new Error(`topic ${index} has an invalid id`);
    if (!isNonemptyString(title)) throw new Error(`topic ${id} has an invalid title`);
    if (!isNonemptyString(slug)) throw new Error(`topic ${id} has an invalid slug`);
    if (!isPositiveInt(postsCount)) throw new Error(`topic ${id} has an invalid ${countKey}`);
    if (seen.has(id)) throw new Error(`duplicate topic id ${id}`);
    seen.add(id);
    return { id, title, slug, postsCount };
  });
}
