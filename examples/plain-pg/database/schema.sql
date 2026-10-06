CREATE TABLE IF NOT EXISTS users (
  id        uuid PRIMARY KEY,
  email     text NOT NULL UNIQUE,
  full_name text NOT NULL
);
