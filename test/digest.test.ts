import { describe, expect, it } from 'vitest';
import { renderDigest } from '../src/digest.js';
import { topic } from './support/helpers.js';

describe('renderDigest', () => {
  it('renders ok, baseline, no-change and failed sections in order', () => {
    const out = renderDigest([
      {
        forumUrl: 'https://forum.arbitrum.foundation',
        status: 'ok',
        diff: {
          forumUrl: 'https://forum.arbitrum.foundation',
          baseline: false,
          changes: [
            { kind: 'new', topic: { id: 123, title: 'Example proposal', slug: 'example-proposal', postsCount: 1 }, newPosts: 1 },
            { kind: 'updated', topic: { id: 456, title: 'Example discussion', slug: 'example-discussion', postsCount: 9 }, newPosts: 3 },
          ],
        },
      },
      { forumUrl: 'https://gov.uniswap.org', status: 'ok', diff: { forumUrl: 'https://gov.uniswap.org', baseline: false, changes: [] } },
      { forumUrl: 'https://new.example', status: 'ok', diff: { forumUrl: 'https://new.example', baseline: true, changes: [] } },
      { forumUrl: 'https://governance.aave.com', status: 'failed', message: 'HTTP 500' },
    ]);
    expect(out).toBe(`# Governance changes

Coverage: latest page only.

## https://forum.arbitrum.foundation

- [Example proposal](https://forum.arbitrum.foundation/t/example-proposal/123) (new topic; +1 post)
- [Example discussion](https://forum.arbitrum.foundation/t/example-discussion/456) (updated; +3 posts)

## https://gov.uniswap.org

No changes.

## https://new.example

Baseline captured.

## https://governance.aave.com

Failed; see stderr.
`);
  });

  it('keeps hostile titles and slugs from creating extra Markdown structure or HTML', () => {
    const hostile = { ...topic(1, 2), title: 'Evil](https://x.example)\n## Fake heading <script>*', slug: 'a) b/c' };
    const out = renderDigest([
      { forumUrl: 'https://f.example', status: 'ok', diff: { forumUrl: 'https://f.example', baseline: false, changes: [{ kind: 'new', topic: hostile, newPosts: 2 }] } },
    ]);
    const bullet = out.split('\n').find((l) => l.startsWith('- '))!;
    expect(out.split('\n').filter((l) => l.startsWith('#'))).toHaveLength(2);
    expect(out).not.toContain('<script>');
    expect(bullet).toBe(
      '- [Evil\\](https://x.example) ## Fake heading &lt;script&gt;\\*](https://f.example/t/a%29%20b%2Fc/1) (new topic; +2 posts)',
    );
  });
});
