import { corsHeaders } from "../_shared/cors.ts";
import { createServiceClient, requireAuthenticatedUser } from "../_shared/auth.ts";
import { loadStoreKitAccessState } from "../_shared/subscription_mirroring.ts";
import {
  ANALYZE_TASK_MAX_INPUT_LENGTH,
  ANALYZE_TASK_MIN_INPUT_LENGTH,
  type AnalyzeTaskRequest,
  type AnalyzeTaskResponse,
  type AnalyzeTaskSuccessResponse,
  type ErrorCode,
  type SelectedTemplate,
  type TaskAnalysis,
} from "../_shared/analyze_task_types.ts";
import {
  buildClarificationQuestion,
  deriveTaskTitle,
  detectCancelSubscription,
  normalizeSelectedTemplate,
} from "../_shared/analyze_task_rules.ts";
import {
  AI_TASK_ANALYSIS_JSON_SCHEMA,
  AI_TASK_PROMPT_VERSION,
  AI_TASK_SCHEMA_VERSION,
  type AiTaskAnalysis,
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
    limit_type?: "daily_ai_actions" | "regenerate";
    retry_after_seconds?: number;
  };
};

type ProcessingError = {
  code: ErrorCode;
  message: string;
  retryable: boolean;
};

type AiAnalysisResult = {
  analysis: TaskAnalysis;
  usage: OpenAiUsageDetails;
};

const ANALYZE_FUNCTION_NAME = "analyze-task";

type UserClient = any;
type ServiceClient = any;

function jsonResponse(payload: AnalyzeTaskResponse | JsonError, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json",
    },
  });
}

function errorResponse(
  code: ErrorCode,
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

function processingError(code: ErrorCode, message: string, retryable: boolean): ProcessingError {
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

  return processingError("processing_failed", "Task processing failed. Please retry.", true);
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
  taskId: string | null,
): Promise<void> {
  if (!idem) return;

  await userClient
    .from("analyze_task_idempotency")
    .update({
      processing_status: "failed",
      response_type: "error",
      task_id: taskId,
    })
    .eq("id", idem.id)
    .eq("user_id", idem.user_id);
}

async function markIdempotencyInProgress(
  userClient: UserClient,
  idem: IdempotencyRow,
): Promise<IdempotencyRow> {
  const { data, error } = await userClient
    .from("analyze_task_idempotency")
    .update({ processing_status: "in_progress" })
    .eq("id", idem.id)
    .eq("user_id", idem.user_id)
    .select("id,user_id,idempotency_key,request_fingerprint,task_id,response_type,response_payload,processing_status")
    .single<IdempotencyRow>();

  if (error || !data) {
    throw new Error("Failed to mark idempotency row as in_progress");
  }

  return data;
}

async function setIdempotencyTaskId(
  userClient: UserClient,
  idem: IdempotencyRow | null,
  taskId: string,
): Promise<void> {
  if (!idem) return;

  await userClient
    .from("analyze_task_idempotency")
    .update({ task_id: taskId })
    .eq("id", idem.id)
    .eq("user_id", idem.user_id);
}

async function insertUsageEvent(params: {
  serviceClient: ServiceClient | null;
  userId: string;
  taskId: string;
  selectedTemplate: SelectedTemplate;
  sensitiveCategory: string;
  usage: OpenAiUsageDetails;
}) {
  if (!params.serviceClient) return;

  await params.serviceClient.from("usage_events").insert({
    user_id: params.userId,
    task_id: params.taskId,
    event_name: "ai_task_analysis",
    event_category: "ai",
    event_source: "edge_function",
    quantity: 1,
    properties: {
      function_name: ANALYZE_FUNCTION_NAME,
      model: params.usage.model,
      prompt_version: AI_TASK_PROMPT_VERSION,
      schema_version: AI_TASK_SCHEMA_VERSION,
      prompt_tokens: params.usage.prompt_tokens,
      completion_tokens: params.usage.completion_tokens,
      total_tokens: params.usage.total_tokens,
      cost_usd_estimate: params.usage.cost_usd_estimate,
      selected_template: params.selectedTemplate,
      sensitive_category: params.sensitiveCategory,
      contains_raw_user_content: false,
    },
  });
}

function buildSystemPrompt(selectedTemplate: SelectedTemplate, safetyInstruction: string): string {
  return [
    "You are OneDone backend task analysis assistant.",
    "Return ONLY JSON that matches the provided schema.",
    "Do not include markdown, prose wrappers, or extra keys.",
    "The output should provide a concise, actionable plan with clear checklist items.",
    "OneDone guides users; it does not claim autonomous execution of external actions.",
    `Selected template: ${selectedTemplate ?? "none"}.`,
    safetyInstruction,
  ].join("\n");
}

function buildUserPrompt(payload: AnalyzeTaskRequest, selectedTemplate: SelectedTemplate): string {
  return [
    `Task input: ${payload.input_text}`,
    `Selected template: ${selectedTemplate ?? "none"}`,
    `Billing source: ${payload.billing_source ?? "unknown"}`,
    "Provide practical steps that match the user intent.",
  ].join("\n");
}

async function runAiAnalysis(params: {
  payload: AnalyzeTaskRequest;
  selectedTemplate: SelectedTemplate;
  userId: string;
  taskId: string;
}): Promise<AiAnalysisResult> {
  const sensitiveCategory = detectSensitiveCategory(params.payload.input_text);
  const safetyInstruction = buildSafetyInstruction(sensitiveCategory);

  const aiResult = await callOpenAiStructuredJson({
    systemPrompt: buildSystemPrompt(params.selectedTemplate, safetyInstruction),
    userPrompt: buildUserPrompt(params.payload, params.selectedTemplate),
    schema: AI_TASK_ANALYSIS_JSON_SCHEMA,
    safetyIdentifier: `${ANALYZE_FUNCTION_NAME}:${params.userId}:${params.taskId}`,
    temperature: 0.2,
  });

  if (!aiResult.ok) {
    if (aiResult.code === "configuration_error") {
      throw processingError("internal_error", "AI analysis is not configured for this environment.", false);
    }

    if (aiResult.code === "invalid_json") {
      throw processingError("processing_failed", "AI response was invalid. Please retry.", true);
    }

    throw processingError("processing_failed", aiResult.message || "AI request failed. Please retry.", aiResult.retryable);
  }

  const parsed = parseAiTaskAnalysis(aiResult.content);
  if (!parsed) {
    throw processingError("processing_failed", "AI response could not be validated. Please retry.", true);
  }

  const guarded = applySafetyGuardrails(parsed as AiTaskAnalysis, sensitiveCategory);

  return {
    analysis: guarded,
    usage: aiResult.usage,
  };
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
  const isCancelSubscription = detectCancelSubscription(payload.input_text, selectedTemplate);
  const missingBillingSource = isCancelSubscription && !payload.billing_source?.trim();

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

  const idempotencyKey = req.headers.get("Idempotency-Key")?.trim() ?? "";
  if (idempotencyKey.length > 255) {
    return errorResponse("invalid_request", "Idempotency-Key must be 255 chars or fewer", 400, false);
  }

  const fingerprint = buildRequestFingerprint(payload, selectedTemplate);
  let idemRow: IdempotencyRow | null = null;
  let existingTaskIdForRetry: string | null = null;

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

      try {
        idemRow = await markIdempotencyInProgress(userClient, existingRow);
      } catch {
        return errorResponse("internal_error", "Failed to resume idempotent request", 500, true);
      }

      existingTaskIdForRetry = idemRow.task_id;
    } else {
      idemRow = insertedRow;
    }
  }

  if (!missingBillingSource) {
    let dailyLimitCheck: Awaited<ReturnType<typeof checkDailyAiActionLimit>>;
    try {
      dailyLimitCheck = await checkDailyAiActionLimit({
        userClient,
        userId: user.id,
        accessState,
      });
    } catch {
      await markIdempotencyFailed(userClient, idemRow, existingTaskIdForRetry);
      return errorResponse("internal_error", "Failed to evaluate daily AI usage limits", 500, true);
    }

    if (!dailyLimitCheck.ok) {
      await markIdempotencyFailed(userClient, idemRow, existingTaskIdForRetry);
      return rateLimitedResponse(dailyLimitCheck.error);
    }
  }

  let taskId: string | null = null;
  let producedOutputId: string | null = null;

  let serviceClient: ServiceClient | null = null;
  try {
    serviceClient = createServiceClient();
  } catch {
    serviceClient = null;
  }

  try {
    let task: TaskRow | null = null;
    let regenerateChecked = false;

    if (existingTaskIdForRetry) {
      const { data: existingTask, error: existingTaskError } = await userClient
        .from("tasks")
        .select("id,status")
        .eq("id", existingTaskIdForRetry)
        .eq("user_id", user.id)
        .maybeSingle<TaskRow>();

      if (existingTaskError || !existingTask) {
        throw processingError("processing_failed", "Failed to resume previous task. Please retry.", true);
      }

      task = existingTask;

      if (!missingBillingSource) {
        let regenerateLimitCheck: Awaited<ReturnType<typeof checkRegenerateLimit>>;
        try {
          regenerateLimitCheck = await checkRegenerateLimit({
            userClient,
            userId: user.id,
            taskId: task.id,
            outputType: "analysis",
          });
        } catch {
          throw processingError("internal_error", "Failed to evaluate regenerate limits", true);
        }

        if (!regenerateLimitCheck.ok) {
          await markIdempotencyFailed(userClient, idemRow, task.id);
          return rateLimitedResponse(regenerateLimitCheck.error);
        }

        regenerateChecked = true;
      }

      await userClient.from("checklist_items").delete().eq("task_id", task.id).eq("user_id", user.id);
      await userClient.from("clarifications").delete().eq("task_id", task.id).eq("user_id", user.id).eq("status", "open");

      const { error: retryTaskUpdateError } = await userClient
        .from("tasks")
        .update({
          title: deriveTaskTitle(payload.input_text, selectedTemplate),
          description: payload.input_text,
          status: missingBillingSource ? "needs_clarification" : "in_progress",
          source: "analyze_task",
          current_next_step: null,
          current_output_id: null,
        })
        .eq("id", task.id)
        .eq("user_id", user.id);

      if (retryTaskUpdateError) {
        throw processingError("processing_failed", "Failed to update retry task state.", true);
      }

      await userClient
        .from("task_outputs")
        .update({ is_current: false })
        .eq("task_id", task.id)
        .eq("output_type", "analysis")
        .eq("is_current", true);

      await userClient.from("task_events").insert({
        user_id: user.id,
        task_id: task.id,
        event_type: "task_updated",
        event_message: "Retrying task analysis",
        event_metadata: { idempotency_retry: true },
      });
    } else {
      const taskTitle = deriveTaskTitle(payload.input_text, selectedTemplate);

      const { data: createdTask, error: taskError } = await userClient
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

      if (taskError || !createdTask) {
        throw processingError("processing_failed", "Failed to create task", true);
      }

      task = createdTask;

      const { error: taskCreatedEventError } = await userClient.from("task_events").insert({
        user_id: user.id,
        task_id: task.id,
        event_type: "task_created",
        event_message: "Task created via analyze-task",
        event_metadata: { selected_template: selectedTemplate },
      });

      if (taskCreatedEventError) {
        throw processingError("processing_failed", "Failed to create task event", true);
      }
    }

    taskId = task.id;
    await setIdempotencyTaskId(userClient, idemRow, task.id);

    if (!missingBillingSource && !regenerateChecked) {
      let regenerateLimitCheck: Awaited<ReturnType<typeof checkRegenerateLimit>>;
      try {
        regenerateLimitCheck = await checkRegenerateLimit({
          userClient,
          userId: user.id,
          taskId: task.id,
          outputType: "analysis",
        });
      } catch {
        throw processingError("internal_error", "Failed to evaluate regenerate limits", true);
      }

      if (!regenerateLimitCheck.ok) {
        await markIdempotencyFailed(userClient, idemRow, task.id);
        return rateLimitedResponse(regenerateLimitCheck.error);
      }
    }

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
        throw processingError("processing_failed", "Failed to create clarification", true);
      }

      const { error: clarificationEventError } = await userClient.from("task_events").insert({
        user_id: user.id,
        task_id: task.id,
        event_type: "clarification_requested",
        event_message: "Clarification required before analysis",
        event_metadata: { reason: "missing_billing_source" },
      });

      if (clarificationEventError) {
        throw processingError("processing_failed", "Failed to create clarification event", true);
      }

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

    const ai = await runAiAnalysis({
      payload,
      selectedTemplate,
      userId: user.id,
      taskId: task.id,
    });

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
        prompt_version: AI_TASK_PROMPT_VERSION,
        schema_version: AI_TASK_SCHEMA_VERSION,
        model: ai.usage.model,
        tokens_prompt: ai.usage.prompt_tokens,
        tokens_completion: ai.usage.completion_tokens,
        content: {
          response_type: "task_analysis",
          selected_template: selectedTemplate,
          task_analysis: ai.analysis,
          deterministic: false,
          source: "openai",
          model: ai.usage.model,
          prompt_version: AI_TASK_PROMPT_VERSION,
          schema_version: AI_TASK_SCHEMA_VERSION,
        },
      })
      .select("id")
      .single<TaskOutputRow>();

    if (outputError || !output) {
      throw processingError("processing_failed", "Failed to save task output", true);
    }

    producedOutputId = output.id;

    const checklistRows = ai.analysis.checklist.map((item, index) => ({
      user_id: user.id,
      task_id: task.id,
      content: item.text,
      position: index,
      status: "pending",
    }));

    if (checklistRows.length > 0) {
      const { error: checklistError } = await userClient.from("checklist_items").insert(checklistRows);
      if (checklistError) {
        throw processingError("processing_failed", "Failed to create checklist items", true);
      }
    }

    const { error: taskUpdateError } = await userClient
      .from("tasks")
      .update({
        status: "in_progress",
        current_next_step: ai.analysis.current_next_step,
        current_output_id: output.id,
      })
      .eq("id", task.id)
      .eq("user_id", user.id);

    if (taskUpdateError) {
      throw processingError("processing_failed", "Failed to update task state", true);
    }

    const { error: taskUpdatedEventError } = await userClient.from("task_events").insert({
      user_id: user.id,
      task_id: task.id,
      event_type: "task_updated",
      event_message: "AI analysis created",
      event_metadata: { output_id: output.id, model: ai.usage.model },
    });

    if (taskUpdatedEventError) {
      throw processingError("processing_failed", "Failed to create task updated event", true);
    }

    const sensitiveCategory = detectSensitiveCategory(payload.input_text);
    await insertUsageEvent({
      serviceClient,
      userId: user.id,
      taskId: task.id,
      selectedTemplate,
      sensitiveCategory,
      usage: ai.usage,
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
      task_analysis: ai.analysis,
    };

    await markIdempotencyCompleted(userClient, idemRow, response);

    return jsonResponse(response, 200);
  } catch (error) {
    if (producedOutputId) {
      await userClient
        .from("task_outputs")
        .update({ is_current: false })
        .eq("id", producedOutputId)
        .eq("user_id", user.id);
    }

    if (taskId) {
      await userClient
        .from("tasks")
        .update({ status: "failed" })
        .eq("id", taskId)
        .eq("user_id", user.id);

      await userClient.from("task_events").insert({
        user_id: user.id,
        task_id: taskId,
        event_type: "task_updated",
        event_message: "Task processing failed",
        event_metadata: { retryable: true },
      });
    }

    await markIdempotencyFailed(userClient, idemRow, taskId);

    const failure = readProcessingError(error);
    const status = failure.code === "internal_error" && !failure.retryable ? 503 : 500;
    return errorResponse(failure.code, failure.message, status, failure.retryable);
  }
});
