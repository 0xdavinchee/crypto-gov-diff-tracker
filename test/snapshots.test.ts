import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { loadSnapshot, saveSnapshot, snapshotPath } from '../src/snapshots.js';
import type { Snapshot } from '../src/types.js';
import { listDir, tempDir, topic } from './support/helpers.js';

const FORUM = 'https://f.example';
const snap: Snapshot = { schemaVersion: 1, forumUrl: FORUM, fetchedAt: '2026-10-30T12:00:00.000Z', topics: [topic(1, 2)] };

describe('snapshots', () => {
  it('returns null when no snapshot exists, without creating the state dir', async () => {
    const stateDir = join(await tempDir(), 'state');
    expect(await loadSnapshot(stateDir, FORUM)).toBeNull();
    expect(await listDir(stateDir)).toBeNull();
  });

  it('round-trips a snapshot through a sha256-named file and leaves no temp files', async () => {
    const stateDir = join(await tempDir(), 'nested', 'state');
    await saveSnapshot(stateDir, snap);
    expect(await loadSnapshot(stateDir, FORUM)).toEqual(snap);
    expect(snapshotPath(stateDir, FORUM)).toMatch(/[0-9a-f]{64}\.json$/);
    expect(await listDir(stateDir)).toHaveLength(1);
  });

  it('keeps forums on different subpaths apart', () => {
    expect(snapshotPath('/s', 'https://f.example/a')).not.toBe(snapshotPath('/s', 'https://f.example/b'));
  });

  const invalid: Array<[string, unknown]> = [
    ['wrong schema version', { ...snap, schemaVersion: 2 }],
    ['wrong forum URL', { ...snap, forumUrl: 'https://other.example' }],
    ['non-UTC timestamp', { ...snap, fetchedAt: '2026-10-30T12:00:00+02:00' }],
    ['duplicate topic IDs', { ...snap, topics: [topic(1, 2), topic(1, 3)] }],
    ['bad topic count', { ...snap, topics: [topic(1, 0)] }],
  ];
  it.each(invalid)('treats a snapshot with %s as a failure, not a fresh baseline', async (_name, data) => {
    const stateDir = await tempDir();
    await writeFile(snapshotPath(stateDir, FORUM), JSON.stringify(data));
    await expect(loadSnapshot(stateDir, FORUM)).rejects.toThrow(snapshotPath(stateDir, FORUM));
  });

  it('treats corrupt JSON as a failure', async () => {
    const stateDir = await tempDir();
    await writeFile(snapshotPath(stateDir, FORUM), '{"schemaVersion":');
    await expect(loadSnapshot(stateDir, FORUM)).rejects.toThrow(/invalid snapshot/);
  });

  it('treats an unreadable snapshot path as a failure', async () => {
    const stateDir = await tempDir();
    await mkdir(snapshotPath(stateDir, FORUM));
    await expect(loadSnapshot(stateDir, FORUM)).rejects.toThrow(/cannot read snapshot/);
  });

  it('keeps the previous file intact and cleans up when the replace fails', async () => {
    const stateDir = await tempDir();
    const path = snapshotPath(stateDir, FORUM);
    await mkdir(path); // rename over a directory fails
    await writeFile(join(path, 'keep'), 'x');
    await expect(saveSnapshot(stateDir, snap)).rejects.toThrow(path);
    expect(await listDir(stateDir)).toEqual([path.split('/').pop()]);
    expect(await readFile(join(path, 'keep'), 'utf8')).toBe('x');
  });
});
