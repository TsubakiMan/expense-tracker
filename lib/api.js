const GAS_URL = process.env.NEXT_PUBLIC_GAS_URL || '';

async function gasGet(params = {}) {
  const url = new URL(GAS_URL);
  Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
  const res = await fetch(url.toString(), { method: 'GET' });
  if (!res.ok) throw new Error(`GAS GET failed: ${res.status}`);
  return res.json();
}

async function gasPost(body) {
  const res = await fetch(GAS_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain' },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`GAS POST failed: ${res.status}`);
  return res.json();
}

export async function fetchAllData() {
  return gasGet({ action: 'getAll' });
}

export async function fetchMonthData(date) {
  return gasGet({ action: 'getMonth', date });
}

export async function updateRow(data) {
  return gasPost({ action: 'updateRow', ...data });
}

export async function addRow(data) {
  return gasPost({ action: 'addRow', ...data });
}

export async function deleteRow(rowNum) {
  return gasPost({ action: 'deleteRow', rowNum });
}
