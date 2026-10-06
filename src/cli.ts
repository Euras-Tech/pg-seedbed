import { readFileSync } from 'node:fs';
import { runCli } from './cli-core';

const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')) as {
  version: string;
};

process.exitCode = await runCli(process.argv.slice(2), {
  cwd: process.cwd(),
  env: process.env,
  out: (message) => console.log(message),
  err: (message) => console.error(message),
  version: pkg.version,
});
