# OneDone — Supabase Backend Specification v6

This document reflects the current implemented MVP backend state.

## 1. Current MVP State (Implemented)

- Backend platform: Supabase (Postgres + Auth + Edge Functions + RLS).
- Auth in current MVP: Supabase Auth email/password.
- Access model: onboarding -> 3-day Starter Access -> App Store trial/subscription states.
- Access-state is backend-driven and consumed by iOS routing.
- AI flows are executed through Edge Functions.
- iOS never calls OpenAI directly.
- OpenAI key is stored only in Supabase secrets.
- Subscription sync uses `ios_verified_mirror` payloads from iOS verified StoreKit entitlements.

## 2. Auth and Access

### Implemented
- Supabase Auth email/password flows are active.
- `complete-onboarding` marks onboarding complete and activates Starter Access.
- `get-access-state` is the routing source of truth.

### Public-release consideration
- Sign in with Apple is not part of the current implemented MVP backend contract.
- If required for broader/public release, Sign in with Apple should be added as a separate auth scope.

## 3. Access States

```txt
onboarding_required
starter_active
starter_expired
trial_not_started
trial_active
trial_expired
subscription_active
subscription_cancelled_active
grace_period
billing_issue
subscription_expired
```

Routing intent remains:
- open states -> full usage;
- expired/billing states -> limited mode;
- unauthenticated -> auth.

## 4. Implemented Edge Function Surface

### Access / onboarding
- `complete-onboarding`
- `get-access-state`

### AI task loop
- `analyze-task`
- `answer-clarification`
- `generate-reply`

### Task actions
- `update-task-status`
- `message-marked-sent`

### Task reads
- `list-tasks`
- `get-task-detail`
- `get-task-outputs`
- `get-task-events`
- `get-checklist-items`
- `get-reminders`

### Reminder actions
- `reminder-create`
- `reminder-update`
- `reminder-cancel`
- `reminder-snooze`

### Subscription sync
- `validate-subscription`
- `restore-purchases`

### Privacy / deletion
- `delete-task`
- `delete-all-data`
- `delete-account`

### Support / telemetry helpers
- `feedback`
- `notification-triggered`

## 5. Subscription Validation Scope (Current)

### Implemented MVP/TestFlight scaffold
- Mirror mode: `verification_mode = "ios_verified_mirror"`.
- Accepted entitlement environment values: `xcode`, `sandbox`, `testflight`.
- `production` mirror environment is rejected in current scaffold.
- Backend updates `subscriptions` and `subscription_events` from verified iOS entitlement payloads.

### Deferred (not completed yet)
- Full Apple Server API validation path.
- App Store Server Notifications ingestion + reconciliation.

## 6. Rate Limits

Current enforced limits:
- Starter Access: 10 AI actions/day.
- Trial active: 50 AI actions/day.
- Active subscriber states: 100 AI actions/day.
- Regeneration cap: maximum 3 outputs per task/output-type bucket.

Rate-limit responses include `error.code = "rate_limited"` with retry metadata.

## 7. Data Model Scope

Core tables in active MVP runtime:
- `profiles`
- `subscriptions`
- `subscription_events`
- `tasks`
- `task_outputs`
- `task_events`
- `clarifications`
- `checklist_items`
- `reminders`
- `task_feedback`
- `usage_events`

Deferred/coming-soon surface may still include attachment-related schema, but attachments/OCR processing is not MVP-complete.

## 8. Privacy, Security, and Deletion

- RLS remains enabled for user-scoped data access.
- `usage_events` must not store raw user private content.
- Delete flows are implemented via:
  - `delete-task`
  - `delete-all-data`
  - `delete-account`
- Backend secrets (OpenAI/API keys) must never be stored in iOS client code.

## 9. Non-goals / Deferred

- No autonomous external actions (no account logins, no automatic cancellations/payments/sends).
- Attachments/OCR remain deferred.
- Full Apple server-side subscription verification remains deferred.
- App Store Server Notifications remain deferred.
