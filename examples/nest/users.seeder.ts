import { Inject, Injectable } from '@nestjs/common';
import { Seeder, defineFactory } from 'pg-seedbed';

export const PASSWORD_HASHER = Symbol('PASSWORD_HASHER');

export interface PasswordHasher {
  hash(plain: string): string;
}

/** A normal Nest provider: seeders can inject anything your app already provides. */
@Injectable()
export class UsersSeeder extends Seeder {
  constructor(@Inject(PASSWORD_HASHER) private readonly hasher: PasswordHasher) {
    super();
  }

  async run(): Promise<void> {
    const users = defineFactory(({ seq }) => ({
      id: this.ids('user', `user${seq}@example.test`),
      email: `user${seq}@example.test`,
      password_hash: this.hasher.hash('password'),
    }));
    await users.createMany(this.db, 'users', { conflict: ['email'] }, 3);
  }
}
