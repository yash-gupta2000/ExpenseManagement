'use client';

import React from 'react';
import { usePathname } from 'next/navigation';

const pageTitles: Record<string, string> = {
  '/dashboard': 'Dashboard',
  '/dashboard/expenses': 'Expenses',
  '/dashboard/expenses/new': 'New Expense',
  '/dashboard/approvals': 'Pending Approvals',
  '/dashboard/categories': 'Categories',
  '/dashboard/users': 'Users',
  '/dashboard/audit': 'Audit Log',
};

interface HeaderProps {
  children?: React.ReactNode;
}

export default function Header({ children }: HeaderProps) {
  const pathname = usePathname();

  // Determine title
  let title = 'Dashboard';
  for (const [path, name] of Object.entries(pageTitles)) {
    if (pathname === path) {
      title = name;
      break;
    }
  }
  if (pathname.includes('/expenses/') && pathname.endsWith('/edit')) {
    title = 'Edit Expense';
  } else if (pathname.includes('/expenses/') && !pathname.endsWith('/new')) {
    title = 'Expense Details';
  }

  return (
    <header className="h-16 bg-white border-b border-gray-200 flex items-center px-6 gap-4 flex-shrink-0">
      <h1 className="text-lg font-semibold text-gray-900 flex-1">{title}</h1>
      {children}
    </header>
  );
}
