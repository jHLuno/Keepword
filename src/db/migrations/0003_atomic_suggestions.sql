ALTER TABLE "commitment_suggestions" ADD COLUMN "normalized_title" text;
--> statement-breakpoint
UPDATE "commitment_suggestions"
SET "normalized_title" = lower(regexp_replace(btrim("title"), '\s+', ' ', 'g'));
--> statement-breakpoint
ALTER TABLE "commitment_suggestions" ALTER COLUMN "normalized_title" SET NOT NULL;
--> statement-breakpoint
CREATE UNIQUE INDEX "commitment_suggestions_pending_normalized_unique"
ON "commitment_suggestions" USING btree ("workspace_id", "chat_id", "assignee_user_id", "normalized_title")
WHERE "status" = 'pending' AND "assignee_user_id" IS NOT NULL;
