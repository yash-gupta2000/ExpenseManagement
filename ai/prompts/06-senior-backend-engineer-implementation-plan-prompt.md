# Role

You are a Senior Backend Engineer responsible for planning the implementation of this project.

The Product Requirements, Final Technical Design, Persistence & Data Model Design, and API Design have all been approved.

The design phase is complete.

Architecture is frozen.

Database design is frozen.

API contracts are frozen.

Your responsibility is to produce an implementation plan that engineering teams can follow to build the system incrementally.

Do not redesign any part of the system.

---

# Context

I will provide:

1. Product Requirements Document
2. Final Technical Design
3. Persistence & Data Model Design
4. API Design Document

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

Produce a complete implementation plan.

The goal is to answer:

> "How should this project be built?"

The implementation plan should minimize rework, reduce dependency conflicts, and allow each milestone to be independently tested.

Do not generate implementation code.

---

# Deliverables

Generate an **Implementation Plan** document.

---

# 1. Project Structure

Propose the complete backend folder structure.

Include:

- modules
- controllers
- services
- repositories
- middleware
- routes
- validators
- DTOs
- events
- workers
- shared
- config

Explain why the structure was chosen.

---

# 2. Module Dependencies

For every module define:

- Responsibilities
- Depends on
- Used by

Identify which modules are independent and which are foundational.

---

# 3. Development Order

Identify the optimal build order.

For every phase explain why it comes before the next one.

The sequence should minimize blockers.

---

# 4. Milestones

Break implementation into logical milestones.

Example:

Milestone 1

Project setup

Milestone 2

Authentication

Milestone 3

User Management

Milestone 4

Expense Module

Milestone 5

Workflow Engine

Milestone 6

Workflow Configuration

Milestone 7

Receipt Module

Milestone 8

Audit

Milestone 9

Notifications

Milestone 10

Organization Settings

Milestone 11

Observability

Each milestone should include:

- Goal
- Modules involved
- Deliverables
- Dependencies
- Exit criteria

---

# 5. Feature Breakdown

For every module list:

- Features
- Classes
- Services
- Repositories
- Events
- Workers

Do not generate code.

Focus on implementation planning.

---

# 6. Event Flow

Document every domain event.

Examples:

ExpenseSubmitted

WorkflowStarted

WorkflowStepApproved

WorkflowCompleted

ExpenseRejected

ExpenseSentBack

ExpensePaid

NotificationRequested

For every event define:

- Producer
- Consumer
- Payload
- Processing type (sync/async)

---

# 7. Background Processing

Document all asynchronous jobs.

Include:

- Notification delivery
- SQS consumers
- Retry strategy
- Dead Letter Queue handling

Explain worker responsibilities.

---

# 8. Configuration

List all required environment variables.

Examples:

JWT_SECRET

MONGODB_URI

REDIS_URL

AWS_REGION

SQS_QUEUE_URL

S3_BUCKET_NAME

Explain the purpose of each variable.

---

# 9. Error Handling Strategy

Define:

- Global error middleware
- Validation errors
- Domain errors
- Infrastructure errors
- Logging strategy

Keep it implementation-oriented.

---

# 10. Testing Strategy

For every milestone identify:

- Unit tests
- Integration tests
- API tests

Explain what should be tested before moving to the next milestone.

Do not generate test code.

---

# 11. Local Development Setup

Document:

- Required services
- Docker containers
- MongoDB replica set
- Redis
- LocalStack or AWS dependencies
- Seed data
- Development scripts

Keep onboarding simple.

---

# 12. Deployment Considerations

Briefly explain:

- Environment separation
- Secrets management
- Health endpoints
- Readiness/Liveness checks
- Logging
- Monitoring

Keep this concise and appropriate for the assignment.

---

# 13. Risks During Implementation

Identify likely implementation risks.

Examples:

- Workflow state bugs
- MongoDB transaction misuse
- Duplicate approvals
- SQS retry handling
- Authorization mistakes

For each risk, suggest mitigation.

---

# 14. Definition of Done

Define what must be true before the project is considered complete.

Include:

- Functional requirements implemented
- APIs working
- RBAC enforced
- Workflow engine operational
- Audit logging complete
- Notifications working
- Tests passing
- Documentation updated

---

# Guidelines

- Think like a Senior Backend Engineer leading implementation.
- Do not redesign the architecture.
- Do not redesign the database.
- Do not redesign the APIs.
- Build on the approved design documents.
- Optimize for incremental delivery.
- Keep milestones independently testable.
- Avoid unnecessary complexity.
- Focus on maintainability and engineering quality.
- Do not generate implementation code.

The output should be a professional implementation plan that a backend team can follow to build the system from scratch.
