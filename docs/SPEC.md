# Crypto governance diff tracker: v0

Status: proposed. Human merge of the spec PR approves this scope. This document specifies the product; it does not start implementation or issue breakdown.

## Problem and user

Checking governance forums separately takes time and makes changes hard to spot. The first user is the project owner, following Arbitrum, Uniswap, and Aave. Delegates and governance analysts are possible later users; v0 has no payment hypothesis.

The product is a manually invoked local CLI. It compares the latest public topic listings with local JSON snapshots and prints a linked Markdown digest. It reports observed activity, without judging importance. The bet is that this is useful enough to replace some manual forum checking.

The longer-term direction is to send context to a Telegram channel or somewhere an agent can inspect it and investigate further. That direction does not add delivery integrations, an agent interface, or post-body fetching to v0.

## Success criteria (measurable)

Technical criteria are automated acceptance requirements. The one-week product experiment is separate: passing CI does not prove usefulness.

| ID | Criterion | Evidence |
| --- | --- | --- |
| S1 | A fresh checkout on Node.js 24 can install from the lockfile, build TypeScript, and run all tests in a GitHub Actions check named `ci`. | Build and offline test harness in CI. |
| S2 | One saved Discourse response becomes the exact expected normalized topics; invalid required data fails the forum instead of silently dropping topics. | Fixture parser and fetch adapter tests, including malformed and HTTP failure cases. |
| S3 | Comparisons identify IDs absent from the previous snapshot and positive post-count increases exactly; unchanged, decreased, and missing topics produce no changes. | Table-driven diff tests with exact IDs, kinds, and counts. |
| S4 | A forum with no previous snapshot gets a saved baseline and no topic-change entries. The same response on the next run produces no changes. | Two invocations of the CLI runner against a temporary state directory. |
| S5 | A config containing three forums produces one ordered Markdown digest with forum headings, changed topic titles, post counts, and original-topic links. Snapshots persist independently across invocations. | CLI integration harness with two response sets, exact output assertions, and JSON reads from disk. |
| S6 | A failed forum leaves its previous snapshot untouched; other forums still save and render successfully. Any forum failure produces stderr diagnostics and exit code `1`. | Partial-failure integration tests, including network, corrupt state, and save failures. |
| S7 | The built package starts through both `node dist/cli.js` and `npx --offline --package . crypto-gov-diff-tracker`; `--help` exits `0` without config, network, or snapshot writes. | Subprocess smoke tests of both entry paths plus runner tests of argument handling. |
| V1 | During seven consecutive days following three forums, the owner voluntarily uses the digest on at least four distinct days and opens at least one useful topic link from it. | Manual dated tally of use days and useful links, kept privately; no app telemetry. |

After that week, reassess rather than add features if the owner still manually checks every forum or rarely finds useful changes. Record that qualitative verdict alongside V1. Evaluate pipeline success separately: did this small scope ship with passing tests?

## Scope / Non-goals

### Included

1. TypeScript scaffold, Vitest, npm lockfile, GitHub Actions, and shared `Topic`, `Snapshot`, and `Diff` types.
2. One anonymous `GET` of each configured forum's `latest.json`, using the forum's default first page. No pagination, per-topic requests, or category filtering. Include every topic returned to an anonymous reader.
3. Compare the fetched page with that forum's previous saved page. First successful run establishes a baseline. Subsequent runs report new observed IDs and increases in `posts_count`.
4. Read a JSON list of forum base URLs, save one replacement JSON snapshot per successful forum, and write a Markdown digest to stdout. Provide `--config`, `--state-dir`, and `--help`.
5. Continue across forum failures, report useful diagnostics, and preserve failed forums' state.

### Excluded

Telegram, scheduling or cron, LLM summaries, importance filtering, dashboards, on-chain data, participant weighting, authentication or secrets, databases, post bodies, per-reply links, edits and reaction tracking, full history, automatic retries, parallel runs, and npm registry publishing.

One-page coverage is intentional. Recent discussion is the owner's initial proxy for signal, not a completeness or importance guarantee. The digest must say it covers the latest page only.

## Architecture (units, each with one job and its interface)

Use small functions and Node built-ins, with no runtime dependencies or framework. File names below define module boundaries; implementation may split private helpers without changing these contracts.

| Unit | One job | Public interface |
| --- | --- | --- |
| `types` | Describe normalized data shared between units. | Types below; no I/O. |
| `config` | Read and validate the forum list. | `loadConfig(path): Promise<string[]>`, returning normalized URLs in config order. |
| `discourse` | Fetch and normalize one latest page. | `parseLatest(body: unknown): Topic[]`; `fetchSnapshot(forumUrl, { fetchImpl, now }): Promise<Snapshot>`. |
| `diff` | Compare two normalized snapshots. | `diffSnapshots(previous: Snapshot \| null, current: Snapshot): Diff`, pure and without mutation. |
| `snapshots` | Load and replace local JSON state. | `loadSnapshot(stateDir, forumUrl): Promise<Snapshot \| null>`; `saveSnapshot(stateDir, snapshot): Promise<void>`. |
| `digest` | Render ordered forum results as Markdown. | `renderDigest(results: ForumResult[]): string`, pure. |
| `cli` | Parse arguments and coordinate one run. | `runCli(argv, { fetchImpl, now, stdout, stderr }): Promise<0 \| 1>`. The executable passes real dependencies and sets the process exit code. |

The injected values are plain function arguments, not a dependency-injection framework. Tests call the CLI runner with a fake fetch, fixed clock, captured streams, and real temporary files. Importing modules must not start a run.

### Shared contracts

These declarations specify data shapes, not implementation code to add during the spec stage.

```ts
type Topic = {
  id: number;
  title: string;
  slug: string;
  postsCount: number;
};

type Snapshot = {
  schemaVersion: 1;
  forumUrl: string;
  fetchedAt: string; // UTC ISO 8601 time of the successful fetch.
  topics: Topic[];
};

type Diff = {
  forumUrl: string;
  baseline: boolean;
  changes: Array<{
    kind: 'new' | 'updated';
    topic: Topic;
    newPosts: number;
  }>;
};

type ForumResult =
  | { forumUrl: string; status: 'ok'; diff: Diff }
  | { forumUrl: string; status: 'failed'; message: string };
```

### Comparison rules

- Match topics by numeric ID within a forum, never by title or slug. Two snapshots with different forum URLs are an error.
- With `previous === null`, return `baseline: true` and no changes, even for a nonempty page.
- An ID in current but absent from previous is `new`; `newPosts` is its current total post count, including the opening post. Here, "new" means newly observed relative to the previous saved page, not necessarily newly created on the forum.
- For an ID in both, emit `updated` only when `current.postsCount > previous.postsCount`; `newPosts` is the difference.
- Equal or lower counts, changed titles/slugs alone, and IDs missing from current emit nothing. There are no deletion events. Save the current counts even after a decrease; do not introduce a historical high-water mark.
- Use the current topic title and slug for emitted changes. Sort changes by ascending topic ID for deterministic output. Do not rank importance.
- Each replacement snapshot contains only the fetched page. Do not retain an ever-seen topic registry. A topic that leaves the page and later returns can therefore appear as `new`.

### Run and failure rules

1. Parse arguments and validate the entire config before making forum requests or changing state. `--help` short-circuits all config and state access. Unknown options, positionals, or missing flag values fail with code `1`.
2. Process forums sequentially in config order. Load and validate the previous snapshot; fetch and validate the current page; compute the diff; save the current snapshot. Only then record a successful forum result.
3. Fetch through native `fetch`, request JSON, apply a fixed 15-second timeout to the operation including body consumption, and make no retries or pagination requests. Non-2xx responses, timeouts, transport failures, invalid JSON, and invalid required fields fail that forum. An empty topics array is a valid page.
4. Missing snapshot files mean first run. Corrupt JSON, unsupported schema versions, URL mismatches, or other read errors are failures, not permission to reset the baseline. Include forum context and the relevant file or HTTP status in errors without dumping response bodies.
5. On any forum failure, report it on stderr, keep its previous committed snapshot, record a failed result, and continue. A failed initial run leaves no baseline. A later successful run still establishes one.
6. Render one final digest including successful and failed forum sections. Exit `0` only if all configured forums succeeded; otherwise `1`. Global config/argument errors produce no digest and no writes. Unexpected runner failures also exit `1`.

### Digest contract

Use a top-level heading and a short `Coverage: latest page only.` line. Include every configured forum, in config order, using its normalized URL as the forum heading. Each changed topic is a bullet with a clickable title, `new topic` or `updated`, and `+N posts` (`+1 post` for one). Links open the original topic, not an individual new reply.

```markdown
# Governance changes

Coverage: latest page only.

## https://forum.arbitrum.foundation

- [Example proposal](https://forum.arbitrum.foundation/t/example-proposal/123) (new topic; +1 post)
- [Example discussion](https://forum.arbitrum.foundation/t/example-discussion/456) (updated; +3 posts)

## https://gov.uniswap.org

No changes.

## https://governance.aave.com

Failed; see stderr.
```

A first successful run uses `Baseline created.` instead of topic bullets or `No changes.`. Escape Markdown in forum labels and titles, neutralize raw HTML, and collapse embedded title line breaks so external titles cannot create extra digest structure. Build topic URLs from the normalized forum base, encoded slug, and ID. Keep diagnostics out of stdout. Exact whitespace beyond valid, deterministic Markdown is the builder's choice; test the chosen output.

## Data and external dependencies (verified 2026-10-21)

### Stack and versions

Target the latest patched Node.js **24.x LTS** locally and in CI, with npm **11.x**. Node 24 is listed as LTS in the [Node release table](https://nodejs.org/en/about/previous-releases). Do not make newer Node majors a v0 support promise.

Registry metadata checked for this spec reports **TypeScript 7.0.2**, **Vitest 5.0.5**, and **@types/node 24.19.2**. Use these as the scaffold's initial exact direct development versions and commit `package-lock.json`. These are a verified baseline, not claims that future releases remain identical. [TypeScript metadata](https://registry.npmjs.org/typescript/7.0.2), [Vitest metadata](https://registry.npmjs.org/vitest/5.0.5), [Node type metadata](https://registry.npmjs.org/@types%2fnode/24.19.2).

Vitest 5 requires Node at least 22.12; the checked package also explicitly supports Node 24. Node 24 satisfies that requirement. Use `vitest run` for a single test run. Vitest supplies its own testing toolchain; the application needs no Vite app or bundler. [Vitest getting started](https://vitest.dev/guide/), [migration prerequisites](https://vitest.dev/guide/migration/).

Use strict TypeScript, ESM, and NodeNext module/module-resolution settings, compiling source to `dist/` with `tsc`. Typecheck test sources too, through a separate no-emit config if needed. Native `fetch`, `AbortSignal.timeout`, `node:util` argument parsing, `node:fs/promises`, and `node:crypto` cover runtime needs. [TypeScript module guidance](https://www.typescriptlang.org/tsconfig/module.html), [Node globals](https://nodejs.org/api/globals.html), [argument parsing](https://nodejs.org/api/util.html#utilparseargsconfig), [filesystem](https://nodejs.org/api/fs.html), [hashing](https://nodejs.org/api/crypto.html#cryptocreatehashalgorithm-options).

### Discourse contract

Append `/latest.json` to the configured forum base, preserving any installation subpath. Read `topic_list.topics` and map `id`, `title`, `slug`, and `posts_count` to `Topic`. Ignore extra fields. The endpoint and response fields are documented in the [Discourse API](https://docs.discourse.org/#tag/Topics/operation/listLatestTopics) and its [official request/schema tests](https://github.com/discourse/discourse/blob/main/spec/requests/api/topics_spec.rb).

Require an object containing `topic_list.topics` as an array. Every topic must have a positive safe-integer ID, nonempty string title and slug, and a positive safe-integer `posts_count`. Duplicate IDs invalidate the page. Reject the whole forum response on invalid required data rather than advancing a partial baseline. Extra fields remain acceptable for forward compatibility.

Anonymous access is a property of each forum, not a guarantee for every Discourse site; some deployments require login or block requests. No API key or authenticated fallback is in scope. See the [Discourse authentication guidance](https://docs.discourse.org/).

Read-only checks on the spec date returned HTTP 200 and the required fields from all three starter endpoints below. Each returned 30 topics and advertised another page. Thirty is an observation, not a hardcoded page-size guarantee. Future availability belongs to manual release smoke checks, never automated tests. [Arbitrum latest](https://forum.arbitrum.foundation/latest.json), [Uniswap latest](https://gov.uniswap.org/latest.json), [Aave latest](https://governance.aave.com/latest.json).

### Configuration and files

The committed starter `forums.json`, added during CLI implementation, is a nonempty JSON array:

```json
[
  "https://forum.arbitrum.foundation",
  "https://gov.uniswap.org",
  "https://governance.aave.com"
]
```

Require absolute HTTP(S) base URLs without credentials, query strings, or fragments. Normalize using Node's URL handling and remove trailing slashes; preserve installation subpaths. Reject duplicate normalized URLs and non-string entries. No display-name, category, secret, or environment-variable configuration is needed.

Default paths are `./forums.json` and `./.gov-diff/`, relative to the invocation directory. `--config <path>` and `--state-dir <path>` override them; relative overrides also resolve from the invocation directory. Changing cwd or state directory selects a different baseline.

Save UTF-8 JSON at `<state-dir>/<sha256-of-normalized-forum-url>.json`. The full URL hash separates forums, including installations on different subpaths. Snapshots contain the shared contract, not raw API responses or post bodies. Runtime-validate snapshots with the same topic invariants, unique IDs, a valid UTC timestamp, schema version `1`, and the expected normalized URL. Removing a forum from config does not delete its state.

Create the state directory when needed. Write a complete JSON file to a unique temporary sibling, then rename it over the destination; do not truncate the previous snapshot in place. A write/rename failure must retain the previous destination and fail that forum. Clean up temporary files on handled failures when possible. This protects replacement on a local filesystem; power-loss durability and multi-process coordination are out of scope. Ignore `.gov-diff/`, `dist/`, test artifacts, and `node_modules/` in git.

## Testing strategy

GitHub Actions runs one `ci` job on pull requests and pushes to `main`: provision Node 24, `npm ci`, `npm run build`, then `npm test`. `npm run build` includes strict typechecking of source and tests and produces executable JavaScript. `npm test` is `vitest run`. CI only validates the build and tests; it does not contact forums, publish packages, or deploy anything.

Commit a saved public Discourse JSON fixture during fetch implementation with its source URL and capture date in test metadata. Preserve realistic unrelated fields to prove the parser tolerates them. Derive controlled later/invalid fixture variants for exact diff expectations. No fixtures or harness code are added by this spec PR.

Use an injected fake fetch returning fixture responses and a fixed clock. Tests must make no network calls, including localhost: make unmocked fetch fail immediately, and prohibit real HTTP transport in the harness. Exercise the same production fetch adapter through that fake, not a separate test parser. Use real temporary files for state integration and clean them up. The offline npx subprocess smoke uses a temporary npm cache with npm update notices disabled. For hard-to-trigger filesystem failures, inject or mock only the failing filesystem operation; assert the old file remains byte-for-byte intact.

| Criterion | Automated proof and required failure/negative cases |
| --- | --- |
| S1 | Clean install, strict build, and nonempty offline test suite run in `ci`; harness fails on an unexpected network attempt. Typecheck representative shared contracts so their consumers stay aligned. |
| S2 | Exact fixture mapping; unknown fields and an empty array accepted; missing envelope, wrong field types, duplicate IDs, invalid counts, HTML/invalid JSON, HTTP 403/429/500, rejection, and timeout fail. Assert the requested URL, JSON header, timeout signal, and absence of retries/pagination; prove timeout behavior with fake time. |
| S3 | New ID with one and multiple posts, updated ID with exact positive delta, identical snapshots, lower counts, title/slug-only changes, missing IDs, forum mismatch, deterministic ordering, and no input mutation. Include a topic leaving and reentering the saved page to pin the documented `new` semantics. |
| S4 | First run saves a baseline without topic bullets; identical second run says no changes; failed first fetch creates no file. Distinguish missing state from corrupt JSON, wrong schema/URL, and unreadable state. |
| S5 | Three-forum fixture run, followed by a second invocation with one new and one updated topic. Assert Markdown links/counts/labels, persisted snapshots, state isolation, config ordering, escaping of Markdown/HTML/line breaks, no-change and baseline sections, path overrides, and trailing-slash normalization. Invalid/empty/duplicate config fails before fetch or writes. |
| S6 | One forum fails while others advance; failed state stays byte-identical and its next success compares against that old snapshot. Cover fetch, parse, load, and write/rename failures; stderr context; exit code `1`; failed-section rendering. All-forum failure also exits `1`. |
| S7 | Built Node and offline local npx commands run `--help` without config or state. Invalid options fail. CLI runner tests prove the full data path with fake fetch and actual disk state; subprocess tests verify executable wiring without requiring a live forum. |

V1 is a manual product test; no automated test can prove voluntary use or usefulness. The CLI milestone requires a dated manual check of live forum access and topic links outside CI, recorded in implementation PR validation.

Before each implementation, write its acceptance tests, see them fail for the intended missing behavior, and commit them as a separate signed `test:` commit. The scaffold may first add its runner in one `chore:` commit as allowed by `AGENTS.md`. Tests exercise public interfaces and include failure cases; they must fail if behavior is wrong. Do not weaken checks to obtain green CI.

## Deploy

The target is a local Node.js CLI on the owner's machine. There is no hosted deployment and no registry release. After the human merges implementation PRs, local setup is:

```sh
npm ci
npm run build
npm test
node dist/cli.js --config ./forums.json --state-dir ./.gov-diff
```

The package exposes `crypto-gov-diff-tracker` through a `bin` entry pointing to `dist/cli.js`, with a Node shebang. From the built checkout, the alternative invocation is:

```sh
npx --offline --package . crypto-gov-diff-tracker --config ./forums.json --state-dir ./.gov-diff
```

The local package path and offline flag avoid depending on a published package of the same name. Verify this invocation on npm 11 in the scaffold/CLI work. [npm exec/npx package selection](https://docs.npmjs.com/cli/v11/commands/npm-exec/), [package executable mapping](https://docs.npmjs.com/cli/v11/configuring-npm/package-json/#bin).

"Live" means both entry paths start locally, a manual invocation against the three configured forums saves baselines, and later runs print linked differences or explicit no-change sections. S7 proves startup and S4-S6 prove the data path offline; the dated manual smoke confirms actual forum access. Follow that with the V1 week of use. Invocation is manual; merging or passing CI does not start a recurring process.

## Milestones (each shippable)

1. **Scaffold:** Node 24/npm, strict TypeScript, Vitest offline harness, shared contracts, build/test commands, and the `ci` workflow. Deliver a repository that installs, builds, and tests, with no runtime dependencies. Proves S1; no fake product functionality.
2. **Fetch and parse:** Saved fixture, validation, and public latest-page fetch adapter, with negative cases and a bounded timeout. Deliver a callable module returning normalized snapshots. Proves S2 without live network tests.
3. **Diff and snapshot storage:** Pure comparison, first-run semantics, validated local JSON loading, and safe replacement. Deliver callable units with temporary-file integration tests, including preservation on failure. Proves S3 and the state behavior needed by S4/S6. Depends on scaffold; can use synthetic normalized snapshots without depending on the fetch milestone.
4. **CLI and digest:** Starter config, flags, executable mapping, Markdown output, forum isolation, error handling, and full offline integration tests. Deliver the locally runnable product through both entry paths; perform a dated manual forum smoke and start the one-week experiment. Proves S4-S7 and enables V1. Depends on fetch and diff/storage.

These describe shipping boundaries, not implementation issues. Issue creation is the separately requested breakdown stage. Each implementation PR must pass `ci`; only the human merges.

## Risks and cut lines

### Defaults accepted by the owner

- **One default latest page per forum.** Busy forums, pinned topics, server ordering, or long gaps can hide changes. Activity and page position are imperfect proxies for importance. Keep the coverage line visible; pagination and historical recovery require a later scope decision.
- **Baseline-only first run.** It emits no topic changes. Starting again with empty state also starts a fresh baseline, so preserve the state directory during the experiment.
- **IDs and positive total-post-count deltas only.** A new observed ID reports its full current count, including the opening post. Edits, deletions, reactions, and votes are ignored. Counts measure net observed differences, not a complete event log; deletions can offset additions, and restored posts can increase counts.
- **Continue on individual forum failure.** Successful forums advance independently and the whole process exits nonzero. Operators must read stderr; a partial digest is not complete coverage.
- **Arbitrum, Uniswap, and Aave starter URLs, across public categories.** Forum-wide chatter may be noisy. If usefulness is poor, reassess the bet before adding filtering.
- **Local package only, `forums.json`, and `.gov-diff/`, with path flags.** No npm publication or hosted delivery is required. Later Telegram or agent access is a separate batch after the manual value test.

### Other limits and implementation calls

- Replacing page-sized snapshots keeps v0 small but forgets topics that leave the page. A resurfacing old topic can be labeled new and its whole count shown. Preventing that needs retained history or more fetching and is a deliberate cut.
- Public APIs and fields can change; blocked, rate-limited, or malformed responses fail visibly and retain state. Authentication, anti-bot bypasses, retries, and provider-specific adapters are cut. Recheck dependency compatibility when scaffolding if versions have moved; do not silently migrate majors.
- Storage is per successful run, not per acknowledged delivery. State is saved before the digest is written; interruption or stdout failure can leave advanced snapshots without a visible digest. There is no delivery acknowledgment, replay log, or exactly-once guarantee. A broken output stream exits nonzero but does not roll back committed state.
- Only one process may use a state directory at a time. Locking, backups, schema migration, crash recovery beyond replacement safety, and automated cleanup of abandoned temporary files are cut. Unsupported stored schemas fail with instructions to move aside or deliberately remove the snapshot for a fresh baseline.
- The fixed 15-second timeout, sequential processing, strict validation, URL-hashed filenames, deterministic ID ordering, and no runtime dependencies are spec-author choices within the accepted defaults. Private helper names, exact whitespace, and TypeScript config file organization are left to the builder.
- Do not turn future delivery into a plugin system, queue, generic event bus, or agent SDK in v0. The existing separation of fetching, comparison, and rendering is enough for a later change.
