import { defineConfig, type Options } from 'tsup';

const shared: Options = {
  target: 'node20',
  platform: 'node',
  sourcemap: true,
  external: ['pg', '@nestjs/common', '@nestjs/core', 'reflect-metadata', 'rxjs'],
};

export default defineConfig([
  {
    ...shared,
    entry: { index: 'src/index.ts', 'nest/index': 'src/nest/index.ts' },
    format: ['esm', 'cjs'],
    dts: true,
    clean: true,
  },
  {
    ...shared,
    entry: { cli: 'src/cli.ts' },
    format: ['esm'],
    banner: { js: '#!/usr/bin/env node' },
  },
]);
