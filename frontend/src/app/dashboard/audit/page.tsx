'use client';

import React, { useState, useCallback } from 'react';
import { getAuditLog } from '@/lib/api';
import { AuditEntry } from '@/types';
import { formatDateTime, formatStatus } from '@/lib/utils';
import Card from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import Alert from '@/components/ui/Alert';

export default function AuditPage() {
  const [expenseId, setExpenseId] = useState('');
  const [entries, setEntries] = useState<AuditEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [searched, setSearched] = useState(false);

  const handleSearch = useCallback(async () => {
    if (!expenseId.trim()) {
      setError('Please enter an expense ID.');
      return;
    }
    setLoading(true);
    setError('');
    setSearched(true);
    try {
      const res = await getAuditLog(expenseId.trim());
      const data = res.data.data || res.data;
      setEntries(Array.isArray(data) ? data : data.items || []);
    } catch (e: unknown) {
      const axiosErr = e as { response?: { data?: { message?: string } } };
      setError(axiosErr.response?.data?.message || 'Failed to load audit log.');
      setEntries([]);
    } finally {
      setLoading(false);
    }
  }, [expenseId]);

  const actionColorMap: Record<string, string> = {
    CREATED: 'bg-blue-100 text-blue-700',
    SUBMITTED: 'bg-blue-100 text-blue-700',
    APPROVED: 'bg-green-100 text-green-700',
    REJECTED: 'bg-red-100 text-red-700',
    SEND_BACK: 'bg-amber-100 text-amber-700',
    RETURNED: 'bg-amber-100 text-amber-700',
    WITHDRAWN: 'bg-gray-100 text-gray-700',
    PAID: 'bg-purple-100 text-purple-700',
    UPDATED: 'bg-gray-100 text-gray-600',
  };

  return (
    <div className="p-6 space-y-5">
      <div>
        <h1 className="text-xl font-bold text-gray-900">Audit Log</h1>
        <p className="text-sm text-gray-500 mt-0.5">Search the complete action history for any expense.</p>
      </div>

      {/* Search */}
      <Card>
        <div className="flex gap-3">
          <div className="flex-1">
            <Input
              placeholder="Enter expense ID..."
              value={expenseId}
              onChange={(e) => { setExpenseId(e.target.value); setError(''); }}
              onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
            />
          </div>
          <Button
            variant="primary"
            onClick={handleSearch}
            loading={loading}
            className="flex-shrink-0"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            Search
          </Button>
        </div>
        {error && <Alert variant="error" className="mt-3" onClose={() => setError('')}>{error}</Alert>}
      </Card>

      {/* Results */}
      {searched && !loading && (
        <Card>
          <h3 className="text-sm font-semibold text-gray-900 mb-4">
            {entries.length > 0
              ? `${entries.length} audit entr${entries.length !== 1 ? 'ies' : 'y'} for expense ${expenseId}`
              : 'No audit entries found'}
          </h3>

          {entries.length > 0 && (
            <div className="relative">
              {/* Timeline line */}
              <div className="absolute left-4 top-4 bottom-4 w-px bg-gray-200" />

              <div className="space-y-4">
                {entries.map((entry, idx) => {
                  const actionKey = entry.action.toUpperCase().replace(/[^A-Z_]/g, '_');
                  const colorClass = actionColorMap[actionKey] || 'bg-gray-100 text-gray-700';

                  return (
                    <div key={entry.id || idx} className="flex gap-4 relative">
                      <div className="w-8 h-8 rounded-full bg-white border-2 border-gray-200 flex items-center justify-center flex-shrink-0 z-10">
                        <div className="w-2.5 h-2.5 rounded-full bg-blue-400" />
                      </div>
                      <div className="flex-1 pb-4 border-b border-gray-100 last:border-0">
                        <div className="flex items-start justify-between gap-3 flex-wrap">
                          <div>
                            <div className="flex items-center gap-2 flex-wrap mb-1">
                              <span className="text-sm font-semibold text-gray-900">
                                {entry.actor?.firstName} {entry.actor?.lastName}
                              </span>
                              <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${colorClass}`}>
                                {formatStatus(entry.action)}
                              </span>
                              {entry.stepIndex !== null && entry.stepIndex !== undefined && (
                                <span className="text-xs text-gray-400">Step {entry.stepIndex + 1}</span>
                              )}
                            </div>
                            {entry.comment && (
                              <p className="text-sm text-gray-600 italic mt-1 bg-gray-50 rounded px-3 py-2 border-l-2 border-gray-200">
                                "{entry.comment}"
                              </p>
                            )}
                          </div>
                          <span className="text-xs text-gray-400 flex-shrink-0">
                            {formatDateTime(entry.timestamp)}
                          </span>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </Card>
      )}

      {!searched && (
        <Card>
          <div className="text-center py-10">
            <div className="w-14 h-14 rounded-2xl bg-gray-50 flex items-center justify-center mx-auto mb-4">
              <svg className="w-7 h-7 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
              </svg>
            </div>
            <p className="text-sm text-gray-400">Enter an expense ID above to view its full audit trail.</p>
          </div>
        </Card>
      )}
    </div>
  );
}
