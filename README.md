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
- Analyze task scaffold support is included in:
  - `supabase/migrations/20260522023000_add_analyze_task_scaffold_support.sql`
- Task output metadata support is included in:
  - `supabase/migrations/20260522013354_add_task_output_prompt_schema_versions.sql`
- Draft reply output type support is included in:
  - `supabase/migrations/20260522180444_allow_draft_reply_output_type.sql`
- Edge Functions implemented through BE-14 include:
  - `analyze-task` (OpenAI-backed for generic paths, deterministic clarification preserved)
  - `answer-clarification` (OpenAI-backed for generic answers, deterministic App Store/helper paths preserved)
  - `complete-onboarding`
  - `generate-reply`
  - `get-access-state`
  - `validate-subscription`
  - `restore-purchases`
  - `update-task-status`
  - `message-marked-sent`
  - `reminder-create`
  - `reminder-update`
  - `reminder-cancel`
  - `reminder-snooze`
  - `notification-triggered`
  - `list-tasks`
  - `get-task-detail`
  - `get-task-outputs`
  - `get-task-events`
  - `get-checklist-items`
  - `get-reminders`
  - `feedback`
  - `delete-task`
  - `delete-all-data`
  - `delete-account`

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

## Answer clarification scaffold (BE-07)

Implemented function:
- `answer-clarification` (`POST`)

Local curl examples (placeholder tokens only):

```bash
curl -X POST "http://127.0.0.1:54321/functions/v1/answer-clarification" \
  -H "apikey: <SUPABASE_ANON_KEY>" \
  -H "Authorization: Bearer <USER_ACCESS_TOKEN>" \
  -H "Content-Type: application/json" \
  -d '{
    "task_id": "<TASK_ID_UUID>",
    "clarification_id": "<CLARIFICATION_ID_UUID>",
    "answer_text": "This was billed through App Store.",
    "billing_source": "app_store"
  }'
```

## Generate reply (BE-09)

Implemented function:
- `generate-reply` (`POST`)

Local curl examples (placeholder tokens only):

```bash
curl -X POST "http://127.0.0.1:54321/functions/v1/generate-reply" \
  -H "apikey: <SUPABASE_ANON_KEY>" \
  -H "Authorization: Bearer <USER_ACCESS_TOKEN>" \
  -H "Content-Type: application/json" \
  -d '{
    "task_id": "<TASK_ID_UUID>",
    "tone": "polite",
    "language": "English"
  }'
```

## Task actions and reminders (BE-10)

Implemented functions:
- `update-task-status` (`POST`)
- `message-marked-sent` (`POST`)
- `reminder-create` (`POST`)
- `reminder-update` (`POST`)
- `reminder-cancel` (`POST`)
- `reminder-snooze` (`POST`)
- `notification-triggered` (`POST`)

Local curl examples (placeholder tokens only):

```bash
curl -X POST "http://127.0.0.1:54321/functions/v1/update-task-status" \
  -H "apikey: <SUPABASE_ANON_KEY>" \
  -H "Authorization: Bearer <USER_ACCESS_TOKEN>" \
  -H "Content-Type: application/json" \
  -d '{
    "task_id": "<TASK_ID_UUID>",
    "status": "completed",
    "event_message": "Task marked done by user"
  }'
```

```bash
curl -X POST "http://127.0.0.1:54321/functions/v1/message-marked-sent" \
  -H "apikey: <SUPABASE_ANON_KEY>" \
  -H "Authorization: Bearer <USER_ACCESS_TOKEN>" \
  -H "Content-Type: application/json" \
  -d '{
    "task_id": "<TASK_ID_UUID>"
  }'
```

```bash
curl -X POST "http://127.0.0.1:54321/functions/v1/reminder-create" \
  -H "apikey: <SUPABASE_ANON_KEY>" \
  -H "Authorization: Bearer <USER_ACCESS_TOKEN>" \
  -H "Content-Type: application/json" \
  -d '{
    "task_id": "<TASK_ID_UUID>",
    "remind_at": "2026-06-01T09:00:00Z",
    "ios_notification_id": "<IOS_NOTIFICATION_ID>",
    "local_notification_status": "scheduled"
  }'
```

```bash
curl -X POST "http://127.0.0.1:54321/functions/v1/reminder-update" \
  -H "apikey: <SUPABASE_ANON_KEY>" \
  -H "Authorization: Bearer <USER_ACCESS_TOKEN>" \
  -H "Content-Type: application/json" \
  -d '{
    "reminder_id": "<REMINDER_ID_UUID>",
    "remind_at": "2026-06-01T10:30:00Z",
    "local_notification_status": "scheduled"
  }'
```

```bash
curl -X POST "http://127.0.0.1:54321/functions/v1/reminder-cancel" \
  -H "apikey: <SUPABASE_ANON_KEY>" \
  -H "Authorization: Bearer <USER_ACCESS_TOKEN>" \
  -H "Content-Type: application/json" \
  -d '{
    "reminder_id": "<REMINDER_ID_UUID>"
  }'
```

```bash
curl -X POST "http://127.0.0.1:54321/functions/v1/reminder-snooze" \
  -H "apikey: <SUPABASE_ANON_KEY>" \
  -H "Authorization: Bearer <USER_ACCESS_TOKEN>" \
  -H "Content-Type: application/json" \
  -d '{
    "reminder_id": "<REMINDER_ID_UUID>",
    "snooze_until": "2026-06-01T11:00:00Z",
    "local_notification_status": "scheduled"
  }'
```

```bash
curl -X POST "http://127.0.0.1:54321/functions/v1/notification-triggered" \
  -H "apikey: <SUPABASE_ANON_KEY>" \
  -H "Authorization: Bearer <USER_ACCESS_TOKEN>" \
  -H "Content-Type: application/json" \
  -d '{
    "reminder_id": "<REMINDER_ID_UUID>",
    "local_notification_status": "delivered",
    "mark_follow_up_needed": true
  }'
```

## Task read APIs (BE-11)

Implemented functions:
- `list-tasks` (`GET`)
- `get-task-detail` (`GET`)
- `get-task-outputs` (`GET`)
- `get-task-events` (`GET`)
- `get-checklist-items` (`GET`)
- `get-reminders` (`GET`)

Local curl examples (placeholder tokens only):

```bash
curl -X GET "http://127.0.0.1:54321/functions/v1/list-tasks?filter=in_progress&sort=updated_desc&limit=20&page=0" \
  -H "apikey: <SUPABASE_ANON_KEY>" \
  -H "Authorization: Bearer <USER_ACCESS_TOKEN>"
```

```bash
curl -X GET "http://127.0.0.1:54321/functions/v1/get-task-detail?task_id=<TASK_ID_UUID>" \
  -H "apikey: <SUPABASE_ANON_KEY>" \
  -H "Authorization: Bearer <USER_ACCESS_TOKEN>"
```

```bash
curl -X GET "http://127.0.0.1:54321/functions/v1/get-task-outputs?task_id=<TASK_ID_UUID>&output_type=analysis&limit=20&page=0" \
  -H "apikey: <SUPABASE_ANON_KEY>" \
  -H "Authorization: Bearer <USER_ACCESS_TOKEN>"
```

```bash
curl -X GET "http://127.0.0.1:54321/functions/v1/get-task-events?task_id=<TASK_ID_UUID>&order=desc&limit=30&page=0" \
  -H "apikey: <SUPABASE_ANON_KEY>" \
  -H "Authorization: Bearer <USER_ACCESS_TOKEN>"
```

```bash
curl -X GET "http://127.0.0.1:54321/functions/v1/get-checklist-items?task_id=<TASK_ID_UUID>&status=pending&sort=position_asc&limit=100&page=0" \
  -H "apikey: <SUPABASE_ANON_KEY>" \
  -H "Authorization: Bearer <USER_ACCESS_TOKEN>"
```

```bash
curl -X GET "http://127.0.0.1:54321/functions/v1/get-reminders?task_id=<TASK_ID_UUID>&status=scheduled&sort=remind_at_asc&limit=30&page=0" \
  -H "apikey: <SUPABASE_ANON_KEY>" \
  -H "Authorization: Bearer <USER_ACCESS_TOKEN>"
```

## StoreKit mirroring scaffold (BE-12)

Implemented functions:
- `validate-subscription` (`POST`)
- `restore-purchases` (`POST`)

Notes:
- These functions require authenticated users.
- TestFlight phase uses `ios_verified_mirror` mode only.
- Mirroring for `production` is intentionally blocked until server-side Apple validation is implemented.
- TODO markers are included for:
  - App Store Server API validation before public release.
  - App Store Server Notifications integration before public release.
- Starter Access remains backend-controlled.
- App Store trial remains StoreKit-controlled.

Local curl examples (placeholder tokens only):

```bash
curl -X POST "http://127.0.0.1:54321/functions/v1/validate-subscription" \
  -H "apikey: <SUPABASE_ANON_KEY>" \
  -H "Authorization: Bearer <USER_ACCESS_TOKEN>" \
  -H "Content-Type: application/json" \
  -d '{
    "verification_mode": "ios_verified_mirror",
    "environment": "testflight",
    "entitlement": {
      "original_transaction_id": "<ORIGINAL_TRANSACTION_ID>",
      "transaction_id": "<TRANSACTION_ID>",
      "product_id": "onedone.premium.monthly",
      "status": "trialing",
      "current_period_start": "2026-06-01T00:00:00Z",
      "current_period_end": "2026-06-15T00:00:00Z",
      "trial_started_at": "2026-06-01T00:00:00Z",
      "trial_ends_at": "2026-06-15T00:00:00Z"
    }
  }'
```

```bash
curl -X POST "http://127.0.0.1:54321/functions/v1/restore-purchases" \
  -H "apikey: <SUPABASE_ANON_KEY>" \
  -H "Authorization: Bearer <USER_ACCESS_TOKEN>" \
  -H "Content-Type: application/json" \
  -d '{
    "verification_mode": "ios_verified_mirror",
    "environment": "testflight",
    "entitlements": [
      {
        "original_transaction_id": "<ORIGINAL_TRANSACTION_ID>",
        "transaction_id": "<TRANSACTION_ID>",
        "product_id": "onedone.premium.monthly",
        "status": "active",
        "current_period_start": "2026-06-01T00:00:00Z",
        "current_period_end": "2026-07-01T00:00:00Z"
      }
    ]
  }'
```

```bash
curl -X POST "http://127.0.0.1:54321/functions/v1/generate-reply" \
  -H "apikey: <SUPABASE_ANON_KEY>" \
  -H "Authorization: Bearer <USER_ACCESS_TOKEN>" \
  -H "Content-Type: application/json" \
  -d '{
    "task_id": "<TASK_ID_UUID>",
    "tone": "shorter",
    "language": "auto"
  }'
```

```bash
curl -X POST "http://127.0.0.1:54321/functions/v1/answer-clarification" \
  -H "apikey: <SUPABASE_ANON_KEY>" \
  -H "Authorization: Bearer <USER_ACCESS_TOKEN>" \
  -H "Content-Type: application/json" \
  -d '{
    "task_id": "<TASK_ID_UUID>",
    "clarification_id": "<CLARIFICATION_ID_UUID>",
    "answer_text": "I am not sure where I was charged."
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
