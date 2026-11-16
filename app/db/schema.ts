import {
  pgSchema,
  text,
  timestamp,
  serial,
  primaryKey,
  index,
} from "drizzle-orm/pg-core";

// All off-chain app data lives in a dedicated "app" schema so it can share a
// Postgres instance with the Ponder indexer without colliding.
export const app = pgSchema("app");

// One profile per address (address stored lowercase, 0x-prefixed).
export const profiles = app.table("profiles", {
  address: text("address").primaryKey(),
  name: text("name"),
  bio: text("bio"),
  avatarCid: text("avatar_cid"),
  website: text("website"),
  x: text("x"),
  telegram: text("telegram"),
  discord: text("discord"),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

// follower follows target (both lowercase addresses).
export const follows = app.table(
  "follows",
  {
    follower: text("follower").notNull(),
    target: text("target").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.follower, t.target] }),
    targetIdx: index("follows_target_idx").on(t.target),
  }),
);

// Creator-authored updates for a token (token + author lowercase addresses).
// Write is gated server-side to the on-chain creator of the token.
export const tokenUpdates = app.table(
  "token_updates",
  {
    id: serial("id").primaryKey(),
    token: text("token").notNull(),
    author: text("author").notNull(),
    title: text("title"),
    body: text("body").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    tokenIdx: index("token_updates_token_idx").on(t.token),
  }),
);

export type Profile = typeof profiles.$inferSelect;
export type TokenUpdate = typeof tokenUpdates.$inferSelect;
