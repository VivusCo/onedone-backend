import { corsHeaders } from "../_shared/cors.ts";
import { requireAuthenticatedUser } from "../_shared/auth.ts";

type UserClient = any;

type ReminderLocalStatus = "not_scheduled" | "scheduled" | "delivered" | "opened" | "canceled" | "failed";

type ReminderUpdateRequest = {
  reminder_id: string;
  remind_at?: string;
  ios_notification_id?: string;
  local_notification_status?: ReminderLocalStatus;
};

type ReminderUpdateErrorCode =
  | "unauthorized"
  | "invalid_request"
  | "not_found"
  | "processing_failed"
  | "internal_error";

type ReminderRow = {
  id: string;
  task_id: string | null;
  remind_at: string;
  ios_notification_id: string | null;
  local_notification_status: ReminderLocalStatus;
  status: "scheduled" | "sent" | "canceled" | "failed";
  channel: "push" | "email" | "in_app" | "sms";
  created_at: string;
  updated_at: string;
};

type ReminderUpdateResponse =
  | {
    ok: true;
    reminder: ReminderRow;
    event_message: string;
  }
  | {
    ok: false;
    error: {
      code: ReminderUpdateErrorCode;
      message: string;
      retryable: boolean;
    };
  };

const LOCAL_STATUS_SET = new Set([
  "not_scheduled",
  "scheduled",
  "delivered",
  "opened",
  "canceled",
  "failed",
]);

function isLikelyUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function parseIsoDate(value: string): string | null {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString();
}

function jsonResponse(payload: ReminderUpdateResponse, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json",
    },
  });
}

function errorResponse(code: ReminderUpdateErrorCode, message: string, status: number, retryable: boolean): Response {
  return jsonResponse(
    {
      ok: false,
      error: { code, message, retryable },
    },
    status,
  );
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

  const payload = body as ReminderUpdateRequest;

  if (typeof payload.reminder_id !== "string" || !isLikelyUuid(payload.reminder_id)) {
    return errorResponse("invalid_request", "reminder_id must be a valid UUID", 400, false);
  }

  const hasAnyField =
    payload.remind_at !== undefined ||
    payload.ios_notification_id !== undefined ||
    payload.local_notification_status !== undefined;

  if (!hasAnyField) {
    return errorResponse("invalid_request", "At least one field must be provided to update", 400, false);
  }

  const { data: existingReminder, error: existingError } = await userClient
    .from("reminders")
    .select("id,task_id,remind_at,ios_notification_id,local_notification_status,status,channel,created_at,updated_at")
    .eq("id", payload.reminder_id)
    .eq("user_id", user.id)
    .maybeSingle<ReminderRow>();

  if (existingError) {
    return errorResponse("processing_failed", "Failed to read reminder", 500, true);
  }

  if (!existingReminder) {
    return errorResponse("not_found", "Reminder not found", 404, false);
  }

  if (existingReminder.task_id) {
    const { data: task, error: taskError } = await userClient
      .from("tasks")
      .select("id")
      .eq("id", existingReminder.task_id)
      .eq("user_id", user.id)
      .maybeSingle();

    if (taskError) {
      return errorResponse("processing_failed", "Failed to validate task ownership", 500, true);
    }

    if (!task) {
      return errorResponse("not_found", "Task not found", 404, false);
    }
  }

  if (existingReminder.status === "canceled") {
    return errorResponse("invalid_request", "Canceled reminders cannot be updated", 409, false);
  }

  const updates: Record<string, unknown> = {};

  if (payload.remind_at !== undefined) {
    if (typeof payload.remind_at !== "string") {
      return errorResponse("invalid_request", "remind_at must be a string", 400, false);
    }

    const remindAtIso = parseIsoDate(payload.remind_at);
    if (!remindAtIso) {
      return errorResponse("invalid_request", "remind_at must be a valid ISO datetime", 400, false);
    }

    updates.remind_at = remindAtIso;
    updates.status = "scheduled";
  }

  if (payload.ios_notification_id !== undefined) {
    if (typeof payload.ios_notification_id !== "string" || payload.ios_notification_id.trim().length === 0) {
      return errorResponse("invalid_request", "ios_notification_id must be a non-empty string", 400, false);
    }
    updates.ios_notification_id = payload.ios_notification_id.trim();
  }

  if (payload.local_notification_status !== undefined) {
    if (typeof payload.local_notification_status !== "string" || !LOCAL_STATUS_SET.has(payload.local_notification_status)) {
      return errorResponse("invalid_request", "Invalid local_notification_status", 400, false);
    }

    if (payload.local_notification_status === "canceled") {
      return errorResponse("invalid_request", "Use reminder-cancel to set canceled status", 400, false);
    }

    updates.local_notification_status = payload.local_notification_status;
  }

  const { data: updatedReminder, error: updateError } = await userClient
    .from("reminders")
    .update(updates)
    .eq("id", existingReminder.id)
    .eq("user_id", user.id)
    .select("id,task_id,remind_at,ios_notification_id,local_notification_status,status,channel,created_at,updated_at")
    .single<ReminderRow>();

  if (updateError || !updatedReminder) {
    return errorResponse("processing_failed", "Failed to update reminder", 500, true);
  }

  const eventMessage = "Reminder updated";

  if (updatedReminder.task_id) {
    const { error: eventError } = await userClient.from("task_events").insert({
      user_id: user.id,
      task_id: updatedReminder.task_id,
      event_type: "reminder_set",
      event_message: eventMessage,
      event_metadata: {
        reminder_id: updatedReminder.id,
        action: "update",
        local_notification_status: updatedReminder.local_notification_status,
      },
    });

    if (eventError) {
      return errorResponse("processing_failed", "Reminder updated but failed to create task event", 500, true);
    }
  }

  return jsonResponse(
    {
      ok: true,
      reminder: updatedReminder,
      event_message: eventMessage,
    },
    200,
  );
});
