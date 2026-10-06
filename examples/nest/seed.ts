import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { SeedbedService } from 'pg-seedbed/nest';
import { AppModule } from './app.module';

// Standalone application context: no HTTP server. Run with: tsx seed.ts [SeederClassName]
async function main(): Promise<void> {
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn'],
    abortOnError: false,
  });
  try {
    await app.get(SeedbedService).run(process.argv[2]);
  } finally {
    await app.close();
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
