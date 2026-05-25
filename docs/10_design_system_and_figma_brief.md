# OneDone Design System and Figma Brief

This brief gives designers, Codex, and future contributors a practical, Figma-ready direction for organizing OneDone UI.

Scope alignment:
- OneDone is a guided self-service assistant, not a generic chatbot.
- OneDone is not an autonomous executor.
- Remote runtime is default for real app usage.
- Mock mode is only for previews/development fallback.
- Current implemented MVP flows are the primary design target.
- Deferred scope must stay clearly excluded from production-ready design.

## 1. Product design principles

- One small thing, done.
- Calm over flashy.
- Action over explanation.
- Guide, do not overwhelm.
- Human self-service, not autonomous execution.
- Clear locked/limited states without dark patterns.

Design implications:
- Every primary screen should answer: "What should I do next?"
- The main action on each screen should be obvious in under 3 seconds.
- AI should feel like a helpful assistant in the background, not the visual center of the product.

## 2. Brand personality

OneDone should feel:
- Helpful.
- Clear.
- Non-judgmental.
- Quietly confident.
- Practical.
- Friendly but adult.

Tone guardrails:
- No hype voice.
- No guilt language.
- No childish microcopy.
- No robotic/legal-heavy wording for normal user paths.

## 3. Visual direction

Core style:
- Light, warm, clean interface.
- Soft neutral backgrounds.
- Focused cards with subtle borders.
- Rounded corners.
- Clear and consistent primary CTA.

Critical constraints:
- No purple.
- Use accent color sparingly.
- Avoid neon.
- Avoid glassmorphism.
- Avoid heavy gradients.
- Avoid "AI magic" visual clichés.
- Avoid cold corporate dashboard density.

Readability and accessibility:
- High text contrast.
- Clear tap target spacing.
- Predictable hierarchy.
- State changes visible by more than color alone.

## 4. Suggested design tokens

Use token names as placeholders; final brand values can be finalized later.

Color tokens:
- `color.background`
- `color.surface`
- `color.surfaceMuted`
- `color.textPrimary`
- `color.textSecondary`
- `color.border`
- `color.accent`
- `color.accentMuted`
- `color.success`
- `color.warning`
- `color.danger`
- `color.locked`

Spacing scale:
- `space.4`
- `space.8`
- `space.12`
- `space.16`
- `space.20`
- `space.24`
- `space.32`

Radius scale:
- `radius.8`
- `radius.12`
- `radius.16`
- `radius.20`

Typography scale:
- `type.display`
- `type.title1`
- `type.title2`
- `type.body`
- `type.bodySmall`
- `type.caption`
- `type.button`

Token usage rules:
- Keep state colors semantic (success/warning/danger/locked).
- Do not use accent as a background replacement.
- Keep border and muted surface contrast subtle but visible.

## 5. Typography guidance

- Use large, clear screen titles.
- Keep body copy plain and direct.
- Avoid long dense paragraphs in UI surfaces.
- Use compact helper text near inputs and actions.
- CTA labels should be action-oriented.

Examples:
- Good CTA: "Send task"
- Good CTA: "Start 14-day trial"
- Good helper: "Paste a message, bill, or describe the task"

## 6. Iconography guidance

- Use simple line icons.
- Use scenario-based icons for templates (refund, bill, reply, reminder, etc.).
- Avoid robot/AI cliché icons as primary brand identity.
- Use status icons sparingly and consistently.

Icon rules:
- Keep stroke/size consistent.
- Avoid decorative icon overload in task-heavy views.
- Prefer clarity over novelty.

## 7. Component inventory for Figma

Create reusable components for:
- App header
- Access indicator pill
- Main input card
- Quick action card
- Template card
- Primary button
- Secondary button
- Text field / text area
- Loading state
- Error banner
- Empty state
- Task card
- Status badge
- Checklist item
- Timeline event row
- Reminder row
- Draft reply card
- Subscription gate
- Access status card
- Settings row
- Terms/privacy link row

Component variant guidance:
- Buttons: default, pressed, disabled, loading.
- Status badge: starter/trial/active/locked/waiting states.
- Task card: default, overdue, waiting-for-reply, completed.
- Error banner: inline form error vs page-level recoverable error.

## 8. Screen inventory for Figma

Design these screens/states:
- Auth
- Onboarding
- Starter Access Intro
- Home / active
- Home / limited
- Access screen
- Subscription Gate
- Templates
- New Task
- New Task loading
- Clarification
- Task Result
- My Tasks empty
- My Tasks populated
- My Tasks filters
- Task Detail
- Draft Reply
- Reminder create/edit
- Settings
- Error/offline states

MVP alignment notes:
- Include limited mode and subscription gate views explicitly.
- Do not include production-ready attachment upload flows.

## 9. User flows to prototype in Figma

Prototype these end-to-end flows:
- New user onboarding to first task.
- Task requiring clarification.
- Draft reply and mark sent.
- Reminder creation.
- Starter expired to subscription gate.
- Restore purchases.
- Limited mode viewing existing task.
- Error/rate limit state.

Flow behavior emphasis:
- Guide the user to one next action at each step.
- Keep AI orchestration implicit; keep user-facing copy practical.

## 10. Figma file structure

Recommended page structure:
- `00 Cover`
- `01 Product flows`
- `02 Screens`
- `03 Components`
- `04 Design tokens`
- `05 States and edge cases`
- `06 Copy deck`
- `07 Prototype notes`

Usage model:
- Keep finalized components in one page (`03 Components`) and instance them into screens.
- Keep edge-state references centralized (`05 States and edge cases`).

## 11. Figma naming conventions

Use consistent naming patterns.

Screen examples:
- `Screen/Auth/Default`
- `Screen/Home/StarterActive`
- `Screen/Home/Limited`
- `Screen/SubscriptionGate/StarterExpired`

Component examples:
- `Component/Button/Primary`
- `Component/TaskCard/Default`
- `Component/StatusBadge/WaitingForReply`
- `Component/Input/TextArea`

Flow examples:
- `Flow/NewUser/OnboardingToFirstTask`
- `Flow/Task/ClarificationToResult`
- `Flow/Access/StarterExpiredToSubscription`

Naming rules:
- Use title case segments.
- Keep status/state in final segment.
- Avoid vague names like `Card1` or `FinalFinal`.

## 12. Copy guidance

Copy principles:
- Use clear user-facing language.
- Avoid technical backend terms.
- Avoid overusing "AI analyzed your request" phrasing.

Prefer copy such as:
- "Here’s the next step"
- "I need one detail"
- "Your Starter Access has ended"
- "You can still view your saved tasks"

Subscription and gate copy:
- Keep aligned with approved product wording in MVP docs.
- Avoid manipulative urgency or dark pattern language.

Copy exclusions:
- Shared scheme/env/secrets are implementation concerns and should not appear in Figma copy.
- Avoid exposing API terms (`access_state`, endpoint names) in user-visible text.

## 13. State coverage

For each important screen, cover these states where relevant:
- loading
- empty
- error
- active
- limited/locked
- offline
- permission denied

High-priority state coverage matrix:
- Home: active, limited, loading, error, offline.
- My Tasks: populated, empty, loading, error, offline.
- Task Detail: loading, content, limited constraints, error.
- Draft Reply: generating, success, retryable error, locked.
- Reminder flows: permission denied, scheduled, sync failure, success.
- Subscription gate: starter expired, restore success, validation error.

## 14. Figma handoff checklist

- [ ] All main screens designed.
- [ ] Components extracted and reused.
- [ ] Text styles defined.
- [ ] Color styles defined.
- [ ] Spacing/radius rules documented.
- [ ] Main prototype flows connected.
- [ ] Edge states included.
- [ ] No purple in UI direction.
- [ ] No unsupported attachment/OCR promises.
- [ ] Subscription gate copy matches product spec.
- [ ] Limited mode behavior represented correctly.

## 15. What not to design as production-ready yet

Do not present these as production-ready in current MVP handoff:
- Attachment upload/OCR flows.
- Autonomous cancellation/execution flows.
- In-app email sending as automated execution.
- External account login/connect flows.
- Full App Store subscription management UI beyond current MVP gate/restore scope.
- Advanced admin/support tooling UI.

Deferred scope reminder:
- Attachments/OCR are deferred.
- Autonomous actions are deferred.
- External integrations are deferred.

MVP implementation reminder for design reviews:
- Current design target flows are auth, access routing, task input, clarification, task result/detail, draft reply, reminders, and subscription gate/restore.
