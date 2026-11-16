import "server-only";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

// Lazy singleton. The app runs without a DB for read-only/indexer features;
// any route that needs persistence calls getDb() and returns 503 if unset.
let _sql: ReturnType<typeof postgres> | null = null;
let _db: ReturnType<typeof drizzle<typeof schema>> | null = null;

export function dbConfigured(): boolean {
  return !!process.env.APP_DATABASE_URL;
}

export function getDb() {
  if (!process.env.APP_DATABASE_URL) {
    throw new Error("APP_DATABASE_URL not set");
  }
  if (!_db) {
    const url = process.env.APP_DATABASE_URL;
    const ssl = /sslmode=require|proxy\.rlwy\.net|railway/.test(url) ? { rejectUnauthorized: false } : undefined;
    _sql = postgres(url, {
      max: 5,
      prepare: false,
      ssl,
      // the "app" schema is created by migrations; search_path not required
    });
    _db = drizzle(_sql, { schema });
  }
  return _db;
}

export { schema };
