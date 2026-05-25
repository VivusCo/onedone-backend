# OneDone Figma Screen Specification (MVP)

This specification is a Figma-ready build guide for the current OneDone MVP.

Scope guardrails:
- OneDone is a guided self-service assistant, not a generic chatbot.
- OneDone is not an autonomous execution agent.
- Remote runtime is default for real app usage.
- Mock mode is for previews/development fallback only.
- Attachments/OCR/PDF are deferred and must not be presented as available.
- Autonomous execution and external-account automations are deferred and must not be presented as available.
- Limited mode and subscription gate states are mandatory parts of the MVP UX.

## 1. Figma page structure

| Page | Purpose | Required content |
|---|---|---|
| `00 Cover` | File identity and usage notes | File summary, owner, last update, MVP scope note |
| `01 Product flows` | Journey overview | Flow maps for onboarding, task creation, clarification, subscription gate |
| `02 Screens` | Screen designs | Final screen frames for all MVP screens in this spec |
| `03 Components` | Reusable system | Component set, variants, interaction states |
| `04 Design tokens` | Visual primitives | Color, type, spacing, radius tokens and usage notes |
| `05 States and edge cases` | Non-happy paths | Loading, empty, error, offline, locked, permission denied states |
| `06 Copy deck` | Approved UX copy | Near-final strings, state-specific copy, gate/limited copy |
| `07 Prototype notes` | Click-through behavior | Entry points, branch logic, transitions, QA notes |

## 2. Component list

Core components to build in `03 Components`:

| Component | Variants | Notes |
|---|---|---|
| App Header | Default, with back button, with trailing icon | Used across main screens |
| Access Indicator Pill | Starter, Trial, Active, Billing Issue, Expired | Maps to backend access-state outcomes |
| Main Input Card | Active, Disabled/Locked | Home entry point for new task |
| Quick Action Card | Default, Pressed, Disabled | Scenario-first actions |
| Template Card | Default, Locked Preview | Locked state in limited mode |
| Button / Primary | Default, Pressed, Disabled, Loading | Primary CTA on each screen |
| Button / Secondary | Default, Pressed, Disabled | Secondary action hierarchy |
| Text Field | Default, Focused, Error, Disabled | Single-line inputs |
| Text Area | Default, Focused, Error, Disabled | New Task long-form input |
| Status Badge | New, In Progress, Needs Clarification, Waiting, Follow-up Needed, Done | Task status representation |
| Task Card | Default, Overdue, Waiting, Done | My Tasks list |
| Checklist Item | Unchecked, Checked, Disabled | Task detail checklist |
| Timeline Event Row | Default, Alert, Success | Task history stream |
| Reminder Row | Scheduled, Snoozed, Canceled, Error | Reminder management |
| Draft Reply Card | Generated, Regenerating, Locked | Reply content block |
| Subscription Gate Card | Starter Expired, Trial Not Started, Trial Expired, Subscription Expired | Gate states |
| Access Status Card | Starter Active, Trial Active, Subscription Active, Limited | Access explanation |
| Error Banner | Retryable, Access-Locked, Generic | Inline page/system errors |
| Empty State Block | Tasks Empty, Reminders Empty, Done Empty | Reusable empty UI |
| Settings Row | Default, Destructive, Link | Settings screen list rows |
| Terms/Privacy Link Row | Terms, Privacy | Legal links |

## 3. Design token table

Use token names in Figma styles. Final brand values can be applied later.

| Category | Token | Intended usage | Notes |
|---|---|---|---|
| Color | `color.background` | App background | Light, warm neutral |
| Color | `color.surface` | Cards and elevated sections | Subtle contrast from background |
| Color | `color.surfaceMuted` | Secondary grouped containers | Calm separation |
| Color | `color.textPrimary` | Main text | High readability |
| Color | `color.textSecondary` | Supporting text | Lower emphasis, still readable |
| Color | `color.border` | Dividers, card borders | Soft visible borders |
| Color | `color.accent` | Primary CTA/focus highlights | Use sparingly, no purple |
| Color | `color.accentMuted` | Accent tints, subtle highlights | For pills/helper surfaces |
| Color | `color.success` | Positive states | Done/success feedback |
| Color | `color.warning` | Attention states | Billing/risk notices |
| Color | `color.danger` | Destructive actions/errors | Delete/error paths |
| Color | `color.locked` | Locked/limited UI state | Disabled creation/generation |
| Spacing | `space.4` / `8` / `12` / `16` / `20` / `24` / `32` | Internal spacing scale | Keep consistent vertical rhythm |
| Radius | `radius.8` / `12` / `16` / `20` | Component rounding | Cards/buttons/pills |
| Type | `type.display` | Large hero headline | Starter intro, major gates |
| Type | `type.title1` | Screen title | Page-level headers |
| Type | `type.title2` | Section title | Card sections |
| Type | `type.body` | Primary body copy | Main content |
| Type | `type.bodySmall` | Helper/support text | Subcopy and hints |
| Type | `type.caption` | Metadata labels | Dates/status notes |
| Type | `type.button` | Button labels | Action text |

Token constraints:
- No purple in palette direction.
- Keep gradients subtle-to-none; avoid glassmorphism styling.
- Prioritize readability and calm visual hierarchy.

## 4. Screen-by-screen layout specs

### 4.1 Auth

**Purpose**
- Authenticate user with email/password and start backend access-state routing.

**Entry conditions**
- User is unauthenticated.
- Session restore failed or user logged out.

**Main layout sections**
- App mark + short product statement.
- Email field.
- Password field.
- Primary auth action block.
- Secondary switch between Sign up and Log in.
- Inline error/info zone.

**Primary CTA**
- `Continue`

**Secondary actions**
- `I already have an account`
- `Create new account`

**States**
- Loading: button spinner during auth request.
- Error: invalid credentials, retryable network error.
- Locked: none.
- Offline: show retry copy and disable submit until reconnect.

**Exact/near-final copy**
- Title: `Welcome to OneDone`
- Subtitle: `Handle one admin task at a time with clear next steps.`
- Field labels: `Email`, `Password`
- Error example: `Email or password is incorrect.`
- Offline helper: `You appear to be offline. Connect and try again.`

**Figma component notes**
- Use `Text Field`, `Button / Primary`, `Error Banner`.
- Keep layout simple and non-chat-like.

**Prototype linking notes**
- Success -> Access-state router decision node.
- Failure -> stay on Auth with inline error state.

---

### 4.2 Onboarding

**Purpose**
- Set expectations and prepare for Starter Access activation.

**Entry conditions**
- Access-state is `onboarding_required`.

**Main layout sections**
- Step progress indicator.
- 2-3 concise onboarding cards.
- Final confirmation action.

**Primary CTA**
- `Finish setup`

**Secondary actions**
- `Back` (within onboarding flow)

**States**
- Loading: final submit to backend.
- Error: onboarding completion failed, retry.
- Locked: none.

**Exact/near-final copy**
- Title: `Let’s set up OneDone`
- Body: `You’ll get clear next steps, draft replies, and reminders for real tasks.`
- Final helper: `After setup, your first 3 days are open.`

**Figma component notes**
- Use card-based onboarding steps, minimal illustrations.
- Avoid magical/AI-heavy visual language.

**Prototype linking notes**
- Final CTA -> call `complete-onboarding` state transition -> Starter Access Intro.

---

### 4.3 Starter Access Intro

**Purpose**
- Confirm Starter Access and guide first real usage.

**Entry conditions**
- User just completed onboarding.
- Access-state becomes `starter_active`.

**Main layout sections**
- Headline block.
- Short explanation block.
- Single action button.

**Primary CTA**
- `Start using OneDone`

**Secondary actions**
- None

**States**
- Active default only.

**Exact/near-final copy**
- Headline: `Your first 3 days are open.`
- Subtext: `Try OneDone with real tasks. After 3 days, start your 14-day App Store trial to keep going.`

**Figma component notes**
- Use large clean typography and one focused CTA.
- No purchase sheet implied at this stage.

**Prototype linking notes**
- CTA -> Home Active.

---

### 4.4 Home / Active

**Purpose**
- Main launch point for creating tasks and seeing access/reminder context.

**Entry conditions**
- Access-state in active/open group (`starter_active`, `trial_active`, `subscription_active`, etc.).

**Main layout sections**
- Header (greeting, access indicator, notifications).
- Main input card (task text entry entrypoint).
- Quick actions row/grid.
- Optional template shortcut section.
- Disabled attachment entry point (`Coming soon`) if shown.

**Primary CTA**
- `Send task`

**Secondary actions**
- Quick actions (`Cancel a subscription`, `Request a refund`, etc.)
- Open Access screen by tapping access indicator.

**States**
- Loading: access refresh or home data refresh skeleton.
- Error: retryable load issue.
- Offline: view-only notice.
- Locked: not applicable on active home.

**Exact/near-final copy**
- Input placeholder: `What do you need to deal with?`
- Helper: `Paste a message, bill, document text, or describe the task.`
- Attachment label: `Coming soon`

**Figma component notes**
- Use `Main Input Card`, `Quick Action Card`, `Access Indicator Pill`.
- Keep hierarchy action-first; avoid dashboard density.

**Prototype linking notes**
- Send task -> New Task Loading.
- Quick action -> New Task with hidden template context.
- Access indicator -> Access screen.

---

### 4.5 Home / Limited

**Purpose**
- Explain locked creation/generation while preserving access to existing task history.

**Entry conditions**
- Access-state in limited/expired/billing-issue group.

**Main layout sections**
- Header with limited access indicator.
- Limited mode explanation card.
- Subscription gate CTA area.
- Existing task shortcuts (read/view only paths).

**Primary CTA**
- `Start 14-day trial` (or `Subscribe` depending state)

**Secondary actions**
- `Restore Purchases`
- Open My Tasks for existing tasks.

**States**
- Loading: access refresh.
- Locked: input/actions visibly disabled.
- Error: restore/purchase sync errors.
- Offline: existing cached task viewing only.

**Exact/near-final copy**
- Headline: `Your Starter Access has ended`
- Helper: `You can still view your saved tasks.`
- Locked note: `New task creation and new generation are locked in this state.`

**Figma component notes**
- Reuse active home layout skeleton with explicit locked overlays.
- Make disabled controls obvious without punitive tone.

**Prototype linking notes**
- Primary CTA -> Subscription Gate.
- My Tasks tap -> My Tasks (view existing).

---

### 4.6 Subscription Gate

**Purpose**
- Convert expired/locked users to trial/subscription path and support restore flow.

**Entry conditions**
- `starter_expired`, `trial_not_started`, `trial_expired`, `subscription_expired`, or relevant locked states.

**Main layout sections**
- Gate headline/subtext.
- Primary purchase CTA.
- Restore purchases action.
- Legal links.

**Primary CTA**
- `Start 14-day trial`

**Secondary actions**
- `Restore Purchases`
- `Terms of Use`
- `Privacy Policy`

**States**
- Purchase loading.
- Purchase canceled/pending/unverified.
- Validation error (`validate-subscription` failed).
- Restore loading/success/error.
- Rate-limited/retryable backend errors.

**Exact/near-final copy**
- Headline: `Keep using OneDone.`
- Subtext: `Your Starter Access has ended. Start your 14-day App Store trial to keep using task breakdowns, replies, reminders, and follow-ups.`
- Note: `No “Not now” for continued real usage after Starter expiry.`

**Figma component notes**
- Create clear state variants for purchase/restore outcomes.
- Keep legal links visible but secondary.

**Prototype linking notes**
- Purchase success -> Access refresh -> Home Active.
- Restore success -> Access refresh -> Home Active.
- Failure states -> remain in gate with actionable retry.

---

### 4.7 Access Screen

**Purpose**
- Explain current access state, remaining days, and available subscription actions.

**Entry conditions**
- User taps Access indicator from Home/Settings.

**Main layout sections**
- Access status card.
- Days/status detail rows.
- Subscription action area.
- Terms/privacy links.

**Primary CTA**
- `Start App Store trial now` (when applicable)

**Secondary actions**
- `Restore Purchases`
- `Manage subscription` (if available)

**States**
- Active state presentation.
- Limited/expired state presentation.
- Loading/error while refreshing access data.

**Exact/near-final copy**
- Title: `Access`
- Example status labels: `Starter: 3 days left`, `Trial: 12 days left`, `Active`, `Billing issue`.

**Figma component notes**
- Reuse `Access Status Card`, `Settings Row`, and link row components.

**Prototype linking notes**
- Trial start path -> Subscription Gate flow.
- Restore -> restore flow result overlays.

---

### 4.8 Templates

**Purpose**
- Offer scenario-based templates that prefill New Task intent.

**Entry conditions**
- User selects Templates tab.

**Main layout sections**
- Template card list/grid.
- Template detail preview panel/sheet on tap.

**Primary CTA**
- `Use template`

**Secondary actions**
- Back to list.

**States**
- Active: template action opens New Task.
- Limited/locked: template visible but action routes to Subscription Gate.
- Loading/error states if template data fetch is remote-backed.

**Exact/near-final copy**
- Template categories should remain scenario-first, not AI-function-first.
- For document explanation template: `Paste the document text you want to understand.`

**Figma component notes**
- Use `Template Card` with locked preview variant.
- Keep copy short and practical.

**Prototype linking notes**
- Active -> New Task with hidden selected template.
- Limited -> Subscription Gate.

---

### 4.9 New Task

**Purpose**
- Capture task input and submit for backend analysis.

**Entry conditions**
- User taps Home input or template action.

**Main layout sections**
- Screen title and helper text.
- Task text area.
- Optional deadline control.
- Submit button.

**Primary CTA**
- `Send task`

**Secondary actions**
- Cancel/back.

**States**
- Input validation error.
- Locked (if limited mode and direct navigation occurs).
- Offline blocked submit.

**Exact/near-final copy**
- Title: `New task`
- Helper: `Describe the task clearly. OneDone will suggest the next step.`

**Figma component notes**
- Reuse `Text Area`, `Button / Primary`, helper text styles.

**Prototype linking notes**
- Submit -> New Task Loading.
- Validation failure -> inline error.

---

### 4.10 New Task Loading

**Purpose**
- Represent processing state while `analyze-task` is in progress.

**Entry conditions**
- User submits New Task successfully.

**Main layout sections**
- Loading indicator.
- Context text about processing.

**Primary CTA**
- None (optionally `Back to Home` only if supported behavior says request continues)

**Secondary actions**
- Dismiss/back with note that request continues.

**States**
- Standard loading.
- Retryable failure.
- Access-locked/paywall error.
- Rate-limited state.

**Exact/near-final copy**
- Loading text: `Analyzing your task...`
- Retryable error: `Could not analyze this task right now. Please try again.`
- Rate limit: `Too many requests right now. Please try again in a moment.`

**Figma component notes**
- Include explicit failure state frames, not just spinner frame.

**Prototype linking notes**
- Success branches -> Clarification or Task Result.
- Failure branches -> Retry action or Subscription Gate (access error).

---

### 4.11 Clarification

**Purpose**
- Collect required missing detail when backend returns clarification response.

**Entry conditions**
- `analyze-task` or follow-up clarification response requires user input.

**Main layout sections**
- Header.
- Helper text.
- Clarification question.
- Options/input.
- Primary/secondary actions.

**Primary CTA**
- `Continue`

**Secondary actions**
- `Skip for now`

**States**
- Loading while submitting answer.
- Error/retryable failure.
- Rate-limited state.
- Skip state returns task to list as `needs_clarification`.

**Exact/near-final copy**
- Header: `Let’s clarify this`
- Helper: `To give the right steps, I need one detail.`

**Figma component notes**
- Include option-button and free-text variants for different clarification shapes.

**Prototype linking notes**
- Continue success -> Task Result.
- Skip -> My Tasks with needs clarification emphasis.

---

### 4.12 Task Result

**Purpose**
- Present first actionable result from backend analysis.

**Entry conditions**
- Analysis complete, clarification complete, or existing task open.

**Main layout sections**
- Result summary card.
- Current next step.
- Checklist preview.
- Action shortcuts (open detail, draft reply, reminder).

**Primary CTA**
- `Open task details`

**Secondary actions**
- `Draft reply` (if relevant)
- `Set reminder` (if relevant)
- `Not helpful / Wrong path`

**States**
- Loading (if result body still fetching).
- Retryable error.
- Locked generation/regenerate actions in limited mode.

**Exact/near-final copy**
- Section title example: `Here’s the next step`
- Feedback entry: `Not helpful / Wrong path`

**Figma component notes**
- Reuse `Checklist Item`, `Status Badge`, action rows.

**Prototype linking notes**
- Open details -> Task Detail.
- Draft reply -> Draft Reply.
- Reminder -> Reminder Create/Edit.

---

### 4.13 My Tasks / Empty

**Purpose**
- Explain no-task state and point user to first action.

**Entry conditions**
- User has zero tasks in current filter scope.

**Main layout sections**
- Empty illustration/icon.
- Empty headline/subtext.
- CTA to Home/New Task.

**Primary CTA**
- `Create your first task`

**Secondary actions**
- Switch filters.

**States**
- Empty default.
- Filter-specific empties.

**Exact/near-final copy**
- `Nothing to handle yet. Send one task, message, or bill and OneDone will show the next step.`
- `No reminders yet. OneDone will suggest them when a task has a deadline or follow-up.`
- `Completed tasks will appear here.`

**Figma component notes**
- Use `Empty State Block` variants by filter context.

**Prototype linking notes**
- CTA -> Home Active or New Task.

---

### 4.14 My Tasks / Populated

**Purpose**
- Show active follow-through workload with clear prioritization.

**Entry conditions**
- User has tasks.

**Main layout sections**
- Filter tabs/chips.
- Sorted task list.
- Task cards with status/date/next-step preview.

**Primary CTA**
- `Open task`

**Secondary actions**
- Filter selection.
- Quick status updates if enabled in design.

**States**
- Loading list.
- Error with retry.
- Offline cached list view.
- Limited mode (view + allowed follow-through actions only).

**Exact/near-final copy**
- Title: `My Tasks`
- Section support text (optional): `Track follow-through, not just to-dos.`

**Figma component notes**
- Use `Task Card` with status badge/date/event variations.

**Prototype linking notes**
- Card tap -> Task Detail.

---

### 4.15 My Tasks / Filters

**Purpose**
- Let users focus on task subsets relevant to follow-through.

**Entry conditions**
- User on My Tasks.

**Main layout sections**
- Horizontal chip row or filter drawer.

**Primary CTA**
- `Apply` (if using modal filter sheet)

**Secondary actions**
- `Clear filters`

**States**
- Default, selected, no-results.

**Exact/near-final copy**
- Filter labels:
  - `All`
  - `Needs Clarification`
  - `Follow-up Needed`
  - `Due Soon`
  - `Waiting for Reply`
  - `In Progress`
  - `Done`

**Figma component notes**
- Build as reusable chip component set.

**Prototype linking notes**
- Filter selection -> corresponding list state frame.

---

### 4.16 Task Detail

**Purpose**
- Main follow-through hub for task execution and updates.

**Entry conditions**
- User opens task from result/list/reminder.

**Main layout sections**
- Header and status controls.
- Current next step.
- Timeline/history.
- Checklist.
- Outputs/reply block.
- Reminder section.
- Notes/more actions.

**Primary CTA**
- Contextual: `Update status` or `Draft reply` depending section focus.

**Secondary actions**
- Reminder actions (`create/edit/cancel/snooze`).
- `Report wrong path`.

**States**
- Loading detail sections.
- Error/retry on section fetch.
- Limited mode with locked generation paths.
- Offline read-only state.

**Exact/near-final copy**
- Reminder prompt on done action: `Cancel active reminders for this task?`
- Options: `Cancel reminders` / `Keep reminders`

**Figma component notes**
- Screen should scroll cleanly; avoid dense dashboard feel.
- Keep one strong focus action visible at a time.

**Prototype linking notes**
- Draft reply entry -> Draft Reply.
- Reminder actions -> Reminder Create/Edit.
- Mark sent path -> post-send state + follow-up prompt.

---

### 4.17 Draft Reply

**Purpose**
- Let user generate, review, copy, and confirm send state for reply text.

**Entry conditions**
- User chooses draft reply from result/detail.

**Main layout sections**
- Reply content card.
- Tone/language controls.
- Copy/send confirmation controls.

**Primary CTA**
- `Copy reply`

**Secondary actions**
- `Regenerate` (when allowed)
- `Yes, I sent it`
- `Not yet`
- `Remind me later`

**States**
- Generating/loading.
- Retryable generation error.
- Rate-limited generation error.
- Locked regenerate state in expired/limited access.

**Exact/near-final copy**
- Prompt after copy: `Did you send it?`
- Buttons: `Yes, I sent it`, `Not yet`, `Remind me later`

**Figma component notes**
- Use `Draft Reply Card` with locked and loading variants.

**Prototype linking notes**
- `Yes, I sent it` -> status update path -> waiting/follow-up state.

---

### 4.18 Reminder Create/Edit

**Purpose**
- Create and manage follow-up/deadline reminders with local notification + backend sync model.

**Entry conditions**
- User taps reminder action from result/detail.

**Main layout sections**
- Date/time picker.
- Reminder context note.
- Save/cancel actions.

**Primary CTA**
- `Save reminder`

**Secondary actions**
- `Cancel reminder`
- `Snooze`

**States**
- Permission prompt/denied.
- Local scheduling success/failure.
- Sync loading/success/error.

**Exact/near-final copy**
- Permission denied helper: `Notifications are off. Enable notifications to use reminders.`
- Follow-up prompt entry: `Did they reply?`

**Figma component notes**
- Include explicit permission-denied frame.

**Prototype linking notes**
- Save success -> return to Task Detail with updated reminder row.

---

### 4.19 Settings

**Purpose**
- Account, access/subscription, preferences, and privacy/support actions.

**Entry conditions**
- User opens Settings tab.

**Main layout sections**
- Account section.
- Access/Subscription section.
- Preferences section.
- Privacy section.
- Help/Support section.

**Primary CTA**
- Contextual by row (for example `Restore Purchases` or `Sign out`).

**Secondary actions**
- Terms/Privacy links.

**States**
- Loading profile/access values.
- Error while loading account/access.
- Limited mode still fully reachable.

**Exact/near-final copy**
- Section labels: `Account`, `Access / Subscription`, `Preferences`, `Privacy`, `Help`
- Access rows include starter/trial/subscription status text.

**Figma component notes**
- Reuse `Settings Row` and `Terms/Privacy Link Row`.

**Prototype linking notes**
- Access rows -> Access screen.
- Restore purchases -> Subscription Gate restore path.

---

### 4.20 Offline and Error States (Global)

**Purpose**
- Define consistent non-happy path UX across screens.

**Entry conditions**
- Network loss, backend errors, auth expiry, rate limits, or endpoint issues.

**Main layout sections**
- State-specific message block.
- Retry action where allowed.
- Safe fallback action.

**Primary CTA**
- `Try again`

**Secondary actions**
- `Back to Home`
- `View saved tasks` (offline scenarios)

**States**
- Offline read-only mode.
- Retryable service failure.
- Rate-limited errors.
- Access-locked/paywall errors.
- Session expired/auth-required state.

**Exact/near-final copy**
- Offline message: `You’re offline. You can view saved tasks, but changes require internet.`
- Rate limit message: `Too many requests right now. Please try again in a moment.`
- Generic retryable: `Something went wrong. Please try again.`

**Figma component notes**
- Build one reusable error/empty/state container pattern.

**Prototype linking notes**
- Retry -> prior action state.
- Session expired -> Auth screen.

## 5. Prototype flow map

Required clickable prototype flows:

1. New user onboarding to first task
- Auth -> Onboarding -> Starter Access Intro -> Home Active -> New Task -> Loading -> Result -> Task Detail.

2. Clarification path
- New Task -> Loading -> Clarification -> Continue -> Task Result -> Task Detail.

3. Draft reply + sent state
- Task Detail -> Draft Reply -> Copy -> `Did you send it?` -> `Yes, I sent it` -> waiting/follow-up state.

4. Reminder creation
- Task Detail -> Reminder Create/Edit -> permission path -> save -> Task Detail updated.

5. Starter expired gate
- Home Limited -> Subscription Gate -> Purchase state -> Access refresh -> Home Active.

6. Restore purchases
- Subscription Gate -> Restore Purchases -> restore result -> Access refresh.

7. Limited mode browse
- Home Limited -> My Tasks Populated -> Task Detail (read + allowed follow-through only).

8. Error and rate limit path
- New Task Loading -> rate-limited/retryable state -> retry branch.

## 6. Edge cases

Must-have Figma edge frames:
- No “Not now” bypass after Starter expiry.
- Existing tasks/details still viewable in limited mode.
- Creation/generation controls locked in limited states.
- Notification permission denied for reminders.
- StoreKit purchase canceled/pending/unverified states.
- Restore purchases returns no entitlements.
- `rate_limited` and generic retryable backend errors.
- Offline read-only behavior with cached task access.
- Session expired -> auth-required reroute.
- Template tap in limited mode -> subscription gate.

Explicit exclusions from edge-case design:
- Attachment upload/OCR success flows.
- Autonomous external execution flows.
- External integration orchestration screens.

## 7. Handoff checklist

Design system and structure:
- [ ] Figma pages follow the defined page structure.
- [ ] All required components are created with variants.
- [ ] Design token styles are defined and applied.
- [ ] No purple in palette direction.

Screen coverage:
- [ ] All listed MVP screens are designed.
- [ ] Each screen includes loading/empty/error/locked states where relevant.
- [ ] Limited mode and subscription gate are fully represented.
- [ ] Offline and permission-denied states are included.

Copy and scope alignment:
- [ ] Copy reflects guided self-service positioning, not chatbot framing.
- [ ] Copy avoids autonomous execution promises.
- [ ] Copy does not expose backend/engineering terms.
- [ ] Shared scheme/env/secrets do not appear in user-facing copy.
- [ ] No attachment/OCR availability promises.

Prototype quality:
- [ ] Required flow map is clickable end-to-end.
- [ ] Error and recovery loops are linked.
- [ ] StoreKit purchase and restore branches are represented.
- [ ] Rate-limit and retryable error branches are represented.
