# Database Design

MongoDB collections use Mongoose schemas, schema validation and
service-level domain validation. Every private record includes `userId`
and every query is owner-scoped. Operational timestamps and DATETIME
deadlines are BSON Dates (UTC instants). DATE deadlines are `YYYY-MM-DD`
strings. Use replica-set transactions for related writes in hosted
production.

## users

Fields: `_id`, normalized lowercase `email`, `emailVerifiedAt`,
`passwordHash`, `preferredName`, IANA `timezone`, `language`,
`voiceEnabled`, `notificationPreferences`, `onboardingComplete`,
`version`, timestamps, `deletedAt`. Required: email, passwordHash,
preferredName, timezone. Never return passwordHash. Unique index on
email. Account erasure policy remains open.

## sessions

Fields: `_id`, `userId`, `tokenHash`, `csrfTokenHash`, `createdAt`,
`lastSeenAt`, `idleExpiresAt`, `absoluteExpiresAt`, `revokedAt`,
`renewedAt`. Cookie contains opaque random token; database stores only
its hash. Unique tokenHash; indexes by user/revocation and expiry. TTL
is cleanup only; API checks expiry and revocation. Idle lifetime 30
days, absolute cap 90 days, renewal at most hourly.

## passwordResetTokens

Fields: `_id`, `userId`, `tokenHash`, `expiresAt`, `consumedAt`,
`createdAt`. Unique tokenHash, TTL expiry, conditional single-use
consume. Never log raw token. Reset revokes all user sessions.
Production email provider remains open.

## tasks

Fields: `_id`, `userId`, `title`, `description`, `priority`, `status`,
`duePrecision`, `dueDate`, `dueAt`, `dueTimezone`, `completedAt`,
`deletedAt`, `version`, timestamps. - Priority enum
LOW/MEDIUM/HIGH/URGENT; default MEDIUM. - Status enum
PENDING/IN_PROGRESS/COMPLETED/CANCELLED; default PENDING. - DATE
requires dueDate YYYY-MM-DD and null dueAt. DATETIME requires dueAt UTC
and null dueDate. No due date requires both null. Retain IANA timezone
context. - DATE is never converted to midnight UTC. Overdue is derived:
DATE after local end-of-day; DATETIME after due instant.
Completed/cancelled/deleted are excluded. Indexes:
`{userId,deletedAt,status,dueAt}`, `{userId,deletedAt,dueDate}`,
`{userId,deletedAt,priority}`, `{userId,updatedAt}`.

## conversations and messages

`conversations`: `_id`, `userId`, `title`, timestamps, `archivedAt`,
`version`; index `{userId,updatedAt}`. `messages`: `_id`, `userId`,
`conversationId`, `role` (USER/ASSISTANT/SYSTEM_EVENT), `content`,
`mode` (TEXT/VOICE_TRANSCRIPT/SYSTEM), `intent`, `operationId`,
`createdAt`, safe metadata. Index `{userId,conversationId,createdAt}`.
Validate conversation ownership. Store transcript text only; raw audio
is not stored. Retention/redaction policy remains open.

## actionPlans

Fields: `_id`, `userId`, `conversationId`, `status`
(DRAFT/APPROVED/EXECUTING/PARTIAL/COMPLETED/REJECTED/EXPIRED), `items`,
`version`, `expiresAt`, `approvedAt`, `idempotencyKey`, `requestHash`,
`leaseOwner`, `leaseExpiresAt`, timestamps. Each item contains stable
`itemId`, `actionType:CREATE_TASK`, normalized editable payload,
executionState (PENDING/RUNNING/SUCCEEDED/FAILED), optional
`taskId`/`errorCode`, attempts and `operationKey`. Unique
`{userId,idempotencyKey}` when present; indexes for owner/status/expiry
and recovery lease. Items are CREATE_TASK only. No executable code in
payload.

## reminders

Use one canonical lifecycle field named `state` (do not also define a
separate `status` field): - Active: SCHEDULED, CLAIMED, AVAILABLE. -
Historical/terminal: ACKNOWLEDGED, FAILED, CANCELLED, SUPPRESSED.
Fields: `_id`, `userId`, `taskId`, `scheduledAt` (UTC Date), `timezone`
(IANA), `state`, `outcome`
(DISPLAY_ATTEMPTED/PERMISSION_DENIED/UNSUPPORTED/FAILED/null),
`generation`, `attempts`, `maxAttempts` (5), `nextAttemptAt`, `claimId`,
`leaseTokenHash`, `leaseExpiresAt`, `deliveryTokenHash`,
`deliveryTokenExpiresAt`, `claimedBySessionId`, `acknowledgedAt`,
`lastErrorCode`, `idempotencyKey`, timestamps. - Never persist raw lease
or delivery tokens. - Claim lease is 2 minutes; delivery token expires
after 5 minutes. - Worker atomically claims only due eligible records
with absent/expired lease. It sets CLAIMED and then AVAILABLE for client
retrieval. - GET retrieval is read-only. - Acknowledgment validates
token, owner, lease, generation and current task eligibility. - Lease
expiry returns retryable work to SCHEDULED. Bounded backoff; after five
attempts state becomes FAILED. **Task deadline change (DATE or
DATETIME):** suppress the existing active reminder and invalidate its
generation, outstanding claims and delivery tokens. Do not create or
adjust a reminder automatically; the user must explicitly schedule a
new reminder. **Reminder scheduled-time edit (`PATCH
/reminders/:reminderId`):** increment that reminder's generation and
invalidate its old claims and delivery tokens, while keeping the edited
reminder active at its new scheduled time. Completion, cancellation and
deletion suppress active reminders. Keep historical records. Indexes:
`{state,nextAttemptAt,scheduledAt}`, `{userId,taskId,state}`,
`{userId,scheduledAt}`. Enforce at most one active reminder per task
using a partial unique index on `taskId` for
SCHEDULED/CLAIMED/AVAILABLE, plus transaction and ownership checks.
Replacement suppresses prior active reminder before inserting the new
one.

## deletionConfirmations

Fields: `_id`, `userId`, `taskId`, `operation:DELETE_TASK`,
`taskVersion`, `tokenHash`, `expiresAt` (5 minutes), `consumedAt`,
`createdAt`, `operationId`. Index for
owner/task/operation/consumption/expiry and TTL expiry. Atomic
conditional consume. Version change, expiry, use, owner or operation
mismatch invalidates it.

## activityLogs

Fields: `_id`, `userId`, `actorType` (USER/ASSISTANT/SYSTEM), `actorId`,
`eventType`, `entityType`, `entityId`, `occurredAt`, `requestId`,
`operationId`, allowlisted before/after changes and redacted metadata.
Index `{userId,occurredAt}` and
`{userId,entityType,entityId,occurredAt}`. Append-only application
policy.

## operations

Fields: `_id`, `userId`, `scope`, `idempotencyKey`, `requestHash`,
`state` (IN_PROGRESS/SUCCEEDED/PARTIAL/FAILED), safe response snapshot,
`leaseExpiresAt`, timestamps and `expiresAt`. Unique
`{userId,scope,idempotencyKey}`; TTL only after replay retention window
is selected. Same key/different hash conflicts.

## Relationships and consistency

A user owns tasks, reminders, conversations, action plans, activity and
operations. Messages belong to both user and conversation. Reminders
reference both user and task. Task deletion sets deletedAt, suppresses
active reminders and records activity. Completion sets
COMPLETED/completedAt and suppresses reminders. Reopening sets PENDING,
clears completedAt and does not reactivate reminders. Task updates
increment version and conditionally match
`{_id,userId,version,deletedAt:null}`. Related writes use transactions;
durable operation state supports recovery. TTL cleanup is never an
authorization mechanism.

## Privacy and security

Repository methods receive user identity explicitly. Never accept
arbitrary Mongo filters from requests or model output. Restrict
projections, redact logs, use least-privilege credentials and encrypted
transport/storage. Decide data region, backup retention, user erasure,
conversation retention and AI-provider handling before production.
