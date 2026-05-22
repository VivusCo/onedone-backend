import { corsHeaders } from "../_shared/cors.ts";
import { requireAuthenticatedUser } from "../_shared/auth.ts";

type UserClient = any;

type MessageMarkedSentRequest = {
  task_id: string;
};

type MessageMarkedSentErrorCode =
  | "unauthorized"
  | "invalid_request"
  | "not_found"
  | "processing_failed"
  | "internal_error";

type MessageMarkedSentResponse =
  | {
    ok: true;
    task_id: string;
    status: "waiting_for_reply";
    completed_at: string | null;
    event_message: string;
  }
  | {
    ok: false;
    error: {
      code: MessageMarkedSentErrorCode;
      message: string;
      retryable: boolean;
    };
  };

type RpcStatusRow = {
  task_id: string;
  task_status: "waiting_for_reply";
  completed_at: string | null;
};

function isLikelyUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function jsonResponse(payload: MessageMarkedSentResponse, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json",
    },
  });
}

function errorResponse(
  code: MessageMarkedSentErrorCode,
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

function parseRpcError(err: string): { code: MessageMarkedSentErrorCode; message: string; status: number; retryable: boolean } {
  if (err.includes("task_not_found")) {
    return {
      code: "not_found",
      message: "Task not found",
      status: 404,
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
    message: "Failed to mark message as sent",
    status: 500,
    retryable: true,
  };
}

async function runAtomicMarkSent(userClient: UserClient, taskId: string): Promise<RpcStatusRow> {
  const eventMessage = "User marked message as sent; waiting for reply";

  const { data, error } = await userClient.rpc("update_task_status_with_event", {
    p_task_id: taskId,
    p_new_status: "waiting_for_reply",
    p_event_message: eventMessage,
    p_event_metadata: {
      source: "message_marked_sent",
      action: "user_marked_sent",
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

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return errorResponse("invalid_request", "Invalid JSON body", 400, false);
  }

  if (!body || typeof body !== "object") {
    return errorResponse("invalid_request", "Request body must be a JSON object", 400, false);
  }

  const payload = body as MessageMarkedSentRequest;

  if (typeof payload.task_id !== "string" || !isLikelyUuid(payload.task_id)) {
    return errorResponse("invalid_request", "task_id must be a valid UUID", 400, false);
  }

  try {
    const updated = await runAtomicMarkSent(auth.userClient, payload.task_id);

    return jsonResponse(
      {
        ok: true,
        task_id: updated.task_id,
        status: "waiting_for_reply",
        completed_at: updated.completed_at,
        event_message: "User marked message as sent; waiting for reply",
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
