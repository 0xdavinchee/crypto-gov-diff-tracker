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
| S4 | A forum with no previous snapshot reports a baseline without topic-change entries and saves it only after the digest write succeeds. After a successful save, the same response on the next run produces no changes. Failed output or an initial save failure leaves no baseline file. | Repeated CLI-runner invocations against temporary state, including failed first output and save cases. |
| S5 | A config containing three forums produces one ordered Markdown digest with forum headings, changed topic titles, post counts, and original-topic links. The complete stdout write succeeds before any snapshot save starts; snapshots then persist independently across invocations. | CLI integration harness with exact output assertions, a controlled pending stdout write, save-order assertions, and JSON reads from disk. |
| S6 | A load/fetch/parse failure appears as a failed forum section and preserves its state. Output failure preserves all snapshots and starts no saves. After successful output, a save failure preserves that forum's prior state and reports only on stderr; other prepared forums still save. Any failure produces exit code `1`. | Partial-failure and output-order integration cases below, including repeated changes after a failed save. |
| S7 | The built package starts through both `node dist/cli.js` and `npx --offline --package . crypto-gov-diff-tracker`; `--help` exits `0` without config, network, or snapshot writes. | Subprocess smoke tests of both entry paths plus runner tests of argument handling. |
| V1 | During seven consecutive days following three forums, the owner voluntarily uses the digest on at least four distinct days and opens at least one useful topic link from it. | Manual dated tally of use days and useful links, kept privately; no app telemetry. |

After that week, reassess rather than add features if the owner still manually checks every forum or rarely finds useful changes. Record that qualitative verdict alongside V1. Evaluate pipeline success separately: did this small scope ship with passing tests?

## Scope / Non-goals

### Included

1. TypeScript scaffold, Vitest, npm lockfile, GitHub Actions, and shared `Topic`, `Snapshot`, and `Diff` types.
2. One anonymous `GET` of each configured forum's `latest.json`, using the forum's default first page. No pagination, per-topic requests, or category filtering. Include every topic returned to an anonymous reader.
3. Compare the fetched page with that forum's previous saved page. First successful run establishes a baseline. Subsequent runs report new observed IDs and increases in `posts_count`.
4. Read a JSON list of forum base URLs, render and write the Markdown digest to stdout, and save replacement snapshots only after that write succeeds. Provide `--config`, `--state-dir`, and `--help`.
5. Continue across forum failures, report useful diagnostics, and preserve failed forums' state.

### Excluded

Telegram, scheduling or cron, LLM summaries, importance filtering, dashboards, on-chain data, participant weighting, authentication or secrets, databases, post bodies, per-reply links, edits and reaction tracking, full history, automatic retries, parallel runs, and npm registry publishing.

One-page coverage is intentional. Recent discussion is the owner's initial proxy for signal, not a completeness or importance guarantee. The digest must say it covers the latest page only.

## Decisions

### Print first, then save (owner decision, 2026-10-21)

Prepare each forum's diff, render the digest, and finish writing it to stdout before saving any snapshots. The owner selected this order in response to the [delivery-order review on PR #1](https://github.com/0xdavinchee/crypto-gov-diff-tracker/pull/1#discussion_r4330857531). A failed output write must not advance a baseline and hide changes from the next comparison.

The accepted trade-off is repetition: after successful output, a failed save or interruption before saving can repeat changes next run. Save failures leave that forum's previous snapshot intact, report on stderr, and make the process exit `1`; they cannot change a digest already printed. Continue saving other prepared forums independently. There is no transaction across forums, delivery acknowledgment from the reader, replay log, or exactly-once guarantee. Successful stdout completion means the write succeeded, not that a person or downstream process consumed the digest.

## Architecture (units, each with one job and its interface)

Use small functions and Node built-ins, with no runtime dependencies or framework. File names below define module boundaries; implementation may split private helpers without changing these contracts.

| Unit | One job | Public interface |
| --- | --- | --- |
| `types` | Describe normalized data shared between units. | Types below; no I/O. |
| `config` | Read and validate the forum list. | `loadConfig(path): Promise<string[]>`, returning normalized URLs in config order. |
| `discourse` | Fetch and normalize one latest page. | `parseLatest(body: unknown): Topic[]`; `fetchSnapshot(forumUrl, { fetchImpl, now, timeoutMs = 15_000 }): Promise<Snapshot>`. |
| `diff` | Compare two normalized snapshots. | `diffSnapshots(previous: Snapshot \| null, current: Snapshot): Diff`, pure and without mutation. |
| `snapshots` | Load and replace local JSON state. | `loadSnapshot(stateDir, forumUrl): Promise<Snapshot \| null>`; `saveSnapshot(stateDir, snapshot): Promise<void>`. |
| `digest` | Render ordered forum results as Markdown. | `renderDigest(results: ForumResult[]): string`, pure. |
| `cli` | Parse arguments and coordinate one run. | `runCli(argv, { fetchImpl, now, cwd, stdout, stderr }): Promise<0 \| 1>`. The executable passes real dependencies, including `process.cwd()`, and sets the process exit code. |

The injected values are plain function arguments, not a dependency-injection framework. `now` has type `() => Date`; `cwd` is an absolute directory path of type `string`. Tests call the CLI runner with a fake fetch, fixed clock, explicit temporary cwd, captured streams, and real temporary files. Resolve default and relative paths against the injected cwd without calling `process.chdir()`. Importing modules must not start a run.

The injected `stdout` is an awaitable writer with type `(text: string) => Promise<void>`. Its promise resolves only after the whole digest write completes successfully and rejects on write errors, including `EPIPE`; the runner also catches a writer that throws synchronously. The executable's adapter waits for the Node write callback and handles stream errors. Calling `write()` or inspecting its boolean return is not completion: that boolean reports backpressure. Set the exit code after the awaited run rather than forcing exit while output is pending. [Node writable completion](https://nodejs.org/api/stream.html#writablewritechunk-encoding-callback), [process output and exit](https://nodejs.org/api/process.html#a-note-on-process-io).

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
2. Prepare forums sequentially in config order. Load and validate the previous snapshot; fetch and validate the current page; compute the diff. Record an `ok` result and retain its current snapshot in memory for later saving. `ForumResult.status` describes preparation, not persistence. Do not create the state directory, write temporary snapshot files, or replace snapshots during preparation.
3. Fetch through native `fetch`, request JSON, apply a 15-second timeout to the operation including body consumption, and make no retries or pagination requests. `fetchSnapshot` accepts an optional numeric `timeoutMs` for tests, defaulting to `15_000`; the CLI uses the default and exposes no timeout flag. Non-2xx responses, timeouts, transport failures, invalid JSON, and invalid required fields fail that forum. An empty topics array is a valid page.
4. Missing snapshot files mean first run. Corrupt JSON, unsupported schema versions, URL mismatches, or other read errors are failures, not permission to reset the baseline. Include forum context and the relevant file or HTTP status in errors without dumping response bodies.
5. On a preparation failure, report it on stderr, keep its previous committed snapshot, record a failed result, and continue preparing other forums. Do not queue a snapshot for the failed forum. A failed initial preparation leaves no baseline.
6. After preparing all forums, render one digest containing both prepared and failed sections and await the complete stdout write. A rendering or output failure, including an asynchronous write rejection or `EPIPE`, reports on stderr and exits `1` without attempting any snapshot saves. Existing snapshot files stay byte-for-byte intact and missing baselines remain missing, even if part of the digest reached stdout before the error.
7. Only after the stdout writer resolves successfully, save the prepared snapshots sequentially in config order. On a save failure, preserve that forum's prior snapshot or absence of one, report the forum and file context on stderr, and continue saving other prepared forums. Do not rewrite or append to the printed digest to show a save failure; that forum's changes or baseline section can repeat next run.
8. Exit `0` only if every forum prepared successfully, the digest write succeeded, and every prepared snapshot saved successfully; otherwise exit `1`. Even if all forums fail preparation, write the failed-section digest and exit `1` without saves. Global config/argument errors produce no digest and no writes. Unexpected runner failures also exit `1`.

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

A prepared forum with no prior snapshot uses `Baseline captured.` instead of topic bullets or `No changes.`. This describes the fetched baseline in memory, not a completed save. `Failed; see stderr.` describes preparation failures only; a later save failure appears only on stderr and in the exit code. Escape Markdown in forum labels and titles, neutralize raw HTML, and collapse embedded title line breaks so external titles cannot create extra digest structure. Build topic URLs from the normalized forum base, encoded slug, and ID. Keep diagnostics out of stdout. Exact whitespace beyond valid, deterministic Markdown is the builder's choice; test the chosen output.

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

Default paths are `./forums.json` and `./.gov-diff/`, relative to the invocation directory supplied as `runCli`'s `cwd`. `--config <path>` and `--state-dir <path>` override them; relative overrides resolve against that same injected cwd, and absolute overrides remain absolute. Changing cwd or state directory selects a different baseline. Path tests supply distinct temporary cwd values rather than changing the test process's working directory, which is unavailable in Node worker threads. [Node worker restrictions](https://nodejs.org/api/worker_threads.html#class-worker).

Save UTF-8 JSON at `<state-dir>/<sha256-of-normalized-forum-url>.json`. The full URL hash separates forums, including installations on different subpaths. Snapshots contain the shared contract, not raw API responses or post bodies. Runtime-validate snapshots with the same topic invariants, unique IDs, a valid UTC timestamp, schema version `1`, and the expected normalized URL. Removing a forum from config does not delete its state.

Create the state directory when needed during saving, only after the digest write succeeds. Write a complete JSON file to a unique temporary sibling, then rename it over the destination; do not truncate the previous snapshot in place. A write/rename failure must retain the previous destination and fail that forum's save, reported on stderr without changing the already printed digest. Clean up temporary files on handled failures when possible. This protects replacement on a local filesystem; power-loss durability and multi-process coordination are out of scope. Ignore `.gov-diff/`, `dist/`, test artifacts, and `node_modules/` in git.

## Testing strategy

GitHub Actions runs one `ci` job on pull requests and pushes to `main`: provision Node 24, `npm ci`, `npm run build`, then `npm test`. `npm run build` includes strict typechecking of source and tests and produces executable JavaScript. `npm test` is `vitest run`. CI only validates the build and tests; it does not contact forums, publish packages, or deploy anything.

Commit a saved public Discourse JSON fixture during fetch implementation with its source URL and capture date in test metadata. Preserve realistic unrelated fields to prove the parser tolerates them. Derive controlled later/invalid fixture variants for exact diff expectations. No fixtures or harness code are added by this spec PR.

Use an injected fake fetch returning fixture responses and a fixed clock. Tests must make no network calls, including localhost: make unmocked fetch fail immediately, and prohibit real HTTP transport in the harness. Exercise the same production fetch adapter through that fake, not a separate test parser. Use real temporary files for state integration and clean them up. The offline npx subprocess smoke uses a temporary npm cache with npm update notices disabled. For hard-to-trigger filesystem failures, inject or mock only the failing filesystem operation; assert the old file remains byte-for-byte intact.

Timeout tests use real timers with a small injected `timeoutMs`, such as 10 ms, and a fake fetch that rejects only when its supplied signal aborts. Cover both a hung request and a response whose body read hangs until the same signal aborts. Assert rejection rather than a precise wall-clock duration, and separately assert that omitting the override uses `15_000`. Do not advance Vitest fake timers to drive `AbortSignal.timeout`: Node captures its own timer function internally. [Node 24 abort implementation](https://github.com/nodejs/node/blob/v24.x/lib/internal/abort_controller.js), [Vitest fake timers](https://vitest.dev/guide/mocking/timers).

| Criterion | Automated proof and required failure/negative cases |
| --- | --- |
| S1 | Clean install, strict build, and nonempty offline test suite run in `ci`; harness fails on an unexpected network attempt. Typecheck representative shared contracts so their consumers stay aligned. |
| S2 | Exact fixture mapping; unknown fields and an empty array accepted; missing envelope, wrong field types, duplicate IDs, invalid counts, HTML/invalid JSON, HTTP 403/429/500, rejection, and timeout fail. Assert the requested URL, JSON header, an abort signal passed to fetch, and absence of retries/pagination. Prove timeout rejection with a small injected `timeoutMs` and abort-aware fake fetch/body, covering both a hung request and hung body read; assert the default is 15 seconds. |
| S3 | New ID with one and multiple posts, updated ID with exact positive delta, identical snapshots, lower counts, title/slug-only changes, missing IDs, forum mismatch, deterministic ordering, and no input mutation. Include a topic leaving and reentering the saved page to pin the documented `new` semantics. |
| S4 | First run prints `Baseline captured.` without topic bullets, then saves; identical second run says no changes. Failed first fetch, output, or save creates no baseline file; after failed output/save, a successful retry still reports a baseline. Distinguish missing state from corrupt JSON, wrong schema/URL, and unreadable state. |
| S5 | Three-forum fixture run, followed by a second invocation with one new and one updated topic. Assert Markdown links/counts/labels, persisted snapshots, state isolation, config ordering, escaping of Markdown/HTML/line breaks, no-change and baseline sections, and trailing-slash normalization. Hold the stdout promise pending and assert no saves or state-directory creation; resolve it and assert the complete write precedes every save. Test default paths, relative overrides, and absolute overrides with explicit temporary `cwd` values and no `process.chdir()`. Invalid/empty/duplicate config fails before fetch or writes. |
| S6 | Cover the output and snapshot ordering cases below through the public CLI runner. Load/fetch/parse failures render failed sections; save failures occur after output and affect stderr/exit status only. Assert byte-identical failed state, continued saves for other prepared forums, replay after save failure, no saves on output failure, and exit code `1`. All-forum preparation failure also writes its failure digest and exits `1` without saves. |
| S7 | Built Node and offline local npx commands run `--help` without config or state. Invalid options fail. CLI runner tests prove the full data path with fake fetch and actual disk state; subprocess tests verify executable wiring without requiring a live forum. |

### Output and snapshot ordering cases (S4-S6)

Use fixture-backed fetches and real temporary snapshot files. A controllable stdout promise supplies deterministic pending, success, and error outcomes without piping to a live process or making network calls. Observe snapshot-save calls so a save attempted and rolled back would still fail the ordering test. For the executable's stdout adapter, use a local fake writable whose completion callback and error are controlled by the test; prove its promise waits for completion and rejects an asynchronous write error rather than relying solely on the runner's fake writer.

| Given / when | Required result |
| --- | --- |
| Multiple forums prepare successfully; the stdout promise remains pending, then resolves. | Before resolution, no save is attempted, old files are unchanged, and missing state directories remain absent. After resolution, each prepared snapshot saves in config order; the run exits `0`. |
| A writer throws synchronously, or rejects asynchronously after capturing part of the digest, including an `EPIPE` error. | No snapshot save is attempted for any forum; existing files remain byte-identical and new files/directories are absent. Stderr identifies the output failure and the run exits `1`. With the same fixture on a successful retry, previously unsaved changes are still reported. |
| The digest write succeeds; saving forum A fails while forum B can save. | The digest contains A's prepared changes and is written exactly once, with no replacement failed section or appended save diagnostic. Stderr names A and the failed file, A's prior snapshot remains byte-identical, B advances, and the run exits `1`. On the same fixture next run, A's changes repeat while B reports no changes. |
| Forum A fails during load, fetch, or parse; forum B prepares successfully. | The digest includes A's failed section and B's prepared result. After successful output, save only B, preserve A, report A on stderr, and exit `1`. |
| A first-run forum has no snapshot; its output fails or its post-output save fails. | No baseline file is created. A later successful retry still prints `Baseline captured.` without topic-change bullets, then saves the baseline. |

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
4. **CLI and digest:** Starter config, flags, executable mapping, Markdown output completed before snapshot saves, forum isolation, error handling, and full offline integration tests of output/save ordering and retries after failures. Deliver the locally runnable product through both entry paths; perform a dated manual forum smoke and start the one-week experiment. Proves S4-S7 and enables V1. Depends on fetch and diff/storage.

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
- Only one process may use a state directory at a time. Locking, backups, schema migration, crash recovery beyond replacement safety, and automated cleanup of abandoned temporary files are cut. Unsupported stored schemas fail with instructions to move aside or deliberately remove the snapshot for a fresh baseline.
- The fixed 15-second timeout, sequential processing, strict validation, URL-hashed filenames, deterministic ID ordering, and no runtime dependencies are spec-author choices within the accepted defaults. Private helper names, exact whitespace, and TypeScript config file organization are left to the builder.
- Do not turn future delivery into a plugin system, queue, generic event bus, or agent SDK in v0. The existing separation of fetching, comparison, and rendering is enough for a later change.
