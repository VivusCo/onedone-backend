# OneDone Backend

## Supabase project scaffold (BE-01)

This repository uses the standard Supabase CLI structure:
- `supabase/config.toml`
- `supabase/migrations/`
- `supabase/functions/`

Local setup:
1. Install the Supabase CLI.
2. Start local Supabase services:
   - `supabase start`
3. Reset local database state during development:
   - `supabase db reset`
4. Stop local services when done:
   - `supabase stop`

Notes:
- Core database schema is included in:
  - `supabase/migrations/20260521232500_add_core_database_schema.sql`
- RLS policies and profile/update triggers are included in:
  - `supabase/migrations/20260522004500_add_rls_policies_and_triggers.sql`
- Starter onboarding completion field is included in:
  - `supabase/migrations/20260522013000_add_onboarding_completed_at_to_profiles.sql`
- Edge Functions currently include starter access state endpoints only:
  - `analyze-task` (deterministic scaffold, no OpenAI)
  - `complete-onboarding`
  - `get-access-state`

## Access state functions (BE-04)

Implemented functions:
- `complete-onboarding` (`POST`)
- `get-access-state` (`GET`)

Local curl examples (placeholder tokens only):

```bash
curl -X POST "http://127.0.0.1:54321/functions/v1/complete-onboarding" \
  -H "apikey: <SUPABASE_ANON_KEY>" \
  -H "Authorization: Bearer <USER_ACCESS_TOKEN>" \
  -H "Content-Type: application/json" \
  -d "{}"
```

```bash
curl -X GET "http://127.0.0.1:54321/functions/v1/get-access-state" \
  -H "apikey: <SUPABASE_ANON_KEY>" \
  -H "Authorization: Bearer <USER_ACCESS_TOKEN>"
```

## Analyze task scaffold (BE-06)

Implemented function:
- `analyze-task` (`POST`)

Local curl examples (placeholder tokens only):

```bash
curl -X POST "http://127.0.0.1:54321/functions/v1/analyze-task" \
  -H "apikey: <SUPABASE_ANON_KEY>" \
  -H "Authorization: Bearer <USER_ACCESS_TOKEN>" \
  -H "Idempotency-Key: <UUID_OR_UNIQUE_KEY>" \
  -H "Content-Type: application/json" \
  -d '{
    "input_text": "I want to cancel my subscription but I am not sure where it is billed.",
    "selected_template": "cancel_subscription"
  }'
```

```bash
curl -X POST "http://127.0.0.1:54321/functions/v1/analyze-task" \
  -H "apikey: <SUPABASE_ANON_KEY>" \
  -H "Authorization: Bearer <USER_ACCESS_TOKEN>" \
  -H "Idempotency-Key: <UUID_OR_UNIQUE_KEY>" \
  -H "Content-Type: application/json" \
  -d '{
    "input_text": "Need help drafting steps to resolve a billing question",
    "selected_template": "understand_bill",
    "billing_source": "App Store"
  }'
```

## Environment and secret handling

Local development:
- Use `supabase/.env` for local secrets and environment variables.
- Start from the safe template:
  - `cp supabase/.env.example supabase/.env`
- Keep real values only in `supabase/.env` on your machine.

Hosted Supabase:
- Set hosted secrets with the Supabase CLI:
  - `supabase secrets set OPENAI_API_KEY="..." SUPABASE_AUTH_SMS_TWILIO_AUTH_TOKEN="..." SUPABASE_AUTH_EXTERNAL_APPLE_SECRET="..."`
- Do not store hosted secret values in files committed to this repository.

OpenAI key usage:
- Edge Functions must read the key from environment variables:
  - `Deno.env.get("OPENAI_API_KEY")`
- Do not hardcode the OpenAI API key in source code.

Security rules:
- Never commit secrets.
- Never print secret values in logs, docs, or commits.
- `.env` files are intentionally gitignored for safety.
