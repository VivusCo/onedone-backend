# OneDone — iOS App Product Specification v6

## 1. Product Summary

### Product name
**OneDone**

### Product category
AI Life Admin Assistant

### One-liner
**One small thing, done.**

### Product promise
OneDone helps users deal with small everyday life admin tasks they usually avoid: subscriptions, refunds, bills, emails, appointments, landlord messages, complaints, and follow-ups.

The user sends a task, copied message, bill text, document text, or description. OneDone explains what it means, asks one key clarification question if needed, gives the correct next step, prepares a reply, creates a checklist, and helps the user follow through.

### MVP scope
MVP is **text-first**.

Users can:
- type a task;
- paste message text;
- paste bill/document text;
- use templates;
- generate replies/checklists/follow-ups.

Users cannot process uploaded screenshots/PDFs in MVP unless attachment processing is implemented.

### Attachments UI decision
Preferred MVP UX:
- show attachment entry point as disabled **“Coming soon”** if Codex/development can implement it cleanly;
- if it creates too much complexity or broken expectations, hide attachment entry points completely.

The app should be controlled by backend/remote feature flags:

```json
{
  "can_upload_files": false,
  "attachments_status": "coming_soon"
}
```

### Core positioning
OneDone is a **guided self-service assistant**, not an autonomous execution agent.

OneDone does not log into accounts, send emails, cancel subscriptions, call companies, or make payments. It gives the user exact steps, ready messages, reminders, and follow-ups so they can handle the task themselves.

---

## 2. Final Product Decisions

### 2.1 Access model
OneDone uses a staged access model:

```txt
Register / Sign in
→ Complete onboarding
→ 3-day Starter Access
→ App Store 14-day trial
→ Paid subscription
```

### 2.2 Starter Access
After onboarding, the user receives **3-day Starter Access**.

Starter Access lets users try OneDone with real tasks before starting the App Store trial.

It is not called a trial in UI.
It is backend-controlled.
It has fair-use limits.

### 2.3 App Store trial
After Starter Access ends, the user must start the **App Store 14-day trial** to continue real usage.

The App Store trial is attached to a subscription product and starts through Apple’s purchase sheet.

### 2.4 No classic “Not now” after Starter expiry
When Starter Access expires, there is no “Not now” that allows continued real usage.

The user can:
- start App Store trial;
- restore purchases;
- read Terms/Privacy;
- view limited old data;
- close the app.

### 2.5 Onboarding completion
After the final onboarding screen, iOS calls:

```txt
POST /complete-onboarding
```

Backend starts Starter Access and returns access state.

### 2.6 Task creation source of truth
The app does not create tasks locally before backend confirmation.

iOS sends `POST /analyze-task`. Backend creates the task and returns `task_id`.

Exception:
- split child tasks are created through `POST /confirm-split-tasks` after user confirmation.

### 2.7 generate-reply requires task_id
If user starts from “Reply to a message,” app first calls `analyze-task` to create a task, then calls `generate-reply` with `task_id`.

No orphan replies.

### 2.8 App Store Server Notifications
For internal TestFlight, the app can refresh subscription state on app open, purchase, restore, and before AI actions.

For public release, backend should support App Store Server Notifications so subscription changes can be reflected even when the app is not opened.

---

## 3. Access State Routing

The app routes users based on backend access state.

| Access state | App route |
|---|---|
| unauthenticated | Auth screen |
| onboarding_required | Onboarding flow |
| starter_active | Home |
| starter_expired | App Store trial gate |
| trial_not_started | App Store trial gate |
| trial_active | Home |
| subscription_active | Home |
| subscription_cancelled_active | Home with subscription note |
| grace_period | Home with billing warning |
| billing_issue | Limited Home / billing paywall |
| trial_expired | Limited Home / subscribe for locked actions |
| subscription_expired | Limited Home / subscribe for locked actions |

### Limited mode
After Starter/Trial/Subscription expiry, user can:
- view existing tasks;
- view Task Detail;
- copy previously generated replies/outputs;
- mark existing tasks done;
- update existing task status;
- edit/cancel existing reminders;
- delete tasks;
- delete account/data;
- restore purchases.

User cannot:
- create new tasks;
- generate new replies;
- regenerate outputs;
- generate follow-ups;
- process pasted replies with AI;
- generate from templates;
- upload/process files.

---

## 4. Starter Access UX

### 4.1 First screen after onboarding
Headline:
> Your first 3 days are open.

Subtext:
> Try OneDone with real tasks. After 3 days, start your 14-day App Store trial to keep going.

CTA:
> Start using OneDone

No Apple purchase sheet appears at this point.

### 4.2 Home during Starter Access
Header indicator:
> Starter: 3 days left

or:
> Starter: 2 days left

Tap opens Access screen.

### 4.3 Starter Access explanation
Access screen explains:
- how many days are left;
- what Starter Access includes;
- that App Store trial will be needed to continue;
- Restore Purchases;
- Terms/Privacy.

### 4.4 Soft reminders
When 1 day remains:
> Your Starter Access ends tomorrow. Start your 14-day App Store trial to keep using OneDone.

When expired:
> Your Starter Access has ended. Start your 14-day App Store trial to keep using OneDone.

### 4.5 Can user start App Store trial early?
Recommended: yes.

Settings / Access screen can include:
> Start App Store trial now

But the product should not push this aggressively before Starter Access expires.

---

## 5. StoreKit Flow

### Start App Store trial flow
1. App loads subscription products from StoreKit.
2. User taps “Start 14-day trial”.
3. Apple purchase sheet opens.
4. User confirms.
5. iOS receives verified StoreKit transaction/current entitlement.
6. iOS sends transaction metadata to backend `POST /validate-subscription`.
7. Backend validates/mirrors subscription state.
8. App calls `GET /get-access-state`.
9. If access active, app opens Home.

### Restore purchases flow
1. User taps Restore Purchases.
2. iOS checks current StoreKit entitlements.
3. iOS sends verified entitlement to backend.
4. Backend updates subscription state.
5. App refreshes access state.

### Trial gate content after Starter expiry
Headline:
> Keep using OneDone.

Subtext:
> Your Starter Access has ended. Start your 14-day App Store trial to keep using task breakdowns, replies, reminders, and follow-ups.

Primary CTA:
> Start 14-day trial

Secondary links:
- Restore Purchases
- Terms of Use
- Privacy Policy

No “Not now” for real usage.

---

## 6. Navigation Structure

Active access tabs:

1. **Home**
2. **My Tasks**
3. **Templates**
4. **Settings**

Limited mode tabs:
- Home: subscription/trial gate and limited explanation.
- My Tasks: existing tasks available.
- Templates: previews only; generation opens trial/subscription gate.
- Settings: fully available.

---

## 7. Home Screen

### Header
- Greeting
- Access indicator
- Notification bell

### Access indicator examples
- `Starter: 3 days left`
- `Trial: 12 days left`
- `Active`
- `Billing issue`
- `Starter ended`
- `Trial ended`

Tap opens Access/Subscription screen.

### Main input card
Placeholder:
> What do you need to deal with?

Helper:
> Paste a message, bill, document text, or describe the task.

CTA:
> Send task

### Attachment entry point
Preferred:
- show attachment button in disabled state with label `Coming soon`;
- use muted styling;
- tap opens small explanation, not a broken picker.

Fallback:
- hide attachment button if implementation adds too much complexity.

### Quick actions
Quick actions should be life scenarios, not AI functions.

Recommended:
- Cancel a subscription
- Return an item
- Request a refund
- Understand a bill
- Write a complaint
- Reply to a message

### Quick action behavior
Tapping a quick action opens New Task with hidden `selected_template`.

Example:
- `Cancel a subscription` → New Task with `selected_template = cancel_subscription`.

### Notification bell
MVP data source:
- due reminders;
- follow-ups needed;
- starter/trial/subscription alerts.

Avoid making Notification Center too broad in MVP.

---

## 8. Template ID Contract

Template IDs must match backend:

```txt
cancel_subscription
return_item
request_refund
write_complaint
understand_bill
explain_document
message_landlord
book_or_reschedule
prepare_for_call
clear_my_chaos
reply_to_message
```

### Template behavior in limited mode
Templates are visible as previews. On tap:
- show template detail preview;
- primary CTA opens App Store trial/subscription gate if access expired.

### Text-first guard
For `explain_document`, copy should say:
> Paste the document text you want to understand.

Do not promise document upload in MVP.

---

## 9. New Task Flow

### Fields
- Task description text field.
- Optional deadline.
- Hidden selected_template if launched from quick action/template.

Avoid visible category selection in MVP. Category should be detected by backend.

### Submit behavior
1. Check access state.
2. Validate input length and non-empty text.
3. Send `POST /analyze-task` with idempotency key.
4. Show loading state.
5. Backend returns one of:
   - clarification;
   - task_analysis;
   - multi_task_split_preview;
   - retryable failure;
   - access error.
6. iOS routes to correct screen.

### Loading behavior
If user leaves loading screen, the request continues. When app receives response:
- if success, task appears in My Tasks;
- if failure, task appears as Failed with retry option.

### Retry behavior
Retry failed analysis from the same task. Do not create duplicate task.

---

## 10. Clarification Screen

### Purpose
Ask one key question when backend returns `response_type = clarification`.

### UI
Header:
> Let’s clarify this

Helper:
> To give the right steps, I need one detail.

Question, helper text, options from backend.

CTA:
> Continue

Secondary:
> Skip for now

### Skip/cancel behavior
If user leaves or taps Skip:
- task remains in status `needs_clarification`;
- task appears in My Tasks;
- user can return later and answer.

### Max clarification rule
Max 2 blocking questions before first useful output. Additional details should appear as optional steps, not more blocking questions.

### “I’m not sure” behavior
If user selects “I’m not sure,” app shows backend helper path rather than a dead end.

Example for subscription:
1. Check iPhone Settings → Apple ID → Subscriptions.
2. Search your email for receipts.
3. Check bank statement merchant name.
4. Open the service app and look for billing provider.

---

## 11. Task Result Types

### 11.1 Task Analysis
General explanation and next step.

### 11.2 Message Explanation
For emails, bills, and pasted document text.

### 11.3 Decision Flow Result
For branching scenarios like cancellation, returns, refunds.

### 11.4 Draft Reply Result
Generated reply with tone/language controls.

### 11.5 Multi-task Split Preview
For “Clear my chaos” or multiple tasks in one message.

---

## 12. Task Detail Screen

### Purpose
Task Detail is the main follow-through hub.

### Sections
1. Header
2. Status selector
3. Current next step
4. Timeline / history
5. Checklist
6. AI outputs
7. Reply drafts
8. Reminder / follow-up
9. Notes
10. Actions

### Header
- Task title
- Category icon
- Due date if exists
- More menu

### Status selector
Statuses:
- New
- Needs Clarification
- In Progress
- Waiting for Reply
- Follow-up Needed
- Done
- Postponed
- Failed
- Split

### Current next step
Shows the latest active next step and source output when available.

### Timeline
User-facing timeline events:
- task created;
- clarification asked;
- clarification answered;
- analysis generated;
- reply generated;
- message copied;
- message marked sent;
- reminder created/updated/cancelled/snoozed;
- follow-up needed;
- follow-up generated;
- incoming reply pasted;
- note added;
- status changed;
- task done;
- task reopened.

Timeline events are immutable.

### Checklist
Editable checklist is source of truth.

User can:
- check/uncheck item;
- add item;
- edit item;
- delete item.

If all checklist items are completed, app suggests:
> Mark this task as done?

It does not auto-close.

### AI outputs
Show current output by default with option:
> View history

Output history includes regenerated versions.

### Reply drafts
Each draft includes:
- version;
- subject;
- message;
- tone;
- language;
- copy;
- share;
- regenerate if access active.

After expiry:
- copy old output allowed;
- regenerate locked.

### Reminder section
User can:
- create reminder;
- edit reminder;
- cancel reminder;
- snooze reminder;
- see local notification status.

### Notes
User can add extra context:
- order number;
- “they promised to reply Friday”;
- contact details;
- manual notes.

### More menu
- Rename task
- Edit deadline
- Change status
- Change category
- Reopen task
- Delete task
- Report wrong path

---

## 13. My Tasks Screen

### Purpose
My Tasks is not a generic to-do list. It is a follow-through hub.

### Filters
- All
- Needs Clarification
- Follow-up Needed
- Due Soon
- Waiting for Reply
- In Progress
- Done

### Sorting logic
Default sorting:
1. Follow-up Needed
2. Due Soon
3. Needs Clarification
4. Waiting for Reply
5. In Progress
6. New
7. Postponed
8. Done

### Due Soon threshold
MVP definition:
> Due within the next 3 days.

### Task card content
Each card shows:
- title;
- category icon;
- status badge;
- due date / reminder date;
- last relevant event;
- current next step preview;
- completion control if applicable.

### Empty states
#### No tasks
> Nothing to handle yet. Send one task, message, or bill and OneDone will show the next step.

#### No reminders
> No reminders yet. OneDone will suggest them when a task has a deadline or follow-up.

#### Done empty
> Completed tasks will appear here.

---

## 14. Status Transition Rules

Allowed transitions:

```txt
New → Needs Clarification
New → In Progress
New → Failed
Needs Clarification → In Progress
Needs Clarification → Failed
Failed → In Progress via retry
In Progress → Waiting for Reply
In Progress → Done
In Progress → Postponed
Waiting for Reply → Follow-up Needed
Waiting for Reply → Done
Waiting for Reply → In Progress after incoming reply requiring action
Follow-up Needed → Waiting for Reply after follow-up sent
Follow-up Needed → Done
Postponed → In Progress
Postponed → Done
Done → In Progress via Reopen
Split → read-only parent state
```

Rules:
- Done tasks can be reopened.
- Reminder trigger must not change Done task to Follow-up Needed.
- Postponed should require a date/reminder or note.
- Manual Waiting for Reply should prompt follow-up reminder.

---

## 15. Post-Answer Actions

### After copying message
Prompt:
> Did you send it?

Buttons:
- Yes, I sent it
- Not yet
- Remind me later

If Yes:
- call atomic backend action;
- status becomes Waiting for Reply;
- offer follow-up reminder.

### Follow-up reminder prompt
When follow-up opens:
> Did they reply?

Buttons:
- Yes, paste reply
- No, draft follow-up
- Mark done
- Remind me later

### Paste reply flow
User pastes raw reply.

App calls:
```txt
POST /process-incoming-reply
```

Backend returns:
- what it means;
- whether action is needed;
- suggested next step;
- possible reply if needed.

Task should not auto-become Done. App asks user to confirm Done.

---

## 16. Draft Reply / Tone / Language Flow

### Defaults
- UI language: from profile.
- Task language: auto.
- Reply language: auto by default.
- Tone: default from profile, usually polite.

### User can override
Inside Draft Reply screen:
- tone selector;
- language selector.

Changing tone/language requires regeneration and is locked after subscription expiry.

### Tone options
- Polite
- Firmer
- Shorter

### Reply languages MVP
- Auto
- English
- Russian
- Ukrainian
- Romanian

### App UI languages MVP
Recommended:
- English first
- Russian or Ukrainian next, depending on test audience

---

## 17. Multi-task Split Flow

### Trigger
User sends input with multiple tasks.

Example:
> I need to pay internet, cancel subscription, return dress, and book doctor.

### Backend response
`multi_task_split_preview`

### Preview UI
Suggested tasks with checkboxes and temporary IDs.

CTA:
> Create selected tasks

CTA disabled until at least one task is selected.

Secondary:
> Cancel split

### Behavior
1. Initial task becomes split parent.
2. User selects split items.
3. App calls `POST /confirm-split-tasks`.
4. Backend creates child tasks.
5. Parent task status becomes Split.

### Cancel split
If user cancels split:
- parent task remains as original task;
- user can delete, postpone, or retry later.

### Delete split parent
Deleting a split parent does not delete child tasks.

Child tasks remain in My Tasks as independent tasks.

---

## 18. Reminder & Notification Logic

### Reminder actions
User can:
- create reminder;
- edit reminder;
- cancel reminder;
- snooze reminder.

### Creation order
Recommended MVP:
1. iOS checks notification permission.
2. iOS schedules local notification.
3. If success, iOS sends reminder to backend with `ios_notification_id`.
4. If local scheduling fails, app shows error.

### Permission state
App sends notification permission state to backend profile.

### Reminder prompts by type
#### Deadline reminder
Opens Task Detail with current next step.

#### Follow-up reminder
Opens prompt:
> Did they reply?

### Mark Done behavior
When task is marked Done and active reminders exist, ask:
> Cancel active reminders for this task?

Options:
- Cancel reminders
- Keep reminders

Recommended default: cancel reminders.

### Snooze behavior
Snooze updates reminder time and reschedules local notification.

---

## 19. Risk, Safety, and Confidence UI

### Risk levels
If risk is high, show safety card:
> This may involve legal, medical, financial, or urgent consequences. OneDone can help you organize the next step, but you may need a qualified professional.

### Category-specific safety
- Health: do not diagnose; suggest professional help when needed.
- Money: do not make financial decisions.
- Legal/landlord: do not provide legal certainty.
- Bills/deadlines: show uncertainty if AI is not sure.

### Deadline confidence
- Confirmed: “Due May 24”
- Possible: “Possible deadline: May 24 — please confirm”

Before creating reminder from detected deadline, user confirms date/time.

### Assumptions
Show assumptions if backend provides them.

### Wrong path feedback
Every result screen includes:
> Not helpful / Wrong path

Options:
- Wrong steps
- Missing option
- Bad reply
- Too generic
- Unsafe/sensitive
- Other

---

## 20. Offline Behavior

MVP offline behavior is read-only.

Allowed offline:
- view cached tasks;
- view cached outputs;
- view cached checklist;
- view cached timeline.

Blocked offline:
- create task;
- generate AI output;
- answer clarification;
- edit status;
- create/edit reminders.

Message:
> You’re offline. You can view saved tasks, but changes require internet.

---

## 21. Settings Screen

### Account
- User email/name
- Sign out
- Delete account

### Access / Subscription
- Starter Access status
- Starter days left
- Trial/subscription status
- Current plan
- Start App Store trial now
- Manage subscription
- Restore purchases

### Preferences
- UI language
- Default task language
- Default reply language
- Default tone
- Timezone
- Notification settings

### Privacy
- Delete all tasks
- Delete all data
- Export data later
- Privacy Policy
- Terms of Use

### Help
- Contact support
- Send feedback
- Report a problem

### Support/report MVP
Recommended MVP:
- report task-specific issue through backend feedback endpoint;
- general support via mailto or simple support form.

---

## 22. Data Mapping Notes

Backend uses snake_case. Swift uses camelCase.

Examples:
- `starter_active` → `.starterActive`
- `starter_expired` → `.starterExpired`
- `waiting_for_reply` → `.waitingForReply`
- `follow_up_needed` → `.followUpNeeded`
- `needs_clarification` → `.needsClarification`
- `task_analysis` → `.taskAnalysis`

Unknown backend enum values should map safely:
- unknown category → `.other`
- unknown status → `.new` or generic fallback
- unknown response type → generic result screen

---

## 23. Suggested Swift Models

Use struct-based access state for backend decoding.

```swift
struct AccessState: Codable {
    let accessState: String
    let starterDaysLeft: Int?
    let starterEndsAt: Date?
    let trialDaysLeft: Int?
    let trialEndsAt: Date?
    let subscriptionStatus: String?
    let currentPeriodEnd: Date?
    let canProcessTasks: Bool
    let canGenerateReplies: Bool
    let canGenerateFollowups: Bool
    let canViewTemplates: Bool
    let canGenerateFromTemplates: Bool
    let canCreateNewReminders: Bool
    let canEditExistingReminders: Bool
    let canCancelExistingReminders: Bool
    let canUpdateExistingTasks: Bool
    let canCopyExistingOutputs: Bool
    let canDeleteTasks: Bool
    let canUploadFiles: Bool
    let attachmentsStatus: String?
}
```

Core models:
- `LifeTask`
- `TaskOutput`
- `TaskEvent`
- `ChecklistItem`
- `Reminder`
- `UserNote`
- `IncomingReply`
- `TaskFeedback`

---

## 24. Final iOS MVP Decision Set

1. Native iOS app.
2. SwiftUI.
3. Supabase backend in separate project.
4. Registration before onboarding.
5. Explicit complete-onboarding action.
6. 3-day Starter Access after onboarding.
7. App Store 14-day trial after Starter Access to continue.
8. StoreKit 2 purchase/restore flow.
9. No classic “Not now” for real usage after Starter expires.
10. Access state route table.
11. Limited mode explicitly supported.
12. Task creation only through analyze-task, except split children.
13. generate-reply requires task_id.
14. Text-first MVP.
15. Attachment entry point is disabled “Coming soon” if implementation is clean; otherwise hidden.
16. Clarification Screen with skip/return later.
17. Needs Clarification and Failed states.
18. Task Detail as follow-through hub.
19. Full My Tasks filters/sorting.
20. Multiple AI outputs and output history.
21. Checklist CRUD.
22. Reminder edit/cancel/snooze with local notification ID.
23. Paste reply flow.
24. Follow-up generation.
25. Parent/child split flow.
26. Deleting split parent does not delete child tasks.
27. Wrong-path feedback.
28. Safety/risk/deadline confidence UI.
29. Offline read-only.
30. Remote backend runtime is the default for real app usage.
31. Mock runtime is for SwiftUI previews and development fallback only.
32. Supabase Auth email/password is implemented through REST calls over URLSession.
33. Auth session restore/logout is implemented with Keychain-backed session storage.
34. Remote API calls use `AuthTokenProvider` for bearer token access.
35. Backend access-state drives app routing and gating.
36. Onboarding completion is synced to backend through `POST /complete-onboarding`.
37. Subscription access sync is implemented with StoreKit 2 plus backend mirror endpoints.
38. Shared Xcode scheme must stay value-free; concrete env values belong only in local unshared scheme(s).
39. iOS never calls OpenAI directly.
40. iOS must never contain Supabase `service_role` key.

---

## 25. Final Product Loop

```txt
Register
→ Complete onboarding
→ 3-day Starter Access
→ Send task
→ Backend creates task
→ Clarify if needed
→ Get precise result
→ Copy/send/set reminder/mark waiting
→ Track reply/follow-up
→ Starter ends
→ Start App Store trial to continue
→ Paid subscription
```

That loop is the product.

---

## 26. Current MVP Implementation Architecture

This section reflects the current implemented runtime, not a future plan.

### Runtime modes
- Remote runtime is the default for real app usage.
- Mock mode remains for SwiftUI previews and development fallback only.
- Access-state from backend is the source of truth for routing.

### Auth and session
- iOS uses Supabase Auth REST endpoints over `URLSession`.
- Email/password auth is implemented.
- Session persistence is implemented with Keychain-backed auth session storage.
- Session restore on app launch and logout are implemented.
- API services use `AuthTokenProvider` to attach bearer tokens.

### Remote services
- `complete-onboarding` is called after onboarding completion.
- Task analysis loop is connected (`analyze-task`, `answer-clarification`, `generate-reply`).
- Task actions and read APIs are connected (`update-task-status`, `message-marked-sent`, task list/detail/read endpoints).
- Reminder sync endpoints are connected (`reminder-create`, `reminder-update`, `reminder-cancel`, `reminder-snooze`, `get-reminders`).
- Subscription sync endpoints are connected (`validate-subscription`, `restore-purchases`).

### Subscription runtime
- StoreKit 2 purchase/restore access flow is implemented in iOS.
- Local StoreKit configuration exists for development testing.
- Backend mirror mode currently supports `ios_verified_mirror` flow for MVP/TestFlight scaffolding.

### Xcode configuration rules
- Shared scheme must not contain concrete runtime env values.
- Use a local unshared scheme for runtime values such as Supabase/Functions URLs and product ID.
- Keep placeholder defaults only in shared project config.

### Security boundaries
- iOS never calls OpenAI directly.
- iOS must never include Supabase `service_role` key.
- OpenAI keys live only in Supabase backend secrets.

### Still required before broader public release
- Production deep links and email confirmation behavior may require final production setup.
- Sign in with Apple may still be required before broader/public release.

### Deferred / v1.1
- Attachments/OCR are deferred (Coming soon).
- Full Apple Server API validation is deferred.
- App Store Server Notifications integration is deferred.
- No autonomous external actions are supported.
