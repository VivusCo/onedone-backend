import { corsHeaders } from "../_shared/cors.ts";
import { requireAuthenticatedUser } from "../_shared/auth.ts";

type UserClient = any;

type UpdateTaskStatusRequest = {
  task_id: string;
  status:
    | "pending"
    | "in_progress"
    | "needs_clarification"
    | "waiting_for_user"
    | "waiting_for_reply"
    | "completed"
    | "canceled"
    | "failed";
  event_message?: string;
};

type UpdateTaskStatusErrorCode =
  | "unauthorized"
  | "invalid_request"
  | "not_found"
  | "processing_failed"
  | "internal_error";

type UpdateTaskStatusResponse =
  | {
    ok: true;
    task_id: string;
    status: UpdateTaskStatusRequest["status"];
    completed_at: string | null;
    event_message: string;
  }
  | {
    ok: false;
    error: {
      code: UpdateTaskStatusErrorCode;
      message: string;
      retryable: boolean;
    };
  };

type RpcStatusRow = {
  task_id: string;
  task_status: UpdateTaskStatusRequest["status"];
  completed_at: string | null;
};

const ALLOWED_STATUSES = new Set([
  "pending",
  "in_progress",
  "needs_clarification",
  "waiting_for_user",
  "waiting_for_reply",
  "completed",
  "canceled",
  "failed",
]);

function isLikelyUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function jsonResponse(payload: UpdateTaskStatusResponse, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json",
    },
  });
}

function errorResponse(
  code: UpdateTaskStatusErrorCode,
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

function defaultEventMessage(status: UpdateTaskStatusRequest["status"]): string {
  switch (status) {
    case "completed":
      return "Task marked done";
    case "waiting_for_reply":
      return "Task marked waiting for reply";
    case "waiting_for_user":
      return "Task marked waiting for user";
    case "canceled":
      return "Task canceled";
    case "failed":
      return "Task marked failed";
    case "in_progress":
      return "Task moved to in progress";
    case "needs_clarification":
      return "Task marked needs clarification";
    case "pending":
    default:
      return "Task status updated";
  }
}

function parseRpcError(err: string): { code: UpdateTaskStatusErrorCode; message: string; status: number; retryable: boolean } {
  if (err.includes("task_not_found")) {
    return {
      code: "not_found",
      message: "Task not found",
      status: 404,
      retryable: false,
    };
  }

  if (err.includes("invalid_status")) {
    return {
      code: "invalid_request",
      message: "Invalid task status",
      status: 400,
      retryable: false,
    };
  }

  if (err.includes("unauthorized")) {
    return {
      code: "unauthorized",
      message: "Unauthorized",
      status: 401,
      retryable: false,
    };
  }

  return {
    code: "processing_failed",
    message: "Task status update failed",
    status: 500,
    retryable: true,
  };
}

async function runAtomicStatusUpdate(params: {
  userClient: UserClient;
  taskId: string;
  newStatus: UpdateTaskStatusRequest["status"];
  eventMessage: string;
}): Promise<RpcStatusRow> {
  const { data, error } = await params.userClient.rpc("update_task_status_with_event", {
    p_task_id: params.taskId,
    p_new_status: params.newStatus,
    p_event_message: params.eventMessage,
    p_event_metadata: {
      source: "update_task_status",
    },
  });

  if (error) {
    throw new Error(error.message || "rpc_failed");
  }

  const row = Array.isArray(data) ? data[0] as RpcStatusRow : data as RpcStatusRow;
  if (!row || typeof row.task_id !== "string" || typeof row.task_status !== "string") {
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

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return errorResponse("invalid_request", "Invalid JSON body", 400, false);
  }

  if (!body || typeof body !== "object") {
    return errorResponse("invalid_request", "Request body must be a JSON object", 400, false);
  }

  const payload = body as UpdateTaskStatusRequest;

  if (typeof payload.task_id !== "string" || !isLikelyUuid(payload.task_id)) {
    return errorResponse("invalid_request", "task_id must be a valid UUID", 400, false);
  }

  if (typeof payload.status !== "string" || !ALLOWED_STATUSES.has(payload.status)) {
    return errorResponse("invalid_request", "Invalid status value", 400, false);
  }

  if (payload.event_message !== undefined && typeof payload.event_message !== "string") {
    return errorResponse("invalid_request", "event_message must be a string", 400, false);
  }

  const eventMessage = payload.event_message?.trim() || defaultEventMessage(payload.status);

  try {
    const updated = await runAtomicStatusUpdate({
      userClient: auth.userClient,
      taskId: payload.task_id,
      newStatus: payload.status,
      eventMessage,
    });

    return jsonResponse(
      {
        ok: true,
        task_id: updated.task_id,
        status: updated.task_status,
        completed_at: updated.completed_at,
        event_message: eventMessage,
      },
      200,
    );
  } catch (error) {
    if (error instanceof Error) {
      const mapped = parseRpcError(error.message);
      return errorResponse(mapped.code, mapped.message, mapped.status, mapped.retryable);
    }

    return errorResponse("internal_error", "Unexpected error", 500, true);
  }
});
