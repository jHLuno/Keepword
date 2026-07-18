import { PGlite } from '@electric-sql/pglite';
import { drizzle, type PgliteDatabase } from 'drizzle-orm/pglite';
import { migrate } from 'drizzle-orm/pglite/migrator';
import { resolve } from 'node:path';

import * as schema from '../../src/db/schema.js';

export type PgliteTestDatabase = Readonly<{
  client: PGlite;
  db: PgliteDatabase<typeof schema>;
}>;

export async function createPgliteTestDatabase(): Promise<PgliteTestDatabase> {
  const client = new PGlite();
  const db = drizzle({ client, schema });

  await migrate(db, { migrationsFolder: resolve('src/db/migrations') });

  return { client, db };
}
