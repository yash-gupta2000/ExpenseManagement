export const formatCurrency = (cents: number, currency = 'USD'): string => {
  const dollars = cents / 100;
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(dollars);
};

export const formatDate = (dateString: string): string => {
  if (!dateString) return '-';
  const date = new Date(dateString);
  return new Intl.DateTimeFormat('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  }).format(date);
};

export const formatDateTime = (dateString: string): string => {
  if (!dateString) return '-';
  const date = new Date(dateString);
  return new Intl.DateTimeFormat('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
};

export const formatStatus = (status: string): string => {
  const map: Record<string, string> = {
    DRAFT: 'Draft',
    SUBMITTED: 'Submitted',
    IN_REVIEW: 'In Review',
    APPROVED: 'Approved',
    REJECTED: 'Rejected',
    PAID: 'Paid',
    PENDING: 'Pending',
    ACTIVE: 'Active',
    SKIPPED: 'Skipped',
    COMPLETED: 'Completed',
    RETURNED: 'Returned',
  };
  return map[status] || status;
};

export const dollarsToCents = (dollars: string | number): number => {
  const num = typeof dollars === 'string' ? parseFloat(dollars) : dollars;
  return Math.round(num * 100);
};

export const centsToDollars = (cents: number): string => {
  return (cents / 100).toFixed(2);
};
