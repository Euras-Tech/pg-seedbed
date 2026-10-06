import { Seeder } from 'pg-seedbed';
import { userFactory } from '../factories/UserFactory';

export class UserSeeder extends Seeder {
  async run(): Promise<void> {
    await userFactory(this.ids).createMany(this.db, 'users', { conflict: ['email'] }, 5);
    this.log.info('5 users upserted');
  }
}
