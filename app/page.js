'use client';

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { fetchAllData, updateRow, addRow, fetchSettings, saveSettings } from '../lib/api';
import {
  formatYen, formatMonth, formatShortMonth, currentMonth, addMonths,
  totalIncome, totalExpense, surplus,
  INCOME_KEYS, EXPENSE_KEYS, INCOME_LABELS, EXPENSE_LABELS,
  BUILTIN_KEYS, MAX_CATEGORIES, isCustomKey,
} from '../lib/utils';
import { ExpenseDonut, ProjectionChart, SurplusBar, CHART_COLORS } from '../components/Charts';

// ── Haptic Feedback ──
const haptic = {
  light:  () => { try { navigator?.vibrate?.(10); } catch {} },
  medium: () => { try { navigator?.vibrate?.(18); } catch {} },
  heavy:  () => { try { navigator?.vibrate?.(30); } catch {} },
  success:() => { try { navigator?.vibrate?.([12, 60, 12]); } catch {} },
  error:  () => { try { navigator?.vibrate?.([30, 50, 30, 50, 30]); } catch {} },
  tick:   () => { try { navigator?.vibrate?.(6); } catch {} },
};

// ── Demo Data ──
const DEMO_ROWS = [
  { rowNum:2, date:'2025-11', salary:220000, sideIncome:0, otherIncome:0, rent:43270, food:42000, electric:4200, gas:3500, water:3200, phone:5350, subscription:3980, transport:6000, daily:2800, insurance:5000, loan:15000, hobby:5000, beauty:0, otherExpense:2000, extraExpense:0, balanceHokyo:385000, balanceRakuten:290000, notes:'' },
  { rowNum:3, date:'2025-12', salary:220000, sideIncome:0, otherIncome:50000, rent:43270, food:52000, electric:5800, gas:5200, water:3200, phone:5350, subscription:3980, transport:8000, daily:4500, insurance:5000, loan:15000, hobby:15000, beauty:5000, otherExpense:5000, extraExpense:30000, balanceHokyo:370000, balanceRakuten:265000, notes:'' },
  { rowNum:4, date:'2026-01', salary:220000, sideIncome:0, otherIncome:0, rent:43270, food:45000, electric:7200, gas:6500, water:3200, phone:5350, subscription:3980, transport:5000, daily:3000, insurance:5000, loan:15000, hobby:4000, beauty:0, otherExpense:2000, extraExpense:0, balanceHokyo:356500, balanceRakuten:260000, notes:'' },
  { rowNum:5, date:'2026-02', salary:220000, sideIncome:0, otherIncome:0, rent:43270, food:44000, electric:7800, gas:7000, water:3200, phone:5350, subscription:3980, transport:5500, daily:2500, insurance:5000, loan:15000, hobby:3000, beauty:5000, otherExpense:1500, extraExpense:0, balanceHokyo:340900, balanceRakuten:257000, notes:'' },
  { rowNum:6, date:'2026-03', salary:220000, sideIncome:15000, otherIncome:0, rent:43270, food:46000, electric:5500, gas:4500, water:3200, phone:5350, subscription:3980, transport:7000, daily:3200, insurance:5000, loan:15000, hobby:8000, beauty:0, otherExpense:3000, extraExpense:15000, balanceHokyo:328400, balanceRakuten:255000, notes:'' },
  { rowNum:7, date:'2026-04', salary:220000, sideIncome:0, otherIncome:0, rent:43270, food:48000, electric:4500, gas:3800, water:3200, phone:5350, subscription:3980, transport:6500, daily:2800, insurance:5000, loan:15000, hobby:6000, beauty:5000, otherExpense:2000, extraExpense:0, balanceHokyo:322000, balanceRakuten:252000, notes:'' },
];

// ── Cloud Settings Sync ──
// Debounced save: collects all pending changes, sends once after 800ms idle
const _pendingSettings = {};
let _saveTimer = null;
let _isDemo = false;

function queueSettingsSave(key, value) {
  _pendingSettings[key] = value;
  if (_saveTimer) clearTimeout(_saveTimer);
  _saveTimer = setTimeout(() => {
    if (_isDemo) return;
    const toSave = { ..._pendingSettings };
    for (const k in _pendingSettings) delete _pendingSettings[k];
    saveSettings(toSave).catch(() => {});
  }, 800);
}

function saveLocal(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch {}
  queueSettingsSave(key, value);
}

// ── Custom Label Hook ──
function useCustomLabels(cloudSettings) {
  const [labels, setLabels] = useState({ ...EXPENSE_LABELS, ...INCOME_LABELS });
  const initialized = useRef(false);

  useEffect(() => {
    try {
      const saved = localStorage.getItem('customLabels');
      if (saved) setLabels(prev => ({ ...prev, ...JSON.parse(saved) }));
    } catch {}
  }, []);

  // Apply cloud settings when loaded
  useEffect(() => {
    if (!cloudSettings || initialized.current) return;
    if (cloudSettings.customLabels) {
      setLabels(prev => ({ ...prev, ...cloudSettings.customLabels }));
      try { localStorage.setItem('customLabels', JSON.stringify(cloudSettings.customLabels)); } catch {}
    }
    initialized.current = true;
  }, [cloudSettings]);

  const updateLabel = (key, newLabel) => {
    setLabels(prev => {
      const next = { ...prev, [key]: newLabel };
      saveLocal('customLabels', next);
      return next;
    });
  };

  return [labels, updateLabel];
}

// ── Custom Categories Hook ──
function useCustomCategories(cloudSettings) {
  const [cats, setCats] = useState([]);
  const initialized = useRef(false);

  useEffect(() => {
    try {
      const saved = localStorage.getItem('customCategories');
      if (saved) setCats(JSON.parse(saved));
    } catch {}
  }, []);

  useEffect(() => {
    if (!cloudSettings || initialized.current) return;
    if (cloudSettings.customCategories) {
      setCats(cloudSettings.customCategories);
      try { localStorage.setItem('customCategories', JSON.stringify(cloudSettings.customCategories)); } catch {}
    }
    initialized.current = true;
  }, [cloudSettings]);

  const saveCats = (next) => {
    setCats(next);
    saveLocal('customCategories', next);
  };

  const nextKey = (type) => {
    const prefix = type === 'income' ? 'ci_' : 'cx_';
    const existing = cats.filter(c => c.key.startsWith(prefix)).map(c => parseInt(c.key.split('_')[1]));
    const next = existing.length > 0 ? Math.max(...existing) + 1 : 1;
    return prefix + next;
  };

  const add = (label, type) => {
    const key = nextKey(type);
    saveCats([...cats, { key, label, type }]);
    return key;
  };

  const remove = (key) => {
    saveCats(cats.filter(c => c.key !== key));
  };

  const rename = (key, label) => {
    saveCats(cats.map(c => c.key === key ? { ...c, label } : c));
  };

  const customExpenseKeys = cats.filter(c => c.type === 'expense').map(c => c.key);
  const customIncomeKeys = cats.filter(c => c.type === 'income').map(c => c.key);
  const customLabelsMap = Object.fromEntries(cats.map(c => [c.key, c.label]));

  const totalCount = INCOME_KEYS.length + EXPENSE_KEYS.length + cats.length;
  const canAdd = totalCount < MAX_CATEGORIES;

  return { cats, add, remove, rename, customExpenseKeys, customIncomeKeys, customLabelsMap, canAdd, totalCount };
}

// ── Category Order & Visibility Hook ──
function useCategoryConfig(customExpenseKeys, customIncomeKeys, cloudSettings) {
  const [config, setConfig] = useState({
    income: [...INCOME_KEYS],
    expense: [...EXPENSE_KEYS],
  });
  const initialized = useRef(false);

  useEffect(() => {
    try {
      const saved = localStorage.getItem('categoryConfig');
      if (saved) {
        const parsed = JSON.parse(saved);
        const validIncome = new Set([...INCOME_KEYS, ...customIncomeKeys]);
        const validExpense = new Set([...EXPENSE_KEYS, ...customExpenseKeys]);
        setConfig({
          income: (parsed.income || []).filter(k => validIncome.has(k)),
          expense: (parsed.expense || []).filter(k => validExpense.has(k)),
        });
      }
    } catch {}
  }, [customExpenseKeys.length, customIncomeKeys.length]);

  useEffect(() => {
    if (!cloudSettings || initialized.current) return;
    if (cloudSettings.categoryConfig) {
      const parsed = cloudSettings.categoryConfig;
      const validIncome = new Set([...INCOME_KEYS, ...customIncomeKeys]);
      const validExpense = new Set([...EXPENSE_KEYS, ...customExpenseKeys]);
      const next = {
        income: (parsed.income || []).filter(k => validIncome.has(k)),
        expense: (parsed.expense || []).filter(k => validExpense.has(k)),
      };
      setConfig(next);
      try { localStorage.setItem('categoryConfig', JSON.stringify(next)); } catch {}
    }
    initialized.current = true;
  }, [cloudSettings, customExpenseKeys.length, customIncomeKeys.length]);

  // Ensure newly added custom keys appear in config
  useEffect(() => {
    setConfig(prev => {
      let changed = false;
      const incomeSet = new Set(prev.income);
      const expenseSet = new Set(prev.expense);
      const newIncome = [...prev.income];
      const newExpense = [...prev.expense];
      for (const k of customIncomeKeys) {
        if (!incomeSet.has(k)) { newIncome.push(k); changed = true; }
      }
      for (const k of customExpenseKeys) {
        if (!expenseSet.has(k)) { newExpense.push(k); changed = true; }
      }
      if (!changed) return prev;
      const next = { income: newIncome, expense: newExpense };
      saveLocal('categoryConfig', next);
      return next;
    });
  }, [customExpenseKeys.length, customIncomeKeys.length]);

  const save = (next) => {
    setConfig(next);
    saveLocal('categoryConfig', next);
  };

  const reorder = (type, fromIdx, toIdx) => {
    const arr = [...config[type]];
    const [item] = arr.splice(fromIdx, 1);
    arr.splice(toIdx, 0, item);
    save({ ...config, [type]: arr });
  };

  const hide = (type, key) => {
    save({ ...config, [type]: config[type].filter(k => k !== key) });
  };

  const show = (type, key) => {
    save({ ...config, [type]: [...config[type], key] });
  };

  const reset = () => {
    save({
      income: [...INCOME_KEYS, ...customIncomeKeys],
      expense: [...EXPENSE_KEYS, ...customExpenseKeys],
    });
  };

  return [config, { reorder, hide, show, reset }];
}

// ── Default Category Groups ──
const DEFAULT_GROUPS = [
  { id: 'housing', name: '住居・光熱', keys: ['rent', 'electric', 'gas', 'water'] },
  { id: 'fixed', name: '固定費', keys: ['loan', 'insurance', 'subscription', 'phone'] },
  { id: 'living', name: '生活費', keys: ['food', 'daily', 'transport'] },
  { id: 'personal', name: '個人', keys: ['hobby', 'beauty'] },
  { id: 'other', name: 'その他', keys: ['otherExpense', 'extraExpense'] },
];

function useGroups(cloudSettings) {
  const [groups, setGroups] = useState(DEFAULT_GROUPS);
  const initialized = useRef(false);

  useEffect(() => {
    try {
      const saved = localStorage.getItem('expenseGroups');
      if (saved) setGroups(JSON.parse(saved));
    } catch {}
  }, []);

  useEffect(() => {
    if (!cloudSettings || initialized.current) return;
    if (cloudSettings.expenseGroups) {
      setGroups(cloudSettings.expenseGroups);
      try { localStorage.setItem('expenseGroups', JSON.stringify(cloudSettings.expenseGroups)); } catch {}
    }
    initialized.current = true;
  }, [cloudSettings]);

  const saveGroups = (next) => {
    setGroups(next);
    saveLocal('expenseGroups', next);
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
  const [cloudSettings, setCloudSettings] = useState(null);
  const [customLabels, updateLabel] = useCustomLabels(cloudSettings);
  const [groups, updateGroups, resetGroups] = useGroups(cloudSettings);
  const customCats = useCustomCategories(cloudSettings);
  const [catConfig, catActions] = useCategoryConfig(customCats.customExpenseKeys, customCats.customIncomeKeys, cloudSettings);
  const [newCatModal, setNewCatModal] = useState(null); // 'income' | 'expense' | null

  // Merged labels: built-in labels + custom labels + user overrides
  const allLabels = useMemo(() => ({
    ...EXPENSE_LABELS, ...INCOME_LABELS, ...customCats.customLabelsMap, ...customLabels
  }), [customLabels, customCats.customLabelsMap]);

  // ── History-based navigation ──
  const isPopping = useRef(false);

  // Set initial history state
  useEffect(() => {
    history.replaceState({ view: 'home' }, '');
  }, []);

  // Navigate to a view (push history)
  const navigate = useCallback((newView) => {
    if (isPopping.current) return;
    setView(newView);
    history.pushState({ view: newView }, '');
  }, []);

  // Open modal (push history layer)
  const openEditModal = useCallback((item) => {
    haptic.medium();
    setEditModal(item);
    history.pushState({ view, modal: 'edit' }, '');
  }, [view]);

  const openSettings = useCallback(() => {
    haptic.light();
    setShowSettings(true);
    history.pushState({ view, modal: 'settings' }, '');
  }, [view]);

  const openNewCatModal = useCallback((type) => {
    haptic.light();
    setNewCatModal(type);
    history.pushState({ view, modal: 'newcat' }, '');
  }, [view]);

  // Close modal without pushState (used by popstate and direct close)
  const closeEditModal = useCallback(() => setEditModal(null), []);
  const closeSettings = useCallback(() => setShowSettings(false), []);
  const closeNewCatModal = useCallback(() => setNewCatModal(null), []);

  // Close modal with history.back (used by UI close buttons)
  const closeEditModalWithBack = useCallback(() => { history.back(); }, []);
  const closeSettingsWithBack = useCallback(() => { history.back(); }, []);
  const closeNewCatModalWithBack = useCallback(() => { history.back(); }, []);

  // Listen for popstate (browser back)
  useEffect(() => {
    const onPopState = (e) => {
      isPopping.current = true;
      const state = e.state || { view: 'home' };

      if (newCatModal) {
        setNewCatModal(null);
      } else if (editModal) {
        setEditModal(null);
      } else if (showSettings) {
        setShowSettings(false);
      } else {
        setView(state.view || 'home');
      }

      isPopping.current = false;
    };
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, [editModal, showSettings, newCatModal]);

  const loadData = useCallback(async () => {
    try {
      // Single API call — getAllData now includes settings
      const result = await fetchAllData();
      if (result.error) throw new Error(result.error);
      setRows(result.rows || []);
      const cm = currentMonth();
      const idx = (result.rows || []).findIndex(r => r.date === cm);
      setCurrentIdx(idx >= 0 ? idx : Math.max(0, (result.rows || []).length - 1));

      const cloud = result.settings || {};
      const SETTINGS_KEYS = ['customLabels', 'categoryConfig', 'expenseGroups', 'customCategories'];
      const cloudHasData = SETTINGS_KEYS.some(k => cloud[k]);

      if (cloudHasData) {
        setCloudSettings(cloud);
      }

      // Push local settings that cloud doesn't have yet
      const localSettings = {};
      SETTINGS_KEYS.forEach(k => {
        if (!cloud[k]) {
          try {
            const val = localStorage.getItem(k);
            if (val) localSettings[k] = JSON.parse(val);
          } catch {}
        }
      });
      if (Object.keys(localSettings).length > 0) {
        saveSettings(localSettings).catch(() => {});
      }
    } catch {
      setRows(DEMO_ROWS);
      setIsDemo(true);
      _isDemo = true;
      setCurrentIdx(DEMO_ROWS.length - 1);
    }
    setLoaded(true);
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  const showToast = (msg, isError) => {
    setToast(msg);
    isError ? haptic.error() : haptic.success();
    setTimeout(() => setToast(''), 2500);
  };

  const handleSave = async (rowNum, updates) => {
    setSaving(true);
    // Optimistic update — apply locally first
    setRows(prev => prev.map(r => r.rowNum === rowNum ? { ...r, ...updates } : r));
    if (editModal) closeEditModalWithBack();
    showToast('保存しました');
    setSaving(false);
    // Persist in background
    if (!isDemo) {
      try { await updateRow({ rowNum, ...updates }); }
      catch (e) { showToast('同期エラー: ' + e.message, true); loadData(); }
    }
  };

  const handleAdd = async (newData) => {
    setSaving(true);
    // Optimistic update
    const tempRowNum = rows.length > 0 ? Math.max(...rows.map(r => r.rowNum)) + 1 : 2;
    setRows(prev => [...prev, { rowNum: tempRowNum, ...newData }]);
    setCurrentIdx(rows.length);
    showToast('追加しました');
    navigate('home');
    setSaving(false);
    // Persist & sync real rowNum
    if (!isDemo) {
      try { await addRow(newData); loadData(); }
      catch (e) { showToast('同期エラー: ' + e.message, true); loadData(); }
    }
  };

  if (!loaded) return <div className="loading"><div className="spinner" /><span className="loading-text">Loading...</span></div>;

  const row = rows[currentIdx];
  const prevMonth = () => { haptic.light(); setCurrentIdx(i => Math.max(0, i - 1)); };
  const nextMonth = () => { haptic.light(); setCurrentIdx(i => Math.min(rows.length - 1, i + 1)); };

  return (
    <div className="app">
      {isDemo && <div className="demo-banner">DEMO MODE</div>}

      {view === 'home' && (
        <HomeView
          row={row} rows={rows} labels={allLabels} groups={groups} catConfig={catConfig}
          customExpenseKeys={customCats.customExpenseKeys} customIncomeKeys={customCats.customIncomeKeys}
          currentIdx={currentIdx} prevMonth={prevMonth} nextMonth={nextMonth}
          onEdit={openEditModal}
          onSettings={openSettings}
          onGoInput={() => navigate('input')}
        />
      )}
      {view === 'history' && (
        <HistoryView rows={rows} onSelect={(idx) => { haptic.light(); setCurrentIdx(idx); navigate('home'); }}
          customExpenseKeys={customCats.customExpenseKeys} customIncomeKeys={customCats.customIncomeKeys} />
      )}
      {view === 'input' && (
        <InputView
          row={row} rows={rows} labels={allLabels} catConfig={catConfig} groups={groups}
          customExpenseKeys={customCats.customExpenseKeys} customIncomeKeys={customCats.customIncomeKeys}
          onSave={handleSave} onAdd={handleAdd} saving={saving}
          onSettings={openSettings}
          onNewCategory={() => openNewCatModal('expense')}
        />
      )}
      {view === 'forecast' && <ForecastView rows={rows} labels={allLabels}
        customExpenseKeys={customCats.customExpenseKeys} customIncomeKeys={customCats.customIncomeKeys} />}

      {editModal && (
        <EditModal item={editModal} onSave={handleSave} onClose={closeEditModalWithBack} saving={saving} />
      )}

      {showSettings && (
        <SettingsModal
          labels={allLabels} onUpdate={updateLabel}
          groups={groups} onUpdateGroups={updateGroups} onResetGroups={resetGroups}
          catConfig={catConfig} catActions={catActions}
          customCats={customCats}
          onNewCategory={(type) => openNewCatModal(type)}
          onClose={closeSettingsWithBack}
        />
      )}

      {newCatModal && (
        <NewCategoryModal
          type={newCatModal}
          groups={groups} labels={allLabels} catConfig={catConfig}
          customCats={customCats}
          onAdd={(key, name, groupId) => {
            updateLabel(key, name);
            catActions.show(newCatModal, key);
            if (groupId) {
              updateGroups(groups.map(g => g.id === groupId ? { ...g, keys: [...g.keys, key] } : g));
            }
          }}
          onClose={closeNewCatModalWithBack}
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
          <button key={n.id} className={`nav-item ${view === n.id ? 'active' : ''}`} onClick={() => { haptic.light(); navigate(n.id); }}>
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
function HomeView({ row, rows, labels, groups, catConfig, customExpenseKeys, customIncomeKeys, currentIdx, prevMonth, nextMonth, onEdit, onSettings, onGoInput }) {
  const [expandedGroups, setExpandedGroups] = useState({});
  const visibleExpense = new Set(catConfig.expense);
  const visibleIncome = new Set(catConfig.income);

  const toggleGroup = (id) => { haptic.light(); setExpandedGroups(prev => ({ ...prev, [id]: !prev[id] })); };

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

  const inc = totalIncome(row, customIncomeKeys);
  const exp = totalExpense(row, customExpenseKeys);
  const sur = surplus(row, customExpenseKeys, customIncomeKeys);

  // Build grouped data (only visible keys)
  const groupedKeys = new Set(groups.flatMap(g => g.keys));
  const ungroupedItems = catConfig.expense
    .filter(k => !groupedKeys.has(k) && (row[k] || 0) > 0)
    .map(k => ({ key: k, label: labels[k] || k, amount: row[k] || 0 }));

  const groupData = groups.map((g, gi) => {
    const children = g.keys
      .filter(k => visibleExpense.has(k))
      .map(k => ({ key: k, label: labels[k] || k, amount: row[k] || 0 }))
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
          {catConfig.income.map(k => {
            const v = row[k] || 0;
            if (v === 0) return null;
            return (
              <div key={k} className="stat-row">
                <span className="stat-label">{labels[k] || INCOME_LABELS[k] || k}</span>
                <span className="stat-value income">{formatYen(v)}</span>
              </div>
            );
          })}
          {catConfig.income.every(k => !row[k]) && (
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
function HistoryView({ rows, onSelect, customExpenseKeys = [], customIncomeKeys = [] }) {
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
          const sur = surplus(row, customExpenseKeys, customIncomeKeys);
          return (
            <div key={row.rowNum} className="history-item" onClick={() => onSelect(idx)}>
              <div>
                <div className="history-month">{formatMonth(row.date)}</div>
                <div className="history-sub">{formatYen(totalIncome(row, customIncomeKeys))} / {formatYen(totalExpense(row, customExpenseKeys))}</div>
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
function InputView({ row, rows, labels, catConfig, groups, customExpenseKeys, customIncomeKeys, onSave, onAdd, saving, onSettings, onNewCategory }) {
  const initial = row || {};
  const allIncomeKeys = [...INCOME_KEYS, ...customIncomeKeys];
  const allExpenseKeys = [...EXPENSE_KEYS, ...customExpenseKeys];

  function buildForm(src) {
    return {
      date: src.date || currentMonth(),
      ...Object.fromEntries(allIncomeKeys.map(k => [k, src[k] || 0])),
      ...Object.fromEntries(allExpenseKeys.map(k => [k, src[k] || 0])),
      balanceHokyo: src.balanceHokyo || 0,
      balanceRakuten: src.balanceRakuten || 0,
      notes: src.notes || '',
    };
  }

  const [form, setForm] = useState(() => buildForm(initial));
  const [openGroups, setOpenGroups] = useState(() => {
    const init = {};
    groups.forEach(g => { init[g.id] = true; });
    return init;
  });

  useEffect(() => { if (row) setForm(buildForm(row)); }, [row]);

  const set = (k, v) => setForm(prev => ({ ...prev, [k]: v }));
  const toggleInputGroup = (id) => { haptic.light(); setOpenGroups(prev => ({ ...prev, [id]: !prev[id] })); };

  const handleSubmit = () => {
    if (!row || !rows.find(r => r.date === form.date)) {
      onAdd(form);
    } else {
      const { date, ...updates } = form;
      onSave(row.rowNum, updates);
    }
  };

  // Build grouped expense keys
  const visibleExpense = new Set(catConfig.expense);
  const groupedKeys = new Set(groups.flatMap(g => g.keys));
  const ungroupedKeys = catConfig.expense.filter(k => !groupedKeys.has(k));

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
          {catConfig.income.map(k => (
            <div key={k} className="form-group">
              <label className="form-label">{labels[k] || INCOME_LABELS[k] || k}</label>
              <NumInput value={form[k]} onChange={v => set(k, v)} />
            </div>
          ))}
        </div>

        <div className="section-title">Expenses</div>

        {groups.map(g => {
          const gKeys = g.keys.filter(k => visibleExpense.has(k));
          if (gKeys.length === 0) return null;
          const groupTotal = gKeys.reduce((s, k) => s + (form[k] || 0), 0);
          const isOpen = openGroups[g.id] !== false;

          return (
            <div key={g.id} className="form-card form-card-group">
              <div className="form-group-header" onClick={() => toggleInputGroup(g.id)}>
                <div className="form-group-header-left">
                  <span className="form-group-name">{g.name}</span>
                  <span className="form-group-total">{formatYen(groupTotal)}</span>
                </div>
                <svg className={`group-chevron ${isOpen ? 'open' : ''}`}
                  width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                </svg>
              </div>
              {isOpen && gKeys.map(k => (
                <div key={k} className="form-group">
                  <label className="form-label">{labels[k] || EXPENSE_LABELS[k] || k}</label>
                  <NumInput value={form[k]} onChange={v => set(k, v)} />
                </div>
              ))}
            </div>
          );
        })}

        {ungroupedKeys.length > 0 && (
          <div className="form-card">
            {ungroupedKeys.map(k => (
              <div key={k} className="form-group">
                <label className="form-label">{labels[k] || EXPENSE_LABELS[k] || k}</label>
                <NumInput value={form[k]} onChange={v => set(k, v)} />
              </div>
            ))}
          </div>
        )}

        <button className="new-cat-btn" style={{ marginBottom: 12 }} onClick={onNewCategory}>
          <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
          </svg>
          新規カテゴリを追加
        </button>

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
function ForecastView({ rows, labels, customExpenseKeys = [], customIncomeKeys = [] }) {
  const recent = rows.slice(-3);
  const defaultIncome = recent.length > 0
    ? Math.round(recent.reduce((s, r) => s + totalIncome(r, customIncomeKeys), 0) / recent.length) : 200000;
  const defaultExpense = recent.length > 0
    ? Math.round(recent.reduce((s, r) => s + totalExpense(r, customExpenseKeys), 0) / recent.length) : 150000;

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
  const histData = rows.map(r => surplus(r, customExpenseKeys, customIncomeKeys));

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
              <button className="sim-reset-inline" onClick={() => { haptic.medium(); setSimIncome(defaultIncome); }}>
                <svg width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h5M20 20v-5h-5M4.49 9A8 8 0 0120 12M19.51 15A8 8 0 014 12" />
                </svg>
                戻す
              </button>
            )}
          </div>
          <div className={`sim-row ${incomeChanged ? 'sim-row-changed' : ''}`}>
            <button className="sim-btn" onClick={() => { haptic.tick(); setSimIncome(v => Math.max(0, v - 10000)); }}>-</button>
            <input className={`sim-input ${incomeChanged ? 'sim-input-changed' : ''}`} type="number" inputMode="numeric"
              value={simIncome} onChange={e => setSimIncome(Number(e.target.value) || 0)} />
            <button className="sim-btn" onClick={() => { haptic.tick(); setSimIncome(v => v + 10000); }}>+</button>
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
              <button className="sim-reset-inline" onClick={() => { haptic.medium(); setSimExpense(defaultExpense); }}>
                <svg width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h5M20 20v-5h-5M4.49 9A8 8 0 0120 12M19.51 15A8 8 0 014 12" />
                </svg>
                戻す
              </button>
            )}
          </div>
          <div className={`sim-row ${expenseChanged ? 'sim-row-changed' : ''}`}>
            <button className="sim-btn" onClick={() => { haptic.tick(); setSimExpense(v => Math.max(0, v - 10000)); }}>-</button>
            <input className={`sim-input ${expenseChanged ? 'sim-input-changed' : ''}`} type="number" inputMode="numeric"
              value={simExpense} onChange={e => setSimExpense(Number(e.target.value) || 0)} />
            <button className="sim-btn" onClick={() => { haptic.tick(); setSimExpense(v => v + 10000); }}>+</button>
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
            <button className="sim-reset-all" onClick={() => { haptic.medium(); setSimIncome(defaultIncome); setSimExpense(defaultExpense); }}>
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

// ── New Category Modal ──
function NewCategoryModal({ type, groups, labels, catConfig, customCats, onAdd, onClose }) {
  const [name, setName] = useState('');
  const [groupId, setGroupId] = useState('');
  const [mode, setMode] = useState('new'); // 'new' = create custom key, 'reuse' = unhide built-in

  // Hidden built-in keys
  const builtinKeys = type === 'income' ? INCOME_KEYS : EXPENSE_KEYS;
  const visible = type === 'income' ? catConfig.income : catConfig.expense;
  const hiddenBuiltin = builtinKeys.filter(k => !visible.includes(k));
  const [selectedBuiltin, setSelectedBuiltin] = useState(hiddenBuiltin[0] || '');

  const canAddNew = customCats.canAdd;

  const handleAddNew = () => {
    if (!name.trim()) return;
    haptic.success();
    const key = customCats.add(name.trim(), type);
    onAdd(key, name.trim(), groupId || null);
    onClose();
  };

  const handleReuse = () => {
    if (!selectedBuiltin) return;
    haptic.success();
    onAdd(selectedBuiltin, name.trim() || labels[selectedBuiltin] || selectedBuiltin, groupId || null);
    onClose();
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <div className="modal-title">新規カテゴリ追加</div>
          <button className="modal-close" onClick={onClose}>x</button>
        </div>

        <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 12 }}>
          {customCats.totalCount} / {MAX_CATEGORIES} カテゴリ使用中
        </div>

        {hiddenBuiltin.length > 0 && (
          <div className="settings-tabs" style={{ marginBottom: 14 }}>
            <button className={`settings-tab ${mode === 'new' ? 'active' : ''}`}
              onClick={() => { haptic.tick(); setMode('new'); }}>新規作成</button>
            <button className={`settings-tab ${mode === 'reuse' ? 'active' : ''}`}
              onClick={() => { haptic.tick(); setMode('reuse'); }}>非表示から復元</button>
          </div>
        )}

        {mode === 'new' && (
          <>
            {!canAddNew ? (
              <div style={{ padding: '16px 0', color: 'var(--text-secondary)', fontSize: 13, lineHeight: 1.7 }}>
                カテゴリ上限（{MAX_CATEGORIES}個）に達しています。<br />
                不要なカテゴリを設定画面から削除してから追加してください。
              </div>
            ) : (
              <>
                <div className="form-group">
                  <label className="form-label">カテゴリ名</label>
                  <input className="form-input" placeholder="例: 医療費, 教育費..."
                    value={name} onChange={e => setName(e.target.value)} autoFocus />
                </div>

                {type === 'expense' && groups.length > 0 && (
                  <div className="form-group">
                    <label className="form-label">グループ（任意）</label>
                    <div className="new-cat-slots">
                      <button className={`new-cat-slot ${groupId === '' ? 'active' : ''}`}
                        onClick={() => { haptic.tick(); setGroupId(''); }}>なし</button>
                      {groups.map(g => (
                        <button key={g.id}
                          className={`new-cat-slot ${groupId === g.id ? 'active' : ''}`}
                          onClick={() => { haptic.tick(); setGroupId(g.id); }}>
                          {g.name}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                <div style={{ display: 'flex', gap: 10, marginTop: 20 }}>
                  <button className="btn btn-secondary" style={{ flex: 1 }} onClick={onClose}>キャンセル</button>
                  <button className="btn btn-primary" style={{ flex: 1 }} disabled={!name.trim()} onClick={handleAddNew}>追加する</button>
                </div>
              </>
            )}
          </>
        )}

        {mode === 'reuse' && (
          <>
            <div className="form-group">
              <label className="form-label">復元するカテゴリ（{hiddenBuiltin.length}枠）</label>
              <div className="new-cat-slots">
                {hiddenBuiltin.map(k => (
                  <button key={k}
                    className={`new-cat-slot ${selectedBuiltin === k ? 'active' : ''}`}
                    onClick={() => { haptic.tick(); setSelectedBuiltin(k); if (!name) setName(labels[k] || k); }}>
                    {labels[k] || k}
                  </button>
                ))}
              </div>
            </div>

            <div className="form-group">
              <label className="form-label">表示名（変更可）</label>
              <input className="form-input" value={name}
                onChange={e => setName(e.target.value)} />
            </div>

            {type === 'expense' && groups.length > 0 && (
              <div className="form-group">
                <label className="form-label">グループ（任意）</label>
                <div className="new-cat-slots">
                  <button className={`new-cat-slot ${groupId === '' ? 'active' : ''}`}
                    onClick={() => { haptic.tick(); setGroupId(''); }}>なし</button>
                  {groups.map(g => (
                    <button key={g.id}
                      className={`new-cat-slot ${groupId === g.id ? 'active' : ''}`}
                      onClick={() => { haptic.tick(); setGroupId(g.id); }}>
                      {g.name}
                    </button>
                  ))}
                </div>
              </div>
            )}

            <div style={{ display: 'flex', gap: 10, marginTop: 20 }}>
              <button className="btn btn-secondary" style={{ flex: 1 }} onClick={onClose}>キャンセル</button>
              <button className="btn btn-primary" style={{ flex: 1 }} disabled={!selectedBuiltin} onClick={handleReuse}>復元する</button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// ── Drag & Drop Reorder List ──
function DragList({ items, onReorder, renderItem }) {
  const [dragIdx, setDragIdx] = useState(null);
  const [overIdx, setOverIdx] = useState(null);
  const dragY = useRef(0);
  const listRef = useRef(null);
  const itemRects = useRef([]);

  const calcOverIdx = (clientY) => {
    for (let i = 0; i < itemRects.current.length; i++) {
      const r = itemRects.current[i];
      if (clientY < r.top + r.height / 2) return i;
    }
    return itemRects.current.length - 1;
  };

  const captureRects = () => {
    if (!listRef.current) return;
    const children = listRef.current.querySelectorAll('.cat-item');
    itemRects.current = Array.from(children).map(el => {
      const rect = el.getBoundingClientRect();
      return { top: rect.top, height: rect.height };
    });
  };

  const prevOverIdx = useRef(null);

  // Touch handlers
  const onTouchStart = (idx, e) => {
    captureRects();
    setDragIdx(idx);
    setOverIdx(idx);
    prevOverIdx.current = idx;
    dragY.current = e.touches[0].clientY;
    haptic.medium();
  };

  const onTouchMove = useCallback((e) => {
    if (dragIdx === null) return;
    e.preventDefault();
    const y = e.touches[0].clientY;
    const newOver = calcOverIdx(y);
    setOverIdx(newOver);
    if (newOver !== prevOverIdx.current) {
      haptic.tick();
      prevOverIdx.current = newOver;
    }
  }, [dragIdx]);

  const onTouchEnd = useCallback(() => {
    if (dragIdx !== null && overIdx !== null && dragIdx !== overIdx) {
      onReorder(dragIdx, overIdx);
      haptic.heavy();
    } else {
      haptic.light();
    }
    setDragIdx(null);
    setOverIdx(null);
    prevOverIdx.current = null;
  }, [dragIdx, overIdx, onReorder]);

  useEffect(() => {
    if (dragIdx === null) return;
    const opts = { passive: false };
    document.addEventListener('touchmove', onTouchMove, opts);
    document.addEventListener('touchend', onTouchEnd);
    return () => {
      document.removeEventListener('touchmove', onTouchMove);
      document.removeEventListener('touchend', onTouchEnd);
    };
  }, [dragIdx, onTouchMove, onTouchEnd]);

  // Mouse drag handlers
  const onMouseDown = (idx, e) => {
    e.preventDefault();
    captureRects();
    setDragIdx(idx);
    setOverIdx(idx);
    prevOverIdx.current = idx;
    haptic.medium();
  };

  const onMouseMove = useCallback((e) => {
    if (dragIdx === null) return;
    const newOver = calcOverIdx(e.clientY);
    setOverIdx(newOver);
    if (newOver !== prevOverIdx.current) {
      haptic.tick();
      prevOverIdx.current = newOver;
    }
  }, [dragIdx]);

  const onMouseUp = useCallback(() => {
    if (dragIdx !== null && overIdx !== null && dragIdx !== overIdx) {
      onReorder(dragIdx, overIdx);
      haptic.heavy();
    } else {
      haptic.light();
    }
    setDragIdx(null);
    setOverIdx(null);
    prevOverIdx.current = null;
  }, [dragIdx, overIdx, onReorder]);

  useEffect(() => {
    if (dragIdx === null) return;
    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
    return () => {
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
    };
  }, [dragIdx, onMouseMove, onMouseUp]);

  return (
    <div ref={listRef} className="cat-list">
      {items.map((item, idx) => {
        let cls = 'cat-item';
        if (dragIdx !== null) {
          if (idx === dragIdx) cls += ' cat-item-dragging';
          if (overIdx !== null && idx === overIdx && idx !== dragIdx) cls += ' cat-item-drop-target';
        }
        return (
          <div key={item} className={cls}>
            <div className="cat-drag-handle"
              onTouchStart={(e) => onTouchStart(idx, e)}
              onMouseDown={(e) => onMouseDown(idx, e)}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                <circle cx="9" cy="6" r="1.5" /><circle cx="15" cy="6" r="1.5" />
                <circle cx="9" cy="12" r="1.5" /><circle cx="15" cy="12" r="1.5" />
                <circle cx="9" cy="18" r="1.5" /><circle cx="15" cy="18" r="1.5" />
              </svg>
            </div>
            {renderItem(item, idx)}
          </div>
        );
      })}
    </div>
  );
}

// ── Settings Modal ──
function SettingsModal({ labels, onUpdate, groups, onUpdateGroups, onResetGroups, catConfig, catActions, customCats, onNewCategory, onClose }) {
  const [tab, setTab] = useState('categories');
  const [editingGroup, setEditingGroup] = useState(null);
  const [newGroupName, setNewGroupName] = useState('');
  const [showAddPicker, setShowAddPicker] = useState(null); // 'income' | 'expense' | null

  // Group helpers
  const addGroup = () => {
    if (!newGroupName.trim()) return;
    haptic.success();
    const id = 'g_' + Date.now();
    onUpdateGroups([...groups, { id, name: newGroupName.trim(), keys: [] }]);
    setNewGroupName('');
  };
  const renameGroup = (id, name) => onUpdateGroups(groups.map(g => g.id === id ? { ...g, name } : g));
  const deleteGroup = (id) => { haptic.medium(); onUpdateGroups(groups.filter(g => g.id !== id)); };
  const toggleKeyInGroup = (groupId, key) => {
    haptic.light();
    onUpdateGroups(groups.map(g => {
      if (g.id !== groupId) return { ...g, keys: g.keys.filter(k => k !== key) };
      if (g.keys.includes(key)) return { ...g, keys: g.keys.filter(k => k !== key) };
      return { ...g, keys: [...g.keys, key] };
    }));
  };
  const assignedKeys = new Set(groups.flatMap(g => g.keys));

  // Hidden categories (built-in only; custom keys are always visible or deleted entirely)
  const hiddenIncome = INCOME_KEYS.filter(k => !catConfig.income.includes(k));
  const allExpenseKeys = [...EXPENSE_KEYS, ...customCats.customExpenseKeys];
  const hiddenExpense = allExpenseKeys.filter(k => !catConfig.expense.includes(k));
  const [openCatGroups, setOpenCatGroups] = useState(() => {
    const init = {};
    groups.forEach(g => { init[g.id] = true; });
    init._ungrouped = true;
    return init;
  });
  const toggleCatGroup = (id) => { haptic.light(); setOpenCatGroups(prev => ({ ...prev, [id]: !prev[id] })); };

  // Income list renderer (flat)
  const renderIncomeList = () => {
    const items = catConfig.income;
    return (
      <>
        <DragList
          items={items}
          onReorder={(from, to) => catActions.reorder('income', from, to)}
          renderItem={(k) => (
            <>
              <input className="cat-item-input" value={labels[k] || INCOME_LABELS[k] || k || ''}
                onChange={e => onUpdate(k, e.target.value)} />
              <button className="cat-item-delete" onClick={() => { haptic.medium(); catActions.hide('income', k); }}>
                <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </>
          )}
        />
        {hiddenIncome.length > 0 && (
          <div style={{ marginTop: 8 }}>
            {showAddPicker === 'income' ? (
              <div className="cat-add-picker">
                {hiddenIncome.map(k => (
                  <button key={k} className="cat-add-chip"
                    onClick={() => { haptic.light(); catActions.show('income', k); if (hiddenIncome.length <= 1) setShowAddPicker(null); }}>
                    + {labels[k] || INCOME_LABELS[k] || k}
                  </button>
                ))}
                <button className="cat-add-chip cat-add-chip-cancel" onClick={() => setShowAddPicker(null)}>キャンセル</button>
              </div>
            ) : (
              <button className="cat-add-btn" onClick={() => setShowAddPicker('income')}>
                <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
                </svg>
                カテゴリを追加 ({hiddenIncome.length})
              </button>
            )}
          </div>
        )}
      </>
    );
  };

  // Per-group add: hidden keys that could be added to this group
  const addableForGroup = (g) => {
    return hiddenExpense.filter(k => !g.keys.includes(k));
  };

  // Add a hidden key into a group and show it
  const addKeyToGroup = (groupId, key) => {
    haptic.light();
    catActions.show('expense', key);
    onUpdateGroups(groups.map(g => g.id === groupId ? { ...g, keys: [...g.keys, key] } : g));
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <div className="modal-title">設定</div>
          <button className="modal-close" onClick={onClose}>x</button>
        </div>

        <div className="settings-tabs">
          <button className={`settings-tab ${tab === 'categories' ? 'active' : ''}`}
            onClick={() => { haptic.light(); setTab('categories'); }}>カテゴリ</button>
          <button className={`settings-tab ${tab === 'groups' ? 'active' : ''}`}
            onClick={() => { haptic.light(); setTab('groups'); }}>グループ</button>
        </div>

        {tab === 'categories' && (
          <>
            <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 16 }}>
              名称変更・並び替え・非表示の管理ができます
            </div>

            <div style={{ marginBottom: 16 }}>
              <div className="section-title">Income</div>
              {renderIncomeList()}
              <button className="new-cat-btn" style={{ marginTop: 8 }} onClick={() => onNewCategory('income')}>
                <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
                </svg>
                新規カテゴリを追加
              </button>
            </div>

            <div className="section-title">Expenses</div>

            {groups.map(g => {
              const gKeys = g.keys.filter(k => catConfig.expense.includes(k));
              const isOpen = openCatGroups[g.id] !== false;
              const addable = addableForGroup(g);

              return (
                <div key={g.id} className="cat-group-section">
                  <div className="cat-group-header" onClick={() => toggleCatGroup(g.id)}>
                    <span className="cat-group-name">{g.name}</span>
                    <div className="cat-group-header-right">
                      <span className="cat-group-count">{gKeys.length}</span>
                      <svg className={`group-chevron ${isOpen ? 'open' : ''}`}
                        width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                      </svg>
                    </div>
                  </div>
                  {isOpen && (
                    <div className="cat-group-body">
                      <DragList
                        items={gKeys}
                        onReorder={(from, to) => {
                          const newKeys = [...gKeys];
                          const [item] = newKeys.splice(from, 1);
                          newKeys.splice(to, 0, item);
                          onUpdateGroups(groups.map(gg =>
                            gg.id === g.id ? { ...gg, keys: [...newKeys, ...gg.keys.filter(k => !catConfig.expense.includes(k))] } : gg
                          ));
                        }}
                        renderItem={(k) => (
                          <>
                            <input className="cat-item-input" value={labels[k] || EXPENSE_LABELS[k] || k || ''}
                              onChange={e => onUpdate(k, e.target.value)} />
                            <button className="cat-item-delete" onClick={() => { haptic.medium(); catActions.hide('expense', k); }}>
                              <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                              </svg>
                            </button>
                          </>
                        )}
                      />
                      {addable.length > 0 && (
                        <div style={{ marginTop: 6 }}>
                          {showAddPicker === g.id ? (
                            <div className="cat-add-picker">
                              {addable.map(k => (
                                <button key={k} className="cat-add-chip"
                                  onClick={() => { addKeyToGroup(g.id, k); if (addable.length <= 1) setShowAddPicker(null); }}>
                                  + {labels[k] || EXPENSE_LABELS[k] || k}
                                </button>
                              ))}
                              <button className="cat-add-chip cat-add-chip-cancel" onClick={() => setShowAddPicker(null)}>キャンセル</button>
                            </div>
                          ) : (
                            <button className="cat-add-btn" onClick={() => setShowAddPicker(g.id)}>
                              <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
                              </svg>
                              カテゴリを追加
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}

            {(() => {
              const allGroupedKeys = new Set(groups.flatMap(g => g.keys));
              const ungrouped = catConfig.expense.filter(k => !allGroupedKeys.has(k));
              if (ungrouped.length === 0) return null;
              const isOpen = openCatGroups._ungrouped !== false;
              return (
                <div className="cat-group-section">
                  <div className="cat-group-header" onClick={() => toggleCatGroup('_ungrouped')}>
                    <span className="cat-group-name">未分類</span>
                    <div className="cat-group-header-right">
                      <span className="cat-group-count">{ungrouped.length}</span>
                      <svg className={`group-chevron ${isOpen ? 'open' : ''}`}
                        width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                      </svg>
                    </div>
                  </div>
                  {isOpen && (
                    <div className="cat-group-body">
                      <DragList
                        items={ungrouped}
                        onReorder={(from, to) => catActions.reorder('expense', catConfig.expense.indexOf(ungrouped[from]), catConfig.expense.indexOf(ungrouped[to]))}
                        renderItem={(k) => (
                          <>
                            <input className="cat-item-input" value={labels[k] || EXPENSE_LABELS[k] || k || ''}
                              onChange={e => onUpdate(k, e.target.value)} />
                            <button className="cat-item-delete" onClick={() => { haptic.medium(); catActions.hide('expense', k); }}>
                              <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                              </svg>
                            </button>
                          </>
                        )}
                      />
                    </div>
                  )}
                </div>
              );
            })()}

            <button className="new-cat-btn" style={{ marginTop: 10 }} onClick={() => onNewCategory('expense')}>
              <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
              </svg>
              新規カテゴリを追加（{customCats.totalCount}/{MAX_CATEGORIES}）
            </button>

            <button className="btn btn-secondary" style={{ fontSize: 12, padding: '10px', marginTop: 16 }}
              onClick={() => { catActions.reset(); setShowAddPicker(null); }}>
              デフォルトに戻す
            </button>
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
                  {[...EXPENSE_KEYS, ...customCats.customExpenseKeys].map(k => {
                    const inThis = g.keys.includes(k);
                    const inOther = !inThis && assignedKeys.has(k);
                    return (
                      <button key={k}
                        className={`group-key-chip ${inThis ? 'active' : ''} ${inOther ? 'disabled' : ''}`}
                        disabled={inOther}
                        onClick={() => toggleKeyInGroup(g.id, k)}>
                        {labels[k] || k}
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
