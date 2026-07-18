CREATE TYPE "public"."suggestion_event_type" AS ENUM('suggested', 'edited', 'confirmed', 'rejected');--> statement-breakpoint
ALTER TABLE "commitment_suggestions" ADD CONSTRAINT "commitment_suggestions_id_workspace_chat_unique" UNIQUE("id","workspace_id","chat_id");--> statement-breakpoint
CREATE TABLE "suggestion_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"chat_id" uuid NOT NULL,
	"suggestion_id" uuid NOT NULL,
	"event_type" "suggestion_event_type" NOT NULL,
	"actor_user_id" uuid NOT NULL,
	"snapshot" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "suggestion_events" ADD CONSTRAINT "suggestion_events_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "suggestion_events" ADD CONSTRAINT "suggestion_events_chat_workspace_fkey" FOREIGN KEY ("chat_id","workspace_id") REFERENCES "public"."chats"("id","workspace_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "suggestion_events" ADD CONSTRAINT "suggestion_events_suggestion_scope_fkey" FOREIGN KEY ("suggestion_id","workspace_id","chat_id") REFERENCES "public"."commitment_suggestions"("id","workspace_id","chat_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "suggestion_events" ADD CONSTRAINT "suggestion_events_actor_membership_fkey" FOREIGN KEY ("chat_id","workspace_id","actor_user_id") REFERENCES "public"."chat_memberships"("chat_id","workspace_id","user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "suggestion_events_workspace_chat_created_idx" ON "suggestion_events" USING btree ("workspace_id","chat_id","created_at");--> statement-breakpoint
CREATE INDEX "suggestion_events_suggestion_created_idx" ON "suggestion_events" USING btree ("suggestion_id","created_at");
