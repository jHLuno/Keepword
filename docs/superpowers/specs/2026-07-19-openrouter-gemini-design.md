# OpenRouter Gemini Extraction Design

Keepword will use OpenRouter's OpenAI-compatible Chat Completions endpoint for
commitment extraction. The model is fixed to `google/gemini-2.5-flash-lite`.

`OPENROUTER_API_KEY` replaces `OPENAI_API_KEY`. The existing `openai` package
remains as the HTTP client with `baseURL` set to `https://openrouter.ai/api/v1`.
The extractor changes from the OpenAI-specific Responses API to Chat
Completions JSON Schema output, then keeps its existing Zod validation,
bounded-context checks, and source-ID provenance validation.

No Telegram, persistence, authorization, or logging behavior changes.
