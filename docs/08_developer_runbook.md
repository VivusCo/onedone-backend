# OneDone Developer Runbook (MVP)

This runbook is an operational guide for running, deploying, testing, and debugging the current OneDone MVP.

Scope:
- Documentation-only operational guidance.
- Placeholder-only configuration examples.
- Current MVP behavior only.

## 1. Repository map

Primary repositories:
- `onedone-ios`: iOS SwiftUI app runtime, StoreKit integration, local notification scheduling, API client behavior.
- `onedone-backend`: Supabase backend (Auth, Postgres, Edge Functions, RLS, secrets).
- `onedone-docs`: product/architecture/API/testing documentation.

Documentation ownership:
- `onedone-docs` is the source of truth for documentation.
- `onedone-ios/docs` and `onedone-backend/docs` may contain synced copies for local workflow convenience.
- If copies diverge, update `onedone-docs` first, then sync outward.

## 2. Local iOS setup

Tooling requirements:
- Latest stable Xcode version supported by the project.
- iOS Simulator runtime installed.
- Apple Developer signing setup for real-device testing.

Device notes:
- Simulator is fine for most UI/API checks.
- Real device is required before external sharing and release handoff confidence.

Scheme rules:
- Shared scheme (for example `OneDone`) must stay value-free.
- Local unshared scheme (recommended: `OneDone Local`) should hold concrete env values.
- Never commit local unshared scheme values.

Required local env values (placeholders only):
- `ONEDONE_SUPABASE_URL=<SUPABASE_URL_PLACEHOLDER>`
- `ONEDONE_SUPABASE_ANON_KEY=<SUPABASE_ANON_KEY_PLACEHOLDER>`
- `ONEDONE_FUNCTIONS_BASE_URL=<FUNCTIONS_BASE_URL_PLACEHOLDER>`
- `ONEDONE_SUBSCRIPTION_PRODUCT_ID=<APP_STORE_PRODUCT_ID_PLACEHOLDER>`

Do not commit:
- Concrete env values.
- Local scheme files containing concrete values.

## 3. iOS build/run

Simulator run:
1. Open `onedone-ios` in Xcode.
2. Select local unshared scheme (recommended: `OneDone Local`).
3. Select simulator device.
4. Run app (`Cmd + R`).

Real device run:
1. Connect device and trust developer certificate.
2. Select local unshared scheme.
3. Select physical device target.
4. Confirm signing team and bundle provisioning are valid.
5. Run app.

Common provisioning/profile issues:
- Missing signing team: set Apple Developer Team in Xcode signing settings.
- Profile mismatch: refresh profiles and ensure bundle identifier matches account entitlements.
- Device not provisioned: register device in Apple Developer account and regenerate profile.

StoreKit config selection:
- Confirm `OneDone.storekit` is selected for local StoreKit testing.
- Confirm product ID inside local StoreKit config matches `ONEDONE_SUBSCRIPTION_PRODUCT_ID`.

Local scheme recommendation:
- Use `OneDone Local` for all day-to-day development runs with concrete env values.

## 4. Supabase backend setup

Prerequisites:
- Supabase CLI installed.
- Supabase account access to the target project.

Setup flow:
1. Authenticate CLI.
2. Link local backend repo to target Supabase project.
3. Apply database migrations.
4. Deploy required Edge Functions.
5. Configure required secrets.
6. Verify function and secret visibility.

Required functions (current MVP):
- `complete-onboarding`
- `get-access-state`
- `analyze-task`
- `answer-clarification`
- `generate-reply`
- `update-task-status`
- `message-marked-sent`
- `list-tasks`
- `get-task-detail`
- `get-task-outputs`
- `get-task-events`
- `get-checklist-items`
- `get-reminders`
- `reminder-create`
- `reminder-update`
- `reminder-cancel`
- `reminder-snooze`
- `validate-subscription`
- `restore-purchases`
- `feedback`
- `delete-task`
- `delete-all-data`
- `delete-account`

Required backend secrets:
- `OPENAI_API_KEY`
- `OPENAI_MODEL`

Important boundaries:
- iOS never calls OpenAI directly.
- OpenAI key must never be used in iOS.
- Supabase `service_role` must never be used in iOS.

## 5. Backend deployment commands

Run these from `onedone-backend` with placeholder values only.

Authenticate and link:
```bash
supabase login
supabase link --project-ref <SUPABASE_PROJECT_REF>
```

Apply migrations:
```bash
supabase db push
```

Deploy all required functions one by one:
```bash
supabase functions deploy <FUNCTION_NAME>
```

List deployed functions:
```bash
supabase functions list
```

Set secrets (placeholder example):
```bash
supabase secrets set OPENAI_API_KEY=<OPENAI_API_KEY_PLACEHOLDER>
supabase secrets set OPENAI_MODEL=<OPENAI_MODEL_PLACEHOLDER>
```

List secrets metadata:
```bash
supabase secrets list
```

## 6. StoreKit local testing

Local StoreKit scope:
- `OneDone.storekit` is for development testing only.
- Real TestFlight/App Store subscription testing still requires App Store Connect setup.

Product alignment check:
- Ensure StoreKit local product ID equals `ONEDONE_SUBSCRIPTION_PRODUCT_ID` in local unshared scheme.

Force `starter_expired` for a test user (non-production environments only):
1. Use Supabase SQL editor against test/staging environment.
2. Update the test user profile row so onboarding is complete and Starter Access end is in the past.
3. Use a user without active subscription records for clean gate testing.

Placeholder SQL example:
```sql
update profiles
set onboarding_required = false,
    onboarding_completed_at = coalesce(onboarding_completed_at, now()),
    starter_status = 'active',
    starter_started_at = coalesce(starter_started_at, now() - interval '4 days'),
    starter_ends_at = now() - interval '1 hour'
where id = '<TEST_USER_UUID>';
```

Optional cleanup for clean trial gate testing in non-production:
```sql
delete from subscription_events where user_id = '<TEST_USER_UUID>';
delete from subscriptions where user_id = '<TEST_USER_UUID>';
```

Reset StoreKit test transactions:
- In Xcode, open StoreKit transaction manager for the running scheme/session.
- Delete/reset local test transactions.
- Re-run app and repeat purchase flow.

Subscription conflict case and safe reset:
- Symptom: test transaction appears linked to a different account or restore behaves inconsistently.
- Safe reset sequence:
1. Reset local StoreKit transactions in Xcode test environment.
2. Remove related non-production `subscriptions` and `subscription_events` rows for test users.
3. Re-run purchase flow with a single clean test user.

## 7. Manual end-to-end smoke test

1. Sign up with email/password.
2. Log in.
3. Complete onboarding.
4. Confirm Starter Access route and Home availability.
5. Submit a new task and verify `analyze-task` call succeeds.
6. If clarification is returned, answer it and verify `answer-clarification` path.
7. Open My Tasks and confirm remote list loads.
8. Open Task Detail and confirm detail/output/event/checklist/reminder data loads.
9. Generate reply and verify `generate-reply` success.
10. Mark sent and verify `message-marked-sent` sync.
11. Create reminder and verify local notification plus backend reminder sync.
12. Force `starter_expired` for test user.
13. Confirm subscription gate appears and blocked creation behavior is enforced.
14. Start StoreKit subscription flow and verify `validate-subscription` sync.
15. Run restore purchases flow and verify `restore-purchases` sync.
16. Log out.
17. Relaunch app and verify session restore behavior for logged-in vs logged-out state.

## 8. Common issues and fixes

Missing Supabase config:
- Symptom: auth/runtime initialization errors about missing URL or anon key.
- Fix: set required env vars in local unshared scheme, then relaunch app.

Function not found:
- Symptom: HTTP 404 from Edge Function endpoint.
- Fix: deploy missing function using `supabase functions deploy <FUNCTION_NAME>` and verify with `supabase functions list`.

Wrong functions base URL:
- Symptom: network errors or requests hitting wrong host/path.
- Fix: set `ONEDONE_FUNCTIONS_BASE_URL` to correct placeholder target format and ensure no accidental typo.

401 auth error:
- Symptom: protected endpoints fail with unauthorized.
- Fix: re-login, confirm valid session restore, verify Authorization header path uses current token.

`analyze-task` response decode mismatch:
- Symptom: request succeeds but app fails to parse payload.
- Fix: compare backend payload shape against `04_api_contract.md` and align deployed function version with current iOS expectations.

Read APIs not called due to duplicated `/functions/v1`:
- Symptom: malformed URL paths with repeated segments.
- Fix: ensure `ONEDONE_FUNCTIONS_BASE_URL` and endpoint concatenation do not double-prefix `/functions/v1`.

StoreKit transaction linked to another account:
- Symptom: restore/purchase reflects wrong user subscription state.
- Fix: reset local StoreKit transactions and clear non-production subscription rows for affected test users.

`validate-subscription` payload issues:
- Symptom: backend rejects payload as invalid request.
- Fix: verify `verification_mode=ios_verified_mirror` and allowed environment values (`xcode`, `sandbox`, `testflight`).

Shared scheme accidentally contains env values:
- Symptom: concrete runtime values appear in shared project config/PR.
- Fix: remove concrete values from shared scheme, move to local unshared scheme, and re-check git diff.

Local scheme/env lost after checkout:
- Symptom: app launches without runtime configuration.
- Fix: re-create local unshared scheme and re-enter placeholder env values from team runbook.

## 9. Debugging guide

Xcode logs:
- Use Xcode debug console during app run.
- Check auth flow, endpoint calls, and request/response status handling.

Supabase Edge Function logs:
- Check Supabase dashboard function logs for request failures.
- Optional CLI path (if enabled in your CLI version):
```bash
supabase functions logs <FUNCTION_NAME>
```

Database inspection:
- Use Supabase SQL editor/table browser.
- Common tables for smoke-debug:
  - `profiles`
  - `subscriptions`
  - `subscription_events`
  - `tasks`
  - `task_outputs`
  - `task_events`
  - `clarifications`
  - `checklist_items`
  - `reminders`
  - `usage_events`

What not to log:
- Raw passwords.
- Raw auth tokens.
- Raw StoreKit transaction payloads.
- Raw private user content.
- Secret values.

Git secret inspection:
```bash
git grep -n "service_role"
git grep -n "OPENAI_API_KEY"
git grep -n "ONEDONE_SUPABASE_ANON_KEY"
git status --short
git diff -- .
```

## 10. Security checklist

- [ ] No Supabase `service_role` key in iOS code/config.
- [ ] No OpenAI key in iOS code/config.
- [ ] iOS never calls OpenAI directly.
- [ ] Shared Xcode scheme contains no concrete env values.
- [ ] Local unshared scheme contains concrete env values only on developer machine.
- [ ] Logs do not contain raw tokens/passwords/transaction payloads.
- [ ] `usage_events` does not contain raw user content.
- [ ] Backend secrets are configured only in Supabase secrets.

## 11. Release handoff notes

TestFlight/App Store subscription readiness:
- Local StoreKit config is development-only.
- Real TestFlight/App Store subscription testing requires App Store Connect product setup.

Auth and platform readiness:
- Sign in with Apple may be required before broader/public release if product scope requires it.
- Production email redirect/deep-link setup may still be required.

Deferred subscription infrastructure:
- App Store Server Notifications are deferred.
- Full Apple Server API validation is deferred.

Operational reminder:
- Keep `onedone-docs` as source-of-truth and sync copies in app/backend repos after doc updates.
