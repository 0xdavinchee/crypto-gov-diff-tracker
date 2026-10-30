import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { loadConfig, normalizeForumUrl } from '../src/config.js';
import { tempDir } from './support/helpers.js';

async function configFile(content: string): Promise<string> {
  const path = join(await tempDir(), 'forums.json');
  await writeFile(path, content);
  return path;
}

describe('normalizeForumUrl', () => {
  it.each([
    ['https://gov.uniswap.org/', 'https://gov.uniswap.org'],
    ['https://Example.COM/forum//', 'https://example.com/forum'],
    ['http://example.com:8080/sub/path', 'http://example.com:8080/sub/path'],
  ])('normalizes %s', (raw, expected) => {
    expect(normalizeForumUrl(raw)).toBe(expected);
  });

  it.each(['gov.uniswap.org', 'ftp://example.com', 'https://u:p@example.com', 'https://example.com/?a=1', 'https://example.com/#x', 'https://example.com?'])(
    'rejects %s',
    (raw) => {
      expect(() => normalizeForumUrl(raw)).toThrow();
    },
  );
});

describe('loadConfig', () => {
  it('returns normalized URLs in config order', async () => {
    const path = await configFile('["https://b.example/", "https://a.example/sub"]');
    expect(await loadConfig(path)).toEqual(['https://b.example', 'https://a.example/sub']);
  });

  it.each([
    ['empty array', '[]'],
    ['object', '{"forums": []}'],
    ['invalid JSON', '[nope'],
    ['non-string entry', '["https://a.example", 3]'],
    ['duplicate after normalization', '["https://a.example", "https://a.example/"]'],
  ])('rejects %s', async (_name, content) => {
    await expect(loadConfig(await configFile(content))).rejects.toThrow();
  });

  it('rejects a missing file with its path', async () => {
    const path = join(await tempDir(), 'missing.json');
    await expect(loadConfig(path)).rejects.toThrow(path);
  });
});
