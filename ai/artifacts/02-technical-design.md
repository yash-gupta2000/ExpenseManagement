# Technical Design Document

## Expense Management System --- Architecture V1

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
-   **Data & Infrastructure** --- MongoDB as the primary store, MongoDB
    as the primary store, Redis for caching/JWT blocklist, Amazon SQS
    for asynchronous messaging, and AWS S3 for receipt storage.

## Why This Architecture Fits

The problem domain maps cleanly to a small number of well-bounded
business domains. The team is building an MVP with a known scope, a
single deployment surface, and a team size where shared process overhead
of distributed services would cost more than it saves. A modular
monolith gives strong internal boundaries while keeping operational
complexity low.

## Major Components

  Component                Role
  ------------------------ --------------------------------------------------------
  Next.js Frontend         Role-based UI, form rendering, status dashboards
  Express API Server       Routing, auth enforcement, business logic
  Workflow Engine Module   State machine for approval lifecycle
  Audit Module             Immutable event recording
  Notification Module      Email dispatch, decoupled from core flows
  MongoDB                  Primary data store (expenses, users, workflows, audit)
  Redis                    Cache, JWT blocklist, idempotency keys
  AWS S3                   Receipt file storage

## High-Level Request Flow

Every request from the frontend hits the Express API server. The server
authenticates the caller via JWT middleware, resolves their tenant and
roles, applies authorization checks, and delegates to the appropriate
domain module. State-changing operations record to the audit log.
Actions that trigger notifications enqueue a job rather than dispatching
inline. File uploads bypass the API server --- the client requests a
signed S3 URL and uploads directly to S3.

------------------------------------------------------------------------

# 2. Architecture Decision

## Decision: Modular Monolith

The system will be built as a **modular monolith** --- a single
deployable Node.js process with strict internal module boundaries
enforced by code conventions rather than network borders.

### Justification

-   **Team size and timeline.** An MVP built by a small team does not
    benefit from the operational overhead of microservices (separate
    deployments, network contracts, distributed tracing, service
    discovery).
-   **Domain maturity.** The approval workflow and rule engine are not
    yet well-understood at the implementation level. Splitting them
    across services before the domain is stable would lock in premature
    boundaries that are expensive to undo.
-   **Tenant isolation.** Multi-tenancy here is a data-layer concern,
    not a routing or infrastructure concern. It is easier to enforce
    consistently inside a single process.
-   **Future migration path.** If a specific module --- most likely
    Notifications or a future OCR/integration layer --- develops
    independent scaling needs, it can be extracted into a standalone
    service. The module boundaries established now are the seams for
    that future work.

### Tradeoffs

  -----------------------------------------------------------------------
  Concern                 Modular Monolith        Microservices
  ----------------------- ----------------------- -----------------------
  Deployment complexity   Low --- single process  High --- per-service
                                                  CI/CD, networking

  Developer experience    Simple local setup      Requires orchestration
                                                  (Docker Compose, etc.)

  Fault isolation         A crash affects all     Failures are contained
                          modules                 per service

  Scalability             Scale the whole process Scale individual
                                                  services independently

  Module boundary         Convention-based,       Enforced by network
  enforcement             requires discipline     contracts

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
blocklist (Redis).

**Does not own:** User records, role assignments, or any business data.

**Why it exists:** Authentication is a cross-cutting concern that every
other domain depends on. Isolating it prevents token logic from leaking
into business modules and makes it easy to swap authentication
strategies (e.g., add SSO) later.

------------------------------------------------------------------------

## User Management

**Responsibility:** Manage user accounts and their role assignments
within a tenant.

**Owns:** User records, role assignments, tenant membership.

**Does not own:** Permission definitions, access control decisions, or
authentication credentials (passwords may be stored here but auth logic
is in the Authentication domain).

**Why it exists:** Users and roles change independently of business
workflows. Organization Admins need to manage both without touching
expense or workflow configuration.

------------------------------------------------------------------------

## Role & Permission

**Responsibility:** Define what each role is permitted to do and answer
authorization questions.

**Owns:** Role definitions, permission mappings.

**Does not own:** User-to-role assignments (that belongs to User
Management), or any business entity.

**Why it exists:** Centralizing permission resolution prevents scattered
`if role === 'admin'` checks across modules. Every authorization
decision flows through a single contract.

------------------------------------------------------------------------

## Expense Management

**Responsibility:** Manage the lifecycle of an expense from creation
through final disposition.

**Owns:** Expense records, expense status, receipt references.

**Does not own:** Approval logic, workflow state, or audit records.

**Why it exists:** Expenses are the central entity of the product.
Isolating CRUD and lifecycle management from workflow logic means the
expense record is the ground truth, not the workflow engine.

------------------------------------------------------------------------

## Workflow Engine

**Responsibility:** Determine the approval chain for a submitted expense
and advance that chain step by step in response to approver actions.

**Owns:** Expense category configurations (created by the Workflow
Admin), including the standard approval chain, elevated approval chain,
and amount threshold per category. Also owns workflow instances (the
approval chain assigned to a specific expense) and workflow step state.

**Does not own:** The expense record itself, user data, or audit
records.

**Why it exists:** Approval logic is the most complex, configurable, and
change-prone part of the system. Isolating it means the category
configuration and state machine can evolve without touching expense
storage or user management. Category-driven workflow selection
eliminates rule conflicts and makes the approval path predictable for
every submitter.

------------------------------------------------------------------------

## Audit

**Responsibility:** Record every workflow action as an immutable,
append-only log entry.

**Owns:** Audit log records.

**Does not own:** Nothing else. It never modifies business data.

**Why it exists:** Auditability is a compliance concern, not a business
concern. Keeping it separate ensures the audit log cannot be
accidentally modified by other domains, and gives Finance Admins a clean
read surface without exposing other internal state.

------------------------------------------------------------------------

## Notification

**Responsibility:** Send email notifications in response to system
events.

**Owns:** Notification templates, delivery queue, send history.

**Does not own:** Business entity state. It consumes events but never
writes back to other domains.

**Why it exists:** Notifications are inherently asynchronous and failure
in email delivery should never block a business transaction. Isolating
this domain prevents notification logic from coupling to the expense or
workflow lifecycle.

------------------------------------------------------------------------

# 4. Module Decomposition

## Auth Module

**Responsibilities:** - Issue JWT access tokens on login - Validate
tokens on every request via middleware - Maintain a blocklist for
invalidated tokens (logout, revocation)

**Dependencies:** User Module (to verify credentials and load user
context)

**Public interface:** - Middleware: `authenticate(req)` --- attaches
`req.user` (userId, tenantId, roles) or rejects with 401 - Service:
`issueToken(userId)`, `revokeToken(tokenId)`

**Data ownership:** JWT blocklist entries in Redis. No persistent
collections of its own.

------------------------------------------------------------------------

## User Module

**Responsibilities:** - Create and manage user accounts within a
tenant - Assign and revoke roles - Provide user lookup by ID or email
(used by Workflow Engine for approver resolution)

**Dependencies:** Role Module (to validate role assignments)

**Public interface:** - `getUserById(userId, tenantId)` -
`getUsersByRole(role, tenantId)` - `assignRole(userId, role, tenantId)`

**Data ownership:** User records, role assignments.

------------------------------------------------------------------------

## Role & Permission Module

**Responsibilities:** - Define the four predefined roles and their
permission sets - Answer authorization questions:
`can(user, action, resource)`

**Dependencies:** None (stateless, policy-defined)

**Public interface:** - `can(userContext, action, resource): boolean` -
`getRolesFor(userId, tenantId): Role[]`

**Data ownership:** Permission definitions are static configuration, not
persisted data.

------------------------------------------------------------------------

## Expense Module

**Responsibilities:** - Create, read, update, and delete expense
records - Manage the expense status field (`draft`, `submitted`,
`in_review`, `approved`, `rejected`, `paid`) - Enforce status transition
rules (e.g., only drafts can be submitted; submitted expenses cannot be
directly edited) - Store receipt S3 references

**Dependencies:** - Auth Module (identity context) - Role & Permission
Module (access control) - Workflow Module (on submission, requests
workflow initialization) - Audit Module (records status transitions)

**Public interface:** - `createExpense(data, userContext)` -
`submitExpense(expenseId, userContext)` --- triggers workflow
initialization - `withdrawExpense(expenseId, userContext)` -
`updateExpenseStatus(expenseId, status)` --- called internally by
Workflow Module - `getExpense(expenseId, userContext)` -
`listExpenses(filters, userContext)`

**Data ownership:** Expense records. The Workflow Module may call
`updateExpenseStatus` but does not own the record.

------------------------------------------------------------------------

## Workflow Module

**Responsibilities:** - Create and manage expense categories per tenant;
each category defines a standard approval chain, an elevated approval
chain, and an amount threshold - On expense submission, look up the
category selected by the employee, compare the amount against the
threshold, select the appropriate chain, and build the ordered approval
steps - Prevent submission if the selected category is deactivated -
Persist the workflow instance for each submitted expense - Process
approver actions (approve, reject, send back) - Enforce the
self-approval constraint --- skip or apply fallback - Advance the chain
to the next step or reach terminal state - Notify the Expense Module of
status changes - Emit events for the Audit and Notification modules

**Dependencies:** - User Module (resolve approvers, validate roles) -
Expense Module (read expense data for rule evaluation; update expense
status on completion) - Audit Module (emit action events) - Notification
Module (emit events on step transitions)

**Public interface:** - `initializeWorkflow(expenseId, tenantId)` ---
called by Expense Module on submission -
`processAction(workflowInstanceId, action, actorId, comment)` -
`getWorkflowInstance(expenseId)` -
`createCategory(categoryConfig, tenantId)` --- Workflow Admin
configuration - `updateCategory(categoryId, categoryConfig, tenantId)` -
`activateCategory(categoryId, tenantId)` -
`deactivateCategory(categoryId, tenantId)` -
`listCategories(tenantId)`

**Data ownership:** Expense category configurations, workflow instances,
approval step records.

------------------------------------------------------------------------

## Audit Module

**Responsibilities:** - Accept audit events from other modules - Persist
them as immutable, append-only records - Serve audit history to
authorized roles (Finance Admin, Org Admin)

**Dependencies:** None (other modules call into it, not the reverse)

**Public interface:** - `record(event: AuditEvent)` ---
`{ tenantId, expenseId, actorId, action, timestamp, comment? }` -
`getAuditLog(expenseId, tenantId)`

**Data ownership:** Audit log records (append-only, never updated or
deleted).

------------------------------------------------------------------------

## Notification Module

**Responsibilities:** - Listen for notification events (submitted,
approved, rejected, paid, etc.) - Resolve recipient email addresses -
Render email templates - Enqueue and dispatch emails

**Dependencies:** User Module (resolve recipient addresses)

**Public interface:** - `enqueueNotification(event: NotificationEvent)`
--- fire-and-forget

**Data ownership:** Notification job queue (Redis), sent notification
records (optional, for observability).

------------------------------------------------------------------------

## Receipt Module

**Responsibilities:** - Generate pre-signed S3 upload URLs for receipt
attachments - Validate that a stored S3 key belongs to the correct
tenant before it is attached to an expense

**Dependencies:** AWS S3 SDK

**Public interface:** -
`getUploadUrl(filename, tenantId): { uploadUrl, s3Key }` -
`validateFileOwnership(s3Key, tenantId): boolean`

**Data ownership:** None. S3 is the store; this module is a thin
gateway.

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
      → Permission Check (submitter owns expense, expense is in DRAFT)
      → Expense Module: submitExpense()
        → Updates expense status to SUBMITTED
        → Publishes ExpenseSubmitted domain event
        → Workflow Module consumes ExpenseSubmitted event and initializes workflow
          → Reads expense data (category, amount)
          → Looks up the active category; blocks if deactivated
          → Selects standard or elevated chain based on amount vs threshold
          → Resolves approver chain from User Module
          → Applies self-approval constraint (skip or fallback)
          → Persists workflow instance with ordered steps
          → Updates expense status to IN_REVIEW via Expense Module
          → Calls Audit Module: record(SUBMITTED event)
          → Calls Notification Module: enqueueNotification(APPROVAL_REQUESTED)
      → Return updated expense to client

All steps up to and including workflow initialization are synchronous.
Notification dispatch is asynchronous (enqueued to Amazon SQS).

------------------------------------------------------------------------

## Approve Expense

    Client → API Server
      → Auth Middleware
      → Permission Check (actor is the current step's assigned approver, not the submitter)
      → Workflow Module: processAction(APPROVE)
        → Validates actor is the active step approver
        → Marks current step as APPROVED
        → If more steps remain:
            → Activates next step
            → Calls Audit Module: record(STEP_APPROVED event)
            → Calls Notification Module: enqueueNotification(NEXT_APPROVAL_REQUESTED)
        → If no more steps:
            → Marks workflow instance as COMPLETED
            → Calls Expense Module: updateExpenseStatus(APPROVED)
            → Calls Audit Module: record(FULLY_APPROVED event)
            → Calls Notification Module: enqueueNotification(EXPENSE_APPROVED)
      → Return updated state to client

------------------------------------------------------------------------

## Reject Expense

    Client → API Server
      → Auth Middleware
      → Permission Check
      → Workflow Module: processAction(REJECT)
        → Marks current step and workflow instance as REJECTED
        → Calls Expense Module: updateExpenseStatus(REJECTED)
        → Calls Audit Module: record(REJECTED event)
        → Calls Notification Module: enqueueNotification(EXPENSE_REJECTED)
      → Return updated state to client

Rejection is terminal. No further workflow actions are possible.

------------------------------------------------------------------------

## Send Back

    Client → API Server
      → Auth Middleware
      → Permission Check
      → Workflow Module: processAction(SEND_BACK)
        → Marks workflow instance as RETURNED
        → Calls Expense Module: updateExpenseStatus(DRAFT)
        → Calls Audit Module: record(SENT_BACK event)
        → Calls Notification Module: enqueueNotification(CHANGES_REQUESTED)
      → Return updated state to client

The expense returns to DRAFT. On resubmission, a new workflow instance
is created from scratch --- the old one is retained for audit history.

------------------------------------------------------------------------

## Mark as Paid

    Client → API Server
      → Auth Middleware
      → Permission Check (Finance Admin role required)
      → Expense Module: updateExpenseStatus(PAID)
        → Validates expense is currently in APPROVED status
        → Calls Audit Module: record(MARKED_PAID event)
        → Calls Notification Module: enqueueNotification(EXPENSE_PAID)
      → Return updated expense to client

No workflow involvement. This is a Finance Admin action on the expense
record directly.

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
                                      (direct edits),   valid
                                      Workflow Module   authorization
                                      (status updates   context
                                      only via public   
                                      interface)        

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
                    (keys), Expense   (upload), Expense authorized users
                    Module            Module (attach    via signed URLs
                    (reference)       reference)        
  -----------------------------------------------------------------------

**Key principle:** No module reaches into another module's data store
directly. Cross-module data access always goes through the owning
module's public interface. The Workflow Module may call
`updateExpenseStatus` on the Expense Module, but it never writes to the
expense collection directly.

------------------------------------------------------------------------

# 7. Communication Patterns

## Synchronous

  -----------------------------------------------------------------------
  Interaction                         Reason
  ----------------------------------- -----------------------------------
  Expense submission                  The client expects a consistent,
                                      confirmed final state (expense is
                                      now IN_REVIEW with a resolved
                                      approval chain) before the response
                                      returns. Partial state would be
                                      confusing and dangerous.

  Workflow state transitions          Approver actions must be confirmed
  (approve, reject, send back)        atomically. The response must
                                      reflect the new state.

  Workflow initialization on submit   The approval chain must be resolved
                                      and persisted as part of the
                                      submission transaction. Delaying
                                      this would create a window where
                                      the expense is submitted but
                                      unrouted.

  Mark as paid                        Simple status update with immediate
                                      confirmation.

  Authorization checks                Must complete before any action
                                      proceeds.

  Receipt upload URL generation       Client is waiting for the signed
                                      URL to proceed with upload.
  -----------------------------------------------------------------------

## Asynchronous

  -----------------------------------------------------------------------
  Interaction                         Reason
  ----------------------------------- -----------------------------------
  Email notifications                 Email delivery is slow, fallible,
                                      and non-critical to the business
                                      transaction. A failed email must
                                      never roll back an approval.
                                      Enqueue to Amazon SQS; retry on
                                      failure independently.

  Audit log writes                    Audit records are written
                                      synchronously as part of the
                                      business transaction --- the audit
                                      record for an action is important
                                      but writing it must not block the
                                      response or risk rolling back the
                                      business transaction if the audit
                                      write fails. **See risk note in
                                      Section 11.**
  -----------------------------------------------------------------------

**Note on audit consistency:** The default recommendation is to write
audit events synchronously within the same request for simplicity and
correctness at MVP scale. Move to async only if audit writes become a
measurable bottleneck. The tradeoff is simplicity vs. decoupling risk.

------------------------------------------------------------------------

# 8. State Management

## Expense Status

**Lifecycle:** `DRAFT → SUBMITTED → IN_REVIEW → APPROVED → PAID`
**Alternate paths:** `IN_REVIEW → REJECTED` (terminal),
`IN_REVIEW → DRAFT` (via Send Back)

**Transitions:** - `DRAFT → SUBMITTED`: Triggered by the submitter
explicitly submitting. - `SUBMITTED → IN_REVIEW`: Triggered by Workflow
Module completing initialization (same request, synchronous). -
`IN_REVIEW → APPROVED`: Triggered by Workflow Module when all steps are
approved. - `IN_REVIEW → REJECTED`: Triggered by Workflow Module on any
approver rejection. - `IN_REVIEW → DRAFT`: Triggered by Workflow Module
on Send Back. - `APPROVED → PAID`: Triggered by Finance Admin.

**Consistency:** The expense status is the single authoritative source
of truth for the expense's position in the lifecycle. The Workflow
Module never directly sets expense status --- it always goes through the
Expense Module's `updateExpenseStatus` interface.

------------------------------------------------------------------------

## Workflow Instance State

**Lifecycle:** `PENDING → ACTIVE → (COMPLETED | REJECTED | RETURNED)`

Each step within an instance has its own state:
`PENDING → ACTIVE → (APPROVED | REJECTED | RETURNED)`.

**Transitions:** - Instance created in `PENDING` state on submission;
immediately activated to `ACTIVE` once the first step is activated. -
Each step is activated in sequence. The currently active step is the
only one that can receive an action. - Instance reaches `COMPLETED` when
the last step is approved. - Instance reaches `REJECTED` when any step
is rejected. - Instance reaches `RETURNED` when any step sends back.

**Consistency:** All step transitions within a single action (e.g.,
approving a step and activating the next) must be written atomically.
MongoDB multi-document transactions should be used for these writes to
prevent inconsistent intermediate states.

**Historical instances:** When an expense is sent back and resubmitted,
the old workflow instance is not deleted. It is retained in `RETURNED`
state for audit history. The new submission creates a fresh workflow
instance.

------------------------------------------------------------------------

## JWT Token State

**Lifecycle:** `ACTIVE → REVOKED`

Tokens are stateless by design. Revocation is handled by a Redis
blocklist keyed by the token's `jti` claim with a TTL matching the
token's expiration. Expired tokens are not blocklisted (they are already
invalid).

------------------------------------------------------------------------

# 9. Extensibility

## Parallel Approvals

The Workflow Module currently models a strictly sequential step chain.
Parallel approvals would require a step to have multiple concurrent
approvers, with a resolution policy (e.g., "all must approve" vs. "any
one approves"). The workflow instance and step data model would need to
accommodate a branching structure, but the external interface
(`processAction`) remains unchanged. No other module is affected.

## Approval Delegation

This requires a delegation record on the User Module (user A delegates
to user B for a date range) and a check in the Workflow Module's
approver resolution logic. The Workflow Module already abstracts
approver resolution --- the delegation logic would be added there, with
a read on the User Module's delegation data. No interface changes to
Expense or Audit.

## Receipt OCR

OCR processing would be a new module that listens for a
`RECEIPT_UPLOADED` event, submits the file to an OCR service, and writes
the extracted data back to the expense draft. It interacts only with the
Receipt Module (to read the file) and the Expense Module (to update
extracted fields). No workflow changes required.

## Multi-Currency

This is primarily an Expense Module concern --- storing an original
currency and amount alongside a normalized amount in a base currency.
The Workflow Module's amount-based rules would operate on the normalized
amount. A Currency Module would own exchange rate fetching and
conversion. No other modules need to change.

## ERP Integrations

An Integration Module would subscribe to `EXPENSE_PAID` events and push
data to external systems. It would read expense and audit data through
the existing public interfaces. No changes to core modules required.

## Policy Engine

Currently, approval rules are simple (department, amount). A Policy
Engine module could replace or augment the Workflow Module's rule
evaluation step with a richer rule DSL. Because rule evaluation is
already isolated inside the Workflow Module, this becomes an internal
replacement rather than a cross-module change.

## Mobile Applications

The backend exposes a JSON REST API with JWT authentication. A mobile
client would consume the same API. No backend changes are required. Push
notifications would be an addition to the Notification Module.

------------------------------------------------------------------------

# 10. Technology Decisions

## MongoDB

**Decision:** Use MongoDB as the primary data store.

**Alternatives considered:** PostgreSQL (relational), DynamoDB
(serverless NoSQL)

**Why:** The approval chain for an expense is naturally a nested,
variable-length structure (an array of steps with their own state).
MongoDB's document model fits this without requiring complex join
queries or schema migrations as the step structure evolves.
Multi-tenancy is implemented by scoping all queries to `tenantId`. The
schema flexibility is valuable during early development when the data
shape of workflow rules and steps is still being refined.

**Tradeoff acknowledged:** Relational integrity (foreign keys, joins) is
not enforced by the database. The application must enforce referential
consistency, and cross-module queries are more expensive than they would
be in a relational store.

------------------------------------------------------------------------

## Redis

**Decision:** Use Redis for JWT blocklist, notification job queue, and
idempotency keys.

**Alternatives considered:** Database-backed job queue (BullMQ with
Redis is the standard), in-memory state

**Why:** Redis TTL-based expiry is a natural fit for the JWT blocklist
(entries expire when the token expires). Redis also serves as the
backing store for BullMQ (or a similar queue library) for async
notification dispatch. Centralizing these ephemeral, high-throughput
operations outside MongoDB keeps the primary store clean.

------------------------------------------------------------------------

## JWT Authentication

**Decision:** Stateless JWT tokens with a revocation list.

**Alternatives considered:** Session-based authentication (server-side
sessions), opaque tokens

**Why:** JWT fits the stateless, API-first architecture and avoids a
session store lookup on every request. The Redis blocklist solves the
revocation problem (logout, role changes) without making the system
fully stateful. Tokens are short-lived (e.g., 15--60 minutes) to limit
exposure.

**Risk:** If a token is compromised, it remains valid until expiry
unless explicitly blocklisted. Mitigated by short TTLs and revocation on
logout.

------------------------------------------------------------------------

## AWS S3 for Receipt Storage

**Decision:** Store receipt files in S3 using pre-signed upload URLs.

**Alternatives considered:** Store files in MongoDB (GridFS), local disk
storage

**Why:** Receipts are binary files of variable size. Storing them
outside the primary database prevents the database from becoming a file
server, keeps MongoDB storage costs predictable, and allows S3's
built-in CDN and access control features to handle delivery. Pre-signed
URLs keep the API server out of the upload path --- the client uploads
directly to S3, and the server only stores the resulting key reference.

------------------------------------------------------------------------

## Event-Driven Notifications (via Job Queue)

**Decision:** Decouple notification dispatch from the request path using
a job queue.

**Alternatives considered:** Synchronous inline email dispatch, database
polling

**Why:** Email delivery latency (and failures) should not affect
business transaction response time or atomicity. A job queue with retry
logic provides resilience without complicating the core flow. BullMQ ()
is a mature, well-supported option in the Node.js ecosystem.

------------------------------------------------------------------------

## Mongoose as ODM

**Decision:** Use Mongoose for MongoDB interaction.

**Alternatives considered:** Native MongoDB driver, Prisma (limited
MongoDB support)

**Why:** Mongoose provides schema definitions with validation,
middleware hooks (useful for audit event emission), and a familiar query
API. It adds a useful contract layer even though MongoDB itself is
schemaless, which reduces runtime data integrity bugs during
development.

------------------------------------------------------------------------

# 11. Technical Risks

## Workflow State Consistency

**Risk:** An approval action involves multiple writes --- updating the
current step, activating the next step, and updating the expense status.
If one write fails mid-sequence, the system ends up in an inconsistent
state (e.g., a step is marked approved but the next step is never
activated).

**Mitigation:** Use MongoDB multi-document transactions for all workflow
state transitions that span more than one document. Define and test the
exact set of writes that must be atomic for each action.

------------------------------------------------------------------------

## Self-Approval Constraint at Resolution Time

**Risk:** The approval chain is resolved at submission time. If an
approver is also the submitter, the system must skip them or apply a
fallback. The PRD leaves fallback behavior as an open question. If no
fallback is configured, the workflow may be unresolvable.

**Mitigation:** Define a clear fallback policy before implementation
(see Open Questions). Implement a validation step at workflow
initialization that fails loudly if no valid approver chain can be
constructed.

------------------------------------------------------------------------

## Tenant Isolation Enforcement

**Risk:** Multi-tenancy is enforced in application code, not by the
database. A missing `tenantId` filter in any query is a data leak
between organizations.

**Mitigation:** Enforce `tenantId` filtering at the module boundary ---
every public interface method that reads data must accept and apply
`tenantId`. Add an integration test suite that asserts cross-tenant data
is never returned.

------------------------------------------------------------------------

## Category Deactivation During Submission

**Risk:** A Workflow Admin deactivates a category while employees have
expenses in Draft status under that category. If not caught, those
drafts could submit without a valid approval chain.

**Mitigation:** The `initializeWorkflow` function validates that the
selected category is active before proceeding. If the category is
deactivated, submission is rejected with a clear error message telling
the employee to select an active category. This check is inside the
transaction so no partial state is written.

------------------------------------------------------------------------

## MongoDB Transaction Performance

**Risk:** MongoDB multi-document transactions carry overhead compared to
single-document writes. If workflow actions become a bottleneck, the
transaction boundary may be a contributing factor.

**Mitigation:** At MVP scale, this is unlikely to be a problem. Design
the workflow instance document to contain the step array, allowing all
step state updates to be written as a single document update (atomic by
default in MongoDB), minimizing the need for multi-document
transactions.

------------------------------------------------------------------------

## Notification Delivery Failures

**Risk:** Email delivery can fail silently or be rate-limited. Without
visibility into delivery failures, the system appears healthy but users
miss notifications.

**Mitigation:** Use a job queue with configurable retry and dead-letter
behavior. Log failed deliveries. For MVP, this is sufficient; production
would add a transactional email provider with delivery webhooks.

------------------------------------------------------------------------

## JWT Blocklist Growth

**Risk:** The Redis blocklist will grow as users log out or tokens are
revoked. Without cleanup, memory pressure accumulates.

**Mitigation:** Store blocklist entries with a TTL equal to the token's
remaining lifetime. Redis TTL-based expiry ensures the blocklist
self-cleans. No manual purge required.

------------------------------------------------------------------------

# 12. Open Technical Questions

1.  **Category deactivation with in-draft expenses.** If a Workflow
    Admin deactivates a category while employees have unsaved or saved
    drafts in that category, those drafts must be blocked at submission
    time with a clear error. The employee must switch to a different
    active category before submitting.

2.  **Self-approval fallback.** When the only approver for a workflow
    step is the submitter, what is the correct behavior? Options:
    escalate to the step's configured fallback approver, skip the step
    entirely, or block submission with an error. If a fallback approver
    is required, how is that configured?

3.  **Workflow instance history on resubmission.** When a sent-back
    expense is resubmitted, the old workflow instance is retained. Is
    there a maximum number of historical workflow instances per expense,
    or is all history retained indefinitely?

4.  **Atomic expense submission.** Expense submission is synchronous and
    involves several writes (expense status, workflow instance creation,
    first step activation). What is the rollback behavior if workflow
    initialization fails after the expense status has been updated?
    Should the expense be rolled back to DRAFT, or left in SUBMITTED for
    manual intervention?

5.  **Receipt attachment validation.** Should the API validate that the
    S3 key provided when creating an expense actually exists and belongs
    to the current tenant before persisting it? What happens if an
    expense references a deleted or inaccessible S3 object?

6.  **Approver chain for zero matching rules.** If no workflow rule
    matches a submitted expense, should submission be blocked, or should
    the expense be auto-approved (requiring no approvers)? This is a
    business decision with direct implementation consequences.

7.  **MongoDB transaction scope for workflow actions.** The workflow
    instance document may contain the step array. If so, all step
    transitions can be a single document write (atomic). If steps are
    separate documents, multi-document transactions are required. This
    decision should be made explicitly before data modeling begins.

8.  **Rate limiting and idempotency.** Should approval actions (approve,
    reject, send back) be idempotent (e.g., double-clicking approve
    should not create duplicate audit entries or advance the workflow
    twice)? If so, where is the idempotency key managed ---
    client-supplied or server-generated?

------------------------------------------------------------------------

------------------------------------------------------------------------

# 13. Shared Infrastructure

The following are application-wide cross-cutting concerns and are
**not** business modules:

-   Validation
-   Configuration
-   Logging
-   Error Handling
-   Observability
-   Rate Limiting

These are shared by all modules and should remain independent of
business logic.

*Document status: Draft --- Architecture V1. Pending Principal Engineer
review.*
