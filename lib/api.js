import { supabase } from './supabase';

// ── Key mapping: app (camelCase) ↔ DB (snake_case) ──
const TO_DB = {
  date: 'date', salary: 'salary', sideIncome: 'side_income', otherIncome: 'other_income',
  rent: 'rent', food: 'food', electric: 'electric', gas: 'gas', water: 'water',
  phone: 'phone', subscription: 'subscription', transport: 'transport', daily: 'daily',
  insurance: 'insurance', loan: 'loan', hobby: 'hobby', beauty: 'beauty',
  otherExpense: 'other_expense', extraExpense: 'extra_expense',
  balanceHokyo: 'balance_hokyo', balanceRakuten: 'balance_rakuten',
  notes: 'notes',
};

const TO_APP = Object.fromEntries(Object.entries(TO_DB).map(([a, d]) => [d, a]));

function isCustomKey(key) {
  return /^c[xi]_\d+$/.test(key);
}

function toDbRow(appData) {
  const row = {};
  const custom = {};
  for (const [k, v] of Object.entries(appData)) {
    if (k === 'rowNum' || k === 'id') continue;
    if (TO_DB[k]) {
      row[TO_DB[k]] = v;
    } else if (isCustomKey(k)) {
      custom[k] = v || 0;
    }
  }
  if (Object.keys(custom).length > 0) {
    row.custom_data = custom;
  }
  return row;
}

function toAppRow(dbRow) {
  const app = { rowNum: dbRow.id };
  for (const [dbKey, value] of Object.entries(dbRow)) {
    if (dbKey === 'id' || dbKey === 'created_at' || dbKey === 'custom_data') continue;
    const appKey = TO_APP[dbKey] || dbKey;
    app[appKey] = value || (dbKey === 'notes' ? '' : 0);
  }
  // Merge custom data
  if (dbRow.custom_data && typeof dbRow.custom_data === 'object') {
    for (const [k, v] of Object.entries(dbRow.custom_data)) {
      if (isCustomKey(k)) app[k] = v || 0;
    }
  }
  return app;
}

// ── Data API ──

export async function fetchAllData() {
  const [dataResult, settingsResult] = await Promise.all([
    supabase.from('monthly_data').select('*').order('date', { ascending: true }),
    supabase.from('settings').select('*'),
  ]);

  if (dataResult.error) throw new Error(dataResult.error.message);

  const rows = (dataResult.data || []).map(toAppRow);

  const settings = {};
  if (settingsResult.data) {
    for (const row of settingsResult.data) {
      settings[row.key] = row.value;
    }
  }

  return { rows, settings };
}

export async function updateRow(data) {
  const { rowNum, ...rest } = data;
  const dbRow = toDbRow(rest);
  const { error } = await supabase.from('monthly_data').update(dbRow).eq('id', rowNum);
  if (error) throw new Error(error.message);
  return { success: true, rowNum };
}

export async function addRow(data) {
  const dbRow = toDbRow(data);
  const { data: inserted, error } = await supabase
    .from('monthly_data').insert(dbRow).select().single();
  if (error) throw new Error(error.message);
  return { success: true, rowNum: inserted.id };
}

export async function deleteRow(rowNum) {
  const { error } = await supabase.from('monthly_data').delete().eq('id', rowNum);
  if (error) throw new Error(error.message);
  return { success: true };
}

// ── Settings API ──

export async function saveSettings(settings) {
  const upserts = Object.entries(settings).map(([key, value]) => ({
    key,
    value,
    updated_at: new Date().toISOString(),
  }));
  const { error } = await supabase.from('settings').upsert(upserts, { onConflict: 'key' });
  if (error) throw new Error(error.message);
  return { success: true };
}
