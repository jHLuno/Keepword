CREATE TABLE "commitment_reschedule_sessions" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "commitment_id" uuid NOT NULL,
  "actor_telegram_user_id" bigint NOT NULL,
  "expires_at" timestamp with time zone NOT NULL,
  "used_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "commitment_reschedule_sessions" ADD CONSTRAINT "commitment_reschedule_sessions_commitment_fkey" FOREIGN KEY ("commitment_id") REFERENCES "public"."commitments"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "commitment_reschedule_sessions_actor_expiry_idx" ON "commitment_reschedule_sessions" USING btree ("actor_telegram_user_id", "expires_at");
