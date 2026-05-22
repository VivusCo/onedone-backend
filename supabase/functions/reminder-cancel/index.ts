import { corsHeaders } from "../_shared/cors.ts";
import { requireAuthenticatedUser } from "../_shared/auth.ts";

type ReminderCancelRequest = {
  reminder_id: string;
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

type ReminderCancelErrorCode =
  | "unauthorized"
  | "invalid_request"
  | "not_found"
  | "processing_failed"
  | "internal_error";

type ReminderCancelResponse =
  | {
    ok: true;
    reminder: ReminderRow;
    event_message: string;
  }
  | {
    ok: false;
    error: {
      code: ReminderCancelErrorCode;
      message: string;
      retryable: boolean;
    };
  };

function isLikelyUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function jsonResponse(payload: ReminderCancelResponse, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json",
    },
  });
}

function errorResponse(code: ReminderCancelErrorCode, message: string, status: number, retryable: boolean): Response {
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

  const payload = body as ReminderCancelRequest;

  if (typeof payload.reminder_id !== "string" || !isLikelyUuid(payload.reminder_id)) {
    return errorResponse("invalid_request", "reminder_id must be a valid UUID", 400, false);
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

  let reminder = existingReminder;

  if (existingReminder.status !== "canceled" || existingReminder.local_notification_status !== "canceled") {
    const { data: updatedReminder, error: updateError } = await userClient
      .from("reminders")
      .update({
        status: "canceled",
        local_notification_status: "canceled",
      })
      .eq("id", existingReminder.id)
      .eq("user_id", user.id)
      .select("id,task_id,remind_at,ios_notification_id,local_notification_status,status,channel,created_at,updated_at")
      .single<ReminderRow>();

    if (updateError || !updatedReminder) {
      return errorResponse("processing_failed", "Failed to cancel reminder", 500, true);
    }

    reminder = updatedReminder;
  }

  const eventMessage = "Reminder canceled";

  if (reminder.task_id) {
    const { error: eventError } = await userClient.from("task_events").insert({
      user_id: user.id,
      task_id: reminder.task_id,
      event_type: "reminder_set",
      event_message: eventMessage,
      event_metadata: {
        reminder_id: reminder.id,
        action: "cancel",
      },
    });

    if (eventError) {
      return errorResponse("processing_failed", "Reminder canceled but failed to create task event", 500, true);
    }
  }

  return jsonResponse(
    {
      ok: true,
      reminder,
      event_message: eventMessage,
    },
    200,
  );
});
