# OneDone Backend — Codex Instructions

You are working on the Supabase backend only.

Documentation workflow:
- The local `/docs` files are source of truth for backend implementation tasks.
- Before backend architecture, schema, or Edge Function work, read `docs/02_backend_spec_v6.md`.
- Before MVP scope or build-order work, read `docs/03_mvp_implementation_plan_v2.md`.
- Before API endpoint/request/response work, read `docs/04_api_contract.md`.
- Before QA, validation, or review tasks, read `docs/06_test_cases.md`.
- If a user prompt conflicts with these docs, stop implementation and ask for clarification.

Tech stack:
- Supabase
- Postgres
- Row Level Security
- Edge Functions
- TypeScript / Deno
- OpenAI API through Edge Functions only
- StoreKit validation / mirroring

Product rules:
- 3-day Starter Access is backend-controlled.
- App Store 14-day trial is StoreKit-controlled.
- onboarding_required is checked before access state.
- tasks are created through analyze-task, except split children.
- generate-reply requires task_id.
- task_outputs store AI outputs.
- task_events store user-facing timeline.
- usage_events must not store raw user content.

Do not:
- write iOS code
- disable RLS
- put secrets into code
- let iOS call OpenAI directly
- create backend-only App Store trial
- implement external account access

Definition of done:
- migrations run with supabase db reset
- RLS policies are included
- Edge Functions validate auth and access state
- API contract is updated
- local curl examples are provided where practical
