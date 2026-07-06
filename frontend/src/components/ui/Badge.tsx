'use client';

import React from 'react';
import { formatStatus } from '@/lib/utils';

type BadgeVariant = 'gray' | 'blue' | 'yellow' | 'green' | 'red' | 'purple' | 'orange';

interface BadgeProps {
  children?: React.ReactNode;
  status?: string;
  variant?: BadgeVariant;
  className?: string;
}

const statusVariantMap: Record<string, BadgeVariant> = {
  DRAFT: 'gray',
  SUBMITTED: 'blue',
  IN_REVIEW: 'yellow',
  APPROVED: 'green',
  REJECTED: 'red',
  PAID: 'purple',
  PENDING: 'gray',
  ACTIVE: 'green',
  SKIPPED: 'gray',
  COMPLETED: 'green',
  RETURNED: 'orange',
  ELEVATED: 'orange',
  STANDARD: 'blue',
};

const variantClasses: Record<BadgeVariant, string> = {
  gray: 'bg-gray-100 text-gray-700 border border-gray-200',
  blue: 'bg-blue-50 text-blue-700 border border-blue-200',
  yellow: 'bg-amber-50 text-amber-700 border border-amber-200',
  green: 'bg-green-50 text-green-700 border border-green-200',
  red: 'bg-red-50 text-red-700 border border-red-200',
  purple: 'bg-purple-50 text-purple-700 border border-purple-200',
  orange: 'bg-orange-50 text-orange-700 border border-orange-200',
};

export default function Badge({ children, status, variant, className = '' }: BadgeProps) {
  const resolvedVariant = variant || (status ? statusVariantMap[status] : 'gray') || 'gray';
  const label = children || (status ? formatStatus(status) : '');

  return (
    <span
      className={`
        inline-flex items-center px-2.5 py-0.5
        text-xs font-medium rounded-full
        ${variantClasses[resolvedVariant]}
        ${className}
      `}
    >
      {label}
    </span>
  );
}
