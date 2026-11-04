# Project Context

## Product vision

Build a secure, voice-first AI task manager for students, young
professionals and individuals. The dashboard centers on continuous speech
commands through a prominent microphone. Browser speech recognition sends
finalized command transcripts to the authenticated backend; the optional
text-command fallback uses the same command pipeline. The backend uses
Gemini as a private intent and decision engine, validates its structured
output, and executes supported task actions through owner-scoped services.
The assistant speaks concise responses with browser speech synthesis.
This is a task-assistant experience, not a chatbot: chat bubbles and chat
history are not the primary UI. Raw audio is never stored or uploaded.

## MVP users and capabilities

-   Students managing assignments, exams and personal commitments; young
    professionals and individuals managing daily work.
-   Registration, login/logout, email-based password recovery/reset,
    onboarding, profile and timezone settings.
-   Assistant intents: create one or multiple tasks, view/search,
    update, complete/reopen, delete, reschedule, manage reminders,
    answer general questions and ask clarifying questions.
-   Dashboard, task list/detail, day/week/month calendar, activity
    history and essential settings.
-   Persistent reminders with foreground browser notification attempts
    while an eligible authenticated browser client is connected.
-   Responsive, accessible UI with loading, empty, error and success
    states.

## Locked technology stack

JavaScript only: - Frontend: React, JavaScript/JSX, Vite, Tailwind CSS,
React Router, TanStack Query, Lucide React. - Backend: Node.js,
Express.js, JavaScript ES Modules, MongoDB and Mongoose. - AI: Gemini
behind a provider adapter; provider output is untrusted and never
directly executes code. - Validation: Zod or Joi; JSDoc where useful. -
Quality: ESLint, Prettier, Vitest and Supertest where appropriate. -
Browser: Web Speech API capability adapter, SpeechSynthesis and
foreground Notification API.

Use `.js` and `.jsx`. TypeScript, `.ts`, `.tsx`, `tsconfig.json` and
TypeScript compilation are prohibited.

## Task model and business rules

-   Priorities: LOW, MEDIUM, HIGH, URGENT. Default: MEDIUM.
-   Statuses: PENDING, IN_PROGRESS, COMPLETED, CANCELLED. New tasks
    default to PENDING.
-   Deletion is soft deletion and is distinct from completion.
-   Completion sets `completedAt` and suppresses active reminders.
-   Reopening a completed task sets status to PENDING, clears
    `completedAt`, and does not reactivate an old reminder.
-   Overdue is derived, never a stored task status. COMPLETED, CANCELLED
    and soft-deleted tasks are not overdue.
-   Every task and related record is scoped to its owner.

## Date and timezone rules

-   Registration requires a valid IANA timezone suggested by the browser
    and confirmed or edited by the user. Browser detection is not
    authoritative.
-   Resolve relative dates using the user's current local date and
    timezone.
-   DATE deadlines are stored as `YYYY-MM-DD` and remain date-only;
    never convert them to midnight UTC.
-   DATETIME deadlines and operational timestamps are UTC instants, with
    IANA timezone context retained for interpretation/display.
-   A DATE task becomes overdue after the end of that calendar day in
    the user's timezone. A DATETIME task becomes overdue after its due
    instant.
-   Invalid timezones are rejected. Clarify/reject nonexistent local
    times during DST transitions; clarify repeated local times unless an
    explicit offset resolves them.

## Assistant execution policy

-   One clearly specified task creation: execute directly.
-   Multiple task creation: create a durable editable preview/action
    plan; no task writes before explicit approval.
-   Read/search: execute directly.
-   Clearly identified update, complete, reopen, reschedule and reminder
    operations: execute directly.
-   Delete: always require explicit confirmation bound to the
    authenticated user, exact task, DELETE_TASK operation, task version
    and an expiring single-use challenge.
-   Ambiguous target or material detail: ask a clarification question
    and do not mutate.
-   Never report success until the persisted result has been verified.

## Action plans

MVP action plans support multi-task creation only. Items are CREATE_TASK
operations. Users can edit/remove proposed items before approval.
Approval is authenticated, version-checked, idempotent and recoverable.
Partial outcomes are durable; successful items are never repeated. No
general bulk destructive operations in MVP.

## Reminders

-   At most one active reminder per task; historical records are
    retained.
-   A reminder worker atomically claims due reminders with a lease.
    Expired leases are recoverable.
-   An authenticated active browser client explicitly retrieves
    available claims, attempts a foreground notification and separately
    acknowledges the attempt.
-   Retrieval is not proof of display or user visibility. No delivery is
    promised when no eligible browser is connected or when the browser
    is closed.
-   No Web Push or closed-browser delivery claim in MVP.
-   Completion, cancellation, deletion and rescheduling
    suppress/invalidate obsolete reminder work.

## Voice and privacy

English-only MVP, designed so localization can be added later. Raw audio
is not stored. Transcript text may be stored subject to a retention
policy that must be selected before production use. Microphone
permission is requested only when voice is invoked. Typed input remains
available if speech recognition is unsupported or denied.

## Security and non-functional requirements

Server-side sessions, HttpOnly cookies, CSRF protection for
state-changing requests, strong password hashing, ownership checks,
runtime validation, rate limits, request IDs, sanitized errors, secret
management and redacted logs. Handle database/provider outages, worker
restarts, concurrent edits and retries. Test domain services, APIs, UI
and critical end-to-end flows.

## MVP boundaries and exclusions

MVP includes authentication/onboarding, task lifecycle, assistant text
and voice, multi-create preview/approval, dashboard, calendar,
reminders, activity, essential settings, tests and deployment
operations. External calendar sync, native apps, team sharing, recurring
tasks, attachments, billing, background Web Push and microservices are
out of scope unless separately approved.

## Open production decisions

Hosting provider/region; Gemini model, quotas and data-handling review;
transcript/conversation retention; account erasure policy; backup
retention; production email provider. See `DEVELOPMENT_STATUS.md`. These
do not reopen the locked product policies above.
