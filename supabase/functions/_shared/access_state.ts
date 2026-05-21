export type AccessState = "onboarding_required" | "starter_active" | "starter_expired";

type ProfileAccessFields = {
  onboarding_completed_at: string | null;
  starter_started_at: string | null;
  starter_ends_at: string | null;
  starter_status: string | null;
};

function isStarterActive(profile: ProfileAccessFields, now: Date): boolean {
  if (!profile.starter_ends_at) return false;

  const endsAt = new Date(profile.starter_ends_at);
  if (Number.isNaN(endsAt.getTime())) return false;

  return profile.starter_status === "active" && endsAt.getTime() > now.getTime();
}

function getStarterDaysLeft(profile: ProfileAccessFields, now: Date): number {
  if (!profile.starter_ends_at) return 0;

  const endsAt = new Date(profile.starter_ends_at);
  const diffMs = endsAt.getTime() - now.getTime();

  if (Number.isNaN(diffMs) || diffMs <= 0) return 0;

  return Math.ceil(diffMs / (1000 * 60 * 60 * 24));
}

function getAccessState(profile: ProfileAccessFields, now: Date): AccessState {
  if (!profile.onboarding_completed_at) {
    return "onboarding_required";
  }

  if (isStarterActive(profile, now)) {
    return "starter_active";
  }

  return "starter_expired";
}

function getFeatureFlags(accessState: AccessState) {
  const starterActive = accessState === "starter_active";
  const starterExpired = accessState === "starter_expired";

  return {
    can_use_core_features: starterActive,
    limited_mode: starterExpired,
    show_app_store_trial_gate: starterExpired,
    can_start_app_store_trial: starterExpired,
  };
}

export function buildAccessStateResponse(profile: ProfileAccessFields, now = new Date()) {
  const accessState = getAccessState(profile, now);

  return {
    access_state: accessState,
    onboarding_completed: Boolean(profile.onboarding_completed_at),
    onboarding_completed_at: profile.onboarding_completed_at,
    starter_started_at: profile.starter_started_at,
    starter_ends_at: profile.starter_ends_at,
    starter_days_left: accessState === "starter_active" ? getStarterDaysLeft(profile, now) : 0,
    trial_status: null,
    trial_ends_at: null,
    subscription_status: null,
    subscription_ends_at: null,
    feature_flags: getFeatureFlags(accessState),
  };
}
