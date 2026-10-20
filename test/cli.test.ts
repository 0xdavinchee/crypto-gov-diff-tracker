import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import { makeTempDir, networkGuardPath, npmEnv, repoRoot, run } from './support/process.js';

const cliPath = join(repoRoot, 'dist/cli.js');
const usage = /Usage: crypto-gov-diff-tracker/;
// Every subprocess loads the same network guard the test workers use.
const nodeFlags = ['--disable-warning=ExperimentalWarning', `--import=${networkGuardPath}`];

function runNode(args: string[], cwd: string) {
  return run(process.execPath, [...nodeFlags, cliPath, ...args], { cwd });
}

describe('built CLI executable', () => {
  beforeAll(() => {
    expect(existsSync(cliPath), 'run `npm run build` before `npm test`').toBe(true);
  });

  it('prints usage for --help and exits 0 without touching config or state', () => {
    const cwd = makeTempDir();

    const result = runNode(['--help'], cwd);

    expect(result.status).toBe(0);
    expect(result.stdout).toMatch(usage);
    expect(result.stdout).toMatch(/--config <path>/);
    expect(result.stdout).toMatch(/--state-dir <path>/);
    expect(result.stderr).toBe('');
    expect(readdirSync(cwd)).toEqual([]);
  });

  it('runs --help through offline npx from the local package', () => {
    const cwd = makeTempDir();
    const cache = makeTempDir('gov-diff-npm-cache-');

    const result = run(
      'npx',
      ['--offline', '--yes', '--package', repoRoot, 'crypto-gov-diff-tracker', '--help'],
      { cwd, env: { ...npmEnv(cache), NODE_OPTIONS: nodeFlags.join(' ') } },
    );

    expect(result.stderr).toBe('');
    expect(result.status).toBe(0);
    expect(result.stdout).toMatch(usage);
    expect(readdirSync(cwd)).toEqual([]);
  });

  it.each([
    [['--bogus'], /--bogus/],
    [['run-now'], /run-now/],
    [['--config'], /--config/],
    [['--state-dir'], /--state-dir/],
  ])('rejects invalid arguments %j with exit 1', (args, mention) => {
    const cwd = makeTempDir();

    const result = runNode(args, cwd);

    expect(result.status).toBe(1);
    expect(result.stdout).toBe('');
    expect(result.stderr).toMatch(mention);
    expect(result.stderr).toMatch(usage);
    expect(readdirSync(cwd)).toEqual([]);
  });

  it('is wired as the package bin with a node shebang', () => {
    const pkg = JSON.parse(readFileSync(join(repoRoot, 'package.json'), 'utf8'));

    expect(pkg.bin).toEqual({ 'crypto-gov-diff-tracker': 'dist/cli.js' });
    expect(readFileSync(cliPath, 'utf8').split('\n')[0]).toBe('#!/usr/bin/env node');
  });

  it('does nothing when imported as a module', () => {
    const cwd = makeTempDir();

    const result = run(
      process.execPath,
      [...nodeFlags, '--input-type=module', '-e', `await import(${JSON.stringify(cliPath)});`],
      { cwd },
    );

    expect(result).toEqual({ status: 0, stdout: '', stderr: '' });
    expect(readdirSync(cwd)).toEqual([]);
  });
});
