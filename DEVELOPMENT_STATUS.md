# Development Status

## Verified status

- Requirements discovery: COMPLETE.
- Documentation consolidation: APPROVED by project owner for Phase 0.
- Cross-document audit: COMPLETE for the approved baseline.
- Phase 0: IN PROGRESS (Items 1–13 implemented; live MongoDB/replica-set integration verification for Item 10 remains pending).
- MVP authentication checkpoint: IMPLEMENTED in code and covered by mocked route tests; live MongoDB persistence is not verified.
- Core MVP product: PARTIALLY IMPLEMENTED (public landing page, session-scoped demo workspace, authenticated task dashboard, and Gemini-first/local-fallback assistant are implemented; live evaluator browser validation and deployment remain outstanding).
- Deployment: NOT DEPLOYED; single-service Render configuration is prepared, but service creation, dashboard secrets, and deploy remain owner-controlled.
- Git initialization: COMPLETE.
- Original Phase 1 scope: DEFERRED except for the MVP authentication subset now underway.

## Phase 0 evidence

- Items 1–3: Git baseline, `.gitignore`, and README are present. The baseline commit is `aaf610d8767cca201592820c5ac82d5737c9804f`; subsequent work remains uncommitted.
- Item 4: `client/`, `server/`, and `worker/` JavaScript foundation shells exist.
- Item 5: root and workspace package manifests define npm workspaces, ES modules, and process scripts. The workspace dependencies are now installed and `package-lock.json` is present from Item 10 validation.
- Item 6: ESLint/Prettier configuration is not yet implemented.
- Item 7: `.env.example` and server Zod environment validation exist; no real secrets are present.
- Item 8: `compose.yaml` and README describe local MongoDB replica-set setup. Docker was unavailable during validation, so container startup and replica-set initialization remain unverified.
- Item 9: Express app, `/api/v1` router, request ID middleware, JSON structured logger, normalized error handler, and safe 404 handler are implemented. JavaScript syntax checks pass. Item 10 HTTP smoke checks also exercised request IDs and safe 404 behavior.
- Item 10: Implemented exact-origin credentialed CORS and preflight handling; Mongoose `preAuthSessions` model with unique hash and TTL indexes; MongoDB connection before API startup; HttpOnly/SameSite=Lax cookie (Secure in production); anonymous session and CSRF bootstrap; hash-only persistence; absolute expiry checks; and CSRF enforcement for state-changing API requests. In-memory HTTP smoke checks passed for allowed/rejected origins, preflight, bootstrap, cookie attributes, hash-only storage, valid/missing/incorrect tokens, expired-session rejection, fresh bootstrap after expiry, and token/cookie absence from logs. Live MongoDB persistence and replica-set checks remain pending because Docker and `mongod` are unavailable and no MongoDB is listening locally.
- Item 11: Added `/health` liveness and `/ready` readiness endpoints. Mocked-state HTTP checks passed: health returned 200 while MongoDB was disconnected; readiness returned 200 when mocked connected and 503 for disconnected/connecting/disconnecting states; responses were safe and preserved the request-ID header. No live MongoDB readiness integration check was run.
- Item 12: Added the Vite HTML entry, JavaScript Vite config with React and Tailwind plugins, React JSX root, TanStack Query provider, React Router routes, Lucide icons, and responsive accessible placeholder layout. Production Vite build and client `.js` syntax checks passed. In-memory React rendering verified the home and not-found routes, primary navigation, and skip link. Vite dev server reported ready; loopback HTTP/browser visual validation could not be completed in this environment.
- Item 13: Added Vitest and Supertest configuration, root `npm test`/`npm run test:server` scripts, and server foundation tests. Before the MVP auth checkpoint, both commands passed 9/9 tests; that baseline covers environment validation, request IDs, normalized 404/production 500 errors, and mocked health/readiness.

## MVP submission mode

### Implemented in code

- Express security foundation and anonymous pre-auth CSRF sessions.
- Mongoose user and authenticated-session schemas.
- Registration, login, session restore/renewal, logout, password hashing with Node.js scrypt, session-bound CSRF, and process-local authentication throttling.
- Responsive React placeholder shell and routing.
- Responsive React dashboard with task summary cards, status/priority indicators, client-side search and status filtering, task creation/editing, completion, reopening, loading, empty, validation, and API error states.
- Registration and login forms, session restoration, and logout integrated with the existing auth API. CSRF tokens remain in JavaScript memory only; requests include credentials and never persist tokens in localStorage.
- Voice-first dashboard assistant with a prominent microphone, continuous Web Speech recognition, interim/final transcript display, listening/processing/speaking/error states, optional single-field text command, and browser speech synthesis. The UI presents one latest command and concise spoken response, with no chat bubbles or conversation history.
- Authenticated `POST /api/v1/assistant/messages` backed by a server-only Gemini provider adapter. Structured model output is validated with Zod; supported single-task create, list/search, update, complete, and reopen operations execute through owner-scoped task services with task-version checks. Ambiguous and multi-create commands ask for clarification. The route does not persist transcripts and does not execute deletions.
- DATE deadlines remain date-only strings. DATETIME input is interpreted in the task's IANA timezone, converted to a UTC instant, and rejects nonexistent or ambiguous daylight-saving local times.
- Mongoose Task schema with approved priority/status enums, DATE/DATETIME storage fields, user ownership, soft deletion, versioning, timestamps, and approved query indexes.
- Authenticated task API: create, list, retrieve, update, complete, and reopen. Ownership comes only from the authenticated session; every mutation remains under global CSRF enforcement. A reusable owner/version-guarded soft-delete model operation is present for the approved deletion-confirmation workflow, but there is no public delete route.

### Tested

- `npm test`: 20/20 passing tests across foundation, authentication, and task API (Supertest with mocked Mongoose persistence).
- Auth tests cover password hash/verify, registration with timezone validation, authenticated cookie/session creation, user-secret omission, authenticated CSRF bootstrap, session restore/logout/revocation, missing-CSRF rejection, weak password/invalid timezone rejection, successful login, and generic invalid credentials.
- Foundation tests cover environment validation, request IDs, normalized 404/500 responses, and health/readiness.
- Task API tests cover creation and retrieval, DATE and DATETIME preservation, rejection of implicit precision changes, owner assignment from the session, update and stale-version conflict, completion, reopening, invalid DATE input, unauthenticated rejection, cross-user isolation, and soft deletion/hiding from reads.
- Client production build passed after dashboard/auth implementation. Manual conversion checks passed for IANA-zone datetime round-trip and daylight-saving gap rejection. Browser-driven interaction tests are not configured.
- No browser/component automation currently verifies the sign-up and task workflows in a real browser; validation this checkpoint is the production build plus existing backend tests.
- The voice-first assistant and Gemini path have not been live-tested in a browser or against Gemini. No assistant-specific automated tests have been added.
- Latest validation: Vitest discovery includes server and client tests. `npm test` passed 29/29 tests across six files; `npm run build` passed. Demo parser tests execute; provider failure/no-retry and unauthorized route tests execute. Full browser multi-tab isolation and microphone permission behavior are not automated.

### Implemented but not integration-verified

- Task and authenticated-session persistence workflows, indexes, TTL cleanup, session expiry and renewal were reported by the project owner as passing live MongoDB Atlas smoke tests. The local Docker replica-set runtime remains unverified.

### Not yet implemented

- Browser-driven end-to-end validation of registration/login/task workflows.
- Durable idempotency handling for retryable task mutations.
- Public task deletion remains unavailable by design until the assistant deletion-confirmation workflow is implemented.
- Task reminder suppression on deadline changes remains pending with reminder implementation.
- Live Gemini command interpretation and browser speech recognition/synthesis verification.
- Demo deadline editing via natural-language commands; use the manual demo editor for title-only editing currently.
- Live deployment and end-to-end browser validation.

### Deferred for submission

- Reminders and worker delivery, advanced calendar, activity history, multi-task approval, advanced analytics, email password reset, and nonessential infrastructure. Voice input/output is implemented in code but remains unverified on a supported browser/device.

### Current blockers

- Live MongoDB Atlas CRUD/session smoke tests have been reported as passing by the project owner; no additional database changes were made for this checkpoint.
- Assistant command execution requires a server-side `GEMINI_API_KEY`; the key is optional for API startup and is not exposed to client bundles. Configured default is `gemini-3.8-flash`; provider failures use the local command parser fallback. One minimal live GenerateContent request to Gemini returned HTTP 503; account-specific access and the provider's underlying reason remain unverified. Use Gemini free-tier access only; do not enable billing, paid-only features, paid fallback models, Google Search grounding, or separately billed tools.
- Render is the selected deployment target. Build/start settings and production environment variables are documented in README; service URL, custom domain, and secret values must be entered in the Render dashboard. No deployment was performed.
- Authentication throttling currently uses process memory; production multi-instance deployment needs a shared rate-limit store or equivalent control.
- The approved contract requires task filters (`dueFrom`, `dueTo`, `overdue`, and `q`) and durable idempotency behavior. The current task list supports opaque-cursor pagination, status/priority filters, and allowlisted sorting; the other filters and idempotency remain API-contract gaps.

## Item 10 approved pre-auth session decisions

Pre-auth sessions use a dedicated `preAuthSessions` collection, are not associated with users, have a 30-minute absolute lifetime with no idle renewal, and store only cryptographic hashes of opaque session IDs and CSRF tokens. Expired sessions cannot bootstrap or validate CSRF; a new bootstrap creates a fresh session. The TTL index is cleanup only and application code validates expiry. These decisions do not change authenticated session policy. Schema and expiry decisions are approved; live persistence verification remains pending.

## Repository status

No changes have been committed after the documentation baseline.

## Open production decisions

- Render region.
- Gemini model/configuration, quotas and data-handling review.
- Transcript/conversation retention duration.
- Account deletion/erasure policy.
- Backup retention.
- Production email provider for password reset.
- Production frontend origins for the CORS allowlist.

## Voice Grievance Desk checkpoint

**Implemented:** a separate Mongoose `grievances` collection and indexes; authenticated create/list/detail routes; owner-scoped access; ticket IDs; OPEN initial status and history; status/category/priority and keyword filters; version-checked admin status updates with resolution notes; admin status counts; an authenticated responsive voice/text page with editable speech transcript, clarification state, ticket timeline and voice/text progress lookup. Server-side Gemini structured extraction is validated with Zod and falls back to local JavaScript extraction on provider errors or malformed output. Only accounts with a server-side `ADMIN` role can use admin routes; self-registration sets the normal USER role.

**Automated verification:** 35 tests passed across 8 files with `npm test`, including grievance validation, ticket creation, owner isolation, admin authorization/status updates, local extraction, and Gemini-unavailable/malformed-response fallback. `npm run build` completed successfully. Tests mock MongoDB and provider calls; live grievance persistence and live Gemini interpretation have not been verified as part of this checkpoint.

**Known limitations:** local extraction supports limited English keywords and does not reliably parse multilingual complaints or event date/time. The UI requests location, category, or priority when absent; it does not yet conduct a multi-turn structured interview. Department is not a grievance field/taxonomy, so administration filters by category instead. Admin role provisioning is an operator/database task and has no UI. Browser microphone and language behavior vary by browser. No public/anonymous grievance submission is enabled.
