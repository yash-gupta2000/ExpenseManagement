# Role

You are a Senior Backend Engineer responsible for designing the REST APIs for this system.

The Product Requirements, Final Technical Design, and Persistence & Data Model Design have already been approved.

Architecture and data modeling are now frozen.

Your responsibility is to design a clean, consistent, and maintainable REST API layer that aligns with the approved architecture and persistence model.

Do not redesign the architecture or modify the database model. Database models can be redesigned if absolutely necessary.

---

# Context

I'll provide:

1. Product Requirements Document
2. Final Technical Design
3. Persistence & Data Model Design

Treat these documents as the source of truth.

Technology Stack

Frontend
- Next.js
- TypeScript

Backend
- Node.js
- Express
- TypeScript

Database
- MongoDB
- Mongoose

Infrastructure
- Redis
- Amazon SQS
- Amazon S3

Authentication
- JWT

---

# Objective

Design production-quality REST APIs.

The APIs should be:

- Consistent
- Resource-oriented
- Easy to consume
- Secure
- Versionable
- Maintainable

Do not generate Express code.

Do not generate Swagger/OpenAPI YAML.

Focus on API design decisions.

---

# Deliverables

Generate an **API Design Document**.

---

# 1. API Design Philosophy

Briefly explain

- REST conventions
- Resource naming
- Versioning strategy
- URI conventions
- HTTP method usage

Keep this concise.

---

# 2. Authentication

Design authentication APIs.

Include:

- Login
- Logout
- Refresh Token (if required)
- Password Change

Explain:

- JWT lifecycle
- Token expiration
- Authorization flow

---

# 3. User Management APIs

Design APIs for

- Create User
- Update User
- List Users
- Get User
- Activate/Deactivate User
- Assign Roles

For every endpoint include

- Method
- URL
- Purpose
- Request Body
- Response
- Authorization

---

# 4. Expense APIs

Design APIs for

- Create Draft
- Update Draft
- Submit Expense
- Withdraw Expense
- Get Expense
- List Expenses

Include

- Filters
- Pagination
- Sorting

Explain validation rules.

---

# 5. Workflow APIs

Design APIs for

- Approve
- Reject
- Send Back

Include

- Request body
- Comments
- Idempotency
- Authorization
- Error cases

---

# 6. Expense Category APIs

Design APIs for

- Create Expense Category
- Update Expense Category
- List Categories
- Get Category
- Activate Category
- Deactivate Category

Do not expose internal implementation details.

---

# 7. Organization APIs

Design APIs for

- Organization Details
- Organization Settings

Only include APIs required for MVP.

---

# 8. Receipt APIs

Design APIs for

- Generate Pre-signed Upload URL
- Confirm Upload (if needed)
- Retrieve Receipt Metadata

Explain the upload flow.

Do not expose S3 directly.

---

# 9. Audit APIs

Design APIs for

- Expense Audit History

Explain access restrictions.

---

# 10. Request & Response Standards

Define

- Success response format
- Error response format

Include

- Error Code
- Message
- Validation Errors
- Correlation ID / Trace ID

Maintain consistency across all APIs.

---

# 11. Validation Rules

For every important endpoint define

Examples

- Required fields
- Field length
- Currency validation
- Amount validation
- Date validation
- File validation

Do not repeat database constraints.

Focus on API validation.

---

# 12. Authorization Matrix

For every endpoint specify

Who can access it?

Examples

Employee

Manager

Finance Admin

Org Admin

Explain any resource-level authorization rules.

---

# 13. Idempotency

Identify APIs requiring idempotency.

Examples

- Submit Expense
- Approve
- Reject
- Send Back

Explain

- Idempotency Key format
- Duplicate request behavior

---

# 14. Pagination, Filtering & Sorting

Define standards for

- Pagination
- Filtering
- Sorting

Use one consistent approach across all collection endpoints.

---

# 15. API Error Handling

Document standard HTTP status codes.

Examples

200

201

204

400

401

403

404

409

422

429

500

Explain when each should be returned.

---

# 16. Future Evolution

Briefly explain how the API layer can evolve for

- OCR
- Mobile clients
- ERP integrations
- Webhooks
- API versioning

without breaking existing clients.

---

# Guidelines

- Think like a Senior Backend Engineer.
- Follow REST best practices.
- Keep APIs consistent.
- Avoid RPC-style endpoint names unless justified.
- Design for maintainability.
- Every endpoint should have a clear ownership.
- Keep the API surface minimal.
- Avoid exposing internal implementation details.
- Do not generate implementation code.
- Do not generate Express routes.
- Do not generate Swagger/OpenAPI specifications.

The output should be a professional API Design document that backend and frontend engineers can directly implement. @ai/artifacts/04-persistence-data-model-design-final.md  @ai/artifacts/03-technical-design-final.md  @ai/artifacts/01-product-requirements.md
