import { readFileSync } from 'node:fs';
import { createInterface } from 'node:readline/promises';
import { runCli, type CliIo } from './cli-core';

const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')) as {
  version: string;
};

// Only prompt on a real terminal; scripts and CI get a clear error pointing at --force.
const confirm: CliIo['confirm'] = process.stdin.isTTY
  ? async (question) => {
      const prompt = createInterface({ input: process.stdin, output: process.stdout });
      try {
        return /^y(es)?$/i.test((await prompt.question(`${question} (yes/no) `)).trim());
      } finally {
        prompt.close();
      }
    }
  : undefined;

process.exitCode = await runCli(process.argv.slice(2), {
  cwd: process.cwd(),
  env: process.env,
  out: (message) => console.log(message),
  err: (message) => console.error(message),
  version: pkg.version,
  ...(confirm ? { confirm } : {}),
});
