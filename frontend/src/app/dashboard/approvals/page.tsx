'use client';

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { getExpenses, approveExpense, rejectExpense, sendBackExpense } from '@/lib/api';
import { getCurrentUser } from '@/lib/auth';
import { formatCurrency, formatDate } from '@/lib/utils';
import { Expense } from '@/types';
import Card from '@/components/ui/Card';
import Badge from '@/components/ui/Badge';
import Button from '@/components/ui/Button';
import Modal from '@/components/ui/Modal';
import Alert from '@/components/ui/Alert';
import { PageSpinner } from '@/components/ui/Spinner';

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
          <Button variant="secondary" onClick={onClose} disabled={loading}>Cancel</Button>
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

export default function ApprovalsPage() {
  const router = useRouter();
  const user = getCurrentUser();

  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [modal, setModal] = useState<'approve' | 'reject' | 'sendback' | null>(null);

  const fetchApprovals = async () => {
    setLoading(true);
    try {
      const res = await getExpenses({ status: 'IN_REVIEW' });
      const data = res.data.data || res.data;
      const items: Expense[] = Array.isArray(data) ? data : data.items || [];
      // Filter to expenses where current user is the active approver
      const mine = items.filter((e) => {
        const workflow = e.workflowInstance;
        if (!workflow) return false;
        const step = workflow.steps?.[workflow.currentStepIndex];
        return step?.approverId === user?.userId && step?.status === 'ACTIVE';
      });
      setExpenses(mine);
    } catch {
      setExpenses([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchApprovals();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const openModal = (id: string, type: 'approve' | 'reject' | 'sendback') => {
    setSelectedId(id);
    setModal(type);
  };

  const closeModal = () => {
    setSelectedId(null);
    setModal(null);
  };

  const handleAction = async (action: () => Promise<void>, msg: string) => {
    setActionLoading(true);
    setError('');
    setSuccess('');
    try {
      await action();
      setSuccess(msg);
      closeModal();
      await fetchApprovals();
    } catch (e: unknown) {
      const axiosErr = e as { response?: { data?: { message?: string } } };
      setError(axiosErr.response?.data?.message || 'Action failed.');
    } finally {
      setActionLoading(false);
    }
  };

  const handleApprove = (comment: string) => {
    if (!selectedId) return;
    handleAction(() => approveExpense(selectedId, comment).then(() => {}), 'Expense approved.');
  };

  const handleReject = (comment: string) => {
    if (!selectedId) return;
    handleAction(() => rejectExpense(selectedId, comment).then(() => {}), 'Expense rejected.');
  };

  const handleSendBack = (comment: string) => {
    if (!selectedId) return;
    handleAction(() => sendBackExpense(selectedId, comment).then(() => {}), 'Expense sent back.');
  };

  if (loading) return <PageSpinner />;

  return (
    <div className="p-6 space-y-5">
      <div>
        <h1 className="text-xl font-bold text-gray-900">Pending Approvals</h1>
        <p className="text-sm text-gray-500 mt-0.5">
          {expenses.length} expense{expenses.length !== 1 ? 's' : ''} awaiting your decision
        </p>
      </div>

      {error && <Alert variant="error" onClose={() => setError('')}>{error}</Alert>}
      {success && <Alert variant="success" onClose={() => setSuccess('')}>{success}</Alert>}

      {expenses.length === 0 ? (
        <Card>
          <div className="text-center py-12">
            <div className="w-14 h-14 rounded-2xl bg-green-50 flex items-center justify-center mx-auto mb-4">
              <svg className="w-7 h-7 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <h3 className="text-base font-semibold text-gray-900">All caught up!</h3>
            <p className="text-sm text-gray-500 mt-1">No expenses waiting for your approval.</p>
          </div>
        </Card>
      ) : (
        <div className="space-y-3">
          {expenses.map((expense) => {
            const workflow = expense.workflowInstance;
            const step = workflow?.steps?.[workflow.currentStepIndex ?? 0];

            return (
              <Card key={expense.id} className="hover:shadow-md transition-shadow">
                <div className="flex items-start gap-4">
                  {/* Icon */}
                  <div className="w-10 h-10 rounded-xl bg-amber-50 flex items-center justify-center flex-shrink-0">
                    <svg className="w-5 h-5 text-amber-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                  </div>

                  {/* Details */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2 flex-wrap">
                      <div>
                        <h3 className="text-sm font-semibold text-gray-900">{expense.title}</h3>
                        <p className="text-xs text-gray-500 mt-0.5">
                          {expense.submittedBy?.firstName} {expense.submittedBy?.lastName} &bull;{' '}
                          {expense.categoryName} &bull; {formatDate(expense.date)}
                        </p>
                      </div>
                      <div className="text-right flex-shrink-0">
                        <p className="text-lg font-bold text-gray-900">{formatCurrency(expense.amount, expense.currency)}</p>
                        <Badge status={expense.status} />
                      </div>
                    </div>

                    {/* Workflow info */}
                    {workflow && (
                      <div className="mt-2 flex items-center gap-2 text-xs text-gray-400">
                        <Badge variant={workflow.chainType === 'ELEVATED' ? 'orange' : 'blue'}>
                          {workflow.chainType}
                        </Badge>
                        <span>Step {(step?.stepIndex ?? 0) + 1} of {workflow.steps.length}</span>
                      </div>
                    )}

                    {/* Actions */}
                    <div className="flex items-center gap-2 mt-3 pt-3 border-t border-gray-100">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => router.push(`/dashboard/expenses/${expense.id}`)}
                      >
                        View Details
                      </Button>
                      <div className="ml-auto flex items-center gap-2">
                        <Button
                          variant="success"
                          size="sm"
                          onClick={() => openModal(expense.id, 'approve')}
                          disabled={actionLoading}
                        >
                          Approve
                        </Button>
                        <Button
                          variant="secondary"
                          size="sm"
                          onClick={() => openModal(expense.id, 'sendback')}
                          disabled={actionLoading}
                        >
                          Send Back
                        </Button>
                        <Button
                          variant="danger"
                          size="sm"
                          onClick={() => openModal(expense.id, 'reject')}
                          disabled={actionLoading}
                        >
                          Reject
                        </Button>
                      </div>
                    </div>
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      <CommentModal
        title="Approve Expense"
        isOpen={modal === 'approve'}
        onClose={closeModal}
        onConfirm={handleApprove}
        loading={actionLoading}
        required={false}
      />
      <CommentModal
        title="Reject Expense"
        isOpen={modal === 'reject'}
        onClose={closeModal}
        onConfirm={handleReject}
        loading={actionLoading}
        required={true}
      />
      <CommentModal
        title="Send Back for Revision"
        isOpen={modal === 'sendback'}
        onClose={closeModal}
        onConfirm={handleSendBack}
        loading={actionLoading}
        required={true}
      />
    </div>
  );
}
