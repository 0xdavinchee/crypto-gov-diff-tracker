import { spawnSync } from 'node:child_process';
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { Writable } from 'node:stream';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { streamWriter } from '../src/cli.js';
import { listDir, tempDir } from './support/helpers.js';

// These run the built output; `npm run build` must run first (CI does).
const ROOT = fileURLToPath(new URL('..', import.meta.url));
const CLI = join(ROOT, 'dist', 'cli.js');
const node = (args: string[], opts: { cwd: string; input?: string }) =>
  spawnSync(process.execPath, args, { ...opts, encoding: 'utf8', timeout: 20_000 });

describe('executable', () => {
  it('prints help via node dist/cli.js with no config or state', async () => {
    const cwd = await tempDir();
    const r = node([CLI, '--help'], { cwd });
    expect(r.status).toBe(0);
    expect(r.stdout).toMatch(/^Usage: crypto-gov-diff-tracker/);
    expect(await listDir(cwd)).toEqual([]);
  });

  it('exits 1 on an unknown option', async () => {
    const r = node([CLI, '--bogus'], { cwd: await tempDir() });
    expect(r.status).toBe(1);
    expect(r.stderr).toMatch(/bogus/);
  });

  it('prints help via npx --offline --package .', async () => {
    const cache = await tempDir();
    const r = spawnSync('npx', ['--offline', '--package', '.', 'crypto-gov-diff-tracker', '--help'], {
      cwd: ROOT,
      encoding: 'utf8',
      timeout: 60_000,
      env: { ...process.env, npm_config_cache: cache, npm_config_update_notifier: 'false' },
    });
    expect(r.status).toBe(0);
    expect(r.stdout).toMatch(/^Usage: crypto-gov-diff-tracker/);
  });

  it.each([
    ['a script file', async (cwd: string) => {
      await writeFile(join(cwd, 'importer.mjs'), `await import(${JSON.stringify(CLI)});`);
      return node(['importer.mjs', 'arg'], { cwd });
    }],
    ['stdin', async (cwd: string) => node(['--input-type=module', '-', 'arg'], { cwd, input: `await import(${JSON.stringify(CLI)});` })],
    ['eval with arguments', async (cwd: string) => node(['--input-type=module', '-e', `await import(${JSON.stringify(CLI)});`, 'arg'], { cwd })],
  ])('does not run when imported from %s', async (_n, spawn) => {
    const cwd = await tempDir();
    const r = await spawn(cwd);
    expect({ status: r.status, stdout: r.stdout, stderr: r.stderr }).toEqual({ status: 0, stdout: '', stderr: '' });
  });
});

describe('streamWriter', () => {
  function fakeStream() {
    let finish!: (err?: Error | null) => void;
    const stream = new Writable({
      write(_chunk, _enc, cb) {
        finish = cb;
      },
    });
    return { stream, finish: (err?: Error) => finish(err ?? null) };
  }

  it('resolves only after the write callback completes', async () => {
    const { stream, finish } = fakeStream();
    let settled = false;
    const p = streamWriter(stream)('hello').then(() => (settled = true));
    await new Promise((r) => setTimeout(r, 10));
    expect(settled).toBe(false);
    finish();
    await p;
    expect(settled).toBe(true);
  });

  it('rejects on an asynchronous write error such as EPIPE', async () => {
    const { stream, finish } = fakeStream();
    stream.on('error', () => {});
    const p = streamWriter(stream)('hello');
    finish(Object.assign(new Error('write EPIPE'), { code: 'EPIPE' }));
    await expect(p).rejects.toThrow(/EPIPE/);
  });
});
