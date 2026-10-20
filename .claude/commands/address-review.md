---
description: Address review comments on a PR
argument-hint: <pr-number> [Claude Code review finding numbers to fix]
---

Read `gh pr view $ARGUMENTS --comments` and the latest review. Follow the "When addressing review" section of `docs/agents/implement.md`. Work in the PR's existing worktree under `.worktrees/`.
A `Review (Claude Code)` comment is not a review round. Fix its findings only if the human listed their numbers in the arguments; ignore the rest.
