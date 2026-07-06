# Product Requirements Document

## Expense Management System with Multi-Level Approvals

------------------------------------------------------------------------

# 1. Problem Overview

Organizations need a centralized way to manage employee expenses instead
of relying on spreadsheets, emails, or manual approval processes. The
system should allow employees to submit expenses, route them through
configurable approval workflows, and provide visibility into the
approval lifecycle.

This project is a multi-tenant SaaS application where each organization
manages its own users, roles, approval workflows, and expenses
independently.

The primary goal of the MVP is to build:

-   Expense submission and tracking
-   Configurable multi-level approval workflows
-   Role-based access management
-   Auditability of all approval actions

The solution should be flexible enough to support different
organizational approval hierarchies without requiring code changes.

------------------------------------------------------------------------

# 2. Core Personas

## Employee

**Responsibilities**

-   Create and submit expenses
-   Track approval status
-   Respond to requests for additional information
-   Withdraw pending expenses before review

**Goal**

Submit expenses quickly and understand where they are in the approval
process.

## Manager (Approver)

**Responsibilities**

-   Review expenses assigned to them
-   Approve, reject, or request changes
-   Provide comments for decisions

**Goal**

Review expenses efficiently while ensuring policy compliance.

## Finance Admin

**Responsibilities**

-   Configure approval rules
-   Manage expense categories
-   View organization-wide expenses
-   Mark approved expenses as paid
-   Access audit history

**Goal**

Maintain financial oversight and complete the reimbursement process.

## Organization Admin

**Responsibilities**

-   Manage users and role assignments
-   Configure approval workflows
-   Manage organization-level settings

**Goal**

Configure the platform without requiring engineering support.

------------------------------------------------------------------------

# 3. Functional Requirements

## Core (Must Have)

### Expense Management

-   Create an expense with:
    -   Title
    -   Amount
    -   Currency
    -   Date
    -   Category
    -   Description
    -   Optional receipt attachment
-   Save expenses as drafts
-   Edit draft expenses
-   Submit expenses
-   Withdraw submitted expenses before approval begins
-   Track expense status

### Approval Workflow

-   Support sequential multi-level approval
-   Determine approval chain at submission time based on the expense
    category and amount
-   Every expense category carries two approval chains:
    -   A standard chain for amounts at or below the category threshold
    -   An elevated chain for amounts above the category threshold
-   Each category also carries a configurable amount threshold that
    separates standard from elevated approval
-   Workflow Admin can create categories, define both chains, set the
    threshold, and activate or deactivate categories
-   Workflow configuration should be managed without requiring code
    changes
-   Approvers can:
    -   Approve
    -   Reject
    -   Send back with comments
-   Rejecting an expense terminates the workflow
-   Sending back returns the expense to Draft
-   Prevent users from approving their own expenses
-   Employees cannot submit an expense under a deactivated category;
    the draft is blocked until the admin reactivates the category or
    the employee switches to a different one

### Role & Access Management

Predefined roles:

-   Employee
-   Manager
-   Finance Admin
-   Organization Admin

Requirements:

-   Users may have multiple roles
-   Permissions are role-based
-   Access is restricted within a tenant

### Audit

Maintain an immutable audit history recording:

-   Actor
-   Action
-   Timestamp
-   Comments (if any)

Audit history is visible to Finance Admin and Organization Admin.

### Notifications

Send email notifications when:

-   Expense submitted
-   Approval requested
-   Expense approved
-   Expense rejected
-   More information requested
-   Expense marked as paid

## Future Enhancements

-   Bulk approvals
-   Approval delegation
-   Expense reports
-   Receipt OCR
-   Policy validation
-   Multi-currency
-   Accounting integrations
-   Mobile application
-   In-app notifications

------------------------------------------------------------------------

# 4. Non-Functional Requirements

## Performance

-   Expense submission should complete within 500 ms (excluding file
    uploads)
-   Approval actions should complete within 500 ms
-   Expense listing should support pagination

## Reliability

-   Approval workflow state must never be lost
-   Workflow state transitions must be atomic

## Scalability

-   Support multiple organizations with complete tenant isolation
-   Workflow configuration should scale across different organization
    sizes
-   Notifications may be processed asynchronously

## Security

-   All APIs require authentication
-   Authorization enforced for every request
-   Users can only access resources permitted by their roles
-   Tenant isolation enforced at the data layer

## Maintainability

-   Expense categories and their approval chains should be configurable
    through the application UI by the Workflow Admin, without code changes
-   Adding a new category or adjusting a threshold should never require
    a deployment

------------------------------------------------------------------------

# 5. Business Rules

-   An approver cannot approve their own expense. If encountered, the
    workflow skips to the next valid approver or configured fallback.
-   The approval chain is determined at submission time by the expense
    category and whether the amount exceeds the category threshold. The
    chain is frozen once the expense is submitted and does not change if
    the category configuration is later modified.
-   Expenses cannot be submitted under a deactivated category. The draft
    is blocked until the admin reactivates the category or the employee
    selects a different one.
-   Submitted expenses cannot be edited directly. They must first be
    withdrawn or sent back.
-   Rejecting an expense terminates the workflow.
-   Expenses can only be marked as paid after final approval.
-   Every workflow action must be recorded in the audit log.
-   Resubmitting an expense creates a new approval workflow.
-   Every expense belongs to exactly one tenant and cannot be accessed
    across tenants.

------------------------------------------------------------------------

# 6. Assumptions

-   English only
-   Single timezone for MVP
-   One organization per tenant
-   Sequential approval workflows only
-   Expense categories are created and managed by the Workflow Admin,
    not hardcoded; categories can be added at any time without a
    deployment
-   Each category has exactly one standard chain and one elevated chain;
    there are no additional tiers beyond the threshold split
-   Email notifications only
-   Payment processing is out of scope
-   Receipt OCR is out of scope
-   Responsive web application only
-   JWT-based authentication
-   Predefined roles only
-   Optional receipt attachments

------------------------------------------------------------------------

# 7. Domain Glossary

  Term                  Description
  --------------------- -----------------------------------------------------------------
  Tenant                An organization using the platform
  User                  A member of a tenant
  Expense               A reimbursement request created by a user
  Expense Category      A named type of expense (e.g. Travel, Food) that carries its own
                        approval chains and amount threshold; created by the Workflow Admin
  Amount Threshold      The per-category ceiling that splits standard from elevated approval
  Standard Chain        The approval chain used when an expense is at or below the threshold
  Elevated Chain        The approval chain used when an expense exceeds the threshold
  Workflow              The approval process assigned to an expense at submission time
  Approval Step         A single stage in the workflow
  Approver              User responsible for approving a workflow step
  Role                  Collection of permissions assigned to users
  Audit Log             Immutable history of actions
  Notification          Email generated during workflow events

-----------------------------------------------------------------------

# 8. MVP Scope

## Build

-   Expense CRUD with lifecycle management
-   Sequential multi-level approval workflow driven by expense category
    and amount threshold
-   Workflow Admin can create and manage expense categories, set
    thresholds, define standard and elevated approval chains, and
    activate or deactivate categories
-   Four predefined roles with RBAC
-   Approval actions (Approve, Reject, Send Back)
-   Immutable audit log
-   Email notifications
-   Employee dashboard
-   Manager approval queue
-   Finance Admin dashboard
-   Organization Admin for user, role, and workflow management

## Out of Scope

-   Payment gateway integration
-   Receipt OCR
-   Mobile applications
-   SSO/SAML
-   Parallel approvals
-   Multi-currency
-   ERP integrations
-   Custom roles
-   Self-service tenant onboarding
