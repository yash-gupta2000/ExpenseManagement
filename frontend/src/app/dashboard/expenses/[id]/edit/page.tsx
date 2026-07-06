'use client';

import React, { useEffect, useState, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { getExpense, updateExpense, getCategories, uploadReceipt } from '@/lib/api';
import { Expense, ExpenseCategory } from '@/types';
import { dollarsToCents, centsToDollars } from '@/lib/utils';
import Card from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import Select from '@/components/ui/Select';
import Alert from '@/components/ui/Alert';
import { PageSpinner } from '@/components/ui/Spinner';

export default function EditExpensePage() {
  const params = useParams();
  const router = useRouter();
  const id = params.id as string;

  const [expense, setExpense] = useState<Expense | null>(null);
  const [categories, setCategories] = useState<ExpenseCategory[]>([]);
  const [form, setForm] = useState({
    title: '',
    amount: '',
    currency: 'USD',
    date: '',
    categoryId: '',
    description: '',
  });
  const [receiptFile, setReceiptFile] = useState<File | null>(null);
  const [receiptPath, setReceiptPath] = useState<string | null>(null);
  const [uploadingReceipt, setUploadingReceipt] = useState(false);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const fetchData = useCallback(async () => {
    try {
      const [expRes, catRes] = await Promise.all([
        getExpense(id),
        getCategories({ isActive: true }),
      ]);
      const expData: Expense = expRes.data.data || expRes.data;
      const catData = catRes.data.data || catRes.data;

      setExpense(expData);
      setForm({
        title: expData.title,
        amount: centsToDollars(expData.amount),
        currency: expData.currency,
        date: expData.date.split('T')[0],
        categoryId: expData.categoryId,
        description: expData.description || '',
      });
      setReceiptPath(expData.receiptPath);
      setCategories(Array.isArray(catData) ? catData : catData.items || []);
    } catch {
      setError('Failed to load expense data.');
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  if (loading) return <PageSpinner />;
  if (!expense || expense.status !== 'DRAFT') {
    return (
      <div className="p-6">
        <Alert variant="error">This expense cannot be edited.</Alert>
      </div>
    );
  }

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    setForm({ ...form, [e.target.name]: e.target.value });
    setError('');
  };

  const handleReceiptChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setReceiptFile(file);
    setUploadingReceipt(true);
    try {
      const res = await uploadReceipt(file);
      const path = res.data.data?.filePath || res.data.filePath;
      setReceiptPath(path);
    } catch {
      setError('Failed to upload receipt.');
    } finally {
      setUploadingReceipt(false);
    }
  };

  const validate = () => {
    if (!form.title.trim()) return 'Title is required.';
    if (!form.amount || isNaN(parseFloat(form.amount)) || parseFloat(form.amount) <= 0)
      return 'A valid amount is required.';
    if (!form.date) return 'Date is required.';
    if (!form.categoryId) return 'Category is required.';
    return null;
  };

  const handleSave = async () => {
    const err = validate();
    if (err) { setError(err); return; }
    setSaving(true);
    try {
      await updateExpense(id, {
        title: form.title.trim(),
        amount: dollarsToCents(form.amount),
        currency: form.currency,
        date: form.date,
        categoryId: form.categoryId,
        description: form.description.trim(),
        ...(receiptPath ? { receiptPath } : {}),
      });
      router.push(`/dashboard/expenses/${id}`);
    } catch (e: unknown) {
      const axiosErr = e as { response?: { data?: { message?: string } } };
      setError(axiosErr.response?.data?.message || 'Failed to save changes.');
    } finally {
      setSaving(false);
    }
  };

  const categoryOptions = categories.map((c) => ({ value: c.id, label: c.name }));
  const currencyOptions = [
    { value: 'USD', label: 'USD — US Dollar' },
    { value: 'EUR', label: 'EUR — Euro' },
    { value: 'GBP', label: 'GBP — British Pound' },
    { value: 'CAD', label: 'CAD — Canadian Dollar' },
  ];

  return (
    <div className="p-6 max-w-2xl mx-auto space-y-5">
      <div className="flex items-center gap-3">
        <button
          onClick={() => router.back()}
          className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
        </button>
        <div>
          <h1 className="text-xl font-bold text-gray-900">Edit Expense</h1>
          <p className="text-sm text-gray-500">Editing draft expense</p>
        </div>
      </div>

      {error && <Alert variant="error" onClose={() => setError('')}>{error}</Alert>}

      <Card>
        <div className="space-y-5">
          <Input
            label="Title"
            name="title"
            value={form.title}
            onChange={handleChange}
            placeholder="Expense title"
          />
          <div className="grid grid-cols-2 gap-4">
            <Input
              label="Amount"
              name="amount"
              type="number"
              min="0.01"
              step="0.01"
              value={form.amount}
              onChange={handleChange}
              placeholder="0.00"
              helperText="Enter amount in dollars"
            />
            <Select
              label="Currency"
              name="currency"
              value={form.currency}
              onChange={handleChange}
              options={currencyOptions}
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <Input
              label="Date"
              name="date"
              type="date"
              value={form.date}
              onChange={handleChange}
            />
            <Select
              label="Category"
              name="categoryId"
              value={form.categoryId}
              onChange={handleChange}
              options={categoryOptions}
              placeholder="Select a category"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
            <textarea
              name="description"
              value={form.description}
              onChange={handleChange}
              rows={3}
              className="w-full px-3 py-2 text-sm bg-white border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 resize-none"
            />
          </div>
          {/* Receipt */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Receipt</label>
            <label className="flex items-center gap-3 px-4 py-3 border-2 border-dashed border-gray-200 rounded-lg cursor-pointer hover:border-blue-300 hover:bg-blue-50/30 transition-colors">
              <svg className="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
              </svg>
              <div>
                {uploadingReceipt ? (
                  <span className="text-sm text-blue-600 font-medium">Uploading...</span>
                ) : receiptPath ? (
                  <div>
                    <span className="text-sm text-green-600 font-medium">Receipt attached</span>
                    {receiptFile && <p className="text-xs text-gray-400 mt-0.5">{receiptFile.name}</p>}
                  </div>
                ) : (
                  <span className="text-sm text-gray-600">Replace or add receipt</span>
                )}
              </div>
              <input type="file" accept=".pdf,.png,.jpg,.jpeg" onChange={handleReceiptChange} className="hidden" />
            </label>
          </div>
        </div>
      </Card>

      <div className="flex items-center gap-3">
        <Button variant="secondary" onClick={() => router.back()} disabled={saving}>Cancel</Button>
        <Button variant="primary" onClick={handleSave} loading={saving} className="ml-auto">
          Save Changes
        </Button>
      </div>
    </div>
  );
}
