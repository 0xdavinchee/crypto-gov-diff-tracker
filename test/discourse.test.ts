import { afterEach, describe, expect, it, vi } from 'vitest';
import { fetchSnapshot, parseLatest } from '../src/discourse.js';
import { NOW, fixture, jsonResponse, now } from './support/helpers.js';

const FORUM = 'https://forum.arbitrum.foundation';

describe('parseLatest', () => {
  it('maps the saved Discourse fixture to exact normalized topics, ignoring extra fields', () => {
    expect(parseLatest(fixture)).toEqual([
      { id: 7, title: 'Welcome to Discourse', slug: 'welcome-to-discourse', postsCount: 42 },
      {
        id: 31625,
        title: fixture.topic_list.topics[1].title,
        slug: 'security-council-emergency-action-30-10-2026',
        postsCount: 1,
      },
      {
        id: 31605,
        title: fixture.topic_list.topics[2].title,
        slug: 'constitutional-aip-stylus-activation-contract',
        postsCount: 4,
      },
      {
        id: 31548,
        title: fixture.topic_list.topics[3].title,
        slug: 'adopting-usdg-as-a-core-strategic-initiative-for-the-arbitrumdao',
        postsCount: 19,
      },
    ]);
  });

  it('accepts an empty topic list', () => {
    expect(parseLatest({ topic_list: { topics: [] } })).toEqual([]);
  });

  const good = { id: 1, title: 'A', slug: 'a', posts_count: 1 };
  it.each([
    ['null body', null],
    ['missing topic_list', {}],
    ['topics not an array', { topic_list: { topics: {} } }],
    ['string id', { topic_list: { topics: [{ ...good, id: '1' }] } }],
    ['zero id', { topic_list: { topics: [{ ...good, id: 0 }] } }],
    ['empty title', { topic_list: { topics: [{ ...good, title: '' }] } }],
    ['missing slug', { topic_list: { topics: [{ id: 1, title: 'A', posts_count: 1 }] } }],
    ['zero posts_count', { topic_list: { topics: [{ ...good, posts_count: 0 }] } }],
    ['fractional posts_count', { topic_list: { topics: [{ ...good, posts_count: 1.5 }] } }],
    ['duplicate ids', { topic_list: { topics: [good, { ...good, title: 'B' }] } }],
  ])('rejects the whole page on %s', (_name, body) => {
    expect(() => parseLatest(body)).toThrow();
  });
});

describe('fetchSnapshot', () => {
  afterEach(() => vi.restoreAllMocks());

  it('requests latest.json once with a JSON header and an abort signal, and stamps fetchedAt', async () => {
    const fetchImpl = vi.fn(async (_url: string | URL | Request, _init?: RequestInit) => jsonResponse(fixture));
    const snap = await fetchSnapshot(FORUM, { fetchImpl: fetchImpl as unknown as typeof fetch, now });

    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const [url, init] = fetchImpl.mock.calls[0]!;
    expect(url).toBe(`${FORUM}/latest.json`);
    expect(new Headers(init?.headers).get('accept')).toBe('application/json');
    expect(init?.signal).toBeInstanceOf(AbortSignal);
    expect(snap).toMatchObject({ schemaVersion: 1, forumUrl: FORUM, fetchedAt: NOW.toISOString() });
    expect(snap.topics).toHaveLength(4);
  });

  it('defaults the timeout to 15 seconds', async () => {
    const spy = vi.spyOn(AbortSignal, 'timeout');
    await fetchSnapshot(FORUM, { fetchImpl: (async () => jsonResponse(fixture)) as typeof fetch, now });
    expect(spy).toHaveBeenCalledWith(15_000);
  });

  it.each([403, 429, 500])('fails with the HTTP status on %i', async (status) => {
    const fetchImpl = (async () => new Response('<html>blocked</html>', { status })) as typeof fetch;
    await expect(fetchSnapshot(FORUM, { fetchImpl, now })).rejects.toThrow(`HTTP ${status}`);
  });

  it('fails on an HTML body and does not leak the body into the error', async () => {
    const fetchImpl = (async () => new Response('<html>secret page</html>')) as typeof fetch;
    const err = await fetchSnapshot(FORUM, { fetchImpl, now }).catch((e: Error) => e);
    expect(String(err)).toMatch(/not valid JSON/);
    expect(String(err)).not.toMatch(/secret page/);
  });

  it('fails when fetch rejects', async () => {
    const fetchImpl = (async () => {
      throw new TypeError('fetch failed');
    }) as typeof fetch;
    await expect(fetchSnapshot(FORUM, { fetchImpl, now })).rejects.toThrow(/fetch failed/);
  });

  const neverUnlessAborted = (signal: AbortSignal | null | undefined) =>
    new Promise<never>((_, reject) => signal?.addEventListener('abort', () => reject(signal.reason)));

  it('times out a hung request', async () => {
    const fetchImpl = ((_url: string, init?: RequestInit) => neverUnlessAborted(init?.signal)) as typeof fetch;
    await expect(fetchSnapshot(FORUM, { fetchImpl, now, timeoutMs: 10 })).rejects.toThrow(/timed out after 10ms/);
  });

  it('times out a body read that hangs after headers arrive', async () => {
    const fetchImpl = (async () => {
      const res = new Response('');
      // A body that never finishes and ignores the signal: the timeout must still win.
      Object.defineProperty(res, 'text', { value: () => new Promise(() => {}) });
      return res;
    }) as typeof fetch;
    await expect(fetchSnapshot(FORUM, { fetchImpl, now, timeoutMs: 10 })).rejects.toThrow(/timed out/);
  });
});
