# OpenRouter Gemini Implementation Plan

**Goal:** Route commitment extraction through OpenRouter Gemini 2.5 Flash Lite.

1. Add failing config and extractor tests for `OPENROUTER_API_KEY`, OpenRouter
   base URL, model ID, and JSON-schema completion parsing.
2. Replace OpenAI Responses client contract with a Chat Completions contract;
   parse content JSON through existing Zod schema and preserve provenance checks.
3. Update app client construction, environment template, README, PROJECT, and
   Railway deployment documentation.
4. Run focused tests, then lint, typecheck, full tests, build, and commit.
