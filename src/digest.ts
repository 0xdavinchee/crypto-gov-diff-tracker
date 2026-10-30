import type { Change, ForumResult } from './types.js';

// Single line, no HTML, and no characters that open Markdown structure inside a link label or heading.
export function escapeMarkdown(text: string): string {
  return text
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/[\\`*_[\]]/g, '\\$&');
}

export function topicUrl(forumUrl: string, slug: string, id: number): string {
  return `${forumUrl}/t/${encodeURIComponent(slug)}/${id}`.replace(/[()]/g, (c) => (c === '(' ? '%28' : '%29'));
}

function renderChange(forumUrl: string, { kind, topic, newPosts }: Change): string {
  const label = kind === 'new' ? 'new topic' : 'updated';
  const posts = `+${newPosts} ${newPosts === 1 ? 'post' : 'posts'}`;
  return `- [${escapeMarkdown(topic.title)}](${topicUrl(forumUrl, topic.slug, topic.id)}) (${label}; ${posts})`;
}

function renderBody(result: ForumResult): string {
  if (result.status === 'failed') return 'Failed; see stderr.';
  const { diff } = result;
  if (diff.baseline) return 'Baseline captured.';
  if (diff.changes.length === 0) return 'No changes.';
  return diff.changes.map((c) => renderChange(diff.forumUrl, c)).join('\n');
}

export function renderDigest(results: ForumResult[]): string {
  const sections = results.map((r) => `## ${escapeMarkdown(r.forumUrl)}\n\n${renderBody(r)}`);
  return ['# Governance changes', 'Coverage: latest page only.', ...sections].join('\n\n') + '\n';
}
