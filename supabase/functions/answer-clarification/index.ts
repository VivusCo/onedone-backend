import { corsHeaders } from "../_shared/cors.ts";
import { buildAccessStateResponse } from "../_shared/access_state.ts";
import { requireAuthenticatedUser } from "../_shared/auth.ts";
import {
  ANSWER_CLARIFICATION_MAX_LENGTH,
  ANSWER_CLARIFICATION_MIN_LENGTH,
  type AnswerClarificationErrorCode,
  type AnswerClarificationRequest,
  type AnswerClarificationResponse,
  type AnswerClarificationSuccessResponse,
} from "../_shared/answer_clarification_types.ts";
import {
  buildAppStoreCancellationAnalysis,
  buildGenericAnalysis,
  buildHelperPathAnalysis,
  deriveBillingSource,
  isNotSureAnswer,
} from "../_shared/answer_clarification_rules.ts";

type UserClient = any;

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

type ClarificationRow = {
  id: string;
  task_id: string;
  status: "open" | "answered" | "dismissed";
};

type UpdatedClarificationRow = {
  id: string;
  status: "answered";
  answered_at: string;
};

type TaskOutputRow = {
  id: string;
};

type JsonError = {
  error: {
    code: AnswerClarificationErrorCode;
    message: string;
    retryable: boolean;
  };
};

const PROFILE_SELECT =
  "onboarding_required,onboarding_completed_at,starter_started_at,starter_ends_at,starter_status";

function jsonResponse(payload: AnswerClarificationResponse | JsonError, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json",
    },
  });
}

function errorResponse(
  code: AnswerClarificationErrorCode,
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

function isLikelyUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function validateRequestBody(
  raw: unknown,
): { valid: true; data: AnswerClarificationRequest } | { valid: false; response: Response } {
  if (!raw || typeof raw !== "object") {
    return {
      valid: false,
      response: errorResponse("invalid_request", "Request body must be a JSON object", 400, false),
    };
  }

  const body = raw as AnswerClarificationRequest;

  if (typeof body.task_id !== "string" || !isLikelyUuid(body.task_id)) {
    return {
      valid: false,
      response: errorResponse("invalid_request", "task_id must be a valid UUID", 400, false),
    };
  }

  if (typeof body.clarification_id !== "string" || !isLikelyUuid(body.clarification_id)) {
    return {
      valid: false,
      response: errorResponse("invalid_request", "clarification_id must be a valid UUID", 400, false),
    };
  }

  if (typeof body.answer_text !== "string") {
    return {
      valid: false,
      response: errorResponse("invalid_request", "answer_text is required", 400, false),
    };
  }

  const answer = body.answer_text.trim();
  if (answer.length < ANSWER_CLARIFICATION_MIN_LENGTH || answer.length > ANSWER_CLARIFICATION_MAX_LENGTH) {
    return {
      valid: false,
      response: errorResponse(
        "invalid_request",
        `answer_text length must be between ${ANSWER_CLARIFICATION_MIN_LENGTH} and ${ANSWER_CLARIFICATION_MAX_LENGTH} characters`,
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
      task_id: body.task_id,
      clarification_id: body.clarification_id,
      answer_text: answer,
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

  return buildAccessStateResponse(profile ?? fallback).access_state;
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

  const { data: task, error: taskError } = await userClient
    .from("tasks")
    .select("id,status")
    .eq("id", payload.task_id)
    .eq("user_id", user.id)
    .maybeSingle<TaskRow>();

  if (taskError) {
    return errorResponse("internal_error", "Failed to read task", 500, true);
  }

  if (!task) {
    return errorResponse("not_found", "Task not found", 404, false);
  }

  const { data: clarification, error: clarificationError } = await userClient
    .from("clarifications")
    .select("id,task_id,status")
    .eq("id", payload.clarification_id)
    .eq("task_id", payload.task_id)
    .eq("user_id", user.id)
    .maybeSingle<ClarificationRow>();

  if (clarificationError) {
    return errorResponse("internal_error", "Failed to read clarification", 500, true);
  }

  if (!clarification) {
    return errorResponse("not_found", "Clarification not found", 404, false);
  }

  if (clarification.task_id !== task.id) {
    return errorResponse("ownership_mismatch", "Clarification does not belong to task", 409, false);
  }

  if (clarification.status !== "open") {
    return errorResponse("invalid_request", "Clarification is already resolved", 409, false);
  }

  const { data: blockingClarifications, error: blockingError } = await userClient
    .from("clarifications")
    .select("id")
    .eq("user_id", user.id)
    .eq("task_id", task.id)
    .eq("status", "open");

  if (blockingError) {
    return errorResponse("internal_error", "Failed to validate blocking clarifications", 500, true);
  }

  if ((blockingClarifications?.length ?? 0) > 2) {
    return errorResponse(
      "clarification_limit_reached",
      "Too many blocking clarifications are open for this task",
      409,
      false,
    );
  }

  let producedOutputId: string | null = null;

  try {
    const nowIso = new Date().toISOString();

    const { data: updatedClarification, error: clarificationUpdateError } = await userClient
      .from("clarifications")
      .update({
        answer: payload.answer_text,
        status: "answered",
        answered_at: nowIso,
      })
      .eq("id", clarification.id)
      .eq("user_id", user.id)
      .eq("status", "open")
      .select("id,status,answered_at")
      .single<UpdatedClarificationRow>();

    if (clarificationUpdateError || !updatedClarification) {
      throw new Error("Failed to update clarification");
    }

    const { error: clarificationAnsweredEventError } = await userClient.from("task_events").insert({
      user_id: user.id,
      task_id: task.id,
      event_type: "clarification_answered",
      event_message: "Clarification answered",
      event_metadata: { clarification_id: clarification.id },
    });
    if (clarificationAnsweredEventError) {
      throw new Error("Failed to create clarification answered event");
    }

    const billingSource = deriveBillingSource(payload.answer_text, payload.billing_source);
    const uncertain = isNotSureAnswer(payload.answer_text);

    const analysis = billingSource === "app_store"
      ? buildAppStoreCancellationAnalysis()
      : uncertain
      ? buildHelperPathAnalysis()
      : buildGenericAnalysis(payload.answer_text);

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
          source: "answer_clarification",
          deterministic: true,
          model: "rule_based_v1",
          task_analysis: analysis,
        },
      })
      .select("id")
      .single<TaskOutputRow>();

    if (outputError || !output) {
      throw new Error("Failed to save task output");
    }

    producedOutputId = output.id;

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

    const { error: taskUpdatedEventError } = await userClient.from("task_events").insert({
      user_id: user.id,
      task_id: task.id,
      event_type: "task_updated",
      event_message: "Clarification output generated",
      event_metadata: {
        output_id: output.id,
        path: analysis.path,
      },
    });
    if (taskUpdatedEventError) {
      throw new Error("Failed to create task updated event");
    }

    const response: AnswerClarificationSuccessResponse = {
      ok: true,
      response_type: "task_analysis",
      task_id: task.id,
      task_status: "in_progress",
      access_state: accessState,
      clarification: {
        id: updatedClarification.id,
        status: "answered",
        answered_at: updatedClarification.answered_at,
      },
      task_output_id: output.id,
      task_analysis: analysis,
    };

    return jsonResponse(response, 200);
  } catch (error) {
    if (producedOutputId) {
      await userClient
        .from("task_outputs")
        .update({ is_current: false })
        .eq("id", producedOutputId)
        .eq("user_id", user.id);
    }

    await userClient
      .from("tasks")
      .update({ status: "failed" })
      .eq("id", task.id)
      .eq("user_id", user.id);

    await userClient.from("task_events").insert({
      user_id: user.id,
      task_id: task.id,
      event_type: "task_updated",
      event_message: "Clarification processing failed",
      event_metadata: { retryable: true },
    });

    console.error("answer-clarification error", error);
    return errorResponse("processing_failed", "Clarification processing failed. Please retry.", 500, true);
  }
});
