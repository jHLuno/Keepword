import { drizzle, type PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import postgres, { type Sql } from 'postgres';

import * as schema from './schema.js';

export type Database = PostgresJsDatabase<typeof schema>;

export type DatabaseClient = Readonly<{
  client: Sql;
  db: Database;
}>;

export function createDatabaseClient(connectionString: string): DatabaseClient {
  const client = postgres(connectionString, { max: 1 });

  return {
    client,
    db: drizzle(client, { schema }),
  };
}
