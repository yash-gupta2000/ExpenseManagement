# Implementation Plan

## Expense Management System — Backend & Frontend

*Status: Draft — Follows API Design (05-api-design.md), Persistence Design (04-persistence-data-model-design-final.md), and Architecture V2 (03-technical-design-final.md)*

---

# 1. Project Structure

## Backend (`/backend`)

```
backend/
├── src/
│   ├── config/
│   │   ├── env.ts                  # Zod-validated environment schema
│   │   ├── database.ts             # Mongoose connection bootstrap
│   │   ├── redis.ts                # Redis client factory
│   │   ├── sqs.ts                  # AWS SQS client factory
│   │   └── s3.ts                   # AWS S3 client factory
│   │
│   ├── shared/
│   │   ├── errors/
│   │   │   ├── AppError.ts         # Base error class
│   │   │   ├── NotFoundError.ts
│   │   │   ├── ForbiddenError.ts
│   │   │   ├── ConflictError.ts
│   │   │   ├── ValidationError.ts
│   │   │   └── WorkflowError.ts
│   │   ├── types/
│   │   │   ├── RequestContext.ts   # { userId, tenantId, roles, traceId }
│   │   │   ├── PaginatedResult.ts
│   │   │   └── ApiResponse.ts
│   │   ├── logger.ts               # Structured JSON logger (pino)
│   │   └── utils/
│   │       ├── pagination.ts
│   │       └── idempotency.ts      # Redis idempotency key helpers
│   │
│   ├── middleware/
│   │   ├── authenticate.ts         # JWT validation, blocklist check
│   │   ├── authorize.ts            # Role-based gate factory
│   │   ├── requestContext.ts       # Attaches traceId + decoded user to req
│   │   ├── rateLimiter.ts          # Per-tenant rate limiting
│   │   ├── errorHandler.ts         # Global Express error handler
│   │   └── validate.ts             # Zod schema validator factory
│   │
│   ├── modules/
│   │   ├── auth/
│   │   │   ├── auth.routes.ts
│   │   │   ├── auth.controller.ts
│   │   │   ├── auth.service.ts
│   │   │   ├── auth.validator.ts
│   │   │   └── dto/
│   │   │       ├── LoginDto.ts
│   │   │       └── ChangePasswordDto.ts
│   │   │
│   │   ├── user/
│   │   │   ├── user.routes.ts
│   │   │   ├── user.controller.ts
│   │   │   ├── user.service.ts
│   │   │   ├── user.repository.ts
│   │   │   ├── user.validator.ts
│   │   │   ├── user.model.ts       # Mongoose schema
│   │   │   └── dto/
│   │   │       ├── CreateUserDto.ts
│   │   │       ├── UpdateUserDto.ts
│   │   │       └── AssignRolesDto.ts
│   │   │
│   │   ├── organization/
│   │   │   ├── organization.routes.ts
│   │   │   ├── organization.controller.ts
│   │   │   ├── organization.service.ts
│   │   │   ├── organization.repository.ts
│   │   │   ├── organization.validator.ts
│   │   │   ├── organization.model.ts
│   │   │   └── dto/
│   │   │       └── UpdateOrganizationSettingsDto.ts
│   │   │
│   │   ├── expense/
│   │   │   ├── expense.routes.ts
│   │   │   ├── expense.controller.ts
│   │   │   ├── expense.service.ts
│   │   │   ├── expense.repository.ts
│   │   │   ├── expense.validator.ts
│   │   │   ├── expense.model.ts
│   │   │   └── dto/
│   │   │       ├── CreateExpenseDto.ts
│   │   │       └── UpdateExpenseDto.ts
│   │   │
│   │   ├── workflow/
│   │   │   ├── workflow.routes.ts
│   │   │   ├── workflow.controller.ts
│   │   │   ├── workflow.service.ts
│   │   │   ├── category.repository.ts
│   │   │   ├── workflow.validator.ts
│   │   │   ├── expense-category.model.ts
│   │   │   ├── workflow.engine.ts      # Category lookup + chain selection + approver resolution
│   │   │   ├── workflow.state.ts       # Step advancement state machine
│   │   │   └── dto/
│   │   │       ├── WorkflowActionDto.ts
│   │   │       └── CreateCategoryDto.ts
│   │   │
│   │   ├── audit/
│   │   │   ├── audit.service.ts
│   │   │   ├── audit.repository.ts
│   │   │   ├── audit.routes.ts
│   │   │   ├── audit.controller.ts
│   │   │   └── audit.model.ts
│   │   │
│   │   ├── receipt/
│   │   │   ├── receipt.routes.ts
│   │   │   ├── receipt.controller.ts
│   │   │   ├── receipt.service.ts
│   │   │   └── receipt.validator.ts
│   │   │
│   │   └── notification/
│   │       ├── notification.service.ts     # enqueueNotification()
│   │       └── templates/
│   │           ├── approvalRequested.ts
│   │           ├── expenseApproved.ts
│   │           ├── expenseRejected.ts
│   │           ├── changesRequested.ts
│   │           └── expensePaid.ts
│   │
│   ├── workers/
│   │   └── notification.worker.ts      # SQS consumer, email dispatch
│   │
│   ├── events/
│   │   └── domainEvents.ts             # Typed event payload interfaces
│   │
│   ├── routes/
│   │   └── index.ts                    # Mounts all module routers under /api/v1
│   │
│   └── app.ts                          # Express app factory (no listen())
│   └── server.ts                       # Entry point: calls app.listen()
│
├── tests/
│   ├── unit/
│   │   └── <module>/
│   ├── integration/
│   │   └── <module>/
│   └── fixtures/
│       └── seed.ts
│
├── docker-compose.yml
├── .env.example
├── tsconfig.json
└── package.json
```

## Frontend (`/frontend`)

```
frontend/
├── src/
│   ├── app/                        # Next.js App Router
│   │   ├── (auth)/
│   │   │   └── login/
│   │   ├── (dashboard)/
│   │   │   ├── expenses/
│   │   │   ├── approvals/          # Manager queue
│   │   │   ├── admin/
│   │   │   │   ├── users/
│   │   │   │   └── expense-categories/
│   │   │   └── finance/
│   │   └── layout.tsx
│   ├── components/
│   ├── lib/
│   │   ├── api/                    # Typed API client wrappers
│   │   └── auth/                   # Token storage, refresh logic
│   └── types/
├── tsconfig.json
└── package.json
```

## Why This Structure

**Module-per-domain.** Each business domain gets its own folder containing its routes, controller, service, repository, model, validator, and DTOs. This enforces the module boundaries defined in the technical design — no cross-module file imports.

**Controller/Service/Repository separation.** Controllers parse HTTP concerns (req, res, params). Services contain business logic and call repositories. Repositories own all Mongoose queries. This makes services and repositories unit-testable in isolation.

**Shared errors and types at the top level.** Error classes, the `RequestContext` type, and pagination utilities are used by every module. Centralizing them prevents duplication and ensures consistent behavior across the system.

**Workers are isolated from modules.** The notification worker runs as a separate concern outside the module tree. It imports from the notification module's service but has its own entry point so it can be run as a separate process in production.

**`app.ts` vs `server.ts` split.** `app.ts` exports a configured Express application without calling `listen()`. This makes integration tests straightforward — tests import `app` without starting a real server port.

---

# 2. Module Dependencies

## Auth Module

| | |
|---|---|
| **Responsibilities** | Issue JWTs on login, validate tokens on every request via middleware, maintain Redis blocklist on logout and password change |
| **Depends on** | User Module (credential lookup, user context), Redis (blocklist), `shared/errors` |
| **Used by** | Every module (via `authenticate` middleware); User Module (password change triggers revocation) |

**Independent?** Partially. Auth Module depends on User Module for credential verification, but it is the first module consumed by all others. It should be built before any protected endpoint is implemented.

---

## User Module

| | |
|---|---|
| **Responsibilities** | CRUD for user accounts, role assignment, user lookup by ID and by role |
| **Depends on** | `shared/errors`, Organization Module (tenant validation on create), Role & Permission Module (role name validation) |
| **Used by** | Auth Module, Workflow Module (approver resolution), Notification Module (recipient lookup), Audit Module (actor name resolution) |

**Independent?** Nearly foundational. The `getUsersByRole` and `getUserById` interfaces are required by the Workflow Module. Build early.

---

## Role & Permission Module

| | |
|---|---|
| **Responsibilities** | Define the four roles, expose `can(userContext, action, resource)`, validate role names on assignment |
| **Depends on** | Nothing (stateless, no database) |
| **Used by** | Auth Module, User Module, all route authorization middleware |

**Independent?** Fully independent. Build first — it is a prerequisite for every authorization check.

---

## Organization Module

| | |
|---|---|
| **Responsibilities** | Tenant profile read, settings update |
| **Depends on** | `shared/errors` |
| **Used by** | User Module (tenant existence check on user create) |

**Independent?** Yes. Small and self-contained.

---

## Expense Module

| | |
|---|---|
| **Responsibilities** | Expense CRUD, status field management, status transition validation, `updateExpenseStatus` interface for Workflow Module |
| **Depends on** | Auth Module (context), Role & Permission Module (RBAC), Workflow Module (triggers `initializeWorkflow` on submit), Audit Module (records transitions), Receipt Module (validates `receiptKey` on create/update) |
| **Used by** | Workflow Module (reads expense data, calls `updateExpenseStatus`), Receipt Module (attach S3 key) |

**Independent?** No. Depends on Workflow Module for submission, making this a bidirectional dependency. Resolved by interface contracts: Expense Module calls `WorkflowModule.initializeWorkflow()`; Workflow Module calls `ExpenseModule.updateExpenseStatus()`. Implement expense CRUD first, then wire the submission flow once the Workflow Module exists.

---

## Workflow Module

| | |
|---|---|
| **Responsibilities** | Expense category CRUD, category lookup and chain selection at submission, approver chain resolution, step-by-step advancement, optimistic locking, idempotency enforcement |
| **Depends on** | User Module (`getUsersByRole`, `getUserById`), Expense Module (`updateExpenseStatus`), Audit Module (`record`), Notification Module (`enqueueNotification`), Redis (idempotency keys) |
| **Used by** | Expense Module (calls `initializeWorkflow`) |

**Independent?** No — the most dependency-heavy module. Build after User, Auth, Expense CRUD, and Audit are all functional.

---

## Audit Module

| | |
|---|---|
| **Responsibilities** | Append-only event recording, audit log retrieval |
| **Depends on** | Nothing (only writes and reads its own collection) |
| **Used by** | Workflow Module, Expense Module (mark-paid, withdraw) |

**Independent?** Yes. The simplest module to build — no outbound dependencies. Build early.

---

## Notification Module

| | |
|---|---|
| **Responsibilities** | Enqueue notification jobs to SQS (fire-and-forget) |
| **Depends on** | AWS SQS client |
| **Used by** | Workflow Module (post-commit enqueue) |

**Independent?** Yes, as a producer. The SQS worker is independently deployable.

---

## Receipt Module

| | |
|---|---|
| **Responsibilities** | Generate pre-signed S3 upload URLs, validate S3 key tenant ownership |
| **Depends on** | AWS S3 client |
| **Used by** | Expense Module (`validateFileOwnership` before persisting `receiptKey`) |

**Independent?** Yes. No database. Thin S3 gateway.

---

## Dependency Graph Summary

```
Role & Permission  ←── (no deps)
Organization       ←── (no deps)
Audit              ←── (no deps)
Receipt            ←── S3 only
Notification       ←── SQS only
User               ←── Role & Permission, Organization
Auth               ←── User, Redis
Expense            ←── Auth, Role & Permission, Receipt, Audit
Workflow           ←── User, Expense, Audit, Notification, Redis
```

Build order follows this dependency chain bottom-up.

---

# 3. Development Order

## Phase 1 — Foundation (no external dependencies)

**Role & Permission → Organization → Audit → Receipt → Notification**

These modules have no outbound dependencies. Role & Permission is pure in-memory logic. Organization is a minimal CRUD. Audit is append-only. Receipt and Notification are thin infrastructure gateways. Building these first unblocks everything above them.

## Phase 2 — User & Auth

**User → Auth**

User Module depends on Role & Permission (Phase 1). Auth Module depends on User. Once Auth is done, all protected routes become testable end-to-end.

## Phase 3 — Expense CRUD

**Expense (CRUD only, no workflow wiring)**

Build `createExpense`, `updateExpense`, `getExpense`, `listExpenses`, and `withdrawExpense`. Do not wire `submitExpense` → Workflow Module yet. This isolates the Expense aggregate so it can be tested independently before the Workflow Engine introduces transaction complexity.

## Phase 4 — Workflow Engine

**Expense Category CRUD → Workflow Engine (initialization + actions)**

Build expense category management first (CRUD, activate/deactivate, threshold and chain definition), then the engine: `initializeWorkflow`, `processAction` (approve, reject, send back). Wire the submission flow — `submitExpense` now calls `initializeWorkflow` inside a MongoDB transaction. Wire the workflow action endpoints.

## Phase 5 — Receipts & Audit Endpoints

Wire receipt upload to expense create/update. Expose the audit log endpoint. Both depend on Phase 3–4 work being stable.

## Phase 6 — Notifications

Wire SQS enqueue calls into the Workflow Module's post-commit hooks. Build the SQS consumer worker. Test notification delivery end-to-end.

## Phase 7 — Organization Settings

`GET /api/v1/organization` and `PUT /api/v1/organization/settings`. Depends on nothing from the workflow stack — can technically be built at any time after Phase 1, but placed here to avoid distracting from the critical path.

## Phase 8 — Frontend

Build the Next.js frontend after the backend API is stable. Avoids chasing a moving API contract.

## Phase 9 — Observability & Hardening

Structured logging, health endpoints, rate limiting, final integration test pass.

**Why this order minimizes rework:** The critical path is Auth → Expense → Workflow. Every phase delivers something independently testable. Notification failures in Phase 6 cannot regress the workflow correctness established in Phase 4. Frontend in Phase 8 consumes a frozen API.

---

# 4. Milestones

---

## Milestone 1 — Project Setup

**Goal:** Running Express server with database connectivity, shared infrastructure, and a working local development environment.

**Modules involved:** Config, Shared, Middleware (skeleton), App bootstrap

**Deliverables:**
- Express app factory (`app.ts`) with error handler middleware wired
- Zod-validated environment config (`config/env.ts`)
- Mongoose connection with replica set support
- Redis client
- Structured logger (pino) with `traceId` injection
- `requestContext` middleware attaching `traceId` to every request
- `GET /health` and `GET /health/ready` endpoints
- Docker Compose with MongoDB replica set, Redis
- `.env.example` with all required variables documented
- `tsconfig.json`, ESLint, Prettier, nodemon/ts-node dev scripts

**Dependencies:** None

**Exit criteria:**
- `GET /health` returns `200`
- `GET /health/ready` returns `200` when MongoDB and Redis are connected
- `GET /health/ready` returns `503` when either dependency is unreachable
- Structured logs appear in stdout on every request
- All team members can run the project locally with a single `docker compose up`

---

## Milestone 2 — Authentication

**Goal:** Login, logout, and change-password endpoints working with JWT issuance and Redis blocklist.

**Modules involved:** Auth, Role & Permission (static config), User (skeleton model only — just enough for credential lookup)

**Deliverables:**
- `POST /api/v1/auth/login` — issues signed JWT
- `POST /api/v1/auth/logout` — adds `jti` to Redis blocklist
- `POST /api/v1/auth/change-password` — changes hash, revokes current token
- `authenticate` middleware — validates JWT, checks blocklist, attaches `req.context`
- `authorize` middleware factory — gates routes by role
- JWT claims: `{ sub, tenantId, roles, jti, iat, exp }`
- Password hashing with bcrypt
- Zod validators for all auth request bodies
- User Mongoose model and repository (create user + find by email only at this stage)

**Dependencies:** Milestone 1

**Exit criteria:**
- Login with valid credentials returns a signed JWT
- Login with invalid credentials returns `401`
- Accessing a protected route without a token returns `401`
- Logout blacklists the token; subsequent requests with the same token return `401`
- Change password revokes the current token
- `authorize('orgAdmin')` middleware rejects non-admin callers with `403`

---

## Milestone 3 — User Management

**Goal:** Full user CRUD with role assignment, accessible behind auth and role guards.

**Modules involved:** User (complete), Organization (complete), Role & Permission (complete)

**Deliverables:**
- `POST /api/v1/users` — Org Admin creates user
- `GET /api/v1/users/:userId` — self or Org Admin
- `GET /api/v1/users` — Org Admin list with filters + pagination
- `PATCH /api/v1/users/:userId` — Org Admin (all fields) / self (limited fields)
- `PUT /api/v1/users/:userId/roles` — full role replacement
- `POST /api/v1/users/:userId/activate` and `/deactivate`
- `GET /api/v1/organization` and `PUT /api/v1/organization/settings`
- Mongoose indexes on `users`: `{ tenantId, email }` unique, `{ tenantId, roles }`, `{ tenantId, department, roles }`
- Zod validators for all request bodies
- `passwordHash` never returned in any response

**Dependencies:** Milestone 2

**Exit criteria:**
- Org Admin can create, list, update, activate, and deactivate users
- Non-admin users cannot access other users' profiles (returns `404` not `403`)
- Email uniqueness constraint enforced within tenant (`409`)
- `managerId` references an active user in the same tenant
- Cannot deactivate last active Org Admin (`409`)
- Password hash never appears in any API response
- Pagination, filtering, and sorting work correctly on `GET /users`

---

## Milestone 4 — Expense CRUD

**Goal:** Full expense lifecycle except for submit (workflow not yet wired). Expenses can be created, updated, and read.

**Modules involved:** Expense (CRUD only), Receipt (S3 pre-signed URL)

**Deliverables:**
- `POST /api/v1/expenses` — create DRAFT
- `PATCH /api/v1/expenses/:expenseId` — update DRAFT
- `GET /api/v1/expenses/:expenseId` — full record
- `GET /api/v1/expenses` — list with role-scoped visibility, filters, pagination
- `POST /api/v1/receipts/upload-url` — pre-signed S3 URL
- `GET /api/v1/expenses/:expenseId/receipt` — metadata + download URL
- Expense Mongoose model with all fields; indexes: `{ tenantId, submittedBy, status }`, `{ tenantId, status }`, `{ tenantId, createdAt }`
- `receiptKey` validation: Receipt Module `validateFileOwnership()` called before persistence
- Role-scoped list visibility enforced (Employee sees own only; Finance Admin / Org Admin sees all)
- Amount stored in cents (integer); input validated as positive integer

**Dependencies:** Milestone 3

**Exit criteria:**
- Employee can create and update their own DRAFT expenses
- Non-submitter cannot update another user's expense (returns `404`)
- Receipt upload flow works end-to-end (pre-signed URL → S3 → `receiptKey` on expense)
- Invalid `receiptKey` (wrong tenant prefix) is rejected with `422`
- List endpoint returns correct subset for each role
- Pagination, filtering (status, category, date range, amount range), and sorting work

---

## Milestone 5 — Workflow Engine

**Goal:** Full submit-to-approve/reject/send-back lifecycle operational with MongoDB transactions, optimistic locking, and idempotency.

**Modules involved:** Workflow (rule CRUD + engine), Expense (submit + withdraw wired), Audit (writes inside transactions)

**Deliverables:**
- `POST /api/v1/expense-categories` — create category (inactive by default)
- `GET /api/v1/expense-categories`, `GET /api/v1/expense-categories/:categoryId`
- `PATCH /api/v1/expense-categories/:categoryId`
- `POST /api/v1/expense-categories/:categoryId/activate` and `/deactivate`
- `POST /api/v1/expenses/:expenseId/submit` — triggers `initializeWorkflow` inside MongoDB transaction
- `POST /api/v1/expenses/:expenseId/withdraw`
- `POST /api/v1/expenses/:expenseId/workflow/approve`
- `POST /api/v1/expenses/:expenseId/workflow/reject`
- `POST /api/v1/expenses/:expenseId/workflow/send-back`
- `POST /api/v1/expenses/:expenseId/mark-paid`
- `GET /api/v1/expenses/:expenseId/audit-log`
- Workflow engine: category lookup by `categoryId`, threshold comparison to select standard or elevated chain, approver chain resolution, self-approval skip + Finance Admin escalation fallback
- Optimistic lock on `workflowInstance.version`
- Redis idempotency keys for all workflow actions
- MongoDB transactions for: submit, approve (intermediate + final), reject, send back, mark paid, withdraw
- Audit Module wired synchronously inside every transaction
- Mongoose indexes: multikey on `{ tenantId, workflowInstance.steps.approverId, workflowInstance.steps.status }`

**Dependencies:** Milestone 4

**Exit criteria:**
- Submitting an expense creates a workflow instance with a resolved approval chain using the correct chain type (standard or elevated)
- Submit under a deactivated category returns `422` with `CATEGORY_DEACTIVATED` code; expense stays DRAFT
- Approver resolution failure returns `422`; expense stays DRAFT
- Approve advances to next step or transitions to `APPROVED` on final step
- Reject terminates workflow; expense transitions to `REJECTED`
- Send Back archives workflow to history; expense returns to `DRAFT`
- Self-approval is skipped; if all steps skipped, escalates to Finance Admin
- Concurrent approve requests: second request returns `409 CONFLICT` (optimistic lock)
- Duplicate idempotency key returns cached response with `X-Idempotent-Replay: true`
- Every workflow action produces an audit log entry
- Mark-paid transitions `APPROVED → PAID` (Finance Admin only)
- Withdraw returns `SUBMITTED` expense to `DRAFT`
- All state transitions are atomic (no partial state possible if MongoDB connection drops mid-transaction)

---

## Milestone 6 — Notifications

**Goal:** Email notifications dispatched asynchronously via SQS for all workflow events.

**Modules involved:** Notification (producer), SQS Worker (consumer)

**Deliverables:**
- `Notification.service.ts` — `enqueueNotification(event)` calls SQS `SendMessage`
- Notification events wired post-commit in Workflow Module: `APPROVAL_REQUESTED`, `EXPENSE_APPROVED`, `EXPENSE_REJECTED`, `CHANGES_REQUESTED`, `EXPENSE_PAID`
- SQS consumer worker (`workers/notification.worker.ts`): polls queue, resolves recipient email from User Module, renders template, dispatches via SES (or stub)
- Dead Letter Queue configuration
- `notificationRecords` collection writes (status: `ENQUEUED → SENT / FAILED`)
- Retry logic with exponential backoff (SQS visibility timeout as the mechanism)
- `traceId` propagated from SQS message into worker log lines

**Dependencies:** Milestone 5

**Exit criteria:**
- Approver receives an email when an expense is submitted for their review
- Submitter receives emails on approval, rejection, and send-back
- Finance Admin receives email when expense is fully approved (payment pending)
- Submitter receives email when expense is marked paid
- A notification failure does not roll back any business state
- Failed messages after retry exhaustion land in DLQ
- Worker logs include `traceId`, `notificationType`, `recipientUserId`

---

## Milestone 7 — Frontend

**Goal:** Functional role-based UI for all four personas.

**Modules involved:** Next.js frontend (all views)

**Deliverables:**
- Login page
- Employee: expense list, create/edit draft, submit, withdraw, status tracking
- Manager: approval queue (pending step), approve / reject / send-back with comment
- Finance Admin: all expenses list with filters, mark-paid, audit log view
- Org Admin: user management (create, list, edit roles, activate/deactivate), workflow rule management
- Shared: JWT storage, auth redirect guard, role-based route protection
- Typed API client wrappers for all endpoints
- Expense detail page (full workflow history, receipt download)

**Dependencies:** Milestone 5 (API complete and stable)

**Exit criteria:**
- Each persona can complete their full workflow end-to-end through the UI
- Role-based navigation shows only permitted sections
- Token expiry redirects to login without loss of the current URL
- Receipt upload works via pre-signed URL flow (no binary through API server)
- Error states display user-friendly messages

---

## Milestone 8 — Observability & Hardening

**Goal:** Production-ready logging, rate limiting, health checks, and final security pass.

**Modules involved:** All (cross-cutting)

**Deliverables:**
- Structured JSON logs on all business operations with `{ timestamp, level, traceId, tenantId, userId, module, action, durationMs, error? }`
- Per-tenant rate limiting on mutation endpoints (`express-rate-limit` + Redis store)
- `GET /health` and `GET /health/ready` verified in all environments
- `Retry-After` header on `429` responses
- Final RBAC audit: every endpoint in the Authorization Matrix verified against implementation
- `tenantId` filter enforcement verified by integration test suite on every data access path
- `passwordHash` excluded from all responses — test asserts this
- Stack traces never returned to clients — only `traceId` in error responses

**Dependencies:** Milestones 1–7

**Exit criteria:**
- All endpoints log at the correct level with all required fields
- Rate limiting triggers on burst requests from a single tenant
- Cross-tenant data isolation verified by integration tests
- Authorization Matrix table from API Design Section 12 is tested endpoint-by-endpoint

---

# 5. Feature Breakdown

## Auth Module

**Features:** Login, logout, change password, JWT issuance, token revocation, per-request authentication

**Classes/Services:**
- `AuthService` — `login()`, `logout()`, `changePassword()`
- `TokenService` — `issue()`, `verify()`, `revoke()`, `isRevoked()`

**Repositories:** None (delegates to User Module for credential lookup; Redis directly for blocklist)

**Events:** None (token revocation is synchronous)

**Workers:** None

---

## User Module

**Features:** Create user, get user, list users, update user, assign roles, activate/deactivate

**Classes/Services:**
- `UserService` — `createUser()`, `getUserById()`, `getUsersByRole()`, `listUsers()`, `updateUser()`, `assignRoles()`, `activate()`, `deactivate()`
- `UserRepository` — all Mongoose queries

**Repositories:** `UserRepository`

**Events:** None (role changes do not currently emit events — noted as a future hook point for token revocation)

**Workers:** None

---

## Organization Module

**Features:** Get organization profile, update settings

**Classes/Services:**
- `OrganizationService` — `getOrganization()`, `updateSettings()`
- `OrganizationRepository`

---

## Expense Module

**Features:** Create draft, update draft, submit, withdraw, get expense, list expenses, update status (internal interface)

**Classes/Services:**
- `ExpenseService` — all public operations
- `ExpenseRepository` — Mongoose queries; enforces `tenantId` on every query method signature

**Repositories:** `ExpenseRepository`

**Events (produced, consumed by other modules):**
- `ExpenseSubmitted` (sync, triggers `WorkflowModule.initializeWorkflow`)
- `ExpenseWithdrawn` (sync, triggers Audit record)
- `ExpensePaid` (sync, triggers Audit record + Notification enqueue)

---

## Workflow Module

**Features:** Category CRUD, category lookup and chain selection, approver resolution, workflow initialization, approve, reject, send back, idempotency enforcement, optimistic locking

**Classes/Services:**
- `WorkflowService` — public interface: `initializeWorkflow()`, `processAction()`, `getWorkflowInstance()`
- `CategoryService` — `createCategory()`, `updateCategory()`, `activateCategory()`, `deactivateCategory()`, `listCategories()`
- `WorkflowEngine` — `selectChain(expense, category)` → `{ chain, chainType }`; `resolveApproverChain(chain, expense, tenantId)` → ordered steps
- `WorkflowStateMachine` — `advance(instance, action, actorId)` → next instance state
- `CategoryRepository` — Mongoose queries for `expenseCategories`

**Repositories:** `CategoryRepository` (expenses are queried via Expense Module's repository)

**Events (produced):**
- `WorkflowStarted` → Notification Module (async, post-commit)
- `WorkflowStepApproved` → Audit (sync), Notification Module (async)
- `WorkflowCompleted` → Audit (sync), Notification Module (async)
- `ExpenseRejected` → Audit (sync), Notification Module (async)
- `ExpenseSentBack` → Audit (sync), Notification Module (async)

**Workers:** None (Workflow Module is synchronous; notifications are handed off to Notification Module)

---

## Audit Module

**Features:** Record event, get audit log for expense

**Classes/Services:**
- `AuditService` — `record(event)`, `getAuditLog(expenseId, tenantId)`
- `AuditRepository`

**Repositories:** `AuditRepository`

**Events:** Consumes all workflow events synchronously (called directly, not via message bus)

**Workers:** None

---

## Receipt Module

**Features:** Generate pre-signed upload URL, validate file ownership

**Classes/Services:**
- `ReceiptService` — `getUploadUrl(filename, contentType, tenantId)`, `validateFileOwnership(s3Key, tenantId)`, `getDownloadUrl(s3Key)`

**Repositories:** None (S3 only)

**Events:** None

**Workers:** None

---

## Notification Module

**Features:** Enqueue notification to SQS

**Classes/Services:**
- `NotificationService` — `enqueueNotification(event: NotificationEvent)`

**Repositories:** `NotificationRecordRepository` (optional MVP observability write)

**Events:** Consumes domain events from Workflow Module (called post-commit)

**Workers:** `notification.worker.ts` — SQS long-poll consumer, resolves recipient, renders template, calls SES

---

# 6. Event Flow

All events in this system are in-process function calls (not a message bus). "Async" below means the call is made after the MongoDB transaction commits but still within the same request. SQS is the only out-of-process async boundary.

---

### `ExpenseSubmitted`

| Field | Value |
|---|---|
| **Producer** | Expense Module (`submitExpense`) |
| **Consumer** | Workflow Module (`initializeWorkflow`) |
| **Payload** | `{ expenseId, tenantId, amount, currency, category, submittedBy, department }` |
| **Processing** | Sync, inside MongoDB transaction |
| **On failure** | Transaction rolls back; expense stays DRAFT |

---

### `WorkflowStarted`

| Field | Value |
|---|---|
| **Producer** | Workflow Module (after `initializeWorkflow` completes) |
| **Consumer** | Notification Module (`APPROVAL_REQUESTED`) |
| **Payload** | `{ expenseId, tenantId, workflowInstanceId, approverId, submittedBy, expenseTitle, amount }` |
| **Processing** | Async, post-commit SQS enqueue |
| **On failure** | Logged; does not affect workflow state |

---

### `WorkflowStepApproved`

| Field | Value |
|---|---|
| **Producer** | Workflow Module (`processAction(APPROVE)`, intermediate step) |
| **Consumer** | Audit Module (sync, in-transaction), Notification Module (async, next approver `APPROVAL_REQUESTED`) |
| **Payload** | `{ expenseId, tenantId, workflowInstanceId, stepIndex, actorId, comment }` |
| **Processing** | Audit: sync in-transaction. Notification: async post-commit |

---

### `WorkflowCompleted`

| Field | Value |
|---|---|
| **Producer** | Workflow Module (`processAction(APPROVE)`, final step) |
| **Consumer** | Audit Module (sync, `FULLY_APPROVED`), Notification Module (async, `EXPENSE_APPROVED` to submitter) |
| **Payload** | `{ expenseId, tenantId, workflowInstanceId, actorId, comment }` |
| **Processing** | Audit: sync in-transaction. Notification: async post-commit |

---

### `ExpenseRejected`

| Field | Value |
|---|---|
| **Producer** | Workflow Module (`processAction(REJECT)`) |
| **Consumer** | Audit Module (sync, `REJECTED`), Notification Module (async, `EXPENSE_REJECTED` to submitter) |
| **Payload** | `{ expenseId, tenantId, workflowInstanceId, stepIndex, actorId, comment }` |
| **Processing** | Audit: sync in-transaction. Notification: async post-commit |

---

### `ExpenseSentBack`

| Field | Value |
|---|---|
| **Producer** | Workflow Module (`processAction(SEND_BACK)`) |
| **Consumer** | Audit Module (sync, `SENT_BACK`), Notification Module (async, `CHANGES_REQUESTED` to submitter) |
| **Payload** | `{ expenseId, tenantId, workflowInstanceId, stepIndex, actorId, comment }` |
| **Processing** | Audit: sync in-transaction. Notification: async post-commit |

---

### `ExpensePaid`

| Field | Value |
|---|---|
| **Producer** | Expense Module (`markAsPaid`) |
| **Consumer** | Audit Module (sync, `MARKED_PAID`), Notification Module (async, `EXPENSE_PAID` to submitter) |
| **Payload** | `{ expenseId, tenantId, actorId }` |
| **Processing** | Audit: sync in-transaction. Notification: async post-commit |

---

### `ExpenseWithdrawn`

| Field | Value |
|---|---|
| **Producer** | Expense Module (`withdrawExpense`) |
| **Consumer** | Audit Module (sync, `WITHDRAWN`) |
| **Payload** | `{ expenseId, tenantId, actorId }` |
| **Processing** | Sync, inside MongoDB transaction |

---

### `NotificationRequested` (SQS message)

| Field | Value |
|---|---|
| **Producer** | Notification Module (`enqueueNotification`) |
| **Consumer** | Notification Worker (SQS long-poll) |
| **Payload** | `{ notificationType, recipientUserId, tenantId, expenseId, workflowInstanceId?, actorId?, traceId, metadata }` |
| **Processing** | Async, out-of-process via SQS |
| **On failure** | SQS retry with backoff; DLQ after 3 attempts |

---

# 7. Background Processing

## Notification Worker

**File:** `src/workers/notification.worker.ts`

**Responsibility:** Long-poll the SQS notification queue, resolve the recipient's email address via User Module, render the appropriate email template, dispatch via Amazon SES.

**Startup:** The worker runs as a separate Node.js process. In production it can be a separate ECS task or Lambda. In development it is started via a separate npm script.

**Poll loop:**
1. `ReceiveMessage` from SQS (long-poll, `WaitTimeSeconds: 20`, `MaxNumberOfMessages: 10`)
2. For each message:
   a. Parse payload
   b. Resolve recipient email: `UserModule.getUserById(recipientUserId, tenantId)`
   c. Render template based on `notificationType`
   d. Call SES `SendEmail`
   e. On success: `DeleteMessage` from SQS; write `notificationRecords` status `SENT`
   f. On failure: do NOT delete message; SQS retries after visibility timeout
3. After max delivery attempts (default 3), message moves to DLQ automatically

**Retry strategy:** SQS visibility timeout acts as the retry delay. Set to 30s initially, increasing per retry via DLQ redrive policy configuration. Exponential backoff is handled by SQS, not application code.

**Dead Letter Queue:**
- Separate SQS queue named `{queue-name}-dlq`
- `maxReceiveCount: 3` on source queue
- CloudWatch alarm on DLQ `ApproximateNumberOfMessagesVisible > 0`
- DLQ messages are retained for 14 days for manual inspection and replay

**`traceId` propagation:** The `traceId` from the original request is included in the SQS message payload. The worker extracts it and uses it as a log field for all log lines related to that message, enabling full cross-process trace correlation.

**notificationRecords write:** After successful send, write a document to `notificationRecords` with status `SENT` and `processedAt`. On final failure before DLQ move, write status `FAILED`. This collection is the observability surface for notification delivery.

---

# 8. Configuration

All environment variables are validated at startup via a Zod schema in `src/config/env.ts`. The process exits immediately if any required variable is missing or fails validation.

| Variable | Purpose |
|---|---|
| `NODE_ENV` | `development`, `staging`, `production`. Controls log level, error verbosity. |
| `PORT` | Express listen port. Default `3000`. |
| `MONGODB_URI` | Full MongoDB connection string. Must include a replica set name for transaction support. Example: `mongodb://localhost:27017/expensedb?replicaSet=rs0` |
| `REDIS_URL` | Redis connection URL. Example: `redis://localhost:6379` |
| `JWT_SECRET` | HS256 signing secret. Min 32 characters. Use RS256 keys in production. |
| `JWT_EXPIRES_IN` | Token TTL. Default `3600` (1 hour). |
| `BCRYPT_ROUNDS` | bcrypt salt rounds. Default `12`. |
| `AWS_REGION` | AWS region for SQS and S3. Example: `us-east-1` |
| `AWS_ACCESS_KEY_ID` | AWS credentials. Use IAM roles in production instead. |
| `AWS_SECRET_ACCESS_KEY` | AWS credentials. |
| `SQS_QUEUE_URL` | Full URL of the notification SQS queue. |
| `SQS_DLQ_URL` | Full URL of the Dead Letter Queue (for monitoring reference). |
| `S3_BUCKET_NAME` | S3 bucket for receipt storage. |
| `S3_UPLOAD_URL_EXPIRES_IN` | Pre-signed upload URL TTL in seconds. Default `300`. |
| `S3_DOWNLOAD_URL_EXPIRES_IN` | Pre-signed download URL TTL in seconds. Default `300`. |
| `MAX_RECEIPT_SIZE_BYTES` | Maximum receipt file size S3 enforces via upload condition. Default `10485760` (10 MB). |
| `RATE_LIMIT_WINDOW_MS` | Rate limiter window in milliseconds. Default `60000`. |
| `RATE_LIMIT_MAX_REQUESTS` | Maximum requests per tenant per window. Default `200`. |
| `SES_FROM_ADDRESS` | Sender email address for SES dispatch. |
| `LOG_LEVEL` | Pino log level. Default `info`. Set to `debug` in development. |

---

# 9. Error Handling Strategy

## Error Class Hierarchy

All domain errors extend a base `AppError` class that carries `statusCode`, `code` (machine-readable), and `message`.

```
AppError (base)
├── ValidationError       → 422, code: VALIDATION_ERROR
├── NotFoundError         → 404, code: NOT_FOUND
├── ForbiddenError        → 403, code: FORBIDDEN
├── UnauthorizedError     → 401, code: UNAUTHORIZED
├── ConflictError         → 409, code: CONFLICT
├── WorkflowError         → 422, code: CATEGORY_DEACTIVATED / APPROVER_RESOLUTION_FAILED
├── DuplicateActionError  → 409, code: DUPLICATE_ACTION
└── InfrastructureError   → 503, code: SERVICE_UNAVAILABLE
```

## Global Error Middleware

`src/middleware/errorHandler.ts` is the last middleware registered on the Express app. It:

1. Catches all errors passed to `next(err)`
2. Maps `AppError` subclasses to their `statusCode`
3. Maps Mongoose `ValidationError` and `CastError` to `422`
4. Maps Mongoose duplicate key error (code 11000) to `409`
5. Maps unknown errors to `500`
6. Logs the full error with `traceId`, `tenantId`, `userId`, and stack trace at `ERROR` level — **server-side only**
7. Returns the sanitized error envelope to the client — **no stack traces, no internal details**

```json
{
  "error": {
    "code": "CONFLICT",
    "message": "...",
    "traceId": "uuid",
    "details": [...]
  }
}
```

## Validation Errors

Zod validation is run in `src/middleware/validate.ts`. It is a factory that accepts a Zod schema and returns an Express middleware. On failure it collects all field errors and throws a `ValidationError` with a `details` array. The global error handler serializes the details into the response. All validation errors for a request are returned together.

## Domain Errors

Services throw typed `AppError` subclasses. They never return `null` or `undefined` to signal failure — they throw. Controllers do not contain try/catch; they let errors propagate to the global handler via `next()`.

## Infrastructure Errors

MongoDB and Redis errors are caught at the repository and service layers. If a MongoDB transaction fails mid-flight, Mongoose rolls it back automatically and throws. The service re-throws as a `ConflictError` (for version mismatch) or `InfrastructureError` (for connectivity). Redis unavailability in the blocklist check is caught and logged as a warning; the request proceeds (fail-open as per design).

## Logging Strategy

- `ERROR`: Unhandled exceptions, transaction rollbacks, SQS publish failures
- `WARN`: Redis unavailability, SQS enqueue failure (non-blocking), DLQ depth alerts
- `INFO`: All business events (`expense.submitted`, `workflow.step.approved`, etc.), request start/end
- `DEBUG`: Category lookup result, chain type selected, approver resolution details (development only)

Every log line includes: `{ timestamp, level, traceId, tenantId, userId, module, action, durationMs }`. Errors additionally include: `{ error.message, error.code, error.stack (server-side only) }`.

---

# 10. Testing Strategy

## Milestone 1 — Project Setup

**Unit tests:**
- Env config rejects missing required variables
- Logger emits structured JSON with expected fields

**Integration tests:**
- `GET /health` returns 200
- `GET /health/ready` returns 200 with MongoDB + Redis up, 503 with either down

---

## Milestone 2 — Authentication

**Unit tests:**
- `TokenService.issue()` produces a valid JWT with correct claims
- `TokenService.verify()` rejects expired and tampered tokens
- `AuthService.login()` returns token on correct credentials, throws on wrong password
- `AuthService.logout()` writes correct Redis key with correct TTL

**Integration tests:**
- `POST /auth/login` happy path returns token with correct claims
- `POST /auth/login` with wrong password returns `401`
- `POST /auth/logout` blacklists token; subsequent authenticated request returns `401`
- `POST /auth/change-password` with wrong current password returns `401`
- Protected endpoint without token returns `401`
- Protected endpoint with `orgAdmin`-only guard rejects `employee` role with `403`

---

## Milestone 3 — User Management

**Unit tests:**
- `UserService.createUser()` throws `ConflictError` on duplicate email in tenant
- `UserService.deactivate()` throws `ConflictError` when deactivating last Org Admin
- `UserRepository` enforces `tenantId` on all query methods (cross-tenant assertion)

**Integration tests:**
- Full CRUD flow for Org Admin creating and managing users
- Non-admin cannot access another user's profile (assert `404` not `403`)
- `PUT /users/:id/roles` is a full replacement (not additive)
- `PATCH /users/:id` self-update cannot modify `roles` or `department`
- `passwordHash` never present in any response body

---

## Milestone 4 — Expense CRUD

**Unit tests:**
- `ExpenseService.createExpense()` rejects future dates, amount `0`, invalid currency
- `ReceiptService.validateFileOwnership()` rejects S3 keys with wrong tenant prefix
- `ExpenseRepository` enforces `tenantId` on all queries

**Integration tests:**
- Employee can only see their own expenses in the list
- Finance Admin sees all expenses in the tenant
- Manager sees own + assigned (none yet — workflow not wired)
- `PATCH /expenses/:id` returns `409` if expense is not in `DRAFT`
- Receipt upload flow: `POST /receipts/upload-url` → upload to S3 → attach key to expense → `GET /expenses/:id/receipt` returns download URL

---

## Milestone 5 — Workflow Engine

This milestone has the highest testing density. Workflow correctness is the most critical property of the system.

**Unit tests:**
- `WorkflowEngine.selectChain()`: amount at or below threshold selects standard chain; amount above threshold selects elevated chain
- `WorkflowEngine.selectChain()`: deactivated category throws `WorkflowError` with `CATEGORY_DEACTIVATED` before chain selection
- `WorkflowEngine.resolveApproverChain()`: ROLE, USER, MANAGER resolver types all resolve correctly
- `WorkflowEngine.resolveApproverChain()`: self-approval step is skipped; all-skipped escalates to Finance Admin
- `WorkflowStateMachine.advance()`: intermediate approve activates next step
- `WorkflowStateMachine.advance()`: final approve completes instance
- `WorkflowStateMachine.advance()`: reject terminates instance
- `WorkflowStateMachine.advance()`: send-back archives instance to history
- Optimistic lock: update filter with stale version matches 0 documents → `ConflictError`
- Idempotency: duplicate Redis key returns cached response without touching MongoDB

**Integration tests:**
- Full submit → approve → approve → mark paid flow (2-step chain)
- Full submit → reject flow
- Full submit → send back → update → resubmit flow (new workflow instance created)
- Self-approval skipped; expense escalated to Finance Admin if all steps skipped
- Submit under a deactivated category returns `422 CATEGORY_DEACTIVATED`
- Concurrent approve requests: second returns `409` (optimistic lock)
- Duplicate approve with same idempotency key returns cached `200` with `X-Idempotent-Replay: true`
- Audit log contains correct entries for each action in chronological order
- `workflowHistory` contains archived instance after send-back

**Cross-tenant isolation tests (critical):**
- User in tenant A cannot access expenses in tenant B via any endpoint
- Expense category from tenant A is not used for expenses in tenant B

---

## Milestone 6 — Notifications

**Unit tests:**
- `NotificationService.enqueueNotification()` calls SQS `SendMessage` with correct payload
- SQS failure does not throw (fire-and-forget); logs warning

**Integration tests:**
- Notification is enqueued after successful submit (verify SQS mock received message)
- Notification is NOT enqueued if transaction rolls back
- Worker processes SQS message, calls SES with correct recipient and template
- Message moves to DLQ after 3 failed delivery attempts
- `traceId` in SQS message matches originating request's `traceId` in worker logs

---

## Milestone 7 — Frontend

**E2E tests (Playwright or Cypress):**
- Employee: create draft → submit → view status
- Manager: log in → see approval queue → approve expense
- Finance Admin: view approved expenses → mark paid
- Org Admin: create user → assign role → create expense category → activate category
- Token expiry: session expires → redirect to login

---

## Milestone 8 — Observability & Hardening

**Integration tests:**
- Rate limiter returns `429` with `Retry-After` header after burst
- Every endpoint in the Authorization Matrix (API Design Section 12) tested for correct allow/deny behavior
- Every data read endpoint verified to enforce `tenantId` filter (assert no cross-tenant data returned)
- `passwordHash` field asserted absent from all response bodies that include user data

---

# 11. Local Development Setup

## Required Services

- **MongoDB** — replica set mode (required for multi-document transactions)
- **Redis** — JWT blocklist and idempotency keys
- **LocalStack** — emulates AWS SQS and S3 locally

## Docker Compose

`docker-compose.yml` provides:

```yaml
services:
  mongo1:         # MongoDB primary
  mongo2:         # MongoDB secondary
  mongo3:         # MongoDB arbiter
  mongo-init:     # One-shot container that runs rs.initiate()
  redis:          # Single Redis instance
  localstack:     # Emulates SQS and S3 (services: sqs,s3)
```

MongoDB replica set is required from day one because transactions are required in Milestone 5. Starting with a standalone MongoDB and switching later causes development environment drift.

## LocalStack Setup

A startup script (`scripts/localstack-init.sh`) runs after LocalStack is healthy:
- Creates SQS queue and DLQ
- Creates S3 bucket
- Outputs queue URL and bucket name to stdout for `.env` population

## Environment

Copy `.env.example` to `.env.local`. All AWS endpoints point to `http://localhost:4566` (LocalStack) in development. `AWS_ACCESS_KEY_ID` and `AWS_SECRET_ACCESS_KEY` are set to `test` / `test` for LocalStack.

## Seed Data

`tests/fixtures/seed.ts` is a runnable script that creates:
- One organization (tenant)
- One user per role: `employee@test.com`, `manager@test.com`, `financeadmin@test.com`, `orgadmin@test.com` — all with password `Password1`
- Two expense categories: a "General" category (Finance Admin standard chain, higher threshold) and a "Travel" category (Manager standard chain, elevated chain with Finance Admin, lower threshold)

Run via: `npm run seed`

## Development Scripts

```json
{
  "dev": "nodemon src/server.ts",
  "dev:worker": "nodemon src/workers/notification.worker.ts",
  "seed": "ts-node tests/fixtures/seed.ts",
  "test": "jest",
  "test:integration": "jest --testPathPattern=integration",
  "lint": "eslint src --ext .ts",
  "typecheck": "tsc --noEmit"
}
```

The API server and the notification worker are separate processes. Run both in development to test the full notification flow.

---

# 12. Deployment Considerations

## Environment Separation

Three environments: `development` (local Docker), `staging` (AWS, mirrors production), `production` (AWS).

All environment-specific values are provided via environment variables. No environment-specific code paths exist in the application — only behavior differences driven by config values.

## Secrets Management

In production, secrets (`JWT_SECRET`, `AWS_SECRET_ACCESS_KEY`, database credentials) are stored in AWS Secrets Manager and injected into the container environment at startup. Never commit secrets to source control. `.env.example` documents required variables with placeholder values only.

## Health Endpoints

- `GET /health` — liveness. Returns `200 { status: "ok" }` if the Node process is alive.
- `GET /health/ready` — readiness. Checks MongoDB ping and Redis ping. Returns `200` if both succeed, `503` with a descriptive body if either fails. Load balancers use this endpoint to gate traffic.

## Logging

Structured JSON logs are emitted to stdout. The container orchestrator (ECS, Kubernetes) captures stdout and forwards to CloudWatch Logs or equivalent. Log level is controlled by `LOG_LEVEL` environment variable. Never log `passwordHash`, raw JWT tokens, or AWS credentials.

## Monitoring

- CloudWatch alarm on SQS DLQ `ApproximateNumberOfMessagesVisible > 0`
- CloudWatch alarm on API server `5xx` error rate
- MongoDB Atlas (or self-hosted) monitoring for replication lag and slow queries
- Redis memory usage alert

## Container

The application is packaged as a single Docker image. The notification worker runs as a separate container from the same image with a different `CMD` (`node dist/workers/notification.worker.js`). This keeps image builds simple while allowing independent scaling.

---

# 13. Risks During Implementation

### Risk 1 — MongoDB Transaction Misuse

**Description:** Multi-document transactions in MongoDB require a replica set. Developers running a standalone MongoDB will not encounter transaction errors locally but will fail in staging.

**Mitigation:** Enforce replica set in `docker-compose.yml` from day one. Add a startup check in `config/database.ts` that reads `db.isMaster()` and logs a clear error if replica set is not configured. Fail fast rather than silently fall back to non-transactional mode.

---

### Risk 2 — Workflow State Bugs

**Description:** The `WorkflowStateMachine` has complex conditional logic (intermediate vs. final approval, skip-and-escalate, send-back-and-archive). Bugs here produce irreversible expense states.

**Mitigation:** Unit test every state transition path in `WorkflowStateMachine` before integration. Model the state machine as a pure function of `(currentState, action) → nextState` so it is testable without a database. Run the full submit-approve-reject-send-back integration test suite before merging any workflow change.

---

### Risk 3 — Optimistic Lock False Conflicts

**Description:** If the `version` filter is applied incorrectly (e.g., not incremented on every write, or not included in the update filter), concurrent requests will silently double-process or fail spuriously.

**Mitigation:** Centralize all workflow document updates in `WorkflowStateMachine`. Never write `workflowInstance` directly from a controller or service — always go through the state machine function that returns the next state including the incremented version. Integration test concurrent requests using Promise.all with the same idempotency key.

---

### Risk 4 — Duplicate Audit Entries

**Description:** A retry or duplicate request that bypasses the idempotency check could produce two audit entries for the same action.

**Mitigation:** Idempotency key check must happen before the MongoDB transaction opens. Cache write (Redis) must happen after the transaction commits, not before. Write the idempotency key with a `NX` (set-if-not-exists) flag so concurrent duplicates do not both proceed. Test the gap between "key not found" and "key written" explicitly.

---

### Risk 5 — Cross-Tenant Data Leaks

**Description:** Forgetting `tenantId` in a query returns data from all tenants.

**Mitigation:** `tenantId` is a required parameter on every repository method signature — not an optional filter. TypeScript enforces the signature. Integration tests assert cross-tenant isolation on every data read path (a test that creates two tenants, inserts data in both, and verifies neither can read the other's data). Run this test class in CI on every PR.

---

### Risk 6 — Self-Approval Escalation Infinite Loop

**Description:** If all steps resolve to the submitter and no Finance Admin exists in the tenant, `initializeWorkflow` could loop or fail silently.

**Mitigation:** The escalation path explicitly checks for at least one active Finance Admin in the tenant before writing the workflow instance. If none exists, throw `WorkflowError` with `APPROVER_RESOLUTION_FAILED` and keep the expense in DRAFT. Seed data must always include a Finance Admin. Unit test the "all steps skipped, no Finance Admin" case.

---

### Risk 7 — Notification Enqueue After Transaction Abort

**Description:** If the SQS enqueue call is placed inside the MongoDB transaction (which it must not be), a transaction rollback would not undo the enqueue — resulting in a notification for an action that never committed.

**Mitigation:** SQS enqueue is always called after `session.commitTransaction()` returns successfully, never inside the `withTransaction` callback. Code review checklist item: any new `enqueueNotification` call must be outside the transaction boundary.

---

### Risk 8 — Authorization Matrix Drift

**Description:** As the codebase grows, `authorize` middleware may be added inconsistently, leaving some endpoints under- or over-protected.

**Mitigation:** The Authorization Matrix table in API Design Section 12 is the source of truth. A dedicated integration test file maps every endpoint to its expected access rules and asserts them. This test is run in CI. Any new endpoint without a corresponding test row is a failing test.

---

### Risk 9 — Mongoose Schema Drift

**Description:** The persistence design documents exact field names and types. Mongoose schemas that diverge from this (e.g., different casing, missing fields) cause silent query failures.

**Mitigation:** Mongoose schemas are written to match the persistence design exactly. Schema field names are documented alongside the design document table. The TypeScript interfaces derived from Mongoose schemas serve as a compile-time check that field names are consistent across the codebase.

---

# 14. Definition of Done

The project is considered complete when all of the following are true:

## Functional Requirements

- [ ] All endpoints in the API Design document are implemented and return the documented response shapes
- [ ] Expense lifecycle (DRAFT → SUBMIT → IN_REVIEW → APPROVED → PAID) works end-to-end
- [ ] Reject and send-back flows work end-to-end
- [ ] Withdrawal of SUBMITTED expense works
- [ ] Multi-step approval chain works (minimum 2-step test)
- [ ] Expense categories can be created, activated, deactivated, and updated by authorized users
- [ ] Receipt upload, attachment, and download work end-to-end
- [ ] Audit log records every workflow action with correct actor, action, timestamp, and comment
- [ ] Email notifications are sent for all workflow events

## Access Control

- [ ] All four roles have exactly the permissions defined in the Authorization Matrix (Section 12 of the API Design)
- [ ] `tenantId` isolation is enforced — users in tenant A cannot access any data in tenant B
- [ ] `passwordHash` is never returned in any API response
- [ ] Deactivated users cannot log in
- [ ] Self-approval is prevented

## Infrastructure

- [ ] MongoDB replica set is used in all environments
- [ ] All write operations that span multiple documents use MongoDB transactions
- [ ] Redis blocklist revokes tokens on logout and password change
- [ ] SQS DLQ is configured with `maxReceiveCount: 3`
- [ ] CloudWatch alarm on DLQ depth is configured
- [ ] `GET /health` and `GET /health/ready` are operational

## Code Quality

- [ ] TypeScript strict mode is enabled with no type errors
- [ ] All Zod validators match the validation rules in API Design Section 11
- [ ] No stack traces or internal error details returned to clients
- [ ] Structured logs on all business operations include `traceId`, `tenantId`, `userId`
- [ ] `traceId` propagated from HTTP request through SQS message to notification worker logs
- [ ] Rate limiting is applied on mutation endpoints

## Testing

- [ ] Unit tests pass for all service and state machine logic
- [ ] Integration tests pass for all workflow paths (submit, approve, reject, send-back, multi-step)
- [ ] Cross-tenant isolation integration tests pass
- [ ] Authorization Matrix integration tests pass (every endpoint tested for allow/deny by role)
- [ ] Concurrent request integration test passes (optimistic lock returns `409`)
- [ ] Idempotency integration test passes (`X-Idempotent-Replay: true` on duplicate)
- [ ] Frontend E2E tests pass for all four persona workflows

## Documentation

- [ ] `.env.example` is complete and accurate
- [ ] `README.md` documents local setup, seed data, and npm scripts
- [ ] All API contracts implemented match the API Design document (no undocumented divergences)

---

*Document status: Draft — Implementation Plan. Follows Architecture V2, Persistence Design, and API Design. Ready for engineering kickoff.*
