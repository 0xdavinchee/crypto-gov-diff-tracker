export type Topic = {
  id: number;
  title: string;
  slug: string;
  postsCount: number;
};

export type Snapshot = {
  schemaVersion: 1;
  forumUrl: string;
  fetchedAt: string; // UTC ISO 8601 time of the successful fetch.
  topics: Topic[];
};

export type Diff = {
  forumUrl: string;
  baseline: boolean;
  changes: Array<{
    kind: 'new' | 'updated';
    topic: Topic;
    newPosts: number;
  }>;
};

export type ForumResult =
  | { forumUrl: string; status: 'ok'; diff: Diff }
  | { forumUrl: string; status: 'failed'; message: string };
