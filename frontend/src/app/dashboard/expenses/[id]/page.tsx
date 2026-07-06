'use client';

import React, { useEffect, useState, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  getExpense,
  submitExpense,
  withdrawExpense,
  approveExpense,
  rejectExpense,
  sendBackExpense,
  markPaid,
  getAuditLog,
} from '@/lib/api';
import { getCurrentUser, hasRole } from '@/lib/auth';
import { formatCurrency, formatDate, formatDateTime, formatStatus } from '@/lib/utils';
import { Expense, AuditEntry, WorkflowStep } from '@/types';
import Card from '@/components/ui/Card';
import Badge from '@/components/ui/Badge';
import Button from '@/components/ui/Button';
import Modal from '@/components/ui/Modal';
import Alert from '@/components/ui/Alert';
import { PageSpinner } from '@/components/ui/Spinner';

// Workflow step status icons
function StepStatusIcon({ status }: { status: WorkflowStep['status'] }) {
  if (status === 'APPROVED') {
    return (
      <div className="w-8 h-8 rounded-full bg-green-100 flex items-center justify-center flex-shrink-0">
        <svg className="w-4 h-4 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
        </svg>
      </div>
    );
  }
  if (status === 'REJECTED') {
    return (
      <div className="w-8 h-8 rounded-full bg-red-100 flex items-center justify-center flex-shrink-0">
        <svg className="w-4 h-4 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" />
        </svg>
      </div>
    );
  }
  if (status === 'ACTIVE') {
    return (
      <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center flex-shrink-0 ring-2 ring-blue-300 ring-offset-1">
        <div className="w-3 h-3 rounded-full bg-blue-600 animate-pulse" />
      </div>
    );
  }
  if (status === 'SKIPPED') {
    return (
      <div className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center flex-shrink-0">
        <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 5l7 7-7 7M5 5l7 7-7 7" />
        </svg>
      </div>
    );
  }
  // PENDING
  return (
    <div className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center flex-shrink-0 border border-gray-300">
      <div className="w-2.5 h-2.5 rounded-full bg-gray-300" />
    </div>
  );
}

interface CommentModalProps {
  title: string;
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (comment: string) => void;
  loading: boolean;
  required?: boolean;
}

function CommentModal({ title, isOpen, onClose, onConfirm, loading, required = true }: CommentModalProps) {
  const [comment, setComment] = useState('');
  return (
    <Modal isOpen={isOpen} onClose={onClose} title={title}>
      <div className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Comment {required && <span className="text-red-500">*</span>}
          </label>
          <textarea
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            placeholder="Add a comment..."
            rows={4}
            className="w-full px-3 py-2 text-sm bg-white border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 resize-none"
          />
        </div>
        <div className="flex justify-end gap-3">
          <Button variant="secondary" onClick={onClose} disabled={loading}>
            Cancel
          </Button>
          <Button
            variant="primary"
            onClick={() => { onConfirm(comment); setComment(''); }}
            loading={loading}
            disabled={required && !comment.trim()}
          >
            Confirm
          </Button>
        </div>
      </div>
    </Modal>
  );
}

export default function ExpenseDetailPage() {
  const params = useParams();
  const router = useRouter();
  const id = params.id as string;
  const user = getCurrentUser();

  const [expense, setExpense] = useState<Expense | null>(null);
  const [auditLog, setAuditLog] = useState<AuditEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const [modal, setModal] = useState<'reject' | 'sendback' | 'approve' | null>(null);

  const fetchExpense = useCallback(async () => {
    try {
      const res = await getExpense(id);
      const data = res.data.data || res.data;
      setExpense(data);
    } catch {
      setError('Failed to load expense.');
    } finally {
      setLoading(false);
    }
  }, [id]);

  const fetchAudit = useCallback(async () => {
    if (!hasRole('financeAdmin') && !hasRole('orgAdmin')) return;
    try {
      const res = await getAuditLog(id);
      const data = res.data.data || res.data;
      setAuditLog(Array.isArray(data) ? data : data.items || []);
    } catch {
      setAuditLog([]);
    }
  }, [id]);

  useEffect(() => {
    fetchExpense();
    fetchAudit();
  }, [fetchExpense, fetchAudit]);

  const handleAction = async (action: () => Promise<void>, successMsg: string) => {
    setActionLoading(true);
    setError('');
    setSuccess('');
    try {
      await action();
      setSuccess(successMsg);
      await fetchExpense();
      await fetchAudit();
    } catch (e: unknown) {
      const axiosErr = e as { response?: { data?: { message?: string } } };
      setError(axiosErr.response?.data?.message || 'Action failed. Please try again.');
    } finally {
      setActionLoading(false);
    }
  };

  const handleSubmit = () =>
    handleAction(() => submitExpense(id).then(() => {}), 'Expense submitted successfully.');
  const handleWithdraw = () =>
    handleAction(() => withdrawExpense(id).then(() => {}), 'Expense withdrawn.');
  const handleMarkPaid = () =>
    handleAction(() => markPaid(id).then(() => {}), 'Expense marked as paid.');

  const handleApprove = (comment: string) => {
    handleAction(() => approveExpense(id, comment).then(() => {}), 'Expense approved.');
    setModal(null);
  };

  const handleReject = (comment: string) => {
    handleAction(() => rejectExpense(id, comment).then(() => {}), 'Expense rejected.');
    setModal(null);
  };

  const handleSendBack = (comment: string) => {
    handleAction(() => sendBackExpense(id, comment).then(() => {}), 'Expense sent back for revision.');
    setModal(null);
  };

  if (loading) return <PageSpinner />;
  if (!expense) return (
    <div className="p-6">
      <Alert variant="error">Expense not found.</Alert>
    </div>
  );

  const isOwn = expense.submittedBy?.id === user?.userId;
  const workflow = expense.workflowInstance;
  const currentStep = workflow?.steps?.[workflow.currentStepIndex];
  const isActiveApprover =
    expense.status === 'IN_REVIEW' &&
    currentStep?.approverId === user?.userId &&
    currentStep?.status === 'ACTIVE';

  const canApprove = isActiveApprover || (hasRole('financeAdmin') && expense.status === 'IN_REVIEW');

  return (
    <div className="p-6 max-w-3xl mx-auto space-y-5">
      {/* Back + Header */}
      <div className="flex items-start gap-3">
        <button
          onClick={() => router.back()}
          className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors mt-0.5"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
        </button>
        <div className="flex-1">
          <div className="flex items-center gap-3 flex-wrap">
            <h1 className="text-xl font-bold text-gray-900">{expense.title}</h1>
            <Badge status={expense.status} />
          </div>
          <p className="text-sm text-gray-500 mt-0.5">
            {expense.categoryName} &bull; Submitted by {expense.submittedBy?.firstName} {expense.submittedBy?.lastName}
          </p>
        </div>
      </div>

      {error && <Alert variant="error" onClose={() => setError('')}>{error}</Alert>}
      {success && <Alert variant="success" onClose={() => setSuccess('')}>{success}</Alert>}

      {/* Main details */}
      <Card>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-5">
          <div>
            <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Amount</p>
            <p className="text-2xl font-bold text-gray-900 mt-1">{formatCurrency(expense.amount, expense.currency)}</p>
          </div>
          <div>
            <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Date</p>
            <p className="text-sm font-medium text-gray-900 mt-1">{formatDate(expense.date)}</p>
          </div>
          <div>
            <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Category</p>
            <p className="text-sm font-medium text-gray-900 mt-1">{expense.categoryName}</p>
          </div>
          <div>
            <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Currency</p>
            <p className="text-sm font-medium text-gray-900 mt-1">{expense.currency}</p>
          </div>
          <div>
            <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Created</p>
            <p className="text-sm font-medium text-gray-900 mt-1">{formatDateTime(expense.createdAt)}</p>
          </div>
          <div>
            <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Last Updated</p>
            <p className="text-sm font-medium text-gray-900 mt-1">{formatDateTime(expense.updatedAt)}</p>
          </div>
        </div>

        {expense.description && (
          <div className="mt-5 pt-5 border-t border-gray-100">
            <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">Description</p>
            <p className="text-sm text-gray-700 leading-relaxed">{expense.description}</p>
          </div>
        )}

        {expense.receiptPath && (
          <div className="mt-4">
            <a
              href={`${process.env.NEXT_PUBLIC_API_URL}/receipts/${expense.receiptPath}`}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-2 text-sm text-blue-600 hover:text-blue-800 font-medium"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" />
              </svg>
              Download Receipt
            </a>
          </div>
        )}
      </Card>

      {/* Actions */}
      <div className="flex flex-wrap gap-3">
        {expense.status === 'DRAFT' && isOwn && (
          <>
            <Link href={`/dashboard/expenses/${expense.id}/edit`}>
              <Button variant="secondary" disabled={actionLoading}>
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                </svg>
                Edit
              </Button>
            </Link>
            <Button variant="primary" onClick={handleSubmit} loading={actionLoading}>
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
              </svg>
              Submit
            </Button>
          </>
        )}

        {expense.status === 'SUBMITTED' && isOwn && (
          <Button variant="secondary" onClick={handleWithdraw} loading={actionLoading}>
            Withdraw
          </Button>
        )}

        {expense.status === 'IN_REVIEW' && canApprove && (
          <>
            <Button variant="success" onClick={() => setModal('approve')} disabled={actionLoading}>
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
              Approve
            </Button>
            <Button variant="secondary" onClick={() => setModal('sendback')} disabled={actionLoading}>
              Send Back
            </Button>
            <Button variant="danger" onClick={() => setModal('reject')} disabled={actionLoading}>
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
              Reject
            </Button>
          </>
        )}

        {expense.status === 'APPROVED' && hasRole('financeAdmin') && (
          <Button variant="success" onClick={handleMarkPaid} loading={actionLoading}>
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z" />
            </svg>
            Mark as Paid
          </Button>
        )}
      </div>

      {/* Workflow timeline */}
      {workflow && (
        <Card>
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-semibold text-gray-900">Approval Workflow</h3>
            <div className="flex items-center gap-2">
              <Badge
                variant={workflow.chainType === 'ELEVATED' ? 'orange' : 'blue'}
              >
                {workflow.chainType} CHAIN
              </Badge>
              <Badge status={workflow.status} />
            </div>
          </div>

          <div className="relative">
            {/* Vertical line */}
            {workflow.steps.length > 1 && (
              <div className="absolute left-4 top-8 bottom-8 w-px bg-gray-200" />
            )}

            <div className="space-y-4">
              {workflow.steps.map((step, idx) => (
                <div key={idx} className="flex gap-4 relative">
                  <StepStatusIcon status={step.status} />
                  <div className="flex-1 pb-4 border-b border-gray-100 last:border-0">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-sm font-medium text-gray-900">
                          Step {step.stepIndex + 1}: {step.approverName}
                        </p>
                        {step.comment && (
                          <p className="text-xs text-gray-500 mt-1 italic">"{step.comment}"</p>
                        )}
                        {step.decidedAt && (
                          <p className="text-xs text-gray-400 mt-1">{formatDateTime(step.decidedAt)}</p>
                        )}
                      </div>
                      <Badge status={step.status} />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </Card>
      )}

      {/* Audit log */}
      {(hasRole('financeAdmin') || hasRole('orgAdmin')) && auditLog.length > 0 && (
        <Card>
          <h3 className="text-sm font-semibold text-gray-900 mb-4">Audit Log</h3>
          <div className="space-y-3">
            {auditLog.map((entry) => (
              <div key={entry.id} className="flex gap-3 items-start">
                <div className="w-2 h-2 rounded-full bg-blue-300 mt-2 flex-shrink-0" />
                <div className="flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-xs font-semibold text-gray-700">
                      {entry.actor?.firstName} {entry.actor?.lastName}
                    </span>
                    <span className="text-xs font-medium text-gray-900 bg-gray-100 px-2 py-0.5 rounded">
                      {formatStatus(entry.action)}
                    </span>
                    <span className="text-xs text-gray-400">{formatDateTime(entry.timestamp)}</span>
                  </div>
                  {entry.comment && (
                    <p className="text-xs text-gray-500 mt-1 italic">"{entry.comment}"</p>
                  )}
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* Action Modals */}
      <CommentModal
        title="Approve Expense"
        isOpen={modal === 'approve'}
        onClose={() => setModal(null)}
        onConfirm={handleApprove}
        loading={actionLoading}
        required={false}
      />
      <CommentModal
        title="Reject Expense"
        isOpen={modal === 'reject'}
        onClose={() => setModal(null)}
        onConfirm={handleReject}
        loading={actionLoading}
        required={true}
      />
      <CommentModal
        title="Send Back for Revision"
        isOpen={modal === 'sendback'}
        onClose={() => setModal(null)}
        onConfirm={handleSendBack}
        loading={actionLoading}
        required={true}
      />
    </div>
  );
}
