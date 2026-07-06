'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { getExpenses } from '@/lib/api';
import { getCurrentUser, hasRole } from '@/lib/auth';
import { formatCurrency, formatDate } from '@/lib/utils';
import { Expense } from '@/types';
import Card from '@/components/ui/Card';
import Badge from '@/components/ui/Badge';
import Button from '@/components/ui/Button';
import Table from '@/components/ui/Table';
import Select from '@/components/ui/Select';

const STATUS_OPTIONS = [
  { value: '', label: 'All Statuses' },
  { value: 'DRAFT', label: 'Draft' },
  { value: 'SUBMITTED', label: 'Submitted' },
  { value: 'IN_REVIEW', label: 'In Review' },
  { value: 'APPROVED', label: 'Approved' },
  { value: 'REJECTED', label: 'Rejected' },
  { value: 'PAID', label: 'Paid' },
];

export default function ExpensesPage() {
  const searchParams = useSearchParams();
  const viewAll = searchParams.get('view') === 'all';
  const isFinanceAdmin = hasRole('financeAdmin');
  const showAll = viewAll && isFinanceAdmin;

  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('');
  const user = getCurrentUser();

  useEffect(() => {
    fetchExpenses();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [statusFilter, showAll]);

  const fetchExpenses = async () => {
    setLoading(true);
    try {
      const params: Record<string, string> = {};
      if (statusFilter) params.status = statusFilter;
      const res = await getExpenses(params);
      const data = res.data.data || res.data;
      const items: Expense[] = Array.isArray(data) ? data : data.items || [];

      // Filter to own expenses unless financeAdmin viewing all
      const filtered = showAll
        ? items
        : items.filter((e) => e.submittedBy?.id === user?.userId);

      setExpenses(filtered);
    } catch {
      setExpenses([]);
    } finally {
      setLoading(false);
    }
  };

  const columns = [
    {
      key: 'title',
      header: 'Title',
      render: (row: Expense) => (
        <div>
          <p className="font-medium text-gray-900">{row.title}</p>
          <p className="text-xs text-gray-400">{row.categoryName}</p>
        </div>
      ),
    },
    {
      key: 'amount',
      header: 'Amount',
      render: (row: Expense) => (
        <span className="font-semibold text-gray-900">{formatCurrency(row.amount, row.currency)}</span>
      ),
    },
    ...(showAll
      ? [
          {
            key: 'submittedBy',
            header: 'Submitted By',
            render: (row: Expense) => (
              <span className="text-sm text-gray-600">
                {row.submittedBy?.firstName} {row.submittedBy?.lastName}
              </span>
            ),
          },
        ]
      : []),
    {
      key: 'date',
      header: 'Date',
      render: (row: Expense) => (
        <span className="text-sm text-gray-600">{formatDate(row.date)}</span>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      render: (row: Expense) => <Badge status={row.status} />,
    },
    {
      key: 'actions',
      header: '',
      render: (row: Expense) => (
        <div className="flex items-center gap-2 justify-end">
          <Link
            href={`/dashboard/expenses/${row.id}`}
            className="text-xs font-medium text-blue-600 hover:text-blue-800 px-2 py-1 rounded hover:bg-blue-50 transition-colors"
            onClick={(e) => e.stopPropagation()}
          >
            View
          </Link>
          {row.status === 'DRAFT' && row.submittedBy?.id === user?.userId && (
            <Link
              href={`/dashboard/expenses/${row.id}/edit`}
              className="text-xs font-medium text-gray-500 hover:text-gray-800 px-2 py-1 rounded hover:bg-gray-100 transition-colors"
              onClick={(e) => e.stopPropagation()}
            >
              Edit
            </Link>
          )}
        </div>
      ),
      className: 'text-right',
    },
  ];

  return (
    <div className="p-6 space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900">
            {showAll ? 'All Expenses' : 'My Expenses'}
          </h1>
          <p className="text-sm text-gray-500 mt-0.5">
            {expenses.length} expense{expenses.length !== 1 ? 's' : ''}
          </p>
        </div>
        <div className="flex items-center gap-3">
          {isFinanceAdmin && (
            <Link
              href={showAll ? '/dashboard/expenses' : '/dashboard/expenses?view=all'}
              className="text-sm text-blue-600 hover:text-blue-800 font-medium"
            >
              {showAll ? 'My Expenses' : 'All Expenses'}
            </Link>
          )}
          <Link href="/dashboard/expenses/new">
            <Button variant="primary" size="sm">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              New Expense
            </Button>
          </Link>
        </div>
      </div>

      {/* Filters */}
      <Card padding="sm">
        <div className="flex items-center gap-3">
          <div className="w-48">
            <Select
              options={STATUS_OPTIONS}
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
            />
          </div>
          {statusFilter && (
            <button
              onClick={() => setStatusFilter('')}
              className="text-xs text-gray-500 hover:text-gray-700"
            >
              Clear filter
            </button>
          )}
        </div>
      </Card>

      {/* Table */}
      <Card padding="none">
        <Table
          columns={columns}
          data={expenses}
          keyExtractor={(row) => row.id}
          loading={loading}
          emptyMessage="No expenses found"
        />
      </Card>
    </div>
  );
}
