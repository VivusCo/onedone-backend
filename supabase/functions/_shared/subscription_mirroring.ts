import { buildAccessStateResponse } from "./access_state.ts";

export type MirrorVerificationMode = "ios_verified_mirror";

export type MirrorEnvironment = "xcode" | "sandbox" | "testflight";

export type SubscriptionStatus =
  | "trialing"
  | "active"
  | "grace_period"
  | "expired"
  | "canceled"
  | "refunded";

export type MirroredEntitlement = {
  original_transaction_id: string;
  transaction_id: string | null;
  product_id: string;
  status: SubscriptionStatus;
  current_period_start: string | null;
  current_period_end: string | null;
  trial_started_at: string | null;
  trial_ends_at: string | null;
  cancel_at: string | null;
  canceled_at: string | null;
  ownership_type: string | null;
  will_auto_renew: boolean | null;
  is_in_intro_offer_period: boolean | null;
  metadata: Record<string, unknown>;
};

export type ProfileAccessRow = {
  onboarding_required: boolean | null;
  onboarding_completed_at: string | null;
  starter_started_at: string | null;
  starter_ends_at: string | null;
  starter_status: string | null;
};

export type SubscriptionRow = {
  id: string;
  user_id: string;
  provider: string;
  product_id: string | null;
  original_transaction_id: string | null;
  status: SubscriptionStatus;
  current_period_start: string | null;
  current_period_end: string | null;
  trial_started_at: string | null;
  trial_ends_at: string | null;
  cancel_at: string | null;
  canceled_at: string | null;
  last_verified_at: string | null;
  metadata: Record<string, unknown> | null;
};

export type SubscriptionEventType =
  | "initial_purchase"
  | "renewal"
  | "status_change"
  | "expiration"
  | "cancellation"
  | "billing_retry"
  | "grace_period_entered"
  | "grace_period_exited"
  | "refund"
  | "manual_adjustment";

const OPEN_ACCESS_STATES = new Set([
  "starter_active",
  "trial_active",
  "subscription_active",
  "subscription_cancelled_active",
  "grace_period",
]);

function parseOptionalIso(value: string | null): number | null {
  if (!value) return null;
  const ts = Date.parse(value);
  if (Number.isNaN(ts)) return null;
  return ts;
}

function isFuture(value: string | null, now: Date): boolean {
  const ts = parseOptionalIso(value);
  if (ts === null) return false;
  return ts > now.getTime();
}

function mapAccessFromSubscriptionStatus(
  status: SubscriptionStatus,
  row: SubscriptionRow,
  now: Date,
): "trial_active" | "trial_expired" | "subscription_active" | "subscription_cancelled_active" | "grace_period" | "subscription_expired" {
  if (status === "trialing") {
    if (isFuture(row.trial_ends_at ?? row.current_period_end, now)) {
      return "trial_active";
    }
    return "trial_expired";
  }

  if (status === "active") {
    return "subscription_active";
  }

  if (status === "grace_period") {
    return "grace_period";
  }

  if (status === "canceled") {
    if (isFuture(row.current_period_end, now)) {
      return "subscription_cancelled_active";
    }
    return "subscription_expired";
  }

  return "subscription_expired";
}

function compareSubscriptions(a: SubscriptionRow, b: SubscriptionRow): number {
  const rank = (status: SubscriptionStatus): number => {
    switch (status) {
      case "active":
        return 0;
      case "trialing":
        return 1;
      case "grace_period":
        return 2;
      case "canceled":
        return 3;
      case "expired":
        return 4;
      case "refunded":
        return 5;
      default:
        return 10;
    }
  };

  const rankDiff = rank(a.status) - rank(b.status);
  if (rankDiff !== 0) return rankDiff;

  const aPeriod = parseOptionalIso(a.current_period_end) ?? parseOptionalIso(a.trial_ends_at) ?? 0;
  const bPeriod = parseOptionalIso(b.current_period_end) ?? parseOptionalIso(b.trial_ends_at) ?? 0;
  if (aPeriod !== bPeriod) return bPeriod - aPeriod;

  const aVerified = parseOptionalIso(a.last_verified_at) ?? 0;
  const bVerified = parseOptionalIso(b.last_verified_at) ?? 0;
  return bVerified - aVerified;
}

export function pickRelevantSubscription(subscriptions: SubscriptionRow[]): SubscriptionRow | null {
  if (subscriptions.length === 0) return null;
  const sorted = [...subscriptions].sort(compareSubscriptions);
  return sorted[0] ?? null;
}

function buildFeatureFlags(accessState: string) {
  const openAccess = OPEN_ACCESS_STATES.has(accessState);

  return {
    can_use_core_features: openAccess,
    limited_mode: !openAccess && accessState !== "onboarding_required",
    show_app_store_trial_gate: accessState === "starter_expired" || accessState === "trial_not_started",
    can_start_app_store_trial: accessState === "starter_expired" || accessState === "trial_not_started",
  };
}

export function buildStoreKitAccessStateResponse(
  profile: ProfileAccessRow,
  subscription: SubscriptionRow | null,
  now = new Date(),
) {
  const base = buildAccessStateResponse(profile, now);

  let accessState = base.access_state;

  if (base.access_state === "starter_expired") {
    if (!subscription) {
      accessState = "trial_not_started";
    } else {
      accessState = mapAccessFromSubscriptionStatus(subscription.status, subscription, now);
    }
  }

  const trialStatus = subscription?.status === "trialing"
    ? (accessState === "trial_active" ? "active" : "expired")
    : null;

  return {
    ...base,
    access_state: accessState,
    trial_status: trialStatus,
    trial_ends_at: subscription?.trial_ends_at ?? null,
    subscription_status: subscription?.status ?? null,
    subscription_ends_at: subscription?.current_period_end ?? null,
    feature_flags: buildFeatureFlags(accessState),
  };
}

export function normalizeVerificationMode(value: unknown): MirrorVerificationMode | null {
  if (typeof value !== "string") return null;
  return value.trim().toLowerCase() === "ios_verified_mirror" ? "ios_verified_mirror" : null;
}

export function normalizeMirrorEnvironment(value: unknown): MirrorEnvironment | null {
  if (typeof value !== "string") return null;

  const normalized = value.trim().toLowerCase();
  if (normalized === "xcode") return "xcode";
  if (normalized === "sandbox") return "sandbox";
  if (normalized === "testflight") return "testflight";
  return null;
}

export function normalizeSubscriptionStatus(value: unknown): SubscriptionStatus | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim().toLowerCase();

  if (normalized === "trialing") return "trialing";
  if (normalized === "active") return "active";
  if (normalized === "grace_period") return "grace_period";
  if (normalized === "expired") return "expired";
  if (normalized === "canceled") return "canceled";
  if (normalized === "refunded") return "refunded";

  return null;
}

export function deriveSubscriptionEventType(
  previousStatus: SubscriptionStatus | null,
  nextStatus: SubscriptionStatus,
  created: boolean,
): SubscriptionEventType {
  if (created) {
    return "initial_purchase";
  }

  if (nextStatus === "expired") {
    return "expiration";
  }

  if (nextStatus === "canceled") {
    return "cancellation";
  }

  if (nextStatus === "refunded") {
    return "refund";
  }

  if (previousStatus !== "grace_period" && nextStatus === "grace_period") {
    return "grace_period_entered";
  }

  if (previousStatus === "grace_period" && nextStatus !== "grace_period") {
    return "grace_period_exited";
  }

  if (
    previousStatus &&
    ["expired", "canceled", "refunded"].includes(previousStatus) &&
    ["active", "trialing", "grace_period"].includes(nextStatus)
  ) {
    return "renewal";
  }

  return "status_change";
}

export function sanitizeMetadata(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }

  const sanitized: Record<string, unknown> = {};
  for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
    if (entry === null) {
      sanitized[key] = null;
      continue;
    }

    const type = typeof entry;
    if (type === "string" || type === "number" || type === "boolean") {
      sanitized[key] = entry;
    }
  }

  return sanitized;
}

export function normalizeOptionalIso(value: unknown): string | null | undefined {
  if (value === undefined) return undefined;
  if (value === null) return null;
  if (typeof value !== "string") return undefined;

  const trimmed = value.trim();
  if (!trimmed) return undefined;

  const parsed = new Date(trimmed);
  if (Number.isNaN(parsed.getTime())) return undefined;

  return parsed.toISOString();
}

export function normalizeOptionalBoolean(value: unknown): boolean | null | undefined {
  if (value === undefined) return undefined;
  if (value === null) return null;
  if (typeof value !== "boolean") return undefined;
  return value;
}

export function normalizeOptionalString(value: unknown): string | null | undefined {
  if (value === undefined) return undefined;
  if (value === null) return null;
  if (typeof value !== "string") return undefined;

  const trimmed = value.trim();
  if (!trimmed) return undefined;
  return trimmed;
}
