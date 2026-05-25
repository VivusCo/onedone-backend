# OneDone — Test Cases

These are the current MVP manual test cases for implemented flows.

## 1. Auth / Session Restore / Logout

1. Sign up with email/password.
2. Log in with valid credentials.
3. Force-close and reopen app.
4. Verify session restore routes user to backend-driven access flow.
5. Log out.
6. Verify auth screen is shown and protected endpoints require re-auth.

Expected:
- Auth works without mock-only bypass for normal runtime.
- Session persists via Keychain and restores correctly.
- Logout clears session and protected runtime state.

## 2. Onboarding and Access-State Routing

1. Log in as a user requiring onboarding.
2. Complete onboarding UI.
3. Confirm `POST /complete-onboarding` is called.
4. Refresh access state via `GET /get-access-state`.
5. Validate route for each test state (`starter_active`, `starter_expired`, `trial_active`, `trial_expired`).

Expected:
- Backend access-state is routing source of truth.
- Starter activation occurs after onboarding completion.

## 3. AI Task Flow (Analyze -> Clarify -> Result)

1. Submit a new task text.
2. Confirm `POST /analyze-task` with idempotency key.
3. If clarification is requested, answer it.
4. Confirm `POST /answer-clarification`.
5. Verify task result and checklist/next-step data load.

Expected:
- No local-only task creation before backend `task_id`.
- Clarification and result routing work end-to-end.

## 4. Task List and Task Detail Reads

1. Open My Tasks.
2. Confirm `GET /list-tasks` loads backend items.
3. Open one task detail.
4. Confirm detail/read endpoints:
   - `GET /get-task-detail`
   - `GET /get-task-outputs`
   - `GET /get-task-events`
   - `GET /get-checklist-items`
   - `GET /get-reminders`

Expected:
- Remote task list/detail data loads in normal runtime.
- Empty/error states degrade safely.

## 5. Draft Reply and Sent State

1. Generate reply from a task with backend `task_id`.
2. Confirm `POST /generate-reply`.
3. Mark message as sent.
4. Confirm `POST /message-marked-sent`.
5. Verify status/timeline refresh.

Expected:
- No orphan reply generation without `task_id`.
- Sent-state updates are reflected in list/detail.

## 6. Reminder Flow

1. Create reminder from task.
2. Verify local notification scheduling succeeds first.
3. Confirm `POST /reminder-create` with `ios_notification_id`.
4. Update/cancel/snooze reminder and verify:
   - `POST /reminder-update`
   - `POST /reminder-cancel`
   - `POST /reminder-snooze`

Expected:
- Reminder local + backend sync pipeline works.
- Permission-denied path shows user-friendly fallback.

## 7. StoreKit Local Configuration Flow

1. Ensure `OneDone.storekit` is active in local testing scheme.
2. Enter subscription gate state.
3. Start purchase and restore paths.
4. Confirm:
   - `POST /validate-subscription`
   - `POST /restore-purchases`

Expected:
- StoreKit local test flow updates backend mirror state.
- Access-state refresh reflects subscription outcome.

## 8. Subscription Conflict Case

1. Link a StoreKit test transaction to user A.
2. Attempt reuse/link behavior with user B without resetting local StoreKit test state.
3. Observe backend conflict/validation response.
4. Reset local StoreKit transactions and backend test records; retry.

Expected:
- Conflict is handled safely and does not corrupt access-state.
- Reset path restores expected test behavior.

## 9. Limited Mode Behavior

1. Put account into `trial_expired` or `subscription_expired`.
2. Verify existing task list/detail remains readable.
3. Attempt blocked actions (new task, new reply generation, template generation).

Expected:
- Limited mode allows read/follow-through actions only.
- Locked actions route to trial/subscription gate.

## 10. Security / No Secrets

1. Inspect iOS runtime config and scheme values.
2. Verify no Supabase `service_role` key in iOS app config/code.
3. Verify no OpenAI key in iOS app config/code.
4. Verify shared scheme contains no concrete runtime secrets/URLs.

Expected:
- Only safe client values are present (for example Supabase URL + anon key).
- OpenAI keys exist only in Supabase secrets.

## 11. Remote Runtime vs Mock Preview Fallback

1. Launch with normal runtime configuration.
2. Verify remote backend mode is active by default.
3. Validate core auth/task/reminder/subscription calls hit backend.
4. Launch preview/dev fallback path with mock mode explicitly enabled.

Expected:
- Real app usage defaults to remote runtime.
- Mock mode is restricted to previews/development fallback behavior.
