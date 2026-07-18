ALTER TABLE "callback_tokens" ADD COLUMN "consumed_at" timestamp with time zone;
--> statement-breakpoint
CREATE INDEX "callback_tokens_action_claim_idx" ON "callback_tokens" USING btree ("action", "expires_at", "consumed_at");
