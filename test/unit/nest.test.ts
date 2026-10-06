/* eslint-disable @typescript-eslint/no-extraneous-class -- Nest modules are decorated classes */
import 'reflect-metadata';
import { Inject, Injectable, Module } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { describe, expect, it } from 'vitest';
import { SEEDBED_OPTIONS, SeedbedModule, SeedbedService } from '../../src/nest';
import { Seeder } from '../../src/seeder';

const GREETING = Symbol('GREETING');

@Injectable()
class GreetingSeeder extends Seeder {
  constructor(@Inject(GREETING) readonly greeting: string) {
    super();
  }

  async run(): Promise<void> {
    await Promise.resolve();
  }
}

@Module({ providers: [{ provide: GREETING, useValue: 'hello' }], exports: [GREETING] })
class GreetingModule {}

@Module({
  imports: [
    SeedbedModule.forRoot({
      imports: [GreetingModule],
      seeders: [GreetingSeeder],
      defaultSeeder: GreetingSeeder,
      connectionString: 'postgres://u:p@prod.example.com/app',
    }),
  ],
})
class AppModule {}

async function withApp(test: (app: Awaited<ReturnType<typeof boot>>) => Promise<void>) {
  const app = await boot();
  try {
    await test(app);
  } finally {
    await app.close();
  }
}

const boot = () =>
  NestFactory.createApplicationContext(AppModule, { logger: false, abortOnError: false });

describe('SeedbedModule', () => {
  it('registers the service, the options and the seeders as providers', () =>
    withApp((app) => {
      expect(app.get(SeedbedService)).toBeInstanceOf(SeedbedService);
      expect(app.get(SEEDBED_OPTIONS)).toMatchObject({ defaultSeeder: GreetingSeeder });
      expect(app.get(SEEDBED_OPTIONS)).not.toHaveProperty('imports');
      return Promise.resolve();
    }));

  it('gives seeders dependency injection from the imported modules', () =>
    withApp((app) => {
      expect(app.get(GreetingSeeder, { strict: false }).greeting).toBe('hello');
      return Promise.resolve();
    }));

  it('runs through the same guard and selection rules as the core runner', () =>
    withApp(async (app) => {
      const service = app.get(SeedbedService);
      await expect(service.run()).rejects.toThrow('Refusing to seed remote host');
      await expect(service.run('Nope')).rejects.toThrow('Unknown seeder "Nope"');
    }));
});
