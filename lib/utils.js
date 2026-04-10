export const INCOME_KEYS = ['salary', 'sideIncome', 'otherIncome'];

export const EXPENSE_KEYS = [
  'rent','food','electric','gas','water',
  'phone','subscription','transport','daily',
  'insurance','loan','hobby','beauty',
  'otherExpense','extraExpense'
];

export const BUILTIN_KEYS = new Set([...INCOME_KEYS, ...EXPENSE_KEYS]);

export const EXPENSE_LABELS = {
  rent:'家賃', food:'食費', electric:'電気', gas:'ガス', water:'水道',
  phone:'通信費', subscription:'サブスク', transport:'交通費', daily:'日用品',
  insurance:'保険', loan:'ローン', hobby:'趣味・娯楽', beauty:'美容',
  otherExpense:'その他', extraExpense:'臨時支出'
};

export const INCOME_LABELS = {
  salary:'給与', sideIncome:'副収入', otherIncome:'その他収入'
};

export const MAX_CATEGORIES = 100;

export function isCustomKey(key) {
  return /^c[xi]_\d+$/.test(key);
}

export function formatYen(n) {
  if (n == null || isNaN(n)) return '¥0';
  return '¥' + Math.round(n).toLocaleString('ja-JP');
}

export function formatMonth(dateStr) {
  if (!dateStr) return '';
  const [y, m] = dateStr.split('-');
  return `${y}年${parseInt(m)}月`;
}

export function formatShortMonth(dateStr) {
  if (!dateStr) return '';
  return `${parseInt(dateStr.split('-')[1])}月`;
}

export function currentMonth() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

export function addMonths(dateStr, n) {
  const [y, m] = dateStr.split('-').map(Number);
  const d = new Date(y, m - 1 + n, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

export function totalIncome(row, customIncomeKeys = []) {
  let sum = INCOME_KEYS.reduce((s, k) => s + (row[k] || 0), 0);
  for (const k of customIncomeKeys) sum += row[k] || 0;
  return sum;
}

export function totalExpense(row, customExpenseKeys = []) {
  let sum = EXPENSE_KEYS.reduce((s, k) => s + (row[k] || 0), 0);
  for (const k of customExpenseKeys) sum += row[k] || 0;
  return sum;
}

export function surplus(row, customExpenseKeys = [], customIncomeKeys = []) {
  return totalIncome(row, customIncomeKeys) - totalExpense(row, customExpenseKeys);
}
