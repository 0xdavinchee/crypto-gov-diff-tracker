import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach } from 'vitest';
import type { Topic } from '../../src/types.js';

export const FIXTURE_PATH = new URL('../fixtures/arbitrum-latest.json', import.meta.url);
// Captured 2026-10-30 from https://forum.arbitrum.foundation/latest.json, trimmed to 4 topics.
export const fixture = JSON.parse(await readFile(FIXTURE_PATH, 'utf8'));

export const NOW = new Date('2026-10-30T12:00:00.000Z');
export const now = () => NOW;

const dirs: string[] = [];
export async function tempDir(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'gov-diff-test-'));
  dirs.push(dir);
  return dir;
}
afterEach(async () => {
  await Promise.all(dirs.splice(0).map((d) => rm(d, { recursive: true, force: true })));
});

export async function listDir(dir: string): Promise<string[] | null> {
  try {
    return (await readdir(dir)).sort();
  } catch {
    return null;
  }
}

export function latestBody(topics: Topic[]): unknown {
  return {
    users: [],
    topic_list: {
      can_create_topic: false,
      topics: topics.map((t) => ({ id: t.id, title: t.title, slug: t.slug, posts_count: t.postsCount, views: 1 })),
    },
  };
}

export function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

export type Route = unknown | ((url: string) => Response | Promise<Response>);

// Fake fetch keyed by forum base URL; each value is a latest.json body or a custom responder.
export function fakeFetch(routes: Record<string, Route>) {
  const calls: string[] = [];
  const impl = (async (input: string | URL | Request) => {
    const url = String(input);
    calls.push(url);
    const base = url.replace(/\/latest\.json$/, '');
    if (!(base in routes)) throw new Error(`no route for ${url}`);
    const route = routes[base];
    return typeof route === 'function' ? route(url) : jsonResponse(route);
  }) as typeof fetch;
  return { impl, calls };
}

export function capture() {
  let text = '';
  return {
    writer: async (chunk: string) => {
      text += chunk;
    },
    get text() {
      return text;
    },
  };
}

export const topic = (id: number, postsCount: number, title = `Topic ${id}`): Topic => ({
  id,
  title,
  slug: `topic-${id}`,
  postsCount,
});
