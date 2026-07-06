# Technical Design Document

## Expense Management System --- Architecture V2

*Status: Approved --- Principal Engineer review complete. Supersedes
Architecture V1.*

------------------------------------------------------------------------

# 1. System Overview

## Architecture

The system is a multi-tenant SaaS web application consisting of three
major layers:

-   **Frontend** --- A Next.js application serving role-based dashboards
    for each persona.
-   **Backend** --- A Node.js/Express API server organized as a modular
    monolith, enforcing authentication, authorization, and all business
    logic.
-   **Data & Infrastructure** --- MongoDB as the primary store, Redis
    for JWT blocklist and idempotency keys, Amazon SQS for asynchronous
    notification dispatch, and Amazon S3 for receipt storage.

## Why This Architecture Fits

The domain maps cleanly to a small number of well-bounded modules. The
team is building an MVP with a known scope and a single deployment
surface. A modular monolith provides strong internal boundaries while
keeping operational complexity low. The module seams established here
are the extraction points if individual components develop independent
scaling needs later.

## Major Components

  Component                Role
  ------------------------ --------------------------------------------------------
  Next.js Frontend         Role-based UI, form rendering, status dashboards
  Express API Server       Routing, auth enforcement, business logic
  Workflow Engine Module   State machine for approval lifecycle
  Audit Module             Immutable event recording
  Notification Module      SQS-backed async email dispatch
  MongoDB                  Primary data store (expenses, users, workflows, audit)
  Redis                    JWT blocklist, idempotency keys
  Amazon SQS               Notification job queue with DLQ
  Amazon S3                Receipt file storage

## High-Level Request Flow

Every request from the frontend hits the Express API server. The server
authenticates the caller via JWT middleware, resolves their tenant and
roles, applies authorization checks, and delegates to the appropriate
domain module. State-changing operations record to the audit log
synchronously within the same request. Actions that trigger
notifications enqueue a job to SQS rather than dispatching inline. File
uploads bypass the API server --- the client requests a signed S3 URL
and uploads directly to S3.

------------------------------------------------------------------------

# 2. Architecture Decision

## Decision: Modular Monolith

The system is built as a **modular monolith** --- a single deployable
Node.js process with strict internal module boundaries enforced by code
convention.

### Justification

-   **Team size and timeline.** An MVP built by a small team does not
    benefit from the operational overhead of microservices.
-   **Domain maturity.** The approval workflow and rule engine are not
    yet stable at the implementation level. Premature service boundaries
    are expensive to undo.
-   **Tenant isolation.** Multi-tenancy is a data-layer concern. It is
    easier to enforce consistently inside a single process with a shared
    query discipline.
-   **Future migration path.** If a specific module (most likely
    Notifications or a future OCR/integration layer) develops
    independent scaling needs, the module boundaries established here
    are the natural extraction seams.

### Tradeoffs

  -----------------------------------------------------------------------
  Concern                 Modular Monolith        Microservices
  ----------------------- ----------------------- -----------------------
  Deployment complexity   Low --- single process  High --- per-service
                                                  CI/CD, networking

  Developer experience    Simple local setup      Requires orchestration

  Fault isolation         A crash affects all     Failures are contained
                          modules                 per service

  Scalability             Scale the whole process Scale individual
                                                  services independently

  Module boundary         Convention-based        Enforced by network
  enforcement                                     contracts

  Migration to services   Natural --- seams       N/A
  later                   already exist           
  -----------------------------------------------------------------------

For this project at MVP stage, the tradeoffs strongly favor a modular
monolith.

------------------------------------------------------------------------

# 3. Core Domains

## Authentication

**Responsibility:** Issue, validate, and revoke identity tokens.

**Owns:** Token issuance logic, token validation middleware, JWT
blocklist in Redis.

**Does not own:** User records, role assignments, or any business data.

**Why it exists:** Authentication is a cross-cutting concern every other
domain depends on. Isolating it prevents token logic from leaking into
business modules and makes it straightforward to add SSO later.

------------------------------------------------------------------------

## User Management

**Responsibility:** Manage user accounts and their role assignments
within a tenant.

**Owns:** User records, role assignments, tenant membership.

**Does not own:** Permission definitions, access control decisions.
Password hashing lives here; auth logic does not.

**Why it exists:** Users and roles change independently of business
workflows. Organization Admins must manage both without touching expense
or workflow configuration.

------------------------------------------------------------------------

## Role & Permission

**Responsibility:** Define what each role is permitted to do and answer
authorization questions.

**Owns:** Role definitions, permission mappings (static configuration,
not persisted).

**Does not own:** User-to-role assignments.

**Why it exists:** Centralizing permission resolution prevents scattered
role checks across modules. Every authorization decision flows through a
single contract.

------------------------------------------------------------------------

## Expense Management

**Responsibility:** Manage the lifecycle of an expense from creation
through final disposition.

**Owns:** The Expense aggregate, including expense details, business
status, workflow instance state, approval steps, and receipt references.

**Does not own:** Approval logic, workflow state, audit records.

**Why it exists:** Expenses are the central entity. Isolating CRUD and
lifecycle management from workflow logic means the expense record is the
ground truth, not the workflow engine.

------------------------------------------------------------------------

## Workflow Engine

**Responsibility:** Determine the approval chain for a submitted expense
and advance that chain step by step in response to approver actions.

**Owns:** Expense category configurations per tenant. Each category
carries a name, a standard approval chain (used when the expense amount
is at or below the threshold), an elevated approval chain (used when the
amount exceeds the threshold), an amount threshold, and an active/
inactive flag. Also owns workflow rule evaluation, approval chain
generation, and workflow execution logic.

**Does not own:** Expense data or workflow instance persistence.
Workflow state is stored as part of the Expense aggregate.

**Why it exists:** Approval logic is the most complex, configurable, and
change-prone part of the system. Category-driven workflow selection
eliminates the need for a generic rule-matching engine and makes the
approval path fully predictable: the employee picks a category, the
amount is compared to the threshold, and the chain is unambiguous.
Isolating this module means the category configuration and state machine
can evolve without touching expense storage or user management.

------------------------------------------------------------------------

## Audit

**Responsibility:** Record every workflow action as an immutable,
append-only log entry.

**Owns:** Audit log records.

**Does not own:** Nothing else. It never modifies business data.

**Why it exists:** Auditability is a compliance concern, not a business
concern. Keeping it separate ensures the audit log cannot be modified by
other domains.

------------------------------------------------------------------------

## Notification

**Responsibility:** Dispatch email notifications in response to system
events via an SQS-backed job queue.

**Owns:** Notification templates, SQS job dispatch, send history (for
observability).

**Does not own:** Business entity state. It consumes events but never
writes back to other domains.

**Why it exists:** Notifications are inherently asynchronous. Email
delivery failures must never block or roll back a business transaction.

------------------------------------------------------------------------

## Receipt

**Responsibility:** Generate pre-signed S3 upload URLs and validate that
stored S3 keys belong to the correct tenant before attachment.

**Owns:** S3 key issuance logic. S3 is the store; this module is a thin,
security-enforcing gateway.

**Does not own:** Expense records.

**Why it exists:** File upload security and tenant scoping of S3 keys
require an explicit enforcement layer. Without it, a user could attach
another tenant's receipt to their expense.

------------------------------------------------------------------------

# 4. Module Decomposition

## Auth Module

**Responsibilities:** - Issue JWT access tokens on login - Validate
tokens on every request via middleware - Maintain a Redis blocklist for
invalidated tokens (logout, role changes)

**Dependencies:** User Module (verify credentials, load user context)

**Public interface:** - Middleware: `authenticate(req)` --- attaches
`req.user` (`{ userId, tenantId, roles }`) or rejects with 401 -
`issueToken(userId, tenantId, roles): string` -
`revokeToken(jti, expiresAt): void`

**Data ownership:** JWT blocklist entries in Redis (TTL = token
remaining lifetime). No persistent collections.

------------------------------------------------------------------------

## User Module

**Responsibilities:** - Create and manage user accounts within a
tenant - Assign and revoke roles - Provide user lookup by ID or email
(used by Workflow Engine for approver resolution)

**Dependencies:** Role Module (validate role assignments)

**Public interface:** - `getUserById(userId, tenantId): User` -
`getUsersByRole(role, tenantId): User[]` -
`assignRole(userId, role, tenantId): void` -
`revokeRole(userId, role, tenantId): void`

**Data ownership:** User records, role assignments.

------------------------------------------------------------------------

## Role & Permission Module

**Responsibilities:** - Define the four predefined roles and their
permission sets - Answer authorization questions

**Dependencies:** None (stateless, policy-defined)

**Public interface:** - `can(userContext, action, resource): boolean` -
`getRolesFor(userId, tenantId): Role[]`

**Data ownership:** Static configuration --- not persisted to the
database.

------------------------------------------------------------------------

## Expense Module

**Responsibilities:** - Create, read, update expense records - Manage
the expense status field - Enforce status transition rules - Store
receipt S3 key references

**Valid status transitions:**

    DRAFT → SUBMITTED → IN_REVIEW → APPROVED → PAID
                      IN_REVIEW → REJECTED (terminal)
                      IN_REVIEW → DRAFT (send back)

**Dependencies:** - Auth Module (identity context) - Role & Permission
Module (access control) - Workflow Module (on submission, triggers
workflow initialization) - Audit Module (records status transitions)

**Public interface:** - `createExpense(data, userContext): Expense` -
`submitExpense(expenseId, userContext): Expense` --- triggers workflow
initialization - `withdrawExpense(expenseId, userContext): Expense` -
`updateExpenseStatus(expenseId, status, actorContext): Expense` ---
called by Workflow Module only; validates the transition is legal before
applying - `getExpense(expenseId, userContext): Expense` -
`listExpenses(filters, userContext): PaginatedResult<Expense>`

**Data ownership:** Expense records. The Workflow Module may call
`updateExpenseStatus` but never writes to the expense collection
directly.

------------------------------------------------------------------------

## Workflow Module

**Responsibilities:** - Create and manage expense categories per tenant;
each category stores a standard approval chain, an elevated approval
chain, and an amount threshold - On expense submission: look up the
selected category, verify it is active, compare the amount against the
threshold, select the correct chain, resolve approvers, and persist the
workflow instance - Prevent submission if the selected category is
deactivated - Process approver actions: approve, reject, send back -
Enforce the self-approval constraint - Advance the chain to the next
step or reach a terminal state - Notify the Expense Module of status
changes via its public interface - Emit events for Audit and
Notification modules

**Chain selection at submission:** The selected category is looked up by
ID in `expenseCategories`. If `isActive` is false, submission fails
immediately with `CATEGORY_DEACTIVATED` and the expense stays in DRAFT.
If active, `amount <= threshold` selects `standardChain`; `amount >
threshold` selects `elevatedChain`. The selected chain is resolved into
concrete approver IDs and frozen in the workflow instance. No conflict
resolution is needed because the category uniquely determines the chain.

**Self-approval constraint:** If the resolved approver for a step is the
submitter, the step is skipped. If skipping exhausts all steps, the
expense is escalated to the Finance Admin pool rather than auto-approved
or blocked.

**Dependencies:** - User Module (resolve approvers, validate roles) -
Expense Module (read expense data for category/amount; update expense
status on completion) - Audit Module (emit action events) - Notification
Module (emit events on step transitions)

**Public interface:** -
`initializeWorkflow(expenseId, tenantId): WorkflowInstance` --- called
by Expense Module on submission -
`processAction(workflowInstanceId, action, actorId, comment, idempotencyKey): WorkflowInstance` -
`getWorkflowInstance(expenseId, tenantId): WorkflowInstance` -
`createCategory(categoryConfig, tenantId): ExpenseCategory` -
`updateCategory(categoryId, categoryConfig, tenantId): ExpenseCategory` -
`activateCategory(categoryId, tenantId): ExpenseCategory` -
`deactivateCategory(categoryId, tenantId): ExpenseCategory` -
`listCategories(tenantId): ExpenseCategory[]`

**Data ownership:** Expense category configurations, workflow instances,
approval step records.

------------------------------------------------------------------------

## Audit Module

**Responsibilities:** - Accept audit events from other modules - Persist
them as immutable, append-only records - Serve audit history to
authorized roles (Finance Admin, Org Admin)

**Dependencies:** None

**Public interface:** - `record(event: AuditEvent): void` ---
`{ tenantId, expenseId, actorId, action, timestamp, comment? }` -
`getAuditLog(expenseId, tenantId): AuditEvent[]`

**Data ownership:** Audit log records --- append-only, never updated or
deleted.

------------------------------------------------------------------------

## Notification Module

**Responsibilities:** - Accept notification events from other modules
and enqueue them to Amazon SQS - A separate worker process (or Lambda)
consumes SQS messages, resolves recipient email addresses, renders
templates, and dispatches via the email provider - Failed jobs are
routed to a Dead Letter Queue after the configured retry count

**Dependencies:** User Module (resolve recipient addresses), Amazon SQS,
email provider (e.g., Amazon SES)

**Public interface:** -
`enqueueNotification(event: NotificationEvent): void` ---
fire-and-forget

**Data ownership:** SQS job queue. Sent notification records are written
by the worker for observability (optional at MVP, recommended).

------------------------------------------------------------------------

## Receipt Module

**Responsibilities:** - Generate pre-signed S3 upload URLs scoped to the
requesting tenant - Validate allowed MIME types and maximum upload size
before generating upload URLs - Validate that a provided S3 key was
issued for the current tenant before it is attached to an expense -
Enforce a file type allowlist (PDF, JPEG, PNG) and size limit at URL
generation time via S3 conditions

**Dependencies:** AWS S3 SDK

**Public interface:** -
`getUploadUrl(filename, contentType, tenantId): { uploadUrl, s3Key }`
--- s3Key is prefixed with `{tenantId}/` to enforce isolation -
`validateFileOwnership(s3Key, tenantId): boolean`

**Data ownership:** None. S3 is the store; this module is a thin,
security-enforcing gateway.

------------------------------------------------------------------------

# 5. Major System Flows

## Create Expense

    Client → API Server
      → Auth Middleware (validate JWT, attach user context)
      → Permission Check (can user create expense?)
      → Expense Module: createExpense()
      → Expense Module persists record in DRAFT status
      → Return expense record to client

No workflow involvement. No audit event required for draft creation.

------------------------------------------------------------------------

## Submit Expense

    Client → API Server
      → Auth Middleware
      → Permission Check (submitter owns expense; expense is in DRAFT)
      → Idempotency check (Redis key: submit:{expenseId})
      → MongoDB transaction begins
        → Expense Module: updateExpenseStatus(SUBMITTED)
        → Workflow Module: initializeWorkflow(expenseId, tenantId)
          → Reads expense data (category, amount)
          → Looks up category in expenseCategories; errors with CATEGORY_DEACTIVATED if inactive
          → Selects standardChain or elevatedChain based on amount vs threshold
          → Resolves approver chain from User Module
          → Applies self-approval constraint (skip step; escalate to Finance Admin if all skipped)
          → Persists workflow instance with ordered steps
          → Expense Module: updateExpenseStatus(IN_REVIEW)
          → Audit Module: record(SUBMITTED)
      → MongoDB transaction commits
      → Notification Module: enqueueNotification(APPROVAL_REQUESTED) [async, post-commit]
      → Return updated expense to client

All steps through workflow initialization are synchronous and within a
single MongoDB transaction. Notification dispatch is enqueued to SQS
after the transaction commits --- a failure here does not roll back the
business state.

**Rollback behavior:** If workflow initialization fails (e.g., category
is deactivated, or approver resolution fails), the transaction is rolled
back and the expense remains in DRAFT. A descriptive error is returned
to the client.

------------------------------------------------------------------------

## Approve Expense

    Client → API Server
      → Auth Middleware
      → Permission Check (actor is the current step's assigned approver and is not the submitter)
      → Idempotency check (Redis key: action:{workflowInstanceId}:{stepIndex})
      → MongoDB transaction begins
        → Workflow Module: processAction(APPROVE)
          → Validates actor is the active step approver
          → Marks current step as APPROVED
          → If more steps remain:
              → Activates next step
              → Audit Module: record(STEP_APPROVED)
          → If no more steps:
              → Marks workflow instance as COMPLETED
              → Expense Module: updateExpenseStatus(APPROVED)
              → Audit Module: record(FULLY_APPROVED)
      → MongoDB transaction commits
      → Notification Module: enqueueNotification(NEXT_APPROVAL_REQUESTED or EXPENSE_APPROVED) [async]
      → Return updated state to client

------------------------------------------------------------------------

## Reject Expense

    Client → API Server
      → Auth Middleware
      → Permission Check
      → Idempotency check
      → MongoDB transaction begins
        → Workflow Module: processAction(REJECT)
          → Marks current step and workflow instance as REJECTED
          → Expense Module: updateExpenseStatus(REJECTED)
          → Audit Module: record(REJECTED)
      → MongoDB transaction commits
      → Notification Module: enqueueNotification(EXPENSE_REJECTED) [async]
      → Return updated state to client

Rejection is terminal. No further workflow actions are possible on this
instance.

------------------------------------------------------------------------

## Send Back

    Client → API Server
      → Auth Middleware
      → Permission Check
      → Idempotency check
      → MongoDB transaction begins
        → Workflow Module: processAction(SEND_BACK)
          → Marks workflow instance as RETURNED
          → Expense Module: updateExpenseStatus(DRAFT)
          → Audit Module: record(SENT_BACK)
      → MongoDB transaction commits
      → Notification Module: enqueueNotification(CHANGES_REQUESTED) [async]
      → Return updated state to client

The expense returns to DRAFT. The old workflow instance is retained in
RETURNED state for audit history. On resubmission, a new workflow
instance is created from scratch.

------------------------------------------------------------------------

## Mark as Paid

    Client → API Server
      → Auth Middleware
      → Permission Check (Finance Admin role required)
      → MongoDB transaction begins
        → Expense Module: updateExpenseStatus(PAID)
          → Validates expense is currently in APPROVED status
          → Audit Module: record(MARKED_PAID)
      → MongoDB transaction commits
      → Notification Module: enqueueNotification(EXPENSE_PAID) [async]
      → Return updated expense to client

No workflow involvement. This is a Finance Admin action directly on the
expense record.

------------------------------------------------------------------------

# 6. Data Ownership

  -----------------------------------------------------------------------
  Data              Owned By          May Be Modified   May Be Read By
                                      By                
  ----------------- ----------------- ----------------- -----------------
  User records      User Module       User Module, Org  Auth Module,
                                      Admin actions via Workflow Module,
                                      User Module       Notification
                                                        Module

  Role assignments  User Module       User Module       Role & Permission
                                                        Module, Workflow
                                                        Module

  Expense records   Expense Module    Expense Module    All modules with
                                      (direct edits);   valid
                                      Workflow Module   authorization
                                      (status updates   context
                                      via public        
                                      interface only)   

  Workflow rule     Workflow Module   Workflow Module   Workflow Module
  configs                             (Org Admin        only
                                      actions)          

  Workflow          Workflow Module   Workflow Module   Expense Module
  instances & steps                                     (read status),
                                                        Audit reads
                                                        indirectly via
                                                        events

  Audit log         Audit Module      Append-only ---   Finance Admin,
                                      no module may     Org Admin (via
                                      update or delete  Audit Module
                                                        interface)

  Notification      Notification      Notification      Notification
  queue             Module            Module            Module

  S3 receipt files  Receipt Module    Receipt Module    Expense Module,
                    (keys), Expense   (upload); Expense authorized users
                    Module            Module (attach    via signed URLs
                    (reference)       reference)        
  -----------------------------------------------------------------------

**Key principle:** No module reaches into another module's data store
directly. Cross-module data access always goes through the owning
module's public interface.

------------------------------------------------------------------------

# 7. Communication Patterns

## Synchronous (in-request)

  -----------------------------------------------------------------------
  Interaction                         Reason
  ----------------------------------- -----------------------------------
  Expense submission (through         The client expects a confirmed
  workflow init)                      final state (IN_REVIEW with a
                                      resolved approval chain) before the
                                      response returns. Partial state
                                      would be dangerous.

  Workflow state transitions          Approver actions must be confirmed
  (approve, reject, send back)        atomically. The response must
                                      reflect the new state.

  Authorization checks                Must complete before any action
                                      proceeds.

  Receipt upload URL generation       Client is waiting for the signed
                                      URL to proceed.

  Mark as paid                        Simple status update with immediate
                                      confirmation.
  -----------------------------------------------------------------------

## Asynchronous (post-commit, via SQS)

  -----------------------------------------------------------------------
  Interaction                         Reason
  ----------------------------------- -----------------------------------
  Email notifications                 Email delivery is slow, fallible,
                                      and non-critical to the business
                                      transaction. A failed email must
                                      never roll back an approval.
                                      Enqueued to SQS after the
                                      transaction commits; retried
                                      independently.

  -----------------------------------------------------------------------

## Audit Writes

Audit events are written **synchronously within the MongoDB
transaction** alongside the business state change. This guarantees that
every committed action has a corresponding audit record. The audit write
failure rolls back the business transaction --- intentionally. An
unaudited action is worse than a blocked action for a
compliance-critical log.

------------------------------------------------------------------------

# 8. Transaction Boundaries

All state-changing workflows that span more than one document use
**MongoDB multi-document transactions**.

## Transaction scope per operation

  -----------------------------------------------------------------------
  Operation                           Documents in transaction
  ----------------------------------- -----------------------------------
  Submit expense                      Expense record (status → SUBMITTED
                                      → IN_REVIEW), WorkflowInstance
                                      (new), WorkflowStep(s) (new),
                                      AuditLog (new entry)

  Approve step (intermediate)         WorkflowStep (current → APPROVED),
                                      WorkflowStep (next → ACTIVE),
                                      AuditLog

  Approve step (final)                WorkflowStep (current → APPROVED),
                                      WorkflowInstance (→ COMPLETED),
                                      Expense (→ APPROVED), AuditLog

  Reject                              WorkflowStep (→ REJECTED),
                                      WorkflowInstance (→ REJECTED),
                                      Expense (→ REJECTED), AuditLog

  Send back                           WorkflowInstance (→ RETURNED),
                                      Expense (→ DRAFT), AuditLog

  Mark as paid                        Expense (→ PAID), AuditLog
  -----------------------------------------------------------------------

**Optimistic locking:** The WorkflowInstance document carries a
`version` field incremented on every write. Workflow action handlers
read the current version and include it in the update filter
(`{ _id, version: currentVersion }`). If a concurrent write has already
incremented the version, the update matches zero documents and the
handler retries or returns a 409 Conflict. This prevents
double-processing without holding locks.

**Notification enqueue timing:** SQS enqueue happens after the
transaction commits, not inside it. SQS is not transactional with
MongoDB. A failure to enqueue is logged and can be retried separately;
it does not roll back business state.

------------------------------------------------------------------------

# 9. Idempotency

Workflow actions (approve, reject, send back) must be idempotent.
Double-clicking approve should not create duplicate audit entries or
advance the workflow twice.

**Mechanism:** Before processing any workflow action, the server checks
a Redis key:

    idempotency:{tenantId}:{workflowInstanceId}:{action}:{stepIndex}

-   If the key exists: return the cached response (HTTP 200 with the
    stored result).
-   If the key does not exist: process the action, store the result in
    Redis with a TTL of 24 hours, return the result.

The idempotency key is server-generated (not client-supplied) and is
scoped to the specific action on the specific step. This prevents
replays without requiring clients to manage keys.

------------------------------------------------------------------------

# 10. State Management

## Expense Status

**Lifecycle:**

    DRAFT → SUBMITTED → IN_REVIEW → APPROVED → PAID
                        IN_REVIEW → REJECTED  (terminal)
                        IN_REVIEW → DRAFT     (send back)

**Transitions:** - `DRAFT → SUBMITTED`: Submitter explicitly submits. -
`SUBMITTED → IN_REVIEW`: Workflow Module completes initialization (same
transaction). - `IN_REVIEW → APPROVED`: Workflow Module --- all steps
approved. - `IN_REVIEW → REJECTED`: Workflow Module --- any approver
rejects. - `IN_REVIEW → DRAFT`: Workflow Module --- any approver sends
back. - `APPROVED → PAID`: Finance Admin marks as paid.

**Consistency:** The expense status is the single authoritative source
of truth for the expense's position in the lifecycle. The Workflow
Module never directly sets expense status --- it always calls
`updateExpenseStatus` on the Expense Module, which validates the
transition is legal before applying it.

------------------------------------------------------------------------

## Workflow Instance State

**Lifecycle:** `PENDING → ACTIVE → (COMPLETED | REJECTED | RETURNED)`

Each step has its own state:
`PENDING → ACTIVE → (APPROVED | REJECTED | RETURNED)`

**Transitions:** - Instance created in `PENDING`; immediately
transitions to `ACTIVE` once the first step is activated (same write). -
Each step is activated in sequence. Only the currently `ACTIVE` step can
receive an action. - Instance reaches `COMPLETED` when the last step is
approved. - Instance reaches `REJECTED` when any step is rejected. -
Instance reaches `RETURNED` when any step sends back.

**Optimistic locking:** WorkflowInstance carries a `version` field. All
action handlers include the current version in their update filter to
prevent concurrent modifications.

**Historical instances:** When an expense is sent back and resubmitted,
the old workflow instance is retained in `RETURNED` state for audit
history. All historical instances are retained indefinitely at MVP. A
retention policy can be introduced later without schema changes.

------------------------------------------------------------------------

## JWT Token State

**Lifecycle:** `ACTIVE → REVOKED`

Tokens are stateless. Revocation is handled by a Redis blocklist keyed
by the token's `jti` claim with a TTL equal to the token's remaining
lifetime. Expired tokens are not blocklisted --- they are already
invalid. The blocklist self-cleans via Redis TTL.

------------------------------------------------------------------------

# 11. Security

## Authentication

-   Every API endpoint requires a valid JWT (enforced in middleware; no
    exceptions for business routes).
-   Tokens are short-lived (15--60 minutes). Refresh tokens are out of
    scope for MVP; re-authentication is required after expiry.
-   Logout revokes the token by adding its `jti` to the Redis blocklist.
-   Role changes take effect on next login (or earlier if the current
    token is explicitly revoked).

## Authorization

-   Every request resolves `{ userId, tenantId, roles }` from the
    validated JWT before any business logic executes.
-   Authorization decisions flow through the Role & Permission Module's
    `can()` function --- no scattered role checks in business code.
-   Resource-level checks (e.g., "does this user own this expense?") are
    enforced in the domain module before any data mutation.

## Tenant Isolation

-   Every database query includes `tenantId` as a mandatory filter,
    enforced at the module boundary.
-   No query may omit `tenantId`. This is verified by integration tests
    that assert cross-tenant data is never returned.
-   S3 keys are prefixed with `{tenantId}/`. The Receipt Module
    validates the prefix before any key is accepted from client input.

## File Upload Safety

-   Pre-signed S3 URLs are generated with an S3 content-type condition
    restricting uploads to an allowlist (PDF, JPEG, PNG) and a maximum
    file size (configurable, default 10 MB). Uploads that violate these
    conditions are rejected by S3 directly.
-   The S3 key provided when attaching a receipt to an expense is
    validated by `Receipt Module: validateFileOwnership()` before
    persistence. A client cannot attach a key from another tenant or a
    key they did not receive from the server.

## Input Validation

-   All incoming request bodies are validated against strict schemas at
    the API layer before reaching domain modules.
-   Validation is centralized in a shared validation middleware using a
    schema library (e.g., Zod). Domain modules trust validated input.

------------------------------------------------------------------------

# 12. Observability

Observability is a production requirement, not a post-launch addition.
The following are required before the system goes live.

## Structured Logging

-   All modules emit structured JSON logs with consistent fields:
    `{ timestamp, level, traceId, tenantId, userId, module, action, durationMs, error? }`.
-   `tenantId` and `userId` are injected from the request context. They
    must never be omitted on business operations.
-   Log levels: `ERROR` for failures requiring attention, `WARN` for
    recoverable issues, `INFO` for significant business events, `DEBUG`
    for development.

## Request Tracing

-   A `traceId` (UUID) is generated per request in the Auth Middleware
    and attached to `req.context`. All log lines and SQS messages for
    that request carry the same `traceId`.
-   The SQS worker propagates the `traceId` from the message into its
    own log lines so a notification job can be traced back to the
    originating request.

## Health Checks

-   `GET /health` --- returns 200 if the process is alive (liveness).
-   `GET /health/ready` --- returns 200 only if MongoDB and Redis are
    reachable (readiness). Used by load balancers to gate traffic.

## Error Handling

-   A global Express error handler catches all unhandled errors and
    returns a consistent JSON error shape:
    `{ error: { code, message, traceId } }`.
-   Internal error details (stack traces, query details) are never
    returned to clients. They are logged server-side with the full
    `traceId`.
-   Domain-level error classes (e.g., `NotFoundError`, `ForbiddenError`,
    `WorkflowConflictError`) map to specific HTTP status codes in the
    global handler.

## SQS Worker Observability

-   The notification worker logs job start, success, and failure with
    `traceId`, `notificationType`, and `recipientUserId`.
-   Messages that exhaust retries are routed to a Dead Letter Queue. DLQ
    depth is monitored; an alert fires if it grows beyond a threshold.

------------------------------------------------------------------------

# 13. Failure Handling

## Notification Delivery Failures

Email delivery can fail silently or be rate-limited.

**Mitigation:** SQS provides configurable retry with exponential
backoff. After the configured retry count (default: 3), the message
moves to a Dead Letter Queue. DLQ messages are logged and monitored. For
MVP, manual reprocessing from the DLQ is acceptable. Production would
add delivery status webhooks from the email provider.

A notification failure never affects business state. The expense
approval is already committed before the enqueue attempt.

## Workflow Action Double-Processing

A user submits the same approval action twice (network retry,
double-click).

**Mitigation:** Server-side idempotency keys (Section 9) detect the
duplicate and return the cached result without reprocessing.

## Workflow Initialization Failure

The expense is submitted but workflow initialization fails (e.g., no
matching rules, approver resolution error).

**Mitigation:** The entire submission is wrapped in a MongoDB
transaction. If initialization fails, the transaction rolls back and the
expense remains in DRAFT. A descriptive error is returned to the client.
The expense is never left in SUBMITTED or IN_REVIEW with no workflow
instance.

## Concurrent Workflow Actions

Two approvers (in a misconfigured workflow, or a race condition) attempt
to act on the same step simultaneously.

**Mitigation:** Optimistic locking on the WorkflowInstance `version`
field (Section 8). The second write matches zero documents and receives
a 409 Conflict. The client is instructed to refresh and retry. Because
the first action already advanced the workflow, the retry will find a
different active step or a terminal state.

## MongoDB Unavailability

MongoDB becomes unreachable mid-request.

**Mitigation:** The request fails with 503. No partial state is possible
because all writes are transactional. The client should retry. The
readiness health check removes the instance from the load balancer
rotation until MongoDB is reachable again.

## Redis Unavailability

Redis is used for JWT blocklist and idempotency keys. If Redis is
unreachable:

-   **JWT blocklist:** The Auth Middleware fails open --- recently
    revoked tokens may be accepted until Redis recovers. This is an
    acceptable tradeoff for MVP given short token TTLs. Log a warning on
    every request when Redis is down.
-   **Idempotency keys:** The workflow action proceeds without
    idempotency protection. Log a warning. Double-processing risk is low
    in practice and the window is bounded by the client timeout.

For production, Redis Sentinel or Redis Cluster should be used. At MVP,
a single Redis instance with monitoring is sufficient.

------------------------------------------------------------------------

# 14. Extensibility

## Parallel Approvals

The Workflow Module currently models a strictly sequential step chain.
Parallel approvals would require a step to support multiple concurrent
approvers with a resolution policy. The workflow instance and step data
model would accommodate a branching structure, but the external
interface (`processAction`) remains unchanged. No other module is
affected.

## Approval Delegation

This requires a delegation record in the User Module (user A delegates
to user B for a date range) and a check in the Workflow Module's
approver resolution logic. Approver resolution is already abstracted
inside the Workflow Module --- delegation logic is added there, with a
read on the User Module's delegation data. No interface changes to
Expense, Audit, or Notification.

## Receipt OCR

A new OCR Module listens for a `RECEIPT_UPLOADED` event, submits the
file to an OCR service, and writes extracted data back to the expense
draft via the Expense Module's public interface. It interacts only with
the Receipt Module (read file) and the Expense Module (update fields).
No workflow changes required.

## Multi-Currency

Primarily an Expense Module concern --- storing original currency and
amount alongside a normalized base-currency amount. The Workflow
Module's amount-based rules operate on the normalized amount. A Currency
Module owns exchange rate fetching and conversion. No other modules
change.

## ERP Integrations

An Integration Module subscribes to `EXPENSE_PAID` events (via SQS) and
pushes data to external systems. It reads expense and audit data through
existing public interfaces. No changes to core modules required.

## Policy Engine

Currently, approval rules are simple (department, amount). A Policy
Engine module can replace or augment the Workflow Module's rule
evaluation step with a richer rule DSL. Because rule evaluation is
already isolated inside the Workflow Module, this is an internal
replacement rather than a cross-module change.

## Mobile Applications

The backend exposes a JSON REST API with JWT authentication. A mobile
client consumes the same API. No backend changes required. Push
notifications would be an addition to the Notification Module.

Future Extraction:

If notification throughput, OCR processing, or ERP integrations require
independent scaling, these modules can be extracted into standalone
services with minimal impact because they already communicate through
asynchronous boundaries.

## Category Versioning

Expense categories are mutable by the Workflow Admin. If a category's
chains or threshold change after an expense is submitted, the existing
workflow instance is unaffected --- the approval chain is resolved and
frozen at submission time (Section 10). Future enhancements (e.g.,
storing a snapshot of the category config used at submission time for
audit purposes) can be added to the WorkflowInstance document without
breaking the existing interface.

------------------------------------------------------------------------

# 15. Technology Decisions

## MongoDB

**Decision:** Primary data store.

**Why:** The approval chain for an expense is a nested, variable-length
structure (an array of steps with their own state). MongoDB's document
model fits this without join queries or schema migrations as the step
structure evolves. Multi-tenancy is implemented by scoping all queries
to `tenantId`.

**Tradeoff:** Relational integrity is not enforced by the database. The
application enforces referential consistency, and cross-module queries
are more expensive than in a relational store.

**Transaction support:** MongoDB replica set mode is required to enable
multi-document transactions. This is a hard prerequisite and must be
configured in all environments (development, staging, production). Local
development should also run MongoDB in replica set mode to match
production behavior.

------------------------------------------------------------------------

## Redis

**Decision:** JWT blocklist and idempotency keys.

**Why:** TTL-based expiry is a natural fit for both concerns. Blocklist
entries expire when the token expires. Idempotency keys expire after 24
hours. Centralizing these ephemeral, high-throughput operations outside
MongoDB keeps the primary store clean.

------------------------------------------------------------------------

## Amazon SQS for Notifications

**Decision:** Replace in-process job queue (BullMQ/Redis) with Amazon
SQS for notification dispatch.

**Why (change from V1):** SQS provides managed delivery, configurable
retry with backoff, and a built-in Dead Letter Queue --- all without
operating a Redis cluster for queue durability. This removes a failure
mode (Redis queue durability under crash) and provides better
observability for notification delivery. The Notification Module's
interface (`enqueueNotification`) is unchanged from V1; only the backing
infrastructure changes.

**DLQ configuration:** Each SQS queue has a corresponding Dead Letter
Queue. Messages are retried with exponential backoff. After 3 failed
delivery attempts they are moved to the DLQ. DLQ depth triggers a
CloudWatch alarm.

------------------------------------------------------------------------

## JWT Authentication

**Decision:** Stateless JWT tokens with a Redis revocation list.

**Why:** JWT fits the stateless, API-first architecture. Short-lived
tokens (15--60 minutes) limit exposure. The Redis blocklist solves the
revocation problem (logout, role changes) without making the system
fully stateful.

**Risk:** A compromised token remains valid until expiry unless
explicitly blocklisted. Mitigated by short TTLs and revocation on
logout.

------------------------------------------------------------------------

## AWS S3 for Receipt Storage

**Decision:** Store receipt files in S3 using pre-signed upload URLs
with enforced conditions.

**Why:** Receipts are binary files of variable size. Storing them
outside the primary database keeps MongoDB storage costs predictable and
uses S3's built-in access control for delivery. Pre-signed URLs keep the
API server out of the upload path.

**Security addition (V2):** Pre-signed URLs include S3 upload conditions
enforcing content-type allowlist and maximum file size. This prevents
malicious uploads without API server involvement.

------------------------------------------------------------------------

## Mongoose as ODM

**Decision:** Mongoose for MongoDB interaction.

**Why:** Schema definitions with validation, middleware hooks (used for
pre-save validation), and a familiar query API. Provides a useful
contract layer during development even though MongoDB is schemaless.

------------------------------------------------------------------------

## Zod for Input Validation

**Decision:** Zod as the schema validation library for all API request
inputs.

**Why:** TypeScript-native, composable schemas with strong inference.
Validation errors produce structured, human-readable messages that map
cleanly to API error responses. Centralizing validation in a Zod schema
layer keeps domain modules free of defensive input checks.

------------------------------------------------------------------------

# 16. Technical Risks

## Workflow State Consistency

**Risk:** An approval action involves multiple writes. If one write
fails mid-sequence, the system ends up in an inconsistent state.

**Mitigation:** MongoDB multi-document transactions for all workflow
state transitions that span more than one document. All step state
updates for a given action are committed atomically or not at all.

------------------------------------------------------------------------

## Concurrent Workflow Actions

**Risk:** Two concurrent requests attempt to act on the same workflow
step.

**Mitigation:** Optimistic locking on `WorkflowInstance.version`. The
second write matches zero documents and receives a 409 Conflict. The
client refreshes and retries.

------------------------------------------------------------------------

## Self-Approval Constraint at Resolution Time

**Risk:** The approval chain is resolved at submission time. If an
approver is also the submitter, the system must skip them or apply a
fallback. If all resolved approvers are the submitter, the fallback is
Finance Admin escalation.

**Mitigation:** The escalation policy is defined and enforced in the
Workflow Module at initialization time. If no Finance Admin exists in
the tenant, workflow initialization fails loudly and the expense remains
in DRAFT.

------------------------------------------------------------------------

## Tenant Isolation Enforcement

**Risk:** Multi-tenancy is enforced in application code, not by the
database. A missing `tenantId` filter is a data leak.

**Mitigation:** `tenantId` is a mandatory parameter on every public
module interface method that reads data. Integration tests assert
cross-tenant data is never returned for every data access path.

------------------------------------------------------------------------

## Category Deactivation During Submission

**Risk:** A Workflow Admin deactivates a category while employees have
expenses in DRAFT status under that category. Those drafts would fail at
submission time.

**Mitigation:** `initializeWorkflow` validates `category.isActive`
inside the transaction before any state is written. If inactive, the
transaction rolls back and the expense stays in DRAFT. The error message
tells the employee to select an active category. This is the correct
product behavior: blocked drafts signal to the employee that action is
needed, rather than silently routing through a stale chain.

------------------------------------------------------------------------

## MongoDB Transaction Performance

**Risk:** Multi-document transactions carry overhead compared to
single-document writes.

**Mitigation:** Design the WorkflowInstance document to contain the step
array, allowing all step state updates to be written as a single
document update (atomic by default). Multi-document transactions are
then only needed when an action also updates the Expense record or
AuditLog. At MVP scale this overhead is not expected to be a bottleneck.

------------------------------------------------------------------------

## Notification Delivery Failures

**Risk:** Email delivery can fail silently or be rate-limited.

**Mitigation:** SQS with configurable retry and a Dead Letter Queue. DLQ
depth is monitored. Failed deliveries are logged with the originating
`traceId`.

------------------------------------------------------------------------

## JWT Blocklist Growth

**Risk:** The Redis blocklist grows as users log out or tokens are
revoked.

**Mitigation:** Blocklist entries are stored with a TTL equal to the
token's remaining lifetime. Redis TTL-based expiry ensures
self-cleaning. No manual purge required.

------------------------------------------------------------------------

## File Upload Abuse

**Risk:** A client could attempt to upload unexpected file types or
excessively large files.

**Mitigation:** Pre-signed S3 URLs include upload conditions enforcing
content-type allowlist (PDF, JPEG, PNG) and a maximum file size. S3
enforces these conditions at upload time. The Receipt Module also
validates the S3 key prefix before attaching a receipt to an expense.

------------------------------------------------------------------------

# 17. Shared Infrastructure

The following are application-wide cross-cutting concerns and are
**not** business modules. All modules depend on them:

-   **Validation** --- Zod schemas at the API layer; all domain modules
    receive validated input.
-   **Configuration** --- Environment-based configuration loaded at
    startup; never hardcoded in modules. Secrets via environment
    variables (or AWS Secrets Manager in production).
-   **Structured Logging** --- Centralized logger with consistent field
    schema; injected into modules via request context.
-   **Error Handling** --- Domain error classes (`NotFoundError`,
    `ForbiddenError`, `ConflictError`, `WorkflowError`) mapped to HTTP
    status codes in a global Express error handler.
-   **Observability** --- Request tracing via `traceId`; health check
    endpoints; SQS worker metrics.
-   **Rate Limiting** --- Per-tenant rate limiting on mutation endpoints
    to protect against abuse. Applied at the API layer before business
    logic.
-   **Request Context** --- A context object
    (`{ userId, tenantId, roles, traceId }`) assembled by Auth
    Middleware and passed to all module calls. No module reads directly
    from `req`.

------------------------------------------------------------------------

*Document status: Approved --- Architecture V2. Ready for Database
Design and API Design phases.*
