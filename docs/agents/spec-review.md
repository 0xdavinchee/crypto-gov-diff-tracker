# Stage: spec review (Claude Code)

Precondition: a `spec` PR is open. You review; Codex revises; the human merges.

1. `gh pr view <n> --comments` and read `docs/SPEC.md` on the PR branch, the vault project note, and `AGENTS.md`.
2. Review against this rubric, in order:
   1. Every success criterion is measurable and the Testing strategy names the automated test that proves it.
   2. Scope is small enough for the first milestone to ship; non-goals are explicit.
   3. Each architecture unit has one job and a stated interface.
   4. External APIs, libraries and versions are cited and current (check the docs, do not trust the spec).
   5. Deploy target is chosen and the first milestone actually deploys.
   6. Risks list the defaults Codex assumed from unanswered questions; flag any that look wrong.
   Skip wording and formatting nits.
3. Post one review with line comments. Put concrete rewrites in GitHub ```suggestion blocks so they can be applied in one click:
   `gh api -X POST repos/{owner}/{repo}/pulls/<n>/reviews --input review.json`
   with `{"event": "COMMENT", "body": "Spec review: APPROVE" or "Spec review: CHANGES SUGGESTED" plus a short summary, "comments": [{"path": "docs/SPEC.md", "line": <line>, "side": "RIGHT", "body": "..."}]}`.
4. Do not push to the `spec` branch and do not merge. Report the review URL and the one or two issues the human should decide.
