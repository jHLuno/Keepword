ALTER TABLE "chat_memberships" DROP CONSTRAINT "chat_memberships_chat_id_chats_id_fk";
--> statement-breakpoint
ALTER TABLE "commitment_sources" DROP CONSTRAINT "commitment_sources_chat_id_chats_id_fk";
--> statement-breakpoint
ALTER TABLE "commitment_sources" DROP CONSTRAINT "commitment_sources_commitment_id_commitments_id_fk";
--> statement-breakpoint
ALTER TABLE "commitment_sources" DROP CONSTRAINT "commitment_sources_source_message_id_source_messages_id_fk";
--> statement-breakpoint
ALTER TABLE "commitment_suggestions" DROP CONSTRAINT "commitment_suggestions_chat_id_chats_id_fk";
--> statement-breakpoint
ALTER TABLE "commitment_suggestions" DROP CONSTRAINT "commitment_suggestions_source_message_id_source_messages_id_fk";
--> statement-breakpoint
ALTER TABLE "commitment_suggestions" DROP CONSTRAINT "commitment_suggestions_assignee_user_id_users_id_fk";
--> statement-breakpoint
ALTER TABLE "commitments" DROP CONSTRAINT "commitments_chat_id_chats_id_fk";
--> statement-breakpoint
ALTER TABLE "commitments" DROP CONSTRAINT "commitments_assignee_user_id_users_id_fk";
--> statement-breakpoint
ALTER TABLE "commitments" DROP CONSTRAINT "commitments_confirmed_by_user_id_users_id_fk";
--> statement-breakpoint
ALTER TABLE "notification_deliveries" DROP CONSTRAINT "notification_deliveries_commitment_id_commitments_id_fk";
--> statement-breakpoint
ALTER TABLE "notification_deliveries" DROP CONSTRAINT "notification_deliveries_user_id_users_id_fk";
--> statement-breakpoint
ALTER TABLE "notification_deliveries" DROP CONSTRAINT "notification_deliveries_chat_id_chats_id_fk";
--> statement-breakpoint
ALTER TABLE "onboarding_tokens" DROP CONSTRAINT "onboarding_tokens_chat_id_chats_id_fk";
--> statement-breakpoint
ALTER TABLE "onboarding_tokens" DROP CONSTRAINT "onboarding_tokens_used_by_user_id_users_id_fk";
--> statement-breakpoint
ALTER TABLE "source_messages" DROP CONSTRAINT "source_messages_chat_id_chats_id_fk";
--> statement-breakpoint
ALTER TABLE "source_messages" DROP CONSTRAINT "source_messages_author_user_id_users_id_fk";
--> statement-breakpoint
ALTER TABLE "notification_deliveries" ALTER COLUMN "workspace_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "notification_deliveries" ALTER COLUMN "chat_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "source_messages" ALTER COLUMN "author_user_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "chats" ADD CONSTRAINT "chats_id_workspace_unique" UNIQUE("id","workspace_id");--> statement-breakpoint
ALTER TABLE "chat_memberships" ADD CONSTRAINT "chat_memberships_chat_workspace_user_unique" UNIQUE("chat_id","workspace_id","user_id");--> statement-breakpoint
ALTER TABLE "commitments" ADD CONSTRAINT "commitments_id_workspace_chat_unique" UNIQUE("id","workspace_id","chat_id");--> statement-breakpoint
ALTER TABLE "source_messages" ADD CONSTRAINT "source_messages_id_workspace_chat_unique" UNIQUE("id","workspace_id","chat_id");--> statement-breakpoint
ALTER TABLE "chat_memberships" ADD CONSTRAINT "chat_memberships_chat_workspace_fkey" FOREIGN KEY ("chat_id","workspace_id") REFERENCES "public"."chats"("id","workspace_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "commitment_sources" ADD CONSTRAINT "commitment_sources_chat_workspace_fkey" FOREIGN KEY ("chat_id","workspace_id") REFERENCES "public"."chats"("id","workspace_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "commitment_sources" ADD CONSTRAINT "commitment_sources_commitment_scope_fkey" FOREIGN KEY ("commitment_id","workspace_id","chat_id") REFERENCES "public"."commitments"("id","workspace_id","chat_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "commitment_sources" ADD CONSTRAINT "commitment_sources_source_scope_fkey" FOREIGN KEY ("source_message_id","workspace_id","chat_id") REFERENCES "public"."source_messages"("id","workspace_id","chat_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "commitment_suggestions" ADD CONSTRAINT "commitment_suggestions_chat_workspace_fkey" FOREIGN KEY ("chat_id","workspace_id") REFERENCES "public"."chats"("id","workspace_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "commitment_suggestions" ADD CONSTRAINT "commitment_suggestions_source_scope_fkey" FOREIGN KEY ("source_message_id","workspace_id","chat_id") REFERENCES "public"."source_messages"("id","workspace_id","chat_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "commitment_suggestions" ADD CONSTRAINT "commitment_suggestions_assignee_membership_fkey" FOREIGN KEY ("chat_id","workspace_id","assignee_user_id") REFERENCES "public"."chat_memberships"("chat_id","workspace_id","user_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "commitments" ADD CONSTRAINT "commitments_chat_workspace_fkey" FOREIGN KEY ("chat_id","workspace_id") REFERENCES "public"."chats"("id","workspace_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "commitments" ADD CONSTRAINT "commitments_assignee_membership_fkey" FOREIGN KEY ("chat_id","workspace_id","assignee_user_id") REFERENCES "public"."chat_memberships"("chat_id","workspace_id","user_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "commitments" ADD CONSTRAINT "commitments_confirmer_membership_fkey" FOREIGN KEY ("chat_id","workspace_id","confirmed_by_user_id") REFERENCES "public"."chat_memberships"("chat_id","workspace_id","user_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notification_deliveries" ADD CONSTRAINT "notification_deliveries_chat_workspace_fkey" FOREIGN KEY ("chat_id","workspace_id") REFERENCES "public"."chats"("id","workspace_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notification_deliveries" ADD CONSTRAINT "notification_deliveries_commitment_scope_fkey" FOREIGN KEY ("commitment_id","workspace_id","chat_id") REFERENCES "public"."commitments"("id","workspace_id","chat_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notification_deliveries" ADD CONSTRAINT "notification_deliveries_recipient_membership_fkey" FOREIGN KEY ("chat_id","workspace_id","user_id") REFERENCES "public"."chat_memberships"("chat_id","workspace_id","user_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "onboarding_tokens" ADD CONSTRAINT "onboarding_tokens_chat_workspace_fkey" FOREIGN KEY ("chat_id","workspace_id") REFERENCES "public"."chats"("id","workspace_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "onboarding_tokens" ADD CONSTRAINT "onboarding_tokens_consumer_membership_fkey" FOREIGN KEY ("chat_id","workspace_id","used_by_user_id") REFERENCES "public"."chat_memberships"("chat_id","workspace_id","user_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "source_messages" ADD CONSTRAINT "source_messages_chat_workspace_fkey" FOREIGN KEY ("chat_id","workspace_id") REFERENCES "public"."chats"("id","workspace_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "source_messages" ADD CONSTRAINT "source_messages_author_membership_fkey" FOREIGN KEY ("chat_id","workspace_id","author_user_id") REFERENCES "public"."chat_memberships"("chat_id","workspace_id","user_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
