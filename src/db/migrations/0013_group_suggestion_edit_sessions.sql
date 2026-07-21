ALTER TABLE "suggestion_edit_sessions" ADD COLUMN "workspace_id" uuid;--> statement-breakpoint
ALTER TABLE "suggestion_edit_sessions" ADD COLUMN "chat_id" uuid;--> statement-breakpoint
ALTER TABLE "suggestion_edit_sessions" ADD COLUMN "instruction_telegram_message_id" bigint;--> statement-breakpoint
ALTER TABLE "suggestion_edit_sessions" ADD CONSTRAINT "suggestion_edit_sessions_chat_workspace_fkey" FOREIGN KEY ("chat_id","workspace_id") REFERENCES "public"."chats"("id","workspace_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "suggestion_edit_sessions_group_reply_idx" ON "suggestion_edit_sessions" USING btree ("actor_user_id","workspace_id","chat_id","instruction_telegram_message_id","expires_at");
