import mongoose, { Types } from 'mongoose';
import bcrypt from 'bcryptjs';
import * as dotenv from 'dotenv';
import * as path from 'path';

dotenv.config({ path: path.resolve(__dirname, '../../.env') });
dotenv.config({ path: path.resolve(__dirname, '../.env') });

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/expensedb';

// ─── Minimal inline schemas (no app-level imports needed) ────────────────────

const OrgSchema = new mongoose.Schema(
  { name: String, slug: String, settings: { defaultCurrency: String } },
  { timestamps: true }
);

const UserSchema = new mongoose.Schema(
  {
    tenantId: { type: mongoose.Schema.Types.ObjectId, required: true },
    email: { type: String, required: true, lowercase: true },
    passwordHash: { type: String, required: true },
    firstName: { type: String, required: true },
    lastName: { type: String, required: true },
    department: { type: String, required: true },
    managerId: { type: mongoose.Schema.Types.ObjectId, default: null },
    roles: { type: [String], default: ['employee'] },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

const CategorySchema = new mongoose.Schema(
  {
    tenantId: { type: mongoose.Schema.Types.ObjectId, required: true },
    name: { type: String, required: true },
    isActive: { type: Boolean, default: true },
    amountThreshold: { type: Number, required: true, default: 0 },
    cfoId: { type: mongoose.Schema.Types.ObjectId, default: null },
  },
  { timestamps: true }
);

const WorkflowStepSchema = new mongoose.Schema({
  stepIndex: Number,
  approverId: { type: mongoose.Schema.Types.ObjectId },
  approverName: String,
  status: { type: String, enum: ['PENDING', 'ACTIVE', 'APPROVED', 'REJECTED', 'SKIPPED'] },
  comment: { type: String, default: null },
  decidedAt: { type: Date, default: null },
});

const WorkflowInstanceSchema = new mongoose.Schema({
  categoryId: { type: mongoose.Schema.Types.ObjectId },
  chainType: { type: String, enum: ['STANDARD', 'ELEVATED'] },
  version: { type: Number, default: 0 },
  status: { type: String, enum: ['ACTIVE', 'COMPLETED', 'REJECTED', 'CANCELLED'] },
  steps: { type: [WorkflowStepSchema], default: [] },
  currentStepIndex: Number,
  startedAt: Date,
  completedAt: { type: Date, default: null },
});

const ExpenseSchema = new mongoose.Schema(
  {
    tenantId: { type: mongoose.Schema.Types.ObjectId, required: true },
    submittedBy: { type: mongoose.Schema.Types.ObjectId, required: true },
    title: { type: String, required: true },
    amount: { type: Number, required: true },
    currency: { type: String, default: 'USD' },
    date: { type: Date, required: true },
    categoryId: { type: mongoose.Schema.Types.ObjectId, required: true },
    categoryName: { type: String, required: true },
    description: { type: String, default: '' },
    receiptPath: { type: String },
    status: {
      type: String,
      enum: ['DRAFT', 'SUBMITTED', 'IN_REVIEW', 'APPROVED', 'REJECTED', 'PAID'],
      default: 'DRAFT',
    },
    workflowInstance: { type: WorkflowInstanceSchema, default: null },
    workflowHistory: { type: [WorkflowInstanceSchema], default: [] },
  },
  { timestamps: true }
);

const AuditLogSchema = new mongoose.Schema(
  {
    tenantId: { type: mongoose.Schema.Types.ObjectId, required: true },
    expenseId: { type: mongoose.Schema.Types.ObjectId, required: true },
    actorId: { type: mongoose.Schema.Types.ObjectId, required: true },
    actorName: String,
    action: String,
    fromStatus: String,
    toStatus: String,
    comment: String,
    stepIndex: Number,
    metadata: mongoose.Schema.Types.Mixed,
  },
  { timestamps: true }
);

const Org = mongoose.model('Organization', OrgSchema);
const User = mongoose.model('User', UserSchema);
const Category = mongoose.model('ExpenseCategory', CategorySchema);
const Expense = mongoose.model('Expense', ExpenseSchema);
const AuditLog = mongoose.model('AuditLog', AuditLogSchema);

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeWorkflow(opts: {
  categoryId: Types.ObjectId;
  chainType: 'STANDARD' | 'ELEVATED';
  steps: Array<{ approverId: Types.ObjectId; approverName: string; status: string; comment?: string; decidedAt?: Date }>;
  currentStepIndex: number;
  status: 'ACTIVE' | 'COMPLETED' | 'REJECTED' | 'CANCELLED';
  startedAt: Date;
  completedAt?: Date;
}) {
  return {
    categoryId: opts.categoryId,
    chainType: opts.chainType,
    version: opts.steps.filter(s => ['APPROVED','REJECTED'].includes(s.status)).length,
    status: opts.status,
    steps: opts.steps.map((s, i) => ({
      stepIndex: i,
      approverId: s.approverId,
      approverName: s.approverName,
      status: s.status,
      comment: s.comment ?? null,
      decidedAt: s.decidedAt ?? null,
    })),
    currentStepIndex: opts.currentStepIndex,
    startedAt: opts.startedAt,
    completedAt: opts.completedAt ?? null,
  };
}

function daysAgo(n: number) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d;
}

// ─── Seed ────────────────────────────────────────────────────────────────────

async function seed() {
  console.log('Connecting to MongoDB...');
  await mongoose.connect(MONGODB_URI);
  console.log('Connected!\n');

  console.log('Wiping existing data...');
  await Promise.all([
    Expense.deleteMany({}),
    AuditLog.deleteMany({}),
    Category.deleteMany({}),
    User.deleteMany({}),
    Org.deleteMany({}),
  ]);
  console.log('Clean.\n');

  // ── Organisation ──────────────────────────────────────────────────────────
  const org = await Org.create({
    name: 'Acme Corp',
    slug: 'acme',
    settings: { defaultCurrency: 'USD' },
  });
  const tenantId = org._id as Types.ObjectId;
  console.log(`Org: Acme Corp  (${tenantId})\n`);

  const pw = await bcrypt.hash('Password1!', 12);

  // ── Users ─────────────────────────────────────────────────────────────────
  //
  //  Org hierarchy (3-level before Finance Admin):
  //
  //  Alice Admin (orgAdmin / CFO)          ← top, no manager
  //    ├── Victor VP (manager, L1)
  //    │     ├── Mike Manager (manager, L2)
  //    │     │     ├── Emma Employee
  //    │     │     ├── Liam Lee
  //    │     │     └── Sophia Patel
  //    │     └── Rachel Rodriguez (manager, L2)
  //    │           ├── James Kim
  //    │           ├── Priya Singh
  //    │           └── Noah Brown
  //    └── Diana Director (manager, L1)
  //          ├── Olivia Chen (manager, L2)
  //          │     ├── Ethan Gupta
  //          │     └── Ava Sharma
  //          └── Leo Martinez
  //
  //  Frank Finance (financeAdmin) — separate, always last approver

  console.log('Creating users...');

  const alice = await User.create({
    tenantId, email: 'alice@acme.com', passwordHash: pw,
    firstName: 'Alice', lastName: 'Admin', department: 'Executive',
    managerId: null, roles: ['orgAdmin'], isActive: true,
  });

  const frank = await User.create({
    tenantId, email: 'frank@acme.com', passwordHash: pw,
    firstName: 'Frank', lastName: 'Finance', department: 'Finance',
    managerId: null, roles: ['financeAdmin'], isActive: true,
  });

  // L1 managers
  const victor = await User.create({
    tenantId, email: 'victor@acme.com', passwordHash: pw,
    firstName: 'Victor', lastName: 'VP', department: 'Engineering',
    managerId: alice._id, roles: ['manager'], isActive: true,
  });

  const diana = await User.create({
    tenantId, email: 'diana@acme.com', passwordHash: pw,
    firstName: 'Diana', lastName: 'Director', department: 'Product',
    managerId: alice._id, roles: ['manager'], isActive: true,
  });

  // L2 managers under Victor
  const mike = await User.create({
    tenantId, email: 'mike@acme.com', passwordHash: pw,
    firstName: 'Mike', lastName: 'Manager', department: 'Engineering',
    managerId: victor._id, roles: ['manager'], isActive: true,
  });

  const rachel = await User.create({
    tenantId, email: 'rachel@acme.com', passwordHash: pw,
    firstName: 'Rachel', lastName: 'Rodriguez', department: 'Engineering',
    managerId: victor._id, roles: ['manager'], isActive: true,
  });

  // L2 manager under Diana
  const olivia = await User.create({
    tenantId, email: 'olivia@acme.com', passwordHash: pw,
    firstName: 'Olivia', lastName: 'Chen', department: 'Product',
    managerId: diana._id, roles: ['manager'], isActive: true,
  });

  // Employees under Mike
  const emma = await User.create({
    tenantId, email: 'emma@acme.com', passwordHash: pw,
    firstName: 'Emma', lastName: 'Employee', department: 'Engineering',
    managerId: mike._id, roles: ['employee'], isActive: true,
  });

  const liam = await User.create({
    tenantId, email: 'liam@acme.com', passwordHash: pw,
    firstName: 'Liam', lastName: 'Lee', department: 'Engineering',
    managerId: mike._id, roles: ['employee'], isActive: true,
  });

  const sophia = await User.create({
    tenantId, email: 'sophia@acme.com', passwordHash: pw,
    firstName: 'Sophia', lastName: 'Patel', department: 'Engineering',
    managerId: mike._id, roles: ['employee'], isActive: true,
  });

  // Employees under Rachel
  const james = await User.create({
    tenantId, email: 'james@acme.com', passwordHash: pw,
    firstName: 'James', lastName: 'Kim', department: 'Engineering',
    managerId: rachel._id, roles: ['employee'], isActive: true,
  });

  const priya = await User.create({
    tenantId, email: 'priya@acme.com', passwordHash: pw,
    firstName: 'Priya', lastName: 'Singh', department: 'Engineering',
    managerId: rachel._id, roles: ['employee'], isActive: true,
  });

  const noah = await User.create({
    tenantId, email: 'noah@acme.com', passwordHash: pw,
    firstName: 'Noah', lastName: 'Brown', department: 'Engineering',
    managerId: rachel._id, roles: ['employee'], isActive: true,
  });

  // Employees under Olivia
  const ethan = await User.create({
    tenantId, email: 'ethan@acme.com', passwordHash: pw,
    firstName: 'Ethan', lastName: 'Gupta', department: 'Product',
    managerId: olivia._id, roles: ['employee'], isActive: true,
  });

  const ava = await User.create({
    tenantId, email: 'ava@acme.com', passwordHash: pw,
    firstName: 'Ava', lastName: 'Sharma', department: 'Product',
    managerId: olivia._id, roles: ['employee'], isActive: true,
  });

  // Employee under Diana (no L2 manager)
  const leo = await User.create({
    tenantId, email: 'leo@acme.com', passwordHash: pw,
    firstName: 'Leo', lastName: 'Martinez', department: 'Product',
    managerId: diana._id, roles: ['employee'], isActive: true,
  });

  console.log('  Role          Email                  Reports To');
  console.log('  ──────────────────────────────────────────────────────');
  console.log(`  orgAdmin      alice@acme.com         (top)`);
  console.log(`  financeAdmin  frank@acme.com         (separate)`);
  console.log(`  manager L1    victor@acme.com        → Alice`);
  console.log(`  manager L1    diana@acme.com         → Alice`);
  console.log(`  manager L2    mike@acme.com          → Victor`);
  console.log(`  manager L2    rachel@acme.com        → Victor`);
  console.log(`  manager L2    olivia@acme.com        → Diana`);
  console.log(`  employee      emma@acme.com          → Mike`);
  console.log(`  employee      liam@acme.com          → Mike`);
  console.log(`  employee      sophia@acme.com        → Mike`);
  console.log(`  employee      james@acme.com         → Rachel`);
  console.log(`  employee      priya@acme.com         → Rachel`);
  console.log(`  employee      noah@acme.com          → Rachel`);
  console.log(`  employee      ethan@acme.com         → Olivia`);
  console.log(`  employee      ava@acme.com           → Olivia`);
  console.log(`  employee      leo@acme.com           → Diana`);

  // ── Categories ────────────────────────────────────────────────────────────
  console.log('\nCreating categories...');

  const catTravel = await Category.create({
    tenantId, name: 'Travel', isActive: true,
    amountThreshold: 50000,   // $500 — above → ELEVATED → CFO added
    cfoId: alice._id,
  });

  const catOffice = await Category.create({
    tenantId, name: 'Office Supplies', isActive: true,
    amountThreshold: 20000,   // $200
    cfoId: alice._id,
  });

  const catMeals = await Category.create({
    tenantId, name: 'Meals & Entertainment', isActive: true,
    amountThreshold: 10000,   // $100
    cfoId: alice._id,
  });

  const catSoftware = await Category.create({
    tenantId, name: 'Software & Subscriptions', isActive: true,
    amountThreshold: 30000,   // $300
    cfoId: alice._id,
  });

  const catTraining = await Category.create({
    tenantId, name: 'Training & Conferences', isActive: true,
    amountThreshold: 100000,  // $1000
    cfoId: alice._id,
  });

  console.log('  Travel                     threshold $500');
  console.log('  Office Supplies            threshold $200');
  console.log('  Meals & Entertainment      threshold $100');
  console.log('  Software & Subscriptions   threshold $300');
  console.log('  Training & Conferences     threshold $1000');

  // ── Test Expenses ─────────────────────────────────────────────────────────
  // Chains for reference:
  //   emma:  Mike → Victor → Frank (standard) | + Alice (elevated)
  //   liam:  Mike → Victor → Frank (standard) | + Alice (elevated)
  //   james: Rachel → Victor → Frank (standard) | + Alice (elevated)
  //   ethan: Olivia → Diana → Frank (standard) | + Alice (elevated)
  //   leo:   Diana → Frank (standard) | + Alice (elevated)

  console.log('\nCreating test expenses...');

  // 1. APPROVED — Emma, Travel, standard ($120)
  await Expense.create({
    tenantId, submittedBy: emma._id,
    title: 'Flight to NYC Client Visit', amount: 12000,
    currency: 'USD', date: daysAgo(15),
    categoryId: catTravel._id, categoryName: 'Travel',
    description: 'Return flight for client meeting',
    status: 'APPROVED',
    workflowInstance: makeWorkflow({
      categoryId: catTravel._id, chainType: 'STANDARD',
      status: 'COMPLETED', startedAt: daysAgo(15), completedAt: daysAgo(12),
      currentStepIndex: 2,
      steps: [
        { approverId: mike._id, approverName: 'Mike Manager', status: 'APPROVED', comment: 'Approved', decidedAt: daysAgo(14) },
        { approverId: victor._id, approverName: 'Victor VP', status: 'APPROVED', comment: 'Looks good', decidedAt: daysAgo(13) },
        { approverId: frank._id, approverName: 'Frank Finance', status: 'APPROVED', comment: 'Finance approved', decidedAt: daysAgo(12) },
      ],
    }),
  });

  // 2. APPROVED — Liam, Office Supplies, standard ($85)
  await Expense.create({
    tenantId, submittedBy: liam._id,
    title: 'Standing Desk Mat', amount: 8500,
    currency: 'USD', date: daysAgo(10),
    categoryId: catOffice._id, categoryName: 'Office Supplies',
    description: 'Ergonomic mat for home office',
    status: 'APPROVED',
    workflowInstance: makeWorkflow({
      categoryId: catOffice._id, chainType: 'STANDARD',
      status: 'COMPLETED', startedAt: daysAgo(10), completedAt: daysAgo(7),
      currentStepIndex: 2,
      steps: [
        { approverId: mike._id, approverName: 'Mike Manager', status: 'APPROVED', comment: 'Fine', decidedAt: daysAgo(9) },
        { approverId: victor._id, approverName: 'Victor VP', status: 'APPROVED', comment: 'Approved', decidedAt: daysAgo(8) },
        { approverId: frank._id, approverName: 'Frank Finance', status: 'APPROVED', decidedAt: daysAgo(7) },
      ],
    }),
  });

  // 3. APPROVED — James, Meals, standard ($65)
  await Expense.create({
    tenantId, submittedBy: james._id,
    title: 'Team Lunch', amount: 6500,
    currency: 'USD', date: daysAgo(8),
    categoryId: catMeals._id, categoryName: 'Meals & Entertainment',
    description: 'Sprint retrospective lunch',
    status: 'APPROVED',
    workflowInstance: makeWorkflow({
      categoryId: catMeals._id, chainType: 'STANDARD',
      status: 'COMPLETED', startedAt: daysAgo(8), completedAt: daysAgo(5),
      currentStepIndex: 2,
      steps: [
        { approverId: rachel._id, approverName: 'Rachel Rodriguez', status: 'APPROVED', comment: 'Valid', decidedAt: daysAgo(7) },
        { approverId: victor._id, approverName: 'Victor VP', status: 'APPROVED', decidedAt: daysAgo(6) },
        { approverId: frank._id, approverName: 'Frank Finance', status: 'APPROVED', decidedAt: daysAgo(5) },
      ],
    }),
  });

  // 4. APPROVED — Ethan, Software, elevated ($450 > $300 threshold)
  await Expense.create({
    tenantId, submittedBy: ethan._id,
    title: 'JetBrains All Products Pack', amount: 45000,
    currency: 'USD', date: daysAgo(20),
    categoryId: catSoftware._id, categoryName: 'Software & Subscriptions',
    description: 'Annual license renewal',
    status: 'APPROVED',
    workflowInstance: makeWorkflow({
      categoryId: catSoftware._id, chainType: 'ELEVATED',
      status: 'COMPLETED', startedAt: daysAgo(20), completedAt: daysAgo(15),
      currentStepIndex: 3,
      steps: [
        { approverId: olivia._id, approverName: 'Olivia Chen', status: 'APPROVED', comment: 'Needed for team', decidedAt: daysAgo(19) },
        { approverId: diana._id, approverName: 'Diana Director', status: 'APPROVED', decidedAt: daysAgo(18) },
        { approverId: frank._id, approverName: 'Frank Finance', status: 'APPROVED', decidedAt: daysAgo(17) },
        { approverId: alice._id, approverName: 'Alice Admin', status: 'APPROVED', comment: 'CFO approved', decidedAt: daysAgo(15) },
      ],
    }),
  });

  // 5. REJECTED — Sophia, Travel, elevated ($800 > $500 threshold) — rejected by VP
  await Expense.create({
    tenantId, submittedBy: sophia._id,
    title: 'International Conference Flight', amount: 80000,
    currency: 'USD', date: daysAgo(5),
    categoryId: catTravel._id, categoryName: 'Travel',
    description: 'AWS re:Invent Las Vegas',
    status: 'REJECTED',
    workflowInstance: makeWorkflow({
      categoryId: catTravel._id, chainType: 'ELEVATED',
      status: 'REJECTED', startedAt: daysAgo(5), completedAt: daysAgo(3),
      currentStepIndex: 1,
      steps: [
        { approverId: mike._id, approverName: 'Mike Manager', status: 'APPROVED', comment: 'Good opportunity', decidedAt: daysAgo(4) },
        { approverId: victor._id, approverName: 'Victor VP', status: 'REJECTED', comment: 'Budget exceeded for Q3', decidedAt: daysAgo(3) },
        { approverId: frank._id, approverName: 'Frank Finance', status: 'PENDING' },
        { approverId: alice._id, approverName: 'Alice Admin', status: 'PENDING' },
      ],
    }),
  });

  // 6. IN_REVIEW — Priya, Software, standard ($150 < $300 threshold) — at Victor
  await Expense.create({
    tenantId, submittedBy: priya._id,
    title: 'Figma Professional Plan', amount: 15000,
    currency: 'USD', date: daysAgo(2),
    categoryId: catSoftware._id, categoryName: 'Software & Subscriptions',
    description: 'Design tool annual subscription',
    status: 'IN_REVIEW',
    workflowInstance: makeWorkflow({
      categoryId: catSoftware._id, chainType: 'STANDARD',
      status: 'ACTIVE', startedAt: daysAgo(2),
      currentStepIndex: 1,
      steps: [
        { approverId: rachel._id, approverName: 'Rachel Rodriguez', status: 'APPROVED', comment: 'Approved', decidedAt: daysAgo(1) },
        { approverId: victor._id, approverName: 'Victor VP', status: 'ACTIVE' },
        { approverId: frank._id, approverName: 'Frank Finance', status: 'PENDING' },
      ],
    }),
  });

  // 7. IN_REVIEW — Noah, Meals, standard ($90 < $100 threshold) — at Frank
  await Expense.create({
    tenantId, submittedBy: noah._id,
    title: 'Client Dinner', amount: 9000,
    currency: 'USD', date: daysAgo(3),
    categoryId: catMeals._id, categoryName: 'Meals & Entertainment',
    description: 'Dinner with potential enterprise client',
    status: 'IN_REVIEW',
    workflowInstance: makeWorkflow({
      categoryId: catMeals._id, chainType: 'STANDARD',
      status: 'ACTIVE', startedAt: daysAgo(3),
      currentStepIndex: 2,
      steps: [
        { approverId: rachel._id, approverName: 'Rachel Rodriguez', status: 'APPROVED', decidedAt: daysAgo(2) },
        { approverId: victor._id, approverName: 'Victor VP', status: 'APPROVED', decidedAt: daysAgo(1) },
        { approverId: frank._id, approverName: 'Frank Finance', status: 'ACTIVE' },
      ],
    }),
  });

  // 8. IN_REVIEW — Leo, Training, elevated ($1200 > $1000 threshold) — at Diana (L1)
  await Expense.create({
    tenantId, submittedBy: leo._id,
    title: 'Product Management Bootcamp', amount: 120000,
    currency: 'USD', date: daysAgo(1),
    categoryId: catTraining._id, categoryName: 'Training & Conferences',
    description: '3-day PM intensive workshop',
    status: 'IN_REVIEW',
    workflowInstance: makeWorkflow({
      categoryId: catTraining._id, chainType: 'ELEVATED',
      status: 'ACTIVE', startedAt: daysAgo(1),
      currentStepIndex: 0,
      steps: [
        { approverId: diana._id, approverName: 'Diana Director', status: 'ACTIVE' },
        { approverId: frank._id, approverName: 'Frank Finance', status: 'PENDING' },
        { approverId: alice._id, approverName: 'Alice Admin', status: 'PENDING' },
      ],
    }),
  });

  // 9. IN_REVIEW — Ava, Office Supplies, standard ($180 < $200 threshold) — at Olivia
  await Expense.create({
    tenantId, submittedBy: ava._id,
    title: 'Mechanical Keyboard', amount: 18000,
    currency: 'USD', date: daysAgo(1),
    categoryId: catOffice._id, categoryName: 'Office Supplies',
    description: 'Keyboard for remote work setup',
    status: 'IN_REVIEW',
    workflowInstance: makeWorkflow({
      categoryId: catOffice._id, chainType: 'STANDARD',
      status: 'ACTIVE', startedAt: daysAgo(1),
      currentStepIndex: 0,
      steps: [
        { approverId: olivia._id, approverName: 'Olivia Chen', status: 'ACTIVE' },
        { approverId: diana._id, approverName: 'Diana Director', status: 'PENDING' },
        { approverId: frank._id, approverName: 'Frank Finance', status: 'PENDING' },
      ],
    }),
  });

  // 10. DRAFT — Emma, Travel, not submitted yet
  await Expense.create({
    tenantId, submittedBy: emma._id,
    title: 'Hotel — Singapore Summit', amount: 35000,
    currency: 'USD', date: daysAgo(0),
    categoryId: catTravel._id, categoryName: 'Travel',
    description: '3 nights accommodation',
    status: 'DRAFT',
    workflowInstance: null,
  });

  // 11. DRAFT — Sophia, Software
  await Expense.create({
    tenantId, submittedBy: sophia._id,
    title: 'GitHub Copilot Subscription', amount: 1900,
    currency: 'USD', date: daysAgo(0),
    categoryId: catSoftware._id, categoryName: 'Software & Subscriptions',
    description: 'Monthly AI coding assistant',
    status: 'DRAFT',
    workflowInstance: null,
  });

  // 12. APPROVED — Leo, Meals, standard ($75 < $100 threshold)
  await Expense.create({
    tenantId, submittedBy: leo._id,
    title: 'Team Coffee & Snacks', amount: 7500,
    currency: 'USD', date: daysAgo(12),
    categoryId: catMeals._id, categoryName: 'Meals & Entertainment',
    description: 'Weekly team sync snacks',
    status: 'APPROVED',
    workflowInstance: makeWorkflow({
      categoryId: catMeals._id, chainType: 'STANDARD',
      status: 'COMPLETED', startedAt: daysAgo(12), completedAt: daysAgo(9),
      currentStepIndex: 1,
      steps: [
        { approverId: diana._id, approverName: 'Diana Director', status: 'APPROVED', decidedAt: daysAgo(11) },
        { approverId: frank._id, approverName: 'Frank Finance', status: 'APPROVED', decidedAt: daysAgo(9) },
      ],
    }),
  });

  console.log('  12 expenses created (4 APPROVED, 3 IN_REVIEW, 1 REJECTED, 2 DRAFT, 1 APPROVED, 1 APPROVED)');

  // ── Summary ───────────────────────────────────────────────────────────────
  const pad = (s: string, n: number) => s.padEnd(n);

  console.log('\n╔══════════════════════════════════════════════════════════════╗');
  console.log('║                     SEED COMPLETE                           ║');
  console.log('╠══════════════════════════════════════════════════════════════╣');
  console.log(`║  Org: Acme Corp   Tenant: ${tenantId}   ║`);
  console.log('╠══════════════════════════════════════════════════════════════╣');
  console.log('║  All passwords: Password1!                                  ║');
  console.log('╠══════════════════════════════════════════════════════════════╣');
  console.log('║  Email                  Role             Reports To         ║');
  console.log('║  ──────────────────────────────────────────────────────     ║');
  console.log(`║  ${pad('alice@acme.com', 24)} ${pad('orgAdmin/CFO', 16)} top               ║`);
  console.log(`║  ${pad('frank@acme.com', 24)} ${pad('financeAdmin', 16)} (separate)        ║`);
  console.log(`║  ${pad('victor@acme.com', 24)} ${pad('manager L1', 16)} Alice             ║`);
  console.log(`║  ${pad('diana@acme.com', 24)} ${pad('manager L1', 16)} Alice             ║`);
  console.log(`║  ${pad('mike@acme.com', 24)} ${pad('manager L2', 16)} Victor            ║`);
  console.log(`║  ${pad('rachel@acme.com', 24)} ${pad('manager L2', 16)} Victor            ║`);
  console.log(`║  ${pad('olivia@acme.com', 24)} ${pad('manager L2', 16)} Diana             ║`);
  console.log(`║  ${pad('emma@acme.com', 24)} ${pad('employee', 16)} Mike              ║`);
  console.log(`║  ${pad('liam@acme.com', 24)} ${pad('employee', 16)} Mike              ║`);
  console.log(`║  ${pad('sophia@acme.com', 24)} ${pad('employee', 16)} Mike              ║`);
  console.log(`║  ${pad('james@acme.com', 24)} ${pad('employee', 16)} Rachel            ║`);
  console.log(`║  ${pad('priya@acme.com', 24)} ${pad('employee', 16)} Rachel            ║`);
  console.log(`║  ${pad('noah@acme.com', 24)} ${pad('employee', 16)} Rachel            ║`);
  console.log(`║  ${pad('ethan@acme.com', 24)} ${pad('employee', 16)} Olivia            ║`);
  console.log(`║  ${pad('ava@acme.com', 24)} ${pad('employee', 16)} Olivia            ║`);
  console.log(`║  ${pad('leo@acme.com', 24)} ${pad('employee', 16)} Diana             ║`);
  console.log('╠══════════════════════════════════════════════════════════════╣');
  console.log('║  Chain examples:                                            ║');
  console.log('║  emma  standard: Mike → Victor → Frank                     ║');
  console.log('║  emma  elevated: Mike → Victor → Frank → Alice (CFO)       ║');
  console.log('║  leo   standard: Diana → Frank                             ║');
  console.log('║  leo   elevated: Diana → Frank → Alice (CFO)               ║');
  console.log('╚══════════════════════════════════════════════════════════════╝');

  await mongoose.disconnect();
  process.exit(0);
}

seed().catch((err) => {
  console.error('Seed failed:', err);
  process.exit(1);
});
