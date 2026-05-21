import { corsHeaders } from "../_shared/cors.ts";
import { buildAccessStateResponse } from "../_shared/access_state.ts";
import { requireAuthenticatedUser } from "../_shared/auth.ts";
import {
  ANALYZE_TASK_MAX_INPUT_LENGTH,
  ANALYZE_TASK_MIN_INPUT_LENGTH,
  type AnalyzeTaskRequest,
  type AnalyzeTaskResponse,
  type AnalyzeTaskSuccessResponse,
  type ErrorCode,
  type SelectedTemplate,
} from "../_shared/analyze_task_types.ts";
import {
  buildClarificationQuestion,
  buildDeterministicAnalysis,
  deriveTaskTitle,
  detectCancelSubscription,
  normalizeSelectedTemplate,
} from "../_shared/analyze_task_rules.ts";

type ProfileAccessRow = {
  onboarding_required: boolean | null;
  onboarding_completed_at: string | null;
  starter_started_at: string | null;
  starter_ends_at: string | null;
  starter_status: string | null;
};

type TaskRow = {
  id: string;
  status: string;
};

type TaskOutputRow = {
  id: string;
};

type ClarificationRow = {
  id: string;
  status: "open";
};

type IdempotencyRow = {
  id: string;
  user_id: string;
  idempotency_key: string;
  request_fingerprint: string;
  task_id: string | null;
  response_type: "clarification" | "task_analysis" | "error" | null;
  response_payload: AnalyzeTaskSuccessResponse | Record<string, unknown>;
  processing_status: "in_progress" | "completed" | "failed";
};

type JsonError = {
  error: {
    code: ErrorCode;
    message: string;
    retryable: boolean;
  };
};

const PROFILE_SELECT =
  "onboarding_required,onboarding_completed_at,starter_started_at,starter_ends_at,starter_status";
type UserClient = any;

function jsonResponse(payload: AnalyzeTaskResponse | JsonError, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json",
    },
  });
}

function errorResponse(code: ErrorCode, message: string, status: number, retryable: boolean): Response {
  return jsonResponse(
    {
      ok: false,
      error: { code, message, retryable },
    },
    status,
  );
}

function validateRequestBody(raw: unknown): { valid: true; data: AnalyzeTaskRequest } | { valid: false; response: Response } {
  if (!raw || typeof raw !== "object") {
    return {
      valid: false,
      response: errorResponse("invalid_request", "Request body must be a JSON object", 400, false),
    };
  }

  const body = raw as AnalyzeTaskRequest;

  if (typeof body.input_text !== "string") {
    return {
      valid: false,
      response: errorResponse("invalid_request", "input_text is required", 400, false),
    };
  }

  const trimmed = body.input_text.trim();
  if (trimmed.length < ANALYZE_TASK_MIN_INPUT_LENGTH || trimmed.length > ANALYZE_TASK_MAX_INPUT_LENGTH) {
    return {
      valid: false,
      response: errorResponse(
        "invalid_request",
        `input_text length must be between ${ANALYZE_TASK_MIN_INPUT_LENGTH} and ${ANALYZE_TASK_MAX_INPUT_LENGTH} characters`,
        400,
        false,
      ),
    };
  }

  if (body.billing_source !== undefined && body.billing_source !== null && typeof body.billing_source !== "string") {
    return {
      valid: false,
      response: errorResponse("invalid_request", "billing_source must be a string when provided", 400, false),
    };
  }

  return {
    valid: true,
    data: {
      input_text: trimmed,
      selected_template: body.selected_template,
      billing_source: body.billing_source ?? null,
    },
  };
}

async function getAccessState(userClient: UserClient, userId: string): Promise<string> {
  const { data: profile, error } = await userClient
    .from("profiles")
    .select(PROFILE_SELECT)
    .eq("id", userId)
    .maybeSingle<ProfileAccessRow>();

  if (error) throw new Error("Failed to read profile access state");

  const fallback: ProfileAccessRow = {
    onboarding_required: true,
    onboarding_completed_at: null,
    starter_started_at: null,
    starter_ends_at: null,
    starter_status: "not_started",
  };

  const access = buildAccessStateResponse(profile ?? fallback);
  return access.access_state;
}

function buildRequestFingerprint(payload: AnalyzeTaskRequest, selectedTemplate: SelectedTemplate): string {
  return JSON.stringify({
    input_text: payload.input_text,
    selected_template: selectedTemplate,
    billing_source: payload.billing_source ?? null,
  });
}

async function markIdempotencyCompleted(
  userClient: UserClient,
  idem: IdempotencyRow | null,
  response: AnalyzeTaskSuccessResponse,
): Promise<void> {
  if (!idem) return;

  await userClient
    .from("analyze_task_idempotency")
    .update({
      processing_status: "completed",
      task_id: response.task_id,
      response_type: response.response_type,
      response_payload: response,
    })
    .eq("id", idem.id)
    .eq("user_id", idem.user_id);
}

async function markIdempotencyFailed(
  userClient: UserClient,
  idem: IdempotencyRow | null,
): Promise<void> {
  if (!idem) return;

  await userClient
    .from("analyze_task_idempotency")
    .update({ processing_status: "failed", response_type: "error" })
    .eq("id", idem.id)
    .eq("user_id", idem.user_id);
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

  let parsedBody: unknown;
  try {
    parsedBody = await req.json();
  } catch {
    return errorResponse("invalid_request", "Invalid JSON body", 400, false);
  }

  const validated = validateRequestBody(parsedBody);
  if (!validated.valid) {
    return validated.response;
  }

  const payload = validated.data;
  const selectedTemplate = normalizeSelectedTemplate(payload);
  let accessState: string;
  try {
    accessState = await getAccessState(userClient, user.id);
  } catch {
    return errorResponse("internal_error", "Failed to evaluate access state", 500, true);
  }

  if (accessState !== "starter_active") {
    return errorResponse(
      "access_blocked",
      "Access is not active. Complete onboarding or start trial when available.",
      403,
      false,
    );
  }

  const idempotencyKey = req.headers.get("Idempotency-Key")?.trim() ?? "";
  if (idempotencyKey.length > 255) {
    return errorResponse("invalid_request", "Idempotency-Key must be 255 chars or fewer", 400, false);
  }

  const fingerprint = buildRequestFingerprint(payload, selectedTemplate);
  let idemRow: IdempotencyRow | null = null;

  if (idempotencyKey) {
    const { data: insertedRow, error: insertIdemError } = await userClient
      .from("analyze_task_idempotency")
      .insert({
        user_id: user.id,
        idempotency_key: idempotencyKey,
        request_fingerprint: fingerprint,
        processing_status: "in_progress",
      })
      .select(
        "id,user_id,idempotency_key,request_fingerprint,task_id,response_type,response_payload,processing_status",
      )
      .single<IdempotencyRow>();

    if (insertIdemError) {
      const { data: existingRow, error: existingError } = await userClient
        .from("analyze_task_idempotency")
        .select(
          "id,user_id,idempotency_key,request_fingerprint,task_id,response_type,response_payload,processing_status",
        )
        .eq("user_id", user.id)
        .eq("idempotency_key", idempotencyKey)
        .maybeSingle<IdempotencyRow>();

      if (existingError || !existingRow) {
        return errorResponse("internal_error", "Failed to handle idempotency key", 500, true);
      }

      if (existingRow.request_fingerprint !== fingerprint) {
        return errorResponse(
          "idempotency_conflict",
          "Idempotency-Key already used with a different request payload",
          409,
          false,
        );
      }

      if (existingRow.processing_status === "completed") {
        const replay = existingRow.response_payload as AnalyzeTaskSuccessResponse;
        return jsonResponse({ ...replay, idempotent_replay: true }, 200);
      }

      if (existingRow.processing_status === "in_progress") {
        return errorResponse(
          "idempotency_in_progress",
          "A request with this Idempotency-Key is already processing",
          409,
          true,
        );
      }

      return errorResponse(
        "processing_failed",
        "Previous attempt failed for this Idempotency-Key. Retry with a new key.",
        409,
        true,
      );
    }

    idemRow = insertedRow;
  }

  let createdTaskId: string | null = null;

  try {
    const isCancelSubscription = detectCancelSubscription(payload.input_text, selectedTemplate);
    const missingBillingSource = isCancelSubscription && !payload.billing_source?.trim();

    const taskTitle = deriveTaskTitle(payload.input_text, selectedTemplate);

    const { data: task, error: taskError } = await userClient
      .from("tasks")
      .insert({
        user_id: user.id,
        title: taskTitle,
        description: payload.input_text,
        status: missingBillingSource ? "needs_clarification" : "in_progress",
        source: "analyze_task",
      })
      .select("id,status")
      .single<TaskRow>();

    if (taskError || !task) {
      throw new Error("Failed to create task");
    }

    createdTaskId = task.id;

    await userClient.from("task_events").insert({
      user_id: user.id,
      task_id: task.id,
      event_type: "task_created",
      event_message: "Task created via analyze-task",
      event_metadata: { selected_template: selectedTemplate },
    });

    if (missingBillingSource) {
      const { data: clarification, error: clarificationError } = await userClient
        .from("clarifications")
        .insert({
          user_id: user.id,
          task_id: task.id,
          question: buildClarificationQuestion(),
          status: "open",
        })
        .select("id,status")
        .single<ClarificationRow>();

      if (clarificationError || !clarification) {
        throw new Error("Failed to create clarification");
      }

      await userClient.from("task_events").insert({
        user_id: user.id,
        task_id: task.id,
        event_type: "clarification_requested",
        event_message: "Clarification required before analysis",
        event_metadata: { reason: "missing_billing_source" },
      });

      const response: AnalyzeTaskSuccessResponse = {
        ok: true,
        response_type: "clarification",
        idempotent_replay: false,
        task_id: task.id,
        task_status: "needs_clarification",
        access_state: accessState,
        clarification: {
          id: clarification.id,
          question: buildClarificationQuestion(),
          status: "open",
        },
        task_output_id: null,
        task_analysis: null,
      };

      await markIdempotencyCompleted(userClient, idemRow, response);

      return jsonResponse(response, 200);
    }

    const analysis = buildDeterministicAnalysis(
      payload.input_text,
      selectedTemplate,
      payload.billing_source?.trim() ?? null,
    );

    await userClient
      .from("task_outputs")
      .update({ is_current: false })
      .eq("task_id", task.id)
      .eq("output_type", "analysis")
      .eq("is_current", true);

    const { data: output, error: outputError } = await userClient
      .from("task_outputs")
      .insert({
        user_id: user.id,
        task_id: task.id,
        output_type: "analysis",
        is_current: true,
        content: {
          response_type: "task_analysis",
          selected_template: selectedTemplate,
          task_analysis: analysis,
          deterministic: true,
          model: "rule_based_v1",
        },
      })
      .select("id")
      .single<TaskOutputRow>();

    if (outputError || !output) {
      throw new Error("Failed to save task output");
    }

    const checklistRows = analysis.checklist.map((item, index) => ({
      user_id: user.id,
      task_id: task.id,
      content: item.text,
      position: index,
      status: "pending",
    }));

    if (checklistRows.length > 0) {
      const { error: checklistError } = await userClient.from("checklist_items").insert(checklistRows);
      if (checklistError) {
        throw new Error("Failed to create checklist items");
      }
    }

    const { error: taskUpdateError } = await userClient
      .from("tasks")
      .update({
        status: "in_progress",
        current_next_step: analysis.current_next_step,
        current_output_id: output.id,
      })
      .eq("id", task.id)
      .eq("user_id", user.id);

    if (taskUpdateError) {
      throw new Error("Failed to update task state");
    }

    await userClient.from("task_events").insert({
      user_id: user.id,
      task_id: task.id,
      event_type: "task_updated",
      event_message: "Deterministic analysis created",
      event_metadata: { output_id: output.id },
    });

    const response: AnalyzeTaskSuccessResponse = {
      ok: true,
      response_type: "task_analysis",
      idempotent_replay: false,
      task_id: task.id,
      task_status: "in_progress",
      access_state: accessState,
      clarification: null,
      task_output_id: output.id,
      task_analysis: analysis,
    };

    await markIdempotencyCompleted(userClient, idemRow, response);

    return jsonResponse(response, 200);
  } catch (error) {
    if (createdTaskId) {
      await userClient
        .from("tasks")
        .update({ status: "failed" })
        .eq("id", createdTaskId)
        .eq("user_id", user.id);

      await userClient.from("task_events").insert({
        user_id: user.id,
        task_id: createdTaskId,
        event_type: "task_updated",
        event_message: "Task processing failed",
        event_metadata: { retryable: true },
      });
    }

    await markIdempotencyFailed(userClient, idemRow);

    console.error("analyze-task error", error);
    return errorResponse("processing_failed", "Task processing failed. Please retry.", 500, true);
  }
});
