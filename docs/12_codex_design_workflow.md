# OneDone Codex Design Workflow

This document defines how Codex should handle design-related tasks for OneDone and prepare Figma-ready outputs aligned with the current MVP.

## 1. Design task rules

### 1.1 Mandatory doc-read order
For every design task, read in this exact order before proposing or generating design output:
1. `docs/00_project_overview.md`
2. `docs/01_ios_app_spec_v6.md`
3. `docs/09_known_issues_and_deferred_scope.md`
4. `docs/10_design_system_and_figma_brief.md`
5. `docs/11_figma_screen_spec.md`

### 1.2 MVP guardrails
Design outputs must follow these hard constraints:
- No unsupported features.
- No attachments/OCR availability in MVP designs.
- No autonomous execution flows.
- No external account login/payment/sending actions.
- Limited mode must be represented correctly.
- Subscription gate must not include a “Not now” bypass after Starter expiry.

### 1.3 Product framing rules
- OneDone is a guided self-service assistant.
- OneDone is not a generic AI chatbot.
- OneDone is not an autonomous execution agent.
- Remote runtime is default for real app usage.
- Mock mode is for previews/development fallback only and must not drive production design assumptions.

### 1.4 Visual constraints
- No purple.
- Keep visual style calm, practical, warm, trustworthy.
- Prefer focused cards and clear hierarchy.
- Avoid generic AI chatbot/robot aesthetic.
- Avoid busy dashboard layouts and flashy AI-magic motifs.

### 1.5 Output quality rule
Prefer concrete screen/component/state specifications over vague aesthetic suggestions.

## 2. Figma handoff workflow

Use this sequence for every design initiative:

1. Create or update design brief
- Align intent with `docs/10_design_system_and_figma_brief.md`.
- Confirm scope is MVP-accurate and deferred items remain excluded.

2. Create or update screen spec
- Update `docs/11_figma_screen_spec.md`-style detail for affected screens.
- Include purpose, states, copy, component mappings, and flow links.

3. Generate or update Figma file
- Organize pages/components per established naming and structure.
- Build components first when multiple screens depend on them.

4. Review screenshot/export
- Validate hierarchy, readability, copy, and state coverage.
- Check MVP guardrails and deferred-scope boundaries.

5. Refine components and states
- Resolve inconsistencies in spacing, tokens, and variants.
- Ensure edge states and limited mode/gate behavior are complete.

## 3. Required output for design tasks

Every Codex design response should include this standard schema.

### 3.1 Screens affected
List exact screen names and variants.

### 3.2 Components affected
List components created/updated and variants changed.

### 3.3 States
List required states per affected screen (active/loading/empty/error/locked/offline/permission denied as relevant).

### 3.4 Copy
List key user-facing copy additions/changes.

### 3.5 Edge states
List non-happy-path states covered (rate limits, restore failures, offline, auth/session edge behavior, etc.).

### 3.6 Figma naming
List page/frame/component names using project naming conventions.

### 3.7 Implementation notes
List concise SwiftUI-oriented handoff notes (layout structure, state handling, interaction logic), without changing code.

## 4. Figma generation checklist

Before finalizing a design task, verify:
- [ ] Design tokens are applied consistently.
- [ ] Component library is created/updated with reusable variants.
- [ ] Core screens for the requested scope are complete.
- [ ] Edge states are included.
- [ ] Prototype flows are connected for key journeys.
- [ ] Limited mode and subscription gate states are represented correctly.
- [ ] No unsupported features are presented as available.
- [ ] No attachments/OCR availability is implied.
- [ ] No autonomous execution capability is implied.
- [ ] No secrets, URLs, API keys, or private values appear in design copy.

## 5. Review checklist

Run this review pass before handoff:
- [ ] Product accuracy matches current MVP behavior.
- [ ] UX is clear, practical, and action-oriented.
- [ ] Readability/accessibility basics are met.
- [ ] Limited mode constraints are correct.
- [ ] StoreKit/access-state and subscription gate behavior are correct.
- [ ] No dark patterns in gate/upgrade copy.
- [ ] No purple in visual direction.
- [ ] No mock-only assumptions presented as production runtime.
- [ ] No unsupported attachment/OCR/autonomous/integration promises.

## 6. Prompt templates

Use these templates for consistent design task execution.

### 6.1 Create a new screen
```txt
Task: Create a new OneDone MVP screen spec for [SCREEN_NAME].

Context:
- Follow docs/00_project_overview.md, docs/01_ios_app_spec_v6.md,
  docs/09_known_issues_and_deferred_scope.md,
  docs/10_design_system_and_figma_brief.md,
  docs/11_figma_screen_spec.md.

Requirements:
- Include purpose, entry conditions, layout sections, primary CTA, secondary actions.
- Include loading/empty/error/locked/offline/permission states where relevant.
- Include near-final copy.
- Include Figma component mapping and prototype links.
- Keep MVP guardrails (no attachments/OCR, no autonomous actions, no “Not now” bypass after Starter expiry).
- No purple.
```

### 6.2 Redesign an existing screen
```txt
Task: Redesign [EXISTING_SCREEN] in OneDone while preserving MVP behavior.

Focus:
- Improve clarity and hierarchy.
- Keep calm/practical/warm/trustworthy visual direction.
- Keep all existing required states and gate/limited behavior.

Output:
- Screens affected
- Components affected
- States
- Copy changes
- Edge states
- Figma naming
- Implementation notes
```

### 6.3 Generate a Figma file
```txt
Task: Generate/update a Figma-ready OneDone file for [SCOPE].

Use structure:
- 00 Cover
- 01 Product flows
- 02 Screens
- 03 Components
- 04 Design tokens
- 05 States and edge cases
- 06 Copy deck
- 07 Prototype notes

Must include:
- Tokens, reusable components, core screens, edge states, prototype links.
- Limited mode and subscription gate behavior.
- No unsupported features.
- No purple.
```

### 6.4 Review a Figma screenshot
```txt
Task: Review this OneDone Figma screenshot for MVP accuracy and handoff readiness.

Check:
- Product framing (guided self-service, not chatbot/autonomous).
- Visual direction (calm/practical/warm/trustworthy, no purple).
- Component consistency.
- Copy clarity and gate/limited correctness.
- Missing states or edge cases.

Output:
- Findings by severity
- Exact fixes to apply
- Updated state/component checklist
```

### 6.5 Convert Figma design into SwiftUI implementation notes
```txt
Task: Convert this OneDone Figma design into SwiftUI implementation notes.

Output format:
- Screens affected
- Components affected
- States and transitions
- Copy blocks
- Interaction behaviors
- Data/access-state assumptions
- Open questions

Constraints:
- Notes only, no code edits.
- Keep MVP guardrails and deferred scope boundaries.
```

## 7. Quick anti-patterns to reject

Reject or correct any design output that does the following:
- Treats OneDone as a free-form chatbot UI.
- Suggests autonomous cancellation/payment/sending workflows.
- Presents attachment upload/OCR as active MVP capability.
- Introduces a “Not now” bypass after Starter expiry.
- Uses purple or highly flashy AI-styled visuals.
- Omits limited mode or subscription gate state coverage.
