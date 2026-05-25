# OneDone iOS MVP / TestFlight Release Checklist

Purpose: practical release checklist for current implemented MVP runtime.

## 1. Scope Snapshot

Current implementation assumptions:
- Remote backend runtime is default for real app usage.
- Mock mode is only for SwiftUI previews/development fallback.
- Supabase Auth email/password is implemented.
- Access-state from backend drives routing.
- StoreKit 2 purchase/restore flow is implemented.
- Subscription backend mirror scaffold is implemented (`ios_verified_mirror`).
- iOS never calls OpenAI directly.

## 2. App Configuration Checklist

Configure runtime values only in a local unshared scheme (example: `OneDone Local`):
- `ONEDONE_SUPABASE_URL`
- `ONEDONE_SUPABASE_ANON_KEY`
- `ONEDONE_FUNCTIONS_BASE_URL`
- `ONEDONE_SUBSCRIPTION_PRODUCT_ID`

Rules:
- Shared scheme must stay value-free (no concrete env values committed).
- Local unshared scheme holds concrete runtime values.
- Never place Supabase `service_role` in iOS config.
- Never place OpenAI key in iOS config.

## 3. Xcode Local Scheme Setup

- Confirm shared scheme is safe to commit (placeholders/empty values only).
- Confirm local unshared scheme has the required runtime values.
- Confirm StoreKit local config file exists and is selected for development testing:
  - `OneDone.storekit`
- Confirm StoreKit product ID in local testing matches `ONEDONE_SUBSCRIPTION_PRODUCT_ID`.

## 4. Backend Deployment Checklist

Confirm these Edge Functions are deployed and reachable:
- [ ] `complete-onboarding`
- [ ] `get-access-state`
- [ ] `analyze-task`
- [ ] `answer-clarification`
- [ ] `generate-reply`
- [ ] `update-task-status`
- [ ] `message-marked-sent`
- [ ] `list-tasks`
- [ ] `get-task-detail`
- [ ] `get-task-outputs`
- [ ] `get-task-events`
- [ ] `get-checklist-items`
- [ ] `get-reminders`
- [ ] `reminder-create`
- [ ] `reminder-update`
- [ ] `reminder-cancel`
- [ ] `reminder-snooze`
- [ ] `validate-subscription`
- [ ] `restore-purchases`
- [ ] `feedback`
- [ ] `delete-task`
- [ ] `delete-all-data`
- [ ] `delete-account`

## 5. Supabase Secrets and Database Checklist

Auth/database:
- [ ] Hosted migrations applied.
- [ ] Supabase Auth email/password enabled and tested.
- [ ] Email confirmation policy explicitly chosen for this MVP phase.
- [ ] RLS enabled for user-scoped tables used by MVP.

Required backend secrets (Supabase only):
- [ ] `OPENAI_API_KEY`
- [ ] `OPENAI_MODEL`

Core table readiness:
- [ ] `profiles`
- [ ] `subscriptions`
- [ ] `subscription_events`
- [ ] `tasks`
- [ ] `task_outputs`
- [ ] `task_events`
- [ ] `clarifications`
- [ ] `checklist_items`
- [ ] `reminders`
- [ ] `task_feedback`
- [ ] `usage_events`

Security:
- [ ] No backend secrets in iOS project.
- [ ] No `service_role` in iOS project.
- [ ] OpenAI key is server-side only.

## 6. Manual QA Script

### 6.1 Auth and session
- [ ] Sign up with email/password.
- [ ] Log in with valid credentials.
- [ ] Invalid credentials show user-safe error.
- [ ] Relaunch restores session.
- [ ] Logout clears session and returns to auth.

### 6.2 Onboarding and access routing
- [ ] New account receives `onboarding_required`.
- [ ] Completing onboarding triggers `complete-onboarding`.
- [ ] Starter access becomes active.
- [ ] Locked states (`starter_expired`, `trial_expired`, `subscription_expired`) gate correctly.

### 6.3 AI loop
- [ ] `analyze-task` succeeds for normal input.
- [ ] Clarification path works through `answer-clarification`.
- [ ] Reply generation works through `generate-reply`.
- [ ] Rate-limit response is handled gracefully.

### 6.4 Task reads and actions
- [ ] My Tasks loads remote data (`list-tasks`).
- [ ] Task detail loads read endpoints.
- [ ] Status update sync works.
- [ ] Message-marked-sent sync works.

### 6.5 Reminders
- [ ] Create/update/cancel/snooze syncs work.
- [ ] Local notification and backend reminder IDs stay aligned.
- [ ] Permission denied path is clear and safe.

### 6.6 Subscription and StoreKit
- [ ] Purchase flow calls `validate-subscription`.
- [ ] Restore flow calls `restore-purchases`.
- [ ] Access-state refresh reflects subscription state.
- [ ] Entitlement environments used are accepted values: `xcode`, `sandbox`, `testflight`.

### 6.7 Remote runtime vs mock fallback
- [ ] Normal app launch uses remote runtime by default.
- [ ] Mock mode is only entered intentionally for preview/dev fallback.

### 6.8 Security checks
- [ ] iOS contains no `service_role` key.
- [ ] iOS contains no OpenAI key.
- [ ] Shared scheme has no concrete runtime values.

## 7. StoreKit Notes

- Local StoreKit file is for development/testing only.
- TestFlight/App Store behavior still depends on App Store Connect product setup.
- Subscription mirror scaffold accepts only `xcode`, `sandbox`, `testflight` environments.
- Conflict note: if the same local test transaction is reused across different test users, reset local StoreKit transactions and related backend test records before retry.

## 8. Known Limitations and Deferred Items

- Attachments/OCR are deferred (coming soon).
- App Store Server Notifications are deferred.
- Full Apple Server API validation is deferred.
- Sign in with Apple is not implemented in current MVP and may be required before broader/public release.
- Production deep links and email confirmation production setup may still be required.
- No autonomous external actions.

## 9. Final Go / No-Go Checklist

Release/share only when all are true:
- [ ] iOS builds and runs on real device.
- [ ] Local scheme/runtime configuration is correct.
- [ ] Backend functions are deployed.
- [ ] Hosted migrations and RLS are verified.
- [ ] Required backend secrets are configured in Supabase.
- [ ] Auth/session/access flows pass manual QA.
- [ ] AI loop, task reads/actions, and reminders pass manual QA.
- [ ] StoreKit purchase/restore mirror flow passes manual QA.
- [ ] No secrets are present in iOS code/config.
