# OneDone — MVP Implementation Plan v2

## Goal

Build the first realistic version of OneDone without overloading development.

## Final access strategy

```txt
Open app
→ Register / Sign in
→ Onboarding
→ 3-day Starter Access
→ App Store 14-day trial gate
→ Paid subscription
```

## Starter Access

Starter Access gives real, limited-time product access.

- Not called a trial in UI.
- Not an App Store trial.
- Backend-controlled.
- Limited by fair-use rules.

Recommended copy:

> Your first 3 days are open.

Subtext:

> Try OneDone with real tasks. After 3 days, start your 14-day App Store trial to keep going.

## First TestFlight must-have

### iOS

- Sign in with Apple.
- Onboarding.
- Starter Access activation after onboarding.
- Starter Access indicator.
- Starter expired gate to App Store trial.
- StoreKit 2 trial purchase flow.
- Home screen.
- New Task text input.
- Clarification Screen.
- Task Result Screen.
- Task Detail simplified.
- My Tasks simplified.
- Draft Reply screen.
- Reminder creation with local notifications.
- Settings with access/subscription status and restore purchases.
- Limited mode after Starter/Trial/Subscription expiry.

### Backend

- Supabase Auth.
- Profile creation.
- Complete onboarding endpoint.
- Starter Access fields and access logic.
- StoreKit validation/mirroring for App Store trial.
- Access state endpoint.
- Tasks table.
- Task outputs table.
- Task events table.
- Clarifications table.
- Checklist items table.
- Reminders table.
- Usage events.
- Analyze task Edge Function.
- Answer clarification Edge Function.
- Generate reply Edge Function.
- Reminder CRUD.
- Update task status.
- RLS policies.

### First templates

1. cancel_subscription
2. request_refund
3. return_item
4. understand_bill
5. reply_to_message

## Milestones

1. Clickable UI / mock data
2. Supabase skeleton
3. AI task loop
4. StoreKit trial
5. Follow-through
6. Public release readiness
