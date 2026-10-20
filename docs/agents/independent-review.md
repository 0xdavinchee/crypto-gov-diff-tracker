# Stage: independent review (one PR, round 1)

1. Follow steps 1-5 of `docs/agents/review.md` exactly, with the same inputs, rubric and finding format. Ignore any review starting `Round N/2`: it is another reviewer's and must not shape yours. If one already exists, stop and tell the human.
2. Instead of `review.md` step 6, save the review to `~/Documents/vault/pipeline/reviews/<repo>/pr-<n>-claude.md` (create the folder). First line: `Review (Claude Code): APPROVE` or `Review (Claude Code): CHANGES REQUESTED`. Number the findings. Tell the human it is saved.
3. Post only when the human asks: `gh pr comment <n> --body-file <saved file>`.
4. Never push commits to the PR branch. The implementer fixes.
