# API Design Document

## Expense Management System — REST API Layer

*Status: Draft — Follows Architecture V2 (03-technical-design-final.md) and Persistence Design (04-persistence-data-model-design-final.md)*

---

# 1. API Design Philosophy

## REST Conventions

The API is **resource-oriented**. URIs identify nouns (resources); HTTP methods express the operation. Business actions that cannot map cleanly to CRUD (approve, reject, send back, submit, withdraw) are modeled as sub-resource mutations on the resource they act upon, using a short action segment on the tail of the URI. This keeps the API surface small and predictable without resorting to generic RPC paths.

## Resource Naming

- Resources are **plural nouns**: `/expenses`, `/users`, `/workflow-rules`
- Nested resources express ownership or containment: `/expenses/:expenseId/workflow/approve`
- Kebab-case for multi-word segments: `/workflow-rules`, `/audit-log`
- No verbs in resource paths except for the named action sub-resources listed above

## Versioning Strategy

All routes are prefixed with `/api/v1`. The version lives in the path, not a header, so it is visible in logs, curl commands, and browser address bars without extra tooling. When a breaking change is required, `/api/v2` routes are introduced in parallel; `/api/v1` remains operational until clients are migrated. Non-breaking additions (new optional fields, new endpoints) are made to the existing version without incrementing.

## URI Conventions

```
/api/v1/{resource}
/api/v1/{resource}/{id}
/api/v1/{resource}/{id}/{sub-resource}
/api/v1/{resource}/{id}/{sub-resource}/{action}
```

Examples:
```
GET     /api/v1/expenses
GET     /api/v1/expenses/:expenseId
POST    /api/v1/expenses/:expenseId/submit
POST    /api/v1/expenses/:expenseId/workflow/approve
GET     /api/v1/expenses/:expenseId/audit-log
```

## HTTP Method Usage

| Method | Usage |
|--------|-------|
| `GET` | Retrieve a resource or collection. Never mutates state. |
| `POST` | Create a new resource, or trigger a named action on an existing one. |
| `PATCH` | Partial update of a resource. Only the supplied fields are changed. |
| `PUT` | Full replacement of a sub-resource. Used only where the entire sub-resource is written at once (e.g., organization settings). |
| `DELETE` | Not used in this API. Deactivation is preferred over deletion to preserve referential integrity. |

---

# 2. Authentication

## Endpoints

### Login

```
POST /api/v1/auth/login
```

**Purpose:** Authenticate a user and issue a JWT access token.

**Request Body:**
```json
{
  "email": "string",
  "password": "string"
}
```

**Response `200`:**
```json
{
  "data": {
    "accessToken": "string",
    "expiresIn": 3600,
    "user": {
      "id": "string",
      "email": "string",
      "firstName": "string",
      "lastName": "string",
      "roles": ["employee", "manager"],
      "tenantId": "string"
    }
  }
}
```

**Error Cases:**
- `401` — Invalid credentials
- `403` — Account deactivated
- `422` — Validation failure (missing email or password)

---

### Logout

```
POST /api/v1/auth/logout
```

**Purpose:** Revoke the caller's current access token by adding its `jti` to the Redis blocklist.

**Authorization:** Requires valid JWT.

**Request Body:** None. The token is read from the `Authorization` header.

**Response `204`:** No content.

**Notes:** The token TTL in Redis is set to the token's remaining lifetime so the blocklist self-cleans. Clients must discard the token locally on receipt of this response.

---

### Change Password

```
POST /api/v1/auth/change-password
```

**Purpose:** Change the authenticated user's password.

**Authorization:** Requires valid JWT.

**Request Body:**
```json
{
  "currentPassword": "string",
  "newPassword": "string"
}
```

**Response `204`:** No content.

**Error Cases:**
- `401` — Current password incorrect
- `422` — New password fails validation (see Section 11)

**Notes:** On success, the current token is immediately revoked (same as logout). The client must re-authenticate with the new password.

---

## JWT Lifecycle

**Token format:** Signed JWT (HS256 or RS256).

**Claims:**
```json
{
  "sub": "userId",
  "tenantId": "string",
  "roles": ["string"],
  "jti": "uuid",
  "iat": 1700000000,
  "exp": 1700003600
}
```

**Expiry:** 60 minutes at MVP. Configurable via environment variable.

**Refresh tokens:** Out of scope for MVP. Users re-authenticate after expiry.

**Revocation:** The `jti` claim is written to the Redis blocklist on logout and password change. Auth middleware checks the blocklist on every request. If Redis is unavailable, the middleware fails open (the revoked token remains valid until natural expiry) and logs a warning — an acceptable MVP tradeoff given short TTLs.

**Authorization flow:**
1. Client sends `Authorization: Bearer <token>` on every request.
2. Auth middleware validates signature, expiry, and blocklist.
3. Middleware resolves `{ userId, tenantId, roles, traceId }` and attaches it to the request context.
4. Domain handlers receive the context object; they never read from the raw request header.

---

# 3. User Management APIs

All user endpoints are scoped to the caller's tenant. `tenantId` is resolved from the JWT — it is never accepted as a query parameter or path segment.

---

### Create User

```
POST /api/v1/users
```

**Purpose:** Create a new user account within the caller's tenant.

**Authorization:** Org Admin only.

**Request Body:**
```json
{
  "email": "string",
  "firstName": "string",
  "lastName": "string",
  "department": "string",
  "managerId": "string | null",
  "roles": ["string"],
  "password": "string"
}
```

**Response `201`:**
```json
{
  "data": {
    "id": "string",
    "email": "string",
    "firstName": "string",
    "lastName": "string",
    "department": "string",
    "managerId": "string | null",
    "roles": ["string"],
    "isActive": true,
    "createdAt": "ISO8601"
  }
}
```

**Error Cases:**
- `409` — Email already exists within the tenant
- `422` — Validation failure
- `404` — `managerId` does not exist within the tenant

---

### Get User

```
GET /api/v1/users/:userId
```

**Purpose:** Retrieve a single user's profile.

**Authorization:** Org Admin (any user); all other roles (self only).

**Response `200`:**
```json
{
  "data": {
    "id": "string",
    "email": "string",
    "firstName": "string",
    "lastName": "string",
    "department": "string",
    "managerId": "string | null",
    "roles": ["string"],
    "isActive": true,
    "createdAt": "ISO8601",
    "updatedAt": "ISO8601"
  }
}
```

**Error Cases:**
- `403` — Caller does not have access to this user
- `404` — User not found in tenant

---

### List Users

```
GET /api/v1/users
```

**Purpose:** List users within the caller's tenant.

**Authorization:** Org Admin only.

**Query Parameters:**

| Parameter | Type | Description |
|-----------|------|-------------|
| `role` | string | Filter by role name |
| `department` | string | Filter by department |
| `isActive` | boolean | Filter by active status. Default: `true` |
| `page` | integer | Page number. Default: `1` |
| `limit` | integer | Items per page. Default: `20`, max: `100` |
| `sort` | string | `createdAt:asc`, `createdAt:desc`, `lastName:asc`. Default: `lastName:asc` |

**Response `200`:**
```json
{
  "data": [...],
  "pagination": {
    "page": 1,
    "limit": 20,
    "total": 143,
    "totalPages": 8
  }
}
```

---

### Update User

```
PATCH /api/v1/users/:userId
```

**Purpose:** Update a user's profile fields.

**Authorization:** Org Admin (any user); all other roles (self only, restricted fields).

**Request Body (Org Admin — all fields writable):**
```json
{
  "firstName": "string",
  "lastName": "string",
  "department": "string",
  "managerId": "string | null"
}
```

**Request Body (self — restricted fields):**
```json
{
  "firstName": "string",
  "lastName": "string"
}
```

**Notes:** Email is not updatable after account creation. Role and department changes are Org Admin only. Password changes go through `POST /api/v1/auth/change-password`.

**Response `200`:** Updated user object (same shape as Get User).

---

### Assign Roles

```
PUT /api/v1/users/:userId/roles
```

**Purpose:** Replace the user's role list entirely.

**Authorization:** Org Admin only.

**Request Body:**
```json
{
  "roles": ["employee", "manager"]
}
```

**Response `200`:** Updated user object.

**Notes:** This is a full replacement of the roles array, not an additive operation. Sending `{ "roles": ["employee"] }` removes `manager` if it was previously assigned. The caller must supply all roles that should remain.

---

### Activate / Deactivate User

```
POST /api/v1/users/:userId/activate
POST /api/v1/users/:userId/deactivate
```

**Purpose:** Set `isActive` to `true` or `false`. Deactivated users cannot log in but their records and references are preserved.

**Authorization:** Org Admin only.

**Request Body:** None.

**Response `200`:** Updated user object.

**Error Cases:**
- `409` — Attempting to deactivate the last active Org Admin in the tenant

---

# 4. Expense APIs

---

### Create Draft

```
POST /api/v1/expenses
```

**Purpose:** Create a new expense in `DRAFT` status.

**Authorization:** Employee, Manager, Finance Admin, Org Admin (any authenticated user may create an expense for themselves).

**Request Body:**
```json
{
  "title": "string",
  "amount": "number",
  "currency": "string",
  "date": "ISO8601 date",
  "categoryId": "string",
  "description": "string",
  "receiptKey": "string | null"
}
```

**Response `201`:**
```json
{
  "data": {
    "id": "string",
    "title": "string",
    "amount": 12500,
    "currency": "USD",
    "date": "2024-11-01",
    "categoryId": "string",
    "categoryName": "Travel",
    "description": "string",
    "status": "DRAFT",
    "receipt": null,
    "submittedBy": {
      "id": "string",
      "firstName": "string",
      "lastName": "string"
    },
    "workflowInstance": null,
    "createdAt": "ISO8601",
    "updatedAt": "ISO8601"
  }
}
```

**Notes:** `receiptKey` is optional. If provided, it must be an S3 key previously issued by `POST /api/v1/receipts/upload-url` for this tenant (validated by the Receipt Module before persistence). `amount` is stored as an integer representing cents (e.g., `12500` = $125.00) to avoid floating-point issues.

---

### Update Draft

```
PATCH /api/v1/expenses/:expenseId
```

**Purpose:** Update fields on a `DRAFT` expense.

**Authorization:** The submitter only (the user who created the expense).

**Request Body (all fields optional):**
```json
{
  "title": "string",
  "amount": "number",
  "currency": "string",
  "date": "ISO8601 date",
  "categoryId": "string",
  "description": "string",
  "receiptKey": "string | null"
}
```

**Response `200`:** Updated expense object (same shape as Create Draft response).

**Error Cases:**
- `403` — Caller is not the submitter
- `409` — Expense is not in `DRAFT` status; use Withdraw or wait for Send Back to return it to DRAFT first
- `404` — Expense not found in tenant

---

### Submit Expense

```
POST /api/v1/expenses/:expenseId/submit
```

**Purpose:** Transition the expense from `DRAFT` to `IN_REVIEW`. Triggers workflow initialization inside a MongoDB transaction.

**Authorization:** The submitter only.

**Request Body:** None.

**Response `200`:**
```json
{
  "data": {
    "id": "string",
    "status": "IN_REVIEW",
    "workflowInstance": {
      "id": "string",
      "status": "ACTIVE",
      "steps": [
        {
          "stepIndex": 0,
          "approverId": "string",
          "approverName": "string",
          "status": "ACTIVE",
          "decidedAt": null,
          "comment": null
        }
      ]
    },
    "updatedAt": "ISO8601"
  }
}
```

**Error Cases:**
- `409` — Expense is not in `DRAFT` status
- `422` — Selected category is deactivated (`CATEGORY_DEACTIVATED`); employee must switch to an active category
- `422` — Approver resolution failed (e.g., no user with required role found in tenant)
- `409` — Duplicate submission detected (idempotency key exists in Redis; cached result returned)

**Idempotency:** Server-side key `idempotency:{tenantId}:{expenseId}:submit` (24-hour TTL). A duplicate call within the TTL window returns the committed state without reprocessing.

---

### Withdraw Expense

```
POST /api/v1/expenses/:expenseId/withdraw
```

**Purpose:** Return a `SUBMITTED` expense to `DRAFT` before workflow initialization completes. Not permitted on `IN_REVIEW` expenses — the submitter must wait for a Send Back.

**Authorization:** The submitter only.

**Request Body:** None.

**Response `200`:** Updated expense object with `status: "DRAFT"` and `workflowInstance: null`.

**Error Cases:**
- `409` — Expense is not in `SUBMITTED` status (already `IN_REVIEW`, `APPROVED`, etc.)

**Notes:** Per the technical design, `SUBMITTED → DRAFT` withdrawal requires a MongoDB transaction (expense + audit log).

---

### Get Expense

```
GET /api/v1/expenses/:expenseId
```

**Purpose:** Retrieve the full expense record including embedded workflow state and step details.

**Authorization:** Submitter (own expense); Manager (expenses where they are an active or past approver); Finance Admin (all expenses in tenant); Org Admin (all expenses in tenant).

**Response `200`:** Full expense object including:
- All expense fields
- `workflowInstance` with steps (approver names resolved inline)
- `workflowHistory` array (prior send-back cycles)
- `receipt` metadata (if attached)

**Notes:** `tenantId` is always applied as a mandatory query filter server-side. The response never includes `passwordHash` or any internal database fields. Approver names are resolved from `approverId` references before the response is assembled.

---

### List Expenses

```
GET /api/v1/expenses
```

**Purpose:** List expenses. The result set and default filters depend on the caller's role.

**Authorization:** All authenticated users. Role determines which expenses are visible:

| Role | Visible Expenses |
|------|-----------------|
| Employee | Own expenses only |
| Manager | Own expenses + expenses where they are an assigned approver |
| Finance Admin | All expenses in tenant |
| Org Admin | All expenses in tenant |

**Query Parameters:**

| Parameter | Type | Description |
|-----------|------|-------------|
| `status` | string | Filter by expense status |
| `submittedBy` | string (userId) | Finance Admin / Org Admin only |
| `categoryId` | string (ObjectId) | Filter by expense category |
| `dateFrom` | ISO8601 date | Expense date lower bound (inclusive) |
| `dateTo` | ISO8601 date | Expense date upper bound (inclusive) |
| `amountMin` | integer (cents) | Amount lower bound (inclusive) |
| `amountMax` | integer (cents) | Amount upper bound (inclusive) |
| `page` | integer | Default: `1` |
| `limit` | integer | Default: `20`, max: `100` |
| `sort` | string | `createdAt:asc`, `createdAt:desc`, `amount:asc`, `amount:desc`. Default: `createdAt:desc` |

**Response `200`:**
```json
{
  "data": [
    {
      "id": "string",
      "title": "string",
      "amount": 12500,
      "currency": "USD",
      "date": "2024-11-01",
      "categoryId": "string",
      "categoryName": "Travel",
      "status": "IN_REVIEW",
      "submittedBy": {
        "id": "string",
        "firstName": "string",
        "lastName": "string"
      },
      "workflowInstance": {
        "id": "string",
        "status": "ACTIVE",
        "currentStepIndex": 0
      },
      "createdAt": "ISO8601",
      "updatedAt": "ISO8601"
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 20,
    "total": 84,
    "totalPages": 5
  }
}
```

**Notes:** The list response returns a summary projection. The full `steps` array and `workflowHistory` are omitted from list responses to keep payloads small; use `GET /api/v1/expenses/:expenseId` for the full record.

---

# 5. Workflow Action APIs

Workflow actions operate on the active workflow instance embedded in the expense. All three actions (Approve, Reject, Send Back) share the same structure: they are `POST` requests to sub-resources under the expense's `/workflow` path.

**Common Pre-conditions for all workflow actions:**
- The expense must be in `IN_REVIEW` status.
- The caller must be the assigned approver for the currently `ACTIVE` step.
- The caller must not be the expense submitter (self-approval constraint enforced server-side).
- Optimistic lock: the current `workflowInstance.version` must match the version read at handler entry. A mismatch returns `409`.

---

### Approve

```
POST /api/v1/expenses/:expenseId/workflow/approve
```

**Purpose:** Approve the currently active workflow step. If this is the final step, the expense transitions to `APPROVED`. Otherwise the next step is activated.

**Authorization:** The user assigned as `approverId` for the currently `ACTIVE` step.

**Request Body:**
```json
{
  "comment": "string | null",
  "idempotencyKey": "string"
}
```

**Response `200`:**
```json
{
  "data": {
    "expenseId": "string",
    "expenseStatus": "IN_REVIEW | APPROVED",
    "workflowInstance": {
      "id": "string",
      "status": "ACTIVE | COMPLETED",
      "version": 2,
      "steps": [...]
    }
  }
}
```

**Error Cases:**
- `403` — Caller is not the active step's approver, or is the submitter
- `409` — Expense not in `IN_REVIEW`, or optimistic lock version conflict
- `409` — Duplicate action (idempotency key already processed; cached result returned)

---

### Reject

```
POST /api/v1/expenses/:expenseId/workflow/reject
```

**Purpose:** Reject the expense. Terminates the workflow. The expense transitions to `REJECTED` and no further actions are possible on this workflow instance.

**Authorization:** The user assigned as `approverId` for the currently `ACTIVE` step.

**Request Body:**
```json
{
  "comment": "string",
  "idempotencyKey": "string"
}
```

**Notes:** `comment` is required for rejection. Rejecting without an explanation is not permitted — this is an API-level validation rule.

**Response `200`:**
```json
{
  "data": {
    "expenseId": "string",
    "expenseStatus": "REJECTED",
    "workflowInstance": {
      "id": "string",
      "status": "REJECTED",
      "version": 3,
      "steps": [...]
    }
  }
}
```

**Error Cases:**
- `422` — Comment is required and was not provided
- `403` — Caller is not the active step's approver, or is the submitter
- `409` — Expense not in `IN_REVIEW`, or optimistic lock version conflict

---

### Send Back

```
POST /api/v1/expenses/:expenseId/workflow/send-back
```

**Purpose:** Return the expense to `DRAFT` for revision. The current workflow instance is archived to `workflowHistory`. On resubmission, a new workflow instance is created from scratch.

**Authorization:** The user assigned as `approverId` for the currently `ACTIVE` step.

**Request Body:**
```json
{
  "comment": "string",
  "idempotencyKey": "string"
}
```

**Notes:** `comment` is required for Send Back.

**Response `200`:**
```json
{
  "data": {
    "expenseId": "string",
    "expenseStatus": "DRAFT",
    "workflowInstance": null
  }
}
```

**Error Cases:**
- `422` — Comment is required and was not provided
- `403` — Caller is not the active step's approver, or is the submitter
- `409` — Expense not in `IN_REVIEW`, or optimistic lock version conflict

---

### Mark as Paid

```
POST /api/v1/expenses/:expenseId/mark-paid
```

**Purpose:** Transition an `APPROVED` expense to `PAID` after reimbursement is complete.

**Authorization:** Finance Admin only.

**Request Body:** None.

**Response `200`:**
```json
{
  "data": {
    "expenseId": "string",
    "expenseStatus": "PAID",
    "updatedAt": "ISO8601"
  }
}
```

**Error Cases:**
- `409` — Expense is not in `APPROVED` status

---

# 6. Expense Category APIs

These APIs manage expense categories. Each category defines a standard approval chain, an elevated approval chain, and an amount threshold. The category selected by the employee when creating an expense determines the approval chain at submission. Only active categories are available for selection.

---

### Create Expense Category

```
POST /api/v1/expense-categories
```

**Purpose:** Create a new expense category for the caller's tenant.

**Authorization:** Org Admin, Finance Admin.

**Request Body:**
```json
{
  "name": "string",
  "amountThreshold": "integer",
  "standardChain": [
    {
      "stepIndex": 0,
      "resolverType": "ROLE | USER | MANAGER",
      "resolverValue": "string"
    }
  ],
  "elevatedChain": [
    {
      "stepIndex": 0,
      "resolverType": "ROLE | USER | MANAGER",
      "resolverValue": "string"
    }
  ]
}
```

**Notes:**
- `amountThreshold` is in cents. Expenses with `amount <= amountThreshold` use `standardChain`; expenses with `amount > amountThreshold` use `elevatedChain`.
- Both `standardChain` and `elevatedChain` must contain at least one step.
- `resolverType: "MANAGER"` uses the submitter's `users.managerId`. `resolverValue` is ignored for this type.
- `resolverType: "ROLE"` resolves to any active user with that role. `resolverValue` is the role name string.
- `resolverType: "USER"` pins the step to a specific user. `resolverValue` is the userId.
- `stepIndex` values must be unique and sequential starting from 0 within each chain.

**Response `201`:**
```json
{
  "data": {
    "id": "string",
    "name": "string",
    "isActive": false,
    "amountThreshold": 50000,
    "standardChain": [...],
    "elevatedChain": [...],
    "createdAt": "ISO8601"
  }
}
```

**Notes:** Categories are created as **inactive** by default. Activate explicitly with `POST /api/v1/expense-categories/:categoryId/activate`. This prevents a partially configured category from appearing in the employee expense form.

---

### Get Expense Category

```
GET /api/v1/expense-categories/:categoryId
```

**Purpose:** Retrieve a single category's full configuration.

**Authorization:** Org Admin, Finance Admin.

**Response `200`:** Full category object.

---

### List Expense Categories

```
GET /api/v1/expense-categories
```

**Purpose:** List all expense categories for the tenant.

**Authorization:** All authenticated users. Employees see this list when creating an expense (only active categories shown). Admins see all.

**Query Parameters:**

| Parameter | Type | Description |
|-----------|------|-------------|
| `isActive` | boolean | Filter by active status. Default: `true` for non-admins, all for admins |
| `page` | integer | Default: `1` |
| `limit` | integer | Default: `50`, max: `100` |

**Response `200`:**
```json
{
  "data": [...],
  "pagination": {...}
}
```

---

### Update Expense Category

```
PATCH /api/v1/expense-categories/:categoryId
```

**Purpose:** Update a category's configuration.

**Authorization:** Org Admin, Finance Admin.

**Request Body (all fields optional):**
```json
{
  "name": "string",
  "amountThreshold": "integer",
  "standardChain": [...],
  "elevatedChain": [...]
}
```

**Notes:** Updating an **active** category is permitted. In-flight expenses are unaffected — their approval chain was frozen at submission time. The update applies only to expenses submitted after the change. If `standardChain` or `elevatedChain` is supplied, the full array replaces the existing chain.

**Response `200`:** Updated category object.

---

### Activate Category

```
POST /api/v1/expense-categories/:categoryId/activate
```

**Purpose:** Set `isActive: true` so the category appears in the expense creation form and can be selected by employees.

**Authorization:** Org Admin, Finance Admin.

**Request Body:** None.

**Response `200`:** Updated category object.

---

### Deactivate Category

```
POST /api/v1/expense-categories/:categoryId/deactivate
```

**Purpose:** Set `isActive: false`. The category no longer appears for new expenses. Employees with existing drafts under this category will be blocked from submitting until they switch to an active category or the admin reactivates it. In-flight expenses already in review are unaffected.

**Authorization:** Org Admin, Finance Admin.

**Request Body:** None.

**Response `200`:** Updated category object.

**Notes:** Hard deletion is not supported. The `categoryId` is referenced in submitted expense records; soft-deactivation preserves referential integrity.

---

# 7. Organization APIs

These endpoints cover MVP-required organization identity and settings. Tenant onboarding and provisioning are out of scope for MVP.

---

### Get Organization

```
GET /api/v1/organization
```

**Purpose:** Retrieve the organization profile for the caller's tenant.

**Authorization:** All authenticated users (read-only for non-admins).

**Response `200`:**
```json
{
  "data": {
    "id": "string",
    "name": "string",
    "slug": "string",
    "settings": {
      "defaultCurrency": "USD"
    },
    "createdAt": "ISO8601"
  }
}
```

---

### Update Organization Settings

```
PUT /api/v1/organization/settings
```

**Purpose:** Replace the organization's settings object.

**Authorization:** Org Admin only.

**Request Body:**
```json
{
  "defaultCurrency": "string"
}
```

**Response `200`:**
```json
{
  "data": {
    "settings": {
      "defaultCurrency": "USD"
    },
    "updatedAt": "ISO8601"
  }
}
```

**Notes:** `PUT` is used here because the settings object is small, stable, and always written as a complete unit. Partial updates via `PATCH` are not needed.

---

# 8. Receipt APIs

Receipts are stored in Amazon S3. The API server never handles the file bytes — it acts as a security-enforcing gateway that issues scoped upload URLs and validates ownership before attachments are persisted.

## Upload Flow

```
1. Client requests a pre-signed upload URL from the API server.
2. API server validates content type and returns a time-limited signed URL
   plus the S3 key that will identify this file.
3. Client uploads the file bytes directly to S3 using the signed URL.
4. Client includes the returned S3 key in the expense Create or Update
   request body as `receiptKey`.
5. API server calls Receipt Module: validateFileOwnership(s3Key, tenantId)
   before persisting the key on the expense record.
```

---

### Request Pre-Signed Upload URL

```
POST /api/v1/receipts/upload-url
```

**Purpose:** Generate a time-limited pre-signed S3 URL for direct client-to-S3 upload.

**Authorization:** Any authenticated user.

**Request Body:**
```json
{
  "filename": "string",
  "contentType": "string"
}
```

**Response `200`:**
```json
{
  "data": {
    "uploadUrl": "https://s3.amazonaws.com/...",
    "s3Key": "string",
    "expiresIn": 300
  }
}
```

**Notes:**
- `contentType` must be one of: `application/pdf`, `image/jpeg`, `image/png`. Any other value returns `422`.
- The signed URL includes S3 upload conditions enforcing the allowed content type and a maximum file size (default 10 MB, configurable). S3 enforces these at upload time — the API server does not need to proxy the bytes.
- `s3Key` is prefixed with `{tenantId}/` to enforce tenant isolation. The client cannot construct or guess a valid key for another tenant.
- `uploadUrl` expires in 5 minutes (300 seconds). If the client does not complete the upload within this window, they must request a new URL.

---

### Get Receipt Metadata

```
GET /api/v1/expenses/:expenseId/receipt
```

**Purpose:** Retrieve receipt metadata and a time-limited pre-signed download URL for the attached receipt.

**Authorization:** Submitter (own expense); Manager (expenses where they are an approver); Finance Admin; Org Admin.

**Response `200`:**
```json
{
  "data": {
    "filename": "string",
    "contentType": "string",
    "uploadedAt": "ISO8601",
    "downloadUrl": "string",
    "expiresIn": 300
  }
}
```

**Response `404`:** Expense has no attached receipt.

**Notes:** The download URL is a pre-signed GET URL valid for 5 minutes. The client should not cache or share this URL. Every call to this endpoint generates a fresh URL.

---

# 9. Audit APIs

---

### Get Audit Log for Expense

```
GET /api/v1/expenses/:expenseId/audit-log
```

**Purpose:** Retrieve the chronological audit history for a specific expense.

**Authorization:** Finance Admin, Org Admin only. Submitters and Managers do not have access to the audit log.

**Response `200`:**
```json
{
  "data": [
    {
      "id": "string",
      "action": "SUBMITTED | STEP_APPROVED | FULLY_APPROVED | REJECTED | SENT_BACK | MARKED_PAID | WITHDRAWN",
      "actor": {
        "id": "string",
        "firstName": "string",
        "lastName": "string"
      },
      "stepIndex": "integer | null",
      "comment": "string | null",
      "traceId": "string",
      "timestamp": "ISO8601"
    }
  ]
}
```

**Notes:**
- Results are sorted by `timestamp ASC` (chronological order) always. Pagination is not required here — the number of audit entries per expense is bounded by the number of workflow actions (typically 3–10 entries).
- `traceId` is included to support correlation with server logs. Frontend clients may display it in a debug or admin view.
- Actor names are resolved from `actorId` references at query time.

---

# 10. Request & Response Standards

## Request Headers

All requests must include:
```
Authorization: Bearer <token>
Content-Type: application/json   (for requests with a body)
```

Workflow action requests should include:
```
X-Idempotency-Key: <client-generated UUID>
```
See Section 13 for idempotency details.

## Success Response Envelope

All successful responses use a consistent envelope:

```json
{
  "data": { ... } | [ ... ]
}
```

Collection responses include a `pagination` field alongside `data`:

```json
{
  "data": [...],
  "pagination": {
    "page": 1,
    "limit": 20,
    "total": 143,
    "totalPages": 8
  }
}
```

`204 No Content` responses have no body.

## Error Response Envelope

All error responses use this shape:

```json
{
  "error": {
    "code": "EXPENSE_NOT_IN_DRAFT",
    "message": "The expense cannot be updated because it is not in DRAFT status.",
    "traceId": "uuid",
    "details": [
      {
        "field": "amount",
        "message": "Amount must be a positive integer (cents)"
      }
    ]
  }
}
```

| Field | Description |
|-------|-------------|
| `code` | Machine-readable uppercase snake_case error code. Stable across releases — clients may branch on this value. |
| `message` | Human-readable description. May change between releases — not for programmatic use. |
| `traceId` | UUID identifying the originating request. Include in support tickets and log searches. |
| `details` | Optional. Present on `422` validation errors. Array of `{ field, message }` pairs. |

## Error Codes (Selection)

| Code | HTTP | Meaning |
|------|------|---------|
| `UNAUTHORIZED` | 401 | No token or invalid token |
| `FORBIDDEN` | 403 | Valid token but insufficient permission |
| `NOT_FOUND` | 404 | Resource not found in tenant |
| `CONFLICT` | 409 | State conflict (wrong status, version mismatch) |
| `DUPLICATE_ACTION` | 409 | Idempotency key already processed |
| `VALIDATION_ERROR` | 422 | Request body failed validation |
| `CATEGORY_DEACTIVATED` | 422 | The selected expense category is inactive; employee must select an active category |
| `APPROVER_RESOLUTION_FAILED` | 422 | Could not resolve an approver for a step |
| `RATE_LIMITED` | 429 | Per-tenant rate limit exceeded |
| `INTERNAL_ERROR` | 500 | Unhandled server error |

---

# 11. Validation Rules

Validation is applied at the API layer before reaching domain modules. Domain modules receive validated input and do not repeat these checks.

## Auth

| Field | Rules |
|-------|-------|
| `email` | Required. Valid email format. Max 254 characters. Lowercased before lookup. |
| `password` (login) | Required. Non-empty string. |
| `newPassword` | Required. Min 8 characters. Must contain at least one uppercase letter, one digit. Max 72 characters (bcrypt limit). |

## User

| Field | Rules |
|-------|-------|
| `email` | Required. Valid email format. Max 254 characters. |
| `firstName` / `lastName` | Required. 1–100 characters. Trimmed. |
| `department` | Required on create. 1–100 characters. |
| `managerId` | Optional. Must be a valid ObjectId string. Must reference an active user within the same tenant if provided. |
| `roles` | Required on create. Array of 1–4 strings. Each must be one of: `employee`, `manager`, `financeAdmin`, `orgAdmin`. |
| `password` (create) | Required. Same rules as `newPassword` above. |

## Expense

| Field | Rules |
|-------|-------|
| `title` | Required. 1–200 characters. |
| `amount` | Required. Positive integer (cents). Min: `1`. Max: `999999999` (≈$10M). |
| `currency` | Required. ISO 4217 3-letter code (e.g., `"USD"`). Validated against a static allowlist. |
| `date` | Required. ISO 8601 date string (`YYYY-MM-DD`). Must not be in the future. Must not be more than 365 days in the past. |
| `categoryId` | Required. Must be a valid ObjectId string referencing an active `expenseCategories` document within the tenant. |
| `description` | Optional. Max 1000 characters. |
| `receiptKey` | Optional. Must be a non-empty string if provided. Validated for tenant ownership by Receipt Module before persistence. |

## Workflow Actions

| Field | Rules |
|-------|-------|
| `comment` (Approve) | Optional. Max 1000 characters. |
| `comment` (Reject) | **Required.** 1–1000 characters. |
| `comment` (Send Back) | **Required.** 1–1000 characters. |
| `idempotencyKey` | Required in request body. UUID v4 format. |

## Expense Category

| Field | Rules |
|-------|-------|
| `name` | Required. 1–200 characters. Must be unique within the tenant. |
| `amountThreshold` | Required. Non-negative integer (cents). Amounts at or below use `standardChain`; above use `elevatedChain`. |
| `standardChain` | Required. Array with at least 1 entry. Max 10 steps. |
| `elevatedChain` | Required. Array with at least 1 entry. Max 10 steps. |
| `standardChain[].stepIndex` | Must be 0-based, sequential, unique within the chain. |
| `standardChain[].resolverType` | Must be one of: `ROLE`, `USER`, `MANAGER`. |
| `standardChain[].resolverValue` | Required for `ROLE` and `USER` types. Must be a non-empty string. Ignored for `MANAGER` type. |
| `elevatedChain[].stepIndex` | Same rules as `standardChain[].stepIndex`. |
| `elevatedChain[].resolverType` | Same rules as `standardChain[].resolverType`. |
| `elevatedChain[].resolverValue` | Same rules as `standardChain[].resolverValue`. |

---

# 12. Authorization Matrix

`tenantId` is enforced on every endpoint as a mandatory implicit filter. A user cannot access or modify any resource outside their tenant regardless of role.

| Endpoint | Employee | Manager | Finance Admin | Org Admin | Notes |
|----------|----------|---------|---------------|-----------|-------|
| `POST /auth/login` | ✓ | ✓ | ✓ | ✓ | Public |
| `POST /auth/logout` | ✓ | ✓ | ✓ | ✓ | Own token only |
| `POST /auth/change-password` | ✓ | ✓ | ✓ | ✓ | Own password only |
| `POST /users` | — | — | — | ✓ | |
| `GET /users` | — | — | — | ✓ | |
| `GET /users/:id` | Self | Self | Self | ✓ | Non-admins: self only |
| `PATCH /users/:id` | Self (limited fields) | Self (limited fields) | Self (limited fields) | ✓ | |
| `PUT /users/:id/roles` | — | — | — | ✓ | |
| `POST /users/:id/activate` | — | — | — | ✓ | |
| `POST /users/:id/deactivate` | — | — | — | ✓ | |
| `POST /expenses` | ✓ | ✓ | ✓ | ✓ | Creates for self |
| `PATCH /expenses/:id` | Own DRAFT | Own DRAFT | Own DRAFT | Own DRAFT | Submitter only |
| `POST /expenses/:id/submit` | Own DRAFT | Own DRAFT | Own DRAFT | Own DRAFT | Submitter only |
| `POST /expenses/:id/withdraw` | Own SUBMITTED | Own SUBMITTED | Own SUBMITTED | Own SUBMITTED | Submitter only |
| `GET /expenses/:id` | Own | Assigned approver | ✓ | ✓ | |
| `GET /expenses` | Own only | Own + assigned | ✓ | ✓ | See Section 4 |
| `POST /expenses/:id/workflow/approve` | — | Active step approver | — | — | Not if submitter |
| `POST /expenses/:id/workflow/reject` | — | Active step approver | — | — | Not if submitter |
| `POST /expenses/:id/workflow/send-back` | — | Active step approver | — | — | Not if submitter |
| `POST /expenses/:id/mark-paid` | — | — | ✓ | — | APPROVED status only |
| `GET /expenses/:id/receipt` | Own | Assigned approver | ✓ | ✓ | |
| `POST /receipts/upload-url` | ✓ | ✓ | ✓ | ✓ | |
| `GET /expenses/:id/audit-log` | — | — | ✓ | ✓ | |
| `POST /expense-categories` | — | — | ✓ | ✓ | |
| `GET /expense-categories` | ✓ (active only) | ✓ (active only) | ✓ | ✓ | Employees see active only |
| `GET /expense-categories/:id` | — | — | ✓ | ✓ | |
| `PATCH /expense-categories/:id` | — | — | ✓ | ✓ | |
| `POST /expense-categories/:id/activate` | — | — | ✓ | ✓ | |
| `POST /expense-categories/:id/deactivate` | — | — | ✓ | ✓ | |
| `GET /organization` | ✓ | ✓ | ✓ | ✓ | Read-only for non-admins |
| `PUT /organization/settings` | — | — | — | ✓ | |

**Resource-level authorization notes:**

- **Expense submitter check:** The submitter identity is derived from `expense.submittedBy`, compared against `req.context.userId`. This check is applied in the domain module, not in middleware.
- **Active step approver check:** For workflow actions, the server verifies that `req.context.userId === workflowInstance.steps[activeStepIndex].approverId` at handler entry.
- **Self-approval prevention:** If the resolved approver ID equals the submitter ID, the Workflow Module skips or escalates at initialization time. At action time, if somehow a caller attempts to approve their own expense, the server returns `403`.

---

# 13. Idempotency

## Which Endpoints Require Idempotency

| Endpoint | Idempotency Required | Reason |
|----------|---------------------|--------|
| `POST /expenses/:id/submit` | Yes | Workflow initialization must not run twice |
| `POST /expenses/:id/workflow/approve` | Yes | Step approval must not be recorded twice |
| `POST /expenses/:id/workflow/reject` | Yes | Rejection must not fire twice |
| `POST /expenses/:id/workflow/send-back` | Yes | Send back must not archive the workflow instance twice |
| `POST /expenses/:id/mark-paid` | Yes | Status must not change twice |
| `POST /expenses/:id/withdraw` | Yes | Withdrawal must not audit twice |

Create, Update, and read operations are naturally idempotent or non-destructive and do not require special handling.

## Idempotency Key

Workflow action idempotency keys are **client-supplied** in the request body as `idempotencyKey` (UUID v4). The server uses this value to construct the Redis key:

```
idempotency:{tenantId}:{workflowInstanceId}:{action}:{stepIndex}:{idempotencyKey}
```

**Rationale for client-supplied keys on workflow actions:** The client (browser or app) is in the best position to generate a unique key per user gesture. This allows the server to deduplicate network retries without the client needing to inspect intermediate state.

Expense submission uses a **server-side** key because the action is tied to a specific expense document and does not require client coordination:

```
idempotency:{tenantId}:{expenseId}:submit
```

## Duplicate Request Behavior

1. Client sends a workflow action request with `idempotencyKey`.
2. Server checks Redis: `GET idempotency:{tenantId}:{workflowInstanceId}:{action}:{stepIndex}:{idempotencyKey}`.
3. **Key found:** Return the cached HTTP response body with `200` and an `X-Idempotent-Replay: true` header. MongoDB is not touched.
4. **Key not found:** Process the action. On successful MongoDB transaction commit, write the serialized response to Redis with a 24-hour TTL.
5. If the original request is still in-flight when a duplicate arrives, the duplicate receives `409 CONFLICT` with code `PROCESSING_IN_FLIGHT`. The client should retry after a short delay.

The cached response is the full response body serialized to JSON. The key is tied to the specific action on the specific step — reusing the same key for a different action on a different step is safe (they produce different Redis keys).

---

# 14. Pagination, Filtering & Sorting

A single consistent approach is applied to all collection endpoints.

## Pagination

Offset-based pagination is used for MVP. All collection endpoints accept:

| Parameter | Type | Default | Maximum |
|-----------|------|---------|---------|
| `page` | positive integer | `1` | none |
| `limit` | positive integer | `20` | `100` |

All paginated responses include:

```json
{
  "pagination": {
    "page": 2,
    "limit": 20,
    "total": 143,
    "totalPages": 8
  }
}
```

Requesting a page beyond `totalPages` returns `data: []` with a `200` status (not `404`).

**Post-MVP note:** Cursor-based pagination (using `_id` or `createdAt` as the cursor) should be introduced for the Finance Admin expense list before the tenant expense count scales past a few thousand records. The response envelope can accommodate a `nextCursor` field alongside `pagination` without breaking clients that do not use it.

## Filtering

Filters are passed as query parameters. Unrecognized query parameters are silently ignored (no `422`). An empty filter set returns all resources visible to the caller.

Filter values are type-validated: a non-integer `amountMin` returns `422`. Enum-typed filters (e.g., `status`) are validated against their allowed values.

## Sorting

The `sort` parameter accepts a `field:direction` string. Direction is either `asc` or `desc`. Multiple sort fields are not supported at MVP.

Supported sort fields per collection:

| Collection | Supported Sort Fields |
|------------|----------------------|
| `expenses` | `createdAt`, `updatedAt`, `amount`, `date` |
| `users` | `createdAt`, `lastName` |
| `workflow-rules` | `createdAt`, `priority` |

Unsupported sort fields return `422` with a descriptive message listing valid options.

---

# 15. API Error Handling

## HTTP Status Code Reference

| Status | When to Use |
|--------|-------------|
| `200 OK` | Successful `GET`, `PATCH`, `PUT`, or action `POST` that returns a body |
| `201 Created` | Successful `POST` that creates a new resource |
| `204 No Content` | Successful `POST` with no return body (logout, change-password) |
| `400 Bad Request` | Malformed JSON or unparseable request body. Distinct from `422` (which is for semantically invalid but well-formed input) |
| `401 Unauthorized` | No `Authorization` header, expired token, invalid signature, or revoked token |
| `403 Forbidden` | Valid identity but insufficient permission for this resource or action |
| `404 Not Found` | Resource does not exist within the caller's tenant. Also returned when a resource exists but the caller does not have permission to know it exists — prevents tenant enumeration |
| `409 Conflict` | State conflict: wrong expense status, optimistic lock version mismatch, duplicate action (idempotency), or unique constraint violation (duplicate email) |
| `422 Unprocessable Entity` | Request body is well-formed JSON but fails validation rules (missing required fields, invalid enum values, business rule violations detectable before touching state) |
| `429 Too Many Requests` | Per-tenant rate limit exceeded. Response includes `Retry-After` header |
| `500 Internal Server Error` | Unhandled exception. Never includes stack traces or internal details in the response body. Full error is logged server-side with `traceId` |
| `503 Service Unavailable` | Downstream dependency (MongoDB, Redis) is unreachable. Readiness check fails and the load balancer stops routing traffic to this instance |

## `404` vs `403` for Hidden Resources

When a resource exists but the caller is forbidden from knowing it exists (e.g., an Employee requesting another user's expense), the server returns `404` rather than `403`. This prevents cross-tenant or cross-user resource enumeration. The `403` code is reserved for cases where the caller knows the resource exists but cannot act on it (e.g., attempting to approve a step they are not assigned to).

## Validation Errors (`422`)

Validation errors always include `details`:

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Request validation failed.",
    "traceId": "uuid",
    "details": [
      { "field": "amount", "message": "Amount must be a positive integer representing cents." },
      { "field": "currency", "message": "Currency must be a valid ISO 4217 code." }
    ]
  }
}
```

All validation errors for a request are collected and returned together — the client does not need to fix and resubmit one field at a time.

---

# 16. Future Evolution

The API is designed to accommodate the enhancements listed in the product roadmap without breaking existing clients.

## Receipt OCR

When an OCR Module is added, the receipt upload confirmation flow gains an additional async step. A new optional field `ocrStatus` appears on the expense's `receipt` object: `PENDING | COMPLETED | FAILED`. Clients that ignore unknown fields (as all well-written REST clients should) are unaffected. A new webhook or polling endpoint (`GET /api/v1/expenses/:expenseId/receipt/ocr-result`) surfaces extracted data. No existing endpoints change shape.

## Mobile Clients

The existing JSON REST API with JWT authentication is directly consumable by mobile clients without changes. Push notifications would be an addition to the Notification Module and would require a new registration endpoint (`POST /api/v1/devices`) to store push tokens — a purely additive change. File upload via pre-signed URL is already mobile-friendly (direct S3 PUT, no binary proxying through the API server).

## ERP Integrations

ERP integrations are event-driven on the server side — the Integration Module consumes `EXPENSE_PAID` events. For external partners consuming the API directly, a filtered expense list endpoint (`GET /api/v1/expenses?status=PAID&dateFrom=...`) already supports the required access pattern. An API key authentication path (alongside JWT) would need to be added for machine-to-machine integrations; this is an Auth Module concern and does not change the resource endpoints.

## Webhooks

A webhooks subscription system would introduce two new endpoints:
- `POST /api/v1/webhooks` — register a delivery URL and event set
- `DELETE /api/v1/webhooks/:webhookId` — deregister

Existing workflow action endpoints would trigger webhook delivery as a post-commit side effect (same pattern as the current SQS notification enqueue). No changes to existing resource endpoints.

## API Versioning

When a breaking change is unavoidable (e.g., a field renamed or removed, a response shape restructured), a new path version `/api/v2/...` is introduced. The changed endpoints are published at `v2`; all unchanged endpoints remain at `v1` only — there is no wholesale copy of the entire API. Both versions are operated in parallel during a migration window. Deprecation is signaled via a `Deprecation` response header on `v1` endpoints that have a `v2` replacement, giving clients advance notice before `v1` is retired.

Additive changes (new optional request fields, new optional response fields, new endpoints) are made to the existing version with no version increment. Clients must be built to tolerate unknown fields in responses.

---

*Document status: Draft — API Design. Follows Architecture V2 and Persistence Design. Ready for implementation.*
