import { spawnSync, type SpawnSyncOptions } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const repoRoot = resolve(fileURLToPath(new URL('../..', import.meta.url)));
export const networkGuardPath = join(repoRoot, 'test/support/network-guard.ts');

export type RunResult = { status: number | null; stdout: string; stderr: string };

export function makeTempDir(prefix = 'gov-diff-test-'): string {
  return mkdtempSync(join(tmpdir(), prefix));
}

// npm must not touch the user's cache or print update notices from inside tests.
export function npmEnv(cacheDir: string): NodeJS.ProcessEnv {
  return {
    ...process.env,
    npm_config_cache: cacheDir,
    npm_config_update_notifier: 'false',
    npm_config_fund: 'false',
    npm_config_audit: 'false',
  };
}

export function run(command: string, args: string[], options: SpawnSyncOptions = {}): RunResult {
  const result = spawnSync(command, args, { encoding: 'utf8', timeout: 60_000, ...options });
  if (result.error) throw result.error;
  return {
    status: result.status,
    stdout: String(result.stdout),
    stderr: String(result.stderr),
  };
}
