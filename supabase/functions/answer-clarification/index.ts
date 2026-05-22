import { corsHeaders } from "../_shared/cors.ts";
import { createServiceClient, requireAuthenticatedUser } from "../_shared/auth.ts";
import { loadStoreKitAccessState } from "../_shared/subscription_mirroring.ts";
import {
  ANSWER_CLARIFICATION_MAX_LENGTH,
  ANSWER_CLARIFICATION_MIN_LENGTH,
  type AnswerClarificationAnalysis,
  type AnswerClarificationErrorCode,
  type AnswerClarificationRequest,
  type AnswerClarificationResponse,
  type AnswerClarificationSuccessResponse,
} from "../_shared/answer_clarification_types.ts";
import {
  buildAppStoreCancellationAnalysis,
  buildHelperPathAnalysis,
  deriveBillingSource,
  isNotSureAnswer,
} from "../_shared/answer_clarification_rules.ts";
import {
  AI_TASK_ANALYSIS_JSON_SCHEMA,
  AI_TASK_PROMPT_VERSION,
  AI_TASK_SCHEMA_VERSION,
  parseAiTaskAnalysis,
} from "../_shared/ai_task_analysis_schema.ts";
import {
  applySafetyGuardrails,
  buildSafetyInstruction,
  detectSensitiveCategory,
} from "../_shared/ai_safety.ts";
import {
  callOpenAiStructuredJson,
  type OpenAiUsageDetails,
} from "../_shared/openai_client.ts";
import {
  checkDailyAiActionLimit,
  checkRegenerateLimit,
  type RateLimitErrorDetails,
} from "../_shared/rate_limits.ts";

type UserClient = any;
type ServiceClient = any;

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
    limit_type?: "daily_ai_actions" | "regenerate";
    retry_after_seconds?: number;
  };
};

type ProcessingError = {
  code: AnswerClarificationErrorCode;
  message: string;
  retryable: boolean;
};

type AiClarificationResult = {
  analysis: AnswerClarificationAnalysis;
  usage: OpenAiUsageDetails;
};

const FUNCTION_NAME = "answer-clarification";

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
  rateLimit?: RateLimitErrorDetails,
): Response {
  const errorBody: JsonError["error"] = {
    code,
    message,
    retryable,
  };

  if (rateLimit) {
    errorBody.limit_type = rateLimit.limit_type;
    errorBody.retry_after_seconds = rateLimit.retry_after_seconds;
  }

  return jsonResponse(
    {
      ok: false,
      error: errorBody,
    },
    status,
  );
}

function rateLimitedResponse(limit: RateLimitErrorDetails): Response {
  return errorResponse("rate_limited", limit.message, 429, false, limit);
}

function makeProcessingError(
  code: AnswerClarificationErrorCode,
  message: string,
  retryable: boolean,
): ProcessingError {
  return { code, message, retryable };
}

function readProcessingError(error: unknown): ProcessingError {
  if (
    error &&
    typeof error === "object" &&
    "code" in error &&
    "message" in error &&
    "retryable" in error
  ) {
    const candidate = error as ProcessingError;
    if (
      typeof candidate.code === "string" &&
      typeof candidate.message === "string" &&
      typeof candidate.retryable === "boolean"
    ) {
      return candidate;
    }
  }

  return makeProcessingError("processing_failed", "Clarification processing failed. Please retry.", true);
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

function buildSystemPrompt(safetyInstruction: string): string {
  return [
    "You are OneDone backend clarification assistant.",
    "Return ONLY JSON matching the provided schema.",
    "Do not include markdown or explanatory wrappers.",
    "Produce concise and actionable steps.",
    "Do not claim OneDone completed external actions.",
    safetyInstruction,
  ].join("\n");
}

function buildUserPrompt(answerText: string, billingSource: string | null): string {
  return [
    `Clarification answer: ${answerText}`,
    `Billing source hint: ${billingSource ?? "unknown"}`,
    "Create the next practical task analysis update.",
  ].join("\n");
}

async function runAiClarificationAnalysis(params: {
  answerText: string;
  billingSource: string | null;
  userId: string;
  taskId: string;
}): Promise<AiClarificationResult> {
  const sensitiveCategory = detectSensitiveCategory(params.answerText);
  const safetyInstruction = buildSafetyInstruction(sensitiveCategory);

  const aiResult = await callOpenAiStructuredJson({
    systemPrompt: buildSystemPrompt(safetyInstruction),
    userPrompt: buildUserPrompt(params.answerText, params.billingSource),
    schema: AI_TASK_ANALYSIS_JSON_SCHEMA,
    safetyIdentifier: `${FUNCTION_NAME}:${params.userId}:${params.taskId}`,
    temperature: 0.2,
  });

  if (!aiResult.ok) {
    if (aiResult.code === "configuration_error") {
      throw makeProcessingError("internal_error", "AI analysis is not configured for this environment.", false);
    }

    if (aiResult.code === "invalid_json") {
      throw makeProcessingError("processing_failed", "AI response was invalid. Please retry.", true);
    }

    throw makeProcessingError("processing_failed", aiResult.message || "AI request failed. Please retry.", aiResult.retryable);
  }

  const parsed = parseAiTaskAnalysis(aiResult.content);
  if (!parsed) {
    throw makeProcessingError("processing_failed", "AI response could not be validated. Please retry.", true);
  }

  const guarded = applySafetyGuardrails(parsed, sensitiveCategory);
  const analysis: AnswerClarificationAnalysis = {
    title: guarded.title,
    summary: guarded.summary,
    current_next_step: guarded.current_next_step,
    checklist: guarded.checklist,
    safety_note: guarded.safety_note,
    risk_level: guarded.risk_level,
    assumptions: guarded.assumptions,
    missing_information: guarded.missing_information,
    path: "generic",
    autonomous_action: false,
  };

  return {
    analysis,
    usage: aiResult.usage,
  };
}

async function insertUsageEvent(params: {
  serviceClient: ServiceClient | null;
  userId: string;
  taskId: string;
  usage: OpenAiUsageDetails;
  path: "generic" | "app_store_cancellation" | "helper";
  sensitiveCategory: string;
}) {
  if (!params.serviceClient) return;

  await params.serviceClient.from("usage_events").insert({
    user_id: params.userId,
    task_id: params.taskId,
    event_name: "ai_answer_clarification",
    event_category: "ai",
    event_source: "edge_function",
    quantity: 1,
    properties: {
      function_name: FUNCTION_NAME,
      model: params.usage.model,
      prompt_version: AI_TASK_PROMPT_VERSION,
      schema_version: AI_TASK_SCHEMA_VERSION,
      prompt_tokens: params.usage.prompt_tokens,
      completion_tokens: params.usage.completion_tokens,
      total_tokens: params.usage.total_tokens,
      cost_usd_estimate: params.usage.cost_usd_estimate,
      path: params.path,
      sensitive_category: params.sensitiveCategory,
      contains_raw_user_content: false,
    },
  });
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

  let accessStatePayload;
  try {
    accessStatePayload = await loadStoreKitAccessState(userClient, user.id);
  } catch {
    return errorResponse("internal_error", "Failed to evaluate access state", 500, true);
  }

  const accessState = accessStatePayload.access_state;

  if (!accessStatePayload.feature_flags.can_use_core_features) {
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

  const billingSource = deriveBillingSource(payload.answer_text, payload.billing_source);
  const uncertain = isNotSureAnswer(payload.answer_text);
  const shouldRunAi = billingSource !== "app_store" && !uncertain;

  if (shouldRunAi) {
    let dailyLimitCheck: Awaited<ReturnType<typeof checkDailyAiActionLimit>>;
    try {
      dailyLimitCheck = await checkDailyAiActionLimit({
        userClient,
        userId: user.id,
        accessState,
      });
    } catch {
      return errorResponse("internal_error", "Failed to evaluate daily AI usage limits", 500, true);
    }

    if (!dailyLimitCheck.ok) {
      return rateLimitedResponse(dailyLimitCheck.error);
    }
  }

  let regenerateLimitCheck: Awaited<ReturnType<typeof checkRegenerateLimit>>;
  try {
    regenerateLimitCheck = await checkRegenerateLimit({
      userClient,
      userId: user.id,
      taskId: task.id,
      outputType: "analysis",
    });
  } catch {
    return errorResponse("internal_error", "Failed to evaluate regenerate limits", 500, true);
  }

  if (!regenerateLimitCheck.ok) {
    return rateLimitedResponse(regenerateLimitCheck.error);
  }

  let producedOutputId: string | null = null;

  let serviceClient: ServiceClient | null = null;
  try {
    serviceClient = createServiceClient();
  } catch {
    serviceClient = null;
  }

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
      throw makeProcessingError("processing_failed", "Failed to update clarification", true);
    }

    const { error: clarificationAnsweredEventError } = await userClient.from("task_events").insert({
      user_id: user.id,
      task_id: task.id,
      event_type: "clarification_answered",
      event_message: "Clarification answered",
      event_metadata: { clarification_id: clarification.id },
    });
    if (clarificationAnsweredEventError) {
      throw makeProcessingError("processing_failed", "Failed to create clarification answered event", true);
    }

    let analysis: AnswerClarificationAnalysis;
    let outputModel = "rule_based_v1";
    let usage: OpenAiUsageDetails | null = null;
    let promptVersion = "be08_rule_based_clarification_v1";
    let schemaVersion = AI_TASK_SCHEMA_VERSION;

    if (billingSource === "app_store") {
      analysis = buildAppStoreCancellationAnalysis();
    } else if (uncertain) {
      analysis = buildHelperPathAnalysis();
    } else {
      const ai = await runAiClarificationAnalysis({
        answerText: payload.answer_text,
        billingSource,
        userId: user.id,
        taskId: task.id,
      });
      analysis = ai.analysis;
      outputModel = ai.usage.model;
      usage = ai.usage;
      promptVersion = AI_TASK_PROMPT_VERSION;
      schemaVersion = AI_TASK_SCHEMA_VERSION;
    }

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
        prompt_version: promptVersion,
        schema_version: schemaVersion,
        model: outputModel,
        tokens_prompt: usage?.prompt_tokens ?? null,
        tokens_completion: usage?.completion_tokens ?? null,
        content: {
          response_type: "task_analysis",
          source: usage ? "openai" : "answer_clarification",
          deterministic: !usage,
          model: outputModel,
          prompt_version: promptVersion,
          schema_version: schemaVersion,
          task_analysis: analysis,
        },
      })
      .select("id")
      .single<TaskOutputRow>();

    if (outputError || !output) {
      throw makeProcessingError("processing_failed", "Failed to save task output", true);
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
        throw makeProcessingError("processing_failed", "Failed to create checklist items", true);
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
      throw makeProcessingError("processing_failed", "Failed to update task state", true);
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
      throw makeProcessingError("processing_failed", "Failed to create task updated event", true);
    }

    if (usage) {
      await insertUsageEvent({
        serviceClient,
        userId: user.id,
        taskId: task.id,
        usage,
        path: analysis.path,
        sensitiveCategory: detectSensitiveCategory(payload.answer_text),
      });
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

    const failure = readProcessingError(error);
    const status = failure.code === "internal_error" && !failure.retryable ? 503 : 500;
    return errorResponse(failure.code, failure.message, status, failure.retryable);
  }
});
