import { corsHeaders } from "../_shared/cors.ts";
import { requireAuthenticatedUser } from "../_shared/auth.ts";

type ReminderStatus = "scheduled" | "sent" | "canceled" | "failed";
type LocalNotificationStatus = "not_scheduled" | "scheduled" | "delivered" | "opened" | "canceled" | "failed";
type ReminderSort = "remind_at_asc" | "remind_at_desc" | "updated_desc";

type LegacyReminderRow = {
  id: string;
  task_id: string | null;
  remind_at: string;
  status: ReminderStatus;
  channel: "push" | "email" | "in_app" | "sms";
  sent_at: string | null;
  created_at: string;
  updated_at: string;
};

type ReminderRow = {
  id: string;
  task_id: string | null;
  remind_at: string;
  ios_notification_id: string | null;
  local_notification_status: LocalNotificationStatus;
  status: ReminderStatus;
  channel: "push" | "email" | "in_app" | "sms";
  sent_at: string | null;
  created_at: string;
  updated_at: string;
};

type GetRemindersResponse =
  | {
    ok: true;
    task_id: string | null;
    status: ReminderStatus | null;
    local_notification_status: LocalNotificationStatus | null;
    sort: ReminderSort;
    pagination: {
      page: number;
      limit: number;
      total_count: number | null;
      has_more: boolean;
    };
    reminders: ReminderRow[];
  }
  | {
    ok: false;
    error: {
      code: "unauthorized" | "invalid_request" | "not_found" | "processing_failed" | "internal_error";
      message: string;
      retryable: boolean;
    };
  };

const DEFAULT_LIMIT = 30;
const MAX_LIMIT = 100;
const MAX_PAGE = 1000;
const FUNCTION_NAME = "get-reminders";
const REMINDERS_SELECT_FULL =
  "id,task_id,remind_at,ios_notification_id,local_notification_status,status,channel,sent_at,created_at,updated_at";
const REMINDERS_SELECT_LEGACY =
  "id,task_id,remind_at,status,channel,sent_at,created_at,updated_at";

const STATUS_SET = new Set<ReminderStatus>(["scheduled", "sent", "canceled", "failed"]);
const LOCAL_STATUS_SET = new Set<LocalNotificationStatus>([
  "not_scheduled",
  "scheduled",
  "delivered",
  "opened",
  "canceled",
  "failed",
]);

function isLikelyUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function parsePositiveInt(value: string | null, fallback: number): number {
  if (!value) return fallback;
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed < 0) return fallback;
  return parsed;
}

function jsonResponse(payload: GetRemindersResponse, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json",
    },
  });
}

function errorResponse(
  code: "unauthorized" | "invalid_request" | "not_found" | "processing_failed" | "internal_error",
  message: string,
  status: number,
  retryable: boolean,
): Response {
  return jsonResponse({ ok: false, error: { code, message, retryable } }, status);
}

function isMissingReminderCompatColumnError(error: {
  code?: string | null;
  message?: string | null;
  details?: string | null;
  hint?: string | null;
} | null): boolean {
  if (!error || error.code !== "42703") return false;

  const context = [error.message, error.details, error.hint]
    .filter((value) => typeof value === "string" && value.trim().length > 0)
    .join(" ")
    .toLowerCase();

  return context.includes("ios_notification_id") || context.includes("local_notification_status");
}

function normalizeLegacyReminderRow(row: LegacyReminderRow): ReminderRow {
  return {
    ...row,
    ios_notification_id: null,
    local_notification_status: "not_scheduled",
  };
}

Deno.serve(async (req) => {
  try {
    if (req.method === "OPTIONS") {
      return new Response("ok", { headers: corsHeaders });
    }

    if (req.method !== "GET") {
      return errorResponse("invalid_request", "Method not allowed", 405, false);
    }

    const auth = await requireAuthenticatedUser(req);
    if ("error" in auth) {
      return errorResponse("unauthorized", auth.error, 401, false);
    }

    const url = new URL(req.url);

    const taskId = url.searchParams.get("task_id");
    if (taskId && !isLikelyUuid(taskId)) {
      return errorResponse("invalid_request", "task_id must be a valid UUID", 400, false);
    }

    const statusParam = url.searchParams.get("status");
    const status = statusParam ? statusParam as ReminderStatus : null;
    if (statusParam && !STATUS_SET.has(status)) {
      return errorResponse("invalid_request", "Invalid reminder status", 400, false);
    }

    const localStatusParam = url.searchParams.get("local_notification_status");
    const localStatus = localStatusParam ? localStatusParam as LocalNotificationStatus : null;
    if (localStatusParam && !LOCAL_STATUS_SET.has(localStatus)) {
      return errorResponse("invalid_request", "Invalid local_notification_status", 400, false);
    }

    const sortParam = url.searchParams.get("sort");
    const sort: ReminderSort =
      sortParam === "remind_at_desc" ? "remind_at_desc" : sortParam === "updated_desc" ? "updated_desc" : "remind_at_asc";
    if (sortParam && sortParam !== "remind_at_asc" && sortParam !== "remind_at_desc" && sortParam !== "updated_desc") {
      return errorResponse("invalid_request", "Invalid sort", 400, false);
    }

    const page = Math.min(parsePositiveInt(url.searchParams.get("page"), 0), MAX_PAGE);
    const requestedLimit = parsePositiveInt(url.searchParams.get("limit"), DEFAULT_LIMIT);
    const limit = Math.min(Math.max(requestedLimit, 1), MAX_LIMIT);
    const from = page * limit;
    const to = from + limit - 1;

    if (taskId) {
      const { data: taskRows, error: taskError } = await auth.userClient
        .from("tasks")
        .select("id")
        .eq("id", taskId)
        .eq("user_id", auth.user.id)
        .limit(1);

      if (taskError) {
        console.error(`[${FUNCTION_NAME}] task ownership check failed`, {
          user_id: auth.user.id,
          task_id: taskId,
          code: taskError.code ?? null,
          message: taskError.message ?? null,
        });
        return errorResponse("processing_failed", "Failed to validate task ownership", 500, true);
      }

      if (!Array.isArray(taskRows) || taskRows.length === 0) {
        return errorResponse("not_found", "Task not found", 404, false);
      }
    }

    let query = auth.userClient
      .from("reminders")
      .select(REMINDERS_SELECT_FULL, {
        count: "exact",
      })
      .eq("user_id", auth.user.id);

    if (taskId) {
      query = query.eq("task_id", taskId);
    }

    if (status) {
      query = query.eq("status", status);
    }

    if (localStatus) {
      query = query.eq("local_notification_status", localStatus);
    }

    if (sort === "remind_at_asc") {
      query = query.order("remind_at", { ascending: true }).order("created_at", { ascending: false });
    } else if (sort === "remind_at_desc") {
      query = query.order("remind_at", { ascending: false }).order("created_at", { ascending: false });
    } else {
      query = query.order("updated_at", { ascending: false });
    }

    const { data, error, count } = await query.range(from, to);
    let reminders = (data ?? []) as ReminderRow[];
    let totalCount = count ?? null;
    let usedLegacyFallback = false;

    if (error && isMissingReminderCompatColumnError(error)) {
      usedLegacyFallback = true;
      console.warn(`[${FUNCTION_NAME}] fallback legacy reminders select`, {
        endpoint: FUNCTION_NAME,
        stage: "fallback_legacy_columns",
        user_id: auth.user.id,
        task_id: taskId,
        status_filter: status,
        local_notification_status_filter: localStatus,
        sort,
        code: error.code ?? null,
        message: error.message ?? null,
      });

      let fallbackQuery = auth.userClient
        .from("reminders")
        .select(REMINDERS_SELECT_LEGACY, {
          count: "exact",
        })
        .eq("user_id", auth.user.id);

      if (taskId) {
        fallbackQuery = fallbackQuery.eq("task_id", taskId);
      }

      if (status) {
        fallbackQuery = fallbackQuery.eq("status", status);
      }

      if (sort === "remind_at_asc") {
        fallbackQuery = fallbackQuery.order("remind_at", { ascending: true }).order("created_at", { ascending: false });
      } else if (sort === "remind_at_desc") {
        fallbackQuery = fallbackQuery.order("remind_at", { ascending: false }).order("created_at", { ascending: false });
      } else {
        fallbackQuery = fallbackQuery.order("updated_at", { ascending: false });
      }

      const { data: fallbackData, error: fallbackError, count: fallbackCount } = await fallbackQuery.range(from, to);

      if (fallbackError) {
        console.error(`[${FUNCTION_NAME}] fallback reminders query failed`, {
          endpoint: FUNCTION_NAME,
          stage: "fallback_query_failed",
          user_id: auth.user.id,
          task_id: taskId,
          status_filter: status,
          local_notification_status_filter: localStatus,
          sort,
          code: fallbackError.code ?? null,
          message: fallbackError.message ?? null,
        });
        return errorResponse("processing_failed", "Failed to load reminders", 500, true);
      }

      const legacyRows = (fallbackData ?? []) as LegacyReminderRow[];
      reminders = legacyRows.map(normalizeLegacyReminderRow);

      if (localStatus) {
        reminders = reminders.filter((row) => row.local_notification_status === localStatus);
      }

      if (!localStatus) {
        totalCount = fallbackCount ?? null;
      } else if (localStatus === "not_scheduled") {
        totalCount = fallbackCount ?? null;
      } else {
        totalCount = 0;
      }
    } else if (error) {
      console.error(`[${FUNCTION_NAME}] reminders query failed`, {
        endpoint: FUNCTION_NAME,
        stage: "primary_query_failed",
        user_id: auth.user.id,
        task_id: taskId,
        status_filter: status,
        local_notification_status_filter: localStatus,
        sort,
        code: error.code ?? null,
        message: error.message ?? null,
      });
      return errorResponse("processing_failed", "Failed to load reminders", 500, true);
    }
    const hasMore = totalCount === null
      ? reminders.length === limit
      : from + reminders.length < totalCount;

    if (usedLegacyFallback) {
      console.warn(`[${FUNCTION_NAME}] legacy fallback applied`, {
        endpoint: FUNCTION_NAME,
        stage: "fallback_applied",
        user_id: auth.user.id,
        task_id: taskId,
        status_filter: status,
        local_notification_status_filter: localStatus,
        sort,
        result_count: reminders.length,
        total_count: totalCount,
      });
    }

    return jsonResponse(
      {
        ok: true,
        task_id: taskId,
        status,
        local_notification_status: localStatus,
        sort,
        pagination: {
          page,
          limit,
          total_count: totalCount,
          has_more: hasMore,
        },
        reminders,
      },
      200,
    );
  } catch (error) {
    console.error(`[${FUNCTION_NAME}] unexpected error`, {
      message: error instanceof Error ? error.message : "Unknown error",
    });
    return errorResponse("internal_error", "Unexpected server error", 500, true);
  }
});
