ALTER TABLE "callback_tokens" DROP CONSTRAINT "callback_tokens_exactly_one_target";
--> statement-breakpoint
ALTER TABLE "callback_tokens" ADD COLUMN "check_page" integer;
--> statement-breakpoint
ALTER TABLE "callback_tokens" ADD COLUMN "telegram_user_id" bigint;
--> statement-breakpoint
ALTER TABLE "callback_tokens" ADD CONSTRAINT "callback_tokens_exactly_one_target" CHECK ((("suggestion_id" IS NOT NULL)::integer + ("commitment_id" IS NOT NULL)::integer + ("check_page" IS NOT NULL)::integer) = 1);
--> statement-breakpoint
ALTER TABLE "callback_tokens" ADD CONSTRAINT "callback_tokens_check_page_actor" CHECK ((("check_page" IS NULL) AND ("telegram_user_id" IS NULL)) OR (("check_page" IS NOT NULL) AND ("telegram_user_id" IS NOT NULL) AND ("check_page" >= 0)));
