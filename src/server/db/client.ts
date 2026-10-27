import Database from "better-sqlite3";
import { drizzle, type BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import fs from "node:fs";
import path from "node:path";
import * as schema from "./schema";

export type DB = BetterSQLite3Database<typeof schema> & { $client: Database.Database };

export function dbPath(): string {
  return process.env.PUROJEKUTO_DB_PATH || path.join(process.cwd(), "data", "purojekuto.db");
}

function migrationsFolder(): string {
  const candidates = [
    process.env.PUROJEKUTO_MIGRATIONS_DIR,
    path.join(process.cwd(), "drizzle"),
  ].filter(Boolean) as string[];
  const found = candidates.find((p) => fs.existsSync(path.join(p, "meta", "_journal.json")));
  if (!found) throw new Error(`Drizzle migrations not found (looked in ${candidates.join(", ")})`);
  return found;
}

/** Open a database and apply migrations. */
export function createDb(file = dbPath()): DB {
  if (file !== ":memory:") fs.mkdirSync(path.dirname(file), { recursive: true });
  const sqlite = new Database(file);
  sqlite.pragma("journal_mode = WAL");
  sqlite.pragma("foreign_keys = ON");
  sqlite.pragma("busy_timeout = 5000");
  const db = drizzle(sqlite, { schema }) as DB;
  migrate(db, { migrationsFolder: migrationsFolder() });
  return db;
}

// One connection per process; survive Next.js dev hot reloads.
const globalForDb = globalThis as unknown as { __puroDb?: DB };

export function db(): DB {
  if (!globalForDb.__puroDb) globalForDb.__puroDb = createDb();
  return globalForDb.__puroDb;
}

/** Test hook: swap the process-wide database. */
export function setDbForTests(next: DB) {
  globalForDb.__puroDb = next;
}
