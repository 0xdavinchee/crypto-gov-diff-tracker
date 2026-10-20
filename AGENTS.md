# AGENTS.md

Single source of truth for every agent working in this repo (Codex reads this file, Claude Code reads it via `CLAUDE.md`). If you learn something that should change how agents work here, propose an edit to this file in your PR.

## Roles

| Stage | Who | Prompt | Output |
|---|---|---|---|
| Spec | Codex | `docs/agents/spec.md` | Questions first, then a PR adding `docs/SPEC.md`, label `spec` |
| Spec review | Claude Code | `docs/agents/spec-review.md` (`/review-spec <n>`) | Line comments on the spec PR; then the human reviews and merges |
| Breakdown | Codex | `docs/agents/breakdown.md` | Issues with acceptance tests; scaffold first (`ready`), the rest `blocked` until their deps merge |
| Implement | Claude Code | `docs/agents/implement.md` (`/work-issue <n>`) | One branch + PR per issue, label `in-review` |
| Independent review | Claude Code | `docs/agents/independent-review.md` (`/independent-review <n>`) | Round-1 review of the same PR, saved to the vault, posted as a comment when the human asks |
| Review | Codex | `docs/agents/review.md` | PR review, max 2 rounds |
| Merge | Human | | Squash merge once CI is green |

The human routes work between agents. Do not start a stage you were not asked to start.

## Labels are state

- `spec`: spec PR open for comment. Merge = approval.
- `ready`: issue has acceptance tests and no unmet dependencies. Safe to pick up.
- `in-progress`: an agent is implementing it. One agent per issue.
- `in-review`: PR open, waiting for review.
- `needs-human`: blocked on a decision, or review hit the 2-round cap. Stop and say why in a comment.
- `blocked`: depends on another open issue (link it).

Move labels as you go: `gh issue edit <n> --add-label in-progress --remove-label ready`.

## Rules

1. **Tests first, always.** Before any implementation, write the issue's acceptance tests, run them, see them fail, and commit them as their own `test:` commit. Implementation commits come after. Tests check behavior through public interfaces, cover at least one failure case per acceptance test, and must fail if the code is wrong. A PR without them, or with tests written after the code, is not done, regardless of how the code looks. Only exception: on the stack-setup issue, one `chore:` commit adding the test runner may come before the `test:` commit.
2. **CI is the gate.** The `ci` check must pass. Never disable, skip, or weaken a check or test to get green. If a check is wrong, say so in the PR and label `needs-human`.
3. **Scope.** Implement exactly the issue. Unrelated problems you notice go in a new issue, not this PR.
4. **Review cap.** Max 2 review rounds per PR. After round 2, remaining disagreements go to the human with label `needs-human`.
5. **Commits.** Conventional commits (`feat:`, `fix:`, `test:`, `docs:`, `chore:`, `refactor:`), small and frequent. Commits are GPG-signed; if signing fails, stop and tell the human instead of disabling it.
6. **No secrets** in code, logs, issues, or PR text.
7. **Search before claiming.** Verify library and API details against current docs before using them.

## Review rubric (in priority order)

1. Correctness: does it do what the issue says, including edge cases?
2. Matches the spec and the issue's acceptance tests.
3. Tests: do they test behavior, and would they fail if the code were wrong?
4. Security: input handling, secrets, auth, key material.
5. Simplicity: unnecessary abstraction or dependencies.

Style nits that a linter could catch are not review findings.

## Knowledge vault

Project note: `~/Documents/vault/pipeline/projects/<repo-name>.md`. Read it at session start. Pipeline-wide lessons: `~/Documents/vault/pipeline/learnings.md`. When something goes wrong in a way that will recur, append one line to `learnings.md` (date, repo, what happened, the rule that would have prevented it).

## Project specifics

The v0 contract is in `docs/SPEC.md`. These commands and conventions are requirements for the implementation stages; this spec PR does not add the scaffold.

- **Stack:** Node.js 24.x LTS, npm 11.x, strict TypeScript with ESM/NodeNext, Vitest, and GitHub Actions. Initial verified development versions: TypeScript 7.0.2, Vitest 5.0.5, and `@types/node` 24.19.2. Commit the npm lockfile. Use Node built-ins and no runtime dependencies.
- **Setup:** `npm ci` after the scaffold exists. `npm run build` typechecks source and tests and emits runtime JavaScript into `dist/`.
- **Tests:** `npm test` runs `vitest run`. The `ci` job runs `npm ci`, `npm run build`, and `npm test` on pull requests and pushes to `main`. No forum requests or other network calls in tests, including localhost; inject fixture-backed fetch responses and use temporary directories for state.
- **Run:** `node dist/cli.js` or `npx --offline --package . crypto-gov-diff-tracker` from the built checkout. Defaults: `./forums.json` and `./.gov-diff/`, relative to the invocation directory; override with `--config` and `--state-dir`. No registry publication in v0.
- **Conventions:** Small functions with separate config, Discourse, diff, snapshot, digest, and CLI units. Shared `Topic`, `Snapshot`, and `Diff` contracts follow the spec. Pure diff/render functions; inject fetch, clock (`now: () => Date`), cwd, and output streams at the CLI boundary. Resolve paths against the injected absolute cwd; tests must not call `process.chdir()`. Fetch timeout defaults to 15 seconds, with an internal `timeoutMs` override for short real-timer tests of both request and body-read aborts. Importing a module must not run the CLI.
- **Data and output:** Fetch only the first default latest page per forum. Baseline-only first run. One URL-keyed JSON snapshot per forum, replaced through a temporary sibling and rename. Preserve state on failures; continue other forums and exit nonzero. Markdown goes to stdout, diagnostics to stderr. Include the latest-page coverage limit. Ignore local snapshots, generated output, and dependencies in git.
- **Delivery boundary:** v0 runs manually and locally with no secrets, database, LLM, Telegram, scheduling, or agent delivery. Those require later scoped work; do not add extension infrastructure for them now.
