/* eslint-disable @typescript-eslint/no-extraneous-class -- Nest modules are decorated classes */
import { Module } from '@nestjs/common';
import { SeedbedModule } from 'pg-seedbed/nest';
import { PASSWORD_HASHER, UsersSeeder } from './users.seeder';

@Module({
  // Replace with your real hashing provider, usually exported by an existing module.
  providers: [
    { provide: PASSWORD_HASHER, useValue: { hash: (plain: string) => `hashed:${plain}` } },
  ],
  exports: [PASSWORD_HASHER],
})
class SecurityModule {}

@Module({
  imports: [
    SeedbedModule.forRoot({
      imports: [SecurityModule],
      seeders: [UsersSeeder],
      defaultSeeder: UsersSeeder,
      connectionString: process.env.DATABASE_URL ?? '',
      idNamespace: '6f1d2c9a-4b7e-4f3a-9c55-2a8e0d7b1c34',
      guard: { allowedDatabases: ['myapp_dev', 'myapp_test'] },
    }),
  ],
})
export class AppModule {}
