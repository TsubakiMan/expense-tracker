'use client';

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { fetchAllData, updateRow, addRow, deleteRow, saveSettings } from '../lib/api';
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
  const [cats, setCats] = useState(() => {
    try {
      const saved = localStorage.getItem('customCategories');
      return saved ? JSON.parse(saved) : [];
    } catch { return []; }
  });
  const initialized = useRef(false);

  useEffect(() => {
    if (!cloudSettings || initialized.current) return;
    initialized.current = true;
    if (cloudSettings.customCategories) {
      // Merge cloud with local — local may have newer entries not yet synced
      setCats(prev => {
        const cloudCats = cloudSettings.customCategories;
        const localKeys = new Set(prev.map(c => c.key));
        const cloudKeys = new Set(cloudCats.map(c => c.key));
        // Start with cloud data, add any local-only entries
        const merged = [...cloudCats];
        for (const c of prev) {
          if (!cloudKeys.has(c.key)) merged.push(c);
        }
        try { localStorage.setItem('customCategories', JSON.stringify(merged)); } catch {}
        return merged;
      });
    }
  }, [cloudSettings]);

  const saveCats = (updater) => {
    setCats(prev => {
      const next = typeof updater === 'function' ? updater(prev) : updater;
      saveLocal('customCategories', next);
      return next;
    });
  };

  const add = (label, type) => {
    let key;
    setCats(prev => {
      const prefix = type === 'income' ? 'ci_' : 'cx_';
      const existing = prev.filter(c => c.key.startsWith(prefix)).map(c => parseInt(c.key.split('_')[1]));
      const nextNum = existing.length > 0 ? Math.max(...existing) + 1 : 1;
      key = prefix + nextNum;
      const next = [...prev, { key, label, type }];
      saveLocal('customCategories', next);
      return next;
    });
    return key;
  };

  const remove = (key) => {
    saveCats(prev => prev.filter(c => c.key !== key));
  };

  const rename = (key, label) => {
    saveCats(prev => prev.map(c => c.key === key ? { ...c, label } : c));
  };

  const customExpenseKeys = cats.filter(c => c.type === 'expense').map(c => c.key);
  const customIncomeKeys = cats.filter(c => c.type === 'income').map(c => c.key);
  const customLabelsMap = Object.fromEntries(cats.map(c => [c.key, c.label]));

  const totalCount = INCOME_KEYS.length + EXPENSE_KEYS.length + cats.length;
  const canAdd = true;

  return { cats, add, remove, rename, customExpenseKeys, customIncomeKeys, customLabelsMap, canAdd, totalCount };
}

// ── Category Order & Visibility Hook ──
function useCategoryConfig(customExpenseKeys, customIncomeKeys, cloudSettings) {
  const [config, setConfig] = useState(() => {
    try {
      const saved = localStorage.getItem('categoryConfig');
      if (saved) return JSON.parse(saved);
    } catch {}
    return { income: [...INCOME_KEYS], expense: [...EXPENSE_KEYS] };
  });
  const initialized = useRef(false);

  useEffect(() => {
    if (!cloudSettings || initialized.current) return;
    initialized.current = true;
    if (cloudSettings.categoryConfig) {
      const parsed = cloudSettings.categoryConfig;
      setConfig(prev => {
        // Merge: keep local keys that aren't in cloud yet
        const localIncomeSet = new Set(prev.income);
        const localExpenseSet = new Set(prev.expense);
        const mergedIncome = [...(parsed.income || [])];
        const mergedExpense = [...(parsed.expense || [])];
        for (const k of prev.income) {
          if (!mergedIncome.includes(k)) mergedIncome.push(k);
        }
        for (const k of prev.expense) {
          if (!mergedExpense.includes(k)) mergedExpense.push(k);
        }
        const next = { income: mergedIncome, expense: mergedExpense };
        try { localStorage.setItem('categoryConfig', JSON.stringify(next)); } catch {}
        return next;
      });
    }
  }, [cloudSettings]);

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

  const save = (updater) => {
    setConfig(prev => {
      const next = typeof updater === 'function' ? updater(prev) : updater;
      saveLocal('categoryConfig', next);
      return next;
    });
  };

  const reorder = (type, fromIdx, toIdx) => {
    save(prev => {
      const arr = [...prev[type]];
      const [item] = arr.splice(fromIdx, 1);
      arr.splice(toIdx, 0, item);
      return { ...prev, [type]: arr };
    });
  };

  const hide = (type, key) => {
    save(prev => ({ ...prev, [type]: prev[type].filter(k => k !== key) }));
  };

  const show = (type, key) => {
    save(prev => ({ ...prev, [type]: [...prev[type], key] }));
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

// ── Category Schedule Hook ── (終了月・季節発生・季節加算を管理)
// schedule[key] = { endDate, seasonStart, seasonEnd, extraAmount, extraStart, extraEnd }
function useCategorySchedule(cloudSettings) {
  const [schedule, setSchedule] = useState(() => {
    try {
      const saved = localStorage.getItem('categorySchedule');
      if (saved) return JSON.parse(saved);
      // Migrate from old endDates format
      const old = localStorage.getItem('categoryEndDates');
      if (old) {
        const endDates = JSON.parse(old);
        const migrated = {};
        for (const [k, v] of Object.entries(endDates)) {
          migrated[k] = { endDate: v };
        }
        return migrated;
      }
    } catch {}
    return {};
  });
  const initialized = useRef(false);

  useEffect(() => {
    if (!cloudSettings || initialized.current) return;
    initialized.current = true;
    const cloud = cloudSettings.categorySchedule || cloudSettings.categoryEndDates;
    if (cloud) {
      setSchedule(prev => {
        // If old format (string values), migrate
        const merged = { ...prev };
        for (const [k, v] of Object.entries(cloud)) {
          if (typeof v === 'string') {
            merged[k] = { ...(merged[k] || {}), endDate: v };
          } else {
            merged[k] = { ...(merged[k] || {}), ...v };
          }
        }
        try { localStorage.setItem('categorySchedule', JSON.stringify(merged)); } catch {}
        return merged;
      });
    }
  }, [cloudSettings]);

  const update = (key, field, value) => {
    setSchedule(prev => {
      const next = { ...prev };
      if (!next[key]) next[key] = {};
      if (value === null || value === '' || value === undefined) {
        delete next[key][field];
        if (Object.keys(next[key]).length === 0) delete next[key];
      } else {
        next[key] = { ...next[key], [field]: value };
      }
      saveLocal('categorySchedule', next);
      return next;
    });
  };

  const get = (key) => schedule[key] || {};

  // For backward compat
  const endDates = {};
  for (const [k, v] of Object.entries(schedule)) {
    if (v.endDate) endDates[k] = v.endDate;
  }

  // Check if category is active in a given month (YYYY-MM)
  const isActiveInMonth = (key, month) => {
    const s = schedule[key];
    if (!s) return true;
    // End date check
    if (s.endDate && month > s.endDate) return false;
    // Season check (month number 1-12)
    if (s.seasonStart && s.seasonEnd) {
      const m = parseInt(month.split('-')[1]);
      if (s.seasonStart <= s.seasonEnd) {
        // e.g. 6-9 (Jun-Sep)
        if (m < s.seasonStart || m > s.seasonEnd) return false;
      } else {
        // e.g. 11-2 (Nov-Feb, wraps around year)
        if (m < s.seasonStart && m > s.seasonEnd) return false;
      }
    }
    return true;
  };

  // Get extra seasonal amount for a given month
  const getExtraAmount = (key, month) => {
    const s = schedule[key];
    if (!s || !s.extraAmount || !s.extraStart || !s.extraEnd) return 0;
    const m = parseInt(month.split('-')[1]);
    if (s.extraStart <= s.extraEnd) {
      if (m >= s.extraStart && m <= s.extraEnd) return s.extraAmount;
    } else {
      if (m >= s.extraStart || m <= s.extraEnd) return s.extraAmount;
    }
    return 0;
  };

  // Get future amount change diff for a given month (income raise etc.)
  const getFutureAmountDiff = (key, month) => {
    const s = schedule[key];
    if (!s || !s.futureAmount || !s.futureStart) return 0;
    if (month >= s.futureStart) {
      return s.futureAmount - (s.currentAmount || 0);
    }
    return 0;
  };

  // Get bonus amount for a specific month (one-time bonus prediction)
  const getBonusAmount = (key, month) => {
    const s = schedule[key];
    if (!s || !s.bonusAmount || !s.bonusMonth) return 0;
    if (month === s.bonusMonth) return s.bonusAmount;
    return 0;
  };

  return { schedule, update, get, endDates, isActiveInMonth, getExtraAmount, getFutureAmountDiff, getBonusAmount };
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
  const [viewMonth, setViewMonth] = useState(null); // YYYY-MM, null = use currentIdx
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
  const scheduleHook = useCategorySchedule(cloudSettings);
  const [newCatModal, setNewCatModal] = useState(null); // 'income' | 'expense' | null
  const [newCatGroupId, setNewCatGroupId] = useState(null); // pre-selected group for new category

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

  const openNewCatModal = useCallback((type, groupId = null) => {
    haptic.light();
    setNewCatModal(type);
    setNewCatGroupId(groupId);
    history.pushState({ view, modal: 'newcat' }, '');
  }, [view]);

  // Close modal without pushState (used by popstate and direct close)
  const closeEditModal = useCallback(() => setEditModal(null), []);
  const closeSettings = useCallback(() => setShowSettings(false), []);
  const closeNewCatModal = useCallback(() => {
    setNewCatModal(null);
    // Replace current history entry to remove modal state, keeping current view
    history.replaceState({ view }, '');
  }, [view]);

  // Close modal with history.back (used by UI close buttons)
  const closeEditModalWithBack = useCallback(() => { history.back(); }, []);
  const closeSettingsWithBack = useCallback(() => { history.back(); }, []);
  const closeNewCatModalWithBack = useCallback(() => { history.back(); }, []);

  // Listen for popstate (browser back)
  useEffect(() => {
    const onPopState = (e) => {
      isPopping.current = true;
      const state = e.state || {};

      if (newCatModal) {
        setNewCatModal(null);
        // Stay on current view — don't change it
      } else if (editModal) {
        setEditModal(null);
      } else if (showSettings) {
        setShowSettings(false);
      } else if (state.view) {
        setView(state.view);
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
      setViewMonth(cm);

      const cloud = result.settings || {};
      const SETTINGS_KEYS = ['customLabels', 'categoryConfig', 'expenseGroups', 'customCategories', 'categorySchedule'];
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
      setViewMonth(DEMO_ROWS[DEMO_ROWS.length - 1].date);
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
    setSaving(false);
    // Persist & sync real rowNum
    if (!isDemo) {
      try { await addRow(newData); loadData(); }
      catch (e) { showToast('同期エラー: ' + e.message, true); loadData(); }
    }
  };

  if (!loaded) return <div className="loading"><div className="spinner" /><span className="loading-text">Loading...</span></div>;

  const row = rows[currentIdx];
  // viewMonth-based navigation for HomeView
  const homeRow = viewMonth ? rows.find(r => r.date === viewMonth) : row;
  const prevMonthNav = () => { haptic.light(); setViewMonth(m => addMonths(m || row?.date || currentMonth(), -1)); };
  const nextMonthNav = () => { haptic.light(); setViewMonth(m => addMonths(m || row?.date || currentMonth(), 1)); };
  // Legacy index-based (for history select)
  const prevMonth = () => { haptic.light(); setCurrentIdx(i => Math.max(0, i - 1)); };
  const nextMonth = () => { haptic.light(); setCurrentIdx(i => Math.min(rows.length - 1, i + 1)); };

  return (
    <div className="app">
      {isDemo && <div className="demo-banner">DEMO MODE</div>}

      {view === 'home' && (
        <HomeView
          row={homeRow} rows={rows} labels={allLabels} groups={groups} catConfig={catConfig}
          customExpenseKeys={customCats.customExpenseKeys} customIncomeKeys={customCats.customIncomeKeys}
          viewMonth={viewMonth || row?.date || currentMonth()}
          prevMonth={prevMonthNav} nextMonth={nextMonthNav}
          onEdit={openEditModal}
          onSettings={openSettings}
          onGoInput={() => navigate('input')}
          scheduleHook={scheduleHook}
        />
      )}
      {view === 'history' && (
        <HistoryView rows={rows} onSelect={(idx) => { haptic.light(); setCurrentIdx(idx); setViewMonth(rows[idx]?.date); navigate('home'); }}
          customExpenseKeys={customCats.customExpenseKeys} customIncomeKeys={customCats.customIncomeKeys} />
      )}
      {view === 'input' && (
        <InputView
          row={row} rows={rows} labels={allLabels} catConfig={catConfig} groups={groups}
          customExpenseKeys={customCats.customExpenseKeys} customIncomeKeys={customCats.customIncomeKeys}
          onSave={handleSave} onAdd={handleAdd} saving={saving}
          onNewCategory={(type, groupId) => openNewCatModal(type, groupId)}
          onUpdateLabel={updateLabel}
          catActions={catActions} customCats={customCats}
          onUpdateGroups={updateGroups}
          scheduleHook={scheduleHook}
        />
      )}
      {view === 'forecast' && <ForecastView rows={rows} labels={allLabels}
        customExpenseKeys={customCats.customExpenseKeys} customIncomeKeys={customCats.customIncomeKeys}
        scheduleHook={scheduleHook} catConfig={catConfig} />}

      {editModal && (
        <EditModal item={editModal} onSave={handleSave} onClose={closeEditModalWithBack} saving={saving} />
      )}

      {showSettings && (
        <SettingsModal
          labels={allLabels} onUpdate={updateLabel}
          groups={groups} onUpdateGroups={updateGroups} onResetGroups={resetGroups}
          catConfig={catConfig} catActions={catActions}
          customCats={customCats}
          onNewCategory={(type, groupId) => openNewCatModal(type, groupId)}
          onClose={closeSettingsWithBack}
        />
      )}

      {newCatModal && (
        <NewCategoryModal
          type={newCatModal}
          groups={groups} labels={allLabels} catConfig={catConfig}
          customCats={customCats}
          defaultGroupId={newCatGroupId}
          onAdd={(key, label, groupId) => {
            updateLabel(key, label);
            catActions.show(newCatModal, key);
            if (groupId) {
              updateGroups(groups.map(g => g.id === groupId ? { ...g, keys: [...g.keys, key] } : g));
            }
          }}
          onClose={closeNewCatModal}
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
function HomeView({ row, rows, labels, groups, catConfig, customExpenseKeys, customIncomeKeys, viewMonth, prevMonth, nextMonth, onEdit, onSettings, onGoInput, scheduleHook }) {
  const [expandedGroups, setExpandedGroups] = useState({});
  const visibleExpense = new Set(catConfig.expense);
  const visibleIncome = new Set(catConfig.income);

  const toggleGroup = (id) => { haptic.light(); setExpandedGroups(prev => ({ ...prev, [id]: !prev[id] })); };

  // Swipe navigation
  const swipeRef = useRef(null);
  const swipeStart = useRef(null);
  useEffect(() => {
    const el = swipeRef.current;
    if (!el) return;
    const onStart = (e) => {
      const t = e.touches[0];
      swipeStart.current = { x: t.clientX, y: t.clientY, time: Date.now() };
    };
    const onEnd = (e) => {
      if (!swipeStart.current) return;
      const t = e.changedTouches[0];
      const dx = t.clientX - swipeStart.current.x;
      const dy = t.clientY - swipeStart.current.y;
      const dt = Date.now() - swipeStart.current.time;
      swipeStart.current = null;
      // Require: horizontal > 60px, mostly horizontal, within 400ms
      if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) * 1.5 && dt < 400) {
        if (dx < 0) nextMonth();  // swipe left → next month
        else prevMonth();          // swipe right → prev month
      }
    };
    el.addEventListener('touchstart', onStart, { passive: true });
    el.addEventListener('touchend', onEnd, { passive: true });
    return () => {
      el.removeEventListener('touchstart', onStart);
      el.removeEventListener('touchend', onEnd);
    };
  }, [prevMonth, nextMonth]);

  // Build projected row for months without actual data (hook must be before any return)
  const isProjected = !row && rows.length > 0;
  const displayRow = useMemo(() => {
    if (row) {
      // Apply schedule filtering to actual data too
      // Input data = "monthly recurring base costs", schedule determines which months they apply
      if (scheduleHook) {
        const month = viewMonth || row.date;
        const filtered = { ...row };
        const allKeys = [...INCOME_KEYS, ...EXPENSE_KEYS, ...customExpenseKeys, ...customIncomeKeys];
        for (const k of allKeys) {
          if (!scheduleHook.isActiveInMonth(k, month)) {
            filtered[k] = 0;
          } else {
            // Apply extra/future/bonus adjustments to actual data as well
            filtered[k] = (filtered[k] || 0) + scheduleHook.getExtraAmount(k, month);
            filtered[k] += scheduleHook.getFutureAmountDiff(k, month);
            filtered[k] += scheduleHook.getBonusAmount(k, month);
          }
        }
        return filtered;
      }
      return row;
    }
    if (rows.length === 0) return null;

    // Use average of last 3 months as base
    const recent = rows.slice(-3);
    const allKeys = [...INCOME_KEYS, ...EXPENSE_KEYS, ...customExpenseKeys, ...customIncomeKeys];
    const projected = { date: viewMonth };

    for (const k of allKeys) {
      const vals = recent.map(r => r[k] || 0);
      const avg = Math.round(vals.reduce((s, v) => s + v, 0) / vals.length);
      if (scheduleHook && !scheduleHook.isActiveInMonth(k, viewMonth)) {
        projected[k] = 0;
      } else {
        projected[k] = avg;
      }
      if (scheduleHook) {
        projected[k] += scheduleHook.getExtraAmount(k, viewMonth);
        projected[k] += scheduleHook.getFutureAmountDiff(k, viewMonth);
        projected[k] += scheduleHook.getBonusAmount(k, viewMonth);
      }
    }

    // Project balance
    const latest = rows[rows.length - 1];
    let balHokyo = latest.balanceHokyo || 0;
    let balRakuten = latest.balanceRakuten || 0;
    const latestDate = latest.date;

    const [ly, lm] = latestDate.split('-').map(Number);
    const [vy, vm] = viewMonth.split('-').map(Number);
    const monthsBetween = (vy - ly) * 12 + (vm - lm);

    if (monthsBetween > 0) {
      for (let i = 1; i <= monthsBetween; i++) {
        const d = addMonths(latestDate, i);
        let monthInc = 0, monthExp = 0;
        for (const k of [...INCOME_KEYS, ...customIncomeKeys]) {
          const vals = recent.map(r => r[k] || 0);
          let v = Math.round(vals.reduce((s, val) => s + val, 0) / vals.length);
          if (scheduleHook) {
            if (!scheduleHook.isActiveInMonth(k, d)) v = 0;
            else {
              v += scheduleHook.getExtraAmount(k, d);
              v += scheduleHook.getFutureAmountDiff(k, d);
              v += scheduleHook.getBonusAmount(k, d);
            }
          }
          monthInc += v;
        }
        for (const k of [...EXPENSE_KEYS, ...customExpenseKeys]) {
          const vals = recent.map(r => r[k] || 0);
          let v = Math.round(vals.reduce((s, val) => s + val, 0) / vals.length);
          if (scheduleHook) {
            if (!scheduleHook.isActiveInMonth(k, d)) v = 0;
            else v += scheduleHook.getExtraAmount(k, d);
          }
          monthExp += v;
        }
        balHokyo += monthInc - monthExp;
      }
    }
    projected.balanceHokyo = balHokyo;
    projected.balanceRakuten = balRakuten;

    return projected;
  }, [row, rows, viewMonth, customExpenseKeys, customIncomeKeys, scheduleHook?.schedule]);

  // No data at all
  if (!row && rows.length === 0) {
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

  const r = displayRow;
  if (!r) return null;

  const inc = totalIncome(r, customIncomeKeys);
  const exp = totalExpense(r, customExpenseKeys);
  const sur = surplus(r, customExpenseKeys, customIncomeKeys);

  // Build grouped data (only visible keys)
  const groupedKeys = new Set(groups.flatMap(g => g.keys));
  const ungroupedItems = catConfig.expense
    .filter(k => !groupedKeys.has(k) && (r[k] || 0) > 0)
    .map(k => ({ key: k, label: labels[k] || k, amount: r[k] || 0 }));

  const groupData = groups.map((g, gi) => {
    const children = g.keys
      .filter(k => visibleExpense.has(k))
      .map(k => ({ key: k, label: labels[k] || k, amount: r[k] || 0 }))
      .filter(c => c.amount > 0);
    const total = children.reduce((s, c) => s + c.amount, 0);
    return { ...g, children, total, colorIdx: gi };
  }).filter(g => g.total > 0);

  // Donut: group-level data
  const donutData = [...groupData.map(g => g.total), ...ungroupedItems.map(u => u.amount)];
  const donutLabels = [...groupData.map(g => g.name), ...ungroupedItems.map(u => u.label)];
  const maxGroupExp = Math.max(...groupData.map(g => g.total), ...ungroupedItems.map(u => u.amount), 1);

  return (
    <div className="fade-in" ref={swipeRef}>
      <div className="header">
        <div className="header-top">
          <span className="header-brand">Money Flow</span>
          <div className="header-actions">
            <div className="month-nav">
              <button onClick={prevMonth}>&lt;</button>
              <span className="current-month">{formatMonth(viewMonth)}</span>
              <button onClick={nextMonth}>&gt;</button>
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

      {isProjected && (
        <div className="projected-banner">
          <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
          </svg>
          予測データ（直近3ヶ月の平均から算出）
        </div>
      )}

      <div className="hero">
        <div className="hero-label">{isProjected ? 'Projected Balance' : 'Monthly Balance'}</div>
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
          <div className="card-amount">{formatYen(r.balanceHokyo)}</div>
        </div>
        <div className="card">
          <div className="card-label">楽天銀行</div>
          <div className="card-amount">{formatYen(r.balanceRakuten)}</div>
        </div>
      </div>

      <div className="section">
        <div className="section-title">Income</div>
        <div className="card">
          {catConfig.income.map(k => {
            const v = r[k] || 0;
            if (v === 0) return null;
            return (
              <div key={k} className="stat-row">
                <span className="stat-label">{labels[k] || INCOME_LABELS[k] || k}</span>
                <span className="stat-value income">{formatYen(v)}</span>
              </div>
            );
          })}
          {catConfig.income.every(k => !r[k]) && (
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
                      onClick={() => !isProjected && onEdit({ key: c.key, label: c.label, value: c.amount, rowNum: r.rowNum })}>
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
              onClick={() => !isProjected && onEdit({ key: e.key, label: e.label, value: e.amount, rowNum: r.rowNum })}>
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

      {r.notes && (
        <div className="section">
          <div className="section-title">Notes</div>
          <div className="card" style={{ padding: 14, fontSize: 13, color: 'var(--text-secondary)' }}>{r.notes}</div>
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
function InputView({ row, rows, labels, catConfig, groups, customExpenseKeys, customIncomeKeys, onSave, onAdd, saving, onNewCategory, onUpdateLabel, catActions, customCats, onUpdateGroups, scheduleHook }) {
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
  const [editMode, setEditMode] = useState(false);
  const [newGroupName, setNewGroupName] = useState('');
  const [crossDrag, setCrossDrag] = useState(null); // { key, sourceGroupId } for cross-group drag
  const [dropTarget, setDropTarget] = useState(null); // groupId being hovered
  const crossDragY = useRef(0);
  const groupRefs = useRef({}); // refs for each group drop zone

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

  // Delete handler: custom keys are fully removed, built-in keys are just hidden
  const handleDeleteKey = (type, k) => {
    haptic.medium();
    if (isCustomKey(k)) {
      customCats.remove(k);
      onUpdateGroups(groups.map(g => ({ ...g, keys: g.keys.filter(gk => gk !== k) })));
    }
    catActions.hide(type, k);
  };

  // Cross-group drag handlers
  const findGroupAtY = (clientY) => {
    for (const [gId, el] of Object.entries(groupRefs.current)) {
      if (!el) continue;
      const rect = el.getBoundingClientRect();
      if (clientY >= rect.top && clientY <= rect.bottom) return gId;
    }
    return null;
  };

  const startCrossDrag = (key, sourceGroupId, e) => {
    const clientY = e.touches ? e.touches[0].clientY : e.clientY;
    crossDragY.current = clientY;
    setCrossDrag({ key, sourceGroupId });
    haptic.medium();
  };

  useEffect(() => {
    if (!crossDrag) return;
    const onMove = (e) => {
      e.preventDefault();
      const clientY = e.touches ? e.touches[0].clientY : e.clientY;
      const target = findGroupAtY(clientY);
      setDropTarget(target);
    };
    const onEnd = () => {
      if (crossDrag && dropTarget && dropTarget !== crossDrag.sourceGroupId) {
        haptic.heavy();
        if (dropTarget === '_ungrouped') {
          // Remove from all groups
          onUpdateGroups(groups.map(g => ({ ...g, keys: g.keys.filter(k => k !== crossDrag.key) })));
        } else {
          // Move to target group
          onUpdateGroups(groups.map(g => {
            const without = g.keys.filter(k => k !== crossDrag.key);
            if (g.id === dropTarget) return { ...g, keys: [...without, crossDrag.key] };
            return { ...g, keys: without };
          }));
        }
      } else {
        haptic.light();
      }
      setCrossDrag(null);
      setDropTarget(null);
    };
    const opts = { passive: false };
    document.addEventListener('touchmove', onMove, opts);
    document.addEventListener('touchend', onEnd);
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onEnd);
    return () => {
      document.removeEventListener('touchmove', onMove);
      document.removeEventListener('touchend', onEnd);
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onEnd);
    };
  }, [crossDrag, dropTarget, groups, onUpdateGroups]);

  // Add group
  const addGroup = () => {
    if (!newGroupName.trim()) return;
    haptic.success();
    const id = 'g_' + Date.now();
    onUpdateGroups([...groups, { id, name: newGroupName.trim(), keys: [] }]);
    setNewGroupName('');
    setOpenGroups(prev => ({ ...prev, [id]: true }));
  };
  const deleteGroup = (id) => { haptic.medium(); onUpdateGroups(groups.filter(g => g.id !== id)); };
  const renameGroup = (id, name) => onUpdateGroups(groups.map(g => g.id === id ? { ...g, name } : g));

  // Visible / grouped keys
  const visibleExpense = new Set(catConfig.expense);
  const groupedKeys = new Set(groups.flatMap(g => g.keys));
  const ungroupedKeys = catConfig.expense.filter(k => !groupedKeys.has(k));

  // Label helper
  const getLabel = (k) => labels[k] != null ? labels[k] : (EXPENSE_LABELS[k] ?? INCOME_LABELS[k] ?? k);

  // Month name helper
  const monthName = (m) => m ? `${m}月` : '';

  // Badges for normal mode
  const renderScheduleBadges = (k) => {
    const s = scheduleHook.get(k);
    if (!s || (!s.endDate && !s.seasonStart && !s.extraAmount && !s.futureAmount)) return null;
    const badges = [];
    if (s.endDate) {
      const [y, m] = s.endDate.split('-');
      const isPast = s.endDate < currentMonth();
      badges.push(<span key="end" className={`sched-badge ${isPast ? 'sched-badge-past' : ''}`}>〜{Number(y)}/{Number(m)}</span>);
    }
    if (s.seasonStart && s.seasonEnd) {
      badges.push(<span key="season" className="sched-badge sched-badge-season">{monthName(s.seasonStart)}〜{monthName(s.seasonEnd)}</span>);
    }
    if (s.extraAmount && s.extraStart && s.extraEnd) {
      badges.push(<span key="extra" className="sched-badge sched-badge-extra">+{formatYen(s.extraAmount)} {monthName(s.extraStart)}〜{monthName(s.extraEnd)}</span>);
    }
    if (s.futureAmount && s.currentAmount && s.futureStart) {
      const diff = s.futureAmount - s.currentAmount;
      const [y, m] = s.futureStart.split('-');
      const isApplied = currentMonth() >= s.futureStart;
      badges.push(
        <span key="future" className={`sched-badge sched-badge-future ${isApplied ? 'sched-badge-future-applied' : ''}`}>
          {diff >= 0 ? '+' : ''}{formatYen(diff)} {Number(y)}/{Number(m)}〜
        </span>
      );
    }
    return <span className="sched-badges">{badges}</span>;
  };

  // Month selector component
  const MonthSelect = ({ value, onChange, placeholder }) => (
    <select className="sched-month-select" value={value || ''} onChange={e => onChange(e.target.value ? Number(e.target.value) : null)}>
      <option value="">{placeholder || '---'}</option>
      {[1,2,3,4,5,6,7,8,9,10,11,12].map(m => <option key={m} value={m}>{m}月</option>)}
    </select>
  );

  // Schedule editor for edit mode
  const [openSchedule, setOpenSchedule] = useState({});
  const isIncomeKey = (k) => catConfig.income.includes(k);

  const renderScheduleEditor = (k) => {
    const s = scheduleHook.get(k);
    const isOpen = openSchedule[k];
    const hasAny = s.endDate || s.seasonStart || s.extraAmount || s.futureAmount;
    const isIncome = isIncomeKey(k);

    const labelEnd = isIncome ? '収入終了月' : '支払い終了月';
    const labelExtra = isIncome ? '追加収入額' : '季節加算額';
    const labelExtraPeriod = isIncome ? '追加収入期間' : '加算期間';

    return (
      <div className="sched-editor">
        <button className={`sched-toggle ${hasAny ? 'sched-toggle-active' : ''}`}
          onClick={() => setOpenSchedule(prev => ({ ...prev, [k]: !prev[k] }))}>
          <svg width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M8 7V3m8 4V3m-9 4h10M5 11h14M5 15h14M5 19h14" />
          </svg>
          スケジュール
          {hasAny && <span className="sched-dot" />}
          <svg className={`sched-chevron ${isOpen ? 'open' : ''}`} width="10" height="10" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
          </svg>
        </button>
        {isOpen && (
          <div className="sched-fields">
            <div className="sched-row">
              <span className="sched-label">{labelEnd}</span>
              <input type="month" className="sched-month-input" value={s.endDate || ''}
                onChange={e => scheduleHook.update(k, 'endDate', e.target.value || null)} />
            </div>

            <div className="sched-row">
              <span className="sched-label">毎年の発生期間</span>
              <div className="sched-range">
                <MonthSelect value={s.seasonStart} onChange={v => scheduleHook.update(k, 'seasonStart', v)} placeholder="開始" />
                <span className="sched-range-sep">〜</span>
                <MonthSelect value={s.seasonEnd} onChange={v => scheduleHook.update(k, 'seasonEnd', v)} placeholder="終了" />
              </div>
            </div>

            <div className="sched-row">
              <span className="sched-label">{labelExtra}</span>
              <input type="number" inputMode="numeric" className="sched-amount-input" placeholder="0"
                value={s.extraAmount || ''} onChange={e => scheduleHook.update(k, 'extraAmount', e.target.value ? Number(e.target.value) : null)} />
            </div>
            {(s.extraAmount > 0) && (
              <div className="sched-row">
                <span className="sched-label">{labelExtraPeriod}</span>
                <div className="sched-range">
                  <MonthSelect value={s.extraStart} onChange={v => scheduleHook.update(k, 'extraStart', v)} placeholder="開始" />
                  <span className="sched-range-sep">〜</span>
                  <MonthSelect value={s.extraEnd} onChange={v => scheduleHook.update(k, 'extraEnd', v)} placeholder="終了" />
                </div>
              </div>
            )}

            {/* 将来の金額変更（Income向け） */}
            {isIncome && (
              <>
                <div className="sched-divider" />
                <div className="sched-section-label">
                  <svg width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
                  </svg>
                  金額変更予定
                </div>
                <div className="sched-row">
                  <span className="sched-label">現在の金額</span>
                  <input type="number" inputMode="numeric" className="sched-amount-input" placeholder="0"
                    value={s.currentAmount || ''} onChange={e => scheduleHook.update(k, 'currentAmount', e.target.value ? Number(e.target.value) : null)} />
                </div>
                <div className="sched-row">
                  <span className="sched-label">変更後の金額</span>
                  <input type="number" inputMode="numeric" className="sched-amount-input" placeholder="0"
                    value={s.futureAmount || ''} onChange={e => scheduleHook.update(k, 'futureAmount', e.target.value ? Number(e.target.value) : null)} />
                </div>
                {(s.futureAmount > 0) && (
                  <div className="sched-row">
                    <span className="sched-label">適用開始月</span>
                    <input type="month" className="sched-month-input" value={s.futureStart || ''}
                      onChange={e => scheduleHook.update(k, 'futureStart', e.target.value || null)} />
                  </div>
                )}
                {(s.futureAmount > 0 && s.currentAmount > 0 && s.futureStart) && (
                  <div className="sched-future-preview">
                    {s.futureAmount >= s.currentAmount ? '+' : ''}{formatYen(s.futureAmount - s.currentAmount)}
                    {' '}
                    {(() => { const [y, m] = s.futureStart.split('-'); return `${Number(y)}年${Number(m)}月から`; })()}
                  </div>
                )}
              </>
            )}
          </div>
        )}
      </div>
    );
  };

  // ── EDIT MODE ──
  if (editMode) {
    return (
      <div className="fade-in">
        <div className="header">
          <div className="header-top">
            <span className="header-brand">Money Flow</span>
            <button className="settings-pill" onClick={() => { haptic.light(); setEditMode(false); }}>
              <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
              </svg>
              完了
            </button>
          </div>
          <div style={{ marginTop: 6, fontSize: 15, fontWeight: 700 }}>{formatMonth(form.date)}</div>
        </div>

        <div className="section">
          {/* ── Income Edit ── */}
          <div className="section-title">Income</div>
          <div className="form-card">
            <DragList
              items={catConfig.income}
              onReorder={(from, to) => catActions.reorder('income', from, to)}
              renderItem={(k) => (
                <div className="cat-edit-item-wrap">
                  <div className="cat-edit-item-top">
                    <input className="cat-item-input" value={getLabel(k)}
                      onChange={e => onUpdateLabel(k, e.target.value)} />
                    <button className="cat-item-delete" onClick={() => handleDeleteKey('income', k)}>
                      <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  </div>
                  {renderScheduleEditor(k)}
                </div>
              )}
            />
            <button className="group-inline-add-btn" style={{ marginTop: 8 }} onClick={() => onNewCategory('income')}>
              <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
              </svg>
              カテゴリを追加
            </button>
          </div>

          {/* ── Expenses Edit ── */}
          <div className="section-title">Expenses</div>
          {crossDrag && (
            <div className="cross-drag-hint">
              「{getLabel(crossDrag.key)}」をドラッグ中 — 移動先のグループへドロップ
            </div>
          )}

          {groups.map(g => {
            const gKeys = g.keys.filter(k => visibleExpense.has(k));
            const isOpen = openGroups[g.id] !== false;
            const isDropHover = crossDrag && dropTarget === g.id && crossDrag.sourceGroupId !== g.id;

            return (
              <div key={g.id}
                ref={el => { groupRefs.current[g.id] = el; }}
                className={`form-card form-card-group ${isDropHover ? 'drop-highlight' : ''}`}>
                <div className="form-group-header" onClick={() => toggleInputGroup(g.id)}>
                  <div className="form-group-header-left" style={{ flex: 1 }}>
                    <input className="edit-group-name-input" value={g.name}
                      onChange={e => renameGroup(g.id, e.target.value)}
                      onClick={e => e.stopPropagation()} />
                  </div>
                  <button className="cat-item-delete" style={{ marginRight: 8 }}
                    onClick={(e) => { e.stopPropagation(); if (confirm(`グループ「${g.name}」を削除しますか？`)) deleteGroup(g.id); }}>
                    <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                    </svg>
                  </button>
                  <svg className={`group-chevron ${isOpen ? 'open' : ''}`}
                    width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                  </svg>
                </div>
                {isOpen && (
                  <DragList
                    items={gKeys}
                    onReorder={(from, to) => {
                      const newKeys = [...gKeys];
                      const [item] = newKeys.splice(from, 1);
                      newKeys.splice(to, 0, item);
                      onUpdateGroups(groups.map(gg =>
                        gg.id === g.id ? { ...gg, keys: [...newKeys, ...gg.keys.filter(k => !visibleExpense.has(k))] } : gg
                      ));
                    }}
                    renderItem={(k) => (
                      <div className="cat-edit-item-wrap">
                        <div className="cat-edit-item-top">
                          <input className="cat-item-input" value={getLabel(k)}
                            onChange={e => onUpdateLabel(k, e.target.value)} />
                          <div className="cat-cross-drag-handle"
                            onTouchStart={e => startCrossDrag(k, g.id, e)}
                            onMouseDown={e => startCrossDrag(k, g.id, e)}
                            title="グループ間移動">
                            <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" d="M7 16V4m0 0L3 8m4-4l4 4m6 4v12m0 0l4-4m-4 4l-4-4M16 12H4m0 0l4-4m-4 4l4 4m8-4h8m0 0l-4-4m4 4l-4 4" />
                            </svg>
                          </div>
                          <button className="cat-item-delete" onClick={() => handleDeleteKey('expense', k)}>
                            <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                            </svg>
                          </button>
                        </div>
                        {renderScheduleEditor(k)}
                      </div>
                    )}
                  />
                )}
                {gKeys.length === 0 && isOpen && (
                  <div className="drop-empty-hint">ここにカテゴリをドロップ</div>
                )}
                {isOpen && (
                  <button className="group-inline-add-btn" style={{ marginTop: 6 }}
                    onClick={(e) => { e.stopPropagation(); onNewCategory('expense', g.id); }}>
                    <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
                    </svg>
                    カテゴリを追加
                  </button>
                )}
              </div>
            );
          })}

          {/* Ungrouped */}
          <div
            ref={el => { groupRefs.current['_ungrouped'] = el; }}
            className={`form-card ${crossDrag && dropTarget === '_ungrouped' && crossDrag.sourceGroupId !== '_ungrouped' ? 'drop-highlight' : ''}`}>
            <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 8 }}>未分類</div>
            {ungroupedKeys.length > 0 ? (
              <DragList
                items={ungroupedKeys}
                onReorder={(from, to) => catActions.reorder('expense', catConfig.expense.indexOf(ungroupedKeys[from]), catConfig.expense.indexOf(ungroupedKeys[to]))}
                renderItem={(k) => (
                  <div className="cat-edit-item-wrap">
                    <div className="cat-edit-item-top">
                      <input className="cat-item-input" value={getLabel(k)}
                        onChange={e => onUpdateLabel(k, e.target.value)} />
                      <div className="cat-cross-drag-handle"
                        onTouchStart={e => startCrossDrag(k, '_ungrouped', e)}
                        onMouseDown={e => startCrossDrag(k, '_ungrouped', e)}
                        title="グループ間移動">
                        <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M7 16V4m0 0L3 8m4-4l4 4m6 4v12m0 0l4-4m-4 4l-4-4M16 12H4m0 0l4-4m-4 4l4 4m8-4h8m0 0l-4-4m4 4l-4 4" />
                        </svg>
                      </div>
                      <button className="cat-item-delete" onClick={() => handleDeleteKey('expense', k)}>
                        <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      </button>
                    </div>
                    {renderScheduleEditor(k)}
                  </div>
                )}
              />
            ) : (
              <div className="drop-empty-hint">ここにカテゴリをドロップ</div>
            )}
          </div>

          <button className="new-cat-btn" style={{ marginBottom: 8 }} onClick={() => onNewCategory('expense')}>
            <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
            </svg>
            カテゴリを追加（未分類）
          </button>

          {/* Add Group */}
          <div className="add-group-section">
            <div className="add-group-label">
              <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
              </svg>
              新しいグループを作成
            </div>
            <div className="add-group-input-wrap">
              <input className="add-group-input"
                placeholder="グループ名（例：サブスク、交際費…）"
                value={newGroupName} onChange={e => setNewGroupName(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter' && newGroupName.trim()) addGroup(); }} />
            </div>
            {newGroupName.trim() && (
              <button className="add-group-btn" onClick={addGroup}>
                <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
                </svg>
                「{newGroupName.trim()}」を追加
              </button>
            )}
          </div>
        </div>
      </div>
    );
  }

  // ── NORMAL MODE ──
  return (
    <div className="fade-in">
      <div className="header">
        <div className="header-top">
          <span className="header-brand">Money Flow</span>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <button className="header-save-btn" disabled={saving} onClick={handleSubmit}>
              <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
              </svg>
              {saving ? '保存中...' : '保存'}
            </button>
            <button className="settings-pill" onClick={() => { haptic.light(); setEditMode(true); }}>
              <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
              </svg>
              編集
            </button>
          </div>
        </div>
        <div style={{ marginTop: 6, fontSize: 15, fontWeight: 700 }}>{formatMonth(form.date)}</div>
      </div>

      <div className="section">
        <div className="section-title">Income</div>
        <div className="form-card">
          {catConfig.income.map(k => (
            <div key={k} className="form-group">
              <label className="form-label">{getLabel(k)} {renderScheduleBadges(k)}</label>
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
              {isOpen && (
                <>
                  {gKeys.map(k => (
                    <div key={k} className="form-group">
                      <label className="form-label">{getLabel(k)} {renderScheduleBadges(k)}</label>
                      <NumInput value={form[k]} onChange={v => set(k, v)} />
                    </div>
                  ))}
                  <button className="group-inline-add-btn" onClick={(e) => { e.stopPropagation(); onNewCategory('expense', g.id); }}>
                    <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
                    </svg>
                    カテゴリを追加
                  </button>
                </>
              )}
            </div>
          );
        })}

        {ungroupedKeys.length > 0 && (
          <div className="form-card">
            {ungroupedKeys.map(k => (
              <div key={k} className="form-group">
                <label className="form-label">{getLabel(k)} {renderScheduleBadges(k)}</label>
                <NumInput value={form[k]} onChange={v => set(k, v)} />
              </div>
            ))}
          </div>
        )}

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
function ForecastView({ rows, labels, customExpenseKeys = [], customIncomeKeys = [], scheduleHook, catConfig }) {
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

  // Per-category average expense (for end date calculation)
  const categoryAvg = useMemo(() => {
    if (recent.length === 0) return {};
    const allKeys = [...EXPENSE_KEYS, ...customExpenseKeys];
    const avg = {};
    for (const k of allKeys) {
      const total = recent.reduce((s, r) => s + (r[k] || 0), 0);
      if (total > 0) avg[k] = Math.round(total / recent.length);
    }
    return avg;
  }, [recent, customExpenseKeys]);

  // Per-category average income (for schedule calculation)
  const incomeCategoryAvg = useMemo(() => {
    if (recent.length === 0) return {};
    const allKeys = [...INCOME_KEYS, ...customIncomeKeys];
    const avg = {};
    for (const k of allKeys) {
      const total = recent.reduce((s, r) => s + (r[k] || 0), 0);
      if (total > 0) avg[k] = Math.round(total / recent.length);
    }
    return avg;
  }, [recent, customIncomeKeys]);

  const projection = useMemo(() => {
    if (rows.length === 0) return [];
    const latest = rows[rows.length - 1];
    const baseBalance = (latest.balanceHokyo || 0) + (latest.balanceRakuten || 0);
    const result = [];
    let adjBal = baseBalance;
    let curBal = baseBalance;

    for (let i = 1; i <= 12; i++) {
      const date = addMonths(latest.date, i);
      // Calculate adjustments from schedule (end dates, seasons, extras)
      let adjustment = 0;
      let incomeAdjustment = 0;
      if (scheduleHook) {
        // Expense schedule adjustments
        for (const [key, avg] of Object.entries(categoryAvg)) {
          if (!scheduleHook.isActiveInMonth(key, date)) {
            adjustment -= avg;
          }
          adjustment += scheduleHook.getExtraAmount(key, date);
        }
        // Income schedule adjustments
        for (const [key, avg] of Object.entries(incomeCategoryAvg)) {
          if (!scheduleHook.isActiveInMonth(key, date)) {
            incomeAdjustment -= avg;
          }
          incomeAdjustment += scheduleHook.getExtraAmount(key, date);
          incomeAdjustment += scheduleHook.getFutureAmountDiff(key, date);
          incomeAdjustment += scheduleHook.getBonusAmount(key, date);
        }
      }
      const adjExpense = simExpense + adjustment;
      const curExpense = defaultExpense + adjustment;
      const adjIncome = simIncome + incomeAdjustment;
      const curIncome = defaultIncome + incomeAdjustment;
      const adjSurplus = adjIncome - adjExpense;
      const curSurplus = curIncome - curExpense;
      adjBal += adjSurplus;
      curBal += curSurplus;
      result.push({
        date,
        label: formatShortMonth(date),
        fullLabel: formatMonth(date),
        income: adjIncome,
        expense: adjExpense,
        surplus: adjSurplus,
        balance: adjBal,
        currentBalance: curBal,
        adjustment,
        incomeAdjustment,
      });
    }
    return result;
  }, [rows, simIncome, simExpense, defaultIncome, defaultExpense, scheduleHook?.schedule, categoryAvg, incomeCategoryAvg]);

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

      {/* Income Future Amount Settings */}
      {catConfig && scheduleHook && (() => {
        const latest = rows.length > 0 ? rows[rows.length - 1] : {};
        // Salary-type keys: built-in income keys that have data
        const salaryKeys = (catConfig.income || []).filter(k => INCOME_KEYS.includes(k));
        // Bonus-type keys: custom income keys (ci_*)
        const bonusKeys = (catConfig.income || []).filter(k => !INCOME_KEYS.includes(k));

        // Generate future month options (next 24 months)
        const futureMonths = [];
        if (rows.length > 0) {
          for (let i = 1; i <= 24; i++) {
            const d = addMonths(latest.date, i);
            const [y, m] = d.split('-');
            futureMonths.push({ value: d, label: `${Number(y)}年${Number(m)}月` });
          }
        }

        return (
          <div className="section">
            <div className="section-title">Income Changes</div>

            {/* Salary Raise Section */}
            {salaryKeys.length > 0 && (
              <div className="form-card" style={{ padding: '12px 14px' }}>
                <div className="forecast-section-header">
                  <svg width="14" height="14" fill="none" stroke="#059669" strokeWidth="2" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
                  </svg>
                  昇給予定
                </div>
                {salaryKeys.map(k => {
                  const s = scheduleHook.get(k);
                  const lbl = labels[k] || k;
                  const currentVal = incomeCategoryAvg[k] || latest[k] || 0;
                  const futureVal = s.futureAmount || currentVal;
                  const diff = futureVal - currentVal;
                  const hasFuture = s.futureAmount && s.futureStart;

                  return (
                    <div key={k} className="forecast-income-item">
                      <div className="forecast-income-header">
                        <span className="forecast-income-name">{lbl}</span>
                        {hasFuture && diff !== 0 && (
                          <span className="sched-badge sched-badge-future" style={{ fontSize: 10 }}>
                            {diff >= 0 ? '+' : ''}{formatYen(diff)}
                            {' '}{(() => { const [y, m] = s.futureStart.split('-'); return `${Number(y)}/${Number(m)}〜`; })()}
                          </span>
                        )}
                      </div>

                      {/* Current amount (read-only) */}
                      <div className="forecast-current-row">
                        <span className="forecast-income-label">現在の金額</span>
                        <span className="forecast-current-value">{formatYen(currentVal)}</span>
                      </div>

                      {/* Future amount with +/- buttons */}
                      <div className="forecast-income-label" style={{ marginTop: 8, marginBottom: 4 }}>変更後の金額</div>
                      <div className="forecast-stepper">
                        <button className="forecast-stepper-btn" onClick={() => {
                          haptic.tick();
                          const next = Math.max(0, (s.futureAmount || currentVal) - 10000);
                          scheduleHook.update(k, 'futureAmount', next);
                          if (!s.currentAmount) scheduleHook.update(k, 'currentAmount', currentVal);
                        }}>-1万</button>
                        <input type="number" inputMode="numeric" className="forecast-stepper-input"
                          value={s.futureAmount || ''}
                          placeholder={String(currentVal)}
                          onChange={e => {
                            scheduleHook.update(k, 'futureAmount', e.target.value ? Number(e.target.value) : null);
                            if (!s.currentAmount) scheduleHook.update(k, 'currentAmount', currentVal);
                          }} />
                        <button className="forecast-stepper-btn forecast-stepper-btn-plus" onClick={() => {
                          haptic.tick();
                          const next = (s.futureAmount || currentVal) + 10000;
                          scheduleHook.update(k, 'futureAmount', next);
                          if (!s.currentAmount) scheduleHook.update(k, 'currentAmount', currentVal);
                        }}>+1万</button>
                      </div>

                      {/* Start month selector */}
                      <div className="forecast-income-label" style={{ marginTop: 8, marginBottom: 4 }}>適用開始月</div>
                      <select className="forecast-month-select" value={s.futureStart || ''}
                        onChange={e => scheduleHook.update(k, 'futureStart', e.target.value || null)}>
                        <option value="">選択してください</option>
                        {futureMonths.map(fm => <option key={fm.value} value={fm.value}>{fm.label}</option>)}
                      </select>

                      {hasFuture && diff !== 0 && (
                        <div className="sched-future-preview" style={{ marginTop: 8 }}>
                          {formatYen(currentVal)} → {formatYen(futureVal)}
                          （{diff >= 0 ? '+' : ''}{formatYen(diff)}）
                          {(() => { const [y, m] = s.futureStart.split('-'); return ` ${Number(y)}年${Number(m)}月から`; })()}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}

            {/* Bonus Section */}
            {bonusKeys.length > 0 && (
              <div className="form-card" style={{ padding: '12px 14px', marginTop: 10 }}>
                <div className="forecast-section-header">
                  <svg width="14" height="14" fill="none" stroke="#d97706" strokeWidth="2" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  ボーナス予定
                </div>
                {bonusKeys.map(k => {
                  const s = scheduleHook.get(k);
                  const lbl = labels[k] || k;
                  return (
                    <div key={k} className="forecast-income-item">
                      <div className="forecast-income-header">
                        <span className="forecast-income-name">{lbl}</span>
                        {s.bonusAmount > 0 && s.bonusMonth && (
                          <span className="sched-badge sched-badge-extra" style={{ fontSize: 10 }}>
                            {formatYen(s.bonusAmount)}
                            {' '}{(() => { const [y, m] = s.bonusMonth.split('-'); return `${Number(y)}/${Number(m)}`; })()}
                          </span>
                        )}
                      </div>
                      <div className="forecast-income-fields">
                        <div className="forecast-income-field" style={{ flex: 1.2 }}>
                          <span className="forecast-income-label">金額</span>
                          <input type="number" inputMode="numeric" className="forecast-income-input"
                            placeholder="0" value={s.bonusAmount || ''}
                            onChange={e => scheduleHook.update(k, 'bonusAmount', e.target.value ? Number(e.target.value) : null)} />
                        </div>
                        <div className="forecast-income-field" style={{ flex: 1 }}>
                          <span className="forecast-income-label">支給予定月</span>
                          <select className="forecast-month-select" value={s.bonusMonth || ''}
                            onChange={e => scheduleHook.update(k, 'bonusMonth', e.target.value || null)}>
                            <option value="">選択</option>
                            {futureMonths.map(fm => <option key={fm.value} value={fm.value}>{fm.label}</option>)}
                          </select>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        );
      })()}

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
function NewCategoryModal({ type, groups, labels, catConfig, customCats, onAdd, onClose, defaultGroupId }) {
  const [name, setName] = useState('');
  const [groupId, setGroupId] = useState(defaultGroupId || '');
  const [mode, setMode] = useState('new'); // 'new' = create custom key, 'reuse' = unhide built-in

  // Hidden built-in keys
  const builtinKeys = type === 'income' ? INCOME_KEYS : EXPENSE_KEYS;
  const visible = type === 'income' ? catConfig.income : catConfig.expense;
  const hiddenBuiltin = builtinKeys.filter(k => !visible.includes(k));
  const [selectedBuiltin, setSelectedBuiltin] = useState(hiddenBuiltin[0] || '');

  const handleAddNew = () => {
    const trimmed = name.trim();
    if (!trimmed) return;
    try {
      haptic.success();
      const key = customCats.add(trimmed, type);
      onAdd(key, trimmed, groupId || null);
      onClose();
    } catch (e) {
      alert('ERROR: ' + e.message);
    }
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
          {customCats.totalCount} カテゴリ使用中
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
  const reorderGroup = (fromIdx, toIdx) => {
    const arr = [...groups];
    const [item] = arr.splice(fromIdx, 1);
    arr.splice(toIdx, 0, item);
    onUpdateGroups(arr);
  };
  const toggleKeyInGroup = (groupId, key) => {
    haptic.light();
    onUpdateGroups(groups.map(g => {
      if (g.id !== groupId) return { ...g, keys: g.keys.filter(k => k !== key) };
      if (g.keys.includes(key)) return { ...g, keys: g.keys.filter(k => k !== key) };
      return { ...g, keys: [...g.keys, key] };
    }));
  };
  const assignedKeys = new Set(groups.flatMap(g => g.keys));

  // Delete handler: custom keys are fully removed, built-in keys are just hidden
  const handleDeleteKey = (type, k) => {
    haptic.medium();
    if (isCustomKey(k)) {
      customCats.remove(k);
      // Also remove from groups
      onUpdateGroups(groups.map(g => ({ ...g, keys: g.keys.filter(gk => gk !== k) })));
    }
    catActions.hide(type, k);
  };

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
              <input className="cat-item-input" value={labels[k] != null ? labels[k] : (INCOME_LABELS[k] ?? '')}
                onChange={e => onUpdate(k, e.target.value)} />
              <button className="cat-item-delete" onClick={() => handleDeleteKey('income', k)}>
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
                            <input className="cat-item-input" value={labels[k] != null ? labels[k] : (EXPENSE_LABELS[k] ?? '')}
                              onChange={e => onUpdate(k, e.target.value)} />
                            <button className="cat-item-delete" onClick={() => handleDeleteKey('expense', k)}>
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
                            <input className="cat-item-input" value={labels[k] != null ? labels[k] : (EXPENSE_LABELS[k] ?? '')}
                              onChange={e => onUpdate(k, e.target.value)} />
                            <button className="cat-item-delete" onClick={() => handleDeleteKey('expense', k)}>
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
              新規カテゴリを追加
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
              支出カテゴリをグループにまとめます。ドラッグで並び替えできます。
            </div>

            <DragList
              items={groups.map(g => g.id)}
              onReorder={reorderGroup}
              renderItem={(gId) => {
                const g = groups.find(gr => gr.id === gId);
                if (!g) return null;
                return (
                  <div className="group-setting-card-inner">
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
                );
              }}
            />

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
