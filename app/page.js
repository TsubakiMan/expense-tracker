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

// ── Custom Label Hook ──
function useCustomLabels() {
  const [labels, setLabels] = useState({ ...EXPENSE_LABELS, ...INCOME_LABELS });

  useEffect(() => {
    try {
      const saved = localStorage.getItem('customLabels');
      if (saved) setLabels(prev => ({ ...prev, ...JSON.parse(saved) }));
    } catch {}
  }, []);

  const updateLabel = (key, newLabel) => {
    setLabels(prev => {
      const next = { ...prev, [key]: newLabel };
      try { localStorage.setItem('customLabels', JSON.stringify(next)); } catch {}
      return next;
    });
  };

  return [labels, updateLabel];
}

// ── Default Category Groups ──
const DEFAULT_GROUPS = [
  { id: 'housing', name: '住居・光熱', keys: ['rent', 'electric', 'gas', 'water'] },
  { id: 'fixed', name: '固定費', keys: ['loan', 'insurance', 'subscription', 'phone'] },
  { id: 'living', name: '生活費', keys: ['food', 'daily', 'transport'] },
  { id: 'personal', name: '個人', keys: ['hobby', 'beauty'] },
  { id: 'other', name: 'その他', keys: ['otherExpense', 'extraExpense'] },
];

function useGroups() {
  const [groups, setGroups] = useState(DEFAULT_GROUPS);

  useEffect(() => {
    try {
      const saved = localStorage.getItem('expenseGroups');
      if (saved) setGroups(JSON.parse(saved));
    } catch {}
  }, []);

  const saveGroups = (next) => {
    setGroups(next);
    try { localStorage.setItem('expenseGroups', JSON.stringify(next)); } catch {}
  };

  const updateGroups = (newGroups) => saveGroups(newGroups);

  const resetGroups = () => saveGroups(DEFAULT_GROUPS);

  return [groups, updateGroups, resetGroups];
}

// ── Number Input Helper: allows clearing the field ──
function NumInput({ value, onChange, ...props }) {
  const [display, setDisplay] = useState(String(value || ''));

  useEffect(() => {
    setDisplay(value ? String(value) : '');
  }, [value]);

  return (
    <input
      {...props}
      type="number"
      inputMode="numeric"
      className="form-input"
      placeholder="0"
      value={display}
      onFocus={e => e.target.select()}
      onChange={e => {
        setDisplay(e.target.value);
        onChange(e.target.value === '' ? 0 : Number(e.target.value));
      }}
    />
  );
}

// ── Main App ──
export default function Home() {
  const [rows, setRows] = useState([]);
  const [currentIdx, setCurrentIdx] = useState(0);
  const [view, setView] = useState('home');
  const [editModal, setEditModal] = useState(null);
  const [showSettings, setShowSettings] = useState(false);
  const [toast, setToast] = useState('');
  const [saving, setSaving] = useState(false);
  const [isDemo, setIsDemo] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [customLabels, updateLabel] = useCustomLabels();
  const [groups, updateGroups, resetGroups] = useGroups();

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

  const showToast = (msg) => { setToast(msg); setTimeout(() => setToast(''), 2500); };

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
    } catch (e) { showToast('エラー: ' + e.message); }
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
    } catch (e) { showToast('エラー: ' + e.message); }
    setSaving(false);
  };

  if (!loaded) return <div className="loading"><div className="spinner" /><span className="loading-text">Loading...</span></div>;

  const row = rows[currentIdx];
  const prevMonth = () => setCurrentIdx(i => Math.max(0, i - 1));
  const nextMonth = () => setCurrentIdx(i => Math.min(rows.length - 1, i + 1));

  return (
    <div className="app">
      {isDemo && <div className="demo-banner">DEMO MODE</div>}

      {view === 'home' && (
        <HomeView
          row={row} rows={rows} labels={customLabels} groups={groups}
          currentIdx={currentIdx} prevMonth={prevMonth} nextMonth={nextMonth}
          onEdit={(item) => setEditModal(item)}
          onSettings={() => setShowSettings(true)}
          onGoInput={() => setView('input')}
        />
      )}
      {view === 'history' && (
        <HistoryView rows={rows} onSelect={(idx) => { setCurrentIdx(idx); setView('home'); }} />
      )}
      {view === 'input' && (
        <InputView
          row={row} rows={rows} labels={customLabels}
          onSave={handleSave} onAdd={handleAdd} saving={saving}
          onSettings={() => setShowSettings(true)}
        />
      )}
      {view === 'forecast' && <ForecastView rows={rows} labels={customLabels} />}

      {editModal && (
        <EditModal item={editModal} onSave={handleSave} onClose={() => setEditModal(null)} saving={saving} />
      )}

      {showSettings && (
        <SettingsModal
          labels={customLabels} onUpdate={updateLabel}
          groups={groups} onUpdateGroups={updateGroups} onResetGroups={resetGroups}
          onClose={() => setShowSettings(false)}
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
function HomeView({ row, rows, labels, groups, currentIdx, prevMonth, nextMonth, onEdit, onSettings, onGoInput }) {
  const [expandedGroups, setExpandedGroups] = useState({});

  const toggleGroup = (id) => setExpandedGroups(prev => ({ ...prev, [id]: !prev[id] }));

  if (!row) {
    return (
      <div className="fade-in">
        <Header onSettings={onSettings} />
        <div className="empty-state">
          <div className="empty-icon">
            <svg fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
            </svg>
          </div>
          <div className="empty-title">データがありません</div>
          <div className="empty-desc">「入力」タブから最初の月次データを追加してください</div>
          <button className="btn btn-primary" style={{ width: 'auto', padding: '12px 32px' }} onClick={onGoInput}>
            データを入力する
          </button>
        </div>
      </div>
    );
  }

  const inc = totalIncome(row);
  const exp = totalExpense(row);
  const sur = surplus(row);

  // Build grouped data
  const groupedKeys = new Set(groups.flatMap(g => g.keys));
  const ungroupedItems = EXPENSE_KEYS
    .filter(k => !groupedKeys.has(k) && (row[k] || 0) > 0)
    .map(k => ({ key: k, label: labels[k] || EXPENSE_LABELS[k], amount: row[k] || 0 }));

  const groupData = groups.map((g, gi) => {
    const children = g.keys
      .map(k => ({ key: k, label: labels[k] || EXPENSE_LABELS[k], amount: row[k] || 0 }))
      .filter(c => c.amount > 0);
    const total = children.reduce((s, c) => s + c.amount, 0);
    return { ...g, children, total, colorIdx: gi };
  }).filter(g => g.total > 0);

  // Donut: group-level data
  const donutData = [...groupData.map(g => g.total), ...ungroupedItems.map(u => u.amount)];
  const donutLabels = [...groupData.map(g => g.name), ...ungroupedItems.map(u => u.label)];
  const maxGroupExp = Math.max(...groupData.map(g => g.total), ...ungroupedItems.map(u => u.amount), 1);

  return (
    <div className="fade-in">
      <div className="header">
        <div className="header-top">
          <span className="header-brand">Money Flow</span>
          <div className="header-actions">
            <div className="month-nav">
              <button onClick={prevMonth} disabled={currentIdx === 0}>&lt;</button>
              <span className="current-month">{formatMonth(row.date)}</span>
              <button onClick={nextMonth} disabled={currentIdx === rows.length - 1}>&gt;</button>
            </div>
            <button className="settings-pill" onClick={onSettings}>
              <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4" />
              </svg>
              設定
            </button>
          </div>
        </div>
      </div>

      <div className="hero">
        <div className="hero-label">Monthly Balance</div>
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

      <div className="section">
        <div className="section-title">Income</div>
        <div className="card">
          {INCOME_KEYS.map(k => {
            const v = row[k] || 0;
            if (v === 0) return null;
            return (
              <div key={k} className="stat-row">
                <span className="stat-label">{labels[k] || INCOME_LABELS[k]}</span>
                <span className="stat-value income">{formatYen(v)}</span>
              </div>
            );
          })}
          {INCOME_KEYS.every(k => !row[k]) && (
            <div style={{ padding: '8px 0', fontSize: 13, color: 'var(--text-muted)' }}>収入データなし</div>
          )}
        </div>
      </div>

      {donutData.length > 0 && (
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
              {donutLabels.map((lbl, i) => (
                <span key={i} className="legend-item">
                  <span className="legend-dot" style={{ background: CHART_COLORS[i % CHART_COLORS.length] }} />
                  {lbl}
                </span>
              ))}
            </div>
          </div>
        </div>
      )}

      <div className="section">
        <div className="section-title">Breakdown</div>
        <div className="expense-bars">
          {groupData.map((g, gi) => (
            <div key={g.id} className="group-card">
              <div className="group-header" onClick={() => toggleGroup(g.id)}>
                <div className="group-header-left">
                  <span className="group-color" style={{ background: CHART_COLORS[gi % CHART_COLORS.length] }} />
                  <span className="group-name">{g.name}</span>
                  <span className="group-count">{g.children.length}</span>
                </div>
                <div className="group-header-right">
                  <span className="group-total">{formatYen(g.total)}</span>
                  <svg className={`group-chevron ${expandedGroups[g.id] ? 'open' : ''}`}
                    width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                  </svg>
                </div>
              </div>
              <div className="group-bar-track">
                <div className="group-bar-fill" style={{
                  width: `${(g.total / maxGroupExp) * 100}%`,
                  background: CHART_COLORS[gi % CHART_COLORS.length],
                  opacity: 0.6,
                }} />
              </div>
              {expandedGroups[g.id] && (
                <div className="group-children">
                  {g.children.map(c => (
                    <div key={c.key} className="group-child"
                      onClick={() => onEdit({ key: c.key, label: c.label, value: c.amount, rowNum: row.rowNum })}>
                      <span className="group-child-label">{c.label}</span>
                      <span className="group-child-amount">{formatYen(c.amount)}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}

          {ungroupedItems.map(e => (
            <div key={e.key} className="expense-bar-item"
              onClick={() => onEdit({ key: e.key, label: e.label, value: e.amount, rowNum: row.rowNum })}>
              <div className="expense-bar-item-top">
                <span className="label">{e.label}</span>
                <span className="amount">{formatYen(e.amount)}</span>
              </div>
              <div className="expense-bar-track">
                <div className="expense-bar-fill" style={{ width: `${(e.amount / maxGroupExp) * 100}%` }} />
              </div>
            </div>
          ))}

          {groupData.length === 0 && ungroupedItems.length === 0 && (
            <div className="card" style={{ padding: 16, textAlign: 'center', color: 'var(--text-muted)', fontSize: 13 }}>
              支出データなし
            </div>
          )}
        </div>
      </div>

      {row.notes && (
        <div className="section">
          <div className="section-title">Notes</div>
          <div className="card" style={{ padding: 14, fontSize: 13, color: 'var(--text-secondary)' }}>{row.notes}</div>
        </div>
      )}
    </div>
  );
}

// ── Header (reusable) ──
function Header({ onSettings }) {
  return (
    <div className="header">
      <div className="header-top">
        <span className="header-brand">Money Flow</span>
        {onSettings && (
          <button className="settings-pill" onClick={onSettings}>
            <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4" />
            </svg>
            設定
          </button>
        )}
      </div>
    </div>
  );
}

// ── History View ──
function HistoryView({ rows, onSelect }) {
  return (
    <div className="fade-in">
      <div className="header"><div className="header-top"><span className="header-brand">Money Flow</span></div></div>
      <div className="section">
        <div className="section-title">Monthly History</div>
        {rows.length === 0 && (
          <div className="card" style={{ padding: 20, textAlign: 'center', color: 'var(--text-muted)', fontSize: 13 }}>
            データがありません
          </div>
        )}
        {[...rows].reverse().map((row, _i) => {
          const idx = rows.length - 1 - _i;
          const sur = surplus(row);
          return (
            <div key={row.rowNum} className="history-item" onClick={() => onSelect(idx)}>
              <div>
                <div className="history-month">{formatMonth(row.date)}</div>
                <div className="history-sub">{formatYen(totalIncome(row))} / {formatYen(totalExpense(row))}</div>
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
function InputView({ row, rows, labels, onSave, onAdd, saving, onSettings }) {
  const initial = row || {};
  const [form, setForm] = useState(() => buildForm(initial));

  useEffect(() => { if (row) setForm(buildForm(row)); }, [row]);

  function buildForm(src) {
    return {
      date: src.date || currentMonth(),
      ...Object.fromEntries(INCOME_KEYS.map(k => [k, src[k] || 0])),
      ...Object.fromEntries(EXPENSE_KEYS.map(k => [k, src[k] || 0])),
      balanceHokyo: src.balanceHokyo || 0,
      balanceRakuten: src.balanceRakuten || 0,
      notes: src.notes || '',
    };
  }

  const set = (k, v) => setForm(prev => ({ ...prev, [k]: v }));

  const handleSubmit = () => {
    if (!row || !rows.find(r => r.date === form.date)) {
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
          <button className="settings-pill" onClick={onSettings}>
            <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4" />
            </svg>
            設定
          </button>
        </div>
        <div style={{ marginTop: 6, fontSize: 15, fontWeight: 700 }}>{formatMonth(form.date)}</div>
      </div>

      <div className="section">
        <div className="section-title">Income</div>
        <div className="form-card">
          {INCOME_KEYS.map(k => (
            <div key={k} className="form-group">
              <label className="form-label">{labels[k] || INCOME_LABELS[k]}</label>
              <NumInput value={form[k]} onChange={v => set(k, v)} />
            </div>
          ))}
        </div>

        <div className="section-title">Fixed Expenses</div>
        <div className="form-card">
          {['rent','loan','insurance','subscription','phone'].map(k => (
            <div key={k} className="form-group">
              <label className="form-label">{labels[k] || EXPENSE_LABELS[k]}</label>
              <NumInput value={form[k]} onChange={v => set(k, v)} />
            </div>
          ))}
        </div>

        <div className="section-title">Variable Expenses</div>
        <div className="form-card">
          {['food','electric','gas','water','transport','daily','hobby','beauty','otherExpense','extraExpense'].map(k => (
            <div key={k} className="form-group">
              <label className="form-label">{labels[k] || EXPENSE_LABELS[k]}</label>
              <NumInput value={form[k]} onChange={v => set(k, v)} />
            </div>
          ))}
        </div>

        <div className="section-title">Balance & Notes</div>
        <div className="form-card">
          <div className="form-group">
            <label className="form-label">北洋銀行</label>
            <NumInput value={form.balanceHokyo} onChange={v => set('balanceHokyo', v)} />
          </div>
          <div className="form-group">
            <label className="form-label">楽天銀行</label>
            <NumInput value={form.balanceRakuten} onChange={v => set('balanceRakuten', v)} />
          </div>
          <div className="form-group">
            <label className="form-label">備考</label>
            <textarea className="form-input form-textarea" placeholder="メモを入力..."
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

// ── Forecast View ──
function ForecastView({ rows, labels }) {
  const recent = rows.slice(-3);
  const defaultIncome = recent.length > 0
    ? Math.round(recent.reduce((s, r) => s + totalIncome(r), 0) / recent.length) : 200000;
  const defaultExpense = recent.length > 0
    ? Math.round(recent.reduce((s, r) => s + totalExpense(r), 0) / recent.length) : 150000;

  const [simIncome, setSimIncome] = useState(defaultIncome);
  const [simExpense, setSimExpense] = useState(defaultExpense);

  const incomeChanged = simIncome !== defaultIncome;
  const expenseChanged = simExpense !== defaultExpense;
  const isChanged = incomeChanged || expenseChanged;
  const incomeDiff = simIncome - defaultIncome;
  const expenseDiff = simExpense - defaultExpense;

  const projection = useMemo(() => {
    if (rows.length === 0) return [];
    const latest = rows[rows.length - 1];
    const baseBalance = (latest.balanceHokyo || 0) + (latest.balanceRakuten || 0);
    const result = [];
    let adjBal = baseBalance;
    let curBal = baseBalance;

    for (let i = 1; i <= 12; i++) {
      const date = addMonths(latest.date, i);
      const adjSurplus = simIncome - simExpense;
      const curSurplus = defaultIncome - defaultExpense;
      adjBal += adjSurplus;
      curBal += curSurplus;
      result.push({
        date,
        label: formatShortMonth(date),
        fullLabel: formatMonth(date),
        income: simIncome,
        expense: simExpense,
        surplus: adjSurplus,
        balance: adjBal,
        currentBalance: curBal,
      });
    }
    return result;
  }, [rows, simIncome, simExpense, defaultIncome, defaultExpense]);

  const monthlySurplus = simIncome - simExpense;
  const yearSavings = monthlySurplus * 12;
  const savingsRate = simIncome > 0 ? Math.round((monthlySurplus / simIncome) * 100) : 0;

  const histLabels = rows.map(r => formatShortMonth(r.date));
  const histData = rows.map(r => surplus(r));

  return (
    <div className="fade-in">
      <div className="header"><div className="header-top"><span className="header-brand">Money Flow</span></div></div>

      {/* Income & Expense Controls */}
      <div className="section">
        <div className="section-title">Simulation</div>
        <div className="sim-control">
          <div className="sim-label-row">
            <span className="sim-label">月収 (Income)</span>
            {incomeChanged && (
              <button className="sim-reset-inline" onClick={() => setSimIncome(defaultIncome)}>
                <svg width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h5M20 20v-5h-5M4.49 9A8 8 0 0120 12M19.51 15A8 8 0 014 12" />
                </svg>
                戻す
              </button>
            )}
          </div>
          <div className={`sim-row ${incomeChanged ? 'sim-row-changed' : ''}`}>
            <button className="sim-btn" onClick={() => setSimIncome(v => Math.max(0, v - 10000))}>-</button>
            <input className={`sim-input ${incomeChanged ? 'sim-input-changed' : ''}`} type="number" inputMode="numeric"
              value={simIncome} onChange={e => setSimIncome(Number(e.target.value) || 0)} />
            <button className="sim-btn" onClick={() => setSimIncome(v => v + 10000)}>+</button>
          </div>
          {incomeChanged && (
            <div className="sim-diff">
              ベース {formatYen(defaultIncome)} → {formatYen(simIncome)}
              <span className={incomeDiff >= 0 ? 'text-success' : 'text-danger'}>
                ({incomeDiff >= 0 ? '+' : ''}{formatYen(incomeDiff)})
              </span>
            </div>
          )}

          <div className="sim-label-row" style={{ marginTop: 14 }}>
            <span className="sim-label">月間支出 (Expense)</span>
            {expenseChanged && (
              <button className="sim-reset-inline" onClick={() => setSimExpense(defaultExpense)}>
                <svg width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h5M20 20v-5h-5M4.49 9A8 8 0 0120 12M19.51 15A8 8 0 014 12" />
                </svg>
                戻す
              </button>
            )}
          </div>
          <div className={`sim-row ${expenseChanged ? 'sim-row-changed' : ''}`}>
            <button className="sim-btn" onClick={() => setSimExpense(v => Math.max(0, v - 10000))}>-</button>
            <input className={`sim-input ${expenseChanged ? 'sim-input-changed' : ''}`} type="number" inputMode="numeric"
              value={simExpense} onChange={e => setSimExpense(Number(e.target.value) || 0)} />
            <button className="sim-btn" onClick={() => setSimExpense(v => v + 10000)}>+</button>
          </div>
          {expenseChanged && (
            <div className="sim-diff">
              ベース {formatYen(defaultExpense)} → {formatYen(simExpense)}
              <span className={expenseDiff <= 0 ? 'text-success' : 'text-danger'}>
                ({expenseDiff >= 0 ? '+' : ''}{formatYen(expenseDiff)})
              </span>
            </div>
          )}

          {isChanged && (
            <button className="sim-reset-all" onClick={() => { setSimIncome(defaultIncome); setSimExpense(defaultExpense); }}>
              <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h5M20 20v-5h-5M4.49 9A8 8 0 0120 12M19.51 15A8 8 0 014 12" />
              </svg>
              すべてリセット
            </button>
          )}

          <div className="sim-result">
            <div className="sim-stat">
              <div className={`sim-stat-value ${monthlySurplus >= 0 ? 'text-success' : 'text-danger'}`}>{formatYen(monthlySurplus)}</div>
              <div className="sim-stat-label">月間収支</div>
            </div>
            <div className="sim-stat">
              <div className={`sim-stat-value ${yearSavings >= 0 ? 'text-success' : 'text-danger'}`}>{formatYen(yearSavings)}</div>
              <div className="sim-stat-label">年間貯蓄</div>
            </div>
            <div className="sim-stat">
              <div className={`sim-stat-value ${savingsRate >= 0 ? 'text-success' : 'text-danger'}`}>{savingsRate}%</div>
              <div className="sim-stat-label">貯蓄率</div>
            </div>
            <div className="sim-stat">
              <div className="sim-stat-value">{formatYen(projection[11]?.balance || 0)}</div>
              <div className="sim-stat-label">12ヶ月後残高</div>
            </div>
          </div>
        </div>
      </div>

      {/* Projection Chart */}
      {projection.length > 0 && (
        <div className="section">
          <div className="section-title">Balance Projection</div>
          <div className="chart-card">
            <div className="chart-wrapper">
              <ProjectionChart
                months={projection.map(p => p.label)}
                adjusted={projection.map(p => p.balance)}
                current={isChanged ? projection.map(p => p.currentBalance) : null}
              />
            </div>
          </div>
        </div>
      )}

      {/* Month-by-Month Table */}
      {projection.length > 0 && (
        <div className="section">
          <div className="section-title">Monthly Detail</div>
          <div className="proj-table-wrap">
            <table className="proj-table">
              <thead>
                <tr>
                  <th>月</th>
                  <th>収入</th>
                  <th>支出</th>
                  <th>収支</th>
                  <th>残高</th>
                </tr>
              </thead>
              <tbody>
                {projection.map((p, i) => (
                  <tr key={i}>
                    <td className="proj-month">{p.fullLabel}</td>
                    <td className="text-success">{formatYen(p.income)}</td>
                    <td className="text-danger">{formatYen(p.expense)}</td>
                    <td className={p.surplus >= 0 ? 'text-success' : 'text-danger'}>
                      {p.surplus >= 0 ? '+' : ''}{formatYen(p.surplus)}
                    </td>
                    <td className="proj-balance">{formatYen(p.balance)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Surplus History */}
      {rows.length > 1 && (
        <div className="section">
          <div className="section-title">Surplus History</div>
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
          <NumInput value={value} onChange={setValue} />
        </div>
        <div style={{ display: 'flex', gap: 10, marginTop: 20 }}>
          <button className="btn btn-secondary" style={{ flex: 1 }} onClick={onClose}>キャンセル</button>
          <button className="btn btn-primary" style={{ flex: 1 }} disabled={saving}
            onClick={() => onSave(item.rowNum, { [item.key]: value })}>
            {saving ? '...' : '保存'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Settings Modal ──
function SettingsModal({ labels, onUpdate, groups, onUpdateGroups, onResetGroups, onClose }) {
  const [tab, setTab] = useState('labels');
  const [editingGroup, setEditingGroup] = useState(null);
  const [newGroupName, setNewGroupName] = useState('');

  const addGroup = () => {
    if (!newGroupName.trim()) return;
    const id = 'g_' + Date.now();
    onUpdateGroups([...groups, { id, name: newGroupName.trim(), keys: [] }]);
    setNewGroupName('');
  };

  const renameGroup = (id, name) => {
    onUpdateGroups(groups.map(g => g.id === id ? { ...g, name } : g));
  };

  const deleteGroup = (id) => {
    onUpdateGroups(groups.filter(g => g.id !== id));
  };

  const toggleKeyInGroup = (groupId, key) => {
    onUpdateGroups(groups.map(g => {
      if (g.id !== groupId) {
        return { ...g, keys: g.keys.filter(k => k !== key) };
      }
      if (g.keys.includes(key)) {
        return { ...g, keys: g.keys.filter(k => k !== key) };
      }
      return { ...g, keys: [...g.keys, key] };
    }));
  };

  const assignedKeys = new Set(groups.flatMap(g => g.keys));

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <div className="modal-title">設定</div>
          <button className="modal-close" onClick={onClose}>x</button>
        </div>

        <div className="settings-tabs">
          <button className={`settings-tab ${tab === 'labels' ? 'active' : ''}`}
            onClick={() => setTab('labels')}>カテゴリ名</button>
          <button className={`settings-tab ${tab === 'groups' ? 'active' : ''}`}
            onClick={() => setTab('groups')}>グループ</button>
        </div>

        {tab === 'labels' && (
          <>
            <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 16 }}>
              名称をタップして変更できます
            </div>
            <div style={{ marginBottom: 16 }}>
              <div className="section-title">Income</div>
              {INCOME_KEYS.map(k => (
                <div key={k} className="settings-item">
                  <span className="settings-label">{INCOME_LABELS[k]}</span>
                  <input className="settings-input" value={labels[k] || ''}
                    onChange={e => onUpdate(k, e.target.value)} />
                </div>
              ))}
            </div>
            <div>
              <div className="section-title">Expenses</div>
              {EXPENSE_KEYS.map(k => (
                <div key={k} className="settings-item">
                  <span className="settings-label">{EXPENSE_LABELS[k]}</span>
                  <input className="settings-input" value={labels[k] || ''}
                    onChange={e => onUpdate(k, e.target.value)} />
                </div>
              ))}
            </div>
          </>
        )}

        {tab === 'groups' && (
          <>
            <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 16 }}>
              支出カテゴリをグループにまとめます。グループの合計が自動計算されます。
            </div>

            {groups.map(g => (
              <div key={g.id} className="group-setting-card">
                <div className="group-setting-header">
                  {editingGroup === g.id ? (
                    <input className="settings-input" autoFocus
                      value={g.name}
                      onChange={e => renameGroup(g.id, e.target.value)}
                      onBlur={() => setEditingGroup(null)}
                      onKeyDown={e => e.key === 'Enter' && setEditingGroup(null)}
                      style={{ flex: 1, fontSize: 13 }}
                    />
                  ) : (
                    <span className="group-setting-name" onClick={() => setEditingGroup(g.id)}>
                      {g.name}
                    </span>
                  )}
                  <button className="group-setting-delete" onClick={() => deleteGroup(g.id)}>
                    <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                    </svg>
                  </button>
                </div>
                <div className="group-setting-keys">
                  {EXPENSE_KEYS.map(k => {
                    const inThis = g.keys.includes(k);
                    const inOther = !inThis && assignedKeys.has(k);
                    return (
                      <button key={k}
                        className={`group-key-chip ${inThis ? 'active' : ''} ${inOther ? 'disabled' : ''}`}
                        disabled={inOther}
                        onClick={() => toggleKeyInGroup(g.id, k)}>
                        {labels[k] || EXPENSE_LABELS[k]}
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}

            <div className="group-add-row">
              <input className="settings-input" placeholder="新しいグループ名..."
                value={newGroupName} onChange={e => setNewGroupName(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && addGroup()}
                style={{ flex: 1, fontSize: 13 }} />
              <button className="btn btn-primary" style={{ width: 'auto', padding: '8px 16px', fontSize: 13 }}
                onClick={addGroup}>追加</button>
            </div>

            <button className="btn btn-secondary" style={{ marginTop: 12, fontSize: 12, padding: '10px' }}
              onClick={onResetGroups}>デフォルトに戻す</button>
          </>
        )}

        <button className="btn btn-primary" style={{ marginTop: 20 }} onClick={onClose}>
          完了
        </button>
      </div>
    </div>
  );
}
