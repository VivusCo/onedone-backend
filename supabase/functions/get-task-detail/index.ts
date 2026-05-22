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

type TaskRow = {
  id: string;
  parent_task_id: string | null;
  title: string;
  description: string | null;
  status: TaskStatus;
  priority: "low" | "medium" | "high";
  source: "manual" | "analyze_task" | "split_child";
  due_at: string | null;
  completed_at: string | null;
  current_next_step: string | null;
  current_output_id: string | null;
  created_at: string;
  updated_at: string;
};

type CurrentOutput = {
  id: string;
  output_type: string;
  content: unknown;
  model: string | null;
  prompt_version: string | null;
  schema_version: string | null;
  created_at: string;
} | null;

type GetTaskDetailResponse =
  | {
    ok: true;
    task: TaskRow;
    current_output: CurrentOutput;
    summary: {
      checklist_total: number;
      checklist_pending: number;
      reminders_active: number;
      events_total: number;
      clarifications_open: number;
    };
  }
  | {
    ok: false;
    error: {
      code: "unauthorized" | "invalid_request" | "not_found" | "processing_failed" | "internal_error";
      message: string;
      retryable: boolean;
    };
  };

function jsonResponse(payload: GetTaskDetailResponse, status = 200): Response {
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

function isLikelyUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

async function getCount(userClient: any, table: string, filters: Array<[string, string | null]>): Promise<number> {
  let query = userClient.from(table).select("id", { head: true, count: "exact" });

  for (const [field, value] of filters) {
    if (value === null) {
      query = query.is(field, null);
    } else {
      query = query.eq(field, value);
    }
  }

  const { count, error } = await query;
  if (error) throw error;
  return count ?? 0;
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

  const { data: task, error: taskError } = await auth.userClient
    .from("tasks")
    .select("id,parent_task_id,title,description,status,priority,source,due_at,completed_at,current_next_step,current_output_id,created_at,updated_at")
    .eq("id", taskId)
    .eq("user_id", auth.user.id)
    .maybeSingle<TaskRow>();

  if (taskError) {
    return errorResponse("processing_failed", "Failed to load task detail", 500, true);
  }

  if (!task) {
    return errorResponse("not_found", "Task not found", 404, false);
  }

  let currentOutput: CurrentOutput = null;

  if (task.current_output_id) {
    const { data: output, error: outputError } = await auth.userClient
      .from("task_outputs")
      .select("id,output_type,content,model,prompt_version,schema_version,created_at")
      .eq("id", task.current_output_id)
      .eq("task_id", task.id)
      .eq("user_id", auth.user.id)
      .maybeSingle();

    if (outputError) {
      return errorResponse("processing_failed", "Failed to load current output", 500, true);
    }

    currentOutput = output ?? null;
  }

  try {
    const [checklistTotal, checklistPending, remindersActive, eventsTotal, clarificationsOpen] = await Promise.all([
      getCount(auth.userClient, "checklist_items", [["task_id", task.id], ["user_id", auth.user.id]]),
      getCount(auth.userClient, "checklist_items", [["task_id", task.id], ["user_id", auth.user.id], ["status", "pending"]]),
      getCount(auth.userClient, "reminders", [["task_id", task.id], ["user_id", auth.user.id], ["status", "scheduled"]]),
      getCount(auth.userClient, "task_events", [["task_id", task.id], ["user_id", auth.user.id]]),
      getCount(auth.userClient, "clarifications", [["task_id", task.id], ["user_id", auth.user.id], ["status", "open"]]),
    ]);

    return jsonResponse(
      {
        ok: true,
        task,
        current_output: currentOutput,
        summary: {
          checklist_total: checklistTotal,
          checklist_pending: checklistPending,
          reminders_active: remindersActive,
          events_total: eventsTotal,
          clarifications_open: clarificationsOpen,
        },
      },
      200,
    );
  } catch {
    return errorResponse("processing_failed", "Failed to load task detail summary", 500, true);
  }
});
