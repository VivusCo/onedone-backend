import { corsHeaders } from "../_shared/cors.ts";
import { createServiceClient, requireAuthenticatedUser } from "../_shared/auth.ts";
import {
  deleteTaskScopedUserData,
  isLikelyUuid,
} from "../_shared/privacy_helpers.ts";

type UserClient = any;
type ServiceClient = any;

type DeleteTaskRequest = {
  task_id: string;
};

type DeleteTaskErrorCode =
  | "unauthorized"
  | "invalid_request"
  | "not_found"
  | "processing_failed"
  | "internal_error";

type TaskRow = {
  id: string;
};

type DeleteTaskResponse =
  | {
    ok: true;
    deleted_task_id: string;
    deleted_counts: {
      analyze_task_idempotency: number;
      reminders: number;
      user_notes: number;
      incoming_replies: number;
      attachments: number;
      task_feedback: number;
      checklist_items: number;
      clarifications: number;
      task_events: number;
      task_outputs: number;
      usage_events: number;
      tasks: number;
    };
    attachment_storage_cleanup: {
      status: "todo_v1_1";
      storage_reference_count: number;
      message: string;
    };
  }
  | {
    ok: false;
    error: {
      code: DeleteTaskErrorCode;
      message: string;
      retryable: boolean;
    };
  };

function jsonResponse(payload: DeleteTaskResponse, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json",
    },
  });
}

function errorResponse(
  code: DeleteTaskErrorCode,
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

function validateRequestBody(raw: unknown): { valid: true; data: DeleteTaskRequest } | { valid: false; response: Response } {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return {
      valid: false,
      response: errorResponse("invalid_request", "Request body must be a JSON object", 400, false),
    };
  }

  const body = raw as DeleteTaskRequest;

  if (typeof body.task_id !== "string" || !isLikelyUuid(body.task_id)) {
    return {
      valid: false,
      response: errorResponse("invalid_request", "task_id must be a valid UUID", 400, false),
    };
  }

  return {
    valid: true,
    data: { task_id: body.task_id },
  };
}

async function ensureTaskOwnership(userClient: UserClient, userId: string, taskId: string): Promise<boolean> {
  const { data, error } = await userClient
    .from("tasks")
    .select("id")
    .eq("id", taskId)
    .eq("user_id", userId)
    .maybeSingle<TaskRow>();

  if (error) {
    throw new Error("Failed to read task");
  }

  return Boolean(data);
}

async function insertDeletionUsageEvent(params: {
  serviceClient: ServiceClient;
  userId: string;
  taskId: string;
  counts: Awaited<ReturnType<typeof deleteTaskScopedUserData>>;
}) {
  const { error } = await params.serviceClient.from("usage_events").insert({
    user_id: params.userId,
    task_id: null,
    event_name: "privacy_delete_task",
    event_category: "system",
    event_source: "edge_function",
    quantity: 1,
    properties: {
      deleted_task_id: params.taskId,
      deleted_counts: {
        analyze_task_idempotency: params.counts.analyze_task_idempotency,
        reminders: params.counts.reminders,
        user_notes: params.counts.user_notes,
        incoming_replies: params.counts.incoming_replies,
        attachments: params.counts.attachments,
        task_feedback: params.counts.task_feedback,
        checklist_items: params.counts.checklist_items,
        clarifications: params.counts.clarifications,
        task_events: params.counts.task_events,
        task_outputs: params.counts.task_outputs,
        usage_events: params.counts.usage_events,
        tasks: params.counts.tasks,
      },
      attachment_storage_cleanup_todo: true,
      attachment_storage_reference_count: params.counts.attachment_storage_reference_count,
      contains_raw_user_content: false,
    },
  });

  if (error) {
    throw new Error("Failed to insert deletion usage event");
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return errorResponse("invalid_request", "Method not allowed", 405, false);
  }

  const authResult = await requireAuthenticatedUser(req);
  if ("error" in authResult) {
    return errorResponse("unauthorized", authResult.error, 401, false);
  }

  const { user, userClient } = authResult;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return errorResponse("invalid_request", "Invalid JSON body", 400, false);
  }

  const validated = validateRequestBody(body);
  if (!validated.valid) {
    return validated.response;
  }

  const payload = validated.data;

  let serviceClient: ServiceClient;
  try {
    serviceClient = createServiceClient();
  } catch {
    return errorResponse("internal_error", "Deletion audit service is not configured", 500, false);
  }

  try {
    const ownsTask = await ensureTaskOwnership(userClient, user.id, payload.task_id);
    if (!ownsTask) {
      return errorResponse("not_found", "Task not found", 404, false);
    }

    const deleted = await deleteTaskScopedUserData({
      client: serviceClient,
      userId: user.id,
      taskId: payload.task_id,
    });

    if (deleted.tasks === 0) {
      return errorResponse("not_found", "Task not found", 404, false);
    }

    await insertDeletionUsageEvent({
      serviceClient,
      userId: user.id,
      taskId: payload.task_id,
      counts: deleted,
    });

    return jsonResponse(
      {
        ok: true,
        deleted_task_id: payload.task_id,
        deleted_counts: {
          analyze_task_idempotency: deleted.analyze_task_idempotency,
          reminders: deleted.reminders,
          user_notes: deleted.user_notes,
          incoming_replies: deleted.incoming_replies,
          attachments: deleted.attachments,
          task_feedback: deleted.task_feedback,
          checklist_items: deleted.checklist_items,
          clarifications: deleted.clarifications,
          task_events: deleted.task_events,
          task_outputs: deleted.task_outputs,
          usage_events: deleted.usage_events,
          tasks: deleted.tasks,
        },
        attachment_storage_cleanup: {
          status: "todo_v1_1",
          storage_reference_count: deleted.attachment_storage_reference_count,
          message: "Attachment storage object cleanup is pending v1.1 storage integration.",
        },
      },
      200,
    );
  } catch {
    return errorResponse("processing_failed", "Failed to delete task", 500, true);
  }
});
