# OneDone — MVP Implementation Plan v2

This file is now a status-oriented MVP plan snapshot.

## 1. Product Loop (Current MVP)

```txt
Open app
→ Register / Sign in
→ Onboarding
→ 3-day Starter Access
→ App Store 14-day trial gate
→ Paid subscription state
```

## 2. Implemented MVP Baseline

### iOS runtime and architecture (implemented)
- Remote backend runtime is the default for real usage.
- Mock mode remains for SwiftUI previews/development fallback only.
- Supabase Auth email/password is implemented via REST + URLSession.
- Session restore and logout are implemented with Keychain-backed session storage.
- Authenticated API calls use `AuthTokenProvider`.
- Backend access-state drives routing.

### Core flows (implemented)
- Onboarding completion -> `POST /complete-onboarding`.
- AI loop:
  - `POST /analyze-task`
  - `POST /answer-clarification`
  - `POST /generate-reply`
- Task actions:
  - `POST /update-task-status`
  - `POST /message-marked-sent`
- Task reads:
  - `GET /list-tasks`
  - `GET /get-task-detail`
  - `GET /get-task-outputs`
  - `GET /get-task-events`
  - `GET /get-checklist-items`
  - `GET /get-reminders`
- Reminder actions:
  - `POST /reminder-create`
  - `POST /reminder-update`
  - `POST /reminder-cancel`
  - `POST /reminder-snooze`

### Subscription access (implemented MVP scaffold)
- StoreKit 2 purchase/restore flow exists on iOS.
- Local StoreKit config exists for development testing.
- Backend endpoints connected:
  - `POST /validate-subscription`
  - `POST /restore-purchases`
- Current verification mode: `ios_verified_mirror`.

## 3. MVP Limitations That Stay Explicit

- Attachments/OCR are deferred (coming soon).
- No autonomous external actions.
- iOS never calls OpenAI directly.
- iOS must never contain Supabase `service_role` key.
- OpenAI key exists only in Supabase secrets.

## 4. Remaining Release Setup (Not Yet Complete)

### TestFlight readiness items
- Verify hosted Supabase deployment (functions + migrations + RLS) is in sync with local MVP behavior.
- Validate subscription mirror behavior with `xcode`, `sandbox`, and `testflight` entitlement environments.
- Resolve/define email confirmation production policy and messaging.
- Confirm production deep-link and auth redirect setup.
- Execute full manual QA pass for auth/access/task/reminder/subscription flows.

### Public release hardening items
- Add full Apple Server API validation path for subscriptions.
- Add App Store Server Notifications backend flow.
- Finalize Sign in with Apple decision and implementation if required before broader/public release.

## 5. Milestone Status

### Completed
1. Clickable UI and mock-safe fallback.
2. Supabase auth and backend skeleton.
3. Remote AI task loop integration.
4. StoreKit purchase/restore + backend subscription mirror scaffold.
5. Follow-through flows (task actions, reminders, task read APIs).

### In progress / remaining
1. TestFlight hardening and environment setup verification.
2. Public-release subscription infrastructure (Apple server validation + notifications).
3. Deferred scope planning (attachments/OCR and related UX).
