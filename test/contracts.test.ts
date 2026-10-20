import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { makeTempDir, repoRoot, run } from './support/process.js';

const typesPath = join(repoRoot, 'src/types.js');
const header = `import type { Diff, ForumResult, Snapshot, Topic } from ${JSON.stringify(typesPath)};\n`;

const topic = `{ id: 1, title: 'Proposal', slug: 'proposal', postsCount: 2 }`;

const files: Record<string, string> = {
  'accepted.ts': `
const topic: Topic = ${topic};
const snapshot: Snapshot = {
  schemaVersion: 1,
  forumUrl: 'https://forum.example',
  fetchedAt: '2026-10-21T00:00:00.000Z',
  topics: [topic],
};
const diff: Diff = {
  forumUrl: snapshot.forumUrl,
  baseline: false,
  changes: [
    { kind: 'new', topic, newPosts: 2 },
    { kind: 'updated', topic, newPosts: 1 },
  ],
};
const results: ForumResult[] = [
  { forumUrl: diff.forumUrl, status: 'ok', diff },
  { forumUrl: diff.forumUrl, status: 'failed', message: 'HTTP 500' },
];
export function describeResult(result: ForumResult): string {
  return result.status === 'ok' ? String(result.diff.changes.length) : result.message;
}
export const ids: number[] = snapshot.topics.map((t) => t.id);
export const titles: string[] = diff.changes.map((c) => c.topic.title + c.kind + c.newPosts);
export const all = results.map(describeResult);
`,
  'wrong-schema-version.ts': `
export const snapshot: Snapshot = {
  schemaVersion: 2,
  forumUrl: 'https://forum.example',
  fetchedAt: '2026-10-21T00:00:00.000Z',
  topics: [],
};
`,
  'invalid-change-kind.ts': `
const topic: Topic = ${topic};
export const diff: Diff = {
  forumUrl: 'https://forum.example',
  baseline: false,
  changes: [{ kind: 'deleted', topic, newPosts: 0 }],
};
`,
  'failed-without-message.ts': `
export const result: ForumResult = { forumUrl: 'https://forum.example', status: 'failed' };
`,
};

function typecheck(): Map<string, string[]> {
  const dir = makeTempDir('gov-diff-contracts-');
  for (const [name, body] of Object.entries(files)) writeFileSync(join(dir, name), header + body);
  writeFileSync(
    join(dir, 'tsconfig.json'),
    JSON.stringify({
      compilerOptions: {
        strict: true,
        noEmit: true,
        module: 'nodenext',
        moduleResolution: 'nodenext',
        target: 'es2024',
        types: [],
        skipLibCheck: true,
      },
      files: Object.keys(files),
    }),
  );
  const result = run(process.execPath, [join(repoRoot, 'node_modules/typescript/bin/tsc'), '-p', dir, '--pretty', 'false']);
  const errors = new Map<string, string[]>(Object.keys(files).map((name) => [name, []]));
  for (const line of result.stdout.split('\n')) {
    const match = /^(.+?)\(\d+,\d+\): error (TS\d+: .*)$/.exec(line.trim());
    if (!match) continue;
    const name = Object.keys(files).find((file) => match[1]!.endsWith(file)) ?? '(other)';
    errors.set(name, [...(errors.get(name) ?? []), match[2]!]);
  }
  return errors;
}

describe('shared contracts', () => {
  const errors = typecheck();

  it('accept the exact spec shapes and discriminants', () => {
    expect(errors.get('accepted.ts')).toEqual([]);
    expect(errors.get('(other)')).toBeUndefined();
  });

  it.each(['wrong-schema-version.ts', 'invalid-change-kind.ts', 'failed-without-message.ts'])(
    'reject %s',
    (name) => {
      expect(errors.get(name)).not.toEqual([]);
      expect(errors.get(name)!.some((message) => /Cannot find module/.test(message))).toBe(false);
    },
  );
});
