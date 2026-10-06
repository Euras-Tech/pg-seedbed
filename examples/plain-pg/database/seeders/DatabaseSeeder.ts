import { Seeder } from 'pg-seedbed';
import { UserSeeder } from './UserSeeder';

export class DatabaseSeeder extends Seeder {
  async run(): Promise<void> {
    await this.call(UserSeeder); // add more seeders here, in dependency order
  }
}
