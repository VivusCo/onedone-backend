import { corsHeaders } from "../_shared/cors.ts";
import { requireAuthenticatedUser } from "../_shared/auth.ts";
import {
  buildStoreKitAccessStateResponse,
  deriveSubscriptionEventType,
  normalizeMirrorEnvironment,
  normalizeOptionalBoolean,
  normalizeOptionalIso,
  normalizeOptionalString,
  normalizeVerificationMode,
  pickRelevantSubscription,
  sanitizeMetadata,
  type MirrorEnvironment,
  type MirroredEntitlement,
  type MirrorVerificationMode,
  type ProfileAccessRow,
  type SubscriptionEventType,
  type SubscriptionRow,
  type SubscriptionStatus,
} from "../_shared/subscription_mirroring.ts";

type UserClient = any;

type ValidateSubscriptionErrorCode =
  | "unauthorized"
  | "invalid_request"
  | "conflict"
  | "processing_failed"
  | "internal_error";

type AccessStatePayload = {
  access_state: string;
  onboarding_required: boolean;
  onboarding_completed: boolean;
  onboarding_completed_at: string | null;
  starter_started_at: string | null;
  starter_ends_at: string | null;
  starter_days_left: number;
  trial_status: "active" | "expired" | null;
  trial_ends_at: string | null;
  subscription_status: string | null;
  subscription_ends_at: string | null;
  feature_flags: {
    can_use_core_features: boolean;
    limited_mode: boolean;
    show_app_store_trial_gate: boolean;
    can_start_app_store_trial: boolean;
  };
};

type ValidateSubscriptionResponse =
  | {
    ok: true;
    mode: MirrorVerificationMode;
    environment: MirrorEnvironment;
    subscription: {
      id: string;
      product_id: string | null;
      original_transaction_id: string | null;
      status: SubscriptionStatus;
      current_period_end: string | null;
      trial_ends_at: string | null;
      last_verified_at: string | null;
      event_type: SubscriptionEventType;
    };
    access_state: AccessStatePayload;
    todo: {
      apple_server_validation_required_before_public_release: true;
      app_store_server_notifications_required_before_public_release: true;
    };
  }
  | {
    ok: false;
    error: {
      code: ValidateSubscriptionErrorCode;
      message: string;
      retryable: boolean;
    };
  };

type ProcessingError = {
  code: ValidateSubscriptionErrorCode;
  message: string;
  retryable: boolean;
};

const PROFILE_SELECT =
  "onboarding_required,onboarding_completed_at,starter_started_at,starter_ends_at,starter_status";

const SUBSCRIPTION_SELECT =
  "id,user_id,provider,product_id,original_transaction_id,status,current_period_start,current_period_end,trial_started_at,trial_ends_at,cancel_at,canceled_at,last_verified_at,metadata";

const VALIDATE_SUBSCRIPTION_FUNCTION = "validate-subscription";

function jsonResponse(payload: ValidateSubscriptionResponse, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json",
    },
  });
}

function errorResponse(
  code: ValidateSubscriptionErrorCode,
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

function processingError(
  code: ValidateSubscriptionErrorCode,
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

  return processingError("processing_failed", "Subscription validation failed. Please retry.", true);
}

function readRequiredString(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;

  if (trimmed.length > 500) return null;

  return trimmed;
}

function readRequiredIso(raw: unknown, fieldName: string): { ok: true; value: string } | {
  ok: false;
  message: string;
} {
  if (typeof raw !== "string") {
    return {
      ok: false,
      message: `${fieldName} is required and must be a valid ISO-8601 timestamp`,
    };
  }

  const normalized = normalizeOptionalIso(raw);
  if (!normalized) {
    return {
      ok: false,
      message: `${fieldName} is required and must be a valid ISO-8601 timestamp`,
    };
  }

  return {
    ok: true,
    value: normalized,
  };
}

function readOptionalIso(raw: unknown, fieldName: string): { ok: true; value: string | null } | {
  ok: false;
  message: string;
} {
  const normalized = normalizeOptionalIso(raw);

  if (raw === undefined) {
    return { ok: true, value: null };
  }

  if (normalized === undefined) {
    return {
      ok: false,
      message: `${fieldName} must be a valid ISO-8601 timestamp when provided`,
    };
  }

  return {
    ok: true,
    value: normalized,
  };
}

function readOptionalBoolean(raw: unknown, fieldName: string): { ok: true; value: boolean | null } | {
  ok: false;
  message: string;
} {
  const normalized = normalizeOptionalBoolean(raw);

  if (raw === undefined) {
    return { ok: true, value: null };
  }

  if (normalized === undefined) {
    return {
      ok: false,
      message: `${fieldName} must be a boolean when provided`,
    };
  }

  return {
    ok: true,
    value: normalized,
  };
}

function readOptionalString(raw: unknown, fieldName: string): { ok: true; value: string | null } | {
  ok: false;
  message: string;
} {
  const normalized = normalizeOptionalString(raw);

  if (raw === undefined) {
    return { ok: true, value: null };
  }

  if (normalized === undefined) {
    return {
      ok: false,
      message: `${fieldName} must be a non-empty string when provided`,
    };
  }

  if (normalized.length > 500) {
    return {
      ok: false,
      message: `${fieldName} is too long`,
    };
  }

  return {
    ok: true,
    value: normalized,
  };
}

function resolveMirrorEnvironment(params: {
  primaryValue: unknown;
  primarySource: string;
  fallbackValue: unknown;
}): { ok: true; environment: MirrorEnvironment; source: string } | {
  ok: false;
  response: Response;
} {
  let selectedRaw = params.primaryValue;
  let source = params.primarySource;

  const primaryString = typeof params.primaryValue === "string" ? params.primaryValue.trim() : "";
  if (!primaryString) {
    selectedRaw = params.fallbackValue;
    source = "body.environment";
  }

  const selectedString = typeof selectedRaw === "string" ? selectedRaw.trim() : "";
  if (!selectedString) {
    return {
      ok: false,
      response: errorResponse(
        "invalid_request",
        `environment must be one of: xcode, sandbox, testflight (read from ${source})`,
        400,
        false,
      ),
    };
  }

  if (selectedString.toLowerCase() === "production") {
    return {
      ok: false,
      response: errorResponse(
        "invalid_request",
        `production environment mirroring is disabled until server-side Apple validation is implemented (read from ${source})`,
        400,
        false,
      ),
    };
  }

  const environment = normalizeMirrorEnvironment(selectedString);
  if (!environment) {
    return {
      ok: false,
      response: errorResponse(
        "invalid_request",
        `environment must be one of: xcode, sandbox, testflight (read from ${source})`,
        400,
        false,
      ),
    };
  }

  return {
    ok: true,
    environment,
    source,
  };
}

function normalizeIncomingStatus(value: unknown): SubscriptionStatus | null {
  if (typeof value !== "string") return null;

  const normalized = value.trim().toLowerCase();
  if (!normalized) return null;

  if (normalized === "trialing" || normalized === "trial" || normalized === "in_trial") return "trialing";
  if (normalized === "active" || normalized === "subscribed") return "active";
  if (normalized === "grace_period" || normalized === "in_grace_period" || normalized === "billing_retry") {
    return "grace_period";
  }
  if (normalized === "expired") return "expired";
  if (normalized === "canceled" || normalized === "cancelled" || normalized === "revoked") return "canceled";
  if (normalized === "refunded") return "refunded";

  return null;
}

function deriveFallbackStatus(params: {
  expiresAt: string | null;
  revocationDate: string | null;
}): SubscriptionStatus {
  if (params.revocationDate) {
    return "canceled";
  }

  if (params.expiresAt) {
    const expiresAt = new Date(params.expiresAt);
    if (!Number.isNaN(expiresAt.getTime()) && expiresAt.getTime() <= Date.now()) {
      return "expired";
    }
  }

  return "active";
}

function parseEntitlement(raw: unknown, bodyEnvironment: unknown): { valid: true; parsed: {
  entitlement: MirroredEntitlement;
  environment: MirrorEnvironment;
  environmentSource: string;
}; } | {
  valid: false;
  response: Response;
} {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return {
      valid: false,
      response: errorResponse("invalid_request", "entitlement must be a JSON object", 400, false),
    };
  }

  const data = raw as Record<string, unknown>;

  const productId = readRequiredString(data.product_id);
  if (!productId) {
    return {
      valid: false,
      response: errorResponse("invalid_request", "entitlement.product_id is required", 400, false),
    };
  }

  const transactionId = readRequiredString(data.transaction_id);
  if (!transactionId) {
    return {
      valid: false,
      response: errorResponse("invalid_request", "entitlement.transaction_id is required", 400, false),
    };
  }

  const originalTransactionId = readOptionalString(
    data.original_transaction_id,
    "entitlement.original_transaction_id",
  );
  if (!originalTransactionId.ok) {
    return {
      valid: false,
      response: errorResponse("invalid_request", originalTransactionId.message, 400, false),
    };
  }

  const resolvedEnvironment = resolveMirrorEnvironment({
    primaryValue: data.environment,
    primarySource: "entitlement.environment",
    fallbackValue: bodyEnvironment,
  });
  if (!resolvedEnvironment.ok) {
    return {
      valid: false,
      response: resolvedEnvironment.response,
    };
  }

  const purchasedAt = readRequiredIso(data.purchased_at, "entitlement.purchased_at");
  if (!purchasedAt.ok) {
    return {
      valid: false,
      response: errorResponse("invalid_request", purchasedAt.message, 400, false),
    };
  }

  const expiresAt = readOptionalIso(data.expires_at, "entitlement.expires_at");
  if (!expiresAt.ok) {
    return {
      valid: false,
      response: errorResponse("invalid_request", expiresAt.message, 400, false),
    };
  }

  const revocationDate = readOptionalIso(data.revocation_date, "entitlement.revocation_date");
  if (!revocationDate.ok) {
    return {
      valid: false,
      response: errorResponse("invalid_request", revocationDate.message, 400, false),
    };
  }

  const ownershipType = readOptionalString(data.ownership_type, "entitlement.ownership_type");
  if (!ownershipType.ok) {
    return {
      valid: false,
      response: errorResponse("invalid_request", ownershipType.message, 400, false),
    };
  }

  const entitlementStatus = readOptionalString(data.entitlement_status, "entitlement.entitlement_status");
  if (!entitlementStatus.ok) {
    return {
      valid: false,
      response: errorResponse("invalid_request", entitlementStatus.message, 400, false),
    };
  }

  const storekitStatus = readOptionalString(data.storekit_status, "entitlement.storekit_status");
  if (!storekitStatus.ok) {
    return {
      valid: false,
      response: errorResponse("invalid_request", storekitStatus.message, 400, false),
    };
  }

  const source = readOptionalString(data.source, "entitlement.source");
  if (!source.ok) {
    return {
      valid: false,
      response: errorResponse("invalid_request", source.message, 400, false),
    };
  }

  const platform = readOptionalString(data.platform, "entitlement.platform");
  if (!platform.ok) {
    return {
      valid: false,
      response: errorResponse("invalid_request", platform.message, 400, false),
    };
  }

  const willAutoRenew = readOptionalBoolean(data.will_auto_renew, "entitlement.will_auto_renew");
  if (!willAutoRenew.ok) {
    return {
      valid: false,
      response: errorResponse("invalid_request", willAutoRenew.message, 400, false),
    };
  }

  const introOffer = readOptionalBoolean(
    data.is_in_intro_offer_period,
    "entitlement.is_in_intro_offer_period",
  );
  if (!introOffer.ok) {
    return {
      valid: false,
      response: errorResponse("invalid_request", introOffer.message, 400, false),
    };
  }

  const normalizedStatus =
    normalizeIncomingStatus(entitlementStatus.value) ??
    normalizeIncomingStatus(storekitStatus.value) ??
    normalizeIncomingStatus(data.status) ??
    deriveFallbackStatus({
      expiresAt: expiresAt.value,
      revocationDate: revocationDate.value,
    });

  const metadata: Record<string, unknown> = {
    environment: resolvedEnvironment.environment,
    environment_source: resolvedEnvironment.source,
    purchased_at: purchasedAt.value,
    expires_at: expiresAt.value,
    revocation_date: revocationDate.value,
    entitlement_status: entitlementStatus.value,
    storekit_status: storekitStatus.value,
    source: source.value,
    platform: platform.value,
  };

  return {
    valid: true,
    parsed: {
      environment: resolvedEnvironment.environment,
      environmentSource: resolvedEnvironment.source,
      entitlement: {
        original_transaction_id: originalTransactionId.value ?? transactionId,
        transaction_id: transactionId,
        product_id: productId,
        status: normalizedStatus,
        current_period_start: purchasedAt.value,
        current_period_end: expiresAt.value,
        trial_started_at: normalizedStatus === "trialing" ? purchasedAt.value : null,
        trial_ends_at: normalizedStatus === "trialing" ? expiresAt.value : null,
        cancel_at: revocationDate.value,
        canceled_at: revocationDate.value,
        ownership_type: ownershipType.value,
        will_auto_renew: willAutoRenew.value,
        is_in_intro_offer_period: introOffer.value,
        metadata,
      },
    },
  };
}

function parseRequestBody(raw: unknown): { valid: true; parsed: {
  mode: MirrorVerificationMode;
  environment: MirrorEnvironment;
  entitlement: MirroredEntitlement;
  environment_source: string;
}; } | { valid: false; response: Response } {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return {
      valid: false,
      response: errorResponse("invalid_request", "Request body must be a JSON object", 400, false),
    };
  }

  const body = raw as Record<string, unknown>;

  const mode = normalizeVerificationMode(body.verification_mode);
  if (!mode) {
    return {
      valid: false,
      response: errorResponse(
        "invalid_request",
        "verification_mode must be ios_verified_mirror for TestFlight mirroring",
        400,
        false,
      ),
    };
  }

  const parsedEntitlement = parseEntitlement(body.entitlement, body.environment);
  if (!parsedEntitlement.valid) {
    return parsedEntitlement;
  }

  return {
    valid: true,
    parsed: {
      mode,
      environment: parsedEntitlement.parsed.environment,
      entitlement: parsedEntitlement.parsed.entitlement,
      environment_source: parsedEntitlement.parsed.environmentSource,
    },
  };
}

async function loadProfileAccess(userClient: UserClient, userId: string): Promise<ProfileAccessRow> {
  const { data, error } = await userClient
    .from("profiles")
    .select(PROFILE_SELECT)
    .eq("id", userId)
    .maybeSingle<ProfileAccessRow>();

  if (error) {
    throw processingError("processing_failed", "Failed to load profile access state", true);
  }

  if (data) {
    return data;
  }

  return {
    onboarding_required: true,
    onboarding_completed_at: null,
    starter_started_at: null,
    starter_ends_at: null,
    starter_status: "not_started",
  };
}

async function loadUserSubscriptions(userClient: UserClient, userId: string): Promise<SubscriptionRow[]> {
  const { data, error } = await userClient
    .from("subscriptions")
    .select(SUBSCRIPTION_SELECT)
    .eq("user_id", userId)
    .order("last_verified_at", { ascending: false, nullsFirst: false })
    .limit(50)
    .returns<SubscriptionRow[]>();

  if (error) {
    throw processingError("processing_failed", "Failed to load subscriptions", true);
  }

  return data ?? [];
}

async function upsertMirroredSubscription(params: {
  userClient: UserClient;
  userId: string;
  mode: MirrorVerificationMode;
  environment: MirrorEnvironment;
  entitlement: MirroredEntitlement;
}): Promise<{ row: SubscriptionRow; eventType: SubscriptionEventType }> {
  const nowIso = new Date().toISOString();
  const { userClient, userId, mode, environment, entitlement } = params;

  const { data: existing, error: existingError } = await userClient
    .from("subscriptions")
    .select(SUBSCRIPTION_SELECT)
    .eq("user_id", userId)
    .eq("original_transaction_id", entitlement.original_transaction_id)
    .maybeSingle<SubscriptionRow>();

  if (existingError) {
    throw processingError("processing_failed", "Failed to read subscription mirror state", true);
  }

  const mirrorMetadata = {
    mirrored_from_ios: true,
    verification_mode: mode,
    mirrored_environment: environment,
    source_function: VALIDATE_SUBSCRIPTION_FUNCTION,
    transaction_id: entitlement.transaction_id,
    ownership_type: entitlement.ownership_type,
    will_auto_renew: entitlement.will_auto_renew,
    is_in_intro_offer_period: entitlement.is_in_intro_offer_period,
    ...sanitizeMetadata(entitlement.metadata),
  };

  const basePayload = {
    provider: "app_store",
    product_id: entitlement.product_id,
    original_transaction_id: entitlement.original_transaction_id,
    status: entitlement.status,
    current_period_start: entitlement.current_period_start,
    current_period_end: entitlement.current_period_end,
    trial_started_at: entitlement.trial_started_at,
    trial_ends_at: entitlement.trial_ends_at,
    cancel_at: entitlement.cancel_at,
    canceled_at: entitlement.canceled_at,
    last_verified_at: nowIso,
    metadata: mirrorMetadata,
  };

  let row: SubscriptionRow | null = null;
  let eventType: SubscriptionEventType = "status_change";
  const previousStatus: SubscriptionStatus | null = existing?.status ?? null;

  if (existing) {
    const mergedMetadata = {
      ...(existing.metadata ?? {}),
      ...basePayload.metadata,
    };

    const { data: updated, error: updateError } = await userClient
      .from("subscriptions")
      .update({
        ...basePayload,
        metadata: mergedMetadata,
      })
      .eq("id", existing.id)
      .eq("user_id", userId)
      .select(SUBSCRIPTION_SELECT)
      .single<SubscriptionRow>();

    if (updateError || !updated) {
      throw processingError("processing_failed", "Failed to update mirrored subscription", true);
    }

    row = updated;
    eventType = deriveSubscriptionEventType(previousStatus, row.status, false);
  } else {
    const { data: inserted, error: insertError } = await userClient
      .from("subscriptions")
      .insert({
        user_id: userId,
        ...basePayload,
      })
      .select(SUBSCRIPTION_SELECT)
      .single<SubscriptionRow>();

    if (insertError || !inserted) {
      if (insertError?.code === "23505") {
        throw processingError(
          "conflict",
          "Subscription transaction is already linked to another account",
          false,
        );
      }

      throw processingError("processing_failed", "Failed to create mirrored subscription", true);
    }

    row = inserted;
    eventType = deriveSubscriptionEventType(null, row.status, true);
  }

  const eventPayload = {
    verification_mode: mode,
    environment,
    source_function: VALIDATE_SUBSCRIPTION_FUNCTION,
    status_before: previousStatus,
    status_after: row.status,
    product_id: row.product_id,
    original_transaction_id: row.original_transaction_id,
    transaction_id: entitlement.transaction_id,
    mirrored_at: nowIso,
    ownership_type: entitlement.ownership_type,
    purchased_at: entitlement.current_period_start,
    expires_at: entitlement.current_period_end,
    revoked_at: entitlement.canceled_at,
    entitlement_status: entitlement.metadata?.entitlement_status ?? null,
    storekit_status: entitlement.metadata?.storekit_status ?? null,
    source: entitlement.metadata?.source ?? null,
    platform: entitlement.metadata?.platform ?? null,
  };

  const { error: eventError } = await userClient.from("subscription_events").insert({
    subscription_id: row.id,
    user_id: userId,
    event_type: eventType,
    event_source: "storekit",
    event_at: nowIso,
    payload: eventPayload,
  });

  if (eventError) {
    throw processingError("processing_failed", "Failed to create subscription event", true);
  }

  return { row, eventType };
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

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return errorResponse("invalid_request", "Invalid JSON body", 400, false);
  }

  const parsedRequest = parseRequestBody(body);
  if (!parsedRequest.valid) {
    return parsedRequest.response;
  }

  try {
    // TODO(Production): Replace iOS-verified mirroring with server-side Apple validation
    // using signed transactions and App Store Server API before public release.
    const mirrored = await upsertMirroredSubscription({
      userClient: authResult.userClient,
      userId: authResult.user.id,
      mode: parsedRequest.parsed.mode,
      environment: parsedRequest.parsed.environment,
      entitlement: parsedRequest.parsed.entitlement,
    });

    const profile = await loadProfileAccess(authResult.userClient, authResult.user.id);
    const subscriptions = await loadUserSubscriptions(authResult.userClient, authResult.user.id);
    const relevantSubscription = pickRelevantSubscription(subscriptions) ?? mirrored.row;

    const accessState = buildStoreKitAccessStateResponse(profile, relevantSubscription);

    return jsonResponse(
      {
        ok: true,
        mode: parsedRequest.parsed.mode,
        environment: parsedRequest.parsed.environment,
        subscription: {
          id: mirrored.row.id,
          product_id: mirrored.row.product_id,
          original_transaction_id: mirrored.row.original_transaction_id,
          status: mirrored.row.status,
          current_period_end: mirrored.row.current_period_end,
          trial_ends_at: mirrored.row.trial_ends_at,
          last_verified_at: mirrored.row.last_verified_at,
          event_type: mirrored.eventType,
        },
        access_state: accessState,
        todo: {
          apple_server_validation_required_before_public_release: true,
          // TODO(Production): Add App Store Server Notifications endpoint and reconciliation jobs.
          app_store_server_notifications_required_before_public_release: true,
        },
      },
      200,
    );
  } catch (error) {
    const parsed = readProcessingError(error);

    if (parsed.code === "conflict") {
      return errorResponse(parsed.code, parsed.message, 409, parsed.retryable);
    }

    return errorResponse(parsed.code, parsed.message, 500, parsed.retryable);
  }
});
