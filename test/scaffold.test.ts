import { appendFileSync, cpSync, existsSync, readFileSync, symlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { makeTempDir, npmEnv, repoRoot, run } from './support/process.js';

const read = (path: string) => readFileSync(join(repoRoot, path), 'utf8');
const pkg = JSON.parse(read('package.json'));

describe('package metadata', () => {
  it('pins the toolchain and has no runtime dependencies', () => {
    expect(pkg.type).toBe('module');
    expect(pkg.dependencies ?? {}).toEqual({});
    expect(pkg.devDependencies).toEqual({
      '@types/node': '24.19.2',
      typescript: '7.0.2',
      vitest: '5.0.5',
    });
    expect(pkg.engines.node).toMatch(/24/);
    expect(pkg.engines.npm).toMatch(/11/);
    expect(pkg.scripts.test).toBe('vitest run');
    expect(read('.nvmrc').trim()).toBe('24');
    expect(existsSync(join(repoRoot, 'package-lock.json'))).toBe(true);
  });
});

// Builds a throwaway copy of the project so checks can be broken on purpose.
describe('build and test commands in a disposable copy', { timeout: 120_000 }, () => {
  function copyProject(): string {
    const dir = makeTempDir('gov-diff-copy-');
    for (const entry of ['package.json', 'tsconfig.json', 'tsconfig.test.json', 'vitest.config.ts', 'src', 'test']) {
      if (existsSync(join(repoRoot, entry))) cpSync(join(repoRoot, entry), join(dir, entry), { recursive: true });
    }
    symlinkSync(join(repoRoot, 'node_modules'), join(dir, 'node_modules'), 'dir');
    return dir;
  }
  const npm = (dir: string, args: string[]) =>
    run('npm', args, { cwd: dir, env: npmEnv(makeTempDir('gov-diff-npm-cache-')) });

  it('emits runtime JavaScript for source only into dist/', () => {
    const dir = copyProject();

    const result = npm(dir, ['run', 'build']);

    expect(result.status, result.stdout + result.stderr).toBe(0);
    expect(existsSync(join(dir, 'dist/cli.js'))).toBe(true);
    expect(existsSync(join(dir, 'dist/types.js'))).toBe(true);
    expect(existsSync(join(dir, 'dist/test'))).toBe(false);
    expect(existsSync(join(dir, 'dist/cli.test.js'))).toBe(false);
  });

  it('fails the build on a source type error', () => {
    const dir = copyProject();
    appendFileSync(join(dir, 'src/types.ts'), "\nexport const broken: number = 'not a number';\n");

    expect(npm(dir, ['run', 'build']).status).not.toBe(0);
  });

  it('fails the build on a test type error', () => {
    const dir = copyProject();
    appendFileSync(join(dir, 'test/scaffold.test.ts'), "\nexport const broken: number = 'not a number';\n");

    expect(npm(dir, ['run', 'build']).status).not.toBe(0);
  });

  it('fails npm test on a failing assertion and passes otherwise', () => {
    const dir = copyProject();
    writeFileSync(
      join(dir, 'test/probe.test.ts'),
      "import { expect, it } from 'vitest';\nit('probe', () => { expect(process.env.PROBE).toBe('pass'); });\n",
    );

    const failing = npm(dir, ['test', '--', 'test/probe.test.ts']);
    const passing = run('npm', ['test', '--', 'test/probe.test.ts'], {
      cwd: dir,
      env: { ...npmEnv(makeTempDir('gov-diff-npm-cache-')), PROBE: 'pass' },
    });

    expect(failing.status).not.toBe(0);
    expect(passing.status, passing.stdout + passing.stderr).toBe(0);
  });
});

describe('ci workflow', () => {
  const workflow = read('.github/workflows/ci.yml');
  const lines = workflow.split('\n');

  it('runs on pull requests and pushes to main', () => {
    expect(workflow).toMatch(/^on:\n {2}pull_request:\n {2}push:\n {4}branches: \[main\]$/m);
  });

  it('has exactly one job, named ci', () => {
    const jobsAt = lines.indexOf('jobs:');
    const jobs = lines.slice(jobsAt + 1).filter((line) => /^ {2}\S/.test(line));

    expect(jobsAt).toBeGreaterThan(-1);
    expect(jobs).toEqual(['  ci:']);
    expect(workflow).toMatch(/^ {4}name: ci$/m);
  });

  it('provisions Node 24 and runs npm ci, build, then test unconditionally', () => {
    const runs = lines.filter((line) => /^\s*-?\s*run:/.test(line)).map((line) => line.replace(/^\s*-?\s*run:\s*/, ''));

    expect(workflow).toMatch(/uses: actions\/setup-node@v\d+/);
    expect(workflow).toMatch(/node-version-file: \.nvmrc|node-version: '?24'?/);
    expect(runs).toEqual(['npm ci', 'npm run build', 'npm test']);
    expect(workflow).not.toMatch(/^\s*if:/m);
    expect(workflow).not.toMatch(/--if-present|continue-on-error|\|\| true/);
  });
});

describe('git ignore rules', () => {
  const ignored = (path: string) =>
    run('git', ['check-ignore', '--quiet', '--no-index', path], { cwd: repoRoot }).status === 0;

  it.each(['.gov-diff/abc.json', 'dist/cli.js', 'node_modules/vitest/package.json', 'coverage/index.html'])(
    'ignores generated %s',
    (path) => expect(ignored(path)).toBe(true),
  );

  it.each(['src/cli.ts', 'test/cli.test.ts', 'forums.json', 'package-lock.json', 'package.json'])(
    'tracks %s',
    (path) => expect(ignored(path)).toBe(false),
  );
});
