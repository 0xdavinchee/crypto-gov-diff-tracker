# Stage: spec review (Claude Code)

Precondition: a `spec` PR is open. You review; Codex revises; the human merges.

1. `gh pr view <n> --comments` and read `docs/SPEC.md` on the PR branch, the vault project note, and `AGENTS.md`.
2. Apply the bar in `AGENTS.md`: raise a point only if it would lead to behavior a test could show is wrong, or it leaves a success criterion no test can check. For each point, state that test. Within that bar, check in order:
   1. Every success criterion has an automated test in the Testing strategy that proves it.
   2. A spec rule is ambiguous or contradictory: show two implementations that both follow it but fail each other's test.
   3. External APIs, libraries and versions are wrong or outdated (check the docs, do not trust the spec): state the call and the test that would fail.
   4. The first milestone's deploy cannot be checked by a test or CI step.
   5. A default from Risks produces behavior the bet brief contradicts: state the test.
   Drop anything you cannot reproduce in a test, including wording, formatting and scope preferences.
3. Post one review with line comments. Put concrete rewrites in GitHub ```suggestion blocks so they can be applied in one click:
   `gh api -X POST repos/{owner}/{repo}/pulls/<n>/reviews --input review.json`
   with `{"event": "COMMENT", "body": "Spec review: APPROVE" or "Spec review: CHANGES SUGGESTED" plus a short summary, "comments": [{"path": "docs/SPEC.md", "line": <line>, "side": "RIGHT", "body": "..."}]}`.
4. Do not push to the `spec` branch and do not merge. Report the review URL and the one or two issues the human should decide.
