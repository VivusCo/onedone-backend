import { corsHeaders } from "../_shared/cors.ts";
import { requireAuthenticatedUser } from "../_shared/auth.ts";

type EventOrder = "desc" | "asc";

type TaskEventRow = {
  id: string;
  event_type: string;
  event_message: string | null;
  event_metadata: unknown;
  created_at: string;
};

type GetTaskEventsResponse =
  | {
    ok: true;
    task_id: string;
    order: EventOrder;
    pagination: {
      page: number;
      limit: number;
      total_count: number | null;
      has_more: boolean;
    };
    events: TaskEventRow[];
  }
  | {
    ok: false;
    error: {
      code: "unauthorized" | "invalid_request" | "not_found" | "processing_failed" | "internal_error";
      message: string;
      retryable: boolean;
    };
  };

const DEFAULT_LIMIT = 30;
const MAX_LIMIT = 100;
const MAX_PAGE = 1000;

function isLikelyUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function parsePositiveInt(value: string | null, fallback: number): number {
  if (!value) return fallback;
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed < 0) return fallback;
  return parsed;
}

function jsonResponse(payload: GetTaskEventsResponse, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json",
    },
  });
}

function errorResponse(
  code: "unauthorized" | "invalid_request" | "not_found" | "processing_failed" | "internal_error",
  message: string,
  status: number,
  retryable: boolean,
): Response {
  return jsonResponse({ ok: false, error: { code, message, retryable } }, status);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "GET") {
    return errorResponse("invalid_request", "Method not allowed", 405, false);
  }

  const auth = await requireAuthenticatedUser(req);
  if ("error" in auth) {
    return errorResponse("unauthorized", auth.error, 401, false);
  }

  const url = new URL(req.url);
  const taskId = url.searchParams.get("task_id");
  if (!taskId || !isLikelyUuid(taskId)) {
    return errorResponse("invalid_request", "task_id must be a valid UUID", 400, false);
  }

  const orderParam = url.searchParams.get("order");
  const order: EventOrder = orderParam === "asc" ? "asc" : "desc";
  if (orderParam && orderParam !== "asc" && orderParam !== "desc") {
    return errorResponse("invalid_request", "order must be asc or desc", 400, false);
  }

  const page = Math.min(parsePositiveInt(url.searchParams.get("page"), 0), MAX_PAGE);
  const requestedLimit = parsePositiveInt(url.searchParams.get("limit"), DEFAULT_LIMIT);
  const limit = Math.min(Math.max(requestedLimit, 1), MAX_LIMIT);
  const from = page * limit;
  const to = from + limit - 1;

  const { data: task, error: taskError } = await auth.userClient
    .from("tasks")
    .select("id")
    .eq("id", taskId)
    .eq("user_id", auth.user.id)
    .maybeSingle();

  if (taskError) {
    return errorResponse("processing_failed", "Failed to validate task ownership", 500, true);
  }

  if (!task) {
    return errorResponse("not_found", "Task not found", 404, false);
  }

  const { data, error, count } = await auth.userClient
    .from("task_events")
    .select("id,event_type,event_message,event_metadata,created_at", { count: "exact" })
    .eq("task_id", taskId)
    .eq("user_id", auth.user.id)
    .order("created_at", { ascending: order === "asc" })
    .range(from, to);

  if (error) {
    return errorResponse("processing_failed", "Failed to load task events", 500, true);
  }

  const events = (data ?? []) as TaskEventRow[];
  const totalCount = count ?? null;
  const hasMore = totalCount === null ? events.length === limit : from + events.length < totalCount;

  return jsonResponse(
    {
      ok: true,
      task_id: taskId,
      order,
      pagination: {
        page,
        limit,
        total_count: totalCount,
        has_more: hasMore,
      },
      events,
    },
    200,
  );
});
