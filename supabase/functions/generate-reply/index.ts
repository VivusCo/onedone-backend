import { corsHeaders } from "../_shared/cors.ts";
import { buildAccessStateResponse } from "../_shared/access_state.ts";
import { createServiceClient, requireAuthenticatedUser } from "../_shared/auth.ts";
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

type ProfileAccessRow = {
  onboarding_required: boolean | null;
  onboarding_completed_at: string | null;
  starter_started_at: string | null;
  starter_ends_at: string | null;
  starter_status: string | null;
};

type TaskRow = {
  id: string;
  title: string;
  description: string | null;
  status: string;
  current_next_step: string | null;
};

type TaskOutputRow = {
  id: string;
};

type GenerateReplyTone = "polite" | "firmer" | "shorter";
type ReplyLanguage = "auto" | "English" | "Russian" | "Ukrainian" | "Romanian";
type ResolvedReplyLanguage = "English" | "Russian" | "Ukrainian" | "Romanian";

type GenerateReplyRequest = {
  task_id: string;
  tone?: GenerateReplyTone;
  language?: ReplyLanguage;
};

type GenerateReplyErrorCode =
  | "unauthorized"
  | "access_blocked"
  | "rate_limited"
  | "invalid_request"
  | "not_found"
  | "processing_failed"
  | "internal_error";

type GenerateReplyErrorResponse = {
  ok: false;
  error: {
    code: GenerateReplyErrorCode;
    message: string;
    retryable: boolean;
    limit_type?: "daily_ai_actions" | "regenerate";
    retry_after_seconds?: number;
  };
};

type GenerateReplySuccessResponse = {
  ok: true;
  task_id: string;
  task_output_id: string;
  output_type: "draft_reply";
  output_version: number;
  tone: GenerateReplyTone;
  language: ResolvedReplyLanguage;
  draft_reply: string;
  access_state: string;
};

type GenerateReplyResponse = GenerateReplySuccessResponse | GenerateReplyErrorResponse;

type DraftReplyResult = {
  reply_text: string;
  language: ResolvedReplyLanguage;
  tone_applied: GenerateReplyTone;
  safety_note: string | null;
};

type ProcessingError = {
  code: GenerateReplyErrorCode;
  message: string;
  retryable: boolean;
};

type JsonError = {
  error: {
    code: GenerateReplyErrorCode;
    message: string;
    retryable: boolean;
    limit_type?: "daily_ai_actions" | "regenerate";
    retry_after_seconds?: number;
  };
};

const PROFILE_SELECT =
  "onboarding_required,onboarding_completed_at,starter_started_at,starter_ends_at,starter_status";

const GENERATE_REPLY_PROMPT_VERSION = "be09_generate_reply_v1";
const GENERATE_REPLY_SCHEMA_VERSION = "generate_reply_schema_v1";

const DRAFT_REPLY_JSON_SCHEMA = {
  name: "onedone_generate_reply_v1",
  strict: true,
  schema: {
    type: "object",
    additionalProperties: false,
    properties: {
      reply_text: { type: "string" },
      language: { type: "string", enum: ["English", "Russian", "Ukrainian", "Romanian"] },
      tone_applied: { type: "string", enum: ["polite", "firmer", "shorter"] },
      safety_note: { type: ["string", "null"] },
    },
    required: ["reply_text", "language", "tone_applied", "safety_note"],
  },
} as const;

function jsonResponse(payload: GenerateReplyResponse | JsonError, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json",
    },
  });
}

function errorResponse(
  code: GenerateReplyErrorCode,
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

function processingError(code: GenerateReplyErrorCode, message: string, retryable: boolean): ProcessingError {
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

  return processingError("processing_failed", "Reply generation failed. Please retry.", true);
}

function isLikelyUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function normalizeTone(value: unknown): GenerateReplyTone | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim().toLowerCase();
  if (normalized === "polite" || normalized === "firmer" || normalized === "shorter") {
    return normalized;
  }
  return null;
}

function normalizeLanguage(value: unknown): ReplyLanguage | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim().toLowerCase();
  if (normalized === "auto") return "auto";
  if (normalized === "english") return "English";
  if (normalized === "russian") return "Russian";
  if (normalized === "ukrainian") return "Ukrainian";
  if (normalized === "romanian") return "Romanian";
  return null;
}

function validateRequestBody(
  raw: unknown,
): { valid: true; data: { taskId: string; tone: GenerateReplyTone; language: ReplyLanguage } } | { valid: false; response: Response } {
  if (!raw || typeof raw !== "object") {
    return {
      valid: false,
      response: errorResponse("invalid_request", "Request body must be a JSON object", 400, false),
    };
  }

  const body = raw as GenerateReplyRequest;

  if (typeof body.task_id !== "string" || !isLikelyUuid(body.task_id)) {
    return {
      valid: false,
      response: errorResponse("invalid_request", "task_id is required and must be a valid UUID", 400, false),
    };
  }

  const tone = body.tone === undefined ? "polite" : normalizeTone(body.tone);
  if (!tone) {
    return {
      valid: false,
      response: errorResponse("invalid_request", "tone must be one of: polite, firmer, shorter", 400, false),
    };
  }

  const language = body.language === undefined ? "auto" : normalizeLanguage(body.language);
  if (!language) {
    return {
      valid: false,
      response: errorResponse(
        "invalid_request",
        "language must be one of: auto, English, Russian, Ukrainian, Romanian",
        400,
        false,
      ),
    };
  }

  return {
    valid: true,
    data: {
      taskId: body.task_id,
      tone,
      language,
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

function toToneInstruction(tone: GenerateReplyTone): string {
  switch (tone) {
    case "polite":
      return "Use a polite, respectful, and cooperative tone.";
    case "firmer":
      return "Use a firmer, clear, and assertive tone while staying professional.";
    case "shorter":
      return "Use a concise and short tone with minimal wording.";
  }
}

function toLanguageInstruction(language: ReplyLanguage): string {
  if (language === "auto") {
    return "Choose the most appropriate language from: English, Russian, Ukrainian, Romanian based on task context.";
  }

  return `Use this language exactly: ${language}.`;
}

function parseDraftReply(rawContent: string): DraftReplyResult | null {
  try {
    const parsed = JSON.parse(rawContent) as Record<string, unknown>;

    if (typeof parsed.reply_text !== "string") return null;
    if (
      parsed.language !== "English" &&
      parsed.language !== "Russian" &&
      parsed.language !== "Ukrainian" &&
      parsed.language !== "Romanian"
    ) {
      return null;
    }

    if (parsed.tone_applied !== "polite" && parsed.tone_applied !== "firmer" && parsed.tone_applied !== "shorter") {
      return null;
    }

    if (!(parsed.safety_note === null || typeof parsed.safety_note === "string")) {
      return null;
    }

    const reply = parsed.reply_text.trim();
    if (!reply) return null;

    return {
      reply_text: reply,
      language: parsed.language,
      tone_applied: parsed.tone_applied,
      safety_note: parsed.safety_note,
    };
  } catch {
    return null;
  }
}

async function callReplyModel(params: {
  task: TaskRow;
  tone: GenerateReplyTone;
  language: ReplyLanguage;
  userId: string;
  taskId: string;
}): Promise<{ draft: DraftReplyResult; usage: OpenAiUsageDetails }> {
  const taskDescription = params.task.description?.trim() ?? "";
  const nextStep = params.task.current_next_step?.trim() ?? "";

  const systemPrompt = [
    "You are OneDone backend reply draft assistant.",
    "Generate a user-editable draft reply only.",
    "Do not claim that OneDone sends messages or takes external actions.",
    "Return only valid JSON matching the schema.",
    toToneInstruction(params.tone),
    toLanguageInstruction(params.language),
  ].join("\n");

  const userPrompt = [
    `Task title: ${params.task.title}`,
    `Task description: ${taskDescription || "(none)"}`,
    `Task status: ${params.task.status}`,
    `Current next step: ${nextStep || "(none)"}`,
    "Draft a reply the user can send manually.",
  ].join("\n");

  const result = await callOpenAiStructuredJson({
    systemPrompt,
    userPrompt,
    schema: DRAFT_REPLY_JSON_SCHEMA,
    safetyIdentifier: `generate-reply:${params.userId}:${params.taskId}`,
    temperature: 0.2,
  });

  if (!result.ok) {
    if (result.code === "configuration_error") {
      throw processingError("internal_error", "Reply generation is not configured for this environment.", false);
    }

    if (result.code === "invalid_json") {
      throw processingError("processing_failed", "AI reply output was invalid. Please retry.", true);
    }

    throw processingError("processing_failed", result.message || "AI reply generation failed.", result.retryable);
  }

  const draft = parseDraftReply(result.content);
  if (!draft) {
    throw processingError("processing_failed", "AI reply output could not be validated. Please retry.", true);
  }

  return {
    draft,
    usage: result.usage,
  };
}

async function getNextReplyVersion(userClient: UserClient, userId: string, taskId: string): Promise<number> {
  const { count, error } = await userClient
    .from("task_outputs")
    .select("id", { head: true, count: "exact" })
    .eq("user_id", userId)
    .eq("task_id", taskId)
    .eq("output_type", "draft_reply");

  if (error) {
    throw processingError("processing_failed", "Failed to calculate reply version.", true);
  }

  return (count ?? 0) + 1;
}

async function insertUsageEvent(params: {
  serviceClient: ServiceClient;
  userId: string;
  taskId: string;
  usage: OpenAiUsageDetails;
  tone: GenerateReplyTone;
  requestedLanguage: ReplyLanguage;
  resolvedLanguage: ResolvedReplyLanguage;
  outputVersion: number;
}): Promise<void> {
  const { error } = await params.serviceClient.from("usage_events").insert({
    user_id: params.userId,
    task_id: params.taskId,
    event_name: "ai_generate_reply",
    event_category: "ai",
    event_source: "edge_function",
    quantity: 1,
    properties: {
      function_name: "generate-reply",
      output_type: "draft_reply",
      output_version: params.outputVersion,
      model: params.usage.model,
      prompt_version: GENERATE_REPLY_PROMPT_VERSION,
      schema_version: GENERATE_REPLY_SCHEMA_VERSION,
      prompt_tokens: params.usage.prompt_tokens,
      completion_tokens: params.usage.completion_tokens,
      total_tokens: params.usage.total_tokens,
      cost_usd_estimate: params.usage.cost_usd_estimate,
      tone: params.tone,
      requested_language: params.requestedLanguage,
      resolved_language: params.resolvedLanguage,
      contains_raw_user_content: false,
    },
  });

  if (error) {
    throw processingError("processing_failed", "Failed to track usage event.", true);
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

  const { data: task, error: taskError } = await userClient
    .from("tasks")
    .select("id,title,description,status,current_next_step")
    .eq("id", payload.taskId)
    .eq("user_id", user.id)
    .maybeSingle<TaskRow>();

  if (taskError) {
    return errorResponse("internal_error", "Failed to read task", 500, true);
  }

  if (!task) {
    return errorResponse("not_found", "Task not found", 404, false);
  }

  let regenerateLimitCheck: Awaited<ReturnType<typeof checkRegenerateLimit>>;
  try {
    regenerateLimitCheck = await checkRegenerateLimit({
      userClient,
      userId: user.id,
      taskId: task.id,
      outputType: "draft_reply",
    });
  } catch {
    return errorResponse("internal_error", "Failed to evaluate regenerate limits", 500, true);
  }

  if (!regenerateLimitCheck.ok) {
    return rateLimitedResponse(regenerateLimitCheck.error);
  }

  let serviceClient: ServiceClient;
  try {
    serviceClient = createServiceClient();
  } catch {
    return errorResponse("internal_error", "Usage tracking service is not configured.", 500, false);
  }

  let createdOutputId: string | null = null;

  try {
    const nextVersion = await getNextReplyVersion(userClient, user.id, task.id);

    const ai = await callReplyModel({
      task,
      tone: payload.tone,
      language: payload.language,
      userId: user.id,
      taskId: task.id,
    });

    await userClient
      .from("task_outputs")
      .update({ is_current: false })
      .eq("task_id", task.id)
      .eq("user_id", user.id)
      .eq("output_type", "draft_reply")
      .eq("is_current", true);

    const { data: output, error: outputError } = await userClient
      .from("task_outputs")
      .insert({
        user_id: user.id,
        task_id: task.id,
        output_type: "draft_reply",
        is_current: true,
        prompt_version: GENERATE_REPLY_PROMPT_VERSION,
        schema_version: GENERATE_REPLY_SCHEMA_VERSION,
        model: ai.usage.model,
        tokens_prompt: ai.usage.prompt_tokens,
        tokens_completion: ai.usage.completion_tokens,
        content: {
          response_type: "draft_reply",
          source: "openai",
          model: ai.usage.model,
          prompt_version: GENERATE_REPLY_PROMPT_VERSION,
          schema_version: GENERATE_REPLY_SCHEMA_VERSION,
          output_version: nextVersion,
          tone: payload.tone,
          requested_language: payload.language,
          resolved_language: ai.draft.language,
          safety_note: ai.draft.safety_note,
          draft_reply: ai.draft.reply_text,
        },
      })
      .select("id")
      .single<TaskOutputRow>();

    if (outputError || !output) {
      throw processingError("processing_failed", "Failed to save draft reply output.", true);
    }

    createdOutputId = output.id;

    const { error: eventError } = await userClient.from("task_events").insert({
      user_id: user.id,
      task_id: task.id,
      event_type: "reply_generated",
      event_message: "Draft reply generated",
      event_metadata: {
        output_id: output.id,
        output_type: "draft_reply",
        output_version: nextVersion,
        tone: payload.tone,
        language: ai.draft.language,
      },
    });

    if (eventError) {
      throw processingError("processing_failed", "Failed to create reply event.", true);
    }

    await insertUsageEvent({
      serviceClient,
      userId: user.id,
      taskId: task.id,
      usage: ai.usage,
      tone: payload.tone,
      requestedLanguage: payload.language,
      resolvedLanguage: ai.draft.language,
      outputVersion: nextVersion,
    });

    const response: GenerateReplySuccessResponse = {
      ok: true,
      task_id: task.id,
      task_output_id: output.id,
      output_type: "draft_reply",
      output_version: nextVersion,
      tone: payload.tone,
      language: ai.draft.language,
      draft_reply: ai.draft.reply_text,
      access_state: accessState,
    };

    return jsonResponse(response, 200);
  } catch (error) {
    if (createdOutputId) {
      await userClient
        .from("task_outputs")
        .update({ is_current: false })
        .eq("id", createdOutputId)
        .eq("user_id", user.id);
    }

    const failure = readProcessingError(error);
    const status = failure.code === "internal_error" && !failure.retryable ? 503 : 500;
    return errorResponse(failure.code, failure.message, status, failure.retryable);
  }
});
