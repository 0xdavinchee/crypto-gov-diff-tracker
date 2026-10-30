import { describe, expect, it } from 'vitest';
import { diffSnapshots } from '../src/diff.js';
import type { Snapshot, Topic } from '../src/types.js';
import { topic } from './support/helpers.js';

const snap = (topics: Topic[], forumUrl = 'https://f.example'): Snapshot => ({
  schemaVersion: 1,
  forumUrl,
  fetchedAt: '2026-10-30T00:00:00.000Z',
  topics,
});

describe('diffSnapshots', () => {
  it('treats a missing previous snapshot as a baseline with no changes', () => {
    expect(diffSnapshots(null, snap([topic(1, 3)]))).toEqual({ forumUrl: 'https://f.example', baseline: true, changes: [] });
  });

  it('reports new IDs with their full count and updated IDs with the exact positive delta, sorted by ID', () => {
    const prev = snap([topic(5, 2), topic(9, 4)]);
    const curr = snap([topic(9, 7), topic(12, 1), topic(3, 6), topic(5, 2)]);
    expect(diffSnapshots(prev, curr).changes).toEqual([
      { kind: 'new', topic: topic(3, 6), newPosts: 6 },
      { kind: 'updated', topic: topic(9, 7), newPosts: 3 },
      { kind: 'new', topic: topic(12, 1), newPosts: 1 },
    ]);
  });

  it('emits nothing for identical, lower-count, title/slug-only and missing topics', () => {
    const prev = snap([topic(1, 3), topic(2, 5), topic(3, 2, 'Old title'), topic(4, 1)]);
    const curr = snap([topic(1, 3), topic(2, 4), { ...topic(3, 2, 'New title'), slug: 'renamed' }]);
    expect(diffSnapshots(prev, curr)).toEqual({ forumUrl: 'https://f.example', baseline: false, changes: [] });
  });

  it('uses the current title and slug for an updated topic', () => {
    const curr = snap([{ id: 1, title: 'Renamed', slug: 'renamed', postsCount: 4 }]);
    expect(diffSnapshots(snap([topic(1, 1)]), curr).changes[0]?.topic).toEqual(curr.topics[0]);
  });

  it('reports a topic that left the page and came back as new', () => {
    const left = diffSnapshots(snap([topic(1, 2), topic(2, 2)]), snap([topic(2, 2)]));
    expect(left.changes).toEqual([]);
    const back = diffSnapshots(snap([topic(2, 2)]), snap([topic(1, 3), topic(2, 2)]));
    expect(back.changes).toEqual([{ kind: 'new', topic: topic(1, 3), newPosts: 3 }]);
  });

  it('rejects comparing different forums', () => {
    expect(() => diffSnapshots(snap([], 'https://a.example'), snap([], 'https://b.example'))).toThrow();
  });

  it('does not mutate its inputs or alias their topics', () => {
    const prev = snap([topic(2, 1)]);
    const curr = snap([topic(3, 1), topic(2, 4)]);
    const before = structuredClone([prev, curr]);
    const diff = diffSnapshots(prev, curr);
    expect([prev, curr]).toEqual(before);
    diff.changes[0]!.topic.title = 'changed';
    expect(curr.topics[1]!.title).toBe('Topic 2');
  });
});
