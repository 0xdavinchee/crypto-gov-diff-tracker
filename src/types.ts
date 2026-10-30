export type Topic = {
  id: number;
  title: string;
  slug: string;
  postsCount: number;
};

export type Snapshot = {
  schemaVersion: 1;
  forumUrl: string;
  fetchedAt: string;
  topics: Topic[];
};

export type Change = {
  kind: 'new' | 'updated';
  topic: Topic;
  newPosts: number;
};

export type Diff = {
  forumUrl: string;
  baseline: boolean;
  changes: Change[];
};

export type ForumResult =
  | { forumUrl: string; status: 'ok'; diff: Diff }
  | { forumUrl: string; status: 'failed'; message: string };

export type Writer = (text: string) => Promise<void>;
