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
- This scaffold intentionally does not include database schema migrations yet.
- This scaffold intentionally does not include Edge Functions yet.

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
