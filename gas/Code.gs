/**
 * 支出管理アプリ — GAS API バックエンド v2
 *
 * スプレッドシート列: A-V (22列)
 * A:年月  B:給与  C:副収入  D:その他収入
 * E:家賃  F:食費  G:電気  H:ガス  I:水道
 * J:通信費  K:サブスク  L:交通費  M:日用品
 * N:保険  O:ローン  P:趣味娯楽  Q:美容
 * R:その他支出  S:臨時支出
 * T:北洋銀行  U:楽天銀行  V:備考
 */

const SPREADSHEET_ID = 'YOUR_SPREADSHEET_ID_HERE';
const SHEET_NAME = 'シート1';

const COL = {
  date:1, salary:2, sideIncome:3, otherIncome:4,
  rent:5, food:6, electric:7, gas:8, water:9,
  phone:10, subscription:11, transport:12, daily:13,
  insurance:14, loan:15, hobby:16, beauty:17,
  otherExpense:18, extraExpense:19,
  balanceHokyo:20, balanceRakuten:21, notes:22
};

const CATEGORIES = [
  { key:'rent',         label:'家賃',     col:5  },
  { key:'food',         label:'食費',     col:6  },
  { key:'electric',     label:'電気',     col:7  },
  { key:'gas',          label:'ガス',     col:8  },
  { key:'water',        label:'水道',     col:9  },
  { key:'phone',        label:'通信費',   col:10 },
  { key:'subscription', label:'サブスク', col:11 },
  { key:'transport',    label:'交通費',   col:12 },
  { key:'daily',        label:'日用品',   col:13 },
  { key:'insurance',    label:'保険',     col:14 },
  { key:'loan',         label:'ローン',   col:15 },
  { key:'hobby',        label:'趣味・娯楽', col:16 },
  { key:'beauty',       label:'美容',     col:17 },
  { key:'otherExpense', label:'その他',   col:18 },
  { key:'extraExpense', label:'臨時支出', col:19 },
];

// ── HTTP handlers ──

function doGet(e) {
  try {
    const action = (e && e.parameter && e.parameter.action) || 'getAll';
    let result;
    switch (action) {
      case 'getAll':        result = getAllData(); break;
      case 'getCategories': result = { categories: CATEGORIES }; break;
      default:              result = { error: 'Unknown action' };
    }
    return jsonResponse(result);
  } catch (err) {
    return jsonResponse({ error: err.message });
  }
}

function doPost(e) {
  try {
    const body = JSON.parse(e.postData.contents);
    let result;
    switch (body.action) {
      case 'updateRow': result = updateRow(body); break;
      case 'addRow':    result = addRow(body); break;
      case 'deleteRow': result = deleteRow(body); break;
      default:          result = { error: 'Unknown action' };
    }
    return jsonResponse(result);
  } catch (err) {
    return jsonResponse({ error: err.message });
  }
}

function jsonResponse(data) {
  return ContentService
    .createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}

// ── Helpers ──

function getSheet() {
  return SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName(SHEET_NAME);
}

function getAllData() {
  const sheet = getSheet();
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return { rows: [], categories: CATEGORIES };
  const data = sheet.getRange(2, 1, lastRow - 1, 22).getValues();
  const rows = data.map((r, i) => parseRow(r, i + 2));
  return { rows, categories: CATEGORIES };
}

function parseRow(r, rowNum) {
  return {
    rowNum,
    date: r[0] ? Utilities.formatDate(new Date(r[0]), 'Asia/Tokyo', 'yyyy-MM') : null,
    salary:        r[1]  || 0,
    sideIncome:    r[2]  || 0,
    otherIncome:   r[3]  || 0,
    rent:          r[4]  || 0,
    food:          r[5]  || 0,
    electric:      r[6]  || 0,
    gas:           r[7]  || 0,
    water:         r[8]  || 0,
    phone:         r[9]  || 0,
    subscription:  r[10] || 0,
    transport:     r[11] || 0,
    daily:         r[12] || 0,
    insurance:     r[13] || 0,
    loan:          r[14] || 0,
    hobby:         r[15] || 0,
    beauty:        r[16] || 0,
    otherExpense:  r[17] || 0,
    extraExpense:  r[18] || 0,
    balanceHokyo:  r[19] || 0,
    balanceRakuten:r[20] || 0,
    notes:         r[21] || ''
  };
}

function updateRow(body) {
  const sheet = getSheet();
  const rn = body.rowNum;
  if (!rn) return { error: 'rowNum required' };

  Object.keys(COL).forEach(key => {
    if (key !== 'date' && body[key] !== undefined) {
      sheet.getRange(rn, COL[key]).setValue(body[key]);
    }
  });
  return { success: true, rowNum: rn };
}

function addRow(body) {
  const sheet = getSheet();
  const newRow = sheet.getLastRow() + 1;
  const dateStr = body.date || new Date().toISOString().slice(0, 7);
  sheet.getRange(newRow, COL.date).setValue(new Date(dateStr + '-01'));

  Object.keys(COL).forEach(key => {
    if (key !== 'date' && body[key] !== undefined) {
      sheet.getRange(newRow, COL[key]).setValue(body[key]);
    }
  });
  return { success: true, rowNum: newRow };
}

function deleteRow(body) {
  const sheet = getSheet();
  if (!body.rowNum || body.rowNum < 2) return { error: 'Invalid rowNum' };
  sheet.deleteRow(body.rowNum);
  return { success: true };
}

// ── Setup ──

function setupHeader() {
  const sheet = getSheet();
  const h = [
    '年月','給与','副収入','その他収入',
    '家賃','食費','電気','ガス','水道',
    '通信費','サブスク','交通費','日用品',
    '保険','ローン','趣味・娯楽','美容',
    'その他支出','臨時支出',
    '北洋銀行','楽天銀行','備考'
  ];
  sheet.getRange(1, 1, 1, h.length).setValues([h]);
  sheet.getRange(1, 1, 1, h.length).setFontWeight('bold');
  sheet.setFrozenRows(1);
}
