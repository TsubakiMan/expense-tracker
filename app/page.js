'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { fetchAllData, updateRow, addRow } from '../lib/api';
import {
  formatYen, formatMonth, formatShortMonth, currentMonth, addMonths,
  totalIncome, totalExpense, surplus,
  INCOME_KEYS, EXPENSE_KEYS, INCOME_LABELS, EXPENSE_LABELS,
} from '../lib/utils';
import { ExpenseDonut, ProjectionChart, SurplusBar, CHART_COLORS } from '../components/Charts';

// ── Demo Data ──
const DEMO_ROWS = [
  { rowNum:2, date:'2025-11', salary:220000, sideIncome:0, otherIncome:0, rent:43270, food:42000, electric:4200, gas:3500, water:3200, phone:5350, subscription:3980, transport:6000, daily:2800, insurance:5000, loan:15000, hobby:5000, beauty:0, otherExpense:2000, extraExpense:0, balanceHokyo:385000, balanceRakuten:290000, notes:'' },
  { rowNum:3, date:'2025-12', salary:220000, sideIncome:0, otherIncome:50000, rent:43270, food:52000, electric:5800, gas:5200, water:3200, phone:5350, subscription:3980, transport:8000, daily:4500, insurance:5000, loan:15000, hobby:15000, beauty:5000, otherExpense:5000, extraExpense:30000, balanceHokyo:370000, balanceRakuten:265000, notes:'' },
  { rowNum:4, date:'2026-01', salary:220000, sideIncome:0, otherIncome:0, rent:43270, food:45000, electric:7200, gas:6500, water:3200, phone:5350, subscription:3980, transport:5000, daily:3000, insurance:5000, loan:15000, hobby:4000, beauty:0, otherExpense:2000, extraExpense:0, balanceHokyo:356500, balanceRakuten:260000, notes:'' },
  { rowNum:5, date:'2026-02', salary:220000, sideIncome:0, otherIncome:0, rent:43270, food:44000, electric:7800, gas:7000, water:3200, phone:5350, subscription:3980, transport:5500, daily:2500, insurance:5000, loan:15000, hobby:3000, beauty:5000, otherExpense:1500, extraExpense:0, balanceHokyo:340900, balanceRakuten:257000, notes:'' },
  { rowNum:6, date:'2026-03', salary:220000, sideIncome:15000, otherIncome:0, rent:43270, food:46000, electric:5500, gas:4500, water:3200, phone:5350, subscription:3980, transport:7000, daily:3200, insurance:5000, loan:15000, hobby:8000, beauty:0, otherExpense:3000, extraExpense:15000, balanceHokyo:328400, balanceRakuten:255000, notes:'' },
  { rowNum:7, date:'2026-04', salary:220000, sideIncome:0, otherIncome:0, rent:43270, food:48000, electric:4500, gas:3800, water:3200, phone:5350, subscription:3980, transport:6500, daily:2800, insurance:5000, loan:15000, hobby:6000, beauty:5000, otherExpense:2000, extraExpense:0, balanceHokyo:322000, balanceRakuten:252000, notes:'' },
];

// ── Main App ──
export default function Home() {
  const [rows, setRows] = useState([]);
  const [currentIdx, setCurrentIdx] = useState(0);
  const [view, setView] = useState('home');
  const [editModal, setEditModal] = useState(null);
  const [toast, setToast] = useState('');
  const [saving, setSaving] = useState(false);
  const [isDemo, setIsDemo] = useState(false);
  const [loaded, setLoaded] = useState(false);

  const loadData = useCallback(async () => {
    try {
      const result = await fetchAllData();
      if (result.error) throw new Error(result.error);
      setRows(result.rows || []);
      const cm = currentMonth();
      const idx = (result.rows || []).findIndex(r => r.date === cm);
      setCurrentIdx(idx >= 0 ? idx : Math.max(0, (result.rows || []).length - 1));
    } catch {
      setRows(DEMO_ROWS);
      setIsDemo(true);
      setCurrentIdx(DEMO_ROWS.length - 1);
    }
    setLoaded(true);
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  const showToast = (msg) => {
    setToast(msg);
    setTimeout(() => setToast(''), 2500);
  };

  const handleSave = async (rowNum, updates) => {
    setSaving(true);
    try {
      if (isDemo) {
        setRows(prev => prev.map(r => r.rowNum === rowNum ? { ...r, ...updates } : r));
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

  const handleAdd = async (newData) => {
    setSaving(true);
    try {
      if (isDemo) {
        setRows(prev => [...prev, { rowNum: prev.length + 2, ...newData }]);
        setCurrentIdx(rows.length);
      } else {
        await addRow(newData);
        await loadData();
      }
      showToast('追加しました');
      setView('home');
    } catch (e) {
      showToast('エラー: ' + e.message);
    }
    setSaving(false);
  };

  if (!loaded) {
    return (
      <div className="loading">
        <div className="spinner" />
        <span className="loading-text">Loading...</span>
      </div>
    );
  }

  const row = rows[currentIdx];
  const prevMonth = () => setCurrentIdx(i => Math.max(0, i - 1));
  const nextMonth = () => setCurrentIdx(i => Math.min(rows.length - 1, i + 1));

  return (
    <div className="app">
      {isDemo && <div className="demo-banner">DEMO MODE</div>}

      {view === 'home' && row && (
        <HomeView
          row={row} rows={rows}
          currentIdx={currentIdx} prevMonth={prevMonth} nextMonth={nextMonth}
          onEdit={(item) => setEditModal(item)}
        />
      )}
      {view === 'history' && (
        <HistoryView rows={rows} onSelect={(idx) => { setCurrentIdx(idx); setView('home'); }} />
      )}
      {view === 'input' && (
        <InputView
          row={row} rows={rows}
          onSave={handleSave} onAdd={handleAdd} saving={saving}
        />
      )}
      {view === 'forecast' && (
        <ForecastView rows={rows} />
      )}

      {editModal && (
        <EditModal
          item={editModal} onSave={handleSave}
          onClose={() => setEditModal(null)} saving={saving}
        />
      )}

      {toast && <div className="toast">{toast}</div>}

      <nav className="bottom-nav">
        {[
          { id:'home', label:'ホーム', d:'M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-4 0h4' },
          { id:'history', label:'一覧', d:'M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2' },
          { id:'input', label:'入力', d:'M12 4v16m8-8H4' },
          { id:'forecast', label:'予測', d:'M13 7h8m0 0v8m0-8l-8 8-4-4-6 6' },
        ].map(n => (
          <button key={n.id} className={`nav-item ${view === n.id ? 'active' : ''}`} onClick={() => setView(n.id)}>
            <svg className="nav-icon" fill="none" stroke="currentColor" strokeWidth="1.8" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d={n.d} />
            </svg>
            {n.label}
          </button>
        ))}
      </nav>
    </div>
  );
}

// ── Home View ──
function HomeView({ row, rows, currentIdx, prevMonth, nextMonth, onEdit }) {
  const inc = totalIncome(row);
  const exp = totalExpense(row);
  const sur = surplus(row);
  const maxExp = Math.max(...EXPENSE_KEYS.map(k => row[k] || 0), 1);

  const expenseItems = EXPENSE_KEYS
    .map(k => ({ key: k, label: EXPENSE_LABELS[k], amount: row[k] || 0 }))
    .filter(e => e.amount > 0)
    .sort((a, b) => b.amount - a.amount);

  const donutData = expenseItems.map(e => e.amount);
  const donutLabels = expenseItems.map(e => e.label);

  return (
    <div className="fade-in">
      <div className="header">
        <div className="header-top">
          <span className="header-brand">Money Flow</span>
          <div className="month-nav">
            <button onClick={prevMonth} disabled={currentIdx === 0}>&lt;</button>
            <span className="current-month">{formatMonth(row.date)}</span>
            <button onClick={nextMonth} disabled={currentIdx === rows.length - 1}>&gt;</button>
          </div>
        </div>
      </div>

      <div className="hero">
        <div className="hero-label">MONTHLY BALANCE</div>
        <div className={`hero-amount ${sur >= 0 ? 'positive' : 'negative'}`}>
          {sur >= 0 ? '+' : ''}{formatYen(sur)}
        </div>
        <div className="hero-detail">
          <span><span className="dot dot-income" /> {formatYen(inc)}</span>
          <span><span className="dot dot-expense" /> {formatYen(exp)}</span>
        </div>
      </div>

      <div className="card-grid">
        <div className="card">
          <div className="card-label">北洋銀行</div>
          <div className="card-amount">{formatYen(row.balanceHokyo)}</div>
        </div>
        <div className="card">
          <div className="card-label">楽天銀行</div>
          <div className="card-amount">{formatYen(row.balanceRakuten)}</div>
        </div>
      </div>

      {/* Income Section */}
      <div className="section">
        <div className="section-title">Income</div>
        <div className="card">
          {INCOME_KEYS.map(k => {
            const v = row[k] || 0;
            if (v === 0) return null;
            return (
              <div key={k} className="stat-row">
                <span className="stat-label">{INCOME_LABELS[k]}</span>
                <span className="stat-value income">{formatYen(v)}</span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Expense Donut */}
      {expenseItems.length > 0 && (
        <div className="section">
          <div className="section-title">Expenses</div>
          <div className="chart-card">
            <div className="donut-wrapper">
              <ExpenseDonut data={donutData} labels={donutLabels} />
              <div className="donut-center">
                <div className="donut-center-amount">{formatYen(exp)}</div>
                <div className="donut-center-label">TOTAL</div>
              </div>
            </div>
            <div className="legend">
              {expenseItems.map((e, i) => (
                <span key={e.key} className="legend-item">
                  <span className="legend-dot" style={{ background: CHART_COLORS[i % CHART_COLORS.length] }} />
                  {e.label}
                </span>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Expense Bars */}
      <div className="section">
        <div className="section-title">Breakdown</div>
        <div className="expense-bars">
          {expenseItems.map(e => (
            <div
              key={e.key}
              className="expense-bar-item"
              onClick={() => onEdit({ key: e.key, label: e.label, value: e.amount, rowNum: row.rowNum })}
            >
              <div className="expense-bar-item-top">
                <span className="label">{e.label}</span>
                <span className="amount">{formatYen(e.amount)}</span>
              </div>
              <div className="expense-bar-track">
                <div className="expense-bar-fill" style={{ width: `${(e.amount / maxExp) * 100}%` }} />
              </div>
            </div>
          ))}
        </div>
      </div>

      {row.notes && (
        <div className="section">
          <div className="section-title">Notes</div>
          <div className="card" style={{ padding: 14, fontSize: 13, color: 'var(--text-secondary)' }}>
            {row.notes}
          </div>
        </div>
      )}
    </div>
  );
}

// ── History View ──
function HistoryView({ rows, onSelect }) {
  return (
    <div className="fade-in">
      <div className="header">
        <div className="header-top">
          <span className="header-brand">Money Flow</span>
        </div>
      </div>

      <div className="section">
        <div className="section-title">Monthly History</div>
        {[...rows].reverse().map((row, _i) => {
          const idx = rows.length - 1 - _i;
          const sur = surplus(row);
          const inc = totalIncome(row);
          const exp = totalExpense(row);
          return (
            <div key={row.rowNum} className="history-item" onClick={() => onSelect(idx)}>
              <div>
                <div className="history-month">{formatMonth(row.date)}</div>
                <div className="history-sub">
                  {formatYen(inc)} / {formatYen(exp)}
                </div>
              </div>
              <div className={`history-surplus ${sur >= 0 ? 'text-success' : 'text-danger'}`}>
                {sur >= 0 ? '+' : ''}{formatYen(sur)}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Input View ──
function InputView({ row, rows, onSave, onAdd, saving }) {
  const isNew = !row;
  const initial = row || { date: addMonths(currentMonth(), 0) };

  const [form, setForm] = useState(() => ({
    date: initial.date || currentMonth(),
    ...Object.fromEntries(INCOME_KEYS.map(k => [k, initial[k] || 0])),
    ...Object.fromEntries(EXPENSE_KEYS.map(k => [k, initial[k] || 0])),
    balanceHokyo: initial.balanceHokyo || 0,
    balanceRakuten: initial.balanceRakuten || 0,
    notes: initial.notes || '',
  }));

  useEffect(() => {
    if (!row) return;
    setForm({
      date: row.date || currentMonth(),
      ...Object.fromEntries(INCOME_KEYS.map(k => [k, row[k] || 0])),
      ...Object.fromEntries(EXPENSE_KEYS.map(k => [k, row[k] || 0])),
      balanceHokyo: row.balanceHokyo || 0,
      balanceRakuten: row.balanceRakuten || 0,
      notes: row.notes || '',
    });
  }, [row]);

  const set = (k, v) => setForm(prev => ({ ...prev, [k]: v }));

  const handleSubmit = () => {
    if (isNew || !rows.find(r => r.date === form.date)) {
      onAdd(form);
    } else {
      const { date, ...updates } = form;
      onSave(row.rowNum, updates);
    }
  };

  return (
    <div className="fade-in">
      <div className="header">
        <div className="header-top">
          <span className="header-brand">Money Flow</span>
        </div>
        <div style={{ marginTop: 4, fontSize: 15, fontWeight: 600 }}>
          {formatMonth(form.date)}
        </div>
      </div>

      <div className="section">
        <div className="section-title">Income</div>
        <div className="form-card">
          {INCOME_KEYS.map(k => (
            <div key={k} className="form-group">
              <label className="form-label">{INCOME_LABELS[k]}</label>
              <input className="form-input" type="number" inputMode="numeric"
                value={form[k]} onChange={e => set(k, Number(e.target.value))} />
            </div>
          ))}
        </div>

        <div className="section-title">Fixed Expenses</div>
        <div className="form-card">
          {['rent','loan','insurance','subscription','phone'].map(k => (
            <div key={k} className="form-group">
              <label className="form-label">{EXPENSE_LABELS[k]}</label>
              <input className="form-input" type="number" inputMode="numeric"
                value={form[k]} onChange={e => set(k, Number(e.target.value))} />
            </div>
          ))}
        </div>

        <div className="section-title">Variable Expenses</div>
        <div className="form-card">
          {['food','electric','gas','water','transport','daily','hobby','beauty','otherExpense','extraExpense'].map(k => (
            <div key={k} className="form-group">
              <label className="form-label">{EXPENSE_LABELS[k]}</label>
              <input className="form-input" type="number" inputMode="numeric"
                value={form[k]} onChange={e => set(k, Number(e.target.value))} />
            </div>
          ))}
        </div>

        <div className="section-title">Balance & Notes</div>
        <div className="form-card">
          <div className="form-group">
            <label className="form-label">北洋銀行</label>
            <input className="form-input" type="number" inputMode="numeric"
              value={form.balanceHokyo} onChange={e => set('balanceHokyo', Number(e.target.value))} />
          </div>
          <div className="form-group">
            <label className="form-label">楽天銀行</label>
            <input className="form-input" type="number" inputMode="numeric"
              value={form.balanceRakuten} onChange={e => set('balanceRakuten', Number(e.target.value))} />
          </div>
          <div className="form-group">
            <label className="form-label">備考</label>
            <textarea className="form-input form-textarea"
              value={form.notes} onChange={e => set('notes', e.target.value)} />
          </div>
        </div>

        <button className="btn btn-primary" disabled={saving} onClick={handleSubmit}>
          {saving ? '保存中...' : '保存する'}
        </button>
      </div>
    </div>
  );
}

// ── Forecast View (Simulation) ──
function ForecastView({ rows }) {
  const recent = rows.slice(-3);
  const defaultIncome = recent.length > 0
    ? Math.round(recent.reduce((s, r) => s + totalIncome(r), 0) / recent.length)
    : 200000;

  const [simIncome, setSimIncome] = useState(defaultIncome);

  const avgExpense = useMemo(() => {
    if (recent.length === 0) return 0;
    return Math.round(recent.reduce((s, r) => s + totalExpense(r), 0) / recent.length);
  }, [rows]);

  const projection = useMemo(() => {
    if (rows.length === 0) return { months: [], adjusted: [], current: [] };

    const latest = rows[rows.length - 1];
    const baseBalance = (latest.balanceHokyo || 0) + (latest.balanceRakuten || 0);
    const currentIncome = defaultIncome;
    const months = [];
    const adjusted = [];
    const current = [];

    let adjBal = baseBalance;
    let curBal = baseBalance;

    for (let i = 1; i <= 12; i++) {
      const m = addMonths(latest.date, i);
      months.push(formatShortMonth(m));

      adjBal += simIncome - avgExpense;
      adjusted.push(adjBal);

      curBal += currentIncome - avgExpense;
      current.push(curBal);
    }

    return { months, adjusted, current };
  }, [rows, simIncome, avgExpense, defaultIncome]);

  const monthlySurplus = simIncome - avgExpense;
  const yearSavings = monthlySurplus * 12;
  const savingsRate = simIncome > 0 ? Math.round((monthlySurplus / simIncome) * 100) : 0;

  // Surplus history bar chart
  const histLabels = rows.map(r => formatShortMonth(r.date));
  const histData = rows.map(r => surplus(r));

  return (
    <div className="fade-in">
      <div className="header">
        <div className="header-top">
          <span className="header-brand">Money Flow</span>
        </div>
      </div>

      {/* Simulation Controls */}
      <div className="section">
        <div className="section-title">Simulation</div>
        <div className="sim-control">
          <div className="sim-label">月収を変更して未来をシミュレーション</div>
          <div className="sim-row">
            <button className="sim-btn" onClick={() => setSimIncome(v => Math.max(0, v - 10000))}>-</button>
            <input
              className="sim-input"
              type="number"
              inputMode="numeric"
              value={simIncome}
              onChange={e => setSimIncome(Number(e.target.value))}
            />
            <button className="sim-btn" onClick={() => setSimIncome(v => v + 10000)}>+</button>
          </div>
          <div className="sim-result">
            <div className="sim-stat">
              <div className={`sim-stat-value ${monthlySurplus >= 0 ? 'text-success' : 'text-danger'}`}>
                {formatYen(monthlySurplus)}
              </div>
              <div className="sim-stat-label">月間収支</div>
            </div>
            <div className="sim-stat">
              <div className={`sim-stat-value ${yearSavings >= 0 ? 'text-success' : 'text-danger'}`}>
                {formatYen(yearSavings)}
              </div>
              <div className="sim-stat-label">年間貯蓄</div>
            </div>
            <div className="sim-stat">
              <div className="sim-stat-value text-warning">{formatYen(avgExpense)}</div>
              <div className="sim-stat-label">平均支出</div>
            </div>
            <div className="sim-stat">
              <div className={`sim-stat-value ${savingsRate >= 0 ? 'text-success' : 'text-danger'}`}>
                {savingsRate}%
              </div>
              <div className="sim-stat-label">貯蓄率</div>
            </div>
          </div>
        </div>
      </div>

      {/* Projection Chart */}
      {projection.months.length > 0 && (
        <div className="section">
          <div className="section-title">12-Month Projection</div>
          <div className="chart-card">
            <div className="chart-wrapper">
              <ProjectionChart
                months={projection.months}
                adjusted={projection.adjusted}
                current={simIncome !== defaultIncome ? projection.current : null}
              />
            </div>
          </div>
        </div>
      )}

      {/* Surplus History */}
      {rows.length > 1 && (
        <div className="section">
          <div className="section-title">Monthly Surplus History</div>
          <div className="chart-card">
            <div className="chart-wrapper">
              <SurplusBar labels={histLabels} data={histData} />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Edit Modal ──
function EditModal({ item, onSave, onClose, saving }) {
  const [value, setValue] = useState(item.value);

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <div className="modal-title">{item.label}</div>
          <button className="modal-close" onClick={onClose}>x</button>
        </div>
        <div className="form-group">
          <label className="form-label">金額</label>
          <input className="form-input" type="number" inputMode="numeric"
            value={value} autoFocus onChange={e => setValue(Number(e.target.value))} />
        </div>
        <div style={{ display: 'flex', gap: 10, marginTop: 20 }}>
          <button className="btn btn-secondary" style={{ flex: 1 }} onClick={onClose}>
            キャンセル
          </button>
          <button className="btn btn-primary" style={{ flex: 1 }} disabled={saving}
            onClick={() => onSave(item.rowNum, { [item.key]: value })}>
            {saving ? '...' : '保存'}
          </button>
        </div>
      </div>
    </div>
  );
}
