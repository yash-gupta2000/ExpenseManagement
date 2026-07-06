'use client';

import React, { useEffect, useState, useCallback } from 'react';
import { getCategories, createCategory, updateCategory, activateCategory, deactivateCategory, getUsers } from '@/lib/api';
import { ExpenseCategory, User } from '@/types';
import { formatCurrency } from '@/lib/utils';
import Card from '@/components/ui/Card';
import Badge from '@/components/ui/Badge';
import Button from '@/components/ui/Button';
import Modal from '@/components/ui/Modal';
import Input from '@/components/ui/Input';
import Select from '@/components/ui/Select';
import Alert from '@/components/ui/Alert';
import Table from '@/components/ui/Table';

const emptyForm = () => ({ name: '', amountThreshold: '', cfoId: '' });

export default function CategoriesPage() {
  const [categories, setCategories] = useState<ExpenseCategory[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<ExpenseCategory | null>(null);
  const [form, setForm] = useState(emptyForm());

  const fetchAll = useCallback(async () => {
    setLoading(true);
    try {
      const [catRes, userRes] = await Promise.all([getCategories(), getUsers()]);
      const cats = catRes.data.data || catRes.data;
      setCategories(Array.isArray(cats) ? cats : []);
      const us = userRes.data.data || userRes.data;
      setUsers(Array.isArray(us) ? us : []);
    } catch {
      setCategories([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  // Only orgAdmins can be CFO
  const cfoOptions = [
    { value: '', label: 'None (no CFO step for elevated)' },
    ...users
      .filter((u) => u.roles.includes('orgAdmin') && u.isActive)
      .map((u) => ({ value: u.id, label: `${u.firstName} ${u.lastName}` })),
  ];

  const getUserName = (id: string | null | undefined) => {
    if (!id) return '—';
    const u = users.find((u) => u.id === id);
    return u ? `${u.firstName} ${u.lastName}` : '—';
  };

  const openCreate = () => {
    setEditing(null);
    setForm(emptyForm());
    setError('');
    setModalOpen(true);
  };

  const openEdit = (cat: ExpenseCategory) => {
    setEditing(cat);
    setForm({
      name: cat.name,
      amountThreshold: String(cat.amountThreshold / 100),
      cfoId: (cat as unknown as { cfoId?: string }).cfoId || '',
    });
    setError('');
    setModalOpen(true);
  };

  const handleSave = async () => {
    if (!form.name.trim()) { setError('Name is required.'); return; }
    setActionLoading(true);
    setError('');
    try {
      const payload = {
        name: form.name.trim(),
        amountThreshold: Math.round(parseFloat(form.amountThreshold || '0') * 100),
        cfoId: form.cfoId || null,
      };
      if (editing) {
        await updateCategory(editing.id, payload);
        setSuccess('Category updated.');
      } else {
        await createCategory(payload);
        setSuccess('Category created.');
      }
      setModalOpen(false);
      await fetchAll();
    } catch (e: unknown) {
      const axiosErr = e as { response?: { data?: { message?: string } } };
      setError(axiosErr.response?.data?.message || 'Failed to save category.');
    } finally {
      setActionLoading(false);
    }
  };

  const handleToggle = async (cat: ExpenseCategory) => {
    setActionLoading(true);
    try {
      cat.isActive ? await deactivateCategory(cat.id) : await activateCategory(cat.id);
      await fetchAll();
    } catch {
      setError('Failed to update category.');
    } finally {
      setActionLoading(false);
    }
  };

  const columns = [
    {
      key: 'name',
      header: 'Category',
      render: (row: ExpenseCategory) => (
        <span className="font-medium text-gray-900">{row.name}</span>
      ),
    },
    {
      key: 'threshold',
      header: 'Threshold',
      render: (row: ExpenseCategory) => (
        <div>
          <span className="text-sm font-medium text-gray-700">{formatCurrency(row.amountThreshold)}</span>
        </div>
      ),
    },
    {
      key: 'chain',
      header: 'Approval Chain',
      render: () => (
        <div className="flex items-center gap-1.5 text-xs text-gray-500">
          <span className="bg-gray-100 px-2 py-0.5 rounded">Manager(s)</span>
          <span>→</span>
          <span className="bg-blue-50 text-blue-600 px-2 py-0.5 rounded">Finance Admin</span>
          <span className="text-gray-300">/ elevated adds CFO</span>
        </div>
      ),
    },
    {
      key: 'cfo',
      header: 'CFO (elevated)',
      render: (row: ExpenseCategory) => (
        <span className="text-sm text-gray-600">
          {getUserName((row as unknown as { cfoId?: string }).cfoId)}
        </span>
      ),
    },
    {
      key: 'isActive',
      header: 'Status',
      render: (row: ExpenseCategory) => (
        <Badge variant={row.isActive ? 'green' : 'gray'}>{row.isActive ? 'Active' : 'Inactive'}</Badge>
      ),
    },
    {
      key: 'actions',
      header: '',
      render: (row: ExpenseCategory) => (
        <div className="flex items-center gap-2 justify-end">
          <Button variant="ghost" size="sm" onClick={(e) => { e.stopPropagation(); openEdit(row); }}>Edit</Button>
          <Button
            variant={row.isActive ? 'secondary' : 'success'}
            size="sm"
            onClick={(e) => { e.stopPropagation(); handleToggle(row); }}
            disabled={actionLoading}
          >
            {row.isActive ? 'Deactivate' : 'Activate'}
          </Button>
        </div>
      ),
      className: 'text-right',
    },
  ];

  return (
    <div className="p-6 space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Expense Categories</h1>
          <p className="text-sm text-gray-500 mt-0.5">{categories.length} categories</p>
        </div>
        <Button variant="primary" size="sm" onClick={openCreate}>
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          New Category
        </Button>
      </div>

      {/* How chains work */}
      <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 text-sm text-blue-800">
        <p className="font-semibold mb-1">How approval chains work</p>
        <p className="text-blue-700">
          Chains are built automatically from each employee&apos;s reporting line.
          When an expense is submitted, the system walks up the org hierarchy (Manager → VP → …),
          then appends <strong>Finance Admin</strong> as the final approver.
          For <strong>elevated</strong> expenses (above the threshold), the CFO is added after Finance Admin.
          No manual chain config needed — just set the threshold and optionally pick a CFO.
        </p>
      </div>

      {error && <Alert variant="error" onClose={() => setError('')}>{error}</Alert>}
      {success && <Alert variant="success" onClose={() => setSuccess('')}>{success}</Alert>}

      <Card padding="none">
        <Table columns={columns} data={categories} keyExtractor={(row) => row.id} loading={loading} emptyMessage="No categories yet" />
      </Card>

      {/* Create/Edit Modal */}
      <Modal isOpen={modalOpen} onClose={() => setModalOpen(false)} title={editing ? 'Edit Category' : 'New Category'}>
        <div className="space-y-5">
          {error && <Alert variant="error" onClose={() => setError('')}>{error}</Alert>}

          <Input
            label="Category Name"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            placeholder="e.g. Travel, Software, Meals"
          />

          <Input
            label="Amount Threshold ($)"
            type="number"
            min="0"
            step="1"
            value={form.amountThreshold}
            onChange={(e) => setForm({ ...form, amountThreshold: e.target.value })}
            placeholder="500"
            helperText="Expenses above this amount trigger the elevated chain (adds CFO approval)."
          />

          <Select
            label="CFO for Elevated Approvals"
            value={form.cfoId}
            onChange={(e) => setForm({ ...form, cfoId: e.target.value })}
            options={cfoOptions}
            helperText="This person is added as the final approver only when the expense exceeds the threshold."
          />

          <div className="bg-gray-50 rounded-lg p-3 text-xs text-gray-500 space-y-1">
            <p className="font-medium text-gray-600">Chain preview (auto-built per employee)</p>
            <p>Standard: Manager(s) up the hierarchy → Finance Admin</p>
            <p>Elevated: Manager(s) up the hierarchy → Finance Admin → {form.cfoId ? getUserName(form.cfoId) : 'CFO (if set)'}</p>
          </div>

          <div className="flex justify-end gap-3 pt-2 border-t border-gray-100">
            <Button variant="secondary" onClick={() => setModalOpen(false)} disabled={actionLoading}>Cancel</Button>
            <Button variant="primary" onClick={handleSave} loading={actionLoading}>
              {editing ? 'Save Changes' : 'Create Category'}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
