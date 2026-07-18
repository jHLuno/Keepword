CREATE TABLE "manual_capture_sources" (
  "id" serial PRIMARY KEY NOT NULL,
  "workspace_id" uuid NOT NULL REFERENCES "workspaces"("id") ON DELETE CASCADE,
  "chat_id" uuid NOT NULL,
  "sender_telegram_user_id" bigint NOT NULL,
  "private_telegram_message_id" bigint NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "manual_capture_sources_chat_sender_message_unique" UNIQUE("chat_id", "sender_telegram_user_id", "private_telegram_message_id"),
  CONSTRAINT "manual_capture_sources_chat_workspace_fkey" FOREIGN KEY ("chat_id", "workspace_id") REFERENCES "chats"("id", "workspace_id") ON DELETE CASCADE
);
