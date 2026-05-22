import { corsHeaders } from "../_shared/cors.ts";
import { requireAuthenticatedUser } from "../_shared/auth.ts";

type TaskStatus =
  | "pending"
  | "in_progress"
  | "needs_clarification"
  | "waiting_for_user"
  | "waiting_for_reply"
  | "completed"
  | "canceled"
  | "failed";

type TasksFilter =
  | "needs_clarification"
  | "follow_up_needed"
  | "due_soon"
  | "waiting_for_reply"
  | "in_progress"
  | "done";

type TaskSort = "updated_desc" | "created_desc" | "due_asc" | "due_desc";

type TaskListItem = {
  id: string;
  parent_task_id: string | null;
  title: string;
  description: string | null;
  status: TaskStatus;
  priority: "low" | "medium" | "high";
  due_at: string | null;
  completed_at: string | null;
  current_next_step: string | null;
  current_output_id: string | null;
  created_at: string;
  updated_at: string;
};

type ListTasksResponse =
  | {
    ok: true;
    filter: TasksFilter | null;
    sort: TaskSort;
    pagination: {
      page: number;
      limit: number;
      total_count: number | null;
      has_more: boolean;
    };
    tasks: TaskListItem[];
  }
  | {
    ok: false;
    error: {
      code: "unauthorized" | "invalid_request" | "processing_failed" | "internal_error";
      message: string;
      retryable: boolean;
    };
  };

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;
const MAX_PAGE = 1000;

function jsonResponse(payload: ListTasksResponse, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json",
    },
  });
}

function errorResponse(
  code: "unauthorized" | "invalid_request" | "processing_failed" | "internal_error",
  message: string,
  status: number,
  retryable: boolean,
): Response {
  return jsonResponse({ ok: false, error: { code, message, retryable } }, status);
}

function parsePositiveInt(value: string | null, fallback: number): number {
  if (!value) return fallback;
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed < 0) return fallback;
  return parsed;
}

function parseFilter(value: string | null): TasksFilter | null {
  if (!value) return null;
  if (
    value === "needs_clarification" ||
    value === "follow_up_needed" ||
    value === "due_soon" ||
    value === "waiting_for_reply" ||
    value === "in_progress" ||
    value === "done"
  ) {
    return value;
  }
  return null;
}

function parseSort(value: string | null): TaskSort | null {
  if (!value) return "updated_desc";
  if (value === "updated_desc" || value === "created_desc" || value === "due_asc" || value === "due_desc") {
    return value;
  }
  return null;
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
  const filter = parseFilter(url.searchParams.get("filter"));
  if (url.searchParams.get("filter") && !filter) {
    return errorResponse("invalid_request", "Invalid filter", 400, false);
  }

  const sort = parseSort(url.searchParams.get("sort"));
  if (!sort) {
    return errorResponse("invalid_request", "Invalid sort", 400, false);
  }

  const page = Math.min(parsePositiveInt(url.searchParams.get("page"), 0), MAX_PAGE);
  const requestedLimit = parsePositiveInt(url.searchParams.get("limit"), DEFAULT_LIMIT);
  const limit = Math.min(Math.max(requestedLimit, 1), MAX_LIMIT);
  const from = page * limit;
  const to = from + limit - 1;

  let query = auth.userClient
    .from("tasks")
    .select(
      "id,parent_task_id,title,description,status,priority,due_at,completed_at,current_next_step,current_output_id,created_at,updated_at",
      { count: "exact" },
    )
    .eq("user_id", auth.user.id);

  if (filter === "needs_clarification") {
    query = query.eq("status", "needs_clarification");
  } else if (filter === "follow_up_needed") {
    // Schema uses waiting_for_user for follow-up-needed semantics.
    query = query.eq("status", "waiting_for_user");
  } else if (filter === "waiting_for_reply") {
    query = query.eq("status", "waiting_for_reply");
  } else if (filter === "in_progress") {
    query = query.eq("status", "in_progress");
  } else if (filter === "done") {
    // Schema uses completed for done semantics.
    query = query.eq("status", "completed");
  } else if (filter === "due_soon") {
    const nowIso = new Date().toISOString();
    const soon = new Date(Date.now() + 72 * 60 * 60 * 1000).toISOString();
    query = query
      .not("due_at", "is", null)
      .gte("due_at", nowIso)
      .lte("due_at", soon)
      .in("status", ["pending", "in_progress", "needs_clarification", "waiting_for_user", "waiting_for_reply"]);
  }

  if (sort === "updated_desc") {
    query = query.order("updated_at", { ascending: false }).order("created_at", { ascending: false });
  } else if (sort === "created_desc") {
    query = query.order("created_at", { ascending: false });
  } else if (sort === "due_asc") {
    query = query.order("due_at", { ascending: true, nullsFirst: false }).order("updated_at", { ascending: false });
  } else if (sort === "due_desc") {
    query = query.order("due_at", { ascending: false, nullsFirst: false }).order("updated_at", { ascending: false });
  }

  const { data, error, count } = await query.range(from, to);

  if (error) {
    return errorResponse("processing_failed", "Failed to list tasks", 500, true);
  }

  const tasks = (data ?? []) as TaskListItem[];
  const totalCount = count ?? null;
  const hasMore = totalCount === null ? tasks.length === limit : from + tasks.length < totalCount;

  return jsonResponse(
    {
      ok: true,
      filter,
      sort,
      pagination: {
        page,
        limit,
        total_count: totalCount,
        has_more: hasMore,
      },
      tasks,
    },
    200,
  );
});
