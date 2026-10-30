import { createHash, randomUUID } from 'node:crypto';
import { mkdir, readFile, rename, unlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { Snapshot } from './types.js';
import { validateTopics } from './validate.js';

export function snapshotPath(stateDir: string, forumUrl: string): string {
  return join(stateDir, `${createHash('sha256').update(forumUrl).digest('hex')}.json`);
}

function validateSnapshot(data: unknown, forumUrl: string): Snapshot {
  const s = data as Partial<Snapshot> | null;
  if (typeof s !== 'object' || s === null) throw new Error('not an object');
  if (s.schemaVersion !== 1) {
    throw new Error(`unsupported schemaVersion ${String(s.schemaVersion)}; move the file aside for a fresh baseline`);
  }
  if (s.forumUrl !== forumUrl) throw new Error(`belongs to ${String(s.forumUrl)}, expected ${forumUrl}`);
  const fetchedAt = s.fetchedAt;
  if (typeof fetchedAt !== 'string' || !fetchedAt.endsWith('Z') || Number.isNaN(Date.parse(fetchedAt))) {
    throw new Error('fetchedAt is not a UTC ISO timestamp');
  }
  return { schemaVersion: 1, forumUrl, fetchedAt, topics: validateTopics(s.topics, 'postsCount') };
}

export async function loadSnapshot(stateDir: string, forumUrl: string): Promise<Snapshot | null> {
  const path = snapshotPath(stateDir, forumUrl);
  let text: string;
  try {
    text = await readFile(path, 'utf8');
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return null;
    throw new Error(`cannot read snapshot ${path}: ${(err as Error).message}`);
  }
  try {
    return validateSnapshot(JSON.parse(text), forumUrl);
  } catch (err) {
    throw new Error(`invalid snapshot ${path}: ${(err as Error).message}`);
  }
}

export async function saveSnapshot(stateDir: string, snapshot: Snapshot): Promise<void> {
  const path = snapshotPath(stateDir, snapshot.forumUrl);
  const tmp = `${path}.${randomUUID()}.tmp`;
  try {
    await mkdir(stateDir, { recursive: true });
    await writeFile(tmp, `${JSON.stringify(snapshot, null, 2)}\n`, 'utf8');
    await rename(tmp, path);
  } catch (err) {
    await unlink(tmp).catch(() => {});
    throw new Error(`cannot save snapshot ${path}: ${(err as Error).message}`);
  }
}
