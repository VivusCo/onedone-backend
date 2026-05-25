# OneDone Known Issues, Limitations, and Deferred Scope

## 1. Purpose

This document separates:
- implemented MVP scope,
- production hardening work that is still required,
- intentionally deferred scope,
- release blockers vs non-blockers.

Use this as a practical boundary reference for planning, implementation prompts, and release decisions.

## 2. Implemented MVP but needs hardening before production

These areas exist in MVP but are not yet complete production-grade solutions.

Subscription scaffold and validation maturity:
- StoreKit local/TestFlight scaffold works for MVP testing.
- `ios_verified_mirror` is an MVP/TestFlight scaffold, not full production subscription validation.
- Local StoreKit flow proves app/backend wiring, but not full Apple production validation guarantees.
- Real TestFlight/App Store subscription behavior still depends on App Store Connect product setup and production operations.

Auth and account entry hardening:
- Email/password auth is implemented and used in MVP.
- Production email confirmation behavior, redirects, and deep-link handling still need final hardening decisions/setup.
- Sign in with Apple is not currently implemented and may be required before broader/public release depending on release policy.

Operational hardening:
- Monitoring and alerting exist only at MVP level and need production-grade coverage.
- Error observability is functional but still needs production-oriented dashboards, thresholds, and response playbooks.
- Rate limits are implemented but may require tuning based on real traffic and support load.
- Support/admin operational tooling is minimal and should be expanded before large-scale public rollout.

## 3. Deferred product features

Deferred or not fully connected in the current MVP runtime:
- Attachments.
- OCR and PDF upload processing.
- Incoming reply processing flow in end-user runtime path (not in current connected MVP API surface).
- Generate follow-up flow in current connected MVP API surface.
- Advanced template system beyond current MVP set.
- Multi-task split confirmation flow in current connected MVP API surface.
- Autonomous external actions.
- Integrations with external email/calendar/messaging systems.

## 4. Deferred iOS/platform items

Platform items outside current MVP completion:
- Sign in with Apple implementation if required for public release policy.
- Final App Store Connect subscription product setup for real TestFlight/App Store subscription testing.
- Expanded TestFlight sandbox validation across broader account/device scenarios.
- Push notification production setup (if needed for roadmap; MVP currently relies on local notifications).
- Production deep links and universal links setup/polish.
- Accessibility polish beyond current MVP baseline.
- Offline/cache behavior polish beyond current MVP read-oriented behavior.

## 5. Deferred backend/security items

Backend/security work not completed for public-grade subscription infrastructure and operations:
- Full Apple Server API validation.
- App Store Server Notifications pipeline.
- Production subscription reconciliation workflows.
- Expanded audit logging strategy where required by operations/compliance.
- Admin/support tooling for account and subscription incident handling.
- Advanced analytics and operational insights.
- Formal data retention policy finalization.
- Backup/restore policy documentation and validation.
- Full security review and production hardening pass.

## 6. Known technical caveats

Current caveats developers and reviewers must keep in mind:
- Local StoreKit transaction conflicts can occur across multiple test accounts.
- Shared Xcode scheme must remain value-free.
- Concrete runtime env values belong only in local unshared schemes.
- Mock mode is for previews/development fallback and is not production runtime.
- `usage_events` must not store raw user content.
- `ios_verified_mirror` should be treated as MVP/TestFlight scaffolding, not final subscription trust architecture.
- After updating source docs in `onedone-docs`, synced doc copies in `onedone-ios/docs` and `onedone-backend/docs` should be updated.

## 7. Release blockers vs non-blockers

| Item | Status | Blocks internal MVP? | Blocks TestFlight? | Blocks public App Store? | Notes |
|---|---|---|---|---|---|
| Core remote MVP runtime (auth, access-state, AI loop, task reads/actions, reminders) | Implemented | No | No | No | Baseline MVP functionality is running end-to-end. |
| StoreKit local testing with `OneDone.storekit` | Implemented scaffold | No | No | Yes | Development-only test mechanism; not real production validation. |
| `ios_verified_mirror` subscription flow | Implemented scaffold | No | No | Yes | Useful for MVP/TestFlight, but not full production subscription trust model. |
| Full Apple Server API validation | Deferred | No | No | Yes | Required for production-grade server-side subscription validation confidence. |
| App Store Server Notifications | Deferred | No | No | Yes | Needed for robust background subscription state changes and reconciliation. |
| App Store Connect subscription product setup | Pending setup | No | Yes | Yes | Required for real TestFlight/App Store purchase lifecycle testing. |
| Email confirmation/deep-link production setup | Pending setup | No | Conditional | Yes | Public release requires finalized production auth-entry behavior. |
| Sign in with Apple | Deferred/decision pending | No | Conditional | Conditional | Required status depends on release policy and distribution requirements. |
| Attachments/OCR/PDF features | Deferred | No | No | No | Explicitly out of MVP scope. |
| Incoming reply processing runtime path | Not in current connected MVP surface | No | No | No | Track as post-MVP integration scope if required. |
| Generate follow-up runtime path | Not in current connected MVP surface | No | No | No | Track as post-MVP integration scope if required. |
| Multi-task split confirmation runtime path | Not in current connected MVP surface | No | No | No | Current MVP centers on primary task flow without full split confirmation path. |
| Monitoring/error observability hardening | Partial | No | No | Yes | Strongly recommended before broad public exposure and support load. |
| Support/admin tools | Minimal | No | No | Yes | Needed for production operations and issue response. |
| Shared scheme value-free policy enforcement | Required policy | No | Yes | Yes | Prevents accidental leakage of concrete env values into shared config. |
| `usage_events` raw-content safety rule | Required policy | No | No | Yes | Must remain enforced for privacy and compliance posture. |

## 8. Recommended next roadmap

Before TestFlight:
1. Verify hosted Supabase deployment parity (migrations, functions, RLS).
2. Execute full end-to-end QA on real device and simulator.
3. Confirm App Store Connect subscription product setup and test account strategy.
4. Validate shared-scheme hygiene and local unshared env setup across team machines.

Before public App Store release:
1. Implement full Apple Server API validation.
2. Implement App Store Server Notifications and subscription reconciliation.
3. Finalize production auth entry details (email confirmation/deep links) and Sign in with Apple decision.
4. Expand production observability, incident handling, and support/admin tooling.
5. Run full security review and retention/audit policy checks.

Post-MVP v1.1:
1. Add attachments/OCR/PDF flows.
2. Decide and implement incoming-reply and follow-up generation runtime extensions.
3. Expand templates and multi-task split workflows.
4. Evaluate integrations with external communication/calendar systems while preserving guided self-service boundaries.
