'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { getExpenses } from '@/lib/api';
import { getCurrentUser, hasRole } from '@/lib/auth';
import { formatCurrency } from '@/lib/utils';
import { Expense } from '@/types';
import Card from '@/components/ui/Card';
import Badge from '@/components/ui/Badge';

interface StatCardProps {
  title: string;
  value: string | number;
  subtitle: string;
  color: string;
  icon: React.ReactNode;
  href?: string;
}

function StatCard({ title, value, subtitle, color, icon, href }: StatCardProps) {
  const content = (
    <Card className="hover:shadow-md transition-shadow">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-sm font-medium text-gray-500">{title}</p>
          <p className={`text-3xl font-bold mt-1 ${color}`}>{value}</p>
          <p className="text-xs text-gray-400 mt-1">{subtitle}</p>
        </div>
        <div className={`p-3 rounded-xl ${color.replace('text-', 'bg-').replace('-600', '-50').replace('-700', '-50')}`}>
          {icon}
        </div>
      </div>
    </Card>
  );
  if (href) {
    return <Link href={href}>{content}</Link>;
  }
  return content;
}

export default function DashboardPage() {
  const user = getCurrentUser();
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const res = await getExpenses({ limit: 100 });
        const data = res.data.data || res.data;
        setExpenses(Array.isArray(data) ? data : data.items || []);
      } catch {
        setExpenses([]);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, []);

  const draft = expenses.filter((e) => e.status === 'DRAFT').length;
  const submitted = expenses.filter((e) => e.status === 'SUBMITTED').length;
  const inReview = expenses.filter((e) => e.status === 'IN_REVIEW').length;
  const approved = expenses.filter((e) => e.status === 'APPROVED').length;
  const paid = expenses.filter((e) => e.status === 'PAID').length;
  const rejected = expenses.filter((e) => e.status === 'REJECTED').length;

  const totalAmount = expenses
    .filter((e) => ['APPROVED', 'PAID'].includes(e.status))
    .reduce((sum, e) => sum + e.amount, 0);

  // Recent expenses
  const recent = [...expenses]
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .slice(0, 5);

  return (
    <div className="p-6 space-y-6">
      {/* Welcome */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900">
          Good day, {user?.firstName}!
        </h1>
        <p className="mt-1 text-sm text-gray-500">
          Here's an overview of your expense activity.
        </p>
      </div>

      {/* Stats grid */}
      {!loading && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard
            title="Draft Expenses"
            value={draft}
            subtitle="Not yet submitted"
            color="text-gray-600"
            href="/dashboard/expenses"
            icon={
              <svg className="w-6 h-6 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
              </svg>
            }
          />
          <StatCard
            title="Pending Review"
            value={submitted + inReview}
            subtitle="Awaiting decisions"
            color="text-amber-600"
            href="/dashboard/expenses"
            icon={
              <svg className="w-6 h-6 text-amber-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            }
          />
          <StatCard
            title="Approved"
            value={approved + paid}
            subtitle={`${paid} paid`}
            color="text-green-600"
            href="/dashboard/expenses"
            icon={
              <svg className="w-6 h-6 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            }
          />
          <StatCard
            title="Total Approved"
            value={formatCurrency(totalAmount)}
            subtitle="Approved + paid"
            color="text-blue-600"
            icon={
              <svg className="w-6 h-6 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            }
          />
        </div>
      )}

      {/* Rejected banner */}
      {rejected > 0 && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4 flex items-center gap-3">
          <svg className="w-5 h-5 text-red-500 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
          </svg>
          <p className="text-sm text-red-700">
            You have <strong>{rejected}</strong> rejected expense{rejected !== 1 ? 's' : ''} that may need attention.
          </p>
          <Link href="/dashboard/expenses" className="ml-auto text-xs font-medium text-red-600 hover:text-red-800 underline">
            View
          </Link>
        </div>
      )}

      {/* Manager quick actions */}
      {hasRole('manager') && (
        <Card>
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-sm font-semibold text-gray-900">Approval Queue</h3>
              <p className="text-xs text-gray-500 mt-0.5">Expenses waiting for your approval</p>
            </div>
            <Link
              href="/dashboard/approvals"
              className="inline-flex items-center gap-1.5 px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors"
            >
              Review Now
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </Link>
          </div>
        </Card>
      )}

      {/* Recent expenses */}
      <Card>
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-semibold text-gray-900">Recent Expenses</h3>
          <Link href="/dashboard/expenses" className="text-xs text-blue-600 hover:text-blue-800 font-medium">
            View all
          </Link>
        </div>
        {loading ? (
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="animate-pulse flex items-center gap-3">
                <div className="h-8 w-8 bg-gray-200 rounded-lg" />
                <div className="flex-1 space-y-1.5">
                  <div className="h-3 bg-gray-200 rounded w-1/3" />
                  <div className="h-2.5 bg-gray-100 rounded w-1/4" />
                </div>
                <div className="h-5 w-16 bg-gray-200 rounded-full" />
              </div>
            ))}
          </div>
        ) : recent.length === 0 ? (
          <div className="text-center py-8">
            <svg className="w-10 h-10 text-gray-300 mx-auto mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            <p className="text-sm text-gray-400">No expenses yet</p>
            <Link href="/dashboard/expenses/new" className="mt-2 inline-block text-xs text-blue-600 hover:text-blue-800 font-medium">
              Create your first expense
            </Link>
          </div>
        ) : (
          <div className="space-y-1">
            {recent.map((expense) => (
              <Link
                key={expense.id}
                href={`/dashboard/expenses/${expense.id}`}
                className="flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-gray-50 transition-colors group"
              >
                <div className="w-8 h-8 rounded-lg bg-blue-50 flex items-center justify-center flex-shrink-0">
                  <svg className="w-4 h-4 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-900 truncate group-hover:text-blue-700 transition-colors">
                    {expense.title}
                  </p>
                  <p className="text-xs text-gray-400">{expense.categoryName}</p>
                </div>
                <div className="text-right flex-shrink-0">
                  <p className="text-sm font-semibold text-gray-900">{formatCurrency(expense.amount)}</p>
                  <Badge status={expense.status} />
                </div>
              </Link>
            ))}
          </div>
        )}
      </Card>

      {/* Quick actions */}
      <div className="flex gap-3">
        <Link
          href="/dashboard/expenses/new"
          className="flex-1 flex items-center justify-center gap-2 px-4 py-3 bg-blue-600 text-white text-sm font-medium rounded-xl hover:bg-blue-700 transition-colors shadow-sm shadow-blue-200"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          New Expense
        </Link>
        <Link
          href="/dashboard/expenses"
          className="flex-1 flex items-center justify-center gap-2 px-4 py-3 bg-white text-gray-700 text-sm font-medium rounded-xl hover:bg-gray-50 transition-colors border border-gray-200"
        >
          View All Expenses
        </Link>
      </div>
    </div>
  );
}
