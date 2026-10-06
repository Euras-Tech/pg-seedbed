import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

const CLASS_NAME = /^[A-Za-z_][A-Za-z0-9_]*$/;

const TYPESCRIPT = (name: string) => `import { Seeder } from 'pg-seedbed';

export class ${name} extends Seeder {
  async run(): Promise<void> {
    // await this.db.query('INSERT INTO ...');
  }
}
`;

const JAVASCRIPT = (name: string) => `import { Seeder } from 'pg-seedbed';

export class ${name} extends Seeder {
  async run() {
    // await this.db.query('INSERT INTO ...');
  }
}
`;

/** Laravel's `make:seeder`: writes a seeder stub into the seeders directory and returns its path. */
export async function makeSeeder(options: {
  name: string;
  directory: string;
  typescript: boolean;
}): Promise<string> {
  if (!CLASS_NAME.test(options.name)) {
    throw new Error(`Invalid seeder name "${options.name}": use a class name such as UserSeeder.`);
  }
  const file = join(options.directory, `${options.name}.${options.typescript ? 'ts' : 'mjs'}`);
  await mkdir(options.directory, { recursive: true });
  try {
    // 'wx' fails when the file exists: never overwrite someone's seeder.
    await writeFile(file, (options.typescript ? TYPESCRIPT : JAVASCRIPT)(options.name), {
      flag: 'wx',
    });
  } catch (error) {
    if ((error as { code?: string }).code === 'EEXIST') {
      throw new Error(`${file} already exists.`);
    }
    throw error;
  }
  return file;
}
