# OneDone Project Overview

This document is a factual source-of-truth overview of the current OneDone MVP implementation state.

Source basis:
- `01_ios_app_spec_v6.md`
- `02_backend_spec_v6.md`
- `03_mvp_implementation_plan_v2.md`
- `04_api_contract.md`
- `06_test_cases.md`
- `07_ios_mvp_release_checklist.md`

## 1. Product summary

OneDone is a guided self-service AI assistant for everyday life-admin tasks such as subscription cancellations, refunds, bills, confusing messages, and follow-up coordination.

It is for users who have small but stressful admin tasks and want practical help turning vague problems into concrete actions.

It solves the "I do not know where to start" problem by converting messy input into structured steps, reply drafts, reminders, and clear follow-through.

MVP summary: the current MVP is a text-first iOS app with a real remote backend runtime by default. Users authenticate, complete onboarding, receive 3-day Starter Access, submit tasks for backend AI processing, review outputs and task history, generate replies, mark actions sent, and manage reminders. After access expiry, creation actions are gated while existing data remains viewable in limited mode.

## 2. Core user value

- Break down messy tasks into understandable intent and actionable structure.
- Ask for clarification when critical input is missing.
- Produce next steps and checklists users can execute themselves.
- Generate draft replies for common real-world interactions.
- Help users follow up with reminders and sent-state tracking.
- Keep task history organized through task list and task detail views.

## 3. MVP user flow

1. User signs up or logs in with email/password.
2. App restores existing session when available and valid.
3. App requests backend access-state and routes accordingly.
4. New authenticated users complete onboarding.
5. App calls `POST /complete-onboarding`.
6. Backend activates Starter Access and returns updated access-state.
7. User submits a new task text.
8. App calls `POST /analyze-task`.
9. If needed, backend returns a clarification question.
10. User answers clarification and app calls `POST /answer-clarification`.
11. Backend returns `task_analysis` result and task artifacts.
12. User opens Task Detail to review outputs, timeline, checklist, and reminders.
13. User generates draft reply with `POST /generate-reply`.
14. User marks message sent with `POST /message-marked-sent`.
15. User creates, updates, cancels, or snoozes reminders and syncs with backend reminder endpoints.
16. App refreshes task data through remote task list/detail/read endpoints.
17. After Starter Access expiry, create/generate actions are gated.
18. User can start StoreKit subscription/trial flow from gate.
19. App validates purchase via `POST /validate-subscription` using iOS verified mirror payload.
20. User can restore purchases via `POST /restore-purchases`.
21. App refreshes `GET /get-access-state` and routes based on returned state.

## 4. Access model

Implemented access-state values include:
- `onboarding_required`
- `starter_active`
- `starter_expired`
- `trial_not_started`
- `trial_active`
- `subscription_active`
- `subscription_cancelled_active`
- `grace_period`
- `billing_issue`
- `trial_expired`
- `subscription_expired`

Access behavior:
- `onboarding_required`: user must complete onboarding before normal usage.
- `starter_active`, `trial_active`, `subscription_active`, `subscription_cancelled_active`, `grace_period`: full core task usage.
- `starter_expired`, `trial_not_started`: subscription gate flow.
- `billing_issue`, `trial_expired`, `subscription_expired`: limited mode with locked creation/generation.

Limited mode behavior:
- Users can view existing tasks/details/outputs.
- Users can continue certain follow-through actions on existing items such as status updates and reminder maintenance.
- Users cannot create new tasks or run new generation actions.

There is no "Not now" bypass for continued real usage after Starter Access expiry.

## 5. Functional scope implemented

Auth and session:
- Supabase Auth email/password is implemented.
- Session restore and logout are implemented.
- Keychain-backed session storage is used.

Onboarding and access:
- Backend-driven access-state routing is implemented.
- Onboarding completion sync through `complete-onboarding` is implemented.
- Starter Access activation after onboarding is implemented.

AI task analysis and clarification:
- `analyze-task` integration is implemented.
- `answer-clarification` integration is implemented.
- Result routing with `task_analysis` responses is implemented.

Task list/detail and task artifacts:
- Remote task list/detail APIs are connected.
- Task outputs/events/checklist/reminder reads are connected.
- Task timeline and follow-through task views are implemented around backend data.

Draft reply and sent flow:
- `generate-reply` is implemented and tied to backend `task_id` flow.
- `message-marked-sent` is implemented.

Reminders:
- Local notification scheduling is implemented on iOS.
- Reminder backend sync is implemented for create/update/cancel/snooze.
- Reminder refresh in task flows is implemented.

Subscription:
- StoreKit 2 access flow is implemented.
- `validate-subscription` and `restore-purchases` are connected.
- `ios_verified_mirror` TestFlight scaffold is implemented.
- Local StoreKit configuration exists for development testing.

Privacy/delete/feedback backend support:
- Implemented endpoints include `feedback`, `delete-task`, `delete-all-data`, and `delete-account`.

Rate limits:
- Starter Access: 10 AI actions/day.
- Trial active: 50 AI actions/day.
- Active subscriber states: 100 AI actions/day.
- Regenerate cap: up to 3 outputs per task/output-type bucket.

## 6. Functional scope deferred

Deferred or non-MVP scope includes:
- Attachments, OCR, and PDF upload processing.
- Autonomous external actions such as account login, payment execution, or sending actions on user behalf.
- Production Sign in with Apple support.
- App Store Server Notifications integration.
- Full Apple Server API subscription validation flow.
- Final production deep link and email redirect/confirmation setup hardening.
- Advanced analytics and monitoring beyond the current MVP telemetry patterns.

## 7. Architecture overview

High-level system shape:
- iOS SwiftUI client application.
- Supabase Auth for authentication.
- Supabase Edge Functions for app business APIs and AI orchestration.
- Supabase Postgres for persistent product data.
- OpenAI usage only from backend Edge Functions.
- StoreKit 2 on iOS for subscription purchase and restore flows.
- iOS local notifications plus backend reminder synchronization.
- Remote services are default runtime path; mock services are fallback for previews/development.

## 8. iOS architecture summary

Implemented iOS architecture characteristics:
- UI framework: SwiftUI.
- App entry/routing pattern: `AppState` + `AppFlow`.
- Auth UI flow present through `AuthView` and related app state.
- Session handling: `AuthSessionStore` backed by Keychain storage.
- Auth bearer token propagation: `AuthTokenProvider`.
- Remote service layer for access, task, reminder, and subscription endpoints.
- Mock service layer for SwiftUI previews and development fallback only.
- StoreKit 2 subscription service integrated in app runtime.
- `OneDone.storekit` local configuration exists for development testing.
- Shared Xcode scheme must remain value-free.
- Local unshared scheme should contain runtime env values.

## 9. Backend architecture summary

Core backend data scope:
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

Security and ownership:
- RLS is used for user ownership boundaries.
- Authenticated user context drives per-user data access.

Implemented function groups:
- Access/onboarding: `complete-onboarding`, `get-access-state`.
- AI task loop: `analyze-task`, `answer-clarification`, `generate-reply`.
- Task reads: `list-tasks`, `get-task-detail`, `get-task-outputs`, `get-task-events`, `get-checklist-items`, `get-reminders`.
- Task actions: `update-task-status`, `message-marked-sent`.
- Reminder actions: `reminder-create`, `reminder-update`, `reminder-cancel`, `reminder-snooze`.
- Subscription sync: `validate-subscription`, `restore-purchases`.
- Privacy/support: `delete-task`, `delete-all-data`, `delete-account`, `feedback`.

Safety rule:
- `usage_events` must not store raw user content.

## 10. API surface summary

Access:
- `POST /complete-onboarding`
- `GET /get-access-state`

AI task loop:
- `POST /analyze-task`
- `POST /answer-clarification`
- `POST /generate-reply`

Task reads:
- `GET /list-tasks`
- `GET /get-task-detail`
- `GET /get-task-outputs`
- `GET /get-task-events`
- `GET /get-checklist-items`
- `GET /get-reminders`

Task actions:
- `POST /update-task-status`
- `POST /message-marked-sent`

Reminders:
- `POST /reminder-create`
- `POST /reminder-update`
- `POST /reminder-cancel`
- `POST /reminder-snooze`

Subscription:
- `POST /validate-subscription`
- `POST /restore-purchases`
- Accepted mirror environments: `xcode`, `sandbox`, `testflight`
- Verification mode used in MVP scaffold: `ios_verified_mirror`

Privacy/feedback:
- `POST /feedback`
- `POST /delete-task`
- `POST /delete-all-data`
- `POST /delete-account`

## 11. Security and privacy principles

- iOS never calls OpenAI directly.
- OpenAI key lives only in Supabase secrets.
- Supabase `service_role` must never be in iOS.
- No secrets or private tokens should be committed to the repo.
- Auth tokens/passwords should not be exposed in user-facing surfaces or logs.
- `usage_events` must not contain raw user private content.
- RLS and user ownership checks are required backend guarantees.
- Subscription mirror payload data should be stored and processed with least-privilege data handling.

## 12. Testing and release state

Current maturity:
- MVP is a working prototype with real remote runtime behavior.
- Mock mode is intentionally constrained to preview/development fallback.
- Local StoreKit test flow is available via `OneDone.storekit`.

Release dependencies still required:
- Hosted Supabase deployment with migrations, RLS, and Edge Functions must be correctly configured.
- Supabase secrets must be configured server-side.
- Manual QA pass across auth/access/task/reminder/subscription flows is required before broader distribution.
- TestFlight/public hardening still requires App Store Server Notifications implementation.
- TestFlight/public hardening still requires full Apple Server API validation implementation.
- Production deep-link and email-confirmation setup may still be required.

## 13. Glossary

Starter Access:
- A backend-controlled 3-day initial access period after onboarding.

Limited Mode:
- Post-access-expiry behavior where users can view and manage existing items but cannot run new creation/generation actions.

access_state:
- Backend routing state that determines which app experience or gate is shown.

task_analysis:
- AI result type containing structured task understanding, summary, and actionable guidance.

clarification:
- A backend-requested missing detail question needed before final task analysis.

draft_reply:
- A generated message draft produced for a backend task context.

ios_verified_mirror:
- Current MVP subscription verification mode where iOS verified StoreKit entitlement metadata is mirrored through backend endpoints.

StoreKit local config:
- Local Xcode StoreKit test configuration (`OneDone.storekit`) used for development/testing purchase flows.
