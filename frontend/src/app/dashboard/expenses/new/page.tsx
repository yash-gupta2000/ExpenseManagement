'use client';

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createExpense, submitExpense, getCategories, uploadReceipt } from '@/lib/api';
import { ExpenseCategory } from '@/types';
import { dollarsToCents } from '@/lib/utils';
import Card from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import Select from '@/components/ui/Select';
import Alert from '@/components/ui/Alert';

export default function NewExpensePage() {
  const router = useRouter();
  const [categories, setCategories] = useState<ExpenseCategory[]>([]);
  const [form, setForm] = useState({
    title: '',
    amount: '',
    currency: 'USD',
    date: new Date().toISOString().split('T')[0],
    categoryId: '',
    description: '',
  });
  const [receiptFile, setReceiptFile] = useState<File | null>(null);
  const [receiptPath, setReceiptPath] = useState<string | null>(null);
  const [uploadingReceipt, setUploadingReceipt] = useState(false);
  const [savingDraft, setSavingDraft] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    const fetchCategories = async () => {
      try {
        const res = await getCategories({ isActive: true });
        const data = res.data.data || res.data;
        setCategories(Array.isArray(data) ? data : data.items || []);
      } catch {
        setCategories([]);
      }
    };
    fetchCategories();
  }, []);

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
      setError('Failed to upload receipt. Please try again.');
    } finally {
      setUploadingReceipt(false);
    }
  };

  const buildPayload = () => ({
    title: form.title.trim(),
    amount: dollarsToCents(form.amount),
    currency: form.currency,
    date: form.date,
    categoryId: form.categoryId,
    description: form.description.trim(),
    ...(receiptPath ? { receiptPath } : {}),
  });

  const validate = () => {
    if (!form.title.trim()) return 'Title is required.';
    if (!form.amount || isNaN(parseFloat(form.amount)) || parseFloat(form.amount) <= 0)
      return 'A valid amount is required.';
    if (!form.date) return 'Date is required.';
    if (!form.categoryId) return 'Category is required.';
    return null;
  };

  const handleSaveDraft = async () => {
    const err = validate();
    if (err) { setError(err); return; }
    setSavingDraft(true);
    try {
      const res = await createExpense(buildPayload());
      const id = res.data.data?.id || res.data.id;
      router.push(`/dashboard/expenses/${id}`);
    } catch (e: unknown) {
      const axiosErr = e as { response?: { data?: unknown } };
      const d = axiosErr.response?.data as { error?: { message?: string }; message?: string } | undefined;
      setError(d?.error?.message || d?.message || 'Failed to save draft.');
    } finally {
      setSavingDraft(false);
    }
  };

  const handleSubmit = async () => {
    const err = validate();
    if (err) { setError(err); return; }
    setSubmitting(true);
    try {
      const createRes = await createExpense(buildPayload());
      const id = createRes.data.data?.id || createRes.data.id;
      await submitExpense(id);
      router.push(`/dashboard/expenses/${id}`);
    } catch (e: unknown) {
      const axiosErr = e as { response?: { data?: unknown } };
      const d = axiosErr.response?.data as { error?: { message?: string }; message?: string } | undefined;
      setError(d?.error?.message || d?.message || 'Failed to submit expense.');
    } finally {
      setSubmitting(false);
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
      {/* Header */}
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
          <h1 className="text-xl font-bold text-gray-900">New Expense</h1>
          <p className="text-sm text-gray-500">Fill in the details below</p>
        </div>
      </div>

      {error && (
        <Alert variant="error" onClose={() => setError('')}>
          {error}
        </Alert>
      )}

      <Card>
        <div className="space-y-5">
          <Input
            label="Title"
            name="title"
            value={form.title}
            onChange={handleChange}
            placeholder="e.g. Team lunch, Flight to NYC"
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
              placeholder="Optional: add context or notes..."
              rows={3}
              className="w-full px-3 py-2 text-sm bg-white border border-gray-300 rounded-lg text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors resize-none"
            />
          </div>

          {/* Receipt upload */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Receipt</label>
            <div className="relative">
              <label className="flex items-center gap-3 px-4 py-3 border-2 border-dashed border-gray-200 rounded-lg cursor-pointer hover:border-blue-300 hover:bg-blue-50/30 transition-colors">
                <svg className="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                </svg>
                <div>
                  {uploadingReceipt ? (
                    <span className="text-sm text-blue-600 font-medium">Uploading...</span>
                  ) : receiptPath ? (
                    <div>
                      <span className="text-sm text-green-600 font-medium">Receipt uploaded</span>
                      <p className="text-xs text-gray-400 mt-0.5">{receiptFile?.name}</p>
                    </div>
                  ) : (
                    <div>
                      <span className="text-sm text-gray-600">Upload receipt</span>
                      <p className="text-xs text-gray-400 mt-0.5">PDF, PNG, JPG up to 10MB</p>
                    </div>
                  )}
                </div>
                <input
                  type="file"
                  accept=".pdf,.png,.jpg,.jpeg"
                  onChange={handleReceiptChange}
                  className="hidden"
                />
              </label>
            </div>
          </div>
        </div>
      </Card>

      {/* Actions */}
      <div className="flex items-center gap-3 pt-2">
        <Button
          variant="secondary"
          onClick={() => router.back()}
          disabled={savingDraft || submitting}
        >
          Cancel
        </Button>
        <div className="ml-auto flex items-center gap-3">
          <Button
            variant="secondary"
            onClick={handleSaveDraft}
            loading={savingDraft}
            disabled={submitting}
          >
            Save as Draft
          </Button>
          <Button
            variant="primary"
            onClick={handleSubmit}
            loading={submitting}
            disabled={savingDraft}
          >
            Save & Submit
          </Button>
        </div>
      </div>
    </div>
  );
}
