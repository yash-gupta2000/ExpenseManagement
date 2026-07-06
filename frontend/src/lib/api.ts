import axios, { AxiosInstance, InternalAxiosRequestConfig, AxiosResponse } from 'axios';
import { getToken, removeToken } from './auth';

const api: AxiosInstance = axios.create({
  baseURL: process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000/api/v1',
  headers: {
    'Content-Type': 'application/json',
  },
});

// Request interceptor: attach token
api.interceptors.request.use(
  (config: InternalAxiosRequestConfig) => {
    const token = getToken();
    if (token && config.headers) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => Promise.reject(error)
);

// Response interceptor: handle 401
api.interceptors.response.use(
  (response: AxiosResponse) => response,
  (error) => {
    if (error.response?.status === 401) {
      removeToken();
      if (typeof window !== 'undefined') {
        window.location.href = '/login';
      }
    }
    return Promise.reject(error);
  }
);

// ─── Auth ──────────────────────────────────────────────────────────────────
export const login = (email: string, password: string, tenantId: string) =>
  api.post('/auth/login', { email, password, tenantId });

export const changePassword = (currentPassword: string, newPassword: string) =>
  api.post('/auth/change-password', { currentPassword, newPassword });

// ─── Expenses ──────────────────────────────────────────────────────────────
export const getExpenses = (params?: object) =>
  api.get('/expenses', { params });

export const getExpense = (id: string) =>
  api.get(`/expenses/${id}`);

export const createExpense = (data: object) =>
  api.post('/expenses', data);

export const updateExpense = (id: string, data: object) =>
  api.patch(`/expenses/${id}`, data);

export const submitExpense = (id: string) =>
  api.post(`/expenses/${id}/submit`);

export const withdrawExpense = (id: string) =>
  api.post(`/expenses/${id}/withdraw`);

export const markPaid = (id: string) =>
  api.post(`/expenses/${id}/mark-paid`);

export const approveExpense = (id: string, comment?: string) =>
  api.post(`/expenses/${id}/workflow/approve`, { comment });

export const rejectExpense = (id: string, comment: string) =>
  api.post(`/expenses/${id}/workflow/reject`, { comment });

export const sendBackExpense = (id: string, comment: string) =>
  api.post(`/expenses/${id}/workflow/send-back`, { comment });

export const getAuditLog = (id: string) =>
  api.get(`/expenses/${id}/audit`);

export const uploadReceipt = (file: File) => {
  const formData = new FormData();
  formData.append('receipt', file);
  return api.post('/receipts/upload', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
};

export const getReceipt = (id: string) =>
  api.get(`/receipts/${id}`, { responseType: 'blob' });

// ─── Categories ────────────────────────────────────────────────────────────
export const getCategories = (params?: object) =>
  api.get('/expense-categories', { params });

export const getCategory = (id: string) =>
  api.get(`/expense-categories/${id}`);

export const createCategory = (data: object) =>
  api.post('/expense-categories', data);

export const updateCategory = (id: string, data: object) =>
  api.patch(`/expense-categories/${id}`, data);

export const activateCategory = (id: string) =>
  api.post(`/expense-categories/${id}/activate`);

export const deactivateCategory = (id: string) =>
  api.post(`/expense-categories/${id}/deactivate`);

// ─── Users ─────────────────────────────────────────────────────────────────
export const getUsers = (params?: object) =>
  api.get('/users', { params });

export const getUser = (id: string) =>
  api.get(`/users/${id}`);

export const createUser = (data: object) =>
  api.post('/users', data);

export const updateUser = (id: string, data: object) =>
  api.patch(`/users/${id}`, data);

export const assignRoles = (id: string, roles: string[]) =>
  api.put(`/users/${id}/roles`, { roles });

export const activateUser = (id: string) =>
  api.post(`/users/${id}/activate`);

export const deactivateUser = (id: string) =>
  api.post(`/users/${id}/deactivate`);

// ─── Organization ──────────────────────────────────────────────────────────
export const getOrganization = () =>
  api.get('/organization');

export default api;
