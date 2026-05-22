import { corsHeaders } from "../_shared/cors.ts";
import { requireAuthenticatedUser } from "../_shared/auth.ts";

type ChecklistStatus = "pending" | "done";
type ChecklistSort = "position_asc" | "position_desc" | "updated_desc";

type ChecklistItemRow = {
  id: string;
  content: string;
  position: number;
  status: ChecklistStatus;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
};

type GetChecklistItemsResponse =
  | {
    ok: true;
    task_id: string;
    status: ChecklistStatus | null;
    sort: ChecklistSort;
    pagination: {
      page: number;
      limit: number;
      total_count: number | null;
      has_more: boolean;
    };
    items: ChecklistItemRow[];
  }
  | {
    ok: false;
    error: {
      code: "unauthorized" | "invalid_request" | "not_found" | "processing_failed" | "internal_error";
      message: string;
      retryable: boolean;
    };
  };

const DEFAULT_LIMIT = 100;
const MAX_LIMIT = 200;
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

function jsonResponse(payload: GetChecklistItemsResponse, status = 200): Response {
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

  const statusParam = url.searchParams.get("status");
  const status = statusParam === "pending" || statusParam === "done" ? statusParam : null;
  if (statusParam && !status) {
    return errorResponse("invalid_request", "status must be pending or done", 400, false);
  }

  const sortParam = url.searchParams.get("sort");
  const sort: ChecklistSort =
    sortParam === "position_desc" ? "position_desc" : sortParam === "updated_desc" ? "updated_desc" : "position_asc";
  if (sortParam && sortParam !== "position_asc" && sortParam !== "position_desc" && sortParam !== "updated_desc") {
    return errorResponse("invalid_request", "Invalid sort", 400, false);
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

  let query = auth.userClient
    .from("checklist_items")
    .select("id,content,position,status,completed_at,created_at,updated_at", { count: "exact" })
    .eq("task_id", taskId)
    .eq("user_id", auth.user.id);

  if (status) {
    query = query.eq("status", status);
  }

  if (sort === "position_asc") {
    query = query.order("position", { ascending: true }).order("created_at", { ascending: true });
  } else if (sort === "position_desc") {
    query = query.order("position", { ascending: false }).order("created_at", { ascending: false });
  } else {
    query = query.order("updated_at", { ascending: false }).order("position", { ascending: true });
  }

  const { data, error, count } = await query.range(from, to);

  if (error) {
    return errorResponse("processing_failed", "Failed to load checklist items", 500, true);
  }

  const items = (data ?? []) as ChecklistItemRow[];
  const totalCount = count ?? null;
  const hasMore = totalCount === null ? items.length === limit : from + items.length < totalCount;

  return jsonResponse(
    {
      ok: true,
      task_id: taskId,
      status,
      sort,
      pagination: {
        page,
        limit,
        total_count: totalCount,
        has_more: hasMore,
      },
      items,
    },
    200,
  );
});
