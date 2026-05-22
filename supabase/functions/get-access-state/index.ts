import { corsHeaders } from "../_shared/cors.ts";
import { requireAuthenticatedUser } from "../_shared/auth.ts";
import { loadStoreKitAccessState } from "../_shared/subscription_mirroring.ts";

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

  let accessStatePayload;
  try {
    accessStatePayload = await loadStoreKitAccessState(userClient, user.id);
  } catch {
    return jsonResponse({ error: "Failed to read access state" }, 500);
  }

  return jsonResponse({
    ok: true,
    ...accessStatePayload,
  });
});
