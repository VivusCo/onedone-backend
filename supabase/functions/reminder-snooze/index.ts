import { corsHeaders } from "../_shared/cors.ts";
import { requireAuthenticatedUser } from "../_shared/auth.ts";

type ReminderSnoozeRequest = {
  reminder_id: string;
  snooze_until: string;
  ios_notification_id?: string;
  local_notification_status?: "not_scheduled" | "scheduled" | "delivered" | "opened" | "failed";
};

type ReminderLocalStatus = "not_scheduled" | "scheduled" | "delivered" | "opened" | "canceled" | "failed";

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

type ReminderSnoozeErrorCode =
  | "unauthorized"
  | "invalid_request"
  | "not_found"
  | "processing_failed"
  | "internal_error";

type ReminderSnoozeResponse =
  | {
    ok: true;
    reminder: ReminderRow;
    event_message: string;
  }
  | {
    ok: false;
    error: {
      code: ReminderSnoozeErrorCode;
      message: string;
      retryable: boolean;
    };
  };

const ALLOWED_LOCAL_STATUSES = new Set([
  "not_scheduled",
  "scheduled",
  "delivered",
  "opened",
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

function jsonResponse(payload: ReminderSnoozeResponse, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json",
    },
  });
}

function errorResponse(code: ReminderSnoozeErrorCode, message: string, status: number, retryable: boolean): Response {
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

  const payload = body as ReminderSnoozeRequest;

  if (typeof payload.reminder_id !== "string" || !isLikelyUuid(payload.reminder_id)) {
    return errorResponse("invalid_request", "reminder_id must be a valid UUID", 400, false);
  }

  if (typeof payload.snooze_until !== "string") {
    return errorResponse("invalid_request", "snooze_until is required", 400, false);
  }

  const snoozeUntilIso = parseIsoDate(payload.snooze_until);
  if (!snoozeUntilIso) {
    return errorResponse("invalid_request", "snooze_until must be a valid ISO datetime", 400, false);
  }

  if (payload.ios_notification_id !== undefined) {
    if (typeof payload.ios_notification_id !== "string" || payload.ios_notification_id.trim().length === 0) {
      return errorResponse("invalid_request", "ios_notification_id must be a non-empty string", 400, false);
    }
  }

  if (payload.local_notification_status !== undefined && !ALLOWED_LOCAL_STATUSES.has(payload.local_notification_status)) {
    return errorResponse("invalid_request", "Invalid local_notification_status for snooze", 400, false);
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
    return errorResponse("invalid_request", "Canceled reminders cannot be snoozed", 409, false);
  }

  const updates: Record<string, unknown> = {
    remind_at: snoozeUntilIso,
    status: "scheduled",
    local_notification_status: payload.local_notification_status ?? "scheduled",
  };

  if (payload.ios_notification_id !== undefined) {
    updates.ios_notification_id = payload.ios_notification_id.trim();
  }

  const { data: updatedReminder, error: updateError } = await userClient
    .from("reminders")
    .update(updates)
    .eq("id", existingReminder.id)
    .eq("user_id", user.id)
    .select("id,task_id,remind_at,ios_notification_id,local_notification_status,status,channel,created_at,updated_at")
    .single<ReminderRow>();

  if (updateError || !updatedReminder) {
    return errorResponse("processing_failed", "Failed to snooze reminder", 500, true);
  }

  const eventMessage = "Reminder snoozed";

  if (updatedReminder.task_id) {
    const { error: eventError } = await userClient.from("task_events").insert({
      user_id: user.id,
      task_id: updatedReminder.task_id,
      event_type: "reminder_set",
      event_message: eventMessage,
      event_metadata: {
        reminder_id: updatedReminder.id,
        action: "snooze",
        remind_at: updatedReminder.remind_at,
      },
    });

    if (eventError) {
      return errorResponse("processing_failed", "Reminder snoozed but failed to create task event", 500, true);
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
