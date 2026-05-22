import { corsHeaders } from "../_shared/cors.ts";
import { createServiceClient, requireAuthenticatedUser } from "../_shared/auth.ts";
import { deleteAllUserData } from "../_shared/privacy_helpers.ts";

type ServiceClient = any;

type DeleteAccountErrorCode =
  | "unauthorized"
  | "invalid_request"
  | "processing_failed"
  | "internal_error";

type DeleteAccountResponse =
  | {
    ok: true;
    account_deleted: true;
    cleanup_summary: {
      deleted_non_billing_usage_events: number;
      deleted_billing_usage_events: number;
      deleted_subscriptions: number;
      deleted_subscription_events: number;
      deleted_tasks: number;
      deleted_task_outputs: number;
      deleted_task_events: number;
      deleted_clarifications: number;
      deleted_checklist_items: number;
      deleted_reminders: number;
      deleted_user_notes: number;
      deleted_incoming_replies: number;
      deleted_task_feedback: number;
      deleted_attachment_records: number;
      deleted_analyze_task_idempotency: number;
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
      code: DeleteAccountErrorCode;
      message: string;
      retryable: boolean;
    };
  };

function jsonResponse(payload: DeleteAccountResponse, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json",
    },
  });
}

function errorResponse(
  code: DeleteAccountErrorCode,
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
    return errorResponse("internal_error", "Account deletion service is not configured", 500, false);
  }

  try {
    const deletedNonBilling = await deleteAllUserData({
      client: serviceClient,
      userId: user.id,
      includeBillingUsageEvents: false,
      includeSubscriptions: true,
    });

    const deletedBillingUsageEvents = await (async () => {
      const { count, error } = await serviceClient
        .from("usage_events")
        .delete({ count: "exact" })
        .eq("user_id", user.id)
        .eq("event_category", "billing")
        .select("id", { head: true, count: "exact" });

      if (error) {
        throw new Error("Failed to delete billing usage events");
      }

      return count ?? 0;
    })();

    const { error: deleteUserError } = await serviceClient.auth.admin.deleteUser(user.id);
    if (deleteUserError) {
      return errorResponse("processing_failed", "Failed to delete account", 500, true);
    }

    return jsonResponse(
      {
        ok: true,
        account_deleted: true,
        cleanup_summary: {
          deleted_non_billing_usage_events: deletedNonBilling.usage_events,
          deleted_billing_usage_events: deletedBillingUsageEvents,
          deleted_subscriptions: deletedNonBilling.subscriptions,
          deleted_subscription_events: deletedNonBilling.subscription_events,
          deleted_tasks: deletedNonBilling.tasks,
          deleted_task_outputs: deletedNonBilling.task_outputs,
          deleted_task_events: deletedNonBilling.task_events,
          deleted_clarifications: deletedNonBilling.clarifications,
          deleted_checklist_items: deletedNonBilling.checklist_items,
          deleted_reminders: deletedNonBilling.reminders,
          deleted_user_notes: deletedNonBilling.user_notes,
          deleted_incoming_replies: deletedNonBilling.incoming_replies,
          deleted_task_feedback: deletedNonBilling.task_feedback,
          deleted_attachment_records: deletedNonBilling.attachments,
          deleted_analyze_task_idempotency: deletedNonBilling.analyze_task_idempotency,
        },
        attachment_storage_cleanup: {
          status: "todo_v1_1",
          storage_reference_count: deletedNonBilling.attachment_storage_reference_count,
          message: "Attachment storage object cleanup is pending v1.1 storage integration.",
        },
      },
      200,
    );
  } catch {
    return errorResponse("processing_failed", "Failed to delete account", 500, true);
  }
});
