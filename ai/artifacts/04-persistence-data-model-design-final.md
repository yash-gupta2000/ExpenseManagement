# Persistence & Data Model Design Document

## Expense Management System --- MongoDB Persistence Layer

*Status: Draft --- Follows Architecture V2
(03-technical-design-final.md)*

------------------------------------------------------------------------

# 1. Persistence Strategy

## Why MongoDB Fits This Domain

The central modeling challenge in this system is the approval workflow.
An expense carries a variable-length, ordered list of approval steps,
each with its own actor, decision, timestamp, and comment. In a
relational database this requires a minimum of three tables (expenses,
workflow_instances, approval_steps) with multi-table joins on every
read. In MongoDB the entire workflow instance --- steps included ---
lives inside the expense document, making a full state read a single
document fetch.

The domain has two structural characteristics that favor a document
store:

1.  **Variable-depth, nested state.** The approval chain length varies
    by workflow rule. Embedding steps as an array handles this naturally
    without schema migrations.
2.  **Aggregate-coherent writes.** Most write operations (approve,
    reject, send back) touch a workflow instance and its steps
    atomically. These entities belong together; co-locating them in the
    same document makes those writes single-document operations ---
    atomic by default, no transaction required.

Multi-tenancy maps cleanly to a `tenantId` field on every document.
There are no cross-tenant joins, which removes the primary pain point of
enforcing tenant isolation in a relational model.

## Aggregate Boundaries

The design recognizes four aggregates:

  -----------------------------------------------------------------------
  Aggregate               Root Document           Embedded Children
  ----------------------- ----------------------- -----------------------
  Organization            `organizations`         tenant-level config

  User                    `users`                 role assignments

  Expense                 `expenses`              workflow instance,
                                                  approval steps, receipt
                                                  refs

  Expense Category        `expenseCategories`     standardChain, elevatedChain, threshold
  -----------------------------------------------------------------------

Audit events and notification records are not aggregates in the DDD
sense --- they are append-only log entries. They live in their own
collections because they are owned by independent modules and have
independent growth and retention characteristics.

## Document-Oriented Modeling Approach

The guiding principle: **embed what changes together; reference what
changes independently.**

Workflow steps change only in the context of their workflow instance,
which changes only in the context of its expense. They are embedded.
Users change independently of expenses --- role reassignments, profile
updates --- so expenses hold a `userId` reference, not a copy of the
user document. The Expense document is the central aggregate; it is
intentionally larger than a normalized row.

## Consistency Strategy

All state-changing operations that span multiple logical entities
(expense status + workflow instance + audit log) use MongoDB
multi-document transactions on a replica set. Single-document writes are
atomic by default and do not require a transaction.

The WorkflowInstance sub-document carries a `version` integer for
optimistic locking. Every workflow action handler reads the current
version and includes it in the update filter. A concurrent write that
already incremented the version causes the update to match zero
documents, triggering a 409 Conflict response.

## Transaction Strategy

Transactions are used narrowly --- only where atomicity across multiple
documents is required. The expense submission flow, approval actions,
rejection, send-back, and mark-paid all involve the expense document and
the audit log collection. These operations require transactions.
Creating a draft expense, listing expenses, and fetching workflow state
do not.

------------------------------------------------------------------------

# 2. Collection Design

## `organizations`

**Purpose:** Stores tenant-level identity and configuration. One
document per organization.

**Ownership:** User Module, Org Admin actions.

**Growth:** One document per tenant. Expected to be a small,
slow-growing collection. At MVP scale, thousands of documents at most.
Reads are primarily at authentication time to resolve tenant context.

------------------------------------------------------------------------

## `users`

**Purpose:** Stores user accounts, credentials, and role assignments
within a tenant.

**Ownership:** User Module.

**Growth:** Linear with the number of users across all tenants. At MVP
scale, expected to remain small. Reads are frequent --- every
authenticated request resolves the user context. Writes are infrequent.

------------------------------------------------------------------------

## `expenses`

**Purpose:** Stores the expense aggregate: expense fields, business
status, the embedded workflow instance, approval steps, and receipt key
references.

**Ownership:** Expense Module (direct writes). Workflow Module writes
through the Expense Module's `updateExpenseStatus` interface only.

**Growth:** The dominant collection by document count. Grows
continuously as employees submit expenses. A retention or archival
policy will eventually be needed; at MVP all records are kept
indefinitely. Document size grows modestly with each approval step added
(each step is a small embedded object, typically under 500 bytes).

------------------------------------------------------------------------

## `expenseCategories`

**Purpose:** Stores expense category definitions per tenant. Each
category carries a standard approval chain, an elevated approval chain,
an amount threshold that splits the two, and an active/inactive flag.
The category selected by the employee at draft creation time determines
the approval chain at submission.

**Ownership:** Workflow Module.

**Growth:** Small and slow-growing. Organizations typically maintain a
handful of categories (e.g., Travel, Food, Reimbursement, Equipment).
Document count per tenant is expected to remain under 50 at MVP scale.

------------------------------------------------------------------------

## `auditLogs`

**Purpose:** Immutable, append-only record of every workflow action and
significant business event. Owned exclusively by the Audit Module.

**Ownership:** Audit Module. No other module may write to or modify this
collection.

**Growth:** One document per business event. Grows proportionally with
the number of approval actions across all tenants. Audit records are
permanent at MVP; no deletion. This collection will grow to be large
over time and is the primary archival candidate.

------------------------------------------------------------------------

## `notificationRecords` *(optional at MVP)*

**Purpose:** Write-side record of notification jobs dispatched to SQS.
Used for observability --- confirming a notification was enqueued,
tracking delivery outcomes reported by the SQS worker.

**Ownership:** Notification Module.

**Growth:** One document per notification event. Grows with expense
activity. At MVP this collection is optional; if omitted, SQS and
CloudWatch are the sole observability surface for notifications.

------------------------------------------------------------------------

# 3. Document Design

## `organizations`

    {
      _id: ObjectId,
      name: string,
      slug: string,                 // URL-safe identifier, unique
      settings: {
        defaultCurrency: string,    // e.g. "USD"
        timezone: string            // e.g. "America/New_York" (out of scope for MVP, reserved)
      },
      createdAt: Date,
      updatedAt: Date
    }

**Notes:** The `slug` field provides a human-readable identifier for the
tenant used in URL routing. Settings is an embedded object ---
organizational configuration changes infrequently and is always read as
a unit.

------------------------------------------------------------------------

## `users`

    {
      _id: ObjectId,
      tenantId: ObjectId,           // ref: organizations._id
      email: string,
      passwordHash: string,
      firstName: string,
      lastName: string,
      department: string,           // department assignment
      managerId: ObjectId | null,   // ref: users._id; direct manager for workflow resolution
      roles: [string],              // e.g. ["employee", "manager"]
      isActive: boolean,
      createdAt: Date,
      updatedAt: Date
    }

**Notes:** `roles` is a string array rather than a reference array ---
the Role & Permission Module defines roles as static configuration, not
persisted documents. Embedding the role names directly avoids a join
that would otherwise occur on every authorization check. `department` is
stored for workflow rule evaluation, while `managerId` enables
manager-based approval resolution.

**Assumption:** Users are created and managed by the Organization Admin.
Each user belongs to exactly one tenant, may have multiple roles,
belongs to one department, and may have a single direct manager.

------------------------------------------------------------------------

## `expenses`

    {
      _id: ObjectId,
      tenantId: ObjectId,           // ref: organizations._id
      submittedBy: ObjectId,        // ref: users._id
      title: string,
      amount: number,               // stored in cents (integer)
      currency: string,
      date: Date,
      categoryId: ObjectId,         // ref: expenseCategories._id
      categoryName: string,         // denormalized at create time for display without a join
      description: string,

      status: string,               // DRAFT | SUBMITTED | IN_REVIEW | APPROVED | REJECTED | PAID

      receipt: {                    // null if no receipt attached
        s3Key: string,
        filename: string,
        contentType: string,
        uploadedAt: Date
      } | null,

      workflowInstance: {           // null until expense is submitted
        _id: ObjectId,              // locally unique ID within the document
        categoryId: ObjectId,       // ref: expenseCategories._id — category that resolved this chain
        chainType: string,          // "STANDARD" | "ELEVATED" — which chain was selected
        status: string,             // PENDING | ACTIVE | COMPLETED | REJECTED | RETURNED
        version: number,            // optimistic locking counter
        resolvedAt: Date,           // when the chain was frozen at submission time
        completedAt: Date | null,
        steps: [
          {
            stepIndex: number,      // 0-based, determines order
            approverId: ObjectId,   // ref: users._id
            status: string,         // PENDING | ACTIVE | APPROVED | REJECTED | RETURNED
            decidedAt: Date | null,
            comment: string | null
          }
        ]
      } | null,

      // Historical workflow instances retained when expense is sent back and resubmitted.
      // Array grows by one entry per send-back/resubmit cycle.
      workflowHistory: [
        {
          _id: ObjectId,
          categoryId: ObjectId,
          chainType: string,        // "STANDARD" | "ELEVATED"
          status: string,           // terminal state of this instance (RETURNED)
          version: number,
          resolvedAt: Date,
          completedAt: Date | null,
          steps: [ ... ]            // same shape as workflowInstance.steps
        }
      ],

      createdAt: Date,
      updatedAt: Date
    }

**Notes:**

-   `workflowInstance` is embedded. It always changes together with the
    expense status --- they are never updated independently in different
    requests.
-   `workflowHistory` is an append-only array. Each entry is a prior
    workflow instance moved here when the expense is sent back. At MVP,
    all history is retained indefinitely.
-   `receipt` is an embedded object rather than a reference. There is at
    most one receipt per expense and its fields are always read
    alongside the expense. An array would be used if multiple receipts
    per expense were required.
-   `workflowInstance._id` is a locally generated ObjectId --- it
    uniquely identifies this instance across the system (e.g., for
    idempotency keys and audit log references) without requiring a
    separate collection.

------------------------------------------------------------------------

## `expenseCategories`

    {
      _id: ObjectId,
      tenantId: ObjectId,           // ref: organizations._id
      name: string,                 // human-readable label, e.g. "Travel"
      isActive: boolean,

      amountThreshold: number,      // in cents; amounts <= threshold use standardChain

      standardChain: [              // used when amount <= amountThreshold
        {
          stepIndex: number,
          resolverType: string,     // "ROLE" | "USER" | "MANAGER"
          resolverValue: string     // role name, userId, or ignored for MANAGER
        }
      ],

      elevatedChain: [              // used when amount > amountThreshold
        {
          stepIndex: number,
          resolverType: string,
          resolverValue: string
        }
      ],

      createdAt: Date,
      updatedAt: Date
    }

**Notes:**

-   Both `standardChain` and `elevatedChain` define template steps. At
    submission time the Workflow Module resolves each step to a specific
    user (`approverId`) and writes the resolved chain into
    `expense.workflowInstance.steps`. The category stores templates, not
    resolved chains.
-   `resolverType: "MANAGER"` resolves the submitter's direct manager
    via `users.managerId`. `resolverType: "ROLE"` resolves to an active
    user with that role. `resolverType: "USER"` targets a specific user.
-   Soft-deactivating categories via `isActive: false` is preferred over
    hard deletion. Existing expenses reference `categoryId`; deleting the
    document would orphan those references.
-   If `amountThreshold` is set to a very high value (e.g., max integer),
    the elevated chain effectively never triggers, making the category
    single-chain. This avoids a separate flag for "no threshold" cases.

------------------------------------------------------------------------

## `auditLogs`

    {
      _id: ObjectId,
      tenantId: ObjectId,           // ref: organizations._id
      expenseId: ObjectId,          // ref: expenses._id
      workflowInstanceId: ObjectId, // matches expense.workflowInstance._id at time of action
      actorId: ObjectId,            // ref: users._id
      action: string,               // SUBMITTED | STEP_APPROVED | FULLY_APPROVED | REJECTED | SENT_BACK | MARKED_PAID
      stepIndex: number | null,     // which step was acted on, null for non-step actions
      comment: string | null,
      traceId: string,              // from request context for log correlation
      timestamp: Date               // set at write time; immutable
    }

**Notes:**

-   No `updatedAt`. Audit documents are write-once.
-   `traceId` links the audit entry to the originating HTTP request log
    line.
-   `workflowInstanceId` is denormalized here for query convenience ---
    looking up audit history for a specific workflow instance does not
    require joining through the expense document.

------------------------------------------------------------------------

## `notificationRecords` *(optional at MVP)*

    {
      _id: ObjectId,
      tenantId: ObjectId,
      expenseId: ObjectId,
      workflowInstanceId: ObjectId | null,
      notificationType: string,     // APPROVAL_REQUESTED | EXPENSE_APPROVED | EXPENSE_REJECTED | ...
      recipientUserId: ObjectId,
      sqsMessageId: string,         // returned by SQS enqueue call
      status: string,               // ENQUEUED | SENT | FAILED
      traceId: string,
      enqueuedAt: Date,
      processedAt: Date | null
    }

------------------------------------------------------------------------

# 4. Aggregate Boundaries

## Expense Aggregate

**Root:** `expenses` document

**Embedded children:** - `workflowInstance` --- the active workflow
instance with its steps - `workflowHistory` --- array of prior workflow
instances from send-back cycles - `receipt` --- the attached file
reference

**Why they belong together:**

The expense, its active workflow instance, and its steps are read and
written as a unit on every approval action. When a manager approves a
step, the handler reads the current workflow state, validates the actor
and step, marks the step approved, potentially advances to the next step
or closes the instance, and updates the expense status --- all in one
operation. Embedding makes this a single document update. Splitting
these into separate collections would require transactions on every
approval action and add join-latency to every workflow read.

`workflowHistory` belongs in the same document because it is logically
part of the expense's full lifecycle history. It is written once (on
send-back) and then read-only. It never grows unboundedly for a single
expense --- an expense would need to be sent back and resubmitted many
times to make this array large, and each entry is compact.

`receipt` is embedded because it is a single, small object tightly
coupled to the expense it belongs to.

**What is referenced, not embedded:** - `submittedBy` (userId): user
records change independently - `workflowInstance.steps[n].approverId`
(userId): same reason - `workflowInstance.ruleId`: rule configurations
are managed independently by the Org Admin

------------------------------------------------------------------------

## User Aggregate

**Root:** `users` document

**Embedded children:** - `roles` array (role name strings)

**Why:** Role assignments on a user are always read and written
together. A user always exists in a single tenant context. There is no
independent lifecycle for a role assignment --- it exists only in
relation to the user it is assigned to.

------------------------------------------------------------------------

## Organization Aggregate

**Root:** `organizations` document

**Embedded children:** - `settings` object

**Why:** An organization has a small, stable settings payload. There is
no other entity that owns or modifies settings independently.

------------------------------------------------------------------------

## ExpenseCategory Aggregate

**Root:** `expenseCategories` document

**Embedded children:** - `standardChain` array (step templates for
amounts at or below threshold) - `elevatedChain` array (step templates
for amounts above threshold)

**Why:** Both chains and the threshold are definitionally part of the
category. They have no independent identity or lifecycle. Embedding them
makes chain selection and resolution a single document read at submission
time.

------------------------------------------------------------------------

# 5. Embedding vs. Referencing

## Expense ↔ Workflow Instance and Steps

**Decision: Embed**

The workflow instance and its steps are always read with the expense. On
every approval action the handler reads the expense document, reads the
current workflow state from the embedded instance, validates the action,
and writes back to the same document. There is never a reason to read
steps without the expense, or the expense without the steps.

Embedding also means the common-path approval action --- read expense →
validate → update step → write expense --- is a single document read and
a single document write. No transaction needed for intermediate
approvals (only when the expense status also changes).

------------------------------------------------------------------------

## Expense ↔ Users (submitter, approvers)

**Decision: Reference**

User records change independently. A user's name, email, department, and
roles can be updated at any time by an Org Admin. If user fields were
embedded in the expense, those fields would become stale and require
synchronization. References allow the User Module to own user data
exclusively.

At read time (e.g., rendering an expense detail view), the API layer
resolves user names from their IDs. This is a small, bounded set of
lookups per request --- typically one to four users per expense.

------------------------------------------------------------------------

## Expense ↔ ExpenseCategory

**Decision: Reference (categoryId stored in expense and workflowInstance)**

The category selected by the employee is stored as `categoryId` on the
expense document, and `workflowInstance.categoryId` records which
category resolved the chain. `categoryName` is denormalized onto the
expense at creation time so the display name is always available without
a join. The category itself is not embedded in the workflow instance
because categories change over time --- a Workflow Admin may update
chains or the threshold. The reference preserves the historical fact of
which category was applied. `chainType` (`STANDARD` or `ELEVATED`)
records which of the two chains was selected, providing full auditability
of the approval path chosen. A full `categorySnapshot` field can be
added to `workflowInstance` later without breaking existing documents.

------------------------------------------------------------------------

## Expense ↔ Audit Log

**Decision: Reference (expenseId in auditLogs)**

Audit log entries are owned by a separate module, are append-only, and
are a distinct concern from the expense aggregate. Embedding audit
entries in the expense document would cause unbounded document growth
(every action adds an entry forever) and would give the Expense Module
shared ownership of audit data --- violating the module boundary. The
Audit Module owns its collection; the expense document holds no
reference back to audit entries.

------------------------------------------------------------------------

## WorkflowRule ↔ Approver Chain Steps

**Decision: Embed**

The approver chain template (resolver type and value) is integral to the
rule definition. It has no independent identity or lifecycle. A rule
without its chain template is incomplete. Embedding keeps rule
evaluation as a single document read.

------------------------------------------------------------------------

## Receipt ↔ Expense

**Decision: Embed (as a sub-object)**

An expense has at most one receipt. The receipt metadata (S3 key,
filename, content type) is small and always read with the expense. There
is no use case for reading receipt metadata without the expense or for
sharing a receipt across expenses. An embedded object is simpler and
cheaper than a separate collection.

------------------------------------------------------------------------

### Chain Selection

There is no conflict resolution. The employee selects a category when
creating the expense. The Workflow Module looks up that single category
document and compares `expense.amount` against `amountThreshold`:

-   `amount <= amountThreshold` → use `standardChain`
-   `amount > amountThreshold` → use `elevatedChain`

If the category is inactive, submission is rejected. This is a
deterministic lookup, not a matching algorithm.

# 6. Index Strategy

## `organizations`

  Index         Fields   Type     Purpose
  ------------- -------- -------- --------------------------------------
  Default       `_id`    Unique   Primary key lookup
  Unique slug   `slug`   Unique   Tenant lookup by URL-safe identifier

------------------------------------------------------------------------

## `users`

  ----------------------------------------------------------------------------------------------------------
  Index             Fields                              Type              Purpose
  ----------------- ----------------------------------- ----------------- ----------------------------------
  Default           `_id`                               Unique            Primary key lookup

  Tenant + email    `{ tenantId, email }`               Unique            Login lookup; ensures email
                                                                          uniqueness within a tenant

  Tenant + roles    `{ tenantId, roles }`               Compound          Workflow Module:
                                                                          `getUsersByRole(role, tenantId)`
                                                                          --- resolves approvers during
                                                                          workflow initialization

  Tenant +          `{ tenantId, department, roles }`   Compound          Workflow Module: resolves
  department +                                                            approvers filtered by both
  roles                                                                   department and role
  ----------------------------------------------------------------------------------------------------------

**Note:** The compound `{ tenantId, department, roles }` index is the
most important user index for this domain. Approver resolution at
submission time queries for users with a specific role in a specific
department within the tenant. Without this index, initialization would
perform a collection scan on users.

------------------------------------------------------------------------

## `expenses`

  --------------------------------------------------------------------------------------------------------------------------------------------
  Index             Fields                                                                                 Type              Purpose
  ----------------- -------------------------------------------------------------------------------------- ----------------- -----------------
  Default           `_id`                                                                                  Unique            Primary key
                                                                                                                             lookup

  Tenant +          `{ tenantId, submittedBy, status }`                                                    Compound          Employee
  submitter +                                                                                                                dashboard: list
  status                                                                                                                     own expenses by
                                                                                                                             status

  Tenant + status   `{ tenantId, status }`                                                                 Compound          Finance Admin
                                                                                                                             dashboard: list
                                                                                                                             all tenant
                                                                                                                             expenses by
                                                                                                                             status

  Tenant + workflow `{ tenantId, "workflowInstance.steps.approverId", "workflowInstance.steps.status" }`   Compound          Manager queue:
  step approver +                                                                                          (multikey)        find expenses
  step status                                                                                                                where the manager
                                                                                                                             has an ACTIVE
                                                                                                                             pending step

  Tenant + created  `{ tenantId, createdAt }`                                                              Compound          Pagination and
                                                                                                                             date-range
                                                                                                                             filtering across
                                                                                                                             dashboards
  --------------------------------------------------------------------------------------------------------------------------------------------

**Notes:**

-   The manager queue index uses MongoDB's multikey indexing on the
    embedded steps array. The query pattern is: find expenses in this
    tenant where `workflowInstance.steps` contains an entry with
    `approverId = X` and `status = "ACTIVE"`. MongoDB multikey indexes
    support this pattern.
-   `{ tenantId, status }` covers both the Finance Admin dashboard
    (filter by status across all submitters) and broader audit queries.
-   Avoid indexing `workflowInstance.version` --- it is used in update
    filters (`$set` with a match condition), not in queries that return
    documents.

------------------------------------------------------------------------

## `expenseCategories`

  --------------------------------------------------------------------------------
  Index             Fields                     Type              Purpose
  ----------------- -------------------------- ----------------- -----------------
  Default           `_id`                      Unique            Primary key
                                                                 lookup

  Tenant + active   `{ tenantId, isActive }`   Compound          List active
                                                                 categories for
                                                                 the expense
                                                                 creation form
  --------------------------------------------------------------------------------

**Note:** Chain selection at submission is a single document lookup by
`_id` (the `categoryId` stored on the expense). No full-set scan or
application-level evaluation is needed.

------------------------------------------------------------------------

## `auditLogs`

  ----------------------------------------------------------------------------------
  Index             Fields                       Type              Purpose
  ----------------- ---------------------------- ----------------- -----------------
  Default           `_id`                        Unique            Primary key
                                                                   lookup

  Expense +         `{ expenseId, timestamp }`   Compound          Fetch audit
  timestamp                                                        history for a
                                                                   specific expense
                                                                   in chronological
                                                                   order

  Tenant +          `{ tenantId, timestamp }`    Compound          Admin queries:
  timestamp                                                        all audit events
                                                                   for a tenant in a
                                                                   time range
  ----------------------------------------------------------------------------------

**Note:** Audit logs are write-heavy and read-rarely (only Finance Admin
and Org Admin views). Keep indexes minimal to avoid write overhead.

------------------------------------------------------------------------

## `notificationRecords`

  --------------------------------------------------------------------------------------
  Index             Fields                     Type              Purpose
  ----------------- -------------------------- ----------------- -----------------------
  Default           `_id`                      Unique            Primary key lookup

  Expense           `{ expenseId }`            Single            Look up all
                                                                 notifications for an
                                                                 expense
                                                                 (debug/observability)

  Status + enqueued `{ status, enqueuedAt }`   Compound          Find failed or
                                                                 unprocessed jobs
  --------------------------------------------------------------------------------------

------------------------------------------------------------------------

# 7. Query Patterns

## Employee Dashboard: List My Expenses

-   **Collection:** `expenses`
-   **Filters:** `{ tenantId, submittedBy: currentUserId }`, optionally
    filtered by `status`
-   **Sort:** `createdAt DESC`
-   **Pagination:** cursor-based on `_id` or offset-based with
    `skip/limit`
-   **Index used:** `{ tenantId, submittedBy, status }`
-   **Notes:** Returns the expense document directly; the embedded
    `workflowInstance.status` provides the current state without a join.
    The full step array is small enough to return inline for a detail
    view.

------------------------------------------------------------------------

## Manager Approval Queue: Expenses Pending My Review

-   **Collection:** `expenses`
-   **Filters:**
    `{ tenantId, "workflowInstance.steps": { $elemMatch: { approverId: managerId, status: "ACTIVE" } }, "workflowInstance.status": "ACTIVE" }`
-   **Sort:** `createdAt ASC` (oldest first --- standard queue ordering)
-   **Index used:** Multikey index on
    `{ tenantId, "workflowInstance.steps.approverId", "workflowInstance.steps.status" }`
-   **Notes:** The `$elemMatch` query is critical --- it ensures both
    conditions (`approverId` and `status`) match on the same array
    element, not across different elements. This is the most
    query-critical index in the system.

------------------------------------------------------------------------

## Finance Admin Dashboard: All Expenses by Status

-   **Collection:** `expenses`
-   **Filters:** `{ tenantId }`, optionally
    `{ tenantId, status: "APPROVED" }` for the "pending payment" view
-   **Sort:** `updatedAt DESC`
-   **Index used:** `{ tenantId, status }`
-   **Notes:** Finance Admin reads across all submitters in the tenant.

------------------------------------------------------------------------

## Expense Detail View

-   **Collection:** `expenses`
-   **Filters:** `{ _id: expenseId, tenantId }` (tenantId is mandatory
    to prevent cross-tenant access)
-   **Index used:** `_id` (primary key)
-   **Notes:** Returns the full document including embedded workflow
    instance and steps. Approver names are resolved separately by the
    User Module using the `approverId` references in the step array.

------------------------------------------------------------------------

## Workflow Lookup: Get Active Instance for an Expense

-   **Collection:** `expenses`
-   **Filters:** `{ _id: expenseId, tenantId }`
-   **Index used:** `_id`
-   **Notes:** The workflow instance is embedded. No separate collection
    lookup needed.

------------------------------------------------------------------------

## Audit History for an Expense

-   **Collection:** `auditLogs`
-   **Filters:** `{ expenseId, tenantId }`
-   **Sort:** `timestamp ASC`
-   **Index used:** `{ expenseId, timestamp }`
-   **Notes:** Returns a small, bounded list of events (one per workflow
    action). Actor names are resolved from `actorId` by the User Module.

------------------------------------------------------------------------

## Category Lookup at Submission

-   **Collection:** `expenseCategories`
-   **Filters:** `{ _id: expense.categoryId, tenantId }`
-   **Index used:** `_id` (primary key)
-   **Notes:** A single document lookup by the category ID stored on the
    expense. The Workflow Module reads `isActive`, `amountThreshold`,
    `standardChain`, and `elevatedChain` from this single document.
    No set scan or application-level scoring is required.

During approver resolution, if a resolved approver is the same as the
expense submitter, the Workflow Module automatically skips or escalates
to the next valid approver. The resolved chain is frozen inside the
workflow instance and is unaffected by later category changes.

------------------------------------------------------------------------

## Approver Resolution at Submission

-   **Collection:** `users`
-   **Filters:** `{ tenantId, roles: roleName }` or
    `{ tenantId, department: dept, roles: roleName }`
-   **Index used:** `{ tenantId, roles }` or
    `{ tenantId, department, roles }`
-   **Notes:** Called once per step in the approval chain during
    `initializeWorkflow`. The result is frozen into
    `workflowInstance.steps` at that time and not re-queried on
    subsequent actions.

------------------------------------------------------------------------

# 8. Transaction Design

MongoDB multi-document transactions are used when an operation must
atomically modify more than one collection or when the failure of any
step should roll back the entire operation.

## Expense Submission

**Documents involved:** - `expenses` (status: DRAFT → SUBMITTED →
IN_REVIEW; `workflowInstance` written) - `auditLogs` (new entry:
SUBMITTED)

**Why a transaction is required:** The expense must never end up in
SUBMITTED or IN_REVIEW without a corresponding workflow instance. If
workflow initialization fails (no matching rule, approver resolution
error), the expense must revert to DRAFT. The audit entry must appear if
and only if the status change commits.

**Consistency guarantee:** Either the expense is IN_REVIEW with a fully
resolved workflow instance and an audit entry, or it is DRAFT with
nothing written.

------------------------------------------------------------------------

## Approve Step (Intermediate --- not final step)

**Documents involved:** - `expenses` (update step status to APPROVED,
activate next step, increment `workflowInstance.version`) - `auditLogs`
(new entry: STEP_APPROVED)

**Why a transaction is required:** The step state change and the audit
record must be atomic. A committed approval with no audit entry is a
compliance violation. A written audit entry with no committed state
change would produce a misleading audit log.

**Notes:** The expense `status` field does not change on intermediate
approvals. Only the embedded step and version change --- this is a
single document write plus an insert to `auditLogs`, requiring a
transaction.

------------------------------------------------------------------------

## Approve Step (Final --- all steps approved)

**Documents involved:** - `expenses` (step → APPROVED,
`workflowInstance.status` → COMPLETED, `workflowInstance.completedAt`
set, `status` → APPROVED, increment version) - `auditLogs` (new entry:
FULLY_APPROVED)

**Why a transaction is required:** The expense status change and the
workflow completion and the audit entry must all commit together.

------------------------------------------------------------------------

## Reject Expense

**Documents involved:** - `expenses` (step → REJECTED,
`workflowInstance.status` → REJECTED, `status` → REJECTED, increment
version) - `auditLogs` (new entry: REJECTED)

**Why a transaction is required:** Same reasoning as approval. Rejection
is terminal; partial state would leave the expense in an irrecoverable
inconsistent state.

------------------------------------------------------------------------

## Send Back

**Documents involved:** - `expenses` (`workflowInstance` moved to
`workflowHistory`, `workflowInstance` set to null, `status` → DRAFT,
increment version) - `auditLogs` (new entry: SENT_BACK)

**Why a transaction is required:** The workflow instance archival and
status reset must be atomic with the audit entry.

------------------------------------------------------------------------

## Mark as Paid

**Documents involved:** - `expenses` (`status` → PAID) - `auditLogs`
(new entry: MARKED_PAID)

**Why a transaction is required:** A committed PAID status must have a
corresponding audit record.

------------------------------------------------------------------------

## Operations That Do NOT Require Transactions

  -----------------------------------------------------------------------
  Operation                           Reason
  ----------------------------------- -----------------------------------
  Create draft expense                Single document write to
                                      `expenses`. Atomic by default.

  Update draft expense                Single document write.

  Withdraw expense                    Status revert + audit --- requires
                                      transaction (SUBMITTED → DRAFT)

  Fetch expense detail                Read-only.

  List expenses                       Read-only.

  Fetch audit log                     Read-only.

  Enqueue notification                Fire-and-forget to SQS; not
                                      transactional with MongoDB by
                                      design.

  Create/update workflow rule         Single document write to
                                      `workflowRules`.

  Assign user role                    Single document write to `users`.
  -----------------------------------------------------------------------

**Note on withdraw:** Withdrawing a submitted expense (SUBMITTED →
DRAFT, before workflow initialization) is a status revert on the expense
document only. If the expense is already IN_REVIEW, withdrawal is not
permitted --- the submitter must wait for a send-back. For SUBMITTED →
DRAFT withdrawal, this touches one expense document and one audit entry,
requiring a transaction.

------------------------------------------------------------------------

# 9. Concurrency Strategy

## Double-Approval / Concurrent Workflow Actions

The primary concurrency risk is two requests attempting to act on the
same workflow step simultaneously --- a network retry, a double-click,
or a misconfigured workflow where two users believe they are the active
approver.

**Strategy: Optimistic locking on `workflowInstance.version`**

Every workflow action handler: 1. Reads the expense document and checks
`workflowInstance.version` (call it `V`). 2. Validates the action is
legal (correct actor, correct step status). 3. Writes the update with a
filter: `{ _id: expenseId, "workflowInstance.version": V }`. 4. If the
write matches zero documents (version was incremented by a concurrent
writer), returns 409 Conflict. 5. The client is instructed to refresh
and retry.

This avoids database-level locking while preventing double-processing.
The window for a conflict is the round-trip time of two concurrent
requests --- in practice, very short. The first request commits and
advances the workflow; the retry from the second request will encounter
a different step or a terminal state and will either process correctly
or return a no-op response.

## Duplicate Submission (Idempotency)

Handled at the Redis layer, not the MongoDB layer. Before processing a
workflow action, the server checks a Redis idempotency key:

    idempotency:{tenantId}:{workflowInstanceId}:{action}:{stepIndex}

If the key exists, the cached result is returned immediately without
touching MongoDB. This prevents duplicate audit entries and
double-advances from network retries before the first request completes.
The key is written to Redis after the MongoDB transaction commits, with
a 24-hour TTL.

## Expense Submission Idempotency

For the submission flow:

    idempotency:{tenantId}:{expenseId}:submit

A duplicate submission request returns the already-committed IN_REVIEW
state.

## Write Concern

All writes use `majority` write concern (MongoDB default in replica set
mode). This ensures a committed write has been acknowledged by a
majority of replica set members before the response is returned,
protecting against data loss from a primary failover during the
transaction commit window.

------------------------------------------------------------------------

# 10. Data Lifecycle

## `expenses`

**Growth:** Continuous. One document per expense, growing with the
organization's expense volume. Document size is bounded --- the largest
component is `workflowHistory`, which grows by one small embedded object
per send-back cycle. A typical expense document with two send-back
cycles and three approval steps is under 5 KB.

**Retention:** Indefinite at MVP. Expenses are financial records and may
be subject to organizational or regulatory retention requirements. No
automated deletion.

**Archival strategy:** Not required at MVP. For future scale, older PAID
and REJECTED expenses (e.g., \> 2 years) can be moved to a cold
collection (`expenses_archive`) without changing the active collection's
structure. The `status` field makes the archival predicate trivial.

------------------------------------------------------------------------

## `auditLogs`

**Growth:** The fastest-growing collection. Each workflow action ---
submission, each approval step, rejection, send-back, payment ---
generates one document. A multi-step expense could generate five to ten
entries. Grows without bound.

**Retention:** Permanent. Audit logs are compliance records and must
never be deleted.

**Archival strategy:** After MVP, time-based partitioning should be
considered. Audit entries older than a configurable threshold (e.g., 1
year) can be moved to a cold collection (`auditLogs_archive`) with the
same schema. Current queries (by expenseId) would query both collections
if needed, or the application layer can route old lookups to the
archive. This does not require schema changes.

------------------------------------------------------------------------

## `expenseCategories`

**Growth:** Negligible. A small, slow-growing collection per tenant.

**Retention:** Categories are soft-deactivated via `isActive: false`.
Hard deletion is avoided because `expenses.workflowInstance.categoryId`
and `expenses.categoryId` reference category documents. Soft
deactivation preserves referential integrity and allows historical
queries ("which category and which chain resolved this expense's
workflow?").

------------------------------------------------------------------------

## `users`

**Growth:** Linear with organizational headcount. Slow for most tenants.

**Retention:** Users are soft-deleted via `isActive: false` (or deleted
per compliance/GDPR requirements). Inactive users remain in the
collection so that `approverId` and `actorId` references in expenses and
audit logs remain resolvable. Name fields may be anonymized for GDPR
compliance at a future date.

------------------------------------------------------------------------

## `organizations`

**Growth:** One document per tenant. Very slow growth.

**Retention:** Indefinite. Tenant offboarding is an operational process
outside MVP scope.

------------------------------------------------------------------------

## `notificationRecords`

**Growth:** Proportional to expense activity.

**Retention:** Short. For observability purposes, records older than 90
days provide diminishing value. A TTL index on `enqueuedAt` can
automatically expire old records after a configurable window. This is
safe because notification records are observability data, not compliance
records.

**TTL index:**

    { enqueuedAt: 1 }, { expireAfterSeconds: 7776000 }  // 90 days

------------------------------------------------------------------------

# 11. Performance Considerations

## Read-Heavy Operations

The manager approval queue is the most performance-sensitive read. It
uses a multikey index on embedded step fields and is queried on every
manager page load. The compound index
`{ tenantId, "workflowInstance.steps.approverId", "workflowInstance.steps.status" }`
is the critical path. Ensure this index is created before load testing.

The employee dashboard and Finance Admin dashboard are straightforward
range queries on well-indexed fields and are not expected to be a
bottleneck.

## Write-Heavy Operations

The `auditLogs` collection receives one insert per workflow action. It
has two indexes; each insert must update both. At MVP scale this is not
a concern. For high-throughput future scale, consider capped collections
or time-series collections for audit storage.

## Document Size

The `expenses` document is the largest in the system. Its size is
bounded and predictable: - Base fields: \~500 bytes - Per approval step:
\~200--400 bytes - Per workflow history entry: \~1--2 KB - Receipt
sub-object: \~200 bytes

An expense that is sent back and resubmitted three times with a
three-step approval chain is approximately 8--10 KB. This is well within
MongoDB's 16 MB document limit and does not pose a performance concern.

## Hot Documents

The `expenses` document for an expense in active review is written on
every approval action. In practice, individual expenses move through
approval quickly (minutes to hours), so no single document remains "hot"
for long. Concurrent writes to the same expense are handled by
optimistic locking rather than document-level locking.

## Pagination

All list endpoints that return multiple documents must be paginated. Two
strategies are available:

-   **Offset-based** (`skip` + `limit`): Simple to implement. Acceptable
    for MVP. Degrades with large offsets because MongoDB must scan
    skipped documents.
-   **Cursor-based** (range query on `_id` or `createdAt`): More
    efficient for large result sets. Preferred for the Finance Admin
    dashboard, which queries across all tenant expenses.

At MVP, offset-based pagination is acceptable. Cursor-based pagination
should be introduced before the Finance Admin view scales past a few
thousand expenses per tenant.

## Aggregation Usage

Aggregation pipelines are not required for any MVP query pattern. All
required queries are expressible as find operations with filters and
sorts on indexed fields. Avoid introducing aggregation pipelines for MVP
--- they are harder to index-optimize and add complexity to the query
layer.

------------------------------------------------------------------------

# 12. Tradeoffs

## Embedding Workflow Instance vs. Separate Collection

**Decision: Embed in `expenses`.**

**Tradeoff accepted:** The `expenses` document is larger and more
complex than a purely normalized design. The `workflowHistory` array
grows over time, though slowly. The document is the unit of lock
contention --- a very long approval chain means more data is loaded on
each read.

**Rationale:** Every approval action in the system reads and writes
expense state and workflow state together. Embedding eliminates a join
on the dominant read and write paths. The step data is small, bounded
per expense, and always consumed as a unit. The tradeoff of document
complexity for query simplicity is correct for this domain.

## Audit Log in a Separate Collection vs. Embedded in Expense

**Decision: Separate collection.**

**Tradeoff accepted:** Fetching the full expense detail view with audit
history requires two queries (one to `expenses`, one to `auditLogs`).

**Rationale:** The Audit Module must own its data exclusively for
compliance reasons. Embedding audit entries in the expense document
would give the Expense Module shared write access to audit data,
violating the module boundary. The audit log also grows without bound
--- embedding would cause unbounded document growth in `expenses`. Two
queries with indexed lookups is an acceptable cost.

## Denormalization: `workflowInstanceId` in AuditLogs

**Decision: Store `workflowInstanceId` in `auditLogs`.**

**Rationale:** This is a mild denormalization --- the workflow instance
ID is technically derivable by looking up the expense. Storing it
directly in the audit log document avoids a two-step lookup when
querying audit history for a specific workflow instance and is
consistent with the data that is already present at write time.

## No Category Snapshot in WorkflowInstance

**Decision: Store `categoryId` and `chainType`, not a full snapshot of
the category at resolution time.**

**Tradeoff accepted:** If a category's chains or threshold are modified
after an expense is submitted, there is no way to reconstruct the exact
chain configuration that was used — only which category was selected and
which chain type (STANDARD or ELEVATED) applied.

**Rationale:** Category modifications do not affect already-resolved
workflows (the approval chain is frozen at submission time). The
`categoryId` + `chainType` reference is sufficient for audit purposes at
MVP. A `categorySnapshot` field can be added to `workflowInstance` later
without breaking existing documents.

## MongoDB vs. Relational Database

**Decision: MongoDB.**

**Tradeoff accepted:** Referential integrity is not enforced by the
database. A missing `tenantId` filter or a dangling reference is not
caught by the store --- it must be caught by application code and
integration tests.

**Rationale:** The approval chain's variable-length, nested structure is
the core modeling challenge. MongoDB's document model handles this
naturally. The integrity tradeoff is mitigated by enforcing `tenantId`
as a mandatory parameter on all module interfaces and by integration
tests that assert cross-tenant isolation on every data path.

------------------------------------------------------------------------

# 13. Future Evolution

## Parallel Approvals

The current `steps` array is sequential --- one step is ACTIVE at a
time. Parallel approvals require multiple ACTIVE steps simultaneously
with a resolution policy (e.g., all must approve, or a majority).

**Evolution path:** Add a `parallelGroup` field to each step. Steps in
the same group are activated together. The Workflow Module's step
advancement logic checks whether all steps in the current group have
been resolved before activating the next group. The document structure
and indexes are unchanged. This is an internal change to the Workflow
Module.

------------------------------------------------------------------------

## Approval Delegation

A user delegates their approval authority to another user for a date
range.

**Evolution path:** Add a `delegations` collection or embed a
`delegations` array in the `users` document. During approver resolution
in `initializeWorkflow`, the Workflow Module checks for active
delegations and substitutes the delegate's `approverId` into the step.
No change to the expense document structure. The `approverId` in a
resolved step already holds a user ID --- whether that ID is the
original approver or a delegate is transparent to the step structure.

------------------------------------------------------------------------

## Receipt OCR

An OCR Module extracts fields from uploaded receipts and writes them
back to the expense draft.

**Evolution path:** Add an `ocrResult` field to the `receipt` sub-object
in `expenses`:

    receipt: {
      s3Key: ...,
      ocrResult: {
        extractedAmount: number | null,
        extractedDate: Date | null,
        confidence: number,
        processedAt: Date
      }
    }

No collection changes required. The OCR Module writes via the Expense
Module's public interface.

------------------------------------------------------------------------

## Multi-Currency

**Evolution path:** Add `originalAmount` and `originalCurrency` fields
alongside the existing `amount` field. `amount` becomes the normalized
base-currency value used for rule evaluation. Add a `Currency Module`
that owns exchange rate data. No structural change to the workflow
instance or approval steps --- they already operate on the normalized
amount. The expense document gains two additional top-level fields.

------------------------------------------------------------------------

## ERP Integrations

An Integration Module consumes `EXPENSE_PAID` events and pushes data to
external systems.

**Evolution path:** The Integration Module reads expense and audit data
through existing public interfaces. No persistence changes required in
the core collections. The Integration Module may maintain its own
`integrationRecords` collection to track sync state per expense per ERP
system.

------------------------------------------------------------------------

## Policy Engine

Richer approval logic (beyond the two-tier threshold split) can be
layered onto the category model.

**Evolution path:** Each category could gain additional threshold tiers
or condition fields (e.g., a `policyOverrideChain` for specific merchant
types). Alternatively, a separate `workflowPolicies` collection can
augment the category with richer rules evaluated after the standard/
elevated selection. Because category lookup is already an isolated step
in the Workflow Module, introducing a policy overlay requires no changes
to the expense aggregate or the approval step structure.

------------------------------------------------------------------------

## Category Versioning

**Evolution path:** Add a `categoryVersion` field to
`expenseCategories` documents and a `categorySnapshot` object to
`workflowInstance`. On category update, increment the version. The
`workflowInstance.categoryId` reference combined with the snapshot
allows reconstruction of the exact chain that was applied. This is a
non-breaking addition to existing documents.

------------------------------------------------------------------------

*Document status: Draft --- Persistence & Data Model Design. Follows
Architecture V2. Ready for API Design phase.*
