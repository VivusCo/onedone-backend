import { corsHeaders } from "../_shared/cors.ts";
import { createServiceClient, requireAuthenticatedUser } from "../_shared/auth.ts";
import { deleteAllUserData } from "../_shared/privacy_helpers.ts";

type ServiceClient = any;

type DeleteAllDataErrorCode =
  | "unauthorized"
  | "invalid_request"
  | "processing_failed"
  | "internal_error";

type DeleteAllDataResponse =
  | {
    ok: true;
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
      tasks: number;
      usage_events_non_billing: number;
    };
    preserved_data: {
      subscriptions: true;
      subscription_events: true;
      usage_events_billing: true;
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
      code: DeleteAllDataErrorCode;
      message: string;
      retryable: boolean;
    };
  };

function jsonResponse(payload: DeleteAllDataResponse, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json",
    },
  });
}

function errorResponse(
  code: DeleteAllDataErrorCode,
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

  const { user } = authResult;

  let serviceClient: ServiceClient;
  try {
    serviceClient = createServiceClient();
  } catch {
    return errorResponse("internal_error", "Cleanup service is not configured", 500, false);
  }

  try {
    const deleted = await deleteAllUserData({
      client: serviceClient,
      userId: user.id,
      includeBillingUsageEvents: false,
      includeSubscriptions: false,
    });

    return jsonResponse(
      {
        ok: true,
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
          tasks: deleted.tasks,
          usage_events_non_billing: deleted.usage_events,
        },
        preserved_data: {
          subscriptions: true,
          subscription_events: true,
          usage_events_billing: true,
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
    return errorResponse("processing_failed", "Failed to delete user data", 500, true);
  }
});
