export function formatYen(amount) {
  return '¥' + Math.round(amount).toLocaleString('ja-JP');
}

export function formatMonth(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  return `${d.getFullYear()}年${d.getMonth() + 1}月`;
}

export function formatShortMonth(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  return `${d.getMonth() + 1}月`;
}

export function getMonthDiff(dateStr) {
  const now = new Date();
  const d = new Date(dateStr);
  return (d.getFullYear() - now.getFullYear()) * 12 + (d.getMonth() - now.getMonth());
}

export function isCurrentMonth(dateStr) {
  const now = new Date();
  const d = new Date(dateStr);
  return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth();
}

export function totalIncome(row) {
  return (row.income || 0) + (row.bonus || 0);
}

export function totalExpenseWithExtra(row) {
  return (row.totalExpense || 0) + (row.extraSpend || 0);
}

export function monthlySurplus(row) {
  return totalIncome(row) - totalExpenseWithExtra(row);
}
