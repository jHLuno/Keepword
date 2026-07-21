ALTER TABLE "callback_tokens" DROP CONSTRAINT "callback_tokens_exactly_one_target";--> statement-breakpoint
ALTER TABLE "callback_tokens" DROP CONSTRAINT "callback_tokens_check_page_actor";--> statement-breakpoint
ALTER TABLE "callback_tokens" ADD CONSTRAINT "callback_tokens_target_shape" CHECK (
  (
    "suggestion_id" IS NOT NULL
    AND "commitment_id" IS NULL
    AND "check_page" IS NULL
    AND "telegram_user_id" IS NULL
  )
  OR (
    "suggestion_id" IS NULL
    AND "commitment_id" IS NOT NULL
    AND "check_page" IS NULL
    AND "telegram_user_id" IS NULL
  )
  OR (
    "suggestion_id" IS NULL
    AND "commitment_id" IS NULL
    AND "check_page" IS NOT NULL
    AND "telegram_user_id" IS NOT NULL
    AND "check_page" >= 0
    AND "action" IN ('check_page', 'check_back')
  )
  OR (
    "suggestion_id" IS NULL
    AND "commitment_id" IS NOT NULL
    AND "check_page" IS NOT NULL
    AND "telegram_user_id" IS NOT NULL
    AND "check_page" >= 0
    AND "action" IN ('check_commitment', 'block', 'complete', 'reschedule')
  )
);
