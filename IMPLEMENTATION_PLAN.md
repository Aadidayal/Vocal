# Implementation Plan

Implementation uses JavaScript ES Modules (`.js`) and React JSX (`.jsx`)
only. Runtime validation uses Zod/Joi; JSDoc where useful. Tests use
Vitest and Supertest where applicable. No TypeScript files, compiler or
tsconfig.

## Phase 0 --- Foundation (planned; execution requires explicit owner authorization)

Phase 0 establishes repository, tooling and application shells only. It
does not implement authentication, task CRUD, assistant behavior,
action-plan execution or reminder business behavior.

### Repository and documentation baseline

1.  Initialize Git. Outcome: repository history begins with approved
    documentation. Acceptance: initial commit contains the six approved
    Markdown documents; clean `git status`.
2.  Add `.gitignore`. Outcome: ignore node_modules, build output,
    coverage, logs, local env files, editor/OS files while retaining
    `.env.example`. Acceptance: sample local secrets and generated files
    are ignored.
3.  Add README development guide. Outcome: prerequisites,
    install/start/test commands, environment variables and process roles
    documented. Acceptance: clean-checkout setup is reproducible without
    production credentials.

### JavaScript workspace and tooling

4.  Create client/server/worker folder shells. Outcome: modular monolith
    structure. Acceptance: only foundation shells; `.js`/`.jsx` files
    only.
5.  Configure package workspaces and ES Modules. Acceptance: scripts for
    dev/build/lint/format/test; no `.ts`, `.tsx`, `tsconfig.json`,
    TypeScript compiler or TS-only dependency.
6.  Configure ESLint and Prettier. Acceptance: lint and format checks
    run on JS/JSX.
7.  Add `.env.example` and environment validation. Acceptance:
    placeholders only; missing required values fail safely; secrets
    never enter client bundle.
8.  Configure local MongoDB development strategy, including replica-set
    option for transaction tests. Acceptance: documented
    connection/readiness behavior; no production credentials.

### API and frontend shells

9.  Create Express app shell, `/api/v1` mount, request ID middleware,
    structured logger, normalized errors and safe 404 handler.
    Acceptance: errors include request ID and hide stack/secrets in
    production.
10. Configure CORS, cookie and CSRF foundation. Acceptance: explicit
    allowed origins, credentialed requests and CSRF bootstrap/validation
    contract; no user authentication implementation.
11. Add `/health` liveness and `/ready` dependency readiness.
    Acceptance: readiness reports safe dependency state and fails when
    required DB is unavailable.
12. Create Vite React JSX entry, router/provider setup and accessible
    placeholder layout. Acceptance: app loads and placeholder route
    works; no auth/task features.
13. Configure Vitest and Supertest. Acceptance: tests cover env
    validation, request IDs, error envelope and health/readiness without
    production services.
14. Add CI foundation. Acceptance: workflow installs from lockfile,
    lint-checks, tests and builds without secrets.
15. Review secret protection. Acceptance: tracked files and client build
    contain no real secrets; server-only Gemini/database/email values
    remain server-side.

### Phase 0 completion gate

Clean checkout setup, lint, tests and client build pass; API
health/readiness work; documentation matches scaffold; no domain
features exist. Review and commit Phase 0 separately. Phase 1 requires a
separate owner authorization.

## Phase 1 --- Authentication, profile and onboarding

Implement registration with confirmed IANA timezone, hashed server-side
sessions, CSRF, renewal/expiry, logout/revocation, email reset and
onboarding. Tests: CSRF, session lifecycle, reset replay, rate limits,
timezone validation and ownership.

## Phase 2 --- Task domain and core interface

Implement task CRUD, search/filter, status lifecycle, soft deletion,
activity, optimistic versioning, dashboard and task detail/list. Task
rescheduling uses PATCH with DATE/dueDate or DATETIME/dueAt and does not
change precision implicitly; changing a deadline invalidates the active
reminder and requires an explicit new reminder. Tests: ownership, default
priority, DATE/DATETIME, DST, overdue, version conflicts, completion/reopen,
reschedule validation and reminder invalidation.
## Phase 3 --- Assistant text workflow and deletion confirmation

Implement Gemini adapter, validated intents, bounded context, direct
ordinary operations, clarification and task-bound deletion confirmation.
Tests: ambiguity, stale/replayed confirmation, prompt injection and
provider/database failure.

## Phase 4 --- Multiple-task creation plans

Implement CREATE_TASK-only persistent preview, per-item edit/remove,
expiry, approval, atomic claim, per-item idempotency, partial outcomes
and recovery. Tests: concurrent approval, stale version, partial failure
and retry.

## Phase 5 --- Voice

Implement browser recognition adapter, editable transcript, explicit
submission and optional stoppable TTS. Tests:
unsupported/denied/empty/error/cancelled states and typed fallback.

## Phase 6 --- Reminders and activity

Implement one-active-reminder enforcement and a lease-based worker that
performs atomic claims internally. Authenticated active clients only retrieve
AVAILABLE claims through the read-only endpoint and separately acknowledge
delivery attempts. Include permission-gated foreground notification,
bounded retry and history. Tests: concurrent worker claims, lease recovery,
stale token/generation, duplicate acknowledgment, task lifecycle invalidation
and no active client.
## Phase 7 --- Calendar, settings and hardening

Implement day/week/month calendar, timezone-aware rescheduling,
settings, accessibility, monitoring, backups and restore procedure. Test
DST/date boundaries, accessibility, rate limits and restore.

## Phase 8 --- Release

Resolve hosting provider/region, email provider, Gemini
configuration/data review, privacy/retention and operational
release/rollback. Production release is blocked until open decisions are
approved.


