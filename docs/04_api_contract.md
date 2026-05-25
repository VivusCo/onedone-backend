# OneDone — API Contract

This contract reflects the current implemented MVP integration between iOS and Supabase Edge Functions.

## 1. Integration Rules

- iOS authenticates users with Supabase Auth (email/password) via Supabase Auth REST endpoints.
- iOS calls Supabase Edge Functions for OneDone product APIs.
- iOS never calls OpenAI directly.
- OpenAI keys are backend-only secrets.

## 2. Request Conventions

- Base path: `.../functions/v1/<endpoint>`
- Auth: `Authorization: Bearer <access_token>` for authenticated endpoints.
- Content type: `application/json`.
- Idempotency: `Idempotency-Key` header used on task-creation/generation mutation flows where supported.

## 3. Access and Onboarding Endpoints

- `POST /complete-onboarding`
- `GET /get-access-state`

## 4. AI Task Loop Endpoints

- `POST /analyze-task`
- `POST /answer-clarification`
- `POST /generate-reply`

## 5. Task Read Endpoints

- `GET /list-tasks`
- `GET /get-task-detail?task_id=<uuid>`
- `GET /get-task-outputs?task_id=<uuid>`
- `GET /get-task-events?task_id=<uuid>`
- `GET /get-checklist-items?task_id=<uuid>`
- `GET /get-reminders?task_id=<uuid>`

## 6. Task Action Endpoints

- `POST /update-task-status`
- `POST /message-marked-sent`

## 7. Reminder Action Endpoints

- `POST /reminder-create`
- `POST /reminder-update`
- `POST /reminder-cancel`
- `POST /reminder-snooze`

## 8. Subscription Sync Endpoints

- `POST /validate-subscription`
- `POST /restore-purchases`

### 8.1 `validate-subscription` request payload

```json
{
  "verification_mode": "ios_verified_mirror",
  "entitlement": {
    "product_id": "com.example.onedone.subscription",
    "transaction_id": "1234567890",
    "original_transaction_id": "1234567890",
    "environment": "xcode",
    "purchased_at": "2026-01-01T12:00:00Z",
    "expires_at": "2026-01-15T12:00:00Z",
    "ownership_type": "purchased",
    "revocation_date": null,
    "entitlement_status": "active",
    "storekit_status": "active",
    "source": "app_store",
    "platform": "ios"
  }
}
```

### 8.2 `restore-purchases` request payload

```json
{
  "verification_mode": "ios_verified_mirror",
  "entitlements": [
    {
      "product_id": "com.example.onedone.subscription",
      "transaction_id": "1234567890",
      "original_transaction_id": "1234567890",
      "environment": "sandbox",
      "purchased_at": "2026-01-01T12:00:00Z",
      "expires_at": "2026-01-15T12:00:00Z",
      "ownership_type": "purchased",
      "revocation_date": null,
      "entitlement_status": "active",
      "storekit_status": "active",
      "source": "app_store",
      "platform": "ios"
    }
  ]
}
```

### 8.3 Accepted subscription environment values

- `xcode`
- `sandbox`
- `testflight`

## 9. Other Implemented Endpoints

- `POST /feedback`
- `POST /delete-task`
- `POST /delete-all-data`
- `POST /delete-account`

## 10. Common Error Shape

Most implemented endpoints return errors as:

```json
{
  "ok": false,
  "error": {
    "code": "invalid_request",
    "message": "Human-readable error message.",
    "retryable": false
  }
}
```

### 10.1 `rate_limited` error shape

```json
{
  "ok": false,
  "error": {
    "code": "rate_limited",
    "message": "Daily AI action limit reached (10/day).",
    "retryable": false,
    "limit_type": "daily_ai_actions",
    "retry_after_seconds": 3600
  }
}
```

Possible `limit_type` values:
- `daily_ai_actions`
- `regenerate`

## 11. Implemented/Deferred Boundary

Implemented now:
- Access-state routing contract.
- AI task analysis/clarification/reply loop.
- Task read/action endpoints.
- Reminder sync endpoints.
- Subscription mirror contract for iOS verified entitlements.

Deferred:
- Full Apple Server API subscription validation.
- App Store Server Notifications ingestion/reconciliation.
- Attachment/OCR API surface for iOS uploads.
