import { corsHeaders } from "../_shared/cors.ts";
import { requireAuthenticatedUser } from "../_shared/auth.ts";

type UserClient = any;

type ReminderLocalStatus = "not_scheduled" | "scheduled" | "delivered" | "opened" | "canceled" | "failed";

type ReminderCreateRequest = {
  task_id: string;
  remind_at: string;
  ios_notification_id: string;
  local_notification_status?: ReminderLocalStatus;
};

type ReminderCreateErrorCode =
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

type ReminderCreateResponse =
  | {
    ok: true;
    reminder: ReminderRow;
    event_message: string;
  }
  | {
    ok: false;
    error: {
      code: ReminderCreateErrorCode;
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

function jsonResponse(payload: ReminderCreateResponse, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json",
    },
  });
}

function errorResponse(code: ReminderCreateErrorCode, message: string, status: number, retryable: boolean): Response {
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

  const payload = body as ReminderCreateRequest;

  if (typeof payload.task_id !== "string" || !isLikelyUuid(payload.task_id)) {
    return errorResponse("invalid_request", "task_id must be a valid UUID", 400, false);
  }

  if (typeof payload.remind_at !== "string") {
    return errorResponse("invalid_request", "remind_at is required", 400, false);
  }

  const remindAtIso = parseIsoDate(payload.remind_at);
  if (!remindAtIso) {
    return errorResponse("invalid_request", "remind_at must be a valid ISO datetime", 400, false);
  }

  if (typeof payload.ios_notification_id !== "string" || payload.ios_notification_id.trim().length === 0) {
    return errorResponse("invalid_request", "ios_notification_id is required", 400, false);
  }

  const localStatus = payload.local_notification_status ?? "scheduled";
  if (!LOCAL_STATUS_SET.has(localStatus)) {
    return errorResponse("invalid_request", "Invalid local_notification_status", 400, false);
  }

  const { data: task, error: taskError } = await userClient
    .from("tasks")
    .select("id")
    .eq("id", payload.task_id)
    .eq("user_id", user.id)
    .maybeSingle();

  if (taskError) {
    return errorResponse("processing_failed", "Failed to validate task ownership", 500, true);
  }

  if (!task) {
    return errorResponse("not_found", "Task not found", 404, false);
  }

  const { data: reminder, error: reminderError } = await userClient
    .from("reminders")
    .insert({
      user_id: user.id,
      task_id: payload.task_id,
      remind_at: remindAtIso,
      ios_notification_id: payload.ios_notification_id.trim(),
      local_notification_status: localStatus,
      status: "scheduled",
      channel: "push",
    })
    .select("id,task_id,remind_at,ios_notification_id,local_notification_status,status,channel,created_at,updated_at")
    .single<ReminderRow>();

  if (reminderError || !reminder) {
    return errorResponse("processing_failed", "Failed to create reminder", 500, true);
  }

  const eventMessage = "Reminder scheduled";

  const { error: eventError } = await userClient.from("task_events").insert({
    user_id: user.id,
    task_id: payload.task_id,
    event_type: "reminder_set",
    event_message: eventMessage,
    event_metadata: {
      reminder_id: reminder.id,
      action: "create",
      ios_notification_id: reminder.ios_notification_id,
      local_notification_status: reminder.local_notification_status,
    },
  });

  if (eventError) {
    return errorResponse("processing_failed", "Reminder created but failed to create task event", 500, true);
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
