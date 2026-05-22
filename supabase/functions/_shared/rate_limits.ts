export type RateLimitType = "daily_ai_actions" | "regenerate";

export type RateLimitErrorDetails = {
  limit_type: RateLimitType;
  retry_after_seconds: number;
  message: string;
};

type UserClient = any;

const STARTER_DAILY_LIMIT = 10;
const TRIAL_DAILY_LIMIT = 50;
const SUBSCRIBER_DAILY_LIMIT = 100;

export function resolveDailyAiActionLimit(accessState: string): number {
  switch (accessState) {
    case "starter_active":
      return STARTER_DAILY_LIMIT;
    case "trial_active":
      return TRIAL_DAILY_LIMIT;
    case "subscription_active":
    case "subscription_cancelled_active":
    case "grace_period":
      return SUBSCRIBER_DAILY_LIMIT;
    default:
      // Conservative fallback if a new access state is introduced before explicit mapping.
      return STARTER_DAILY_LIMIT;
  }
}

function getUtcDayWindow(now: Date): {
  startIso: string;
  endIso: string;
  retryAfterSeconds: number;
} {
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 0, 0, 0, 0));
  const end = new Date(start.getTime() + 24 * 60 * 60 * 1000);
  const retryAfterSeconds = Math.max(1, Math.ceil((end.getTime() - now.getTime()) / 1000));

  return {
    startIso: start.toISOString(),
    endIso: end.toISOString(),
    retryAfterSeconds,
  };
}

async function countDailyAiActions(params: {
  userClient: UserClient;
  userId: string;
  now: Date;
}): Promise<{ used: number; retryAfterSeconds: number }> {
  const { startIso, endIso, retryAfterSeconds } = getUtcDayWindow(params.now);

  const { count, error } = await params.userClient
    .from("usage_events")
    .select("id", { head: true, count: "exact" })
    .eq("user_id", params.userId)
    .eq("event_category", "ai")
    .gte("created_at", startIso)
    .lt("created_at", endIso);

  if (error) {
    throw new Error("Failed to read daily AI usage");
  }

  return {
    used: count ?? 0,
    retryAfterSeconds,
  };
}

export async function checkDailyAiActionLimit(params: {
  userClient: UserClient;
  userId: string;
  accessState: string;
  now?: Date;
}): Promise<
  | { ok: true; daily_limit: number; used_today: number; remaining_today: number }
  | { ok: false; error: RateLimitErrorDetails; daily_limit: number; used_today: number }
> {
  const now = params.now ?? new Date();
  const dailyLimit = resolveDailyAiActionLimit(params.accessState);
  const usage = await countDailyAiActions({
    userClient: params.userClient,
    userId: params.userId,
    now,
  });

  if (usage.used >= dailyLimit) {
    return {
      ok: false,
      daily_limit: dailyLimit,
      used_today: usage.used,
      error: {
        limit_type: "daily_ai_actions",
        retry_after_seconds: usage.retryAfterSeconds,
        message: `Daily AI action limit reached (${dailyLimit}/day).`,
      },
    };
  }

  return {
    ok: true,
    daily_limit: dailyLimit,
    used_today: usage.used,
    remaining_today: Math.max(dailyLimit - usage.used, 0),
  };
}

export async function checkRegenerateLimit(params: {
  userClient: UserClient;
  userId: string;
  taskId: string;
  outputType: string;
  maxOutputsPerTaskOutputType?: number;
}): Promise<
  | { ok: true; existing_output_count: number }
  | { ok: false; existing_output_count: number; error: RateLimitErrorDetails }
> {
  const maxOutputs = params.maxOutputsPerTaskOutputType ?? 3;

  const { count, error } = await params.userClient
    .from("task_outputs")
    .select("id", { head: true, count: "exact" })
    .eq("user_id", params.userId)
    .eq("task_id", params.taskId)
    .eq("output_type", params.outputType);

  if (error) {
    throw new Error("Failed to read output regeneration usage");
  }

  const existingCount = count ?? 0;

  // First output creation is never blocked by regenerate cap.
  if (existingCount === 0 || existingCount < maxOutputs) {
    return {
      ok: true,
      existing_output_count: existingCount,
    };
  }

  return {
    ok: false,
    existing_output_count: existingCount,
    error: {
      limit_type: "regenerate",
      retry_after_seconds: 0,
      message: `Regenerate limit reached. Maximum ${maxOutputs} outputs for this task and output type.`,
    },
  };
}
