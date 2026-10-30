import type { Change, Diff, Snapshot } from './types.js';

export function diffSnapshots(previous: Snapshot | null, current: Snapshot): Diff {
  if (previous && previous.forumUrl !== current.forumUrl) {
    throw new Error(`cannot compare ${previous.forumUrl} with ${current.forumUrl}`);
  }
  if (!previous) return { forumUrl: current.forumUrl, baseline: true, changes: [] };

  const before = new Map(previous.topics.map((t) => [t.id, t.postsCount]));
  const changes: Change[] = [];
  for (const topic of current.topics) {
    const old = before.get(topic.id);
    if (old === undefined) {
      changes.push({ kind: 'new', topic: { ...topic }, newPosts: topic.postsCount });
    } else if (topic.postsCount > old) {
      changes.push({ kind: 'updated', topic: { ...topic }, newPosts: topic.postsCount - old });
    }
  }
  changes.sort((a, b) => a.topic.id - b.topic.id);
  return { forumUrl: current.forumUrl, baseline: false, changes };
}
