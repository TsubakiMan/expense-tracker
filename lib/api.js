const GAS_URL = process.env.NEXT_PUBLIC_GAS_URL || '';

async function gasGet(params = {}) {
  if (!GAS_URL) throw new Error('GAS_URL not configured');
  const url = new URL(GAS_URL);
  Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
  const res = await fetch(url.toString());
  if (!res.ok) throw new Error(`GET failed: ${res.status}`);
  return res.json();
}

async function gasPost(body) {
  if (!GAS_URL) throw new Error('GAS_URL not configured');
  const res = await fetch(GAS_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain' },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`POST failed: ${res.status}`);
  return res.json();
}

export async function fetchAllData() {
  return gasGet({ action: 'getAll' });
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
