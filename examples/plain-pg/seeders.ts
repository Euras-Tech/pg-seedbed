import { Seeder, defineFactory } from 'pg-seedbed';

export class UserSeeder extends Seeder {
  async run(): Promise<void> {
    // Defined inside run() so it can use this.ids(): ids stay stable across runs and machines.
    const users = defineFactory(({ seq }) => ({
      id: this.ids('user', `user${seq}@example.test`),
      email: `user${seq}@example.test`,
      full_name: `User ${seq}`,
    }));

    await users.createMany(this.db, 'users', { conflict: ['email'] }, 5);
    this.log.info('5 users upserted');
  }
}

export class DatabaseSeeder extends Seeder {
  async run(): Promise<void> {
    await this.call(UserSeeder);
  }
}
