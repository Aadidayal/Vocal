# API Contract

Base path: `/api/v1`. JSON uses UTF-8. Private routes require the
authenticated server-side session cookie. All state-changing requests
require CSRF protection. Responses include `X-Request-Id`. Retryable
mutations use `Idempotency-Key`. IDs are opaque strings. Instants are
ISO-8601 UTC; DATE values are `YYYY-MM-DD` plus explicit precision.

## Common conventions

### Errors

``` json
{
  "error": {
    "code": "VERSION_CONFLICT",
    "message": "The resource has changed. Refresh and try again.",
    "details": [],
    "requestId": "req_..."
  }
}
```

Codes: VALIDATION_ERROR (400), UNAUTHENTICATED (401), FORBIDDEN (403),
NOT_FOUND (404), CONFLICT / VERSION_CONFLICT / IDEMPOTENCY_KEY_REUSED /
CONFIRMATION_INVALID (409), RATE_LIMITED (429), DEPENDENCY_UNAVAILABLE
(503), INTERNAL_ERROR (500). Never disclose another user's resource
existence. Details are safe and field-scoped.

### Pagination

List endpoints accept `limit` (default 20, max 100), opaque `cursor` and
endpoint-allowlisted `sort`. Return `{items,page:{nextCursor,hasMore}}`.
Task filters: status, priority, dueFrom, dueTo, overdue and q; filters
combine with AND.

### Task response

``` json
{
  "task": {
    "id":"tsk_...",
    "title":"Submit essay",
    "description":null,
    "priority":"MEDIUM",
    "status":"PENDING",
    "due":{"precision":"DATE","date":"2026-11-06","timezone":"Asia/Kolkata"},
    "activeReminder":null,
    "completedAt":null,
    "version":1,
    "createdAt":"2026-11-04T10:00:00Z",
    "updatedAt":"2026-11-04T10:00:00Z",
    "isOverdue":false
  }
}
```

For DATETIME, `due` is
`{precision:"DATETIME",at:"...Z",timezone:"Area/Location"}`. Omit `due`
when absent. `activeReminder` is null or a summary
`{id,scheduledAt,timezone,status,generation}`. Reminder history is
retrieved through reminder endpoints; there is no singular historical
`reminderId` field. `isOverdue` is derived on reads, never stored as a
status.

## Authentication and profile

All routes are rate-limited as appropriate. `GET /auth/csrf` is the CSRF
bootstrap exception and does not mutate domain data.

  -------------------------------------------------------------------------------------------------------------
  Method/path               Auth / CSRF       Request → response                          Rules
  ------------------------- ----------------- ------------------------------------------- ---------------------
  GET `/auth/csrf`          No auth required  → `{csrfToken}` and session cookie as       Initializes anonymous
                                              needed                                      pre-auth session;
                                                                                          token is
                                                                                          session-bound.

  POST `/auth/register`     Pre-auth          `{email,password,preferredName,timezone}` → Valid IANA timezone
                            session + CSRF    `201 {user}`                                required; browser
                                                                                          suggestion
                                                                                          confirmed/edited by
                                                                                          user; creates rotated
                                                                                          session.

  POST `/auth/login`        Pre-auth          `{email,password}` → `{user}`               Generic
                            session + CSRF                                                invalid-credentials
                                                                                          error; rotates
                                                                                          session and CSRF
                                                                                          token.

  GET `/auth/session`       Yes               → `{user,expiresAt}`                        Enforces
                                                                                          idle/absolute expiry;
                                                                                          may renew idle expiry
                                                                                          at most hourly.

  POST `/auth/logout`       Yes + CSRF        `{}` → `204`                                Revokes current
                                                                                          session and clears
                                                                                          cookie.

  POST                      CSRF              `{email}` → generic `202`                   Email-based reset;
  `/auth/password/forgot`                                                                 never reveals account
                                                                                          existence.

  POST                      CSRF              `{token,newPassword}` → `204`               Hashed, expiring,
  `/auth/password/reset`                                                                  single-use token;
                                                                                          revokes all user
                                                                                          sessions.

  GET `/me`                 Yes               → `{user}`                                  Own profile only;
                                                                                          never returns
                                                                                          password/session
                                                                                          secrets.

  PATCH `/me`               Yes + CSRF        allowlisted profile fields + `{version}` →  IANA timezone
                                              `{user}`                                    validation; 409 on
                                                                                          stale version.
  -------------------------------------------------------------------------------------------------------------

Session policy: opaque server-side sessions; only hash stored. Cookie
HttpOnly, Secure over HTTPS, SameSite=Lax, Path=/, no Domain by default.
Idle lifetime 30 days, absolute cap 90 days, renewal at most hourly.
CSRF token is held in client memory and sent as `X-CSRF-Token`; rotate
on login, registration and session renewal. Logout revokes session. TTL
is cleanup only. Password-reset email provider is an open production
selection, not a pending product capability.

## Tasks

  ---------------------------------------------------------------------------------------------------------------------
  Method/path                 Auth / CSRF       Request → response                              Rules
  --------------------------- ----------------- ----------------------------------------------- -----------------------
  GET `/tasks`                Yes               filters + pagination → `{items,page}`           Caller-owned
                                                                                                non-deleted tasks only.

  POST `/tasks`               Yes + CSRF        `{title,description?,priority?,status?,due?}` → Defaults
                                                `201 {task}`                                    MEDIUM/PENDING;
                                                                                                validate due
                                                                                                precision/timezone.
                                                                                                Retryable create
                                                                                                supports idempotency.

  GET `/tasks/:taskId`        Yes               → `{task}`                                      Owner-scoped; deleted
                                                                                                tasks hidden.

  PATCH `/tasks/:taskId`      Yes + CSRF        changed fields + `{version}` → `{task}`         Owner-scoped,
                                                                                                allowlisted fields,
                                                                                                valid transitions;
                                                                                                stale version returns
                                                                                                409.

  POST                        Yes + CSRF        `{version}` → `{task}`                          Desired-state
  `/tasks/:taskId/complete`                                                                     idempotent; sets
                                                                                                COMPLETED/completedAt
                                                                                                and suppresses active
                                                                                                reminder.

  POST                        Yes + CSRF        `{version}` → `{task}`                          Sets PENDING, clears
  `/tasks/:taskId/reopen`                                                                       completedAt; old
                                                                                                reminder is not
                                                                                                reactivated.
  ---------------------------------------------------------------------------------------------------------------------

There is no direct task DELETE endpoint in the public client contract.
All task deletion uses the confirmation workflow below.

## Assistant and conversations

  ----------------------------------------------------------------------------------------------------------------------------------------------------------------
  Method/path                                 Auth / CSRF       Request → response                                                               Rules
  ------------------------------------------- ----------------- -------------------------------------------------------------------------------- -----------------
  POST `/assistant/messages`                  Yes + CSRF        `{conversationId?,text,mode:"text"|"voice_transcript"}` →                        Sole assistant
                                                                `{conversationId,message,reply,intent,taskResults?,actionPlan?,confirmation?}`   submission
                                                                                                                                                 endpoint for text
                                                                                                                                                 and user-reviewed
                                                                                                                                                 transcript. No
                                                                                                                                                 raw audio. Same
                                                                                                                                                 pipeline.
                                                                                                                                                 Idempotency
                                                                                                                                                 supported.

  GET `/conversations`                        Yes               pagination → `{items,page}`                                                      Caller-owned
                                                                                                                                                 only.

  GET                                         Yes               pagination → `{items,page}`                                                      Caller-owned
  `/conversations/:conversationId/messages`                                                                                                      thread, bounded
                                                                                                                                                 page.
  ----------------------------------------------------------------------------------------------------------------------------------------------------------------

Ambiguity returns `intent:"CLARIFICATION"` and a question with no
mutation. Clear single creation and identified ordinary operations
execute directly. Multiple creation returns an editable action plan
without creating tasks. Delete returns a confirmation object without
deleting.

## Deletion confirmation

The initial assistant response contains:

``` json
{
  "confirmation": {
    "id":"dcf_...",
    "taskId":"tsk_...",
    "operation":"DELETE_TASK",
    "taskVersion":4,
    "expiresAt":"2026-11-04T10:05:00Z",
    "challenge":"one-time-client-challenge"
  }
}
```

  ---------------------------------------------------------------------------------------------------------------------
  Method/path                                                   Auth / CSRF       Request → response  Rules
  ------------------------------------------------------------- ----------------- ------------------- -----------------
  POST                                                          Yes + CSRF        `{challenge}` +     Atomically
  `/assistant/deletion-confirmations/:confirmationId/confirm`                     `Idempotency-Key` → consume; verify
                                                                                  `204`               user, task,
                                                                                                      operation, task
                                                                                                      version,
                                                                                                      challenge and
                                                                                                      expiry; then
                                                                                                      soft-delete and
                                                                                                      suppress
                                                                                                      reminders.

  ---------------------------------------------------------------------------------------------------------------------

Confirmation is short-lived (5 minutes), single-use and invalidated by
task version change, expiry, consumption, owner mismatch or operation
mismatch. Stale/replayed/mismatched confirmation returns 409
CONFIRMATION_INVALID. The UI and assistant use this same confirmation
service.

## Action plans (multi-task creation only)

  --------------------------------------------------------------------------------------------------------------
  Method/path                       Auth / CSRF       Request → response                       Rules
  --------------------------------- ----------------- ---------------------------------------- -----------------
  GET `/action-plans/:planId`       Yes               → `{plan}`                               Owner-scoped.

  PATCH `/action-plans/:planId`     Yes + CSRF        `{version,items:[...],removeItemIds?}` → DRAFT and
                                                      `{plan}`                                 unexpired only;
                                                                                               CREATE_TASK items
                                                                                               only; 409 stale
                                                                                               version.

  POST                              Yes + CSRF        `{version}` + `Idempotency-Key` →        Atomic claim;
  `/action-plans/:planId/approve`                     `{plan,results}`                         durable per-item
                                                                                               results;
                                                                                               duplicate
                                                                                               approval replays
                                                                                               result; partial
                                                                                               failure retained.

  POST                              Yes + CSRF        `{version}` → `{plan}`                   DRAFT only;
  `/action-plans/:planId/reject`                                                               creates no tasks.
  --------------------------------------------------------------------------------------------------------------

## Reminders

One active reminder per task. Historical reminders remain queryable. The reminder worker performs atomic claims internally using conditional database updates and a 2-minute lease. Claims are not exposed as a public client operation.

  ---------------------------------------------------------------------------------------------------------------------
  Method/path                                 Auth / CSRF       Request → response                 Rules
  ------------------------------------------- ----------------- ---------------------------------- --------------------
  GET `/reminders`                            Yes               filters + pagination →             Caller-owned
                                                                `{items,page}`                     active/history
                                                                                                   records.

  POST `/tasks/:taskId/reminders`             Yes + CSRF        `{scheduledAt,timezone}` →         Future UTC instant;
                                                                `201 {reminder}`                   task eligible;
                                                                                                   atomically
                                                                                                   suppress/replace
                                                                                                   prior active
                                                                                                   reminder.
                                                                                                   Idempotency
                                                                                                   supported.

  PATCH `/reminders/:reminderId`              Yes + CSRF        `{scheduledAt,timezone,version}` → Future time;
                                                                `{reminder}`                       increments
                                                                                                   generation and
                                                                                                   invalidates old
                                                                                                   claim/token.

  DELETE `/reminders/:reminderId`             Yes + CSRF        `{version}` → `204`                Cancel, preserve
                                                                                                   history; idempotent.


  GET `/reminders/available`                  Yes               `limit?` → `{items:[...]}`         Read-only; returns
                                                                                                   caller's AVAILABLE
                                                                                                   claims; no claim
                                                                                                   side effect.

  POST                                        Yes + CSRF        `{deliveryToken,result}` →         Result:
  `/reminders/:reminderId/acknowledgements`                     `{reminder}`                       DISPLAY_ATTEMPTED,
                                                                                                   PERMISSION_DENIED,
                                                                                                   UNSUPPORTED or
                                                                                                   FAILED. Recheck
                                                                                                   token, owner, claim,
                                                                                                   lease, generation
                                                                                                   and task
                                                                                                   eligibility.
                                                                                                   Idempotent per
                                                                                                   claim.
  ---------------------------------------------------------------------------------------------------------------------

Claim item shape:
`{reminderId,taskId,title,scheduledAt,generation,claimId,deliveryToken,leaseExpiresAt}`.
Delivery token is short-lived (5 minutes), scoped to
user/reminder/generation/claim. Retrieval does not prove display.
Acknowledgment records a display attempt, not that the user saw it.
Expired claims are recovered; retryable failures return to SCHEDULED
with bounded backoff, maximum five attempts then FAILED. No eligible
active browser means no delivery guarantee. No Web Push.

## Activity

`GET /activity` accepts type/date filters and pagination and returns
caller-owned append-only activity records.

## Validation, idempotency and concurrency

-   Validate IDs, enums, text bounds, IANA zones, date precision,
    versions and query parameters. Reject unknown mutation fields.
-   `Idempotency-Key` is scoped to authenticated user and operation.
    Store canonical request hash and durable response. Same key/hash
    replays the original outcome; same key/different hash returns 409
    IDEMPOTENCY_KEY_REUSED. Concurrent duplicate requests return
    IN_PROGRESS conflict with retry guidance or the stored result.
-   Optimistic concurrency is separate: task/profile/plan writes require
    `version`; mismatch returns 409 VERSION_CONFLICT. An idempotency key
    does not override a stale version.
-   Plan approval uses plan version plus atomic claim and stable
    per-item operation keys. Acknowledgment is claim-token scoped.
-   All service authorization is authoritative. Never trust
    model-provided IDs without owner-scoped lookup.

**Rescheduling via `PATCH /tasks/:taskId`:** This endpoint supports changing task deadlines. The request includes the current `version` and updated `due` value. For precision `DATE`, send `{precision:"DATE",date:"YYYY-MM-DD",timezone:"Area/Location"}`; the service stores `dueDate` as the calendar date and keeps `dueAt` null. For precision `DATETIME`, send `{precision:"DATETIME",at:"<UTC ISO-8601 instant>",timezone:"Area/Location"}`; the service stores `dueAt` as a UTC instant and keeps `dueDate` null. The existing DATE versus DATETIME representation is preserved; `duePrecision` cannot be changed through this endpoint. Changing precision requires a separate explicit product/API decision and is rejected as `VALIDATION_ERROR`. Invalid IANA zones, invalid dates/instants, or invalid precision/value combinations return `400 VALIDATION_ERROR`. The update is conditional on `{taskId,userId,version,deletedAt:null}`; stale versions return `409 VERSION_CONFLICT` and do not modify the task. This rule applies to both DATE and DATETIME tasks: changing the deadline suppresses the active reminder and invalidates its generation and all outstanding claims and tokens. No reminder is automatically created or adjusted. The task response has `activeReminder:null`; the user must explicitly schedule a new reminder. The mutation supports `Idempotency-Key`; replay behavior follows the common idempotency rules.

### `GET /activity`

- **Authentication:** Required authenticated session; no CSRF token because this route is read-only. Results are always scoped to the authenticated user.
- **Query parameters:** `limit` (optional integer, default 20, range 1–100), `cursor` (optional opaque pagination cursor), `sort` (optional allowlisted `occurredAt:asc` or `occurredAt:desc`, default descending), `from` and `to` (optional ISO-8601 UTC instants, inclusive lower/exclusive upper bounds), and `eventType` (optional allowlisted activity event type). `from` must be earlier than `to` when both are supplied.
- **Success:** `200 {"items":[ActivityRecord,...],"page":{"nextCursor":string|null,"hasMore":boolean}}`. Each `ActivityRecord` contains `{id,eventType,entityType,entityId,occurredAt,actorType,changes,requestId}`. `changes` contains only allowlisted, redacted before/after values; no secrets or full assistant prompts are returned.
- **Validation:** Reject malformed cursors, non-integer/out-of-range limits, unsupported sort/eventType, invalid timestamps, and `from >= to` with `400 VALIDATION_ERROR`. Unknown query parameters are rejected. Activity records from another user are never returned.
- **Errors:** `401 UNAUTHENTICATED` when the session is absent/expired; `400 VALIDATION_ERROR` for invalid parameters; `429 RATE_LIMITED` when the read limit is exceeded; `503 DEPENDENCY_UNAVAILABLE` when the database is unavailable; `500 INTERNAL_ERROR` for unexpected failures. Errors use the common response envelope and request ID.
- **Mutation behavior:** Read-only. It does not claim reminders, acknowledge delivery, or alter activity records.
- **Retention:** Activity retention duration is an open production decision; this endpoint does not imply a retention period.


