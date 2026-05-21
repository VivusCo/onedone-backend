import { corsHeaders } from "../_shared/cors.ts";
import { buildAccessStateResponse } from "../_shared/access_state.ts";
import { requireAuthenticatedUser } from "../_shared/auth.ts";

const PROFILE_SELECT =
  "id,onboarding_required,onboarding_completed_at,starter_started_at,starter_ends_at,starter_status";

type ProfileRow = {
  id: string;
  onboarding_required: boolean | null;
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

  if (req.method !== "GET") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }

  const authResult = await requireAuthenticatedUser(req);
  if ("error" in authResult) {
    return jsonResponse({ error: authResult.error }, 401);
  }

  const { user, userClient } = authResult;

  const { data: profile, error: profileError } = await userClient
    .from("profiles")
    .select(PROFILE_SELECT)
    .eq("id", user.id)
    .maybeSingle<ProfileRow>();

  if (profileError) {
    return jsonResponse({ error: "Failed to read access state" }, 500);
  }

  const fallbackProfile: ProfileRow = {
    id: user.id,
    onboarding_required: true,
    onboarding_completed_at: null,
    starter_started_at: null,
    starter_ends_at: null,
    starter_status: "not_started",
  };

  return jsonResponse({
    ok: true,
    ...buildAccessStateResponse(profile ?? fallbackProfile),
  });
});
