CREATE TABLE "callback_tokens" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "action" text NOT NULL,
  "nonce_hash" text NOT NULL,
  "suggestion_id" uuid,
  "commitment_id" uuid,
  "expires_at" timestamp with time zone NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "callback_tokens_nonce_hash_unique" UNIQUE("nonce_hash"),
  CONSTRAINT "callback_tokens_exactly_one_target" CHECK (("suggestion_id" IS NOT NULL) <> ("commitment_id" IS NOT NULL))
);
--> statement-breakpoint
ALTER TABLE "callback_tokens" ADD CONSTRAINT "callback_tokens_suggestion_fkey" FOREIGN KEY ("suggestion_id") REFERENCES "public"."commitment_suggestions"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "callback_tokens" ADD CONSTRAINT "callback_tokens_commitment_fkey" FOREIGN KEY ("commitment_id") REFERENCES "public"."commitments"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "callback_tokens_action_expiry_idx" ON "callback_tokens" USING btree ("action", "expires_at");
--> statement-breakpoint
CREATE TABLE "suggestion_edit_sessions" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "suggestion_id" uuid NOT NULL,
  "actor_user_id" uuid NOT NULL,
  "expires_at" timestamp with time zone NOT NULL,
  "used_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "suggestion_edit_sessions" ADD CONSTRAINT "suggestion_edit_sessions_suggestion_fkey" FOREIGN KEY ("suggestion_id") REFERENCES "public"."commitment_suggestions"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "suggestion_edit_sessions" ADD CONSTRAINT "suggestion_edit_sessions_actor_fkey" FOREIGN KEY ("actor_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "suggestion_edit_sessions_actor_expiry_idx" ON "suggestion_edit_sessions" USING btree ("actor_user_id", "expires_at");
