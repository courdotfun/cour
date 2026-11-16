// Apply Drizzle migrations. Run: APP_DATABASE_URL=... pnpm db:migrate
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";

const url = process.env.APP_DATABASE_URL;
if (!url) {
  console.error("APP_DATABASE_URL not set");
  process.exit(1);
}

const sql = postgres(url, { max: 1, prepare: false });
const db = drizzle(sql);

// Ensure the app schema exists before migrating.
await sql`CREATE SCHEMA IF NOT EXISTS app`;
await migrate(db, { migrationsFolder: "./db/migrations" });
await sql.end();
console.error("migrations applied");
