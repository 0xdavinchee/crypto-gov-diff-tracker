import type { Snapshot, Topic } from './types.js';
import { validateTopics } from './validate.js';

export type FetchDeps = {
  fetchImpl: typeof fetch;
  now: () => Date;
  timeoutMs?: number;
};

export function parseLatest(body: unknown): Topic[] {
  const list = (body as { topic_list?: { topics?: unknown } } | null)?.topic_list;
  if (typeof list !== 'object' || list === null) throw new Error('response has no topic_list');
  return validateTopics(list.topics, 'posts_count');
}

// fetch only aborts the body read if the implementation honours the signal; racing makes it certain.
function abortable<T>(promise: Promise<T>, signal: AbortSignal): Promise<T> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) return reject(signal.reason);
    const onAbort = () => reject(signal.reason);
    signal.addEventListener('abort', onAbort, { once: true });
    promise.then(resolve, reject).finally(() => signal.removeEventListener('abort', onAbort));
  });
}

export async function fetchSnapshot(forumUrl: string, deps: FetchDeps): Promise<Snapshot> {
  const { fetchImpl, now, timeoutMs = 15_000 } = deps;
  const url = `${forumUrl}/latest.json`;
  const signal = AbortSignal.timeout(timeoutMs);
  try {
    const res = await abortable(fetchImpl(url, { headers: { accept: 'application/json' }, signal }), signal);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const text = await abortable(res.text(), signal);
    let body: unknown;
    try {
      body = JSON.parse(text);
    } catch {
      throw new Error('response is not valid JSON');
    }
    const topics = parseLatest(body);
    return { schemaVersion: 1, forumUrl, fetchedAt: now().toISOString(), topics };
  } catch (err) {
    const reason = signal.aborted ? `timed out after ${timeoutMs}ms` : (err as Error).message;
    throw new Error(`fetch ${url}: ${reason}`);
  }
}
