import { defineFactory, type Ids } from 'pg-seedbed';

export interface UserRow {
  id: string;
  email: string;
  full_name: string;
}

/** Takes `ids` so every user gets a stable, deterministic id. */
export const userFactory = (ids: Ids) =>
  defineFactory<UserRow>(({ seq }) => {
    const email = `user${seq}@example.test`;
    return { id: ids('user', email), email, full_name: `User ${seq}` };
  });
