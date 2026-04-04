'use client';

import { useState, useEffect, useCallback } from 'react';
import { fetchAllData, updateRow, addRow } from '../lib/api';
import { formatYen, formatMonth, formatShortMonth, totalIncome, totalExpenseWithExtra, monthlySurplus } from '../lib/utils';
import BalanceChart from '../components/BalanceChart';

// デモデータ（GAS未接続時に使用）
const DEMO_DATA = {
  categories: [
    { key: 'food', label: '食費' }, { key: 'rent', label: '家賃' },
    { key: 'loan', label: '奨学金' }, { key: 'gas', label: 'ガス' },
    { key: 'kerosene', label: '灯油' }, { key: 'electric', label: '電気' },
    { key: 'subscription', label: 'サブスク' }, { key: 'transport', label: '移動費' },
    { key: 'phone', label: '通信費' }, { key: 'daily', label: '日用品' },
    { key: 'hair', label: '脱毛' }, { key: 'pc', label: 'デスクトップPC' },
  ],
  rows: [
    { rowNum:2, date:'2025-11-25', income:164000, bonus:0, totalExpense:195120, expenses:{food:60000,rent:43270,loan:15000,gas:5000,kerosene:0,electric:3000,subscription:10000,transport:2000,phone:5350,daily:1500,hair:17500,pc:32500}, extraSpend:20000, balanceHokyo:1248880, balanceRakuten:0, notes:'デスクトップPCの支払い' },
    { rowNum:3, date:'2025-12-25', income:164000, bonus:0, totalExpense:200120, expenses:{food:60000,rent:43270,loan:15000,gas:5000,kerosene:5000,electric:3000,subscription:10000,transport:2000,phone:5350,daily:1500,hair:17500,pc:32500}, extraSpend:20000, balanceHokyo:1192760, balanceRakuten:0, notes:'デスクトップPCの支払い' },
    { rowNum:4, date:'2026-01-25', income:164000, bonus:300000, totalExpense:200120, expenses:{food:60000,rent:43270,loan:15000,gas:5000,kerosene:5000,electric:3000,subscription:10000,transport:2000,phone:5350,daily:1500,hair:17500,pc:32500}, extraSpend:30000, balanceHokyo:456380, balanceRakuten:600000, notes:'デスクトップPCの支払い' },
    { rowNum:5, date:'2026-02-25', income:164000, bonus:0, totalExpense:205120, expenses:{food:60000,rent:43270,loan:15000,gas:5000,kerosene:10000,electric:3000,subscription:10000,transport:2000,phone:5350,daily:1500,hair:17500,pc:32500}, extraSpend:30000, balanceHokyo:417760, balanceRakuten:547500, notes:'デスクトップPCの支払い' },
    { rowNum:6, date:'2026-03-25', income:164000, bonus:0, totalExpense:205120, expenses:{food:60000,rent:43270,loan:15000,gas:5000,kerosene:10000,electric:3000,subscription:10000,transport:2000,phone:5350,daily:1500,hair:17500,pc:32500}, extraSpend:30000, balanceHokyo:379140, balanceRakuten:495000, notes:'デスクトップPCの支払い' },
    { rowNum:7, date:'2026-04-25', income:164000, bonus:0, totalExpense:195120, expenses:{food:60000,rent:43270,loan:15000,gas:5000,kerosene:0,electric:3000,subscription:10000,transport:2000,phone:5350,daily:1500,hair:17500,pc:32500}, extraSpend:30000, balanceHokyo:350520, balanceRakuten:442500, notes:'デスクトップPCの支払い' },
    { rowNum:8, date:'2026-05-25', income:210000, bonus:0, totalExpense:195120, expenses:{food:60000,rent:43270,loan:15000,gas:5000,kerosene:0,electric:3000,subscription:10000,transport:2000,phone:5350,daily:1500,hair:17500,pc:32500}, extraSpend:30000, balanceHokyo:367900, balanceRakuten:390000, notes:'デスクトップPCの支払い' },
    { rowNum:9, date:'2026-06-25', income:210000, bonus:0, totalExpense:162620, expenses:{food:60000,rent:43270,loan:15000,gas:5000,kerosene:0,electric:3000,subscription:10000,transport:2000,phone:5350,daily:1500,hair:17500,pc:0}, extraSpend:30000, balanceHokyo:385280, balanceRakuten:370000, notes:'' },
    { rowNum:10, date:'2026-07-25', income:210000, bonus:500000, totalExpense:162620, expenses:{food:60000,rent:43270,loan:15000,gas:5000,kerosene:0,electric:3000,subscription:10000,transport:2000,phone:5350,daily:1500,hair:17500,pc:0}, extraSpend:30000, balanceHokyo:902660, balanceRakuten:350000, notes:'' },
    { rowNum:11, date:'2026-08-25', income:210000, bonus:0, totalExpense:162620, expenses:{food:60000,rent:43270,loan:15000,gas:5000,kerosene:0,electric:3000,subscription:10000,transport:2000,phone:5350,daily:1500,hair:17500,pc:0}, extraSpend:30000, balanceHokyo:920040, balanceRakuten:330000, notes:'' },
  ]
};

export default function Home() {
  const [data, setData] = useState(null);
  const [currentIdx, setCurrentIdx] = useState(0);
  const [view, setView] = useState('home'); // home | list | input | forecast
  const [editModal, setEditModal] = useState(null);
  const [toast, setToast] = useState('');
  const [saving, setSaving] = useState(false);
  const [isDemo, setIsDemo] = useState(false);

  const loadData = useCallback(async () => {
    try {
      const result = await fetchAllData();
      if (result.error) throw new Error(result.error);
      setData(result);
      // 今月に最も近い行を選択
      const now = new Date();
      let closest = 0;
      let minDiff = Infinity;
      result.rows.forEach((r, i) => {
        const d = new Date(r.date);
        const diff = Math.abs(d - now);
        if (diff < minDiff) { minDiff = diff; closest = i; }
      });
      setCurrentIdx(closest);
    } catch (e) {
      console.warn('GAS未接続のためデモデータを使用:', e.message);
      setData(DEMO_DATA);
      setIsDemo(true);
      setCurrentIdx(5); // 2026年4月
    }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  const showToast = (msg) => {
    setToast(msg);
    setTimeout(() => setToast(''), 2500);
  };

  if (!data) return <div className="loading"><div className="spinner" />読み込み中...</div>;

  const row = data.rows[currentIdx];
  const categories = data.categories;
  const surplus = monthlySurplus(row);
  const incomeTotal = totalIncome(row);
  const expenseTotal = totalExpenseWithExtra(row);

  const prevMonth = () => setCurrentIdx(i => Math.max(0, i - 1));
  const nextMonth = () => setCurrentIdx(i => Math.min(data.rows.length - 1, i + 1));

  const handleSave = async (rowNum, updates) => {
    setSaving(true);
    try {
      if (isDemo) {
        // デモモード：ローカル更新
        setData(prev => {
          const newRows = [...prev.rows];
          const idx = newRows.findIndex(r => r.rowNum === rowNum);
          if (idx >= 0) newRows[idx] = { ...newRows[idx], ...updates };
          return { ...prev, rows: newRows };
        });
      } else {
        await updateRow({ rowNum, ...updates });
        await loadData();
      }
      showToast('保存しました');
      setEditModal(null);
    } catch (e) {
      showToast('エラー: ' + e.message);
    }
    setSaving(false);
  };

  return (
    <div className="app">
      {isDemo && (
        <div style={{ background: 'var(--amber-light)', borderBottom: '1px solid var(--border)', padding: '8px 20px', fontSize: 12, color: 'var(--amber)' }}>
          デモモード — GAS URLを設定すると実データに接続されます
        </div>
      )}

      {view === 'home' && (
        <HomeView
          row={row} categories={categories} surplus={surplus}
          incomeTotal={incomeTotal} expenseTotal={expenseTotal}
          currentIdx={currentIdx} total={data.rows.length}
          prevMonth={prevMonth} nextMonth={nextMonth}
          onEdit={(item) => setEditModal(item)}
        />
      )}

      {view === 'list' && (
        <ListView
          rows={data.rows} categories={categories}
          onSelect={(idx) => { setCurrentIdx(idx); setView('home'); }}
        />
      )}

      {view === 'input' && (
        <InputView
          row={row} categories={categories}
          onSave={handleSave} saving={saving}
          formatMonth={formatMonth}
        />
      )}

      {view === 'forecast' && (
        <ForecastView rows={data.rows} />
      )}

      {editModal && (
        <EditModal
          item={editModal} row={row}
          onSave={handleSave} onClose={() => setEditModal(null)}
          saving={saving}
        />
      )}

      {toast && <div className="toast">{toast}</div>}

      <nav className="bottom-nav">
        {[
          { id: 'home', label: 'ホーム', icon: 'M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-4 0h4' },
          { id: 'list', label: '一覧', icon: 'M4 6h16M4 12h16M4 18h16' },
          { id: 'input', label: '入力', icon: 'M12 4v16m8-8H4' },
          { id: 'forecast', label: '予測', icon: 'M13 7h8m0 0v8m0-8l-8 8-4-4-6 6' },
        ].map(nav => (
          <button
            key={nav.id}
            className={`nav-item ${view === nav.id ? 'active' : ''}`}
            onClick={() => setView(nav.id)}
          >
            <svg className="nav-icon" fill="none" stroke="currentColor" strokeWidth="1.8" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d={nav.icon} />
            </svg>
            {nav.label}
          </button>
        ))}
      </nav>
    </div>
  );
}

// ── ホーム画面 ──
function HomeView({ row, categories, surplus, incomeTotal, expenseTotal, currentIdx, total, prevMonth, nextMonth, onEdit }) {
  const sorted = [...categories]
    .map(c => ({ ...c, amount: row.expenses[c.key] || 0 }))
    .filter(c => c.amount > 0)
    .sort((a, b) => b.amount - a.amount);

  return (
    <>
      <div className="header">
        <div className="header-month">{formatMonth(row.date)}</div>
        <div className={`header-amount ${surplus >= 0 ? 'positive' : 'negative'}`}>
          {surplus >= 0 ? '+' : ''}{formatYen(surplus)}
        </div>
        <div className="header-detail">
          収入 {formatYen(incomeTotal)} ／ 支出 {formatYen(expenseTotal)}
        </div>
        <div className="month-nav">
          <button onClick={prevMonth} disabled={currentIdx === 0}>← 前月</button>
          <span className="current">{formatMonth(row.date)}</span>
          <button onClick={nextMonth} disabled={currentIdx === total - 1}>翌月 →</button>
        </div>
      </div>

      <div className="bank-cards">
        <div className="bank-card">
          <div className="label">北洋銀行</div>
          <div className="amount">{formatYen(row.balanceHokyo)}</div>
        </div>
        <div className="bank-card">
          <div className="label">楽天銀行</div>
          <div className="amount">{formatYen(row.balanceRakuten)}</div>
        </div>
      </div>

      {(row.income > 0 || row.bonus > 0) && (
        <div className="section">
          <div className="section-title">収入</div>
          <div className="income-row">
            <span className="label">通常収入</span>
            <span className="amount income-color">{formatYen(row.income)}</span>
          </div>
          {row.bonus > 0 && (
            <div className="income-row">
              <span className="label">ボーナス</span>
              <span className="amount income-color">{formatYen(row.bonus)}</span>
            </div>
          )}
          {row.extraSpend > 0 && (
            <div className="income-row">
              <span className="label">プラス支出</span>
              <span className="amount" style={{ color: 'var(--amber)' }}>{formatYen(row.extraSpend)}</span>
            </div>
          )}
        </div>
      )}

      <div className="section">
        <div className="section-title">支出内訳（{formatYen(row.totalExpense)}）</div>
        <div className="expense-list">
          {sorted.map(item => (
            <div
              key={item.key}
              className="expense-item"
              onClick={() => onEdit({ type: 'expense', key: item.key, label: item.label, value: item.amount, rowNum: row.rowNum })}
            >
              <span className="label">
                <span className="bar" />
                {item.label}
              </span>
              <span className="amount">{formatYen(item.amount)}</span>
            </div>
          ))}
        </div>
      </div>

      {row.notes && (
        <div className="section">
          <div className="section-title">備考</div>
          <p style={{ fontSize: 14, color: 'var(--text-sub)' }}>{row.notes}</p>
        </div>
      )}
    </>
  );
}

// ── 一覧画面 ──
function ListView({ rows, onSelect }) {
  return (
    <>
      <div className="header">
        <div style={{ fontSize: 16, fontWeight: 600 }}>月別一覧</div>
      </div>
      <div className="section">
        <div className="expense-list">
          {rows.map((row, idx) => {
            const s = monthlySurplus(row);
            return (
              <div key={row.rowNum} className="expense-item" onClick={() => onSelect(idx)}>
                <span className="label">{formatMonth(row.date)}</span>
                <span className="amount" style={{ color: s >= 0 ? 'var(--green)' : 'var(--red)' }}>
                  {s >= 0 ? '+' : ''}{formatYen(s)}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </>
  );
}

// ── 入力画面 ──
function InputView({ row, categories, onSave, saving, formatMonth }) {
  const [form, setForm] = useState({
    income: row.income,
    bonus: row.bonus,
    extraSpend: row.extraSpend,
    notes: row.notes,
    balanceHokyo: row.balanceHokyo,
    balanceRakuten: row.balanceRakuten,
    expenses: { ...row.expenses },
  });

  useEffect(() => {
    setForm({
      income: row.income, bonus: row.bonus,
      extraSpend: row.extraSpend, notes: row.notes,
      balanceHokyo: row.balanceHokyo, balanceRakuten: row.balanceRakuten,
      expenses: { ...row.expenses },
    });
  }, [row]);

  const updateField = (field, value) => setForm(prev => ({ ...prev, [field]: value }));
  const updateExpense = (key, value) => setForm(prev => ({
    ...prev,
    expenses: { ...prev.expenses, [key]: value }
  }));

  return (
    <>
      <div className="header">
        <div style={{ fontSize: 16, fontWeight: 600 }}>{formatMonth(row.date)} の編集</div>
      </div>

      <div className="section">
        <div className="form-section">
          <div className="section-title">収入</div>
          <div className="form-group">
            <label className="form-label">通常収入</label>
            <input className="form-input" type="number" value={form.income}
              onChange={e => updateField('income', Number(e.target.value))} />
          </div>
          <div className="form-group">
            <label className="form-label">ボーナス</label>
            <input className="form-input" type="number" value={form.bonus}
              onChange={e => updateField('bonus', Number(e.target.value))} />
          </div>
        </div>

        <div className="form-section">
          <div className="section-title">支出</div>
          {categories.map(cat => (
            <div key={cat.key} className="form-group">
              <label className="form-label">{cat.label}</label>
              <input className="form-input" type="number"
                value={form.expenses[cat.key] || 0}
                onChange={e => updateExpense(cat.key, Number(e.target.value))} />
            </div>
          ))}
        </div>

        <div className="form-section">
          <div className="section-title">その他</div>
          <div className="form-group">
            <label className="form-label">プラス支出</label>
            <input className="form-input" type="number" value={form.extraSpend}
              onChange={e => updateField('extraSpend', Number(e.target.value))} />
          </div>
          <div className="form-group">
            <label className="form-label">北洋銀行 残高</label>
            <input className="form-input" type="number" value={form.balanceHokyo}
              onChange={e => updateField('balanceHokyo', Number(e.target.value))} />
          </div>
          <div className="form-group">
            <label className="form-label">楽天銀行 残高</label>
            <input className="form-input" type="number" value={form.balanceRakuten}
              onChange={e => updateField('balanceRakuten', Number(e.target.value))} />
          </div>
          <div className="form-group">
            <label className="form-label">備考</label>
            <textarea className="form-input form-textarea" value={form.notes}
              onChange={e => updateField('notes', e.target.value)} />
          </div>
        </div>

        <button className="btn btn-primary" disabled={saving}
          onClick={() => onSave(row.rowNum, form)}>
          {saving ? '保存中...' : '保存する'}
        </button>
      </div>
    </>
  );
}

// ── 予測画面 ──
function ForecastView({ rows }) {
  return (
    <>
      <div className="header">
        <div style={{ fontSize: 16, fontWeight: 600 }}>残高推移予測</div>
        <div style={{ fontSize: 12, color: 'var(--text-hint)', marginTop: 4 }}>
          {formatMonth(rows[0]?.date)} 〜 {formatMonth(rows[rows.length - 1]?.date)}
        </div>
      </div>

      <div className="section">
        <div className="chart-container">
          <div className="section-title">銀行残高</div>
          <div className="chart-wrapper">
            <BalanceChart rows={rows} type="balance" />
          </div>
        </div>
      </div>

      <div className="section">
        <div className="chart-container">
          <div className="section-title">月次収支</div>
          <div className="chart-wrapper">
            <BalanceChart rows={rows} type="surplus" />
          </div>
        </div>
      </div>

      <div className="section">
        <div className="section-title">ポイント</div>
        <div className="expense-list">
          {rows.filter(r => r.bonus > 0).map(r => (
            <div key={r.rowNum} className="expense-item">
              <span className="label">{formatMonth(r.date)}</span>
              <span className="amount income-color">ボーナス {formatYen(r.bonus)}</span>
            </div>
          ))}
        </div>
      </div>
    </>
  );
}

// ── 編集モーダル ──
function EditModal({ item, row, onSave, onClose, saving }) {
  const [value, setValue] = useState(item.value);

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <div className="modal-title">{item.label}を編集</div>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>
        <div className="form-group">
          <label className="form-label">金額</label>
          <input className="form-input" type="number" value={value} autoFocus
            onChange={e => setValue(Number(e.target.value))} />
        </div>
        <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
          <button className="btn btn-secondary" style={{ flex: 1 }} onClick={onClose}>キャンセル</button>
          <button className="btn btn-primary" style={{ flex: 1 }} disabled={saving}
            onClick={() => onSave(row.rowNum, { expenses: { [item.key]: value } })}>
            {saving ? '保存中...' : '保存'}
          </button>
        </div>
      </div>
    </div>
  );
}
