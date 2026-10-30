import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { runCli } from '../src/cli.js';
import { snapshotPath } from '../src/snapshots.js';
import { capture, fakeFetch, latestBody, now, tempDir, topic } from './support/helpers.js';

const failRenameTo = vi.hoisted(() => ({ path: '' }));
vi.mock('node:fs/promises', async (importOriginal) => {
  const real = await importOriginal<typeof import('node:fs/promises')>();
  return {
    ...real,
    rename: async (from: string, to: string) => {
      if (to === failRenameTo.path) throw Object.assign(new Error('EACCES: simulated'), { code: 'EACCES' });
      return real.rename(from, to);
    },
  };
});

const A = 'https://a.example';
const B = 'https://b.example';

describe('runCli save failures', () => {
  it('reports a failed save only on stderr, keeps that forum, advances others, and repeats next run', async () => {
    const cwd = await tempDir();
    const stateDir = join(cwd, '.gov-diff');
    await writeFile(join(cwd, 'forums.json'), JSON.stringify([A, B]));
    const runOnce = async (pages: Record<string, unknown>) => {
      const out = capture();
      const err = capture();
      const writes: string[] = [];
      const code = await runCli([], {
        fetchImpl: fakeFetch(pages).impl,
        now,
        cwd,
        stdout: async (t) => {
          writes.push(t);
          await out.writer(t);
        },
        stderr: err.writer,
      });
      return { code, stdout: out.text, stderr: err.text, writes };
    };
    const v1 = { [A]: latestBody([topic(1, 1)]), [B]: latestBody([topic(5, 1)]) };
    const v2 = { [A]: latestBody([topic(1, 4)]), [B]: latestBody([topic(5, 2)]) };
    await runOnce(v1);
    const aBefore = await readFile(snapshotPath(stateDir, A), 'utf8');

    failRenameTo.path = snapshotPath(stateDir, A);
    const failed = await runOnce(v2);
    expect(failed.code).toBe(1);
    expect(failed.writes).toHaveLength(1);
    expect(failed.stdout).toMatch(/Topic 1.*updated; \+3 posts/);
    expect(failed.stdout).not.toMatch(/Failed|EACCES/);
    expect(failed.stderr).toContain(snapshotPath(stateDir, A));
    expect(await readFile(snapshotPath(stateDir, A), 'utf8')).toBe(aBefore);

    failRenameTo.path = '';
    const retry = await runOnce(v2);
    expect(retry.code).toBe(0);
    expect(retry.stdout).toMatch(/## https:\/\/a\.example\n\n- \[Topic 1\].*\+3 posts/);
    expect(retry.stdout).toMatch(/## https:\/\/b\.example\n\nNo changes\./);
  });
});
