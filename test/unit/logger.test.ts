import { afterEach, describe, expect, it, vi } from 'vitest';
import { runSeeders } from '../../src/runner';
import { Seeder, consoleLogger, silentLogger, type Logger } from '../../src/seeder';
import { fakeDb } from './helpers';

afterEach(() => {
  vi.restoreAllMocks();
});

describe('loggers', () => {
  it('consoleLogger prefixes and routes by level', () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    consoleLogger.info('a');
    consoleLogger.warn('b');
    consoleLogger.error('c');
    expect(log).toHaveBeenCalledWith('[pg-seedbed] a');
    expect(warn).toHaveBeenCalledWith('[pg-seedbed] b');
    expect(error).toHaveBeenCalledWith('[pg-seedbed] c');
  });

  it('silentLogger does nothing', () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    silentLogger.info('a');
    silentLogger.warn('b');
    silentLogger.error('c');
    expect(log).not.toHaveBeenCalled();
  });

  it('seeders can log through the injected logger', async () => {
    const messages: string[] = [];
    const logger: Logger = {
      info: (message) => messages.push(message),
      warn: () => undefined,
      error: () => undefined,
    };
    class Chatty extends Seeder {
      async run(): Promise<void> {
        this.log.info(`rolled ${this.random.int(1, 1)}`);
        await Promise.resolve();
      }
    }
    await runSeeders({ seeders: [Chatty], defaultSeeder: Chatty, client: fakeDb().db, logger });
    expect(messages).toEqual(['Seeding Chatty', 'rolled 1']);
  });
});
