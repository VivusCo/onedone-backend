import { corsHeaders } from "../_shared/cors.ts";
import { requireAuthenticatedUser } from "../_shared/auth.ts";

type UserClient = any;

type NotificationTriggeredRequest = {
  reminder_id: string;
  local_notification_status: "delivered" | "opened";
  triggered_at?: string;
  mark_follow_up_needed?: boolean;
};

type ReminderRow = {
  id: string;
  task_id: string | null;
  remind_at: string;
  ios_notification_id: string | null;
  local_notification_status: "not_scheduled" | "scheduled" | "delivered" | "opened" | "canceled" | "failed";
  status: "scheduled" | "sent" | "canceled" | "failed";
  sent_at: string | null;
};

type TaskRow = {
  id: string;
  status:
    | "pending"
    | "in_progress"
    | "needs_clarification"
    | "waiting_for_user"
    | "waiting_for_reply"
    | "completed"
    | "canceled"
    | "failed";
};

type NotificationTriggeredErrorCode =
  | "unauthorized"
  | "invalid_request"
  | "not_found"
  | "processing_failed"
  | "internal_error";

type NotificationTriggeredResponse =
  | {
    ok: true;
    reminder_id: string;
    reminder_status: ReminderRow["status"];
    local_notification_status: ReminderRow["local_notification_status"];
    task_id: string | null;
    task_status: TaskRow["status"] | null;
    moved_to_follow_up_needed: boolean;
    follow_up_skipped_reason: "task_completed" | null;
  }
  | {
    ok: false;
    error: {
      code: NotificationTriggeredErrorCode;
      message: string;
      retryable: boolean;
    };
  };

type RpcStatusRow = {
  task_id: string;
  task_status: TaskRow["status"];
  completed_at: string | null;
};

function isLikelyUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function parseIsoDate(value: string): string | null {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString();
}

function jsonResponse(payload: NotificationTriggeredResponse, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json",
    },
  });
}

function errorResponse(
  code: NotificationTriggeredErrorCode,
  message: string,
  status: number,
  retryable: boolean,
): Response {
  return jsonResponse(
    {
      ok: false,
      error: { code, message, retryable },
    },
    status,
  );
}

async function setTaskToFollowUpNeeded(userClient: UserClient, taskId: string): Promise<RpcStatusRow> {
  const { data, error } = await userClient.rpc("update_task_status_with_event", {
    p_task_id: taskId,
    p_new_status: "waiting_for_user",
    p_event_message: "Reminder triggered; follow-up needed",
    p_event_metadata: {
      source: "notification_triggered",
      action: "move_follow_up_needed",
    },
  });

  if (error) {
    throw new Error(error.message || "rpc_failed");
  }

  const row = Array.isArray(data) ? data[0] as RpcStatusRow : data as RpcStatusRow;
  if (!row || typeof row.task_id !== "string") {
    throw new Error("rpc_invalid_response");
  }

  return row;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return errorResponse("invalid_request", "Method not allowed", 405, false);
  }

  const auth = await requireAuthenticatedUser(req);
  if ("error" in auth) {
    return errorResponse("unauthorized", auth.error, 401, false);
  }

  const { user, userClient } = auth;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return errorResponse("invalid_request", "Invalid JSON body", 400, false);
  }

  if (!body || typeof body !== "object") {
    return errorResponse("invalid_request", "Request body must be a JSON object", 400, false);
  }

  const payload = body as NotificationTriggeredRequest;

  if (typeof payload.reminder_id !== "string" || !isLikelyUuid(payload.reminder_id)) {
    return errorResponse("invalid_request", "reminder_id must be a valid UUID", 400, false);
  }

  if (payload.local_notification_status !== "delivered" && payload.local_notification_status !== "opened") {
    return errorResponse("invalid_request", "local_notification_status must be delivered or opened", 400, false);
  }

  if (payload.triggered_at !== undefined && (typeof payload.triggered_at !== "string" || !parseIsoDate(payload.triggered_at))) {
    return errorResponse("invalid_request", "triggered_at must be a valid ISO datetime", 400, false);
  }

  if (payload.mark_follow_up_needed !== undefined && typeof payload.mark_follow_up_needed !== "boolean") {
    return errorResponse("invalid_request", "mark_follow_up_needed must be a boolean", 400, false);
  }

  const markFollowUpNeeded = payload.mark_follow_up_needed ?? true;

  const { data: reminder, error: reminderError } = await userClient
    .from("reminders")
    .select("id,task_id,remind_at,ios_notification_id,local_notification_status,status,sent_at")
    .eq("id", payload.reminder_id)
    .eq("user_id", user.id)
    .maybeSingle<ReminderRow>();

  if (reminderError) {
    return errorResponse("processing_failed", "Failed to read reminder", 500, true);
  }

  if (!reminder) {
    return errorResponse("not_found", "Reminder not found", 404, false);
  }

  let task: TaskRow | null = null;

  if (reminder.task_id) {
    const { data: taskData, error: taskError } = await userClient
      .from("tasks")
      .select("id,status")
      .eq("id", reminder.task_id)
      .eq("user_id", user.id)
      .maybeSingle<TaskRow>();

    if (taskError) {
      return errorResponse("processing_failed", "Failed to validate task ownership", 500, true);
    }

    if (!taskData) {
      return errorResponse("not_found", "Task not found", 404, false);
    }

    task = taskData;
  }

  const triggeredAtIso = payload.triggered_at ? parseIsoDate(payload.triggered_at) : new Date().toISOString();

  const { data: updatedReminder, error: updateReminderError } = await userClient
    .from("reminders")
    .update({
      local_notification_status: payload.local_notification_status,
      status: "sent",
      sent_at: triggeredAtIso,
    })
    .eq("id", reminder.id)
    .eq("user_id", user.id)
    .select("id,task_id,remind_at,ios_notification_id,local_notification_status,status,sent_at")
    .single<ReminderRow>();

  if (updateReminderError || !updatedReminder) {
    return errorResponse("processing_failed", "Failed to update reminder trigger state", 500, true);
  }

  let movedToFollowUpNeeded = false;
  let followUpSkippedReason: "task_completed" | null = null;
  let taskStatus: TaskRow["status"] | null = task?.status ?? null;

  if (task && markFollowUpNeeded) {
    if (task.status === "completed") {
      followUpSkippedReason = "task_completed";
    } else if (task.status !== "waiting_for_user") {
      try {
        const rpcResult = await setTaskToFollowUpNeeded(userClient, task.id);
        movedToFollowUpNeeded = true;
        taskStatus = rpcResult.task_status;
      } catch {
        return errorResponse("processing_failed", "Reminder was triggered but task follow-up update failed", 500, true);
      }
    }
  }

  if (task) {
    const { error: eventError } = await userClient.from("task_events").insert({
      user_id: user.id,
      task_id: task.id,
      event_type: "reminder_set",
      event_message: "Reminder notification triggered",
      event_metadata: {
        reminder_id: updatedReminder.id,
        action: "notification_triggered",
        local_notification_status: updatedReminder.local_notification_status,
        moved_to_follow_up_needed: movedToFollowUpNeeded,
        follow_up_skipped_reason: followUpSkippedReason,
      },
    });

    if (eventError) {
      return errorResponse("processing_failed", "Reminder triggered but failed to create task event", 500, true);
    }
  }

  return jsonResponse(
    {
      ok: true,
      reminder_id: updatedReminder.id,
      reminder_status: updatedReminder.status,
      local_notification_status: updatedReminder.local_notification_status,
      task_id: updatedReminder.task_id,
      task_status: taskStatus,
      moved_to_follow_up_needed: movedToFollowUpNeeded,
      follow_up_skipped_reason: followUpSkippedReason,
    },
    200,
  );
});
