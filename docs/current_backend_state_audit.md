# Current Backend State Audit

Date: 2026-05-28
Scope: repository current state audit for documentation sync (no code changes).

## 1) Database schema

Primary schema source:
- `supabase/migrations/20260521232500_add_core_database_schema.sql`

Follow-up schema migrations in active history:
- `supabase/migrations/20260522004500_add_rls_policies_and_triggers.sql`
- `supabase/migrations/20260522013000_add_onboarding_completed_at_to_profiles.sql`
- `supabase/migrations/20260522013354_add_task_output_prompt_schema_versions.sql`
- `supabase/migrations/20260522023000_add_analyze_task_scaffold_support.sql`
- `supabase/migrations/20260522180444_allow_draft_reply_output_type.sql`
- `supabase/migrations/20260522181703_add_task_actions_and_reminder_status_rpc.sql`
- `supabase/migrations/20260526001000_align_reminders_notification_columns.sql`

### Core tables present

- `profiles`
  - Key columns: `id` (FK to `auth.users`), `onboarding_required`, `onboarding_completed_at`, `starter_started_at`, `starter_ends_at`, `starter_status`, timestamps.
  - Starter status constraint present.
- `subscriptions`
  - Key columns: `user_id`, `provider`, `product_id`, `original_transaction_id`, `status`, period/trial/cancel timestamps, `last_verified_at`, `metadata`.
- `subscription_events`
  - Key columns: `subscription_id`, `user_id`, `event_type`, `event_source`, `event_at`, `payload`.
- `tasks`
  - Key columns: `user_id`, `parent_task_id` (`ON DELETE SET NULL`), `title`, `description`, `status`, `priority`, `source`, `due_at`, `completed_at`, `archived_at`, timestamps.
  - Added later: `current_next_step`, `current_output_id` (FK to `task_outputs`, `ON DELETE SET NULL`).
- `task_outputs`
  - Key columns: `user_id`, `task_id`, `output_type`, `content` (jsonb), `is_current`, `model`, `tokens_prompt`, `tokens_completion`, `prompt_version`, `schema_version`, timestamps.
- `task_events`
  - Key columns: `user_id`, `task_id`, `event_type`, `event_message`, `event_metadata`, timestamp.
- `clarifications`
  - Key columns: `user_id`, `task_id`, `question`, `answer`, `status`, `requested_at`, `answered_at`, timestamps.
- `checklist_items`
  - Key columns: `user_id`, `task_id`, `content`, `position`, `status`, `completed_at`, timestamps.
- `reminders`
  - Key columns: `user_id`, `task_id`, `remind_at`, `ios_notification_id`, `local_notification_status`, `status`, `channel`, `sent_at`, timestamps.
- `user_notes`
- `incoming_replies`
- `task_feedback`
- `attachments` (schema/planning surface; storage cleanup still TODO/v1.1)
- `usage_events`
  - Key columns: `user_id`, optional `task_id`, `event_name`, `event_category`, `event_source`, `quantity`, `properties`, timestamp.

### Task status values in schema (current)

From `tasks_status_check` in `20260522181703_add_task_actions_and_reminder_status_rpc.sql`:
- `pending`
- `in_progress`
- `needs_clarification`
- `waiting_for_user`
- `waiting_for_reply`
- `completed`
- `canceled`
- `failed`

### Reminder notification columns

Expected by reminder endpoints and read APIs:
- `ios_notification_id text`
- `local_notification_status text not null default 'not_scheduled'`

Current migration history includes a compatibility/drift fix:
- `20260526001000_align_reminders_notification_columns.sql`

This migration safely adds/backfills both columns and indexes if missing.

### Important indexes/check constraints (high-level)

- Tasks: user/status/date indexes + parent_task index.
- Task outputs: task/output_type/current indexes.
- Task events: task/user time indexes.
- Clarifications/checklist/reminders: task/user status/time indexes.
- Usage events: user/event/time indexes.
- Reminder-specific indexes include:
  - partial index on `ios_notification_id` when not null
  - composite index on `(user_id, local_notification_status)`

## 2) Edge functions / endpoints

Function source root:
- `supabase/functions/`

All listed functions use `requireAuthenticatedUser(...)` unless noted.

### Endpoint matrix (concise)

| Function | Purpose | Method | Inputs / query | Output shape | Auth | Error behavior / limitations |
|---|---|---|---|---|---|---|
| `complete-onboarding` | Mark onboarding complete and start Starter Access window | `POST` | none | `{ ok: true, ...access_state }` | required | Uses simpler `{ error: string }` failures (not standardized shape) |
| `get-access-state` | Read backend access state | `GET` | none | `{ ok: true, ...access_state }` | required | Uses simpler `{ error: string }` failures |
| `analyze-task` | Create/analyze task (AI or clarification path) | `POST` | body: `input_text`, optional `selected_template`, optional `billing_source`; header: optional `Idempotency-Key` | `{ ok:true, response_type: clarification|task_analysis, ... }` | required | Structured errors, rate limits, idempotency conflict/in-progress handling |
| `answer-clarification` | Apply clarification answer and generate next analysis | `POST` | body: `task_id`, `clarification_id`, `answer_text`, optional `billing_source` | `{ ok:true, response_type: task_analysis, ... }` | required | Structured errors, ownership checks, clarification limits, rate limits |
| `generate-reply` | Draft reply text from task context | `POST` | body: `task_id`, optional `tone`, optional `language` | `{ ok:true, output_type:draft_reply, ... }` | required | Structured errors, task required, rate limits, regenerate cap |
| `list-tasks` | Return user task list with filters/sort/pagination | `GET` | query: `filter`, `sort`, `limit`, `page` | `{ ok:true, pagination, tasks[] }` | required | `follow_up_needed` and `done` map to schema values (`waiting_for_user`, `completed`) |
| `get-task-detail` | Return task detail + compact summary counts | `GET` | query: `task_id` | `{ ok:true, task, current_output, summary }` | required | Ownership-validated task lookup |
| `get-task-outputs` | Return task outputs history | `GET` | query: `task_id`, optional `output_type`, `limit`, `page` | `{ ok:true, pagination, outputs[] }` | required | Ownership check through parent task |
| `get-task-events` | Return timeline events | `GET` | query: `task_id`, optional `order`, `limit`, `page` | `{ ok:true, pagination, events[] }` | required | Ownership check through parent task |
| `get-checklist-items` | Return checklist rows for task | `GET` | query: `task_id`, optional `status`, `sort`, `limit`, `page` | `{ ok:true, pagination, items[] }` | required | Ownership check through parent task |
| `get-reminders` | Return reminders (task-scoped or all-user) | `GET` | query: optional `task_id`, optional `status`, optional `local_notification_status`, `sort`, `limit`, `page` | `{ ok:true, pagination, reminders[] }` | required | Includes legacy fallback when reminder columns missing (42703) |
| `update-task-status` | Atomically change task status + create event | `POST` | body: `task_id`, `status`, optional `event_message` | `{ ok:true, task_id, status, completed_at, event_message }` | required | RPC-backed; structured errors |
| `message-marked-sent` | Mark user-sent message and move to waiting reply | `POST` | body: `task_id` | `{ ok:true, status:waiting_for_reply, ... }` | required | RPC-backed; no external send claim |
| `reminder-create` | Create reminder synced from iOS local scheduling | `POST` | body: `task_id`, `remind_at`, `ios_notification_id`, optional `local_notification_status` | `{ ok:true, reminder, event_message }` | required | Fails if task not owned/found |
| `reminder-update` | Update existing reminder scheduling/sync metadata | `POST` | body: `reminder_id`, optional `remind_at`, optional `ios_notification_id`, optional `local_notification_status` | `{ ok:true, reminder, event_message }` | required | Canceled reminders are immutable |
| `reminder-cancel` | Cancel reminder sync state | `POST` | body: `reminder_id` | `{ ok:true, reminder, event_message }` | required | Idempotent-style behavior for already-canceled reminders |
| `reminder-snooze` | Snooze reminder time and sync metadata | `POST` | body: `reminder_id`, `snooze_until`, optional `ios_notification_id`, optional `local_notification_status` | `{ ok:true, reminder, event_message }` | required | Rejects canceled reminders |
| `notification-triggered` | Mark local notification delivered/opened and optional follow-up transition | `POST` | body: `reminder_id`, `local_notification_status`, optional `triggered_at`, optional `mark_follow_up_needed` | `{ ok:true, reminder/task status summary }` | required | Won’t move `completed` tasks to follow-up-needed |
| `validate-subscription` | Mirror one verified entitlement from iOS StoreKit | `POST` | body: `verification_mode`, `entitlement{...}` | `{ ok:true, mode, environment, subscription, access_state, todo }` | required | `production` mirror rejected; server-side Apple validation is TODO |
| `restore-purchases` | Mirror multiple verified entitlements from iOS restore flow | `POST` | body: `verification_mode`, `entitlements[]` | `{ ok:true, restored_count, subscriptions[], access_state, todo }` | required | Same scaffold limits as validate-subscription |
| `feedback` | Store user feedback linked to task/output | `POST` | body: `task_id`, optional `output_id`, optional `rating`, optional `feedback_type`, optional `comment` | `{ ok:true, feedback... }` | required | Validates task/output ownership before insert |
| `delete-task` | Delete one task-scoped data set | `POST` | body: `task_id` | `{ ok:true, deleted_counts, attachment_storage_cleanup }` | required | Uses service-role for cleanup, logs safe usage event |
| `delete-all-data` | Delete user product/task data (preserve billing/subscriptions) | `POST` | none | `{ ok:true, deleted_counts, preserved_data, attachment_storage_cleanup }` | required | Service-role cleanup; storage cleanup remains TODO |
| `delete-account` | Full cleanup and auth user deletion | `POST` | none | `{ ok:true, account_deleted:true, cleanup_summary, attachment_storage_cleanup }` | required | Requires service role config; storage cleanup remains TODO |

### Access and onboarding

- `complete-onboarding`
  - File: `supabase/functions/complete-onboarding/index.ts`
  - Method: `POST`
  - Input: empty JSON body.
  - Output: `{ ok: true, ...access_state_payload }`.
  - Auth: required.
  - Behavior:
    - Creates profile row if missing.
    - Idempotently sets onboarding complete.
    - Starts 3-day starter only when onboarding not yet completed and starter not already active.
  - Errors: plain `{ error: string }` shape (not the standardized `{ ok:false,error:{...} }` shape).
  - Limitation: response/error format differs from most other endpoints.

- `get-access-state`
  - File: `supabase/functions/get-access-state/index.ts`
  - Method: `GET`
  - Input: none.
  - Output: `{ ok: true, ...access_state_payload }`.
  - Auth: required.
  - Behavior: reads profile + subscriptions through shared access state builder.
  - Errors: plain `{ error: string }` shape.

### AI task loop

- `analyze-task`
  - File: `supabase/functions/analyze-task/index.ts`
  - Method: `POST`
  - Input: `input_text`, optional `selected_template`, optional `billing_source`; optional `Idempotency-Key` header.
  - Output:
    - clarification path: `response_type=clarification`
    - analysis path: `response_type=task_analysis`
  - Auth: required.
  - Important behavior:
    - Access-state gate before processing.
    - Daily AI limit + regenerate limit before AI path.
    - Deterministic clarification path preserved for cancel-subscription with missing billing source.
    - Idempotency table (`analyze_task_idempotency`) used to avoid duplicate task creation and replay completed responses.
    - Writes `task_outputs` with `prompt_version` + `schema_version`.
    - Writes AI usage telemetry to `usage_events` without raw content.
  - Error behavior:
    - Structured errors with retryability.
    - `rate_limited` returns 429 + `limit_type` + `retry_after_seconds`.
    - On processing failure, task status is moved to `failed` if task was created.
  - Known limitation:
    - In this implementation, generic path is OpenAI-backed (not deterministic-only).

- `answer-clarification`
  - File: `supabase/functions/answer-clarification/index.ts`
  - Method: `POST`
  - Input: `task_id`, `clarification_id`, `answer_text`, optional `billing_source`.
  - Output: `response_type=task_analysis` with updated clarification/output/task state.
  - Auth: required.
  - Important behavior:
    - Access-state gate.
    - Task ownership + clarification ownership validation.
    - Marks clarification answered and logs `clarification_answered` event.
    - Deterministic App Store cancellation output when billing source resolves to app_store.
    - Deterministic helper path for uncertain answers.
    - Generic path uses OpenAI structured output.
    - Enforces max blocking clarification safety check (`>2` open = blocked).
    - Saves task output/checklist and updates task state.
    - Usage telemetry for AI path only.
  - Error behavior: structured errors, including rate limit responses.

- `generate-reply`
  - File: `supabase/functions/generate-reply/index.ts`
  - Method: `POST`
  - Input: required `task_id`, optional `tone` (`polite|firmer|shorter`), optional `language` (`auto|English|Russian|Ukrainian|Romanian`).
  - Output: draft reply payload with `output_type=draft_reply`, `output_version`, tone/language.
  - Auth: required.
  - Important behavior:
    - Access-state gate.
    - Daily AI limit + regenerate cap.
    - Task ownership validation.
    - Marks previous current `draft_reply` output as non-current, writes new current output, emits `reply_generated` event.
    - Usage event tracked without raw content.
  - Error behavior: structured errors and safe retry semantics.

### Task reads

- `list-tasks`
  - File: `supabase/functions/list-tasks/index.ts`
  - Method: `GET`
  - Query: `filter`, `sort`, `limit`, `page`.
  - Auth: required.
  - Behavior:
    - User-scoped query only.
    - Supports filter aliases from API terminology:
      - `follow_up_needed` -> `status=waiting_for_user`
      - `done` -> `status=completed`
    - Safe pagination defaults.
  - Output: `{ ok:true, filter, sort, pagination, tasks[] }`.

- `get-task-detail`
  - File: `supabase/functions/get-task-detail/index.ts`
  - Method: `GET`
  - Query: required `task_id`.
  - Auth: required.
  - Behavior:
    - Validates ownership by task lookup.
    - Returns task + current output + summary counters.
  - Output: `{ ok:true, task, current_output, summary }`.

- `get-task-outputs`
  - File: `supabase/functions/get-task-outputs/index.ts`
  - Method: `GET`
  - Query: required `task_id`, optional `output_type`, pagination.
  - Auth: required.
  - Output: `{ ok:true, task_id, output_type, pagination, outputs[] }`.

- `get-task-events`
  - File: `supabase/functions/get-task-events/index.ts`
  - Method: `GET`
  - Query: required `task_id`, optional `order`, pagination.
  - Auth: required.
  - Output: `{ ok:true, task_id, order, pagination, events[] }`.

- `get-checklist-items`
  - File: `supabase/functions/get-checklist-items/index.ts`
  - Method: `GET`
  - Query: required `task_id`, optional `status`, optional `sort`, pagination.
  - Auth: required.
  - Output: `{ ok:true, task_id, status, sort, pagination, items[] }`.

- `get-reminders`
  - File: `supabase/functions/get-reminders/index.ts`
  - Method: `GET`
  - Query:
    - optional `task_id` (supports all-user reminders when omitted)
    - optional `status`
    - optional `local_notification_status`
    - optional `sort`, pagination.
  - Auth: required.
  - Important behavior:
    - If `task_id` is provided, validates ownership by checking task row.
    - Handles empty reminders as `200` with `reminders: []`.
    - Includes legacy fallback when reminder notification columns are missing (`42703`), returning normalized values:
      - `ios_notification_id: null`
      - `local_notification_status: "not_scheduled"`
  - Output: `{ ok:true, task_id, status, local_notification_status, sort, pagination, reminders[] }`.
  - Error behavior: controlled JSON errors; internal details kept in server logs.

### Task actions

- `update-task-status`
  - File: `supabase/functions/update-task-status/index.ts`
  - Method: `POST`
  - Input: `task_id`, `status`, optional `event_message`.
  - Auth: required.
  - Behavior: uses RPC `update_task_status_with_event` for atomic status + event write.
  - Output: `{ ok:true, task_id, status, completed_at, event_message }`.

- `message-marked-sent`
  - File: `supabase/functions/message-marked-sent/index.ts`
  - Method: `POST`
  - Input: `task_id`.
  - Auth: required.
  - Behavior: uses same RPC to set `waiting_for_reply` and add user-facing event.
  - Output: `{ ok:true, task_id, status:"waiting_for_reply", completed_at, event_message }`.

### Reminder actions

- `reminder-create`
  - File: `supabase/functions/reminder-create/index.ts`
  - Method: `POST`
  - Input: `task_id`, `remind_at`, `ios_notification_id`, optional `local_notification_status`.
  - Auth: required.
  - Behavior:
    - Validates task ownership.
    - Creates reminder row with push channel and scheduled status.
    - Adds task event (`reminder_set`).
  - Output: `{ ok:true, reminder, event_message }`.

- `reminder-update`
  - File: `supabase/functions/reminder-update/index.ts`
  - Method: `POST`
  - Input: `reminder_id` + one or more fields (`remind_at`, `ios_notification_id`, `local_notification_status`).
  - Auth: required.
  - Behavior: ownership validation, no updates for canceled reminders, emits task event.

- `reminder-cancel`
  - File: `supabase/functions/reminder-cancel/index.ts`
  - Method: `POST`
  - Input: `reminder_id`.
  - Auth: required.
  - Behavior: marks reminder canceled (`status` + `local_notification_status`), emits task event.

- `reminder-snooze`
  - File: `supabase/functions/reminder-snooze/index.ts`
  - Method: `POST`
  - Input: `reminder_id`, `snooze_until`, optional updated iOS notification status/id.
  - Auth: required.
  - Behavior: updates reminder schedule and event log.

- `notification-triggered`
  - File: `supabase/functions/notification-triggered/index.ts`
  - Method: `POST`
  - Input: `reminder_id`, `local_notification_status` (`delivered|opened`), optional `triggered_at`, optional `mark_follow_up_needed`.
  - Auth: required.
  - Behavior:
    - Marks reminder sent/triggered.
    - Optionally moves task to follow-up-needed semantics (`waiting_for_user`) via RPC.
    - Does not move completed tasks; returns `follow_up_skipped_reason: task_completed`.

### Subscription sync

- `validate-subscription`
  - File: `supabase/functions/validate-subscription/index.ts`
  - Method: `POST`
  - Input:
    - top-level `verification_mode`
    - top-level `entitlement` object.
    - Reads environment primarily from `entitlement.environment` (with fallback to `body.environment`).
  - Auth: required.
  - Behavior:
    - iOS-verified mirror scaffold only.
    - Rejects `production` mirror mode.
    - Upserts subscription for authenticated user and writes `subscription_events`.
    - Returns access-state payload.
  - Limitation/TODOs in code:
    - Full Apple server-side validation deferred.
    - App Store Server Notifications deferred.

- `restore-purchases`
  - File: `supabase/functions/restore-purchases/index.ts`
  - Method: `POST`
  - Input:
    - top-level `verification_mode`
    - `entitlements[]` array.
    - Each entry validates its own `environment` (fallback to body-level environment).
  - Auth: required.
  - Behavior: mirrors each entitlement, writes subscription + events, returns updated access-state.

### Privacy / feedback

- `feedback`
  - File: `supabase/functions/feedback/index.ts`
  - Method: `POST`
  - Input: `task_id`, optional `output_id`, optional `rating`, optional `feedback_type`, optional `comment`.
  - Auth: required.
  - Behavior: validates task ownership (and output ownership if provided), inserts `task_feedback`.

- `delete-task`
  - File: `supabase/functions/delete-task/index.ts`
  - Method: `POST`
  - Input: `task_id`.
  - Auth: required.
  - Behavior:
    - Validates task ownership.
    - Performs service-role task-scoped cleanup.
    - Writes safe deletion usage event (no raw content).
    - Returns deletion counts + attachment cleanup TODO note.

- `delete-all-data`
  - File: `supabase/functions/delete-all-data/index.ts`
  - Method: `POST`
  - Input: none.
  - Auth: required.
  - Behavior:
    - Service-role cleanup of user product data.
    - Preserves subscriptions/subscription_events and billing usage events in this flow.

- `delete-account`
  - File: `supabase/functions/delete-account/index.ts`
  - Method: `POST`
  - Input: none.
  - Auth: required.
  - Behavior:
    - Service-role full cleanup + admin auth user deletion.
    - Returns cleanup summary and attachment cleanup TODO note.

## 3) Reminder system state

Primary files:
- `supabase/functions/reminder-create/index.ts`
- `supabase/functions/reminder-update/index.ts`
- `supabase/functions/reminder-cancel/index.ts`
- `supabase/functions/reminder-snooze/index.ts`
- `supabase/functions/notification-triggered/index.ts`
- `supabase/functions/get-reminders/index.ts`

Current backend model:
- iOS schedules/cancels local notifications first; backend stores synchronized reminder state.
- Backend does not directly schedule iOS local notifications.
- Sync fields expected in DB + API:
  - `ios_notification_id`
  - `local_notification_status`

Known schema drift incident and fix:
- Hosted environment previously missed notification columns while functions referenced them.
- Compatibility behavior now exists in `get-reminders` (legacy fallback select).
- Schema alignment migration is present:
  - `20260526001000_align_reminders_notification_columns.sql`.

User-facing failure behavior (current):
- Endpoint-level errors are returned as controlled JSON, typically `processing_failed` for internal failures.
- `get-reminders` is hardened to avoid uncaught 500 crashes and logs safe diagnostics server-side.

## 4) Access and subscription state

Primary files:
- `supabase/functions/_shared/access_state.ts`
- `supabase/functions/_shared/subscription_mirroring.ts`
- `supabase/functions/get-access-state/index.ts`
- `supabase/functions/complete-onboarding/index.ts`
- `supabase/functions/validate-subscription/index.ts`
- `supabase/functions/restore-purchases/index.ts`

Current behavior:
- Onboarding check remains first in base access-state computation.
- Starter access is backend-controlled.
- Trial/subscription state overlays come from mirrored subscriptions.
- Limited mode is driven by feature flags in access-state payload.

Subscription scaffold scope:
- TestFlight MVP uses `ios_verified_mirror` mode.
- No backend-only fake production access path.
- No backend-only App Store trial grant.
- Full Apple server-side validation + notifications remain TODOs (explicit in code and docs).

## 5) Current limitations and deferred capabilities

Based on implemented backend and local docs:
- Full Apple Server API validation is deferred.
- App Store Server Notifications ingestion/reconciliation is deferred.
- Attachments/OCR processing is deferred (schema exists; processing not MVP-complete).
- Reminder storage cleanup for attachment objects is TODO/v1.1.
- No autonomous external action execution (backend guidance only).
- No task intake session workflow is implemented as a separate backend surface yet.
- No dedicated "pending questions" endpoint/model is implemented beyond `clarifications`.
- No multi-task split review orchestration endpoint is implemented (child-task support exists at schema level via `parent_task_id`).
- No explicit "update result with added details" endpoint is implemented as a standalone API.
- Checklist persistence is implemented (`checklist_items` table + read/write usage in AI/task flows).

Notes for sync context:
- Current schema status values are backend-oriented (`waiting_for_user`, `completed`) while some API/UI language maps to (`follow_up_needed`, `done`) at endpoint filter level.
- `complete-onboarding` and `get-access-state` still use a simpler `{ error: string }` failure shape compared to most endpoints' standardized `{ ok:false,error:{...} }` format.

## 6) Safety and security posture

Primary files:
- `supabase/migrations/20260522004500_add_rls_policies_and_triggers.sql`
- `supabase/functions/_shared/auth.ts`
- `supabase/functions/_shared/openai_client.ts`
- `supabase/functions/_shared/rate_limits.ts`

### Auth checks
- Protected endpoints gate on `requireAuthenticatedUser`.
- User-scoped reads/writes additionally filter by `user_id` and/or validate parent task ownership.

### RLS and ownership
- RLS enabled on user-owned tables.
- Policies enforce own-row access (`auth.uid() = user_id`), with `profiles` using `auth.uid() = id`.
- `usage_events` has select-own policy only for authenticated users; client-side arbitrary write paths are not opened by policy.

### Idempotency
- `analyze-task` supports idempotency via `Idempotency-Key` + `analyze_task_idempotency` table.
- Replay/conflict/in-progress states are explicitly handled.

### Rate limiting
- Daily AI action limits and regenerate cap are enforced via shared helper before AI calls in:
  - `analyze-task`
  - `answer-clarification` (generic AI path)
  - `generate-reply`

### Logging safety
- Function logs include safe diagnostics (endpoint/stage/codes/IDs where needed).
- No secret values are logged.
- Usage telemetry marks `contains_raw_user_content: false` and avoids raw content payloads in `usage_events.properties`.

### OpenAI secret handling
- OpenAI key is loaded server-side only via `Deno.env.get("OPENAI_API_KEY")` in `supabase/functions/_shared/openai_client.ts`.
- Model override uses `Deno.env.get("OPENAI_MODEL")`.
- Client is not given OpenAI secrets.
