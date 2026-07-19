ALTER TABLE "chats" ADD COLUMN "language" text DEFAULT 'auto' NOT NULL;--> statement-breakpoint
ALTER TABLE "commitment_suggestions" ADD COLUMN "language" text DEFAULT 'en' NOT NULL;--> statement-breakpoint
ALTER TABLE "commitments" ADD COLUMN "language" text DEFAULT 'en' NOT NULL;
