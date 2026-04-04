/**
 * もん助 支出管理アプリ — GAS API バックエンド
 * 
 * このスクリプトをGoogle Apps Scriptエディタに貼り付けて、
 * Webアプリとしてデプロイしてください。
 * 
 * スプレッドシートのID は SPREADSHEET_ID に設定してください。
 */

const SPREADSHEET_ID = 'YOUR_SPREADSHEET_ID_HERE';
const SHEET_NAME = 'シート1';

// ── CORS対応 ──
function doOptions(e) {
  return ContentService.createTextOutput('')
    .setMimeType(ContentService.MimeType.TEXT)
    .setContent('');
}

// ── GET: データ取得 ──
function doGet(e) {
  try {
    const action = e.parameter.action || 'getAll';

    let result;
    switch (action) {
      case 'getAll':
        result = getAllData();
        break;
      case 'getMonth':
        result = getMonthData(e.parameter.date);
        break;
      case 'getCategories':
        result = getCategories();
        break;
      default:
        result = { error: 'Unknown action: ' + action };
    }

    return jsonResponse(result);
  } catch (err) {
    return jsonResponse({ error: err.message });
  }
}

// ── POST: データ更新 ──
function doPost(e) {
  try {
    const body = JSON.parse(e.postData.contents);
    const action = body.action || 'updateRow';

    let result;
    switch (action) {
      case 'updateRow':
        result = updateRow(body);
        break;
      case 'addRow':
        result = addRow(body);
        break;
      case 'deleteRow':
        result = deleteRow(body);
        break;
      default:
        result = { error: 'Unknown action: ' + action };
    }

    return jsonResponse(result);
  } catch (err) {
    return jsonResponse({ error: err.message });
  }
}

// ── ヘルパー ──
function jsonResponse(data) {
  return ContentService
    .createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}

function getSheet() {
  return SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName(SHEET_NAME);
}

// ── カテゴリ定義 ──
// スプレッドシートの列とカテゴリのマッピング
const COLUMN_MAP = {
  date: 1,           // A: 日付
  income: 2,         // B: 収入(通常)
  bonus: 3,          // C: 収入(ボーナス)
  totalExpense: 4,   // D: 予定：支出
  // E列はスキップ
  food: 6,           // F: 食費
  rent: 7,           // G: 家賃
  loan: 8,           // H: 奨学金
  gas: 9,            // I: ガス
  kerosene: 10,      // J: 灯油
  electric: 11,      // K: 電気
  subscription: 12,  // L: サブスク
  transport: 13,     // M: 移動費
  phone: 14,         // N: 通信費
  daily: 15,         // O: 日用品
  hair: 16,          // P: 脱毛（32回分割）
  pc: 17,            // Q: デスクトップPC（12回分割）
  // R列はスキップ
  extraSpend: 19,    // S: 予定：プラス支出
  // T列はスキップ
  balanceHokyo: 21,  // U: 予定：残高　北洋銀行
  balanceRakuten: 22,// V: 予定：残高　楽天銀行
  // W列はスキップ
  notes: 24          // X: 備考
};

const CATEGORIES = [
  { key: 'food', label: '食費', col: 6 },
  { key: 'rent', label: '家賃', col: 7 },
  { key: 'loan', label: '奨学金', col: 8 },
  { key: 'gas', label: 'ガス', col: 9 },
  { key: 'kerosene', label: '灯油', col: 10 },
  { key: 'electric', label: '電気', col: 11 },
  { key: 'subscription', label: 'サブスク', col: 12 },
  { key: 'transport', label: '移動費', col: 13 },
  { key: 'phone', label: '通信費', col: 14 },
  { key: 'daily', label: '日用品', col: 15 },
  { key: 'hair', label: '脱毛', col: 16 },
  { key: 'pc', label: 'デスクトップPC', col: 17 },
];

// ── データ取得 ──
function getAllData() {
  const sheet = getSheet();
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return { rows: [], categories: CATEGORIES };

  const data = sheet.getRange(2, 1, lastRow - 1, 24).getValues();
  const rows = data.map((row, i) => parseRow(row, i + 2));

  return { rows, categories: CATEGORIES };
}

function getMonthData(dateStr) {
  const allData = getAllData();
  if (!dateStr) return allData;

  const target = new Date(dateStr);
  const row = allData.rows.find(r => {
    const d = new Date(r.date);
    return d.getFullYear() === target.getFullYear() && d.getMonth() === target.getMonth();
  });

  return { row: row || null, categories: CATEGORIES };
}

function getCategories() {
  return { categories: CATEGORIES };
}

function parseRow(row, rowNum) {
  const expenses = {};
  CATEGORIES.forEach(cat => {
    expenses[cat.key] = row[cat.col - 1] || 0;
  });

  return {
    rowNum,
    date: row[0] ? Utilities.formatDate(new Date(row[0]), 'Asia/Tokyo', 'yyyy-MM-dd') : null,
    income: row[1] || 0,
    bonus: row[2] || 0,
    totalExpense: row[3] || 0,
    expenses,
    extraSpend: row[18] || 0,
    balanceHokyo: row[20] || 0,
    balanceRakuten: row[21] || 0,
    notes: row[23] || ''
  };
}

// ── データ更新 ──
function updateRow(body) {
  const sheet = getSheet();
  const rowNum = body.rowNum;
  if (!rowNum) return { error: 'rowNum is required' };

  // 各フィールドを更新
  if (body.income !== undefined) sheet.getRange(rowNum, COLUMN_MAP.income).setValue(body.income);
  if (body.bonus !== undefined) sheet.getRange(rowNum, COLUMN_MAP.bonus).setValue(body.bonus);
  if (body.extraSpend !== undefined) sheet.getRange(rowNum, COLUMN_MAP.extraSpend).setValue(body.extraSpend);
  if (body.notes !== undefined) sheet.getRange(rowNum, COLUMN_MAP.notes).setValue(body.notes);
  if (body.balanceHokyo !== undefined) sheet.getRange(rowNum, COLUMN_MAP.balanceHokyo).setValue(body.balanceHokyo);
  if (body.balanceRakuten !== undefined) sheet.getRange(rowNum, COLUMN_MAP.balanceRakuten).setValue(body.balanceRakuten);

  // カテゴリ別支出の更新
  if (body.expenses) {
    CATEGORIES.forEach(cat => {
      if (body.expenses[cat.key] !== undefined) {
        sheet.getRange(rowNum, cat.col).setValue(body.expenses[cat.key]);
      }
    });
  }

  // 支出合計を再計算
  recalcTotalExpense(sheet, rowNum);

  return { success: true, rowNum };
}

function addRow(body) {
  const sheet = getSheet();
  const lastRow = sheet.getLastRow();
  const newRow = lastRow + 1;

  const date = body.date ? new Date(body.date) : new Date();
  sheet.getRange(newRow, COLUMN_MAP.date).setValue(date);
  sheet.getRange(newRow, COLUMN_MAP.income).setValue(body.income || 0);
  sheet.getRange(newRow, COLUMN_MAP.bonus).setValue(body.bonus || 0);
  sheet.getRange(newRow, COLUMN_MAP.extraSpend).setValue(body.extraSpend || 0);
  sheet.getRange(newRow, COLUMN_MAP.notes).setValue(body.notes || '');

  if (body.expenses) {
    CATEGORIES.forEach(cat => {
      sheet.getRange(newRow, cat.col).setValue(body.expenses[cat.key] || 0);
    });
  }

  recalcTotalExpense(sheet, newRow);

  return { success: true, rowNum: newRow };
}

function deleteRow(body) {
  const sheet = getSheet();
  const rowNum = body.rowNum;
  if (!rowNum || rowNum < 2) return { error: 'Invalid rowNum' };

  sheet.deleteRow(rowNum);
  return { success: true };
}

function recalcTotalExpense(sheet, rowNum) {
  let total = 0;
  CATEGORIES.forEach(cat => {
    total += Number(sheet.getRange(rowNum, cat.col).getValue()) || 0;
  });
  sheet.getRange(rowNum, COLUMN_MAP.totalExpense).setValue(total);
}
