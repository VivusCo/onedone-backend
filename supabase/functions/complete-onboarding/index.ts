import { corsHeaders } from "../_shared/cors.ts";
import { buildAccessStateResponse } from "../_shared/access_state.ts";
import { createServiceClient, requireAuthenticatedUser } from "../_shared/auth.ts";

const STARTER_ACCESS_DAYS = 3;

const PROFILE_SELECT = "id,onboarding_completed_at,starter_started_at,starter_ends_at,starter_status";

type ProfileRow = {
  id: string;
  onboarding_completed_at: string | null;
  starter_started_at: string | null;
  starter_ends_at: string | null;
  starter_status: string | null;
};

function jsonResponse(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json",
    },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }

  const authResult = await requireAuthenticatedUser(req);
  if ("error" in authResult) {
    return jsonResponse({ error: authResult.error }, 401);
  }

  const { user, userClient } = authResult;

  let profile: ProfileRow | null = null;
  const { data: profileData, error: profileError } = await userClient
    .from("profiles")
    .select(PROFILE_SELECT)
    .eq("id", user.id)
    .maybeSingle<ProfileRow>();

  if (profileError) {
    return jsonResponse({ error: "Failed to read profile" }, 500);
  }

  profile = profileData;

  if (!profile) {
    const serviceClient = createServiceClient();
    const { error: insertError } = await serviceClient.from("profiles").insert({ id: user.id });
    if (insertError) {
      return jsonResponse({ error: "Failed to initialize profile" }, 500);
    }

    const { data: insertedProfile, error: insertedProfileError } = await userClient
      .from("profiles")
      .select(PROFILE_SELECT)
      .eq("id", user.id)
      .single<ProfileRow>();

    if (insertedProfileError || !insertedProfile) {
      return jsonResponse({ error: "Failed to load initialized profile" }, 500);
    }

    profile = insertedProfile;
  }

  const now = new Date();
  const nowIso = now.toISOString();

  const starterEndsAt = profile.starter_ends_at ? new Date(profile.starter_ends_at) : null;
  const starterIsActive =
    profile.starter_status === "active" &&
    starterEndsAt !== null &&
    !Number.isNaN(starterEndsAt.getTime()) &&
    starterEndsAt.getTime() > now.getTime();

  const updates: Partial<ProfileRow> = {};

  if (!profile.onboarding_completed_at) {
    updates.onboarding_completed_at = nowIso;

    if (!starterIsActive) {
      const starterEnd = new Date(now.getTime() + STARTER_ACCESS_DAYS * 24 * 60 * 60 * 1000);
      updates.starter_started_at = nowIso;
      updates.starter_ends_at = starterEnd.toISOString();
      updates.starter_status = "active";
    }
  }

  if (Object.keys(updates).length > 0) {
    const { data: updatedProfile, error: updateError } = await userClient
      .from("profiles")
      .update(updates)
      .eq("id", user.id)
      .select(PROFILE_SELECT)
      .single<ProfileRow>();

    if (updateError || !updatedProfile) {
      return jsonResponse({ error: "Failed to update onboarding state" }, 500);
    }

    profile = updatedProfile;
  }

  return jsonResponse({
    ok: true,
    ...buildAccessStateResponse(profile, now),
  });
});
