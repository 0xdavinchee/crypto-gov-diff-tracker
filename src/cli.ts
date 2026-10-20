#!/usr/bin/env node
import { realpathSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';

export const usage = `Usage: crypto-gov-diff-tracker [options]

Print a Markdown digest of new and updated topics on configured Discourse forums.

Options:
  --config <path>     Forum list (default: ./forums.json)
  --state-dir <path>  Snapshot directory (default: ./.gov-diff)
  -h, --help          Show this help
`;

export type CliOptions = {
  argv: string[];
  cwd: string;
  stdout: { write(text: string): unknown };
  stderr: { write(text: string): unknown };
};

export async function runCli({ argv, stdout, stderr }: CliOptions): Promise<number> {
  let values;
  try {
    ({ values } = parseArgs({
      args: argv,
      strict: true,
      allowPositionals: false,
      options: {
        config: { type: 'string' },
        'state-dir': { type: 'string' },
        help: { type: 'boolean', short: 'h' },
      },
    }));
  } catch (error) {
    stderr.write(`${error instanceof Error ? error.message : String(error)}\n\n${usage}`);
    return 1;
  }

  if (values.help) {
    stdout.write(usage);
    return 0;
  }

  stderr.write('Forum processing is not implemented yet.\n');
  return 1;
}

function isEntryPoint(): boolean {
  const entry = process.argv[1];
  return entry !== undefined && realpathSync(entry) === fileURLToPath(import.meta.url);
}

if (isEntryPoint()) {
  process.exitCode = await runCli({
    argv: process.argv.slice(2),
    cwd: process.cwd(),
    stdout: process.stdout,
    stderr: process.stderr,
  });
}
