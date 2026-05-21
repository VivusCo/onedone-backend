# OneDone — Supabase Backend Specification v6

This is the backend specification for OneDone.

## Core decisions

- Supabase backend.
- Supabase Auth with Sign in with Apple.
- 3-day Starter Access after onboarding.
- App Store 14-day trial after Starter Access.
- Starter Access is backend-controlled.
- App Store trial is StoreKit-controlled.
- No backend-only App Store trial grant.
- Backend performs server-side StoreKit validation for production MVP.
- App Store Server Notifications are required for public release, optional for internal TestFlight.
- Tasks are created only by `analyze-task`, except split children.
- `generate-reply` requires `task_id`.
- MVP is text-first.
- Attachments are v1.1 / coming soon.

## Main access flow

```txt
Register / Sign in
→ Complete onboarding
→ 3-day Starter Access
→ App Store 14-day trial
→ Paid subscription
```

## Access states

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

## Route table

| Access state | App destination |
|---|---|
| unauthenticated | Auth screen |
| onboarding_required | Onboarding flow |
| starter_active | Home |
| starter_expired | App Store trial offer gate |
| trial_not_started | App Store trial offer gate |
| trial_active | Home |
| subscription_active | Home |
| subscription_cancelled_active | Home with subscription status |
| grace_period | Home with billing warning |
| billing_issue | Limited Home / Billing issue paywall |
| trial_expired | Limited Home / Subscribe screen |
| subscription_expired | Limited Home / Subscribe screen |

## Main tables

- profiles
- subscriptions
- subscription_events
- tasks
- task_outputs
- task_events
- clarifications
- checklist_items
- reminders
- user_notes
- incoming_replies
- task_feedback
- attachments
- usage_events

## Main Edge Functions

- complete-onboarding
- validate-subscription
- app-store-server-notifications
- restore-purchases
- get-access-state
- analyze-task
- retry-task-analysis
- answer-clarification
- confirm-split-tasks
- generate-reply
- generate-follow-up
- process-incoming-reply
- update-task-status
- message-marked-sent
- checklist CRUD
- reminder CRUD
- notification-triggered
- feedback
- delete-task
- delete-all-data
- delete-account

## Rate limits

- Starter Access: 10 AI actions/day.
- App Store trial: 50 AI actions/day.
- Subscriber: 100 AI actions/day.
- Regenerate: max 3 per output type per task.

## Privacy

- Raw task input and pasted replies are stored to support task history.
- `usage_events` must not store raw user content.
- Users must be able to delete tasks, all task data, and account.
