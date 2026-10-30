import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { runCli, USAGE } from '../src/cli.js';
import { snapshotPath } from '../src/snapshots.js';
import type { Topic } from '../src/types.js';
import { capture, fakeFetch, latestBody, listDir, now, tempDir, topic } from './support/helpers.js';

const A = 'https://a.example';
const B = 'https://b.example/forum';
const C = 'https://c.example';

async function setup(forums: string[] = [A, B, C]) {
  const cwd = await tempDir();
  await writeFile(join(cwd, 'forums.json'), JSON.stringify(forums));
  return { cwd, stateDir: join(cwd, '.gov-diff') };
}

async function run(cwd: string, routes: Parameters<typeof fakeFetch>[0], opts: { argv?: string[]; stdout?: (t: string) => Promise<void> } = {}) {
  const out = capture();
  const err = capture();
  const fetch = fakeFetch(routes);
  const code = await runCli(opts.argv ?? [], { fetchImpl: fetch.impl, now, cwd, stdout: opts.stdout ?? out.writer, stderr: err.writer });
  return { code, stdout: out.text, stderr: err.text, calls: fetch.calls };
}

const pages = (a: Topic[], b: Topic[], c: Topic[]) => ({ [A]: latestBody(a), [B]: latestBody(b), [C]: latestBody(c) });
const page1 = pages([topic(1, 1), topic(2, 3)], [topic(10, 5)], []);
const page2 = pages([topic(1, 1), topic(2, 6), topic(3, 1)], [topic(10, 5)], []);
const read = (stateDir: string, forum: string) => readFile(snapshotPath(stateDir, forum), 'utf8');
const failing = () => new Response('nope', { status: 500 });

describe('runCli arguments', () => {
  it('prints help without reading config, fetching, or writing state', async () => {
    const cwd = await tempDir();
    const r = await run(cwd, {}, { argv: ['--help'] });
    expect(r).toMatchObject({ code: 0, stdout: USAGE, calls: [] });
    expect(await listDir(cwd)).toEqual([]);
  });

  it.each([[['--nope']], [['extra']], [['--config']]])('rejects %j before any fetch', async (argv) => {
    const { cwd } = await setup();
    const r = await run(cwd, page1, { argv });
    expect(r).toMatchObject({ code: 1, stdout: '', calls: [] });
    expect(r.stderr).not.toBe('');
  });

  it('rejects an invalid config before any fetch or write', async () => {
    const cwd = await tempDir();
    await writeFile(join(cwd, 'forums.json'), '["https://a.example", "https://a.example/"]');
    const r = await run(cwd, page1);
    expect(r).toMatchObject({ code: 1, stdout: '', calls: [] });
    expect(r.stderr).toMatch(/duplicate/);
    expect(await listDir(cwd)).toEqual(['forums.json']);
  });

  it('resolves default, relative and absolute paths against the injected cwd', async () => {
    const { cwd } = await setup([A]);
    await mkdir(join(cwd, 'conf'));
    await writeFile(join(cwd, 'conf', 'mine.json'), JSON.stringify([A]));
    const abs = join(await tempDir(), 'abs-state');

    await run(cwd, page1);
    await run(cwd, page1, { argv: ['--config', 'conf/mine.json', '--state-dir', 'rel-state'] });
    await run(cwd, page1, { argv: ['--state-dir', abs] });

    expect(await listDir(join(cwd, '.gov-diff'))).toHaveLength(1);
    expect(await listDir(join(cwd, 'rel-state'))).toHaveLength(1);
    expect(await listDir(abs)).toHaveLength(1);
  });
});

describe('runCli runs', () => {
  it('captures baselines, then reports nothing, then reports new and updated topics', async () => {
    const { cwd, stateDir } = await setup();

    const first = await run(cwd, page1);
    expect(first.code).toBe(0);
    expect(first.calls).toEqual([`${A}/latest.json`, `${B}/latest.json`, `${C}/latest.json`]);
    expect(first.stdout.match(/Baseline captured\./g)).toHaveLength(3);
    expect(first.stdout).not.toMatch(/^- /m);
    expect(JSON.parse(await read(stateDir, A))).toMatchObject({ forumUrl: A, fetchedAt: '2026-10-30T12:00:00.000Z' });

    const second = await run(cwd, page1);
    expect(second.code).toBe(0);
    expect(second.stdout.match(/No changes\./g)).toHaveLength(3);

    const third = await run(cwd, page2);
    expect(third.code).toBe(0);
    expect(third.stdout).toBe(`# Governance changes

Coverage: latest page only.

## https://a.example

- [Topic 2](https://a.example/t/topic-2/2) (updated; +3 posts)
- [Topic 3](https://a.example/t/topic-3/3) (new topic; +1 post)

## https://b.example/forum

No changes.

## https://c.example

No changes.
`);
    expect((await run(cwd, page2)).stdout).not.toMatch(/^- /m);
  });

  it('starts no save until the stdout write resolves', async () => {
    const { cwd, stateDir } = await setup();
    let release!: () => void;
    let written = '';
    const pending = new Promise<void>((r) => (release = r));
    const done = run(cwd, page1, {
      stdout: (t) => {
        written = t;
        return pending;
      },
    });
    await new Promise((r) => setTimeout(r, 20));
    expect(written).toMatch(/# Governance changes/);
    expect(await listDir(stateDir)).toBeNull();
    release();
    expect((await done).code).toBe(0);
    expect(await listDir(stateDir)).toHaveLength(3);
  });

  const outputFailures: Array<[string, (t: string) => Promise<void>]> = [
    ['throws synchronously', () => {
      throw new Error('boom');
    }],
    ['rejects with EPIPE after partial output', async () => {
      throw Object.assign(new Error('write EPIPE'), { code: 'EPIPE' });
    }],
  ];
  it.each(outputFailures)('saves nothing when the writer %s, and the changes are reported again on retry', async (_n, stdout) => {
    const { cwd, stateDir } = await setup();
    await run(cwd, page1);
    const before = await read(stateDir, A);

    const r = await run(cwd, page2, { stdout });
    expect(r.code).toBe(1);
    expect(r.stderr).toMatch(/output failed/);
    expect(await read(stateDir, A)).toBe(before);

    expect((await run(cwd, page2)).stdout).toMatch(/Topic 3.*new topic/);
  });

  it('leaves no baseline when first-run output fails, and captures it on retry', async () => {
    const { cwd, stateDir } = await setup();
    const r = await run(cwd, page1, { stdout: async () => Promise.reject(new Error('closed')) });
    expect(r.code).toBe(1);
    expect(await listDir(stateDir)).toBeNull();
    expect((await run(cwd, page1)).stdout.match(/Baseline captured\./g)).toHaveLength(3);
  });

  it('isolates a failing forum: failed section, its state kept, others saved, exit 1', async () => {
    const { cwd, stateDir } = await setup();
    await run(cwd, page1);
    const aBefore = await read(stateDir, A);

    const r = await run(cwd, { ...page2, [A]: failing });
    expect(r.code).toBe(1);
    expect(r.stdout).toMatch(/## https:\/\/a\.example\n\nFailed; see stderr\./);
    expect(r.stderr).toMatch(/https:\/\/a\.example.*HTTP 500/);
    expect(r.stdout).not.toMatch(/HTTP 500/);
    expect(await read(stateDir, A)).toBe(aBefore);
    expect(JSON.parse(await read(stateDir, B)).fetchedAt).toBeDefined();
  });

  it('fails a forum on a corrupt snapshot instead of resetting its baseline', async () => {
    const { cwd, stateDir } = await setup([A]);
    await mkdir(stateDir);
    await writeFile(snapshotPath(stateDir, A), 'not json');
    const r = await run(cwd, page1);
    expect(r.code).toBe(1);
    expect(r.stdout).toMatch(/Failed; see stderr\./);
    expect(await read(stateDir, A)).toBe('not json');
  });

  it('still writes the digest when every forum fails, saving nothing', async () => {
    const { cwd, stateDir } = await setup();
    const r = await run(cwd, { [A]: failing, [B]: failing, [C]: failing });
    expect(r.code).toBe(1);
    expect(r.stdout.match(/Failed; see stderr\./g)).toHaveLength(3);
    expect(await listDir(stateDir)).toBeNull();
  });
});
