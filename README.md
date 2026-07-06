# Expense Management System

A full-stack, containerized expense management application with multi-level approval workflows and role-based access control.

## Tech Stack

- **Backend**: Node.js, Express, TypeScript, Mongoose
- **Frontend**: Next.js 14 (App Router), TypeScript, Tailwind CSS
- **Database**: MongoDB 7
- **Auth**: JWT (HS256)
- **File uploads**: Multer (local disk)
- **Container**: Docker Compose

---

## Quick Start

### Prerequisites

- Docker and Docker Compose installed

### 1. Clone and start

```bash
git clone <repo-url>
cd Expense-Management
docker compose up --build
```

This starts three services:
- `mongodb` on port 27017
- `backend` on port 4000
- `frontend` on port 3000

### 2. Seed the database

After containers are up, run the seed script to create the demo organization, users, and categories:

```bash
docker exec expense-backend npm run seed
```

The seed output will print the **Organization ID** (Tenant ID). Copy it — you need it to log in.

```
=== Seed Complete ===

Organization:
  Name: Acme Corp
  ID: 64f3a1b2c5d6e7f8a9b0c1d2   <-- this is your Tenant ID

Users (all password: Password1!):
  employee@acme.com  - role: employee
  manager@acme.com   - role: manager
  finance@acme.com   - role: financeAdmin
  admin@acme.com     - role: orgAdmin
```

### 3. Open the app

Go to [http://localhost:3000](http://localhost:3000)

Log in with any of the seeded accounts using:
- The email above
- Password: `Password1!`
- Tenant ID: the Organization ID from the seed output

---

## Demo Users

| Email | Password | Role | Notes |
|---|---|---|---|
| employee@acme.com | Password1! | Employee | Reports to manager |
| manager@acme.com | Password1! | Manager | Approves employee expenses |
| finance@acme.com | Password1! | Finance Admin | Final approver, marks paid, manages categories |
| admin@acme.com | Password1! | Org Admin | Manages users and roles |

---

## Seeded Expense Categories

| Category | Threshold | Standard Chain | Elevated Chain |
|---|---|---|---|
| Travel | $500 | Manager approval | Manager + Finance Admin |
| Office Supplies | $200 | Manager approval | Manager + Finance Admin |

Expenses at or below the threshold use the standard chain. Expenses above the threshold use the elevated chain (requires Finance Admin sign-off).

---

## Features by Role

### Employee
- Create, edit, and submit expense reports
- Attach receipts (PDF, JPG, PNG)
- Track approval status with a live workflow timeline
- Withdraw submitted expenses before review

### Manager
- Pending approvals queue
- Approve, reject, or send back expenses with comments

### Finance Admin
- View all organization expenses
- Final approval step for elevated expenses
- Mark approved expenses as paid
- Manage expense categories (create, edit, activate/deactivate)
- View audit logs

### Org Admin
- Create and manage users
- Assign roles to users
- Manage expense categories

---

## API

Base URL: `http://localhost:4000/api/v1`

Health check: `GET /api/v1/health`

Key endpoints:

```
POST   /auth/login
POST   /auth/change-password

GET    /expenses
POST   /expenses
GET    /expenses/:id
PATCH  /expenses/:id
POST   /expenses/:id/submit
POST   /expenses/:id/withdraw
POST   /expenses/:id/mark-paid
POST   /expenses/:id/workflow/approve
POST   /expenses/:id/workflow/reject
POST   /expenses/:id/workflow/send-back
GET    /expenses/:id/audit

GET    /expense-categories
POST   /expense-categories
GET    /expense-categories/:id
PATCH  /expense-categories/:id
POST   /expense-categories/:id/activate
POST   /expense-categories/:id/deactivate

GET    /users
POST   /users
PATCH  /users/:id
PUT    /users/:id/roles

POST   /receipts/upload
GET    /receipts/:id
```

---

## Development (without Docker)

### Backend

```bash
cd backend
npm install
# create .env file
cp .env.example .env   # or set vars manually
npm run dev
```

Required env vars:
```
MONGODB_URI=mongodb://localhost:27017/expensedb
JWT_SECRET=your-secret-key
JWT_EXPIRES_IN=86400
PORT=4000
UPLOAD_DIR=./uploads
```

Run seed:
```bash
npm run seed
```

### Frontend

```bash
cd frontend
npm install
npm run dev
```

The frontend reads `NEXT_PUBLIC_API_URL` (defaults to `http://localhost:4000/api/v1`).

---

## Project Structure

```
.
├── backend/
│   ├── src/
│   │   ├── modules/
│   │   │   ├── auth/
│   │   │   ├── expense/
│   │   │   ├── workflow/        # categories + workflow engine
│   │   │   ├── user/
│   │   │   ├── audit/
│   │   │   ├── receipt/
│   │   │   └── organization/
│   │   ├── middleware/
│   │   └── shared/
│   └── seeds/
├── frontend/
│   └── src/
│       ├── app/                 # Next.js App Router pages
│       ├── components/
│       ├── lib/                 # api client, auth helpers
│       └── types/
├── uploads/                     # local file uploads (mounted as Docker volume)
├── docker-compose.yml
└── docs/
    └── submission.md
```

---

## Design Decisions

- **Category-driven workflow**: each expense category carries its own standard and elevated approval chains plus an amount threshold. Chain selection is a single DB lookup + threshold comparison, not a rule-matching algorithm.
- **Chain frozen at submission**: the resolved approver list is embedded in the expense document. Changing a category later does not affect in-flight expenses.
- **Optimistic locking**: approval actions use `workflowInstance.version` to prevent concurrent conflicting updates without requiring transactions.
- **Self-approval skip**: if an approver is the same person as the submitter, the step is auto-skipped and the workflow escalates to the next step or the Finance Admin fallback.
- **Deactivated category blocks submission**: drafts under a deactivated category cannot be submitted until the admin reactivates it or the employee changes category.
