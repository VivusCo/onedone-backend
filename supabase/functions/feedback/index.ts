import { corsHeaders } from "../_shared/cors.ts";
import { requireAuthenticatedUser } from "../_shared/auth.ts";
import { isLikelyUuid } from "../_shared/privacy_helpers.ts";

type UserClient = any;

type FeedbackType = "general" | "quality" | "accuracy" | "tone" | "other";

type FeedbackRequest = {
  task_id: string;
  output_id?: string | null;
  rating?: number | null;
  feedback_type?: FeedbackType;
  comment?: string | null;
};

type FeedbackErrorCode =
  | "unauthorized"
  | "invalid_request"
  | "not_found"
  | "processing_failed"
  | "internal_error";

type FeedbackResponse =
  | {
    ok: true;
    feedback_id: string;
    task_id: string;
    output_id: string | null;
    rating: number | null;
    feedback_type: FeedbackType;
    comment: string | null;
    created_at: string;
  }
  | {
    ok: false;
    error: {
      code: FeedbackErrorCode;
      message: string;
      retryable: boolean;
    };
  };

type TaskRow = {
  id: string;
};

type OutputRow = {
  id: string;
};

type InsertedFeedbackRow = {
  id: string;
  task_id: string;
  output_id: string | null;
  rating: number | null;
  feedback_type: FeedbackType;
  comment: string | null;
  created_at: string;
};

const ALLOWED_FEEDBACK_TYPES = new Set<FeedbackType>([
  "general",
  "quality",
  "accuracy",
  "tone",
  "other",
]);

function jsonResponse(payload: FeedbackResponse, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json",
    },
  });
}

function errorResponse(
  code: FeedbackErrorCode,
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

function validateRequestBody(raw: unknown): { valid: true; data: FeedbackRequest } | { valid: false; response: Response } {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return {
      valid: false,
      response: errorResponse("invalid_request", "Request body must be a JSON object", 400, false),
    };
  }

  const body = raw as FeedbackRequest;

  if (typeof body.task_id !== "string" || !isLikelyUuid(body.task_id)) {
    return {
      valid: false,
      response: errorResponse("invalid_request", "task_id must be a valid UUID", 400, false),
    };
  }

  if (body.output_id !== undefined && body.output_id !== null) {
    if (typeof body.output_id !== "string" || !isLikelyUuid(body.output_id)) {
      return {
        valid: false,
        response: errorResponse("invalid_request", "output_id must be a valid UUID when provided", 400, false),
      };
    }
  }

  if (body.rating !== undefined && body.rating !== null) {
    if (!Number.isInteger(body.rating) || body.rating < 1 || body.rating > 5) {
      return {
        valid: false,
        response: errorResponse("invalid_request", "rating must be an integer between 1 and 5", 400, false),
      };
    }
  }

  const feedbackType = body.feedback_type ?? "general";
  if (!ALLOWED_FEEDBACK_TYPES.has(feedbackType)) {
    return {
      valid: false,
      response: errorResponse(
        "invalid_request",
        "feedback_type must be one of: general, quality, accuracy, tone, other",
        400,
        false,
      ),
    };
  }

  if (body.comment !== undefined && body.comment !== null && typeof body.comment !== "string") {
    return {
      valid: false,
      response: errorResponse("invalid_request", "comment must be a string when provided", 400, false),
    };
  }

  const comment = body.comment?.trim() ?? null;
  if (comment && comment.length > 5000) {
    return {
      valid: false,
      response: errorResponse("invalid_request", "comment must be 5000 characters or fewer", 400, false),
    };
  }

  if ((body.rating === undefined || body.rating === null) && (comment === null || comment.length === 0)) {
    return {
      valid: false,
      response: errorResponse("invalid_request", "Provide at least rating or comment", 400, false),
    };
  }

  return {
    valid: true,
    data: {
      task_id: body.task_id,
      output_id: body.output_id ?? null,
      rating: body.rating ?? null,
      feedback_type: feedbackType,
      comment,
    },
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

async function ensureOutputOwnership(
  userClient: UserClient,
  userId: string,
  taskId: string,
  outputId: string,
): Promise<boolean> {
  const { data, error } = await userClient
    .from("task_outputs")
    .select("id")
    .eq("id", outputId)
    .eq("task_id", taskId)
    .eq("user_id", userId)
    .maybeSingle<OutputRow>();

  if (error) {
    throw new Error("Failed to read task output");
  }

  return Boolean(data);
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

  try {
    const ownsTask = await ensureTaskOwnership(userClient, user.id, payload.task_id);
    if (!ownsTask) {
      return errorResponse("not_found", "Task not found", 404, false);
    }

    if (payload.output_id) {
      const ownsOutput = await ensureOutputOwnership(userClient, user.id, payload.task_id, payload.output_id);
      if (!ownsOutput) {
        return errorResponse("invalid_request", "output_id does not belong to the task", 400, false);
      }
    }

    const { data: inserted, error: insertError } = await userClient
      .from("task_feedback")
      .insert({
        user_id: user.id,
        task_id: payload.task_id,
        output_id: payload.output_id,
        rating: payload.rating,
        feedback_type: payload.feedback_type,
        comment: payload.comment,
      })
      .select("id,task_id,output_id,rating,feedback_type,comment,created_at")
      .single<InsertedFeedbackRow>();

    if (insertError || !inserted) {
      return errorResponse("processing_failed", "Failed to store feedback", 500, true);
    }

    return jsonResponse(
      {
        ok: true,
        feedback_id: inserted.id,
        task_id: inserted.task_id,
        output_id: inserted.output_id,
        rating: inserted.rating,
        feedback_type: inserted.feedback_type,
        comment: inserted.comment,
        created_at: inserted.created_at,
      },
      200,
    );
  } catch {
    return errorResponse("internal_error", "Unexpected error", 500, true);
  }
});
