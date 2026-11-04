# System Architecture

## Overview

Use a JavaScript modular monolith: one React SPA, one Express API and
MongoDB. A reminder worker runs as a separately supervised process from
the same backend codebase and shares domain services/repositories. Use
MongoDB-backed durable scheduling and leases; introduce a separate queue
only if measured needs justify it.

``` text
React SPA -- HTTPS /api/v1 --> Express API --> MongoDB
  |                              |             |
  |-- Web Speech adapter         |-- Gemini adapter
  |-- SpeechSynthesis            |-- domain modules
  |-- foreground Notification    |-- reminder worker
```

## Technology and code conventions

React, JavaScript/JSX, Vite, Tailwind, React Router, TanStack Query and
Lucide React. Backend uses Node.js LTS, Express, JavaScript ES Modules,
Mongoose and MongoDB. Gemini is accessed only through a provider
interface. Validate runtime inputs with Zod or Joi; use JSDoc
selectively. ESLint, Prettier, Vitest and Supertest support quality. Use
`.js` and `.jsx` exclusively; no TypeScript, `.ts`, `.tsx`,
`tsconfig.json` or compiler.

## Frontend architecture

-   `app/`: router, providers, auth guards and error boundary.
-   `features/auth`, `onboarding`, `tasks`, `assistant`, `calendar`,
    `reminders`, `activity`, `settings`: feature pages, components,
    hooks and validation.
-   `components/`: accessible shared controls, dialogs, feedback and
    layout.
-   `lib/api/`: fetch client, request IDs, normalized errors and
    session/CSRF handling.
-   `lib/voice/`: speech capability detection, editable transcript
    lifecycle, permission/error states and speech output.
-   TanStack Query owns server state; form and transient interaction
    state stays local.
-   Batch plans expose per-item edit/remove and per-item execution
    outcomes.

## Backend modules

-   `auth`: credentials, server-side sessions, CSRF, reset tokens and
    rate limits.
-   `users`: profile, IANA timezone and preferences.
-   `tasks`: CRUD, ownership, status transitions, filtering, soft
    deletion and concurrency.
-   `assistant`: orchestration, Gemini provider adapter, context
    retrieval, intent validation and response generation.
-   `conversations`: owned threads and bounded messages.
-   `actionPlans`: CREATE_TASK proposals, editing, expiry,
    approval/rejection and idempotent item execution.
-   `reminders`: scheduling, management API,
    claim/retrieval/acknowledgment and worker.
-   `activity`: append-only domain events.
-   `operations`: idempotency and durable operation outcomes.

Controllers map HTTP to services. Services own business policy and
transaction boundaries. Repositories perform explicitly owner-scoped
Mongoose access. Middleware handles authentication, request IDs,
validation, rate limits, CSRF and error mapping.

## Authentication and security lifecycle

Registration requires a valid IANA timezone confirmed by the user. Use
opaque random server-side session identifiers; persist only their
hashes. Cookies are HttpOnly, Secure over HTTPS, SameSite=Lax, Path=/
and omit Domain unless deployment requires it. Login and registration
rotate the session identifier. `GET /api/v1/auth/csrf`
initializes/returns a session-bound CSRF token; the client holds it in
memory and sends `X-CSRF-Token` on state-changing requests. Rotate it on
session creation/renewal. Session idle lifetime is 30 days with a 90-day
absolute cap; renew at most hourly on authenticated activity. API
enforces expiry; TTL is cleanup only. Logout revokes the current session
and clears the cookie. Email password reset uses a hashed, expiring,
single-use token and revokes all sessions. Use Argon2id or a vetted
equivalent. Email provider remains a production selection.

The CSRF bootstrap uses a separate anonymous pre-auth session stored in
the MongoDB `preAuthSessions` collection, without a user association.
Generate its opaque session ID and CSRF token with cryptographically
secure randomness and persist only their hashes. The cookie is
HttpOnly, Secure in production, SameSite=Lax, Path=/, and expires with
the pre-auth session. Pre-auth sessions expire absolutely after 30
minutes and are not renewed on activity. Expired sessions cannot
bootstrap or validate CSRF tokens; a fresh bootstrap creates a new
anonymous session. The collection TTL index is cleanup only; application
code must check `expiresAt` on every use. This pre-auth context does not
authenticate a user and is distinct from authenticated session storage
and lifecycle.

Use strict CORS allowlists, security headers, payload limits, runtime
schemas, per-user rate limits, managed secrets and redacted logs. Every
resource lookup scopes by `userId`; model-generated IDs are hints, never
authorization. Never execute model-authored code or HTML.

## AI execution pipeline

1.  Authenticate, validate request and apply rate limits/idempotency.
2.  Persist or retrieve the user's bounded conversation context.
3.  Send minimized context to Gemini through the provider adapter.
4.  Validate structured output against schemas, supported intents,
    bounds, date precision, timezone and references.
5.  Clarify ambiguity without mutation.
6.  Execute allowlisted service operations only. Single clear create and
    identified ordinary operations execute directly. Multi-create
    persists a preview plan without task writes. Delete creates a
    task-bound confirmation request; deletion occurs only on explicit
    confirmation.
7.  Verify database state, persist operation/activity outcomes, then
    formulate the response from verified results.

## Action-plan lifecycle

Plans contain stable item IDs and CREATE_TASK payloads only. Persist
owner/conversation, DRAFT status, expiry, version, approval time,
idempotency data and per-item state. Editing/removal is allowed only
while DRAFT and unexpired. Approval atomically claims the plan; each
item has a stable plan-derived operation key. Persist each result before
continuing. Retries skip successful items and do not duplicate tasks.
Partial failure is durable and visible. Duplicate approval returns
stored outcomes.

## Reminder delivery protocol

A task has at most one active reminder. Active states are SCHEDULED,
CLAIMED and AVAILABLE. Terminal/history states include ACKNOWLEDGED,
FAILED, CANCELLED and SUPPRESSED.

1.  Scheduler worker finds due SCHEDULED reminders whose `nextAttemptAt`
    is due and whose task is still eligible.
2.  Worker atomically claims a reminder using a conditional update, sets
    CLAIMED, records a claim ID/token hash and a 2-minute lease.
    Concurrent workers cannot claim the same live reminder.
3.  Worker makes the claim AVAILABLE to authenticated active browser
    clients. Worker does not claim that a notification has been
    displayed.
4.  Client explicitly retrieves AVAILABLE claims using a read-only GET.
    GET never claims or mutates.
5.  Client checks permission/support and attempts `Notification`. It
    then posts a separate acknowledgment: DISPLAY_ATTEMPTED,
    PERMISSION_DENIED, UNSUPPORTED or FAILED.
6.  Backend validates token, owner, claim, lease, generation and current
    task eligibility before accepting acknowledgment. Acknowledgment is
    idempotent per claim.
7.  Expired leases are recovered. Retryable failures return to SCHEDULED
    with bounded backoff; after five attempts the reminder becomes
    FAILED.

Task deadline changes and reminder scheduled-time edits are distinct:

-   When a task DATE or DATETIME deadline changes, suppress its active
    reminder and invalidate its generation, outstanding claims and
    delivery tokens. Do not automatically create or adjust a reminder;
    the user must explicitly schedule a new one.
-   When `PATCH /reminders/:reminderId` changes a reminder scheduled
    time, increment that reminder's generation and invalidate old claims
    and delivery tokens, while keeping the edited reminder active at its
    new scheduled time.

Completion, cancellation or task deletion suppresses the active reminder.

Delivery tokens are short-lived and bound to user, reminder, generation
and claim. Store token hashes, not raw tokens. A successful display
attempt does not prove the user saw the notification. If no eligible
authenticated browser is connected, delivery is not guaranteed. MVP is
foreground-only; no Web Push.

## Date and task lifecycle

DATE is a local calendar string `YYYY-MM-DD`, never midnight UTC.
DATETIME and operational timestamps are UTC instants with IANA context.
DATE overdue begins after local end-of-day in the user's current
timezone; DATETIME overdue begins after its due instant. Completed,
cancelled and deleted tasks are excluded. Reopening sets PENDING, clears
`completedAt` and does not reactivate old reminders.

## Persistence, concurrency and failure handling

Use optimistic `version` checks for task/profile/plan edits. Stale
versions return 409 VERSION_CONFLICT. Idempotency records are scoped by
user and operation and store canonical request hashes/results. Same key
and same hash replays the outcome; same key with a different hash
returns 409. Idempotency does not replace version checks. Related
task/reminder/activity writes use MongoDB transactions where available.
Durable operations and leases support recovery. Database/provider
failures never produce guessed success.

## Deployment and operations

Deploy SPA assets separately from API and worker processes. API and
worker use the same backend artifact and MongoDB. Configure TLS, CORS,
cookie settings, managed secrets, health/readiness, graceful shutdown,
backups/restore drills, logs and monitoring. Hosting provider/region and
backup retention remain open production decisions.

## Open production decisions

See `DEVELOPMENT_STATUS.md`: hosting provider/region; Gemini
model/quotas/data review; transcript/conversation retention; account
erasure; backup retention; production email provider. Browser delivery
scope, session policy, password-reset capability, language scope and
assistant confirmation policy are locked, not open.
