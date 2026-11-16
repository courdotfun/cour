CREATE SCHEMA IF NOT EXISTS "app";
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "app"."follows" (
	"follower" text NOT NULL,
	"target" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "follows_follower_target_pk" PRIMARY KEY("follower","target")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "app"."profiles" (
	"address" text PRIMARY KEY NOT NULL,
	"name" text,
	"bio" text,
	"avatar_cid" text,
	"website" text,
	"x" text,
	"telegram" text,
	"discord" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "app"."token_updates" (
	"id" serial PRIMARY KEY NOT NULL,
	"token" text NOT NULL,
	"author" text NOT NULL,
	"title" text,
	"body" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "follows_target_idx" ON "app"."follows" USING btree ("target");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "token_updates_token_idx" ON "app"."token_updates" USING btree ("token");