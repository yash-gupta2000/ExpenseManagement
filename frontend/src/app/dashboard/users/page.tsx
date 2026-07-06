'use client';

import React, { useEffect, useState, useCallback } from 'react';
import { getUsers, createUser, assignRoles, activateUser, deactivateUser, updateUser } from '@/lib/api';
import { User } from '@/types';
import Card from '@/components/ui/Card';
import Badge from '@/components/ui/Badge';
import Button from '@/components/ui/Button';
import Modal from '@/components/ui/Modal';
import Input from '@/components/ui/Input';
import Select from '@/components/ui/Select';
import Alert from '@/components/ui/Alert';
import Table from '@/components/ui/Table';

const ALL_ROLES = ['employee', 'manager', 'financeAdmin', 'orgAdmin'];

const ROLE_LABELS: Record<string, string> = {
  employee: 'Employee',
  manager: 'Manager',
  financeAdmin: 'Finance Admin',
  orgAdmin: 'Org Admin',
};

export default function UsersPage() {
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const [createOpen, setCreateOpen] = useState(false);
  const [rolesOpen, setRolesOpen] = useState(false);
  const [editManagerOpen, setEditManagerOpen] = useState(false);
  const [selectedUser, setSelectedUser] = useState<User | null>(null);

  const [createForm, setCreateForm] = useState({
    email: '',
    firstName: '',
    lastName: '',
    department: '',
    password: '',
    managerId: '',
    roles: ['employee'],
  });

  const [rolesForm, setRolesForm] = useState<{ roles: string[] }>({ roles: [] });
  const [newManagerId, setNewManagerId] = useState('');

  const fetchUsers = useCallback(async () => {
    setLoading(true);
    try {
      const res = await getUsers();
      const data = res.data.data || res.data;
      setUsers(Array.isArray(data) ? data : data.items || []);
    } catch {
      setUsers([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchUsers(); }, [fetchUsers]);

  // Only managers and orgAdmins can be assigned as a manager (not financeAdmin, not the user themselves)
  const managerOptions = [
    { value: '', label: 'No manager (top of hierarchy)' },
    ...users
      .filter((u) => u.roles.includes('manager') || u.roles.includes('orgAdmin'))
      .map((u) => ({ value: u.id, label: `${u.firstName} ${u.lastName} (${u.roles.join(', ')})` })),
  ];

  const getUserName = (id: string | null) => {
    if (!id) return '—';
    const u = users.find((u) => u.id === id);
    return u ? `${u.firstName} ${u.lastName}` : '—';
  };

  const handleCreate = async () => {
    if (!createForm.email || !createForm.firstName || !createForm.lastName || !createForm.password) {
      setError('Email, name, and password are required.');
      return;
    }
    setActionLoading(true);
    setError('');
    try {
      await createUser({
        ...createForm,
        managerId: createForm.managerId || null,
      });
      setSuccess('User created successfully.');
      setCreateOpen(false);
      setCreateForm({ email: '', firstName: '', lastName: '', department: '', password: '', managerId: '', roles: ['employee'] });
      await fetchUsers();
    } catch (e: unknown) {
      const axiosErr = e as { response?: { data?: { message?: string } } };
      setError(axiosErr.response?.data?.message || 'Failed to create user.');
    } finally {
      setActionLoading(false);
    }
  };

  const handleAssignRoles = async () => {
    if (!selectedUser) return;
    setActionLoading(true);
    setError('');
    try {
      await assignRoles(selectedUser.id, rolesForm.roles);
      setSuccess('Roles updated.');
      setRolesOpen(false);
      await fetchUsers();
    } catch (e: unknown) {
      const axiosErr = e as { response?: { data?: { message?: string } } };
      setError(axiosErr.response?.data?.message || 'Failed to update roles.');
    } finally {
      setActionLoading(false);
    }
  };

  const handleUpdateManager = async () => {
    if (!selectedUser) return;
    setActionLoading(true);
    setError('');
    try {
      await updateUser(selectedUser.id, { managerId: newManagerId || null });
      setSuccess('Manager updated.');
      setEditManagerOpen(false);
      await fetchUsers();
    } catch (e: unknown) {
      const axiosErr = e as { response?: { data?: { message?: string } } };
      setError(axiosErr.response?.data?.message || 'Failed to update manager.');
    } finally {
      setActionLoading(false);
    }
  };

  const handleToggleActive = async (user: User) => {
    setActionLoading(true);
    try {
      user.isActive ? await deactivateUser(user.id) : await activateUser(user.id);
      await fetchUsers();
    } catch {
      setError('Failed to update user.');
    } finally {
      setActionLoading(false);
    }
  };

  const toggleRole = (role: string) => {
    const current = rolesForm.roles;
    setRolesForm({
      roles: current.includes(role) ? current.filter((r) => r !== role) : [...current, role],
    });
  };

  const columns = [
    {
      key: 'name',
      header: 'Name',
      render: (row: User) => (
        <div>
          <p className="font-medium text-gray-900">{row.firstName} {row.lastName}</p>
          <p className="text-xs text-gray-400">{row.email}</p>
        </div>
      ),
    },
    {
      key: 'department',
      header: 'Department',
      render: (row: User) => <span className="text-sm text-gray-600">{row.department || '—'}</span>,
    },
    {
      key: 'manager',
      header: 'Reports To',
      render: (row: User) => (
        <button
          className="text-sm text-blue-600 hover:underline"
          onClick={(e) => {
            e.stopPropagation();
            setSelectedUser(row);
            setNewManagerId(row.managerId || '');
            setEditManagerOpen(true);
          }}
        >
          {getUserName(row.managerId)}
          <span className="text-gray-400 ml-1 text-xs">(edit)</span>
        </button>
      ),
    },
    {
      key: 'roles',
      header: 'Roles',
      render: (row: User) => (
        <div className="flex flex-wrap gap-1">
          {row.roles.map((r) => (
            <span key={r} className="text-xs bg-blue-50 text-blue-600 px-2 py-0.5 rounded-full font-medium">
              {ROLE_LABELS[r] || r}
            </span>
          ))}
        </div>
      ),
    },
    {
      key: 'isActive',
      header: 'Status',
      render: (row: User) => (
        <Badge variant={row.isActive ? 'green' : 'gray'}>{row.isActive ? 'Active' : 'Inactive'}</Badge>
      ),
    },
    {
      key: 'actions',
      header: '',
      render: (row: User) => (
        <div className="flex items-center gap-2 justify-end">
          <Button variant="ghost" size="sm" onClick={(e) => { e.stopPropagation(); setSelectedUser(row); setRolesForm({ roles: [...row.roles] }); setRolesOpen(true); }}>
            Edit Roles
          </Button>
          <Button
            variant={row.isActive ? 'secondary' : 'success'}
            size="sm"
            onClick={(e) => { e.stopPropagation(); handleToggleActive(row); }}
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
          <h1 className="text-xl font-bold text-gray-900">Users</h1>
          <p className="text-sm text-gray-500 mt-0.5">{users.length} users in org</p>
        </div>
        <Button variant="primary" size="sm" onClick={() => { setError(''); setCreateOpen(true); }}>
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          Add User
        </Button>
      </div>

      {error && <Alert variant="error" onClose={() => setError('')}>{error}</Alert>}
      {success && <Alert variant="success" onClose={() => setSuccess('')}>{success}</Alert>}

      <Card padding="none">
        <Table columns={columns} data={users} keyExtractor={(row) => row.id} loading={loading} emptyMessage="No users found" />
      </Card>

      {/* Create User Modal */}
      <Modal isOpen={createOpen} onClose={() => setCreateOpen(false)} title="Add New User" size="lg">
        <div className="space-y-4">
          {error && <Alert variant="error" onClose={() => setError('')}>{error}</Alert>}

          <div className="grid grid-cols-2 gap-3">
            <Input label="First Name" value={createForm.firstName}
              onChange={(e) => setCreateForm({ ...createForm, firstName: e.target.value })} placeholder="Jane" />
            <Input label="Last Name" value={createForm.lastName}
              onChange={(e) => setCreateForm({ ...createForm, lastName: e.target.value })} placeholder="Doe" />
          </div>
          <Input label="Email" type="email" value={createForm.email}
            onChange={(e) => setCreateForm({ ...createForm, email: e.target.value })} placeholder="jane@company.com" />
          <div className="grid grid-cols-2 gap-3">
            <Input label="Department" value={createForm.department}
              onChange={(e) => setCreateForm({ ...createForm, department: e.target.value })} placeholder="Engineering" />
            <Input label="Password" type="password" value={createForm.password}
              onChange={(e) => setCreateForm({ ...createForm, password: e.target.value })} placeholder="Set initial password" />
          </div>

          {/* Manager dropdown — Finance Admins are excluded, they don't manage people */}
          <Select
            label="Reports To (Manager)"
            value={createForm.managerId}
            onChange={(e) => setCreateForm({ ...createForm, managerId: e.target.value })}
            options={managerOptions}
            helperText="Finance Admins are not in the reporting hierarchy."
          />

          {/* Role selection */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Roles</label>
            <div className="grid grid-cols-2 gap-2">
              {ALL_ROLES.map((role) => {
                const active = createForm.roles.includes(role);
                return (
                  <button key={role} type="button"
                    onClick={() => {
                      const roles = active
                        ? createForm.roles.filter((r) => r !== role)
                        : [...createForm.roles, role];
                      setCreateForm({ ...createForm, roles: roles.length ? roles : [role] });
                    }}
                    className={`flex items-center gap-2 px-3 py-2.5 rounded-lg text-sm font-medium text-left border transition-colors
                      ${active ? 'bg-blue-50 border-blue-300 text-blue-700' : 'bg-white border-gray-200 text-gray-600 hover:bg-gray-50'}`}
                  >
                    <div className={`w-4 h-4 rounded border-2 flex items-center justify-center flex-shrink-0 ${active ? 'border-blue-500 bg-blue-500' : 'border-gray-300'}`}>
                      {active && <svg className="w-2.5 h-2.5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" /></svg>}
                    </div>
                    {ROLE_LABELS[role]}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="flex justify-end gap-3 pt-2">
            <Button variant="secondary" onClick={() => setCreateOpen(false)} disabled={actionLoading}>Cancel</Button>
            <Button variant="primary" onClick={handleCreate} loading={actionLoading}>Create User</Button>
          </div>
        </div>
      </Modal>

      {/* Edit Roles Modal */}
      <Modal isOpen={rolesOpen} onClose={() => setRolesOpen(false)} title={`Edit Roles — ${selectedUser?.firstName} ${selectedUser?.lastName}`}>
        <div className="space-y-4">
          <p className="text-sm text-gray-500">Changes take effect on next login.</p>
          <div className="grid grid-cols-2 gap-2">
            {ALL_ROLES.map((role) => {
              const active = rolesForm.roles.includes(role);
              return (
                <button key={role} type="button" onClick={() => toggleRole(role)}
                  className={`flex items-center gap-2 px-3 py-2.5 rounded-lg text-sm font-medium text-left border transition-colors
                    ${active ? 'bg-blue-50 border-blue-300 text-blue-700' : 'bg-white border-gray-200 text-gray-600 hover:bg-gray-50'}`}
                >
                  <div className={`w-4 h-4 rounded border-2 flex items-center justify-center flex-shrink-0 ${active ? 'border-blue-500 bg-blue-500' : 'border-gray-300'}`}>
                    {active && <svg className="w-2.5 h-2.5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" /></svg>}
                  </div>
                  {ROLE_LABELS[role]}
                </button>
              );
            })}
          </div>
          <div className="flex justify-end gap-3 pt-2">
            <Button variant="secondary" onClick={() => setRolesOpen(false)} disabled={actionLoading}>Cancel</Button>
            <Button variant="primary" onClick={handleAssignRoles} loading={actionLoading}>Save Roles</Button>
          </div>
        </div>
      </Modal>

      {/* Edit Manager Modal */}
      <Modal isOpen={editManagerOpen} onClose={() => setEditManagerOpen(false)} title={`Manager — ${selectedUser?.firstName} ${selectedUser?.lastName}`}>
        <div className="space-y-4">
          <p className="text-sm text-gray-500">
            This determines the approval chain for {selectedUser?.firstName}&apos;s expenses.
            Finance Admins are excluded — they are always the final approver, not an intermediate manager.
          </p>
          <Select
            label="Reports To"
            value={newManagerId}
            onChange={(e) => setNewManagerId(e.target.value)}
            options={managerOptions.filter((o) => o.value !== selectedUser?.id)}
          />
          <div className="flex justify-end gap-3 pt-2">
            <Button variant="secondary" onClick={() => setEditManagerOpen(false)} disabled={actionLoading}>Cancel</Button>
            <Button variant="primary" onClick={handleUpdateManager} loading={actionLoading}>Save</Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
