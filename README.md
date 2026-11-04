# AI Task Manager

## Project overview

The AI Task Manager is a voice-first personal assistant for students, young professionals, and individuals. Its dashboard centers on a microphone for continuous natural-language task commands, with an optional text-command fallback. Gemini interprets commands on the backend; secure task services execute supported actions, and concise responses are spoken aloud. The MVP also includes registration/login, persistent task CRUD, task statuses and priorities, search, and DATE/DATETIME deadlines. Voice input uses browser speech recognition; raw audio is not stored or sent to the backend.

## Technology stack

- **Client:** React with JavaScript/JSX, Vite, Tailwind CSS, React Router, and TanStack Query.
- **API:** Node.js, Express, JavaScript ES Modules, REST, Mongoose, and MongoDB.
- **Worker:** A separately supervised Node.js process in the same modular-monolith codebase; reminder behavior is not implemented yet.
- **Validation and quality:** Zod, JSDoc where useful, ESLint, Prettier, Vitest, and Supertest where appropriate.

JavaScript only: use `.js` and `.jsx`. TypeScript, `.ts`, `.tsx`, `tsconfig.json`, and TypeScript compilation are prohibited.

## Prerequisites

- Node.js and npm. A supported version range has not yet been selected.
- Docker Engine and Docker Compose for the documented local MongoDB replica-set setup, or an equivalent MongoDB replica set.
- A modern browser with Web Speech API support for voice recognition and speech synthesis; text commands remain available if voice recognition is unsupported or denied.

Local development can use the unauthenticated MongoDB replica set described below. Atlas use requires a private `MONGODB_URI` in the ignored root `.env`. Assistant commands require a private, server-only Gemini API key; it is never exposed to the client.

## Project structure

```text
client/
  index.html             Vite document entry
  vite.config.js         React and Tailwind Vite plugins
  src/
    main.jsx             React DOM entry
    api/                 Credentialed API client and date/time conversion
    app/                 Query, auth providers and React Router setup
    components/          Voice assistant, dashboard task list and editor dialog
    pages/               Dashboard/auth screen and not-found route
    styles.css           Tailwind import and global accessibility styles
server/
  app.js                 Express app factory and middleware composition
  index.js               API process startup and MongoDB connection
  config/                Environment validation and database connection
  middleware/            Request IDs, CORS, CSRF, and normalized errors
  models/                Mongoose models, including preAuthSessions
  routes/                Versioned API, assistant and operational route modules
  services/              Gemini provider adapter and password hashing
  shared/                Structured logger
worker/                  Separately supervised worker workspace shell
compose.yaml             Local MongoDB replica-set service
```

The API includes anonymous CSRF bootstrap, registration, login, session restore/renewal, logout, authenticated task routes, and an authenticated assistant route. Task records are owner-scoped, versioned, soft-deleted, and preserve DATE deadlines as calendar strings and DATETIME deadlines as UTC instants. The React client uses the API for sign-in, registration, session restoration, logout, task CRUD, and voice commands. The voice assistant sends editable browser-recognized transcripts to the server; Gemini interprets them and owner-scoped backend code executes supported task actions. Replies use browser speech synthesis. Raw audio and assistant conversation history are not stored. The Atlas connection and `/ready` endpoint have been verified live; task and authenticated-session persistence flows have not yet been exercised against Atlas.

### Current task API foundation

Authenticated routes are mounted under `/api/v1`:

- `POST /tasks` creates a task (CSRF required).
- `GET /tasks` lists the signed-in user's non-deleted tasks; supports status, priority, limit, an opaque cursor, and allowlisted sort parameters.
- `GET /tasks/:taskId` retrieves an owned, non-deleted task.
- `PATCH /tasks/:taskId` updates title, description, priority, or due value with a required task version (CSRF required).
- `POST /tasks/:taskId/complete` and `POST /tasks/:taskId/reopen` apply the defined lifecycle changes (CSRF required).

The approved API contract does not expose a direct `DELETE /tasks/:taskId` route; deletion is reserved for the assistant confirmation workflow. The checkpoint includes an owner/version-guarded soft-delete model operation for that future workflow, but no public route invokes it yet. Task deadline changes do not currently have reminder side effects because reminder persistence/behavior is not implemented.

### Voice-first assistant

The dashboard microphone starts continuous browser speech recognition. The assistant shows listening, processing, and speaking states, sends each final transcript to authenticated `POST /api/v1/assistant/messages`, and reflects returned task results in the dashboard. Gemini credentials remain on the server. The optional text command fallback sends to the same API; it is a single command field, not a chat interface. The assistant can create one task, list/search, update, complete, and reopen tasks. Ambiguous or multi-task creation requests receive a clarification; deletion is not executed by this MVP route. Browser speech recognition and speech synthesis support varies by browser. Set `GEMINI_API_KEY` in the server environment to enable command interpretation; it is optional for server startup and never sent to the client.

### Unattended evaluator guide

Start at `/` for the public overview and use **Try Demo**. The demo seeds example tasks and keeps edits in per-tab `sessionStorage`; closing the tab clears its demo workspace. Demo mode does not call authenticated task APIs, Gemini, or MongoDB. In the demo, click an example command or type a supported create/list/search/complete/reopen command; edit, complete, and reopen tasks with the task-row controls. The demo is temporary and is not permanent storage. For authenticated work, use `/login`; the dashboard uses the session-protected API and Gemini-first assistant with a local JavaScript fallback on quota/provider outages. The UI labels which processor handled the command. Voice requires browser speech recognition permission; use the text fallback if unavailable.

The local fallback supports clear create/list/search/update/complete/reopen commands and deliberately asks for clarification when it cannot identify one task. It does not delete tasks. It currently does not infer natural-language due dates; use the manual task editor for deadlines.

## Environment configuration

Copy the placeholder file to a local ignored environment file:

```powershell
Copy-Item .env.example .env
```

Set these server-only values in `.env`:

| Variable | Purpose |
| --- | --- |
| `MONGODB_URI` | Connection string for the local or configured MongoDB replica set. |
| `PORT` | Port for the Express API. |
| `CORS_ALLOWED_ORIGINS` | Comma-separated exact browser origins allowed to make credentialed requests. The example uses Vite's default local origin, `http://localhost:5173`; configure production origins only in the deployment environment. Wildcards are rejected. |
| `GEMINI_API_KEY` | Optional server-only Gemini credential. Required to process assistant commands; never expose it through a client-prefixed variable or client bundle. |
| `GEMINI_MODEL` | Optional server-side model override. Defaults to `gemini-2.5-flash`. Configure only a model available under your free-tier access. |

The server loads `.env` and validates these variables before startup. Do not put server secrets in client-prefixed variables or client source. `.env.example` contains placeholders/local development configuration only; `.env` is ignored by Git.

## Local development setup

Install the declared workspace dependencies from the repository root:

```powershell
npm install
```

Start the local MongoDB replica set:

```powershell
docker compose up -d mongodb
docker compose exec mongodb mongosh --quiet --eval 'rs.initiate({_id:"rs0",members:[{_id:0,host:"localhost:27017"}]})'
```

If MongoDB reports that the replica set is already initialized, continue. The local database has no credentials and must not be exposed to an untrusted network or used in production. Its data is stored under ignored `.data/mongodb/`.

Set `MONGODB_URI` in `.env` to:

```text
mongodb://localhost:27017/ai_task_manager?replicaSet=rs0
```

Start the API after MongoDB is ready:

```powershell
npm run dev:server
```

The API connects to MongoDB before listening and serves routes under `/api/v1`. `GET /api/v1/auth/csrf` creates or reuses a session context and returns a session-bound CSRF token. The React client proxies `/api`, `/health`, and `/ready` to `http://localhost:5000` during local Vite development, so browser requests use the Vite origin and carry the server-issued HTTP-only cookies. Keep the browser origin at `http://localhost:5173` to match the local CORS allowlist. For a different backend port or a separately hosted frontend/API, configure the development proxy or deployment reverse proxy accordingly.

## Operational endpoints

- `GET /health` is a liveness check. It returns HTTP 200 while Express is running and does not depend on MongoDB.
- `GET /ready` checks the current Mongoose connection state. It returns HTTP 200 with `status: "ready"` when MongoDB is connected, or HTTP 503 with `status: "not_ready"` otherwise. The response reports only the safe MongoDB state and never connection details. Both endpoints include `X-Request-Id`.

Example ready response:

```json
{"data":{"status":"ready","dependencies":{"mongodb":"connected"}}}
```

Example not-ready response (HTTP 503):

```json
{"data":{"status":"not_ready","dependencies":{"mongodb":"disconnected"}}}
```

Start the frontend from the repository root in a separate terminal after the API and MongoDB are ready:

```powershell
npm run dev:client
```

Vite prints the local URL when it starts. The client restores the server session, presents registration or login when signed out, and displays the task dashboard and prominent voice assistant when signed in. Task data comes from MongoDB through the API; the client does not use localStorage or seeded task data. The worker workspace is only a shell, so reminder processing is not available.

The assistant endpoint is `POST /api/v1/assistant/messages` and requires an authenticated session plus the normal CSRF token. The browser submits a transcript or optional text command; the backend validates Gemini's structured interpretation and applies task writes using session-derived ownership and task-version checks. The configured default is `gemini-2.5-flash`; the server accepts `GEMINI_MODEL` as an optional deployment override. Provider failures, including unavailable models, authorization errors, quota errors, timeouts, and invalid responses, use the local command parser so supported commands can still execute. The project must use Gemini free-tier access only: no billing, paid-only features, paid fallback models, Google Search grounding, or separately billed tools. Live Gemini validation is pending. Check browser support and grant microphone permission to use voice; the text fallback is available when voice recognition is unavailable.

## Testing and quality checks

Vitest and Supertest cover the server foundation. Run the root suite or the server workspace suite:

```powershell
npm test
npm run test:server
```

The Vitest suite covers environment validation, request IDs, normalized errors, health/readiness, authentication/session lifecycle, task routes, Gemini provider failures and local demo parsing. Run `npm test`; the current suite passes 29 tests across 6 files. Provider and task tests use mocks; they do not exercise Gemini or MongoDB Atlas live.

Build the client with:

```powershell
npm run build --workspace=@ai-task-manager/client
```

The server JavaScript can be syntax-checked with:

```powershell
Get-ChildItem server -Recurse -Filter *.js | ForEach-Object { node --check $_.FullName }
```

There is no browser/component test harness yet. The frontend has production-build validation; voice recognition, speech synthesis, Gemini calls, and account/task workflows still need end-to-end browser verification against a live database and provider.

Atlas connectivity and `GET /ready` were verified against the configured database. Task CRUD and authenticated-session persistence workflows still need live Atlas verification. The local Docker replica-set startup procedure has not been verified.

The Item 11 and Item 13 HTTP checks use injected MongoDB states; they verify both endpoints, status codes, safe response bodies, and request-ID headers. These are mocked application checks, not live MongoDB integration tests.

## Development workflow

1. Read `PROJECT_CONTEXT.md`, `SYSTEM_ARCHITECTURE.md`, `API_CONTRACT.md`, `DATABASE_DESIGN.md`, `IMPLEMENTATION_PLAN.md`, and `DEVELOPMENT_STATUS.md` before making changes.
2. Follow the authorized Phase 0 item and its acceptance criteria; do not begin Phase 1 without owner authorization.
3. Keep code in JavaScript/JSX and keep secrets out of source control, logs, and client bundles.
4. Update `DEVELOPMENT_STATUS.md` only with work and validation supported by repository evidence.

The six approved project documents are the source of truth for product behavior, API contracts, data design, architecture, and phase scope.

## Voice Grievance Desk

Signed-in users can open **Grievances** at `/grievances` to report an issue by browser microphone or text. Speech is shown in an editable transcript and is only submitted when the user presses Submit. The server first asks Gemini to structure the complaint when configured; malformed or unavailable Gemini responses fall back to a local JavaScript category/priority parser. Unclear category or location is returned as a clarification request instead of creating a ticket. A created ticket receives a unique `GR-...` ID and starts at `OPEN` in the separate MongoDB `grievances` collection.

The grievance desk supports personal ticket listing, status/category/priority filtering, keyword or ticket-ID search, ticket details and status history. Progress can also be checked by voice or text. Status changes and resolution notes are restricted to accounts whose server-side user record has `role: "ADMIN"`; new registrations always receive `USER`. Admin roles must be provisioned by an authorized operator in the database. The app does not provide a self-service role elevation or admin provisioning screen.

The feature reuses the authenticated HTTP-only session cookie, CSRF protection, server-side Gemini key, Zod validation and existing JavaScript stack. Browser speech recognition availability and supported languages depend on the browser. The local fallback currently recognizes a limited set of English category, location and explicit priority terms; it does not reliably infer arbitrary languages or exact dates. Missing category, location or priority triggers a clarification instead of an invented ticket. The admin view can filter by status/category/priority through the API, but a separate department taxonomy is not modeled. Live MongoDB persistence and real Gemini behavior must be verified in the target deployment; automated route tests use mocked persistence and Gemini responses.

## Render deployment

Deploy as one Render **Web Service**. Express serves the Vite production build and the API from the same origin, so the client keeps using relative `/api/v1` URLs and browser cookies remain first-party. The Vite proxy is for local development only. Express keeps `/health` and `/ready` available; the React SPA fallback does not capture API or operations paths.

Use these Render dashboard settings:

| Setting | Value |
| --- | --- |
| Runtime | Node |
| Root Directory | Leave blank (repository root) |
| Build Command | `npm ci && npm run build` |
| Start Command | `npm start` |
| Health Check Path | `/health` |

Set these environment variables in the Render service dashboard (never in source control):

| Variable | Value |
| --- | --- |
| `NODE_ENV` | `production` (enables Secure session cookies) |
| `PORT` | `10000` (Render's default web-service port; Render also supports configuring this value) |
| `MONGODB_URI` | MongoDB Atlas connection string, entered as a secret |
| `GEMINI_API_KEY` | Gemini API key, entered as a secret |
| `CORS_ALLOWED_ORIGINS` | Exact service origin, e.g. `https://your-service-name.onrender.com`; add the exact custom domain too if one is configured |
| `GEMINI_MODEL` | Optional; defaults to `gemini-2.5-flash`. Use only a model available under free-tier access. |

The MongoDB Atlas network access rules must allow the Render service to connect. Keep the Atlas URI and Gemini key in Render's secret environment settings; do not place either in a Vite/client variable. The production cookies use `Secure`, `HttpOnly`, and `SameSite=Lax`. Keep the worker disabled until reminder processing is implemented.

Render web services expect the process to bind to `0.0.0.0` and expose the configured port. Render's default web-service port is `10000`; the server reads it from `PORT`.
