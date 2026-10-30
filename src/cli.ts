#!/usr/bin/env node
import { resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { loadConfig } from './config.js';
import { renderDigest } from './digest.js';
import { diffSnapshots } from './diff.js';
import { fetchSnapshot } from './discourse.js';
import { loadSnapshot, saveSnapshot } from './snapshots.js';
import type { ForumResult, Snapshot, Writer } from './types.js';

export type CliDeps = {
  fetchImpl: typeof fetch;
  now: () => Date;
  cwd: string;
  stdout: Writer;
  stderr: Writer;
};

export const USAGE = `Usage: crypto-gov-diff-tracker [--config <path>] [--state-dir <path>]

Prints a Markdown digest of new and updated topics on Discourse forums since the last run.

Options:
  --config <path>     JSON array of forum base URLs (default: ./forums.json)
  --state-dir <path>  Directory for snapshots (default: ./.gov-diff)
  --help              Show this help
`;

// Writers may throw synchronously or reject; either way the caller gets a rejected promise.
async function write(writer: Writer, text: string): Promise<void> {
  await writer(text);
}

export async function runCli(argv: string[], deps: CliDeps): Promise<0 | 1> {
  const report = (msg: string) => write(deps.stderr, `${msg}\n`).catch(() => {});
  try {
    let values;
    try {
      ({ values } = parseArgs({
        args: argv,
        options: {
          config: { type: 'string' },
          'state-dir': { type: 'string' },
          help: { type: 'boolean' },
        },
        strict: true,
        allowPositionals: false,
      }));
    } catch (err) {
      await report(`${(err as Error).message}\n\n${USAGE}`);
      return 1;
    }
    if (values.help) {
      await write(deps.stdout, USAGE);
      return 0;
    }

    const configPath = resolve(deps.cwd, values.config ?? 'forums.json');
    const stateDir = resolve(deps.cwd, values['state-dir'] ?? '.gov-diff');
    let forums: string[];
    try {
      forums = await loadConfig(configPath);
    } catch (err) {
      await report((err as Error).message);
      return 1;
    }

    let ok = true;
    const results: ForumResult[] = [];
    const pending: Snapshot[] = [];
    for (const forumUrl of forums) {
      try {
        const previous = await loadSnapshot(stateDir, forumUrl);
        const current = await fetchSnapshot(forumUrl, { fetchImpl: deps.fetchImpl, now: deps.now });
        results.push({ forumUrl, status: 'ok', diff: diffSnapshots(previous, current) });
        pending.push(current);
      } catch (err) {
        ok = false;
        const message = (err as Error).message;
        results.push({ forumUrl, status: 'failed', message });
        await report(`${forumUrl}: ${message}`);
      }
    }

    try {
      await write(deps.stdout, renderDigest(results));
    } catch (err) {
      await report(`output failed, no snapshots saved: ${(err as Error).message}`);
      return 1;
    }

    for (const snapshot of pending) {
      try {
        await saveSnapshot(stateDir, snapshot);
      } catch (err) {
        ok = false;
        await report(`${snapshot.forumUrl}: ${(err as Error).message}`);
      }
    }
    return ok ? 0 : 1;
  } catch (err) {
    await report(`unexpected error: ${(err as Error).stack ?? String(err)}`);
    return 1;
  }
}

// Resolves only once Node reports the chunk written; write()'s boolean is backpressure, not completion.
export function streamWriter(stream: NodeJS.WritableStream): Writer {
  return (text) =>
    new Promise((resolvePromise, reject) => {
      const onError = (err: Error) => reject(err);
      stream.once('error', onError);
      stream.write(text, (err) => {
        stream.off('error', onError);
        if (err) reject(err);
        else resolvePromise();
      });
    });
}

if (import.meta.main) {
  // A late EPIPE after the run has already failed must not crash with an unhandled error.
  process.stdout.on('error', () => {});
  process.exitCode = await runCli(process.argv.slice(2), {
    fetchImpl: fetch,
    now: () => new Date(),
    cwd: process.cwd(),
    stdout: streamWriter(process.stdout),
    stderr: streamWriter(process.stderr),
  });
}
