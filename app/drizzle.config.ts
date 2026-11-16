import { defineConfig } from "drizzle-kit";

export default defineConfig({
  schema: "./db/schema.ts",
  out: "./db/migrations",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.APP_DATABASE_URL ?? "postgres://localhost:5432/placeholder",
  },
  // our tables live in the "app" pg schema
  schemaFilter: ["app"],
  verbose: true,
  strict: true,
});
